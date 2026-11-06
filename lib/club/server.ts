import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/integrations/runtime";
import { appBaseUrl } from "@/lib/integrations/registry";
import { brandOf, orgById, publicOrg, type PublicOrg } from "@/lib/bookings/server";
import { emailConfigured, sendEmail } from "@/lib/email/send";
import { officeAlertEmail } from "@/lib/bookings/emails";
import { fmtDateTime, money, todayISO, zonedTimeUTC } from "@/lib/format";
import { readEvents } from "@/lib/events/core";
import {
  cleanOffers, cleanOrder, cleanStandardOrders, daysText, deliveryDay, dueDate, followUpDue, lastMonth, orderProblem, pickupDay, priceOrder,
  readCodes, readRates, runsFor, OFFER_LABEL, type ClubCodes, type ClubDay, type ClubRates, type Offer, type Priced, type PricedLine, type StandardOrder,
} from "./core";
import { clubBookedEmail, clubFollowUpEmail } from "./emails";

/* ------------------------------------------------------------------ settings & accounts */

export interface ClubSettings {
  /** what the section is called (default "Cart Club") */ name: string;
  codes: ClubCodes;
  /** club addresses, kept here so the business's own domain can route /<club> without a database lookup */ slugs: string[];
  /** e.g. "https://www.example.com.au" once that domain sends /<club> here; otherwise EventureOS addresses are used */ base: string | null;
}
export function readClubSettings(orgSettings: unknown): ClubSettings {
  const o = ((orgSettings as Record<string, unknown> | null)?.cart_club ?? {}) as Record<string, unknown>;
  const base = typeof o.base === "string" && /^https:\/\/[a-z0-9.-]+$/i.test(o.base.replace(/\/+$/, "")) ? o.base.replace(/\/+$/, "") : null;
  return {
    name: typeof o.name === "string" && o.name.trim() ? o.name.trim().slice(0, 40) : "Cart Club",
    codes: readCodes(o.codes), slugs: Array.isArray(o.slugs) ? o.slugs.filter((s): s is string => typeof s === "string").slice(0, 500) : [], base,
  };
}

export interface ClubAccount {
  id: string; organisation_id: string; customer_id: string; slug: string; name: string; enabled: boolean; offers: Offer[]; rates: ClubRates;
  billing: "on_booking" | "monthly"; due_rule: "after_invoice" | "before_event"; due_days: number; standard_orders: StandardOrder[];
  wholesale_customer_id: string | null; email_invoices: boolean; follow_up: boolean; notes: string | null;
}
export const ACCOUNT_COLS = "id, organisation_id, customer_id, slug, name, enabled, offers, rates, billing, due_rule, due_days, standard_orders, wholesale_customer_id, email_invoices, follow_up, notes";
export function toAccount(r: Record<string, unknown>): ClubAccount {
  return {
    id: r.id as string, organisation_id: r.organisation_id as string, customer_id: r.customer_id as string, slug: r.slug as string, name: r.name as string,
    enabled: r.enabled !== false, offers: cleanOffers(r.offers), rates: readRates(r.rates), billing: r.billing === "monthly" ? "monthly" : "on_booking",
    due_rule: r.due_rule === "before_event" ? "before_event" : "after_invoice", due_days: Number(r.due_days ?? 7), standard_orders: cleanStandardOrders(r.standard_orders),
    wholesale_customer_id: (r.wholesale_customer_id as string) ?? null, email_invoices: r.email_invoices === true, follow_up: r.follow_up === true, notes: (r.notes as string) ?? null,
  };
}

export interface ClubPerson { id: string; account_id: string; name: string; email: string | null; phone: string | null; contact_id: string | null; active: boolean }
export const PERSON_COLS = "id, account_id, name, email, phone, contact_id, active";

/** The club's public address (the business's own domain when it's routed there). */
export function clubUrl(org: Pick<PublicOrg, "slug"> & { rawSettings?: Record<string, unknown>; settings?: unknown }, clubSlug: string, path = "") {
  const s = readClubSettings(org.rawSettings ?? org.settings);
  return s.base ? `${s.base}/${clubSlug}${path}` : `${appBaseUrl()}/club/${org.slug}/${clubSlug}${path}`;
}

export interface ClubCtx { org: PublicOrg; s: ClubSettings; account: ClubAccount; db: SupabaseClient }

export async function clubCtx(orgSlug: string, clubSlug: string, db: SupabaseClient = createServiceClient()): Promise<ClubCtx | null> {
  if (!/^[a-z0-9-]{2,40}$/.test(clubSlug)) return null;
  const org = await publicOrg(orgSlug, db);
  if (!org) return null;
  const { data, error } = await db.from("cart_club_accounts").select(ACCOUNT_COLS).eq("organisation_id", org.id).eq("slug", clubSlug).maybeSingle();
  if (error || !data || data.enabled === false) return null;
  return { org, s: readClubSettings(org.rawSettings), account: toAccount(data), db };
}

/** Bring the org's list of club addresses up to date (for routing on the business's own domain). */
export async function syncClubSlugs(db: SupabaseClient, orgId: string) {
  const { data: org } = await db.from("organisations").select("settings").eq("id", orgId).single();
  const { data: accts } = await db.from("cart_club_accounts").select("slug").eq("organisation_id", orgId).eq("enabled", true);
  const settings = (org?.settings ?? {}) as Record<string, unknown>;
  const cc = (settings.cart_club ?? {}) as Record<string, unknown>;
  await db.from("organisations").update({ settings: { ...settings, cart_club: { ...cc, slugs: ((accts ?? []) as { slug: string }[]).map((a) => a.slug).sort() } } }).eq("id", orgId);
}

/* ------------------------------------------------------------------ bookings */

export interface ClubBooking {
  id: string; number: number; status: "quote" | "booked" | "cancelled"; title: string; venue: string | null; address: string | null; notes: string | null;
  days: ClubDay[]; carts: number; van: number; baristas: number; coffees: number; lines: PricedLine[]; subtotal: number; total: number;
  first_day: string | null; last_day: string | null; created_by: string | null; created_by_name: string | null; updated_by_name: string | null;
  booked_by_name: string | null; booked_at: string | null; event_id: string | null; invoice_id: string | null; follow_up_at: string | null; created_at: string; updated_at: string;
}
export const BOOKING_COLS = "id, number, status, title, venue, address, notes, days, carts, van, baristas, coffees, lines, subtotal, total, first_day, last_day, created_by, created_by_name, updated_by_name, booked_by_name, booked_at, event_id, invoice_id, follow_up_at, created_at, updated_at";
const toBooking = (r: Record<string, unknown>): ClubBooking => ({ ...(r as unknown as ClubBooking), subtotal: Number(r.subtotal), total: Number(r.total), days: (r.days as ClubDay[]) ?? [], lines: (r.lines as PricedLine[]) ?? [] });

export async function accountBookings(db: SupabaseClient, accountId: string, from: string): Promise<ClubBooking[]> {
  const { data, error } = await db.from("cart_club_bookings").select(BOOKING_COLS).eq("account_id", accountId).neq("status", "cancelled")
    .or(`last_day.gte.${from},last_day.is.null`).order("first_day", { ascending: true }).limit(300);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => toBooking(r as Record<string, unknown>));
}

/** The client's other booked days with a cart on site (for the "cart's already there" delivery rule). */
export async function otherCartDays(db: SupabaseClient, accountId: string, exceptId: string | null): Promise<string[]> {
  const { data } = await db.from("cart_club_bookings").select("id, days, carts").eq("account_id", accountId).eq("status", "booked").gt("carts", 0).limit(500);
  return ((data ?? []) as { id: string; days: ClubDay[]; carts: number }[]).filter((b) => b.id !== exceptId).flatMap((b) => (b.days ?? []).map((d) => d.date));
}

export interface QuoteInput { title: string; venue: string; address: string; notes: string; order: unknown }
type R<T> = { ok: true; data: T } | { ok: false; error: string };
const t = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

async function priced(c: ClubCtx, i: QuoteInput, exceptId: string | null) {
  const order = cleanOrder(i.order, c.account.offers);
  const problem = orderProblem(order, todayISO(c.org.timezone));
  if (problem) throw new Error(problem);
  const title = t(i.title, 200);
  if (!title) throw new Error("Give the job a name (e.g. the event or your client's name).");
  if (order.carts && !t(i.venue, 300) && !t(i.address, 400)) throw new Error("Where's the cart going? Add the venue or address.");
  const p = priceOrder(order, c.account.rates, await otherCartDays(c.db, c.account.id, exceptId));
  return { order, p, title };
}

/** Save a quote (new, or changes to one that isn't booked yet). */
export async function saveQuote(c: ClubCtx, by: { id: string | null; name: string }, id: string | null, i: QuoteInput): Promise<R<{ id: string; priced: Priced }>> {
  try {
    if (id) {
      const { data: cur } = await c.db.from("cart_club_bookings").select("status").eq("id", id).eq("account_id", c.account.id).maybeSingle();
      if (!cur) throw new Error("That quote isn't there any more.");
      if (cur.status !== "quote") throw new Error("This one is booked and locked — contact us to change it.");
    }
    const { order, p, title } = await priced(c, i, id);
    const row = {
      title, venue: t(i.venue, 300), address: t(i.address, 400), notes: t(i.notes, 4000), days: order.days, carts: order.carts, van: order.van, baristas: order.baristas,
      coffees: order.coffees, lines: p.lines, subtotal: p.subtotal, total: p.total, first_day: order.days[0].date, last_day: order.days[order.days.length - 1].date,
      updated_by_name: by.name, updated_at: new Date().toISOString(), follow_up_at: null,
    };
    const q = id
      ? c.db.from("cart_club_bookings").update(row).eq("id", id).eq("account_id", c.account.id).eq("status", "quote").select("id").single()
      : c.db.from("cart_club_bookings").insert({ ...row, organisation_id: c.org.id, account_id: c.account.id, created_by: by.id, created_by_name: by.name }).select("id").single();
    const { data, error } = await q;
    if (error) throw new Error(`Couldn't save it: ${error.message}`);
    return { ok: true, data: { id: data.id as string, priced: p } };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

/**
 * Office staff change a booking that's already booked: the booking, its job (dates, carts, venue) and the delivery runs
 * follow. An invoice already raised isn't changed — the office is told so it can be updated.
 */
export async function updateBooked(c: ClubCtx, by: { name: string }, id: string, i: QuoteInput): Promise<R<{ id: string; invoice: string | null }>> {
  try {
    const { data: cur } = await c.db.from("cart_club_bookings").select("status, event_id, invoice_id, number, invoice:invoices(number, status)").eq("id", id).eq("account_id", c.account.id).maybeSingle();
    if (!cur || cur.status !== "booked") throw new Error("That booking isn't there any more.");
    const { order, p, title } = await priced(c, i, id);
    const now = new Date().toISOString();
    const first = order.days[0];
    const { error } = await c.db.from("cart_club_bookings").update({
      title, venue: t(i.venue, 300), address: t(i.address, 400), notes: t(i.notes, 4000), days: order.days, carts: order.carts, van: order.van, baristas: order.baristas, coffees: order.coffees,
      lines: p.lines, subtotal: p.subtotal, total: p.total, first_day: first.date, last_day: order.days[order.days.length - 1].date, updated_by_name: by.name, updated_at: now,
    }).eq("id", id);
    if (error) throw new Error(error.message);
    if (cur.event_id) {
      await c.db.from("events").update({
        name: `${title} — ${c.account.name}`.slice(0, 200), event_date: first.date, start_time: first.start, finish_time: first.finish, venue: t(i.venue, 300), address: t(i.address, 400),
        fleet: { ...(order.carts ? { cart: order.carts } : {}), ...(order.van ? { van: order.van } : {}) }, fleet_dates: order.days.map((d) => d.date), crew_needed: order.baristas || null, serves: order.coffees || null,
        days: order.days.length > 1 ? order.days.map((d) => ({ date: d.date, setup: null, start: d.start, finish: d.finish })) : [], customer_notes: t(i.notes, 4000),
      }).eq("id", cur.event_id);
      try { const { syncJobCalendar } = await import("@/lib/calendar/job-sync"); await syncJobCalendar(c.db, c.org.id, cur.event_id as string, { create: true, mode: "service" }); } catch (e) { console.error("[club] job calendar", e); }
    }
    try { await syncRuns(c.db, c.org, c.account); } catch (e) { console.error("[club] runs", e); }
    const inv = cur.invoice as unknown as { number: string; status: string } | null;
    if (inv) await c.db.from("notifications").insert({ organisation_id: c.org.id, type: "club.changed", title: `Invoice ${inv.number} may need updating`.slice(0, 200), body: `${by.name} changed Cart Club booking #${cur.number} ${title} — now ${money(p.total)} inc GST`.slice(0, 140), link: `/cart-club/${c.account.id}`, entity_type: "cart_club_booking", entity_id: id }).then(() => null, () => null);
    return { ok: true, data: { id, invoice: inv?.number ?? null } };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

export async function removeQuote(c: ClubCtx, id: string): Promise<R<null>> {
  const { data, error } = await c.db.from("cart_club_bookings").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", id).eq("account_id", c.account.id).eq("status", "quote").select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "Only quotes that aren't booked can be removed — contact us about a booking." };
  return { ok: true, data: null };
}

/** Book a quote: price it again (the delivery rule may have changed), check carts are free, lock it, then job + calendar + invoice. */
export async function bookQuote(c: ClubCtx, by: { id: string | null; name: string }, id: string): Promise<R<{ invoice: string | null }>> {
  const { data: cur } = await c.db.from("cart_club_bookings").select(BOOKING_COLS).eq("id", id).eq("account_id", c.account.id).maybeSingle();
  if (!cur) return { ok: false, error: "That quote isn't there any more." };
  const b = toBooking(cur as Record<string, unknown>);
  if (b.status !== "quote") return { ok: false, error: b.status === "booked" ? `Already booked by ${b.booked_by_name ?? "your team"}.` : "That quote was removed." };
  let p: Priced;
  try { ({ p } = await priced(c, { title: b.title, venue: b.venue ?? "", address: b.address ?? "", notes: b.notes ?? "", order: b }, id)); }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }

  // Enough carts / vans free on each day?
  const ev = readEvents(c.org.rawSettings);
  const dates = b.days.map((d) => d.date);
  try {
    const { bookedUnits } = await import("@/lib/events/server");
    for (const [kind, want] of [["cart", b.carts], ["van", b.van]] as const) {
      if (!want || !ev.fleet[kind]) continue;
      const booked = await bookedUnits(c.db, c.org.id, kind, dates[0], dates[dates.length - 1]);
      const clash = dates.find((d) => (booked.get(d) ?? 0) + want > ev.fleet[kind]);
      if (clash) return { ok: false, error: `We don't have ${want > 1 ? `${want} ${ev.labels[kind].toLowerCase()}s` : `a ${ev.labels[kind].toLowerCase()}`} free on ${daysText([{ date: clash }])} — please call us and we'll sort it out.` };
    }
  } catch (e) { console.error("[club] availability", e); }

  const now = new Date().toISOString();
  const { data: locked, error } = await c.db.from("cart_club_bookings").update({ status: "booked", booked_by: by.id, booked_by_name: by.name, booked_at: now, lines: p.lines, subtotal: p.subtotal, total: p.total, updated_at: now })
    .eq("id", id).eq("status", "quote").select("id");
  if (error) return { ok: false, error: error.message };
  if (!locked?.length) return { ok: false, error: "Someone else just booked or changed this — refresh the page." };
  const booked: ClubBooking = { ...b, status: "booked", booked_by_name: by.name, booked_at: now, lines: p.lines, subtotal: p.subtotal, total: p.total };

  let invoiceNo: string | null = null;
  try {
    const eventId = await createJob(c, booked, by);
    booked.event_id = eventId;
    if (c.account.billing === "on_booking") invoiceNo = await invoiceBookings(c.db, c.org, c.account, [booked], eventId);
  } catch (e) { console.error("[club] after booking", e); await alertOffice(c, `Cart Club booking #${b.number} needs a look`, [{ label: "Problem", value: e instanceof Error ? e.message : String(e) }], booked); }
  try { await syncRuns(c.db, c.org, c.account); } catch (e) { console.error("[club] runs", e); }
  await tellBooked(c, booked, by, invoiceNo).catch((e) => console.error("[club] booked email", e));
  return { ok: true, data: { invoice: invoiceNo } };
}

const what = (b: Pick<ClubBooking, "carts" | "van" | "baristas" | "coffees">) => [
  b.carts ? `${b.carts} coffee cart${b.carts > 1 ? "s" : ""}` : "", b.van ? `${b.van} coffee van${b.van > 1 ? "s" : ""}` : "",
  b.baristas ? `${b.baristas} barista${b.baristas > 1 ? "s" : ""}` : "", b.coffees ? `${b.coffees} coffees` : "",
].filter(Boolean).join(", ");

/** The job on the office's events list and calendar (holds the carts). */
async function createJob(c: ClubCtx, b: ClubBooking, by: { id: string | null; name: string }): Promise<string> {
  let contactId: string | null = null;
  if (by.id) {
    const { data: p } = await c.db.from("cart_club_people").select("contact_id").eq("id", by.id).maybeSingle();
    contactId = (p?.contact_id as string) ?? null;
  }
  const first = b.days[0];
  const multi = b.days.length > 1;
  const services = [b.carts ? "cart" : "", b.van ? "van" : "", b.baristas ? "baristas" : ""].filter(Boolean);
  const { data: ev, error } = await c.db.from("events").insert({
    organisation_id: c.org.id, customer_id: c.account.customer_id, primary_contact_id: contactId, name: `${b.title} — ${c.account.name}`.slice(0, 200),
    event_type: "Cart Club", event_date: first.date, start_time: first.start, finish_time: first.finish, venue: b.venue, address: b.address,
    status: "confirmed", services, serves: b.coffees || null, crew_needed: b.baristas || null,
    fleet: { ...(b.carts ? { cart: b.carts } : {}), ...(b.van ? { van: b.van } : {}) }, fleet_dates: b.days.map((d) => d.date),
    days: multi ? b.days.map((d) => ({ date: d.date, setup: null, start: d.start, finish: d.finish })) : [],
    customer_notes: b.notes, internal_notes: `Booked on ${readClubSettings(c.org.rawSettings).name} by ${by.name} (#${b.number}): ${what(b)}. ${money(b.total)} inc GST.`,
  }).select("id").single();
  if (error) throw new Error(`Couldn't add the job: ${error.message}`);
  await c.db.from("cart_club_bookings").update({ event_id: ev.id }).eq("id", b.id);
  try {
    const { syncJobCalendar } = await import("@/lib/calendar/job-sync");
    await syncJobCalendar(c.db, c.org.id, ev.id as string, { create: true, mode: "service" });
  } catch (e) { console.error("[club] job calendar", e); }
  return ev.id as string;
}

/* ------------------------------------------------------------------ invoices */

const KEY_CODE: Record<PricedLine["key"], keyof ClubCodes> = { cart: "cart", van: "van", delivery: "delivery", barista: "barista", coffee: "coffee" };

/** Raise (and, when switched on, email) one invoice for these bookings. Returns its number. */
export async function invoiceBookings(db: SupabaseClient, org: PublicOrg, a: ClubAccount, bookings: ClubBooking[], eventId: string | null): Promise<string> {
  const codes = readClubSettings(org.rawSettings).codes;
  const today = todayISO(org.timezone);
  const lines = bookings.flatMap((b) => [
    ...(bookings.length > 1 || b.title ? [{ description: `${b.title} — ${daysText(b.days)}${b.venue ? ` · ${b.venue}` : ""} (booked by ${b.booked_by_name ?? "your team"})`, quantity: 1, unit_amount: 0, tax_rate: 10 as const, inc: true as const }] : []),
    ...b.lines.map((l) => ({ description: `${l.label}\n${l.note}`, quantity: l.qty, unit_amount: Math.round(l.unit * 1.1 * 100) / 100, tax_rate: 10 as const, item_code: codes[KEY_CODE[l.key]] || null, inc: true as const })),
  ]);
  const { lineTotals } = await import("@/lib/invoices/lines");
  const tot = lineTotals(lines);
  const firstDay = bookings.map((b) => b.first_day).filter(Boolean).sort()[0] ?? null;
  const due = dueDate(a.due_rule, a.due_days, today, firstDay);
  const ref = bookings.length === 1 ? `${readClubSettings(org.rawSettings).name} #${bookings[0].number} · ${bookings[0].title}` : `${readClubSettings(org.rawSettings).name} · ${bookings.length} bookings`;
  const { data: inv, error } = await db.from("invoices").insert({
    organisation_id: org.id, customer_id: a.customer_id, event_id: eventId, kind: "full", status: "awaiting_payment", issue_date: today, due_date: due,
    subtotal: tot.subtotal, tax_total: tot.tax, total: tot.total, currency: org.currency, reference: ref.slice(0, 200), line_items: lines.map((l) => ({ ...l, line_amount: Math.round(l.quantity * l.unit_amount * 100) / 100 })),
  }).select("id, number").single();
  if (error) throw new Error(`Couldn't raise the invoice: ${error.message}`);
  await db.from("cart_club_bookings").update({ invoice_id: inv.id }).in("id", bookings.map((b) => b.id));
  if (a.email_invoices) {
    try {
      const { deliverInvoice, invoiceRecipients, invoiceWords, loadInvoiceForSend } = await import("@/lib/invoices/deliver");
      const { defaultInvoiceMessage, defaultInvoiceSubject } = await import("@/lib/email/invoice-email");
      const full = await loadInvoiceForSend(db, inv.id as string);
      if (full) {
        const w = await invoiceWords(db, full, await invoiceRecipients(db, full));
        const r = await deliverInvoice(db, inv.id as string, {
          kind: "invoice", actor: `${readClubSettings(org.rawSettings).name} (automatic)`,
          subject: defaultInvoiceSubject({ businessName: w.business, invoiceNumber: full.number, eventName: bookings.length === 1 ? bookings[0].title : null }),
          message: defaultInvoiceMessage({ firstName: w.first_name === "there" ? null : w.first_name, eventName: bookings.length === 1 ? bookings[0].title : null, eventDate: null,
            dueDate: full.due_date ? w.due_date : null, amountDue: w.amount, cardPayments: org.stripeReady, senderFirstName: w.business }),
        });
        if (!r.ok) console.error("[club] invoice email", r.error);
      }
    } catch (e) { console.error("[club] invoice email", e); }
  }
  return inv.number as string;
}

/* ------------------------------------------------------------------ delivery & pickup runs on the calendar */

/** Delivery (day before, 12–4pm) and pickup (9am day after) for each run of this client's booked cart days. */
export async function syncRuns(db: SupabaseClient, org: PublicOrg, a: ClubAccount) {
  const today = todayISO(org.timezone);
  const { data: bs } = await db.from("cart_club_bookings").select("id, days, carts, venue, address, event_id, first_day").eq("account_id", a.id).eq("status", "booked").gt("carts", 0).gte("last_day", today).limit(500);
  const rows = (bs ?? []) as { id: string; days: ClubDay[]; carts: number; venue: string | null; address: string | null; event_id: string | null; first_day: string }[];
  const want = runsFor(rows.map((b) => ({ days: (b.days ?? []).map((d) => d.date), carts: b.carts })));
  const { data: have } = await db.from("cart_club_runs").select("id, starts, ends, carts, delivery_entry, pickup_entry").eq("account_id", a.id).gte("ends", today);
  const existing = (have ?? []) as { id: string; starts: string; ends: string; carts: number; delivery_entry: string | null; pickup_entry: string | null }[];
  const same = (r: (typeof existing)[number], w: (typeof want)[number]) => r.starts === w.starts && r.ends === w.ends && r.carts === w.carts;
  const stale = existing.filter((r) => !want.some((w) => same(r, w)));
  const fresh = want.filter((w) => !existing.some((r) => same(r, w)));
  if (!stale.length && !fresh.length) return;

  const { data: conn } = await db.from("calendar_connections").select("id, provider, sync_enabled, external_calendar_id").eq("organisation_id", org.id).order("is_default", { ascending: false }).order("created_at").limit(1).maybeSingle();
  if (!conn) return;
  const status = conn.provider === "google" && conn.sync_enabled ? "pending" : "local";
  let ctx: Awaited<ReturnType<typeof import("@/lib/integrations/sync-runner").buildContext>> | null = null;
  try { const { buildContext } = await import("@/lib/integrations/sync-runner"); ctx = await buildContext(db, "service", org.id, "google_calendar", null); } catch { ctx = null; }

  for (const r of stale) {
    const ids = [r.delivery_entry, r.pickup_entry].filter((x): x is string => !!x);
    if (ids.length) {
      const { data: ents } = await db.from("calendar_events").select("id, external_event_id, conn:calendar_connections(external_calendar_id)").in("id", ids);
      for (const e of (ents ?? []) as unknown as { id: string; external_event_id: string | null; conn: { external_calendar_id: string | null } | null }[]) {
        if (e.external_event_id && e.conn?.external_calendar_id && ctx) {
          try { const { deleteGoogleEvent } = await import("@/lib/integrations/google-calendar"); await deleteGoogleEvent(ctx, e.conn.external_calendar_id, e.external_event_id); } catch (err) { console.error("[club] calendar delete", err); }
        }
        await db.from("calendar_events").delete().eq("id", e.id);
      }
    }
    await db.from("cart_club_runs").delete().eq("id", r.id);
  }
  const added: string[] = [];
  for (const w of fresh) {
    const inRun = rows.filter((b) => (b.days ?? []).some((d) => d.date >= w.starts && d.date <= w.ends));
    const where = [...new Set(inRun.map((b) => b.venue || b.address).filter(Boolean))].join(" / ") || null;
    const eventId = inRun.sort((x, y) => x.first_day.localeCompare(y.first_day))[0]?.event_id ?? null;
    const carts = `${w.carts} cart${w.carts > 1 ? "s" : ""}`;
    const base = { organisation_id: org.id, calendar_connection_id: conn.id, event_id: eventId, all_day: false, location: where, kind: "setup", sync_status: status };
    const d = deliveryDay(w), p = pickupDay(w);
    const { data: de } = await db.from("calendar_events").insert({ ...base, title: `Deliver ${carts} → ${a.name} (12–4pm window)`, starts_at: zonedTimeUTC(d, "12:00", org.timezone), ends_at: zonedTimeUTC(d, "16:00", org.timezone),
      description: `Cart Club delivery for ${daysText([{ date: w.starts }])}${w.ends !== w.starts ? ` to ${daysText([{ date: w.ends }])}` : ""}. Any time 12–4pm.` }).select("id").single();
    const { data: pe } = await db.from("calendar_events").insert({ ...base, title: `Pick up ${carts} ← ${a.name}`, starts_at: zonedTimeUTC(p, "09:00", org.timezone), ends_at: zonedTimeUTC(p, "10:00", org.timezone),
      description: "Cart Club pickup, 9am." }).select("id").single();
    await db.from("cart_club_runs").insert({ organisation_id: org.id, account_id: a.id, starts: w.starts, ends: w.ends, carts: w.carts, delivery_entry: de?.id ?? null, pickup_entry: pe?.id ?? null });
    if (de?.id) added.push(de.id as string);
    if (pe?.id) added.push(pe.id as string);
  }
  if (ctx && status === "pending" && added.length) {
    try { const { pushCalendarRowsNow } = await import("@/lib/integrations/google-calendar"); await pushCalendarRowsNow(ctx, added); } catch (e) { console.error("[club] calendar push", e); }
  }
}

/* ------------------------------------------------------------------ emails */

async function personEmail(db: SupabaseClient, personId: string | null) {
  if (!personId) return null;
  const { data } = await db.from("cart_club_people").select("name, email").eq("id", personId).maybeSingle();
  return data?.email ? { name: data.name as string, email: data.email as string } : null;
}

async function tellBooked(c: ClubCtx, b: ClubBooking, by: { id: string | null; name: string }, invoiceNo: string | null) {
  const s = readClubSettings(c.org.rawSettings);
  const when = daysText(b.days);
  await alertOffice(c, `${s.name}: ${c.account.name} booked ${b.title}`, [
    { label: "When", value: when }, { label: "What", value: what(b) }, { label: "Where", value: b.venue || b.address || "—" },
    { label: "Booked by", value: by.name }, { label: "Total", value: `${money(b.total)} inc GST` }, { label: "Invoice", value: invoiceNo ?? (c.account.billing === "monthly" ? "On the month-end invoice" : "—") },
  ], b);
  const to = await personEmail(c.db, by.id);
  if (!to || !emailConfigured()) return;
  const m = clubBookedEmail(brandOf(c.org), {
    firstName: to.name.split(/\s+/)[0] || "there", club: s.name, title: b.title, when, what: what(b), total: `${money(b.total)} inc GST`, by: `${by.name}, ${fmtDateTime(b.booked_at, c.org.timezone)}`,
    url: clubUrl(c.org, c.account.slug),
    invoice: c.account.billing === "monthly" ? "It'll be on your month-end invoice." : invoiceNo ? `Your invoice ${invoiceNo} is on its way${c.account.email_invoices ? " by email" : ""}.` : "We'll send your invoice shortly.",
  });
  await sendEmail({ to: to.email, ...m, replyTo: c.org.settings.reply_to ?? c.org.contact_email ?? undefined, fromName: c.org.name, orgId: c.org.id });
}

async function alertOffice(c: ClubCtx, heading: string, lines: { label: string; value: string }[], b: ClubBooking) {
  await c.db.from("notifications").insert({ organisation_id: c.org.id, type: "club.booked", title: heading.slice(0, 200), body: `${daysText(b.days)} · ${what(b)}`.slice(0, 140), link: `/cart-club/${c.account.id}`, entity_type: "cart_club_booking", entity_id: b.id }).then(() => null, () => null);
  if (!c.org.contact_email || !emailConfigured()) return;
  const m = officeAlertEmail(brandOf(c.org), { heading, lines, url: `${appBaseUrl()}/cart-club/${c.account.id}` });
  await sendEmail({ to: c.org.contact_email, ...m, fromName: "EventureOS" }).catch(() => null);
}

/* ------------------------------------------------------------------ scheduled jobs (from the sync cron) */

/** Follow-ups for quotes under a week away, and month-end invoices for monthly clients. Quietly nothing before the 0101 update. */
export async function runClubJobs(db: SupabaseClient = createServiceClient()) {
  const out = { followUps: 0, invoices: 0, errors: [] as string[] };
  const { data: accts, error } = await db.from("cart_club_accounts").select(ACCOUNT_COLS).eq("enabled", true);
  if (error) return out;
  const orgs = new Map<string, PublicOrg>();
  for (const raw of accts ?? []) {
    const a = toAccount(raw as Record<string, unknown>);
    try {
      const org = orgs.get(a.organisation_id) ?? await orgById(db, a.organisation_id);
      orgs.set(a.organisation_id, org);
      const today = todayISO(org.timezone);
      const s = readClubSettings(org.rawSettings);
      if (a.follow_up && emailConfigured()) {
        const { data: qs } = await db.from("cart_club_bookings").select(BOOKING_COLS).eq("account_id", a.id).eq("status", "quote").is("follow_up_at", null).gte("first_day", today).limit(50);
        for (const q of (qs ?? []).map((r) => toBooking(r as Record<string, unknown>)).filter((q) => followUpDue(q, today))) {
          const { data: claimed } = await db.from("cart_club_bookings").update({ follow_up_at: new Date().toISOString() }).eq("id", q.id).is("follow_up_at", null).select("id");
          if (!claimed?.length) continue;
          const to = await personEmail(db, q.created_by);
          if (!to) continue;
          const m = clubFollowUpEmail(brandOf(org), { firstName: to.name.split(/\s+/)[0] || "there", club: s.name, title: q.title, when: daysText(q.days), url: clubUrl(org, a.slug, `?open=${q.id}`) });
          await sendEmail({ to: to.email, ...m, replyTo: org.settings.reply_to ?? org.contact_email ?? undefined, fromName: org.name, orgId: org.id });
          out.followUps++;
        }
      }
      if (a.billing === "monthly") {
        const [from, to] = lastMonth(today);
        const { data: bs } = await db.from("cart_club_bookings").select(BOOKING_COLS).eq("account_id", a.id).eq("status", "booked").is("invoice_id", null).gte("first_day", from).lte("first_day", to).order("first_day").limit(200);
        const list = (bs ?? []).map((r) => toBooking(r as Record<string, unknown>));
        if (list.length) { await invoiceBookings(db, org, a, list, null); out.invoices++; }
      }
    } catch (e) { out.errors.push(`${a.slug}: ${e instanceof Error ? e.message : String(e)}`); }
  }
  return out;
}

export const offersText = (offers: Offer[]) => offers.map((o) => OFFER_LABEL[o].toLowerCase().replace(" (with delivery)", "s")).join(", ").replace(/, ([^,]*)$/, " and $1");
