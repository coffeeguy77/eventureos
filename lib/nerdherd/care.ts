/**
 * Care Hub (pure): prepaid update blocks, what a request costs from a block, the Google Ads add-on, and the parts of
 * the client's portal home they can show, hide and reorder. No database access, so it can be tested and used anywhere.
 */

/** A block a client can buy: hours and the discount on the hourly rate. */
export interface BlockPack { hours: number; discountPct: number }
export const DEFAULT_PACKS: BlockPack[] = [{ hours: 2, discountPct: 0 }, { hours: 5, discountPct: 5 }, { hours: 10, discountPct: 10 }];

export interface CareSettings {
  /** the blocks on sale in the portal */
  packs: BlockPack[];
  /** the Google Ads add-on's monthly management fee, ex GST (null = "ask us", no price shown) */
  adsFeeExGst: number | null;
  /** show the Care Hub (blocks, requests, versions) in the portal */
  enabled: boolean;
}

function cleanPacks(raw: unknown): BlockPack[] {
  const list = (Array.isArray(raw) ? raw : []).flatMap((x) => {
    const r = (x ?? {}) as { hours?: unknown; discount_pct?: unknown; discountPct?: unknown };
    const hours = Math.round((Number(r.hours) || 0) * 4) / 4;
    const d = Math.round(Number(r.discount_pct ?? r.discountPct) || 0);
    if (!(hours >= 0.5 && hours <= 200)) return [];
    return [{ hours, discountPct: Math.min(50, Math.max(0, d)) }];
  });
  const seen = new Set<number>();
  return list.filter((p) => (seen.has(p.hours) ? false : (seen.add(p.hours), true))).sort((a, b) => a.hours - b.hours).slice(0, 6);
}

/** Care Hub settings live in organisations.settings.nerdherd.care. */
export function readCare(settings: unknown): CareSettings {
  const n = ((settings && typeof settings === "object" ? (settings as Record<string, unknown>).nerdherd : null) ?? {}) as Record<string, unknown>;
  const c = ((n.care && typeof n.care === "object" ? n.care : {}) ?? {}) as Record<string, unknown>;
  const packs = cleanPacks(c.packs);
  const fee = Number(c.ads_fee_ex_gst);
  return {
    packs: packs.length ? packs : DEFAULT_PACKS,
    adsFeeExGst: c.ads_fee_ex_gst === null ? null : Number.isFinite(fee) && fee > 0 ? Math.round(fee * 100) / 100 : 600,
    enabled: c.enabled !== false,
  };
}

/** A pack's price ex GST at the hourly rate, after its discount (to the cent). */
export function packPrice(p: BlockPack, rateExGst: number) {
  const full = p.hours * Math.max(0, Number(rateExGst) || 0);
  const ex = Math.round(full * (1 - p.discountPct / 100) * 100) / 100;
  return { exGst: ex, incGst: Math.round(ex * 1.1 * 100) / 100, saved: Math.round((full - ex) * 100) / 100 };
}

/**
 * Minutes a request takes off the block: nothing until time is logged, then at least the minimum (1 hour by default),
 * and above that up to the next 15 minutes. Matches how quotes are charged.
 */
export function chargedMinutes(logged: number, minHours = 1): number {
  const m = Math.max(0, Math.round(Number(logged) || 0));
  if (m === 0) return 0;
  const quarter = Math.ceil(m / 15) * 15;
  return Math.max(Math.round(Math.max(0, minHours) * 60), quarter);
}

/** The block balance from paid blocks and charged minutes. Negative means the client has gone over. */
export function blockBalance(blocks: { hours: number; paid: boolean; status: string }[], usage: { minutes_charged: number }[]) {
  const boughtMin = blocks.filter((b) => b.paid && b.status === "active").reduce((a, b) => a + Math.round(Number(b.hours) * 60), 0);
  const pendingMin = blocks.filter((b) => !b.paid && b.status === "active").reduce((a, b) => a + Math.round(Number(b.hours) * 60), 0);
  const usedMin = usage.reduce((a, u) => a + Math.max(0, Number(u.minutes_charged) || 0), 0);
  return { boughtMin, usedMin, leftMin: boughtMin - usedMin, pendingMin };
}

/** "3 h 15 m left" style, for clients: hours and minutes, never negative-looking without a word. */
export function fmtHours(min: number): string {
  const m = Math.round(Math.abs(min));
  const h = Math.floor(m / 60), r = m % 60;
  const t = h && r ? `${h} h ${r} m` : h ? `${h} h` : `${r} m`;
  return min < 0 ? `${t} over` : t;
}

/* ------------------------------------------------------------------ the client's portal home */

export const HOME_TILES = ["requests", "block", "sites", "versions", "ads", "plans", "invoices"] as const;
export type HomeTile = (typeof HOME_TILES)[number];
export const TILE_LABEL: Record<HomeTile, string> = {
  requests: "Your requests", block: "Prepaid hours", sites: "Your websites & updates", versions: "Latest software versions",
  ads: "Google Ads", plans: "Plans & subscriptions", invoices: "Invoices",
};
export interface PortalPrefs { order: HomeTile[]; hidden: HomeTile[] }

/** A client's saved layout, cleaned: every tile appears once, in their order, new tiles added at the end. */
export function readPrefs(raw: unknown): PortalPrefs {
  const r = (raw && typeof raw === "object" ? raw : {}) as { order?: unknown; hidden?: unknown };
  const isTile = (x: unknown): x is HomeTile => typeof x === "string" && (HOME_TILES as readonly string[]).includes(x);
  const order = [...new Set((Array.isArray(r.order) ? r.order : []).filter(isTile))];
  for (const t of HOME_TILES) if (!order.includes(t)) order.push(t);
  const hidden = [...new Set((Array.isArray(r.hidden) ? r.hidden : []).filter(isTile))];
  return { order, hidden };
}

/* ------------------------------------------------------------------ files on requests */

export interface TicketFile { path: string; name: string; size: number; type: string }
export const MAX_FILES = 6;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export function readFiles(raw: unknown): TicketFile[] {
  return (Array.isArray(raw) ? raw : []).flatMap((x) => {
    const f = (x ?? {}) as Partial<TicketFile>;
    return typeof f.path === "string" && typeof f.name === "string" ? [{ path: f.path, name: f.name, size: Number(f.size) || 0, type: typeof f.type === "string" ? f.type : "" }] : [];
  });
}
/** A safe file name for storage: letters, numbers, dots, dashes; keeps the extension. */
export function safeName(name: string): string {
  const n = String(name || "file").normalize("NFKD").replace(/[^\w.\- ]+/g, "").trim().replace(/\s+/g, "-").slice(-80);
  return n && n !== "." ? n : "file";
}
export const fmtBytes = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** Compare dotted versions: -1, 0 or 1. Non-numeric parts count as 0. */
export function cmpVersion(a: string | null | undefined, b: string | null | undefined): number {
  const pa = String(a ?? "").split(".").map((x) => parseInt(x, 10) || 0), pb = String(b ?? "").split(".").map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] ?? 0) - (pb[i] ?? 0); if (d) return d < 0 ? -1 : 1; }
  return 0;
}
