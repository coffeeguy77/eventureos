"use server";
import { cafePages, nowIn, slotsFor, zonedIso } from "@/lib/cafe/core";
import { AppError, appCancel, appCaptcha, appConfig, appCreateOrder, appOrderStatus, appPay, appReserve, cafeOrg, mainLocation, readTicket, signTicket } from "@/lib/cafe/server";

type R<T> = ({ ok: true } & T) | { ok: false; error: string };
const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const ID = /^[A-Za-z0-9:_#-]{1,80}$/;
const fail = (e: unknown, fallback: string) => ({ ok: false as const, error: e instanceof AppError ? e.message : fallback });

async function site(slug: string, need: "order" | "reserve" | "any") {
  const org = await cafeOrg(str(slug, 80));
  if (!org) throw new AppError("This page isn't available.");
  const p = cafePages(org.cafe);
  if ((need === "order" && !p.order) || (need === "reserve" && !p.reserve) || (need === "any" && !p.appOrder)) throw new AppError("This isn't available online right now.");
  return org;
}

export interface OrderRequest {
  lines: { variationId: string; quantity: number; modifierIds: string[]; note?: string; presetId?: string; custom?: boolean }[];
  name: string; phone: string; note: string;
  /** null = as soon as possible; otherwise the café's local date and time */
  when: { date: string; time: string } | null;
}

/** Step 1: create the order in the app (held from the kitchen until it's paid) and get Square's exact total. */
export async function startCafeOrder(slug: string, o: OrderRequest): Promise<R<{ ticket: string; orderId: string; amount: number; currency: string; ticketName: string | null; pickupAt: string | null }>> {
  try {
    const org = await site(slug, "order");
    const name = str(o?.name, 60), phone = str(o?.phone, 30);
    if (name.length < 2) return { ok: false, error: "Add your name so we know whose order it is." };
    if (phone.replace(/\D/g, "").length < 8) return { ok: false, error: "Add a mobile number in case we need to reach you." };
    const lines = (Array.isArray(o?.lines) ? o.lines : []).slice(0, 40).filter((l) => l && ID.test(String(l.variationId)));
    if (!lines.length) return { ok: false, error: "Your order is empty." };
    const cart = lines.map((l) => ({
      variationId: String(l.variationId), quantity: Math.max(1, Math.min(50, Math.round(Number(l.quantity)) || 1)),
      modifierIds: (Array.isArray(l.modifierIds) ? l.modifierIds : []).map(String).filter((m) => ID.test(m)).slice(0, 30),
      note: str(l.note, 200) || undefined, presetId: typeof l.presetId === "string" && ID.test(l.presetId) ? l.presetId : undefined, custom: l.custom === true ? true : undefined,
    }));

    const cfg = await appConfig(org.cafe.appUrl);
    const loc = mainLocation(cfg);
    const h = cfg.hours ?? {};
    const tz = h.timezone || cfg.scheduling?.timezone || org.timezone || "Australia/Sydney";
    if (h.orderingDisabled) return { ok: false, error: "Online ordering is paused right now — please try again soon." };
    let pickupAt: string | null = null;
    if (o.when) {
      const date = str(o.when.date, 10), time = str(o.when.time, 5);
      const now = nowIn(tz);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !slotsFor(date, h.weekly, h.closures ?? [], now).some((s) => s.value === time)) {
        return { ok: false, error: "That pick-up time isn't available any more — please choose another." };
      }
      pickupAt = zonedIso(date, time, tz);
    } else if (h.open === false || h.canOrderNow === false) {
      return { ok: false, error: `We're closed right now${h.nextOpen?.label ? ` — we open ${h.nextOpen.label}` : ""}. Choose a pick-up time instead.` };
    }

    const r = await appCreateOrder(org.cafe.appUrl, { cart, name, phone, pickupAt, note: str(o.note, 250), locationId: loc?.id ?? null });
    if (!r?.orderId || typeof r.totalMoney?.amount !== "number") throw new AppError("The order couldn't be created — please try again.");
    const currency = r.totalMoney.currency || cfg.currency;
    return { ok: true, orderId: r.orderId, amount: r.totalMoney.amount, currency, ticket: signTicket(r.orderId, r.totalMoney.amount, currency), ticketName: r.ticketName ?? null, pickupAt };
  } catch (e) {
    console.error("[cafe] start order", e instanceof Error ? e.message : e);
    return fail(e, "Something went wrong creating your order — please try again.");
  }
}

/** Step 2: pay. The amount comes from the signed ticket, never from the browser. */
export async function payCafeOrder(slug: string, p: { ticket: string; sourceId: string; verificationToken?: string; email?: string }): Promise<R<{ status: string; receiptUrl: string | null }>> {
  const t = readTicket(str(p?.ticket, 600));
  if (!t) return { ok: false, error: "This checkout expired — please start again." };
  try {
    const org = await site(slug, "order");
    const sourceId = str(p.sourceId, 400);
    if (t.amount > 0 && !sourceId) return { ok: false, error: "Please enter your card details." };
    const email = str(p.email, 254);
    const cfg = await appConfig(org.cafe.appUrl).catch(() => null);
    const loc = cfg ? mainLocation(cfg) : null;
    const r = await appPay(org.cafe.appUrl, {
      orderId: t.orderId, amount: t.amount, currency: t.currency, sourceId: t.amount > 0 ? sourceId : undefined,
      verificationToken: str(p.verificationToken, 2000) || undefined, buyerEmail: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : undefined, locationId: loc?.id ?? null,
    });
    if (r.status === "COMPLETED" || r.status === "APPROVED") return { ok: true, status: r.status, receiptUrl: typeof r.receiptUrl === "string" && /^https:\/\//.test(r.receiptUrl) ? r.receiptUrl : null };
    await appCancel(org.cafe.appUrl, t.orderId);
    return { ok: false, error: "Your card wasn't charged — the payment didn't go through. Please try again or use another card." };
  } catch (e) {
    const org = await cafeOrg(str(slug, 80)).catch(() => null);
    if (org) await appCancel(org.cafe.appUrl, t.orderId);
    console.error("[cafe] pay", e instanceof Error ? e.message : e);
    const declined = e instanceof AppError && e.status >= 400;
    return { ok: false, error: declined
      ? "The payment was declined — your card wasn't charged. Please check the details or try another card."
      : `We couldn't confirm the payment. Before trying again, please check your bank${org?.contact_phone ? ` or call us on ${org.contact_phone}` : ""} — a paid order is never cancelled.` };
  }
}

/** The customer backed out or the card step failed: cancel the held order (the app only cancels unpaid, held orders). */
export async function cancelCafeOrder(slug: string, ticket: string): Promise<void> {
  const t = readTicket(str(ticket, 600));
  if (!t) return;
  const org = await cafeOrg(str(slug, 80)).catch(() => null);
  if (org?.cafe.appUrl) await appCancel(org.cafe.appUrl, t.orderId);
}

export async function cafeOrderStatus(slug: string, orderId: string): Promise<string | null> {
  if (!ID.test(String(orderId))) return null;
  const org = await cafeOrg(str(slug, 80)).catch(() => null);
  if (!org?.cafe.appUrl) return null;
  const r = await appOrderStatus(org.cafe.appUrl, orderId).catch(() => null);
  return typeof r?.status === "string" ? r.status : null;
}

export async function cafeCaptcha(slug: string): Promise<R<{ token: string; question: string }>> {
  try {
    const org = await site(slug, "reserve");
    const c = await appCaptcha(org.cafe.appUrl);
    return { ok: true, token: str(c.token, 600), question: str(c.question, 40) };
  } catch (e) { return fail(e, "Couldn't load the quick check — please refresh."); }
}

export interface TableRequest { name: string; phone: string; email: string; party: number; date: string; time: string; seating: string; notes: string; captchaToken: string; captchaAnswer: string; company?: string }

export async function reserveCafeTable(slug: string, r: TableRequest): Promise<R<{ when: string }>> {
  if (str(r?.company, 5)) return { ok: true, when: "" }; // honeypot
  try {
    const org = await site(slug, "reserve");
    const name = str(r.name, 80), phone = str(r.phone, 30), email = str(r.email, 254);
    if (name.length < 2) return { ok: false, error: "Please add your name." };
    if (phone.replace(/\D/g, "").length < 8) return { ok: false, error: "Please add a contact number." };
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "That email doesn't look right." };
    const party = Math.max(1, Math.min(50, Math.round(Number(r.party)) || 0));
    const seating = { indoor: "Indoor", outdoor: "Outdoor", any: "Don't mind — best available" }[str(r.seating, 10)];
    if (!seating) return { ok: false, error: "Please choose a seating preference." };
    if (!str(r.captchaAnswer, 6)) return { ok: false, error: "Please answer the quick maths question." };
    const cfg = await appConfig(org.cafe.appUrl);
    const h = cfg.hours ?? {};
    const tz = h.timezone || cfg.scheduling?.timezone || org.timezone || "Australia/Sydney";
    const date = str(r.date, 10), time = str(r.time, 5);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !slotsFor(date, h.weekly, h.closures ?? [], nowIn(tz), 30, 30).some((s) => s.value === time)) {
      return { ok: false, error: "That time isn't available — please choose another." };
    }
    const notes = [`Seating: ${seating}`, str(r.notes, 400), "Booked on the website"].filter(Boolean).join(" — ");
    await appReserve(org.cafe.appUrl, { name, phone, email, party, at: zonedIso(date, time, tz), notes, captchaToken: str(r.captchaToken, 600), captchaAnswer: str(r.captchaAnswer, 6) });
    return { ok: true, when: `${date} ${time}` };
  } catch (e) {
    console.error("[cafe] reserve", e instanceof Error ? e.message : e);
    return fail(e, "We couldn't send your booking — please try again or give us a call.");
  }
}
