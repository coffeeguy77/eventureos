import "server-only";
import { createServiceClient } from "@/lib/integrations/runtime";
import type { TourSpace } from "@/components/sales/tour";

/**
 * What the public listing page (/for-sale/<slug>) shows. Read with the service role: anonymous visitors have no
 * access to the sale tables, so every rule about who sees what lives here.
 *  · anyone (when the page is public, or with a buyer link): the listing, the shown tour rooms, public report sections
 *  · a buyer who has signed the NDA (or one approved, when no NDA is required): buyer report sections and the sales history
 *  · revoked buyers and hidden sections: never
 */
export interface PublicBuyer { id: string; name: string; status: "invited" | "nda_signed" | "approved" | "revoked"; nda_signed_at: string | null }
export interface PublicSection { key: string; title: string; subtitle: string | null; body: string | null; bullets: string[]; table_data: Record<string, unknown>[] | null; visibility: "public" | "buyers" }
export interface PublicSale {
  listing: { id: string; organisation_id: string; unit_id: string | null; slug: string; title: string; details: Record<string, unknown>; photos: string[]; report_images: { url: string; role?: string; name?: string; caption?: string | null; primary?: boolean }[]; nda_required: boolean; nda_text: string | null; is_public: boolean };
  org: { name: string; contact_email: string | null };
  tour: TourSpace[];
  sections: PublicSection[];
  locked: { key: string; title: string; subtitle: string | null }[];
  equipment: { division: string; items: number; secondhand: number; replacement: number }[];
  buyer: PublicBuyer | null;
  unlocked: boolean;
  /** signed buyers only: Square sales (ex GST) for the last 12 full months */
  history: { month: string; sales: number; orders: number }[] | null;
}

export const DEFAULT_NDA = "I agree to keep everything I see about this business confidential: its finances, staff, suppliers, customers, lease and the fact that it is for sale. I'll use it only to decide whether to buy the business, won't share it except with my own advisers (who will keep it confidential too), won't approach its staff, suppliers or customers without the owner's written permission, and will return or delete it if asked.";

const TOKEN = /^[A-Za-z0-9_-]{20,80}$/;

/** @param preview the seller, signed in: sees the whole page as a signed buyer would, even while it's private */
export async function loadSale(slug: string, token: string | null, preview = false): Promise<PublicSale | null> {
  if (!/^[a-z0-9-]{2,80}$/i.test(slug)) return null;
  const db = createServiceClient();
  const { data: l } = await db.from("sale_listings").select("id, organisation_id, unit_id, slug, title, details, photos, report_images, tour, nda_required, nda_text, is_public").ilike("slug", slug).maybeSingle();
  if (!l) return null;
  let buyer: PublicBuyer | null = null;
  if (token && TOKEN.test(token)) {
    const { data: b } = await db.from("sale_buyers").select("id, name, status, nda_signed_at").eq("listing_id", l.id).eq("token", token).maybeSingle();
    if (b && b.status !== "revoked") buyer = b as PublicBuyer;
  }
  if (!l.is_public && !buyer && !preview) return null;
  // a buyer link opens the buyer-only part once the NDA is signed (or straight away when no NDA is required)
  const unlocked = preview || (!!buyer && (buyer.status === "approved" || buyer.status === "nda_signed" || !l.nda_required));
  const [{ data: org }, { data: secs }, { data: eq }] = await Promise.all([
    db.from("organisations").select("name, contact_email").eq("id", l.organisation_id).single(),
    db.from("sale_report_sections").select("key, title, subtitle, body, bullets, table_data, visibility, position").eq("listing_id", l.id).neq("visibility", "hidden").order("position"),
    db.from("sale_equipment").select("division, secondhand_value, replacement_cost").eq("listing_id", l.id).eq("included", true),
  ]);
  const all = ((secs ?? []) as (PublicSection & { position: number })[]).map((s) => ({ ...s, bullets: Array.isArray(s.bullets) ? s.bullets.map(String) : [], table_data: Array.isArray(s.table_data) ? s.table_data : null }));
  const has = (s: PublicSection) => !!(s.body?.trim() || s.bullets.length || s.table_data?.length);
  const sections = all.filter((s) => has(s) && (s.visibility === "public" || unlocked));
  const locked = unlocked ? [] : all.filter((s) => s.visibility === "buyers").map((s) => ({ key: s.key, title: s.title, subtitle: s.subtitle }));
  const div = new Map<string, { division: string; items: number; secondhand: number; replacement: number }>();
  for (const e of (eq ?? []) as { division: string | null; secondhand_value: number; replacement_cost: number }[]) {
    const k = e.division || "General";
    const d = div.get(k) ?? { division: k, items: 0, secondhand: 0, replacement: 0 };
    d.items += 1; d.secondhand += Number(e.secondhand_value); d.replacement += Number(e.replacement_cost);
    div.set(k, d);
  }
  const tour = ((l.tour ?? []) as TourSpace[]).filter((s) => s.enabled !== false && s.panoramaUrl)
    .map((s) => ({ ...s, pins: (s.pins ?? []).filter((p) => !(p as { requiresNDA?: boolean }).requiresNDA || unlocked) }));
  return {
    listing: { ...(l as unknown as PublicSale["listing"]), photos: (l.photos as string[]) ?? [], report_images: (l.report_images as PublicSale["listing"]["report_images"]) ?? [] },
    org: { name: (org?.name as string) ?? "", contact_email: (org?.contact_email as string | null) ?? null },
    tour, sections, locked, equipment: [...div.values()].sort((a, b) => b.secondhand - a.secondhand), buyer, unlocked,
    history: unlocked && l.unit_id ? await salesHistory(db, l.organisation_id as string, l.unit_id as string) : null,
  };
}

async function salesHistory(db: ReturnType<typeof createServiceClient>, orgId: string, unitId: string) {
  const { data: u } = await db.from("sale_units").select("square_location_ids, exclude_categories").eq("id", unitId).maybeSingle();
  const locs = (u?.square_location_ids as string[] | null) ?? [];
  if (!locs.length) return null;
  // the last 12 full calendar months (Sydney time)
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  let [y, m] = today.slice(0, 7).split("-").map(Number);
  const months: string[] = [];
  for (let i = 0; i < 12; i++) { m -= 1; if (m === 0) { m = 12; y -= 1; } months.unshift(`${y}-${String(m).padStart(2, "0")}-01`); }
  const end = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, 0)).toISOString().slice(0, 10);
  const rows: { day: string; category: string; sales: number; orders: number }[] = [];
  for (let i = 0; i < 40; i++) {
    const { data, error } = await db.rpc("sale_unit_data", { p_org: orgId, p_locs: locs, p_from: months[0], p_to: end, p_exclude: (u?.exclude_categories as string[]) ?? [] }).range(i * 1000, i * 1000 + 999);
    if (error) return null;
    rows.push(...((data ?? []) as typeof rows));
    if (!data || data.length < 1000) break;
  }
  const by = new Map(months.map((mo) => [mo, { month: mo, sales: 0, orders: 0 }]));
  for (const r of rows) {
    if (r.category !== "") continue;
    const k = `${r.day.slice(0, 7)}-01`, v = by.get(k);
    if (v) { v.sales += Number(r.sales); v.orders += Number(r.orders); }
  }
  const out = [...by.values()].map((v) => ({ ...v, sales: Math.round(v.sales) }));
  return out.some((v) => v.sales > 0) ? out : null;
}

/** A buyer opened their link: count the view. */
export async function noteBuyerView(buyerId: string) {
  const db = createServiceClient();
  const { data } = await db.from("sale_buyers").select("views, first_seen_at").eq("id", buyerId).single();
  const now = new Date().toISOString();
  await db.from("sale_buyers").update({ views: (Number(data?.views) || 0) + 1, last_seen_at: now, first_seen_at: data?.first_seen_at ?? now }).eq("id", buyerId);
}
