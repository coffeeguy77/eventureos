import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/integrations/runtime";
import { appBaseUrl } from "@/lib/integrations/registry";
import { publicOrg, brandOf, type PublicOrg } from "@/lib/bookings/server";
import { emailConfigured, sendEmail } from "@/lib/email/send";
import { shell, officeAlertEmail } from "@/lib/bookings/emails";
import { todayISO } from "@/lib/format";
import { finishCart } from "@/lib/reminders/server";
import type { PackageRules, PricedService } from "@/lib/pricing/engine";
import {
  addDays, cateringGroup, cateringProblem, cateringSections, dayStatus, hireSections, isCatering, isTentative, readEvents, requestProblem, sectionsTotal, SLOTS,
  type CateringItem, type CateringOrder, type DayStatus, type EventsSettings, type HireKind, type HireRequest, type QuoteSection,
} from "./core";

export interface EventsOrg { org: PublicOrg; s: EventsSettings; today: string }

/** The business + its events settings, or null when the section is off. */
export async function eventsOrg(slug: string, db = createServiceClient()): Promise<EventsOrg | null> {
  const org = await publicOrg(slug, db);
  if (!org) return null;
  const s = readEvents(org.rawSettings);
  if (!s.enabled) return null;
  return { org, s, today: todayISO(org.timezone) };
}

/* ------------------------------------------------------------------ availability */

/** Units already out per date, for one kind. */
export async function bookedUnits(db: SupabaseClient, orgId: string, kind: HireKind, from: string, to: string) {
  const { data, error } = await db.rpc("fleet_booked", { p_org: orgId, p_from: from, p_to: to });
  if (error) throw new Error(error.message);
  const out = new Map<string, number>();
  for (const r of (data ?? []) as { day: string; kind: string; units: number }[]) if (r.kind === kind) out.set(r.day, (out.get(r.day) ?? 0) + Number(r.units));
  return out;
}

export async function availability(eo: EventsOrg, kind: HireKind, dates: string[], wanted: number, db = createServiceClient()): Promise<DayStatus[]> {
  const clean = [...new Set(dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort().slice(0, 31);
  if (!clean.length) return [];
  const booked = await bookedUnits(db, eo.org.id, kind, clean[0], clean[clean.length - 1]);
  return clean.map((d) => dayStatus(kind, d, wanted, booked.get(d) ?? 0, eo.s));
}

/** Busy-ness for a month view: date → units free. */
export async function monthFree(eo: EventsOrg, kind: HireKind, from: string, days = 62, db = createServiceClient()) {
  const to = addDays(from, days);
  const booked = await bookedUnits(db, eo.org.id, kind, from, to);
  const out: Record<string, number> = {};
  for (const [d, n] of booked) out[d] = Math.max(0, eo.s.fleet[kind] - n);
  return out;
}

/* ------------------------------------------------------------------ price list */

const KIND_MATCH: Record<HireKind, RegExp> = { cart: /cart/i, van: /van/i, diy: /equipment|diy/i };

export async function priceList(db: SupabaseClient, orgId: string) {
  const [sv, pk] = await Promise.all([
    db.from("services").select("id, code, name, description, category, unit, unit_price, tax_rate, position").eq("organisation_id", orgId).eq("active", true).order("position"),
    db.from("service_packages").select("id, name, rules, position").eq("organisation_id", orgId).eq("active", true).order("position"),
  ]);
  if (sv.error) throw new Error(sv.error.message);
  if (pk.error) throw new Error(pk.error.message);
  const services = (sv.data ?? []).map((x) => ({ ...x, unit_price: Number(x.unit_price), tax_rate: Number(x.tax_rate) }));
  return { services, packages: (pk.data ?? []) as { id: string; name: string; rules: PackageRules }[] };
}

export function packageFor(kind: HireKind, s: EventsSettings, packages: { id: string; name: string; rules: PackageRules }[]) {
  const id = s.packages[kind];
  return (id && packages.find((p) => p.id === id)) || packages.find((p) => KIND_MATCH[kind].test(p.name)) || null;
}

/** Catering menu (services whose category starts with "Catering"). Prices are only shown when the business allows it. */
export async function cateringMenu(db: SupabaseClient, orgId: string): Promise<CateringItem[]> {
  const { services } = await priceList(db, orgId);
  return services.filter((x) => isCatering(x.category)).map((x) => ({ id: x.id, name: x.name, description: x.description, group: cateringGroup(x.category), unit: x.unit, unit_price: x.unit_price, tax_rate: x.tax_rate }));
}

/* ------------------------------------------------------------------ emails */

const fmtLong = (iso: string) => new Intl.DateTimeFormat("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(iso + "T00:00:00Z"));
const moneyAU = (n: number) => `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function mailBoth(org: PublicOrg, customer: { to: string; firstName: string; heading: string; intro: string[]; rows: { label: string; value: string }[] }, office: { heading: string; rows: { label: string; value: string }[]; url: string }) {
  if (!emailConfigured()) return;
  const brand = brandOf(org);
  const replyTo = org.settings.reply_to ?? org.contact_email;
  try {
    const m = shell(brand, { title: customer.heading, heading: customer.heading, intro: customer.intro, rows: customer.rows,
      after: [`Questions? Just reply to this email${org.contact_phone ? ` or call ${org.contact_phone}` : ""}.`] });
    await sendEmail({ to: customer.to, subject: m.subject, html: m.html, text: m.text, replyTo, fromName: org.name });
  } catch (e) { console.error("[events] customer email", e); }
  const to = org.settings.notify_email ?? org.contact_email;
  if (to) {
    try {
      const a = officeAlertEmail(brand, { heading: office.heading, lines: office.rows, url: office.url });
      await sendEmail({ to, subject: a.subject, html: a.html, text: a.text, fromName: "EventureOS" });
    } catch (e) { console.error("[events] office email", e); }
  }
}

/* ------------------------------------------------------------------ submit: hire quote */

export type SubmitResult = { ok: true; reference: string; tentative: boolean } | { ok: false; error: string };

export async function submitHire(slug: string, r: HireRequest, db = createServiceClient()): Promise<SubmitResult> {
  const eo = await eventsOrg(slug, db);
  if (!eo) return { ok: false, error: "Online quotes aren't available right now." };
  const { org, s, today } = eo;
  const problem = requestProblem(r, s, today);
  if (problem) return { ok: false, error: problem };

  const dates = r.days.map((d) => d.date).sort();
  const avail = await availability(eo, r.kind, dates, r.units, db);
  const clash = avail.find((a) => !a.ok);
  if (clash) return { ok: false, error: `${fmtLong(clash.date)}: ${clash.message}. Choose another date or fewer.` };

  const { services, packages } = await priceList(db, org.id);
  const pkg = packageFor(r.kind, s, packages);
  let sections: QuoteSection[] = [];
  const notes: string[] = [];
  if (pkg) {
    try { const res = hireSections(r, pkg.rules, services as PricedService[], s); sections = res.sections; notes.push(...res.notes); }
    catch (e) { notes.push(`Couldn't price automatically: ${(e as Error).message}`); }
  } else notes.push(`No "${s.labels[r.kind]}" package in Settings → Services & pricing — add the prices before sending.`);

  const tentative = isTentative(today, dates[0], s.leadDays);
  const first = r.days.find((d) => d.date === dates[0])!;
  const label = s.labels[r.kind];
  const what = `${r.units > 1 ? `${r.units} × ` : ""}${label}`;
  const title = `${what}${r.eventType ? ` · ${r.eventType}` : ""} — ${r.contact.company.trim() || r.contact.name.trim()}`;
  const totalServes = r.days.reduce((a, d) => a + (d.serves || 0), 0);
  const msg = [
    `Built on the website: ${what}, ${r.days.length} day${r.days.length > 1 ? "s" : ""}.`,
    ...r.days.map((d, i) => `• ${r.days.length > 1 ? `Day ${i + 1}: ` : ""}${fmtLong(d.date)}${r.kind !== "diy" ? ` ${d.start}–${d.end}, ${d.staff} barista${d.staff > 1 ? "s" : ""}, about ${d.serves} coffees` : ""}`),
    r.delivery ? "Delivery wanted." : r.kind === "diy" ? "Will pick up and return." : "",
    r.stickers ? `Cup stickers: ${r.stickers}.` : "", r.wrap ? `Interested in a ${label.toLowerCase()} wrap / signage.` : "",
    r.catering ? "Also interested in catering." : "",
    tentative ? `TENTATIVE — under ${s.leadDays} days away; confirm staff before sending.` : "",
    r.notes.trim() ? `Customer notes: ${r.notes.trim()}` : "",
    ...notes,
  ].filter(Boolean).join("\n");

  const payload = {
    title, event_type: r.eventType || null, date: dates[0], start_time: r.kind !== "diy" ? first.start : null, end_time: r.kind !== "diy" ? first.end : null,
    guests: r.guests, serves: totalServes || null, staff: r.kind !== "diy" ? Math.max(...r.days.map((d) => d.staff)) : null,
    venue: r.venue, address: r.address, notes: msg, message: msg,
    customer: { name: r.contact.name.trim(), email: r.contact.email.trim(), phone: r.contact.phone.trim(), company: r.contact.company.trim() },
    fleet: { [r.kind]: r.units }, fleet_dates: dates, catering: [], sections, tentative, source_label: "Events quote builder",
  };
  const { data, error } = await db.rpc("site_quote_request", { p_org: org.id, p_payload: payload });
  if (error) return { ok: false, error: error.message.replace(/^.*?:\s*/, "") || "Couldn't send that — please try again." };
  const res = data as { quote_id: string; quote_number: string; event_number: string; total: number };
  await finishCart(db, org.id, "events", r.contact.email);

  const first1 = r.contact.name.trim().split(/\s+/)[0];
  await mailBoth(org,
    { to: r.contact.email.trim(), firstName: first1, heading: `Thanks ${first1} — your quote request is in`,
      intro: [
        `We've got your request for ${what.toLowerCase()} and we're putting your quote together now. It'll come to this email shortly with everything itemised.`,
        tentative ? `Your date is less than ${s.leadDays} days away, so it's pencilled in as tentative while we confirm our baristas — we'll be in touch quickly.` : `Want to lock the date in? Accept the quote when it arrives and we'll send your invoice.`,
      ],
      rows: [{ label: "Reference", value: res.event_number }, { label: "What", value: what }, ...r.days.map((d, i) => ({ label: r.days.length > 1 ? `Day ${i + 1}` : "Date", value: `${fmtLong(d.date)}${r.kind !== "diy" ? ` · ${d.start}–${d.end}` : ""}` })), ...(r.venue || r.address ? [{ label: "Where", value: r.venue || r.address }] : [])] },
    { heading: `${tentative ? "TENTATIVE · " : ""}Website quote: ${r.contact.name.trim()} — ${what}`, url: `${appBaseUrl()}/quotes/${res.quote_id}`,
      rows: [{ label: "Draft", value: `${res.quote_number} · ${moneyAU(Number(res.total))} inc GST` }, { label: "Dates", value: dates.map(fmtLong).join(", ") }, { label: "Email", value: r.contact.email.trim() }, ...(r.contact.phone.trim() ? [{ label: "Phone", value: r.contact.phone.trim() }] : [])] });
  return { ok: true, reference: res.event_number, tentative };
}

/* ------------------------------------------------------------------ submit: catering order */

export async function submitCatering(slug: string, o: CateringOrder, db = createServiceClient()): Promise<SubmitResult> {
  const eo = await eventsOrg(slug, db);
  if (!eo) return { ok: false, error: "Online catering orders aren't available right now." };
  const { org, s, today } = eo;
  const menu = await cateringMenu(db, org.id);
  const problem = cateringProblem(o, menu, today);
  if (problem) return { ok: false, error: problem };
  const sections = cateringSections(o, menu);
  const tentative = isTentative(today, o.date, s.leadDays);
  const byId = new Map(menu.map((m) => [m.id, m]));
  const catering = o.slots.filter((x) => x.items.some((l) => l.qty > 0)).map((x) => ({
    slot: x.slot, label: SLOTS.find((z) => z.id === x.slot)?.label, time: x.time, date: o.date,
    items: x.items.filter((l) => l.qty > 0).map((l) => ({ service_id: l.serviceId, name: byId.get(l.serviceId)?.name, qty: l.qty })),
  }));
  const msg = [`Catering order from the website for ${fmtLong(o.date)}.`, ...catering.map((c) => `• ${c.label} ${c.time}: ${c.items.map((i) => `${i.qty} × ${i.name}`).join(", ")}`),
    tentative ? `TENTATIVE — under ${s.leadDays} days away; check the kitchen can do it.` : "", o.notes.trim() ? `Customer notes: ${o.notes.trim()}` : ""].filter(Boolean).join("\n");
  const payload = {
    title: `Catering — ${o.contact.company.trim() || o.contact.name.trim()}`, event_type: "Catering", date: o.date,
    start_time: catering[0]?.time ?? null, end_time: null, guests: o.guests, venue: o.venue, address: o.address, notes: msg, message: msg,
    customer: { name: o.contact.name.trim(), email: o.contact.email.trim(), phone: o.contact.phone.trim(), company: o.contact.company.trim() },
    fleet: {}, fleet_dates: [o.date], catering, sections, tentative, source_label: "Catering order",
  };
  const { data, error } = await db.rpc("site_quote_request", { p_org: org.id, p_payload: payload });
  if (error) return { ok: false, error: error.message.replace(/^.*?:\s*/, "") || "Couldn't send that — please try again." };
  const res = data as { quote_id: string; quote_number: string; event_number: string; total: number };
  await finishCart(db, org.id, "catering", o.contact.email);
  const t = sectionsTotal(sections);
  const first1 = o.contact.name.trim().split(/\s+/)[0];
  await mailBoth(org,
    { to: o.contact.email.trim(), firstName: first1, heading: `Thanks ${first1} — your catering order is in`,
      intro: [`We've got your catering order for ${fmtLong(o.date)}. We'll check it and email your quote and invoice to lock it in.`, tentative ? `It's less than ${s.leadDays} days away, so it's tentative until the kitchen confirms — we'll be in touch quickly.` : ""].filter(Boolean),
      rows: [{ label: "Reference", value: res.event_number }, ...catering.map((c) => ({ label: `${c.label} · ${c.time}`, value: c.items.map((i) => `${i.qty} × ${i.name}`).join(", ") })), { label: "Estimated total", value: `${moneyAU(t.total)} inc GST` }] },
    { heading: `${tentative ? "TENTATIVE · " : ""}Catering order: ${o.contact.name.trim()} — ${fmtLong(o.date)}`, url: `${appBaseUrl()}/quotes/${res.quote_id}`,
      rows: [{ label: "Draft", value: `${res.quote_number} · ${moneyAU(Number(res.total))} inc GST` }, { label: "Email", value: o.contact.email.trim() }] });
  return { ok: true, reference: res.event_number, tentative };
}
