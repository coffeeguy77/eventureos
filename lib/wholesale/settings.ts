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
}
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
  };
}
