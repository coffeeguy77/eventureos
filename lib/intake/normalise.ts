/**
 * Quote intake payload (contract v1) — what another system (e.g. a LeadPages quote form) sends to
 * POST /api/public/quote-intake. Everything is cleaned here before it reaches the database.
 * Prices are dollars, EXCLUDING GST; tax_rate is a percentage (10 = GST, 0 = GST-free).
 */
export interface IntakeItem { section: string | null; name: string; description: string | null; quantity: number; unit: string | null; unit_price: number; tax_rate: number }
export interface IntakePayload {
  external_id: string; external_version: number; stage: "submitted" | "accepted"; source_label: string | null;
  customer: { name: string | null; email: string | null; phone: string | null; company: string | null };
  event: { name: string | null; type: string | null; date: string | null; start_time: string | null; end_time: string | null; guests: number | null; venue: string | null; address: string | null };
  items: IntakeItem[];
  totals: { subtotal: number | null; gst: number | null; total: number | null };
  notes: string | null; valid_until: string | null; portal_url: string | null; accepted_by: string | null;
}

export const MAX_ITEMS = 200;
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const text = (v: unknown, max: number): string | null => {
  if (v == null || typeof v === "object") return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
};
const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const isoDate = (v: unknown) => {
  const s = text(v, 40);
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== `${m[1]}-${m[2]}-${m[3]}` ? null : `${m[1]}-${m[2]}-${m[3]}`;
};
const time = (v: unknown) => {
  const s = text(v, 20);
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/i.exec(s);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (m[3]) { if (h < 1 || h > 12) return null; h = (h % 12) + (m[3].toLowerCase() === "pm" ? 12 : 0); }
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
};
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const round2 = (n: number) => Math.round(n * 100) / 100;

export type NormaliseResult = { ok: true; payload: IntakePayload } | { ok: false; error: string; external_id: string | null };

export function normaliseIntake(raw: unknown): NormaliseResult {
  const b = obj(raw);
  const external_id = text(b.external_id, 200);
  const fail = (error: string): NormaliseResult => ({ ok: false, error, external_id });
  if (!external_id) return fail("external_id is required (your system's id for this quote)");
  const ver = num(b.external_version);
  const external_version = ver == null ? 1 : Math.trunc(ver);
  if (external_version < 1 || external_version > 1_000_000) return fail("external_version must be a whole number from 1");
  const stage = b.stage == null || b.stage === "submitted" ? "submitted" : b.stage === "accepted" ? "accepted" : null;
  if (!stage) return fail("stage must be 'submitted' or 'accepted'");

  const c = obj(b.customer);
  const email = text(c.email, 254)?.toLowerCase() ?? null;
  if (email && !EMAIL.test(email)) return fail("customer.email isn't a valid email address");
  const customer = { name: text(c.name, 200), email, phone: text(c.phone, 40), company: text(c.company, 200) };
  if (!customer.name && !customer.email) return fail("customer needs a name or an email");

  const e = obj(b.event);
  const guests = num(e.guests);
  const event = {
    name: text(e.name, 200), type: text(e.type, 80), date: isoDate(e.date), start_time: time(e.start_time), end_time: time(e.end_time),
    guests: guests != null && guests >= 0 && guests < 1_000_000 ? Math.round(guests) : null, venue: text(e.venue, 200), address: text(e.address, 500),
  };

  if (b.items != null && !Array.isArray(b.items)) return fail("items must be a list");
  const rawItems = (b.items as unknown[] | undefined) ?? [];
  if (rawItems.length > MAX_ITEMS) return fail(`Too many items (the limit is ${MAX_ITEMS})`);
  const items: IntakeItem[] = [];
  for (const [i, r] of rawItems.entries()) {
    const it = obj(r);
    const name = text(it.name, 200);
    if (!name) return fail(`items[${i}].name is required`);
    const quantity = num(it.quantity) ?? 1;
    const unit_price = num(it.unit_price);
    const tax_rate = num(it.tax_rate) ?? 10;
    if (unit_price == null) return fail(`items[${i}].unit_price is required (dollars, excluding GST)`);
    if (Math.abs(quantity) > 1_000_000 || Math.abs(unit_price) > 10_000_000) return fail(`items[${i}] has an unrealistic quantity or price`);
    if (tax_rate < 0 || tax_rate > 100) return fail(`items[${i}].tax_rate must be a percentage (10 for GST, 0 for none)`);
    items.push({ section: text(it.section, 200), name, description: text(it.description, 4000), quantity: Math.round(quantity * 1000) / 1000, unit: text(it.unit, 40), unit_price: round2(unit_price), tax_rate });
  }

  const t = obj(b.totals);
  const tv = (v: unknown) => { const n = num(v); return n == null ? null : round2(n); };
  const portal = text(b.portal_url, 1000);
  let portal_url: string | null = null;
  if (portal) { try { const u = new URL(portal); if (u.protocol === "https:" || u.protocol === "http:") portal_url = u.toString(); } catch { /* ignore */ } }

  return {
    ok: true,
    payload: {
      external_id, external_version, stage, source_label: text(b.source_label, 60), customer, event, items,
      totals: { subtotal: tv(t.subtotal), gst: tv(t.gst), total: tv(t.total) },
      notes: text(b.notes, 5000), valid_until: isoDate(b.valid_until), portal_url, accepted_by: text(b.accepted_by, 120),
    },
  };
}
