"use server";

import { revalidatePath } from "next/cache";
import { canManage, requireOrg } from "@/lib/context";
import { actorName, logActivity } from "@/lib/activity";
import { addDaysISO, todayISO, zonedTimeUTC } from "@/lib/format";
import {
  STATUS_LABEL, HOLDS_STOCK, bondFor, bookingTotal, chargeableHours, checkStock, cleanRates, cleanRefs, cleanUnits, companionsFor, isStatus,
  priceItem, readHireSettings, weekendDaysBetween, type HireItem, type HireSettings, type HireStatus, type Shortage,
} from "@/lib/hire/core";
import { loadHolds, loadItems } from "@/lib/hire/server";

/** Hire (back end): settings, items, bookings — live pricing and stock checks — status changes, returns and invoicing. */
export type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
const UUID = /^[0-9a-f-]{36}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const err = (e: unknown) => (e instanceof Error ? e.message : String(e));
const t = (v: unknown, n = 200) => (typeof v === "string" ? v.trim().slice(0, n) || null : null);
const money2 = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? Math.round(Math.min(10_000_000, Math.max(0, n)) * 100) / 100 : 0; };
const done = (id?: string) => { revalidatePath("/rentals", "layout"); if (id) revalidatePath(`/rentals/bookings/${id}`); };

async function office() {
  const ctx = await requireOrg();
  if (ctx.role === "staff" || ctx.role === "customer") throw new Error("You don't have access to hire.");
  return ctx;
}
async function manager() {
  const ctx = await office();
  if (!canManage(ctx.role)) throw new Error("Only owners, admins and managers can change this.");
  return ctx;
}
async function patchHire(patch: Partial<HireSettings>) {
  const { supabase, org } = await manager();
  const { data, error: e1 } = await supabase.from("organisations").select("settings").eq("id", org.id).single();
  if (e1) throw new Error(e1.message);
  const settings = (data?.settings ?? {}) as Record<string, unknown>;
  const hire = (settings.hire && typeof settings.hire === "object" ? settings.hire : {}) as Record<string, unknown>;
  const { error } = await supabase.from("organisations").update({ settings: { ...settings, hire: { ...hire, ...patch } } }).eq("id", org.id);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

/* ------------------------------------------------------------------ settings */

export async function setHireEnabled(enabled: boolean): Promise<Result> {
  try { await patchHire({ enabled: enabled === true }); return { ok: true, data: undefined }; } catch (e) { return { ok: false, error: err(e) }; }
}

export async function saveHireSettings(input: Partial<HireSettings>): Promise<Result> {
  try {
    const clean = readHireSettings({ hire: { ...input, enabled: true } });
    if (input.units) {
      const units = cleanUnits(input.units);
      if (!units.some((u) => u.hours > 0)) throw new Error("Keep at least one timed rate (like Day).");
      clean.units = units;
    }
    // only what was sent is changed (brands, item brands and the shop are saved separately)
    const patch: Record<string, unknown> = {};
    for (const k of Object.keys(input) as (keyof HireSettings)[]) if (k !== "enabled" && k !== "itemBrands") patch[k] = clean[k];
    if (input.brands) {
      const { readHireSettings: r } = await import("@/lib/hire/core");
      const { org } = await manager();
      const keys = new Set(clean.brands.map((b) => b.key));
      const current = r(org.settings).itemBrands;
      patch.itemBrands = Object.fromEntries(Object.entries(current).filter(([, v]) => keys.has(v)));
    }
    await patchHire(patch as Partial<HireSettings>);
    return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: err(e) }; }
}

/* ------------------------------------------------------------------ items */

export interface ItemInput {
  code?: string | null; name: string; description?: string | null; kind: "hire" | "sale" | "package"; category?: string | null; subcategory?: string | null;
  quantity: number; out_of_service: number; rates: unknown; bond: number; buffer_hours?: number | null; companions: unknown; package_lines: unknown;
  image_url?: string | null; weight_kg?: number | null; dimensions?: string | null; location?: string | null; test_tag_due?: string | null; service_due?: string | null;
  notes?: string | null; active: boolean;
  /** brand key (businesses with more than one trading name) */
  brand?: string | null;
}

export async function saveItem(id: string | null, input: ItemInput): Promise<Result<string>> {
  try {
    const { supabase, org, user, profile } = await manager();
    if (id && !UUID.test(id)) throw new Error("Refresh and try again.");
    const s = readHireSettings(org.settings);
    const name = t(input.name);
    if (!name) throw new Error("Give the item a name.");
    const kind = input.kind === "sale" || input.kind === "package" ? input.kind : "hire";
    const int = (v: unknown, hi = 1_000_000) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(0, n)) : 0; };
    const quantity = int(input.quantity), oos = int(input.out_of_service);
    if (kind === "hire" && oos > quantity) throw new Error("Out of service can't be more than you own.");
    const date = (v: unknown) => (typeof v === "string" && DATE.test(v) ? v : null);
    const image = t(input.image_url, 1000);
    if (image && !/^https:\/\//i.test(image) && !image.startsWith("/")) throw new Error("The image needs to be a web address starting with https://");
    const package_lines = kind === "package" ? cleanRefs<{ item_id: string; qty: number }>(input.package_lines, () => ({}), id ?? undefined) : [];
    if (kind === "package" && !package_lines.length) throw new Error("Add what's in the package.");
    const row = {
      organisation_id: org.id, code: t(input.code, 40), name, description: t(input.description, 4000), kind,
      category: t(input.category, 80), subcategory: t(input.subcategory, 80), quantity: kind === "package" ? 0 : quantity, out_of_service: kind === "hire" ? oos : 0,
      rates: cleanRates(input.rates, s.units), bond: money2(input.bond),
      buffer_hours: input.buffer_hours == null || (input.buffer_hours as unknown) === "" ? null : Math.min(24 * 14, Math.max(0, Number(input.buffer_hours) || 0)),
      companions: cleanRefs<{ item_id: string; qty: number; auto: boolean }>(input.companions, (o) => ({ auto: o.auto !== false }), id ?? undefined),
      package_lines, image_url: image, weight_kg: input.weight_kg == null || (input.weight_kg as unknown) === "" ? null : money2(input.weight_kg),
      dimensions: t(input.dimensions, 120), location: t(input.location, 80), test_tag_due: date(input.test_tag_due), service_due: date(input.service_due),
      notes: t(input.notes, 4000), active: input.active !== false, updated_at: new Date().toISOString(),
    };
    if (row.code) {
      const { data: dup } = await supabase.from("hire_items").select("id, name").eq("organisation_id", org.id).ilike("code", row.code.replace(/[%_]/g, "\\$&")).maybeSingle();
      if (dup && dup.id !== id) throw new Error(`Code ${row.code} is already used by ${dup.name}.`);
    }
    let itemId = id;
    if (id) {
      const { error } = await supabase.from("hire_items").update(row).eq("id", id).eq("organisation_id", org.id);
      if (error) throw new Error(error.message);
    } else {
      const { data, error } = await supabase.from("hire_items").insert(row).select("id").single();
      if (error) throw new Error(error.message);
      itemId = data.id as string;
      await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "hire.item_created", entityType: "hire_item", entityId: itemId, summary: `${actorName(profile)} added hire item ${name}` });
    }
    if (input.brand !== undefined && s.brands.length) {
      const key = s.brands.some((b) => b.key === input.brand) ? input.brand! : s.brands[0].key;
      const map = { ...s.itemBrands };
      if (key === s.brands[0].key) delete map[itemId!]; else map[itemId!] = key;
      await patchHire({ itemBrands: map });
    }
    done(); return { ok: true, data: itemId! };
  } catch (e) { return { ok: false, error: err(e) }; }
}

/* ------------------------------------------------------------------ bookings: pricing and checks */

export interface LineInput { id?: string | null; item_id: string | null; name: string; kind?: "hire" | "sale" | "package" | "misc"; quantity: number; unit_price?: number | null; manual?: boolean }
export interface BookingInput {
  customer_id: string; event_id?: string | null; title?: string | null;
  start_date: string; start_time: string; end_date: string; end_time: string;
  fulfilment: "collect" | "deliver"; address?: string | null; delivery_time?: string | null; pickup_time?: string | null;
  delivery_fee?: number | null; discount?: number | null; reference?: string | null; notes?: string | null; internal_notes?: string | null; quote_expires?: string | null;
  lines: LineInput[];
}
export interface PricedLine { id: string | null; item_id: string | null; name: string; kind: "hire" | "sale" | "package" | "misc"; quantity: number; unit_price: number; line_total: number; price_note: string | null; manual: boolean }
export interface Preview {
  hours: number; lines: PricedLine[]; items: number; total: number; gst: number; bond: number; deposit: number;
  shortages: Shortage[]; pencilled: { itemId: string; name: string; labels: string[] }[]; suggestions: { item_id: string; name: string; qty: number; for: string }[];
}

function windowOf(input: BookingInput, tz: string) {
  if (!DATE.test(input.start_date) || !DATE.test(input.end_date) || !TIME.test(input.start_time) || !TIME.test(input.end_time)) throw new Error("Choose when the hire starts and ends.");
  const start = Date.parse(zonedTimeUTC(input.start_date, input.start_time, tz));
  const end = Date.parse(zonedTimeUTC(input.end_date, input.end_time, tz));
  if (!(end > start)) throw new Error("The hire has to end after it starts.");
  if (end - start > 366 * 86_400_000) throw new Error("Hires can be up to a year long.");
  return { start, end };
}

function priceLines(input: BookingInput, items: Map<string, HireItem>, s: HireSettings, hours: number): PricedLine[] {
  return (input.lines ?? []).slice(0, 300).map((l): PricedLine => {
    const qty = Math.max(1, Math.min(100_000, Math.round(Number(l.quantity) || 1)));
    const it = l.item_id && UUID.test(l.item_id) ? items.get(l.item_id) : undefined;
    const id = l.id && UUID.test(l.id) ? l.id : null;
    if (!it) {
      const unit = money2(l.unit_price);
      const name = t(l.name) ?? "Item";
      return { id, item_id: null, name, kind: "misc", quantity: qty, unit_price: unit, line_total: Math.round(unit * qty * 100) / 100, price_note: null, manual: true };
    }
    const p = priceItem(it, items, s.units, hours);
    const manual = l.manual === true && l.unit_price != null && Number.isFinite(Number(l.unit_price));
    const unit = manual ? money2(l.unit_price) : p.each;
    return { id, item_id: it.id, name: t(l.name) ?? it.name, kind: it.kind, quantity: qty, unit_price: unit, line_total: Math.round(unit * qty * 100) / 100, price_note: manual ? "Price changed" : p.note, manual };
  });
}

async function compute(input: BookingInput, bookingId: string | null): Promise<{ ctx: Awaited<ReturnType<typeof office>>; s: HireSettings; items: Map<string, HireItem>; win: { start: number; end: number }; preview: Preview }> {
  const ctx = await office();
  const { supabase, org } = ctx;
  const s = readHireSettings(org.settings);
  const win = windowOf(input, org.timezone);
  const list = await loadItems(supabase, org.id);
  const items = new Map<string, HireItem>(list.map((i) => [i.id, i]));
  const hours = chargeableHours(win.start, win.end, { graceHours: s.graceHours, weekendDays: s.excludeWeekends ? weekendDaysBetween(input.start_date, input.end_date) : 0 });
  const lines = priceLines(input, items, s, hours);
  const { holds, pencilled } = await loadHolds(supabase, org.id, win.start, win.end, items, { exclude: bookingId });
  const refs = lines.map((l) => ({ itemId: l.item_id, qty: l.quantity }));
  const shortages = checkStock(refs, items, holds, win.start, win.end, s.bufferHours);
  const tot = bookingTotal(lines, money2(input.fulfilment === "deliver" ? input.delivery_fee : 0), money2(input.discount));
  // quotes that want the same items at the same time (not holding stock, but worth knowing)
  const wanted = new Set(lines.map((l) => l.item_id).filter(Boolean) as string[]);
  const pmap = new Map<string, Set<string>>();
  for (const h of pencilled) if (wanted.has(h.itemId) && h.start < win.end && h.end > win.start) { const a = pmap.get(h.itemId) ?? new Set(); a.add(h.label); pmap.set(h.itemId, a); }
  // companions not on the booking yet
  const suggestions: Preview["suggestions"] = [];
  for (const l of lines) {
    const it = l.item_id ? items.get(l.item_id) : undefined;
    if (!it) continue;
    for (const c of companionsFor(it, l.quantity, items)) if (!wanted.has(c.item.id) && !suggestions.some((x) => x.item_id === c.item.id)) suggestions.push({ item_id: c.item.id, name: c.item.name, qty: c.qty, for: it.name });
  }
  return {
    ctx, s, items, win,
    preview: {
      hours, lines, items: tot.items, total: tot.total, gst: tot.gst, bond: bondFor(refs, items, s.bondMode),
      deposit: Math.round(tot.total * s.depositPct) / 100,
      shortages, pencilled: [...pmap].map(([itemId, labels]) => ({ itemId, name: items.get(itemId)?.name ?? "", labels: [...labels] })), suggestions,
    },
  };
}

/** Live check while editing: prices, totals, bond, what's short (with who has it, when it frees up, alternatives). */
export async function previewBooking(input: BookingInput, bookingId: string | null): Promise<Result<Preview>> {
  try { return { ok: true, data: (await compute(input, bookingId && UUID.test(bookingId) ? bookingId : null)).preview }; } catch (e) { return { ok: false, error: err(e) }; }
}

const shortText = (sh: Shortage[]) => sh.map((x) => `${x.name} (need ${x.wanted}, ${x.free} free)`).join(", ");

/** Create or save a booking. Holding statuses refuse to overbook unless `allowShort` (e.g. you'll cross-hire). */
export async function saveBooking(id: string | null, input: BookingInput, opts: { status?: HireStatus; allowShort?: boolean } = {}): Promise<Result<string>> {
  try {
    if (id && !UUID.test(id)) throw new Error("Refresh and try again.");
    const { ctx, s, win, preview } = await compute(input, id);
    const { supabase, org, user, profile } = ctx;
    if (!UUID.test(input.customer_id ?? "")) throw new Error("Choose the client.");
    const { data: cust } = await supabase.from("customers").select("id, name").eq("id", input.customer_id).eq("organisation_id", org.id).maybeSingle();
    if (!cust) throw new Error("That client couldn't be found.");
    let eventId: string | null = null;
    if (input.event_id) {
      if (!UUID.test(input.event_id)) throw new Error("Choose the event again.");
      const { data: ev } = await supabase.from("events").select("id, customer_id").eq("id", input.event_id).eq("organisation_id", org.id).maybeSingle();
      if (!ev) throw new Error("That event couldn't be found.");
      eventId = ev.id as string;
    }
    if (!preview.lines.length) throw new Error("Add at least one item.");

    let status: HireStatus = "quote";
      if (id) {
      const { data } = await supabase.from("hire_bookings").select("status, bond_status").eq("id", id).eq("organisation_id", org.id).maybeSingle();
      if (!data) throw new Error("That booking couldn't be found.");
      status = (data as { status: HireStatus }).status;
    } else if (opts.status && isStatus(opts.status) && ["quote", "reservation", "booked"].includes(opts.status)) status = opts.status;
    if (HOLDS_STOCK.includes(status) && preview.shortages.length && !opts.allowShort) throw new Error(`Not enough stock: ${shortText(preview.shortages)}.`);

    const time = (d: string, v: unknown) => (typeof v === "string" && TIME.test(v) ? zonedTimeUTC(d, v, org.timezone) : null);
    const deliver = input.fulfilment === "deliver";
    const row = {
      organisation_id: org.id, customer_id: cust.id, event_id: eventId, title: t(input.title, 160),
      starts_at: new Date(win.start).toISOString(), ends_at: new Date(win.end).toISOString(),
      fulfilment: deliver ? "deliver" : "collect", address: deliver ? t(input.address, 500) : null,
      delivery_at: deliver ? time(input.start_date, input.delivery_time) : null, pickup_at: deliver ? time(input.end_date, input.pickup_time) : null,
      delivery_fee: deliver ? money2(input.delivery_fee) : 0, discount: money2(input.discount), total: preview.total, bond: preview.bond,
      reference: t(input.reference, 120), notes: t(input.notes, 4000), internal_notes: t(input.internal_notes, 4000),
      quote_expires: typeof input.quote_expires === "string" && DATE.test(input.quote_expires) ? input.quote_expires : (!id ? addDaysISO(todayISO(org.timezone), s.quoteDays) : null),
      updated_at: new Date().toISOString(),
    };
    if (deliver && !row.address) throw new Error("Add the delivery address.");
    let bookingId = id;
    if (id) {
      const { error } = await supabase.from("hire_bookings").update(row).eq("id", id).eq("organisation_id", org.id);
      if (error) throw new Error(error.message);
    } else {
      const { data, error } = await supabase.from("hire_bookings").insert({ ...row, status, created_by: user.id }).select("id, number").single();
      if (error) throw new Error(error.message);
      bookingId = data.id as string;
      await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "hire.booking_created", entityType: "hire_booking", entityId: bookingId, customerId: cust.id, eventId,
        summary: `${actorName(profile)} created hire ${STATUS_LABEL[status].toLowerCase()} ${data.number} for ${cust.name}` });
    }
    // lines: update the ones kept, add new ones, remove the rest
    const { data: old } = await supabase.from("hire_booking_lines").select("id").eq("booking_id", bookingId!);
    const keep = new Set(preview.lines.map((l) => l.id).filter(Boolean) as string[]);
    const gone = ((old ?? []) as { id: string }[]).map((o) => o.id).filter((x) => !keep.has(x));
    if (gone.length) { const { error } = await supabase.from("hire_booking_lines").delete().in("id", gone).eq("booking_id", bookingId!); if (error) throw new Error(error.message); }
    const oldIds = new Set(((old ?? []) as { id: string }[]).map((o) => o.id));
    for (const [i, l] of preview.lines.entries()) {
      const r = { organisation_id: org.id, booking_id: bookingId!, item_id: l.item_id, name: l.name, kind: l.kind, quantity: l.quantity, unit_price: l.unit_price, price_note: l.price_note, manual_price: l.manual, line_total: l.line_total, sort: i };
      const q = l.id && oldIds.has(l.id) ? supabase.from("hire_booking_lines").update(r).eq("id", l.id) : supabase.from("hire_booking_lines").insert(r);
      const { error } = await q;
      if (error) throw new Error(error.message);
    }
    done(bookingId!); return { ok: true, data: bookingId! };
  } catch (e) { return { ok: false, error: err(e) }; }
}

/* ------------------------------------------------------------------ status, returns, bond */

async function loadBooking(id: string) {
  const ctx = await office();
  if (!UUID.test(id)) throw new Error("Refresh and try again.");
  const { data, error } = await ctx.supabase.from("hire_bookings").select("id, number, status, customer_id, event_id, starts_at, ends_at, invoice_id, total, delivery_fee, discount, reference, title, customer:customers(name)").eq("id", id).eq("organisation_id", ctx.org.id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("That booking couldn't be found.");
  return { ctx, b: data as unknown as { id: string; number: string; status: HireStatus; customer_id: string; event_id: string | null; starts_at: string; ends_at: string; invoice_id: string | null; total: number; delivery_fee: number; discount: number; reference: string | null; title: string | null; customer: { name: string } | null } };
}

export async function setBookingStatus(id: string, status: HireStatus, opts: { allowShort?: boolean } = {}): Promise<Result<string>> {
  try {
    if (!isStatus(status)) throw new Error("Refresh and try again.");
    const { ctx, b } = await loadBooking(id);
    const { supabase, org, user, profile } = ctx;
    if (b.status === status) return { ok: true, data: "No change." };
    if (b.status === "returned" && status !== "out") throw new Error("This hire has been returned. Reopen it as on hire first if you need to.");
    // going to a status that holds stock: check nothing's been taken in the meantime
    if (HOLDS_STOCK.includes(status) && !HOLDS_STOCK.includes(b.status) && !opts.allowShort) {
      const list = await loadItems(supabase, org.id);
      const items = new Map<string, HireItem>(list.map((i) => [i.id, i]));
      const { data: ls } = await supabase.from("hire_booking_lines").select("item_id, quantity").eq("booking_id", b.id);
      const start = Date.parse(b.starts_at), end = Date.parse(b.ends_at);
      const { holds } = await loadHolds(supabase, org.id, start, end, items, { exclude: b.id });
      const sh = checkStock(((ls ?? []) as { item_id: string | null; quantity: number }[]).map((l) => ({ itemId: l.item_id, qty: l.quantity })), items, holds, start, end, readHireSettings(org.settings).bufferHours);
      if (sh.length) throw new Error(`Not enough stock: ${shortText(sh)}.`);
    }
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { status, updated_at: now };
    if (status === "out") patch.out_at = now;
    if (status === "returned") patch.returned_at = now;
    if (status === "cancelled") patch.cancelled_at = now;
    if (status !== "cancelled") patch.cancelled_at = null;
    const { error } = await supabase.from("hire_bookings").update(patch).eq("id", b.id).eq("organisation_id", org.id);
    if (error) throw new Error(error.message);
    if (status === "out") {
      // everything goes out unless counted otherwise
      const { data: ls } = await supabase.from("hire_booking_lines").select("id, quantity, qty_out").eq("booking_id", b.id);
      for (const l of (ls ?? []) as { id: string; quantity: number; qty_out: number }[]) if (!l.qty_out) await supabase.from("hire_booking_lines").update({ qty_out: l.quantity }).eq("id", l.id);
    }
    if (status === "returned") {
      const { data: ls } = await supabase.from("hire_booking_lines").select("id, quantity, qty_out, qty_returned, qty_damaged").eq("booking_id", b.id);
      for (const l of (ls ?? []) as { id: string; quantity: number; qty_out: number; qty_returned: number; qty_damaged: number }[]) {
        if (l.qty_returned + l.qty_damaged === 0) await supabase.from("hire_booking_lines").update({ qty_returned: l.qty_out || l.quantity }).eq("id", l.id);
      }
    }
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "hire.status", entityType: "hire_booking", entityId: b.id, customerId: b.customer_id, eventId: b.event_id,
      summary: `${actorName(profile)} moved hire ${b.number} from ${STATUS_LABEL[b.status].toLowerCase()} to ${STATUS_LABEL[status].toLowerCase()}` });
    done(b.id); return { ok: true, data: `${b.number} is now ${STATUS_LABEL[status].toLowerCase()}.` };
  } catch (e) { return { ok: false, error: err(e) }; }
}

/** Count items going out or coming back (part returns free stock straight away). */
export async function saveCounts(id: string, counts: { lineId: string; out?: number; returned?: number; damaged?: number }[]): Promise<Result<string>> {
  try {
    const { ctx, b } = await loadBooking(id);
    const { supabase } = ctx;
    const { data: ls } = await supabase.from("hire_booking_lines").select("id, quantity, qty_out").eq("booking_id", b.id);
    const lines = new Map(((ls ?? []) as { id: string; quantity: number; qty_out: number }[]).map((l) => [l.id, l]));
    const int = (v: unknown, hi: number) => Math.max(0, Math.min(hi, Math.round(Number(v) || 0)));
    let missing = 0;
    for (const c of counts.slice(0, 300)) {
      const l = lines.get(c.lineId); if (!l) continue;
      const out = c.out == null ? l.qty_out : int(c.out, l.quantity);
      const ret = int(c.returned, out), dmg = int(c.damaged, Math.max(0, out - ret));
      missing += Math.max(0, out - ret - dmg);
      const { error } = await supabase.from("hire_booking_lines").update({ qty_out: out, qty_returned: ret, qty_damaged: dmg }).eq("id", l.id);
      if (error) throw new Error(error.message);
    }
    done(b.id);
    return { ok: true, data: missing ? `Saved — ${missing} still to come back.` : "Saved — everything's accounted for." };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export async function setBondStatus(id: string, bond: "none" | "held" | "returned" | "kept"): Promise<Result> {
  try {
    if (!["none", "held", "returned", "kept"].includes(bond)) throw new Error("Refresh and try again.");
    const { ctx, b } = await loadBooking(id);
    const { error } = await ctx.supabase.from("hire_bookings").update({ bond_status: bond, updated_at: new Date().toISOString() }).eq("id", b.id);
    if (error) throw new Error(error.message);
    done(b.id); return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: err(e) }; }
}

/* ------------------------------------------------------------------ invoice, clients */

/** A draft invoice with the booking's lines (owners, admins and managers — sales can't see invoices). */
export async function createHireInvoice(id: string): Promise<Result<string>> {
  try {
    const { ctx, b } = await loadBooking(id);
    const { supabase, org, user, profile } = ctx;
    if (!canManage(ctx.role)) throw new Error("Only owners, admins and managers can raise invoices.");
    if (b.invoice_id) return { ok: true, data: b.invoice_id };
    if (b.status === "quote" || b.status === "cancelled") throw new Error("Book it first — quotes and cancelled hires aren't invoiced.");
    const { data: ls } = await supabase.from("hire_booking_lines").select("name, quantity, unit_price, line_total, price_note").eq("booking_id", b.id).order("sort");
    const fmt = (iso: string) => new Intl.DateTimeFormat("en-AU", { timeZone: org.timezone, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
    const when = `${fmt(b.starts_at)} – ${fmt(b.ends_at)}`;
    const lines = ((ls ?? []) as { name: string; quantity: number; unit_price: number; line_total: number; price_note: string | null }[]).map((l) => ({
      description: `${l.name}${l.price_note && l.price_note !== "Price changed" ? ` (${l.price_note})` : ""}`, quantity: Number(l.quantity), unit_amount: Number(l.unit_price), line_amount: Number(l.line_total),
    }));
    if (Number(b.delivery_fee) > 0) lines.push({ description: "Delivery and pick-up", quantity: 1, unit_amount: Number(b.delivery_fee), line_amount: Number(b.delivery_fee) });
    if (Number(b.discount) > 0) lines.push({ description: "Discount", quantity: 1, unit_amount: -Number(b.discount), line_amount: -Number(b.discount) });
    if (lines.length) lines[0] = { ...lines[0], description: `Hire ${b.number}: ${when}\n${lines[0].description}` };
    const total = Math.round(Number(b.total) * 100) / 100;
    if (!(total > 0)) throw new Error("This hire has no charge to invoice.");
    const subtotal = Math.round((total / 1.1) * 100) / 100;
    const today = todayISO(org.timezone);
    const terms = Math.max(0, Number((org.settings as { default_payment_terms_days?: number }).default_payment_terms_days ?? 14) || 0);
    const due = addDaysISO(today, terms);
    const { data: inv, error } = await supabase.from("invoices").insert({
      organisation_id: org.id, customer_id: b.customer_id, event_id: b.event_id, kind: "full", status: "draft", issue_date: today, due_date: due,
      subtotal, tax_total: Math.round((total - subtotal) * 100) / 100, total, currency: org.currency, reference: b.reference ? `${b.number} · ${b.reference}` : b.number,
      line_items: lines, created_by: user.id,
    }).select("id, number").single();
    if (error) throw new Error(error.message);
    await supabase.from("hire_bookings").update({ invoice_id: inv.id }).eq("id", b.id);
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "invoice.created", entityType: "invoice", entityId: inv.id as string, customerId: b.customer_id, eventId: b.event_id,
      summary: `${actorName(profile)} raised draft invoice ${inv.number} for hire ${b.number}` });
    done(b.id); revalidatePath("/invoices");
    return { ok: true, data: inv.id as string };
  } catch (e) { return { ok: false, error: err(e) }; }
}

const EMAIL = /^[^\s@<>"',;:()]+@[^\s@<>"',;:()]+\.[^\s@<>"',;:()]{2,}$/;
/** Add a client from the booking screen (an existing client with the same email is used instead). */
export async function quickClient(input: { name: string; email?: string | null; phone?: string | null; company?: string | null }): Promise<Result<{ id: string; name: string }>> {
  try {
    const { supabase, org, user, profile } = await office();
    const name = t(input.name, 160);
    if (!name) throw new Error("Add the client's name.");
    const email = t(input.email, 254)?.toLowerCase() ?? null;
    if (email && !EMAIL.test(email)) throw new Error("That email address doesn't look right.");
    if (email) {
      const { data: same } = await supabase.from("customers").select("id, name").eq("organisation_id", org.id).ilike("email", email).limit(1).maybeSingle();
      if (same) return { ok: true, data: { id: same.id as string, name: same.name as string } };
    }
    const company = t(input.company, 160);
    const { data, error } = await supabase.from("customers").insert({ organisation_id: org.id, kind: company ? "company" : "individual", name, company, email, phone: t(input.phone, 40), created_by: user.id }).select("id").single();
    if (error) throw new Error(error.message);
    const parts = (company ? "" : name).split(/\s+/).filter(Boolean);
    if (parts.length) await supabase.from("contacts").insert({ organisation_id: org.id, customer_id: data.id, first_name: parts[0], last_name: parts.slice(1).join(" ") || null, email, phone: t(input.phone, 40), is_primary: true, created_by: user.id });
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "customer.created", entityType: "customer", entityId: data.id as string, customerId: data.id as string, summary: `${actorName(profile)} added client ${name} (from a hire booking)` });
    return { ok: true, data: { id: data.id as string, name } };
  } catch (e) { return { ok: false, error: err(e) }; }
}
