import "server-only";
import { createServiceClient } from "@/lib/integrations/runtime";
import { appBaseUrl } from "@/lib/integrations/registry";
import { publicOrg, type PublicOrg } from "@/lib/bookings/server";
import { addDaysISO, todayISO, zonedTimeUTC } from "@/lib/format";
import {
  bondFor, bookingTotal, brandOf, chargeableHours, checkStock, hireable, peakUse, priceItem, readHireSettings, weekendDaysBetween,
  type HireItem, type HireSettings, type Hold,
} from "./core";
import { loadHolds, loadItems, type ItemRow } from "./server";

/**
 * The public hire shop (/hire/<business>/shop): the catalogue, live availability for chosen dates, and online
 * bookings — an instant booking with a card deposit when everything's free (and Stripe is connected), otherwise a
 * request the business confirms.
 */

export interface ShopOrg { org: PublicOrg; s: HireSettings }

export async function shopOrg(slug: string): Promise<ShopOrg | null> {
  const org = await publicOrg(slug).catch(() => null);
  if (!org) return null;
  const s = readHireSettings(org.rawSettings);
  const { data } = await createServiceClient().from("organisations").select("app_access").eq("id", org.id).maybeSingle();
  const access = (data as { app_access?: unknown } | null)?.app_access;
  const allowed = Array.isArray(access) ? access.includes("rentals") : s.enabled;
  if (!allowed || !s.shop.enabled) return null;
  return { org, s };
}

export interface ShopItem {
  id: string; name: string; description: string | null; category: string | null; brand: string | null; kind: "hire" | "sale" | "package";
  price: number; priceNote: string; image: string | null; max: number; companions: { id: string; qty: number }[];
  /** product page web address part (null = no page) */ slug: string | null;
}

/** What's on show: active items with a price (sale items are add-ons). */
export function catalogue(items: ItemRow[], s: HireSettings): ShopItem[] {
  const byId = new Map<string, HireItem>(items.map((i) => [i.id, i]));
  const out: ShopItem[] = [];
  for (const it of items) {
    if (!it.active || !it.show_online) continue;
    const p = priceItem(it, byId, s.units, 24);
    if (!(p.each > 0)) continue;
    const timed = it.rates.some((r) => (s.units.find((u) => u.key === r.unit)?.hours ?? 0) > 0);
    out.push({
      id: it.id, name: it.name, description: it.description, category: it.category, brand: brandOf(s, it.id)?.key ?? null, kind: it.kind,
      price: p.each, priceNote: it.kind === "sale" ? "each" : timed ? "per day" : "per hire",
      image: it.images[0] ?? null, slug: it.slug,
      max: it.kind === "hire" ? hireable(it) : it.kind === "sale" ? Math.max(1, it.quantity) : 50,
      companions: it.companions.filter((c) => byId.get(c.item_id)?.active).map((c) => ({ id: c.item_id, qty: c.qty })),
    });
  }
  return out;
}

/** One item's product page: the item, its gallery and write-up, and what's suggested with it. */
export async function productPage(so: ShopOrg, slug: string) {
  if (!/^[a-z0-9-]{1,90}$/.test(slug)) return null;
  const items = await loadItems(createServiceClient(), so.org.id, { activeOnly: true });
  const it = items.find((i) => i.slug === slug && i.show_online);
  if (!it) return null;
  const shop = catalogue(items, so.s);
  const me = shop.find((x) => x.id === it.id);
  if (!me) return null;
  const pick = (ids: string[]) => ids.map((id) => shop.find((x) => x.id === id)).filter((x): x is ShopItem => !!x);
  // the owner's picks, then what usually goes with it, then a few from the same category
  const related = pick([...new Set([...it.related, ...it.companions.map((c) => c.item_id)])]);
  const more = shop.filter((x) => x.id !== it.id && x.category === it.category && !related.some((r) => r.id === x.id) && x.kind !== "sale").slice(0, Math.max(0, 4 - related.length));
  return { item: it, me, related, more, shop };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
export interface Window { startDate: string; startTime: string; endDate: string; endTime: string }

export function windowMs(w: Window, tz: string, today: string) {
  if (!DATE.test(w.startDate) || !DATE.test(w.endDate) || !TIME.test(w.startTime) || !TIME.test(w.endTime)) throw new Error("Choose your hire dates.");
  if (w.startDate < today) throw new Error("Choose a start date from today on.");
  if (w.startDate > addDaysISO(today, 730)) throw new Error("We take bookings up to two years ahead.");
  const start = Date.parse(zonedTimeUTC(w.startDate, w.startTime, tz)), end = Date.parse(zonedTimeUTC(w.endDate, w.endTime, tz));
  if (!(end > start)) throw new Error("The hire has to end after it starts.");
  if (end - start > 60 * 86_400_000) throw new Error("For hires longer than two months, please contact us.");
  return { start, end };
}

/** How many of each item are free for the window, and when the unavailable ones free up. */
export async function shopAvailability(so: ShopOrg, w: Window) {
  const db = createServiceClient();
  const { org, s } = so;
  const win = windowMs(w, org.timezone, todayISO(org.timezone));
  const items = await loadItems(db, org.id, { activeOnly: true });
  const byId = new Map<string, HireItem>(items.map((i) => [i.id, i]));
  const { holds } = await loadHolds(db, org.id, win.start, win.end, byId);
  const byItem = new Map<string, Hold[]>();
  for (const h of holds) byItem.set(h.itemId, [...(byItem.get(h.itemId) ?? []), h]);
  const freeOf = (it: HireItem) => {
    const buf = (it.buffer_hours ?? s.bufferHours) * 3_600_000;
    return Math.max(0, hireable(it) - peakUse(byItem.get(it.id) ?? [], win.start, win.end + buf, buf));
  };
  const out: Record<string, { free: number; freeFrom: number | null }> = {};
  for (const it of items) {
    if (it.kind === "sale") { out[it.id] = { free: Math.max(1, it.quantity), freeFrom: null }; continue; }
    let free = 0;
    if (it.kind === "hire") free = freeOf(it);
    else free = it.package_lines.reduce((m, l) => { const c = byId.get(l.item_id); return c ? Math.min(m, Math.floor(freeOf(c) / Math.max(1, l.qty))) : m; }, Infinity);
    if (!Number.isFinite(free)) free = 0;
    let freeFrom: number | null = null;
    if (free <= 0) freeFrom = checkStock([{ itemId: it.id, qty: 1 }], byId, holds, win.start, win.end, s.bufferHours)[0]?.freeFrom ?? null;
    out[it.id] = { free, freeFrom };
  }
  return out;
}

export interface ShopRequest extends Window {
  lines: { id: string; qty: number }[];
  fulfilment: "collect" | "deliver";
  address: { street: string; suburb: string; state: string; postcode: string } | null;
  name: string; email: string; phone: string; company: string | null; notes: string | null;
  website?: string; t?: number; // bot traps
}

const EMAIL = /^[^\s@<>"',;:()]+@[^\s@<>"',;:()]+\.[^\s@<>"',;:()]{2,}$/;
const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const money2 = (n: number) => Math.round(n * 100) / 100;

/** Price a shop basket (also used to show the customer their total before they send it). */
export async function quoteBasket(so: ShopOrg, r: Pick<ShopRequest, "lines" | "fulfilment" | "address" | keyof Window>) {
  const { org, s } = so;
  const db = createServiceClient();
  const win = windowMs(r, org.timezone, todayISO(org.timezone));
  const items = await loadItems(db, org.id, { activeOnly: true });
  const byId = new Map<string, HireItem>(items.map((i) => [i.id, i]));
  const hours = chargeableHours(win.start, win.end, { graceHours: s.graceHours, weekendDays: s.excludeWeekends ? weekendDaysBetween(r.startDate, r.endDate) : 0 });
  const lines = (Array.isArray(r.lines) ? r.lines : []).slice(0, 100).flatMap((l) => {
    const it = byId.get(String(l?.id ?? ""));
    const qty = Math.max(1, Math.min(1000, Math.round(Number(l?.qty) || 0)));
    if (!it) return [];
    const p = priceItem(it, byId, s.units, hours);
    if (!(p.each > 0)) return [];
    return [{ item: it, qty, each: p.each, note: p.note, total: money2(p.each * qty) }];
  });
  const deliver = r.fulfilment === "deliver";
  const state = str(r.address?.state, 8).toUpperCase();
  const zone = s.deliveryZone;
  const inZone = !!(deliver && zone && zone.states.includes(state));
  const deliveryFee = deliver ? (inZone ? zone!.fee : 0) : 0;
  const deliveryQuoted = deliver && !inZone;
  const tot = bookingTotal(lines.map((l) => ({ line_total: l.total })), deliveryFee, 0);
  const { holds } = await loadHolds(db, org.id, win.start, win.end, byId);
  const shortages = checkStock(lines.map((l) => ({ itemId: l.item.id, qty: l.qty })), byId, holds, win.start, win.end, s.bufferHours);
  return {
    win, lines, deliveryFee, deliveryQuoted, total: tot.total, gst: tot.gst,
    bond: bondFor(lines.map((l) => ({ itemId: l.item.id, qty: l.qty })), byId, s.bondMode),
    deposit: money2((tot.total * s.depositPct) / 100), shortages,
  };
}

export type SubmitResult = { ok: true; kind: "paid" | "request"; number: string; payUrl: string | null } | { ok: false; error: string };

export async function submitShop(slug: string, r: ShopRequest): Promise<SubmitResult> {
  try {
    if (r.website) return { ok: true, kind: "request", number: "", payUrl: null }; // bot
    if (r.t && Date.now() - Number(r.t) < 4000) return { ok: false, error: "Please take a moment to check your booking, then send it again." };
    const so = await shopOrg(slug);
    if (!so) return { ok: false, error: "Online hire isn't available right now — please contact us." };
    const { org, s } = so;
    const name = str(r.name, 120), email = str(r.email, 200).toLowerCase(), phone = str(r.phone, 40), company = str(r.company, 160) || null;
    if (name.length < 2) return { ok: false, error: "Please add your name." };
    if (!EMAIL.test(email)) return { ok: false, error: "Please check your email address." };
    if (phone.replace(/\D/g, "").length < 8) return { ok: false, error: "Please add a phone number so we can reach you on the day." };
    const deliver = r.fulfilment === "deliver";
    const addr = deliver ? { street: str(r.address?.street, 200), suburb: str(r.address?.suburb, 80), state: str(r.address?.state, 8).toUpperCase(), postcode: str(r.address?.postcode, 8) } : null;
    if (deliver && (!addr!.street || !addr!.suburb || !addr!.state)) return { ok: false, error: "Please add the delivery address." };
    const q = await quoteBasket(so, { ...r, address: addr });
    if (!q.lines.length) return { ok: false, error: "Your booking is empty — add something to hire." };
    const db = createServiceClient();

    // One online booking per email every two minutes (double clicks, bots)
    const { count } = await db.from("hire_bookings").select("id", { count: "exact", head: true }).eq("organisation_id", org.id)
      .ilike("internal_notes", `%${email.replace(/[%_]/g, "")}%`).gte("created_at", new Date(Date.now() - 120_000).toISOString());
    if ((count ?? 0) > 0) return { ok: false, error: "We've just received a booking from you — check your email, or contact us if something's wrong." };

    // The customer: matched by email, or added
    let customerId: string;
    const { data: same } = await db.from("customers").select("id").eq("organisation_id", org.id).ilike("email", email).limit(1).maybeSingle();
    if (same) customerId = same.id as string;
    else {
      const { data: c, error } = await db.from("customers").insert({
        organisation_id: org.id, kind: company ? "company" : "individual", name: company ?? name, company, email, phone,
        address: addr ? `${addr.street}\n${addr.suburb} ${addr.state} ${addr.postcode}`.trim() : null, tags: ["online hire"],
      }).select("id").single();
      if (error) throw new Error(error.message);
      customerId = c.id as string;
      const parts = name.split(/\s+/);
      await db.from("contacts").insert({ organisation_id: org.id, customer_id: customerId, first_name: parts[0], last_name: parts.slice(1).join(" ") || null, email, phone, is_primary: true }).then(() => undefined, () => undefined);
    }

    const instant = s.shop.instantBook && org.stripeReady && !q.shortages.length && !q.deliveryQuoted && q.deposit > 0;
    const notes = [`Booked online by ${name} (${email}, ${phone})${company ? ` for ${company}` : ""}.`,
      q.shortages.length ? `Short when booked: ${q.shortages.map((x) => `${x.short} × ${x.name}`).join(", ")}.` : "",
      q.deliveryQuoted ? `Delivery to ${addr?.state || "outside the delivery area"} — quote the delivery fee.` : ""].filter(Boolean).join(" ");
    const { data: b, error: bErr } = await db.from("hire_bookings").insert({
      organisation_id: org.id, status: instant ? "reservation" : "quote", customer_id: customerId, title: "Online booking",
      starts_at: new Date(q.win.start).toISOString(), ends_at: new Date(q.win.end).toISOString(),
      fulfilment: deliver ? "deliver" : "collect", address: addr ? `${addr.street}, ${addr.suburb} ${addr.state} ${addr.postcode}`.trim() : null,
      delivery_fee: q.deliveryFee, total: q.total, bond: q.bond, notes: str(r.notes, 2000) || null, internal_notes: notes,
      quote_expires: addDaysISO(todayISO(org.timezone), s.quoteDays),
    }).select("id, number").single();
    if (bErr) throw new Error(bErr.message);
    const { error: lErr } = await db.from("hire_booking_lines").insert(q.lines.map((l, i) => ({
      organisation_id: org.id, booking_id: b.id, item_id: l.item.id, name: l.item.name, kind: l.item.kind, quantity: l.qty, unit_price: l.each,
      price_note: l.note, line_total: l.total, sort: i,
    })));
    if (lErr) throw new Error(lErr.message);

    let payUrl: string | null = null;
    if (instant) {
      const today = todayISO(org.timezone);
      const subtotal = money2(q.deposit / 1.1);
      const { data: inv, error: iErr } = await db.from("invoices").insert({
        organisation_id: org.id, customer_id: customerId, kind: "deposit", status: "awaiting_payment", issue_date: today, due_date: today,
        subtotal, tax_total: money2(q.deposit - subtotal), total: q.deposit, currency: org.currency, reference: `${b.number} · online booking`,
        line_items: [{ description: `Deposit (${s.depositPct}%) for hire ${b.number}`, quantity: 1, unit_amount: q.deposit, line_amount: q.deposit }],
      }).select("id, pay_token").single();
      if (iErr) throw new Error(iErr.message);
      await db.from("hire_bookings").update({ invoice_id: inv.id }).eq("id", b.id);
      payUrl = `${appBaseUrl()}/pay/${inv.pay_token}`;
    }

    // Tell the business
    await db.from("notifications").insert({
      organisation_id: org.id, type: "hire.online", title: `${instant ? "Online hire (deposit pending)" : "Online hire request"} — ${company ?? name}`.slice(0, 200),
      body: `${b.number} · ${q.lines.length} item${q.lines.length === 1 ? "" : "s"} · $${q.total.toFixed(2)}`, link: `/rentals/bookings/${b.id}`, entity_type: "hire_booking", entity_id: b.id,
    }).then(() => undefined, () => undefined);
    if (org.contact_email) {
      try {
        const { emailConfigured, sendEmail } = await import("@/lib/email/send");
        const { officeAlertEmail } = await import("@/lib/bookings/emails");
        if (emailConfigured()) {
          const fmt = (ms: number) => new Intl.DateTimeFormat("en-AU", { timeZone: org.timezone, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(ms));
          const m = officeAlertEmail({ businessName: org.name, logoUrl: org.logo_url, brand: org.brand_colour }, {
            heading: instant ? `Online hire ${b.number}: waiting for the deposit` : `New online hire request ${b.number}`,
            lines: [
              { label: "Customer", value: `${company ? `${company} — ` : ""}${name}` }, { label: "Contact", value: `${email} · ${phone}` },
              { label: "When", value: `${fmt(q.win.start)} → ${fmt(q.win.end)}` },
              { label: "Items", value: q.lines.map((l) => `${l.qty} × ${l.item.name}`).join(", ") },
              { label: deliver ? "Deliver to" : "Collection", value: deliver ? `${addr!.street}, ${addr!.suburb} ${addr!.state} ${addr!.postcode}` : "Customer collects" },
              { label: "Total", value: `$${q.total.toFixed(2)}${q.deliveryQuoted ? " + delivery (to quote)" : ""}` },
              ...(q.shortages.length ? [{ label: "Check stock", value: q.shortages.map((x) => `${x.short} × ${x.name} short`).join(", ") }] : []),
            ],
            url: `${appBaseUrl()}/rentals/bookings/${b.id}`,
          });
          await sendEmail({ to: org.contact_email, ...m, replyTo: email, fromName: "EventureOS" });
        }
      } catch (e) { console.error("hire shop alert", e); }
    }
    return { ok: true, kind: instant ? "paid" : "request", number: b.number as string, payUrl };
  } catch (e) {
    console.error("hire shop submit", e);
    return { ok: false, error: e instanceof Error && /Choose|hire|bookings up to|contact us/i.test(e.message) ? e.message : "Couldn't send your booking — please try again or contact us." };
  }
}

