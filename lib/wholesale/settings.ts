/** The business's wholesale settings (organisations.settings.wholesale). Pure. */
export interface WholesaleSettings {
  /** 0 = Sunday … 4 = Thursday */
  deliveryWeekday: number;
  /** Read orders from another system's order emails in Gmail (e.g. Ordermentum) */
  emailImport: { enabled: boolean; from: string; subject: string; since: string | null };
  /** Ordering link: can customers order directly here */
  ordering: boolean;
  /** Freight charged on direct orders (ex GST) and the order value that makes it free (0 = never free) */
  freight: number; freeFreightOver: number;
  /** Kilos of coffee that fit in one box — sets how many box labels an order needs */
  boxKg: number;
  /** Product categories and price groups set up here (products and customers can also carry their own) */
  categories: string[]; priceGroups: string[];
}

const names = (v: unknown) => [...new Set((Array.isArray(v) ? v : []).filter((x): x is string => typeof x === "string").map((x) => x.trim().slice(0, 80)).filter(Boolean))];
/** Every name from the saved list and from what's in use, without repeats (case-insensitive), sorted. */
export const mergeNames = (...lists: (string | null | undefined)[][]) => {
  const m = new Map<string, string>();
  for (const l of lists) for (const x of l) { const t = (x ?? "").trim(); if (t && !m.has(t.toLowerCase())) m.set(t.toLowerCase(), t); }
  return [...m.values()].sort((a, b) => a.localeCompare(b));
};
export function readWholesale(settings: unknown): WholesaleSettings {
  const w = (((settings ?? {}) as Record<string, unknown>).wholesale ?? {}) as Record<string, unknown>;
  const e = (w.email_import ?? {}) as Record<string, unknown>;
  const wd = Number(w.delivery_weekday);
  const n = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v) * 100) / 100 : 0);
  return {
    deliveryWeekday: Number.isInteger(wd) && wd >= 0 && wd <= 6 ? wd : 4,
    emailImport: {
      enabled: e.enabled === true,
      from: typeof e.from === "string" && e.from.includes("@") ? e.from.trim().toLowerCase() : "notifications@ordermentum.com",
      subject: typeof e.subject === "string" && e.subject.trim() ? e.subject.trim() : "Invoice -",
      since: typeof e.since === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.since) ? e.since : null,
    },
    ordering: w.ordering === true,
    freight: n(w.freight), freeFreightOver: n(w.free_freight_over),
    boxKg: Number(w.box_kg) > 0 && Number(w.box_kg) <= 100 ? Number(w.box_kg) : 10,
    categories: names(w.categories), priceGroups: names(w.price_groups),
  };
}
