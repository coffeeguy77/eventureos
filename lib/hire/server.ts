import type { SupabaseClient } from "@supabase/supabase-js";
import { HOLDS_STOCK, cleanImages, cleanSpecs, holdsFrom, type HireItem, type HireStatus, type Hold } from "./core";

/** Loading hire data for the back end (the caller's client, so row-level security applies). */

export const ITEM_COLS = "id, code, name, description, kind, category, subcategory, quantity, out_of_service, rates, bond, buffer_hours, companions, package_lines, image_url, weight_kg, dimensions, location, test_tag_due, service_due, notes, active, sort";
/** Product page columns (migration 0069). Until it's run, items load without them. */
export const PAGE_COLS = "images, slug, details, specs, related, seo_title, seo_description, show_online";
export type ItemRow = HireItem & {
  description: string | null; subcategory: string | null; image_url: string | null; weight_kg: number | null; dimensions: string | null;
  location: string | null; test_tag_due: string | null; service_due: string | null; notes: string | null; sort: number;
  images: string[]; slug: string | null; details: string | null; specs: { label: string; value: string }[]; related: string[];
  seo_title: string | null; seo_description: string | null; show_online: boolean;
};
let pagesReady: boolean | null = null, checkedAt = 0;
const knownMissing = () => pagesReady === false && Date.now() - checkedAt < 60_000; // re-check a minute later, in case it's just been run
const mark = (ok: boolean) => { pagesReady = ok; checkedAt = Date.now(); };
/** True once migration 0069 (product pages) has been run. */
export async function productPagesReady(db: SupabaseClient): Promise<boolean> {
  if (pagesReady) return true;
  if (knownMissing()) return false;
  const { error } = await db.from("hire_items").select("slug").limit(1);
  mark(!error);
  return !error;
}
export const missingColumn = (m: string | undefined) => !!m && /column .* does not exist|could not find .* column/i.test(m);

export function toItem(r: Record<string, unknown>): ItemRow {
  return {
    ...(r as unknown as ItemRow),
    quantity: Number(r.quantity) || 0, out_of_service: Number(r.out_of_service) || 0, bond: Number(r.bond) || 0,
    buffer_hours: r.buffer_hours == null ? null : Number(r.buffer_hours),
    rates: Array.isArray(r.rates) ? (r.rates as { unit: string; price: number }[]).map((x) => ({ unit: x.unit, price: Number(x.price) || 0 })) : [],
    companions: Array.isArray(r.companions) ? (r.companions as HireItem["companions"]) : [],
    package_lines: Array.isArray(r.package_lines) ? (r.package_lines as HireItem["package_lines"]) : [],
    images: cleanImages(Array.isArray(r.images) && r.images.length ? r.images : r.image_url ? [r.image_url] : []),
    slug: typeof r.slug === "string" && r.slug ? r.slug : null,
    details: typeof r.details === "string" ? r.details : null,
    specs: cleanSpecs(r.specs),
    related: Array.isArray(r.related) ? (r.related as unknown[]).filter((x): x is string => typeof x === "string") : [],
    seo_title: typeof r.seo_title === "string" ? r.seo_title : null,
    seo_description: typeof r.seo_description === "string" ? r.seo_description : null,
    show_online: r.show_online !== false,
  };
}

export async function loadItems(db: SupabaseClient, orgId: string, opts: { activeOnly?: boolean } = {}): Promise<ItemRow[]> {
  const run = (cols: string) => {
    let q = db.from("hire_items").select(cols).eq("organisation_id", orgId).order("category", { nullsFirst: false }).order("sort").order("name").limit(5000);
    if (opts.activeOnly) q = q.eq("active", true);
    return q;
  };
  let { data, error } = await run(knownMissing() ? ITEM_COLS : `${ITEM_COLS}, ${PAGE_COLS}`);
  if (error && missingColumn(error.message)) { mark(false); ({ data, error } = await run(ITEM_COLS)); }
  else if (!error && !knownMissing()) mark(true);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(toItem);
}

export type BookingLite = { id: string; number: string; status: HireStatus; starts_at: string; ends_at: string; customer: string };

/**
 * Stock holds overlapping [from, to) — reservations, bookings and hires out — plus quotes as pencilled-in holds.
 * `pad` widens the search so turnaround buffers either side are seen.
 */
export async function loadHolds(db: SupabaseClient, orgId: string, from: number, to: number, items: Map<string, HireItem>, opts: { exclude?: string | null; padHours?: number } = {}) {
  const pad = (opts.padHours ?? 48) * 3_600_000;
  const cols = "id, booking_id, item_id, quantity, qty_returned, booking:hire_bookings!inner(id, number, status, starts_at, ends_at, customer:customers(name))";
  const [inWindow, out] = await Promise.all([
    db.from("hire_booking_lines").select(cols).eq("organisation_id", orgId).not("item_id", "is", null)
      .in("booking.status", [...HOLDS_STOCK, "quote"])
      .lt("booking.starts_at", new Date(to + pad).toISOString())
      .gt("booking.ends_at", new Date(from - pad).toISOString())
      .limit(20000),
    // hires that are out stay out until they're checked back in, even past their return date
    db.from("hire_booking_lines").select(cols).eq("organisation_id", orgId).not("item_id", "is", null).eq("booking.status", "out").limit(20000),
  ]);
  if (inWindow.error) throw new Error(inWindow.error.message);
  if (out.error) throw new Error(out.error.message);
  type Row = { id: string; booking_id: string; item_id: string; quantity: number; qty_returned: number; booking: { id: string; number: string; status: HireStatus; starts_at: string; ends_at: string; customer: { name: string } | null } };
  const seen = new Set<string>();
  const rows = ([...(inWindow.data ?? []), ...(out.data ?? [])] as unknown as Row[]).filter((r) => r.booking_id !== opts.exclude && !seen.has(r.id) && !!seen.add(r.id));
  const now = Date.now();
  const map = (rs: Row[]) => holdsFrom(rs.map((r) => {
    const end = Date.parse(r.booking.ends_at);
    return {
      booking_id: r.booking_id, item_id: r.item_id, quantity: Number(r.quantity), qty_returned: Number(r.qty_returned) || 0,
      label: `${r.booking.number}${r.booking.customer?.name ? ` · ${r.booking.customer.name}` : ""}`, status: r.booking.status,
      start: Date.parse(r.booking.starts_at),
      // overdue: assume it's back tomorrow at the earliest
      end: r.booking.status === "out" && end < now ? now + 86_400_000 : end,
    };
  }), items);
  const holds: Hold[] = map(rows.filter((r) => r.booking.status !== "quote"));
  const pencilled: Hold[] = map(rows.filter((r) => r.booking.status === "quote"));
  return { holds, pencilled };
}

export const BOOKING_LIST_COLS = "id, number, status, title, starts_at, ends_at, fulfilment, address, delivery_at, pickup_at, total, bond, bond_status, invoice_id, quote_expires, out_at, customer:customers(id, name), lines:hire_booking_lines(name, quantity, qty_out, qty_returned, qty_damaged, item_id, line_total)";
export type BookingListRow = {
  id: string; number: string; status: HireStatus; title: string | null; starts_at: string; ends_at: string; fulfilment: "collect" | "deliver"; address: string | null;
  delivery_at: string | null; pickup_at: string | null; total: number; bond: number; bond_status: string; invoice_id: string | null; quote_expires: string | null; out_at: string | null;
  customer: { id: string; name: string } | null; lines: { name: string; quantity: number; qty_out: number; qty_returned: number; qty_damaged: number; item_id: string | null; line_total: number }[];
};
