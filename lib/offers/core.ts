/**
 * Offers — one set of codes for the whole site (coffee shop, barista classes, gift certificates).
 * Pure rules, no database. The codes live in shop_coupons; this reads them for classes and gift certificates.
 */

export type OfferPlace = "shop" | "classes" | "gifts";
export const PLACES: { id: OfferPlace; label: string }[] = [
  { id: "classes", label: "Classes" },
  { id: "gifts", label: "Gift certificates" },
  { id: "shop", label: "Coffee shop" },
];

export interface Offer {
  id: string; code: string; description: string | null; headline: string | null;
  kind: "percent" | "fixed" | "free_shipping"; value: number;
  works_on: OfferPlace[]; course_ids: string[];
  min_spend: number | null; max_uses: number | null; per_customer: number | null; first_order_only: boolean;
  uses: number; starts_on: string | null; ends_on: string | null; active: boolean; ribbon: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const dollars = (n: number) => `$${n.toFixed(2).replace(/\.00$/, "")}`;

/** A database row (any columns present) → Offer. Rows from before the update only work in the shop. */
export function toOffer(r: Record<string, unknown>): Offer {
  const works = Array.isArray(r.works_on) ? (r.works_on as string[]).filter((x): x is OfferPlace => x === "shop" || x === "classes" || x === "gifts") : [];
  const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
  return {
    id: String(r.id), code: String(r.code), description: (r.description as string) ?? null, headline: (r.headline as string) ?? null,
    kind: r.kind === "fixed" || r.kind === "free_shipping" ? r.kind : "percent", value: Number(r.value) || 0,
    works_on: works.length ? works : ["shop"], course_ids: Array.isArray(r.course_ids) ? (r.course_ids as string[]) : [],
    min_spend: num(r.min_spend), max_uses: num(r.max_uses), per_customer: num(r.per_customer), first_order_only: r.first_order_only === true,
    uses: Number(r.uses) || 0, starts_on: (r.starts_on as string) ?? null, ends_on: (r.ends_on as string) ?? null, active: r.active !== false, ribbon: r.ribbon === true,
  };
}

/** Is it running today (active, started, not ended, uses left)? */
export function offerLive(o: Offer, today: string) {
  return o.active && (!o.starts_on || today >= o.starts_on) && (!o.ends_on || today <= o.ends_on) && !(o.max_uses && o.uses >= o.max_uses);
}

/** Why a code can't be used on a class / gift certificate, or null when it can. */
export function offerProblem(o: Offer | null, x: { today: string; place: Exclude<OfferPlace, "shop">; courseId: string | null; subtotal: number; customerUses?: number; customerOrders?: number }): string | null {
  if (!o || !o.active) return "That code isn't valid.";
  if (!o.works_on.includes(x.place)) {
    const where = o.works_on.map((p) => (p === "shop" ? "the coffee shop" : p === "classes" ? "classes" : "gift certificates"));
    return `That code is for ${where.join(" and ")}.`;
  }
  if (o.kind === "free_shipping") return "That code is for free shipping in the coffee shop.";
  if (o.starts_on && x.today < o.starts_on) return "That code isn't active yet.";
  if (o.ends_on && x.today > o.ends_on) return "That code has expired.";
  if (o.max_uses && o.uses >= o.max_uses) return "That code has been fully used.";
  if (o.course_ids.length && (!x.courseId || !o.course_ids.includes(x.courseId))) return x.place === "gifts" ? "That code isn't for this gift." : "That code isn't for this class.";
  if (o.min_spend && x.subtotal < o.min_spend) return `Spend at least ${dollars(o.min_spend)} to use that code.`;
  if (o.per_customer && (x.customerUses ?? 0) >= o.per_customer) return "You've already used that code.";
  if (o.first_order_only && (x.customerOrders ?? 0) > 0) return "That code is for first-time customers.";
  return null;
}

/** Dollars off a subtotal (never more than the subtotal). */
export function offerDiscount(o: Offer, subtotal: number) {
  if (subtotal <= 0) return 0;
  if (o.kind === "percent") return Math.min(subtotal, round2(subtotal * Math.min(100, o.value) / 100));
  if (o.kind === "fixed") return Math.min(subtotal, round2(o.value));
  return 0;
}

/**
 * Seat price after a discount on a booking of `seats` seats. The booking stores a per-seat price, so the discount is
 * spread over the seats; the total can differ from the exact discounted total by a cent or two on fixed-dollar codes.
 */
export function discountedEach(each: number, seats: number, discount: number) {
  const total = Math.max(0, round2(each * seats - discount));
  return round2(total / Math.max(1, seats));
}

/** "15% off", "$20 off", "Free shipping" */
export function offerShort(o: Pick<Offer, "kind" | "value">) {
  return o.kind === "percent" ? `${Number(o.value)}% off` : o.kind === "fixed" ? `${dollars(Number(o.value))} off` : "Free shipping";
}

/** "barista classes and gift certificates" */
export function offerWhere(o: Pick<Offer, "works_on">, courseNames: string[] = []) {
  const parts = o.works_on.map((p) => (p === "classes" ? (courseNames.length ? courseNames.join(", ") : "classes") : p === "gifts" ? "gift certificates" : "coffee"));
  return parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} & ${parts[parts.length - 1]}`;
}

/** Where a customer claims it: the page the offer works on, with the code ready to go. */
export function offerPath(o: Pick<Offer, "works_on" | "code">, slug: string) {
  const q = `?code=${encodeURIComponent(o.code)}`;
  if (o.works_on.includes("classes")) return `/${slug}${q}`;
  if (o.works_on.includes("gifts")) return `/book/${slug}/gift${q}`;
  return `/shop/${slug}${q}`;
}

/** Codes are letters, numbers, - and _ (upper case). */
export const normOffer = (s: unknown) => (typeof s === "string" ? s.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 40) : "");

/** Plain-English conditions for the poster and the office list. */
export function offerTerms(o: Offer, courseNames: string[] = []) {
  return [
    o.course_ids.length && courseNames.length ? `For ${courseNames.join(", ")}` : null,
    o.min_spend ? `Min. spend ${dollars(o.min_spend)}` : null,
    o.first_order_only ? "First-time customers" : null,
    o.per_customer === 1 ? "One use per customer" : o.per_customer ? `${o.per_customer} uses per customer` : null,
    o.max_uses ? `Limited to ${o.max_uses} uses` : null,
    "Can't be exchanged for cash",
  ].filter((x): x is string => !!x);
}

/** "15% OFF" / "$20 OFF" / "FREE SHIPPING" for posters and ribbons. */
export const offerBig = (o: Pick<Offer, "kind" | "value">) => offerShort(o).toUpperCase();

/** Running / Scheduled / Ended / Used up / Off */
export function offerStatus(o: Offer, today: string): { label: string; tone: "live" | "soon" | "off" } {
  if (!o.active) return { label: "Off", tone: "off" };
  if (o.ends_on && today > o.ends_on) return { label: "Ended", tone: "off" };
  if (o.max_uses && o.uses >= o.max_uses) return { label: "Used up", tone: "off" };
  if (o.starts_on && today < o.starts_on) return { label: `Starts ${o.starts_on.split("-").reverse().join("/")}`, tone: "soon" };
  return { label: "Running", tone: "live" };
}
