import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/integrations/runtime";
import { normOffer, offerDiscount, offerLive, offerProblem, toOffer, type Offer, type OfferPlace } from "./core";

const todayIn = (tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());

/** A code, read with whatever columns exist (works before and after the offers database update). */
export async function findOffer(db: SupabaseClient, orgId: string, code: string): Promise<Offer | null> {
  const c = normOffer(code);
  if (c.length < 2) return null;
  const { data } = await db.from("shop_coupons").select("*").eq("organisation_id", orgId).eq("code", c).maybeSingle();
  return data ? toOffer(data) : null;
}

/** How often this email has used the code on classes and gift certificates, and whether they've booked or bought before. */
async function history(db: SupabaseClient, orgId: string, email: string | null, offerId: string) {
  if (!email) return { uses: 0, orders: 0 };
  const paid = ["confirmed", "attended", "no_show"];
  const [b, g, bAll, gAll] = await Promise.all([
    db.from("bookings").select("id", { count: "exact", head: true }).eq("organisation_id", orgId).eq("contact_email", email).eq("coupon_id", offerId).in("status", paid),
    db.from("booking_gifts").select("id", { count: "exact", head: true }).eq("organisation_id", orgId).eq("purchaser_email", email).eq("coupon_id", offerId).in("status", ["active", "redeemed"]),
    db.from("bookings").select("id", { count: "exact", head: true }).eq("organisation_id", orgId).eq("contact_email", email).in("status", paid),
    db.from("booking_gifts").select("id", { count: "exact", head: true }).eq("organisation_id", orgId).eq("purchaser_email", email).in("status", ["active", "redeemed"]),
  ]);
  return { uses: (b.count ?? 0) + (g.count ?? 0), orders: (bAll.count ?? 0) + (gAll.count ?? 0) };
}

export type OfferQuote = { ok: true; offer: Offer; discount: number } | { ok: false; error: string };

/** Check a code for a class booking or a gift certificate and work out the discount. */
export async function quoteOffer(db: SupabaseClient, org: { id: string; timezone: string }, x: { code: string; place: Exclude<OfferPlace, "shop">; courseId: string | null; subtotal: number; email?: string | null }): Promise<OfferQuote> {
  const offer = await findOffer(db, org.id, x.code);
  const h = offer ? await history(db, org.id, x.email?.trim().toLowerCase() || null, offer.id) : { uses: 0, orders: 0 };
  const problem = offerProblem(offer, { today: todayIn(org.timezone), place: x.place, courseId: x.courseId, subtotal: x.subtotal, customerUses: h.uses, customerOrders: h.orders });
  if (problem || !offer) return { ok: false, error: problem ?? "That code isn't valid." };
  const discount = offerDiscount(offer, x.subtotal);
  if (discount <= 0) return { ok: false, error: "That code doesn't take anything off this." };
  return { ok: true, offer, discount };
}

/** One more use of a code (after payment). Falls back to a plain update before the database update is run. */
export async function offerUsed(db: SupabaseClient, offerId: string | null | undefined) {
  if (!offerId) return;
  const { error } = await db.rpc("offer_used", { p_coupon: offerId });
  if (error) {
    const { data } = await db.from("shop_coupons").select("uses").eq("id", offerId).maybeSingle();
    if (data) await db.from("shop_coupons").update({ uses: Number(data.uses) + 1 }).eq("id", offerId);
  }
}

/** The offer to show as a ribbon across the site right now (newest first), if any. */
export async function ribbonOffer(orgId: string, timezone: string, place: OfferPlace | null, db = createServiceClient()): Promise<Offer | null> {
  const { data, error } = await db.from("shop_coupons").select("*").eq("organisation_id", orgId).eq("active", true).eq("ribbon", true).order("updated_at", { ascending: false }).limit(10);
  if (error || !data) return null;
  const today = todayIn(timezone);
  const live = data.map(toOffer).filter((o) => offerLive(o, today));
  return (place ? live.find((o) => o.works_on.includes(place)) : null) ?? live[0] ?? null;
}

export { offerDiscount };
