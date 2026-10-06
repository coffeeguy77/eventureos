import "server-only";
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/integrations/runtime";
import { appBaseUrl } from "@/lib/integrations/registry";
import { loadStripe } from "@/lib/payments/service";
import { chargeSavedCard, createCheckout, getCheckoutSession, getPaymentIntent, StripeError, toCents, type CheckoutSession } from "@/lib/payments/stripe";
import { emailConfigured, sendEmail } from "@/lib/email/send";
import { money } from "@/lib/format";
import { brandOf, orgById, publicOrg, type PublicOrg } from "@/lib/bookings/server";
import { cleanEmail, cleanPhone, giftCode } from "@/lib/bookings/core";
import {
  addInterval, addressLine, cleanAddress, couponProblem, frequencyLabel, grindLabel, nextDispatch, prepaidDeliveries, priceCart, readShop, round2,
  type Address, type CartLine, type Coupon, type Delivery, type IntervalUnit, type Mode, type Priced, type Product, type ShopSettings, type Variant,
} from "./core";
import { shopEmail } from "./emails";

/* ------------------------------------------------------------------ setup */

export interface ShopOrg extends PublicOrg { shop: ShopSettings }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: unknown): s is string => typeof s === "string" && UUID.test(s);
/** True when the shop tables don't exist yet (database update not run). */
export const missingTable = (e: { message?: string; code?: string } | null | undefined) => !!e && (e.code === "42P01" || e.code === "PGRST205" || /relation .* does not exist|Could not find the table/i.test(e.message ?? ""));

export async function shopOrg(slug: string, db = createServiceClient()): Promise<ShopOrg | null> {
  const org = await publicOrg(slug, db);
  return org ? { ...org, shop: readShop(org.rawSettings) } : null;
}
export async function shopOrgById(db: SupabaseClient, id: string): Promise<ShopOrg> {
  const org = await orgById(db, id);
  return { ...org, shop: readShop(org.rawSettings) };
}
export const shopUrl = (o: { slug: string }, path = "") => `${appBaseUrl()}/shop/${o.slug}${path}`;
export const todayIn = (tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());

/* ------------------------------------------------------------------ catalogue */

export const PRODUCT_COLS = "id, slug, name, kind, category, short, description, tasting_notes, origin, roast, best_for, image_url, images, grinds, subscribable, featured, status, position";
const VARIANT_COLS = "id, product_id, label, grams, price, active, position";

/** Products with their sizes. Returns null when the shop tables aren't set up yet. */
export async function loadProducts(db: SupabaseClient, orgId: string, opts: { all?: boolean } = {}): Promise<Product[] | null> {
  let q = db.from("shop_products").select(PRODUCT_COLS).eq("organisation_id", orgId).order("position").order("name");
  if (!opts.all) q = q.eq("status", "active");
  const { data, error } = await q;
  if (missingTable(error)) return null;
  if (error) throw new Error(error.message);
  const ids = (data ?? []).map((p) => p.id as string);
  const { data: vs } = ids.length ? await db.from("shop_variants").select(VARIANT_COLS).in("product_id", ids).order("position") : { data: [] };
  return (data ?? []).map((p) => ({
    ...(p as unknown as Product),
    images: (p.images as string[]) ?? [], grinds: (p.grinds as string[]) ?? [],
    variants: ((vs ?? []) as unknown as Variant[]).filter((v) => v.product_id === p.id && (opts.all || v.active)).map((v) => ({ ...v, price: Number(v.price) })),
  }));
}

export interface Banner { id: string; title: string; body: string | null; cta_label: string | null; href: string | null; coupon_code: string | null; image_url: string | null; tone: string; placement: string }

export async function activeBanners(db: SupabaseClient, org: ShopOrg, placements: string[]): Promise<Banner[]> {
  const today = todayIn(org.timezone);
  const { data, error } = await db.from("shop_banners").select("id, title, body, cta_label, product_id, link_url, coupon_code, image_url, tone, placement, starts_on, ends_on, product:shop_products(slug, status)")
    .eq("organisation_id", org.id).eq("active", true).in("placement", [...placements, "everywhere"]).order("position");
  if (error) return [];
  return ((data ?? []) as unknown as (Banner & { product_id: string | null; link_url: string | null; starts_on: string | null; ends_on: string | null; product: { slug: string; status: string } | null })[])
    .filter((b) => (!b.starts_on || b.starts_on <= today) && (!b.ends_on || b.ends_on >= today))
    .map((b) => ({
      id: b.id, title: b.title, body: b.body, cta_label: b.cta_label, coupon_code: b.coupon_code, image_url: b.image_url, tone: b.tone, placement: b.placement,
      href: b.product?.status === "active" ? `/shop/${org.slug}/p/${b.product.slug}${b.coupon_code ? `?code=${encodeURIComponent(b.coupon_code)}` : ""}` : b.link_url ?? (b.coupon_code ? `/shop/${org.slug}?code=${encodeURIComponent(b.coupon_code)}` : null),
    }));
}

/* ------------------------------------------------------------------ customers */

export interface ShopCustomer { id: string; email: string; name: string | null; phone: string | null; company: string | null; stripe_customer_id: string | null; stripe_payment_method: string | null; card_label: string | null; marketing_ok: boolean }
export const CUSTOMER_COLS = "id, email, name, phone, company, stripe_customer_id, stripe_payment_method, card_label, marketing_ok";

export async function ensureCustomer(db: SupabaseClient, orgId: string, p: { email: string; name?: string | null; phone?: string | null; marketing?: boolean; source?: string }): Promise<ShopCustomer> {
  const email = p.email.toLowerCase();
  const { data: found } = await db.from("shop_customers").select(CUSTOMER_COLS).eq("organisation_id", orgId).ilike("email", email.replace(/[%_\\]/g, "\\$&")).maybeSingle();
  if (found) {
    const patch: Record<string, unknown> = {};
    if (p.name && !found.name) patch.name = p.name;
    if (p.phone && !found.phone) patch.phone = p.phone;
    if (p.marketing && !found.marketing_ok) patch.marketing_ok = true;
    if (Object.keys(patch).length) await db.from("shop_customers").update(patch).eq("id", found.id);
    return { ...(found as ShopCustomer), ...patch } as ShopCustomer;
  }
  // Link to the barista student with the same email, if there is one
  const { data: st } = await db.from("booking_students").select("id").eq("organisation_id", orgId).ilike("email", email.replace(/[%_\\]/g, "\\$&")).maybeSingle();
  const { data, error } = await db.from("shop_customers").insert({
    organisation_id: orgId, email, name: p.name ?? null, phone: p.phone ?? null, marketing_ok: !!p.marketing, student_id: st?.id ?? null, source: p.source ?? "shop",
  }).select(CUSTOMER_COLS).single();
  if (error) {
    if (/duplicate|unique/i.test(error.message)) return ensureCustomer(db, orgId, p);
    throw new Error(error.message);
  }
  return data as ShopCustomer;
}

/* ------------------------------------------------------------------ coupons */

const COUPON_COLS = "id, code, description, kind, value, applies_to, product_ids, min_spend, first_order_only, subscription_cycles, max_uses, per_customer, uses, starts_on, ends_on, active";
export const normCoupon = (s: unknown) => (typeof s === "string" ? s.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 40) : "");

export async function findCoupon(db: SupabaseClient, orgId: string, code: string): Promise<Coupon | null> {
  const c = normCoupon(code);
  if (!c) return null;
  // "*" so the newer offer columns come back when the database has them (works before and after that update)
  const { data } = await db.from("shop_coupons").select("*").eq("organisation_id", orgId).eq("code", c).maybeSingle();
  return data ? ({ ...data, value: Number(data.value), min_spend: data.min_spend === null ? null : Number(data.min_spend), product_ids: (data.product_ids as string[]) ?? [] } as Coupon) : null;
}

async function customerHistory(db: SupabaseClient, orgId: string, email: string, code: string | null) {
  const paid = ["paid", "roasting", "packed", "shipped", "completed"];
  const { data: cust } = await db.from("shop_customers").select("id").eq("organisation_id", orgId).ilike("email", email.replace(/[%_\\]/g, "\\$&")).maybeSingle();
  if (!cust) return { orders: 0, uses: 0 };
  const { count: orders } = await db.from("shop_orders").select("id", { count: "exact", head: true }).eq("customer_id", cust.id).in("status", paid);
  const { count: uses } = code ? await db.from("shop_orders").select("id", { count: "exact", head: true }).eq("customer_id", cust.id).eq("coupon_code", code).in("status", paid) : { count: 0 };
  return { orders: orders ?? 0, uses: uses ?? 0 };
}

/** Price a cart for the page (coupon checked too). */
export async function quoteCart(org: ShopOrg, input: { lines: CartLine[]; mode: Mode; delivery: Delivery; couponCode?: string | null; email?: string | null; prepaidMonths?: 3 | 6 | 12 | null; interval?: { unit: IntervalUnit; count: number } }, db = createServiceClient()) {
  const products = (await loadProducts(db, org.id)) ?? [];
  const pre = priceCart({ lines: input.lines, products, mode: input.mode, settings: org.shop, delivery: input.delivery, prepaidMonths: input.prepaidMonths, interval: input.interval });
  let coupon: Coupon | null = null, couponError: string | null = null;
  if (input.couponCode?.trim()) {
    coupon = await findCoupon(db, org.id, input.couponCode);
    const hist = input.email ? await customerHistory(db, org.id, input.email, coupon?.code ?? null) : { orders: 0, uses: 0 };
    couponError = couponProblem(coupon, { today: todayIn(org.timezone), mode: input.mode, subtotal: pre.subtotal, customerOrders: hist.orders, customerUses: hist.uses });
    // Offer codes made only for classes or gift certificates don't work in the shop
    const works = (coupon as unknown as { works_on?: string[] } | null)?.works_on;
    if (!couponError && Array.isArray(works) && works.length && !works.includes("shop")) couponError = `That code is for ${works.map((w) => (w === "classes" ? "classes" : "gift certificates")).join(" and ")}, not the coffee shop.`;
  }
  const priced = priceCart({ lines: input.lines, products, mode: input.mode, settings: org.shop, delivery: input.delivery, coupon, couponOk: !!coupon && !couponError, prepaidMonths: input.prepaidMonths, interval: input.interval });
  return { priced, coupon: coupon && !couponError ? coupon : null, couponError, products };
}

/* ------------------------------------------------------------------ events (coffee-cart customers adding beans) */

/** A quote link token (from the quote email) → the event it belongs to. */
export async function eventForQuoteToken(db: SupabaseClient, orgId: string, token: string | null | undefined) {
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const { data } = await db.rpc("quote_link_get", { p_token: token });
  const evId = (data as { event?: { id?: string } | null } | null)?.event?.id;
  if (!evId) return null;
  // The quote must belong to this business
  const { data: ev } = await db.from("events").select("id, name, event_date").eq("id", evId).eq("organisation_id", orgId).maybeSingle();
  if (!ev) return null;
  const date = ev.event_date ? new Date(`${ev.event_date}T00:00:00`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" }) : null;
  return { id: ev.id as string, name: ev.name as string, date };
}

/* ------------------------------------------------------------------ checkout */

export interface CheckoutInput {
  orgSlug: string; mode: Mode; lines: CartLine[];
  interval?: { unit: IntervalUnit; count: number }; prepaidMonths?: 3 | 6 | 12 | null; firstDate?: string | null;
  name: string; email: string; phone?: string | null; marketing?: boolean;
  delivery: Delivery; address?: unknown; note?: string | null; couponCode?: string | null; giftCode?: string | null; eventToken?: string | null;
}
export type CheckoutResult = { ok: true; redirect: string } | { ok: false; error: string };

const itemJson = (l: Priced["lines"][number]) => ({ product_id: l.productId, variant_id: l.variantId, name: l.name, variant: l.variant, grind: l.grind, adjust: l.adjust, grind_label: grindLabel(l.grind, l.adjust), qty: l.qty, unit_price: l.unit, list_price: l.base, line_total: l.total, kind: l.kind });

export async function startShopCheckout(input: CheckoutInput): Promise<CheckoutResult> {
  const db = createServiceClient();
  const org = await shopOrg(input.orgSlug, db);
  if (!org || !org.shop.enabled) return { ok: false, error: "The shop isn't open right now." };
  const name = (input.name ?? "").trim().slice(0, 120);
  const email = cleanEmail(input.email);
  const phone = input.phone ? cleanPhone(input.phone) : null;
  if (name.length < 2) return { ok: false, error: "Enter your name." };
  if (!email) return { ok: false, error: "Enter a valid email — your receipt and tracking go there." };
  if (!input.lines?.length) return { ok: false, error: "Your cart is empty." };
  const mode: Mode = input.mode === "subscription" || input.mode === "prepaid" ? input.mode : "one_off";
  const interval = { unit: (input.interval?.unit === "month" ? "month" : "week") as IntervalUnit, count: Math.max(1, Math.min(26, Math.round(input.interval?.count ?? 2))) };
  const prepaidMonths = mode === "prepaid" ? ([3, 6, 12].includes(Number(input.prepaidMonths)) ? (Number(input.prepaidMonths) as 3 | 6 | 12) : null) : null;
  if (mode === "prepaid" && !prepaidMonths) return { ok: false, error: "Choose a prepaid package." };

  // Delivery
  let delivery: Delivery = input.delivery === "pickup" ? "pickup" : input.delivery === "event" ? "event" : "post";
  if (delivery === "pickup" && !org.shop.pickup) delivery = "post";
  const ev = delivery === "event" || input.eventToken ? await eventForQuoteToken(db, org.id, input.eventToken) : null;
  if (delivery === "event" && (!ev || mode !== "one_off")) return { ok: false, error: "Delivery with your event booking is only for one-off orders from your quote link." };
  const address = delivery === "post" ? cleanAddress(input.address) : null;
  if (delivery === "post" && !address) return { ok: false, error: "Enter your delivery address (street, suburb, state and a 4-digit postcode)." };

  const { priced, coupon, couponError, products } = await quoteCart(org, { lines: input.lines, mode, delivery, couponCode: input.couponCode, email, prepaidMonths, interval }, db);
  if (couponError) return { ok: false, error: couponError };
  if (priced.problems.length) return { ok: false, error: priced.problems[0] };
  if (!priced.lines.length) return { ok: false, error: "Your cart is empty." };
  if (mode !== "one_off" && priced.lines.some((l) => l.kind === "gift_card")) return { ok: false, error: "Gift cards can't be part of a subscription." };

  // Card payments are only needed when something is owed (a gift card can cover a one-off order)
  let needsCard = mode === "subscription" || priced.total > 0;
  if (needsCard && mode !== "subscription" && input.giftCode?.trim()) {
    const { data: g } = await db.from("shop_gift_cards").select("balance, status").eq("organisation_id", org.id).eq("code", input.giftCode.trim().toUpperCase()).maybeSingle();
    if (g?.status === "active" && Number(g.balance) >= priced.total) needsCard = false;
  }
  const cfg = needsCard && org.stripeReady ? await loadStripe(db, org.id).catch(() => null) : null;
  if (needsCard && !cfg) return { ok: false, error: `${org.name} can't take card payments online right now.` };
  const customer = await ensureCustomer(db, org.id, { email, name, phone, marketing: input.marketing });
  const today = todayIn(org.timezone);
  const firstDate = input.firstDate && /^\d{4}-\d{2}-\d{2}$/.test(input.firstDate) && input.firstDate > today ? nextDispatch(input.firstDate, org.shop) : nextDispatch(today, org.shop, org.shop.leadDays);

  // Subscription (card or prepaid)
  let subId: string | null = null, parcelId: string | null = null;
  if (mode !== "one_off") {
    const deliveries = prepaidMonths ? prepaidDeliveries(prepaidMonths, interval) : null;
    const { data: sub, error } = await db.from("shop_subscriptions").insert({
      organisation_id: org.id, customer_id: customer.id, status: "pending", billing: mode === "prepaid" ? "prepaid" : "card",
      interval_unit: interval.unit, interval_count: interval.count, next_date: firstDate, discount_percent: org.shop.subDiscount,
      prepaid_deliveries: deliveries, prepaid_remaining: deliveries, prepaid_months: prepaidMonths,
      coupon_code: coupon?.code ?? null, coupon_cycles_left: coupon ? coupon.subscription_cycles : null,
    }).select("id").single();
    if (error) return { ok: false, error: error.message };
    subId = sub.id as string;
    const { data: parcel, error: pe } = await db.from("shop_parcels").insert({
      organisation_id: org.id, subscription_id: subId, label: "Home", delivery: delivery === "pickup" ? "pickup" : "post", address: address ?? {},
      items: priced.lines.map((l) => ({ variant_id: l.variantId, grind: l.grind, adjust: l.adjust, qty: l.qty })),
    }).select("id").single();
    if (pe) return { ok: false, error: pe.message };
    parcelId = parcel.id as string;
    if (address) await saveAddress(db, org.id, customer.id, address, "Home");
  } else if (address) await saveAddress(db, org.id, customer.id, address, "Home");

  // Gift card (one-off / prepaid payments only)
  let giftTaken = 0, giftId: string | null = null;
  const payable = priced.total;
  if (input.giftCode?.trim()) {
    if (mode === "subscription") return { ok: false, error: "Gift cards can be used on one-off orders and prepaid packages." };
    const { data, error } = await db.rpc("shop_take_gift", { p_org: org.id, p_code: input.giftCode, p_amount: payable });
    if (error) return { ok: false, error: error.message.replace(/^.*?ERROR:\s*/, "") };
    const row = (data as { gift_id: string; taken: number }[])[0];
    giftId = row.gift_id; giftTaken = Number(row.taken);
  }
  const due = round2(payable - giftTaken);

  // The order (first delivery, or the one-off)
  const number = await nextNumber(db, org.id);
  const kind = mode === "one_off" ? (delivery === "event" ? "event_addon" : priced.lines.every((l) => l.kind === "gift_card") ? "gift_card" : "one_off") : mode === "prepaid" ? "prepaid" : "subscription_first";
  const { data: order, error: oe } = await db.from("shop_orders").insert({
    organisation_id: org.id, number, customer_id: customer.id, subscription_id: subId, parcel_id: parcelId, event_id: ev?.id ?? null,
    status: "pending", kind, source: delivery === "event" ? "event" : "shop", email, name, phone, delivery, address: address ?? {},
    items: priced.lines.map(itemJson), subtotal: priced.subtotal, discount: round2(priced.discount * priced.deliveries), shipping: round2(priced.shipping * priced.deliveries),
    gift_amount: giftTaken, total: payable, currency: org.currency, coupon_code: coupon?.code ?? null, gift_card_id: giftId,
    customer_note: input.note?.trim().slice(0, 1000) || null, dispatch_on: priced.lines.some((l) => l.kind !== "gift_card") ? firstDate : null,
  }).select("id, view_token").single();
  if (oe) { if (giftId) await db.rpc("shop_return_gift", { p_gift: giftId, p_amount: giftTaken }); return { ok: false, error: oe.message }; }

  // Gift cards bought in this order are created now and switched on when paid
  for (const l of priced.lines.filter((x) => x.kind === "gift_card")) {
    for (let i = 0; i < l.qty; i++) await newGiftCard(db, org.id, { amount: l.base, orderId: order.id as string, purchaserName: name, purchaserEmail: email });
  }

  if (due <= 0) {
    await settleShopCheckout(db, org.id, order.id as string, null);
    return { ok: true, redirect: shopUrl(org, `/order/${order.view_token}`) };
  }
  try {
    if (!cfg) throw new Error("card payments aren't set up");
    const what = mode === "one_off" ? `Order #${number}` : mode === "prepaid" ? `${prepaidMonths}-month coffee subscription (prepaid) — order #${number}` : `Coffee subscription — first delivery, order #${number}`;
    const cs = await createCheckout(cfg.secretKey, {
      amountCents: toCents(due), currency: org.currency, name: what, description: priced.lines.map((l) => `${l.qty} × ${l.name} ${l.variant}`).join(", ").slice(0, 400), email,
      successUrl: shopUrl(org, `/order/${order.view_token}?paid=1`), cancelUrl: shopUrl(org, `/cart?cancelled=1`),
      metadata: { eventureos_shop_checkout: order.id as string, eventureos_org_id: org.id }, idempotencyKey: `shop-${order.id}`, account: cfg.account,
      saveCard: mode === "subscription" ? { customerId: customer.stripe_customer_id } : null,
    });
    if (!cs.url) throw new Error("Stripe didn't return a payment page");
    await db.from("shop_orders").update({ stripe_session_id: cs.id }).eq("id", order.id);
    return { ok: true, redirect: cs.url };
  } catch (e) {
    await db.from("shop_orders").update({ status: "cancelled", office_note: "Card payment page couldn't be opened" }).eq("id", order.id);
    if (subId) await db.from("shop_subscriptions").update({ status: "cancelled", cancel_reason: "Checkout not finished" }).eq("id", subId);
    if (giftId) await db.rpc("shop_return_gift", { p_gift: giftId, p_amount: giftTaken });
    return { ok: false, error: `Couldn't open the card payment page: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function nextNumber(db: SupabaseClient, orgId: string) {
  const { data, error } = await db.rpc("shop_next_order_number", { p_org: orgId });
  if (error) throw new Error(error.message);
  return data as number;
}

async function saveAddress(db: SupabaseClient, orgId: string, customerId: string, a: Address, label: string) {
  const { data: existing } = await db.from("shop_addresses").select("id, line1, postcode").eq("customer_id", customerId);
  if ((existing ?? []).some((x) => x.line1 === a.line1 && x.postcode === a.postcode)) return;
  await db.from("shop_addresses").insert({ organisation_id: orgId, customer_id: customerId, label: (existing ?? []).length ? (label === "Home" ? "Address" : label) : label, ...a });
}

export const newGiftCardCode = () => giftCode((n) => randomBytes(n), "BEANS");

async function newGiftCard(db: SupabaseClient, orgId: string, o: { amount: number; orderId: string | null; purchaserName: string | null; purchaserEmail: string | null; recipientName?: string | null; recipientEmail?: string | null; message?: string | null; sendOn?: string | null; status?: string; source?: string }) {
  for (let i = 0; i < 4; i++) {
    const { data, error } = await db.from("shop_gift_cards").insert({
      organisation_id: orgId, code: newGiftCardCode(), amount: o.amount, balance: o.amount, status: o.status ?? "pending", order_id: o.orderId,
      purchaser_name: o.purchaserName, purchaser_email: o.purchaserEmail, recipient_name: o.recipientName ?? null, recipient_email: o.recipientEmail ?? null,
      message: o.message ?? null, send_on: o.sendOn ?? null, source: o.source ?? "shop",
    }).select("id, code, view_token").single();
    if (!error) return data as { id: string; code: string; view_token: string };
    if (!/duplicate|unique/i.test(error.message)) throw new Error(error.message);
  }
  throw new Error("Couldn't create the gift card");
}

/* ------------------------------------------------------------------ gift cards (bags of coffee) */

export interface GiftCardInput { orgSlug: string; amount: number; purchaserName: string; purchaserEmail: string; recipientName?: string | null; recipientEmail?: string | null; message?: string | null; sendOn?: string | null; promoCode?: string | null }

export async function startGiftCardPurchase(input: GiftCardInput): Promise<CheckoutResult> {
  const db = createServiceClient();
  const org = await shopOrg(input.orgSlug, db);
  if (!org || !org.shop.enabled) return { ok: false, error: "Gift cards aren't available right now." };
  const amount = Math.round(Number(input.amount) || 0);
  if (!org.shop.giftAmounts.includes(amount)) return { ok: false, error: "Choose a gift card amount." };
  const name = input.purchaserName?.trim().slice(0, 120) ?? "";
  const email = cleanEmail(input.purchaserEmail);
  if (name.length < 2) return { ok: false, error: "Enter your name." };
  if (!email) return { ok: false, error: "Enter a valid email — the gift card is emailed to you." };
  const recipientEmail = input.recipientEmail?.trim() ? cleanEmail(input.recipientEmail) : null;
  if (input.recipientEmail?.trim() && !recipientEmail) return { ok: false, error: "The recipient's email doesn't look right." };
  const today = todayIn(org.timezone);
  const sendOn = input.sendOn && /^\d{4}-\d{2}-\d{2}$/.test(input.sendOn) && input.sendOn > today ? input.sendOn : null;
  // Offer code (one made for gift certificates): money off what they pay — the card keeps its full value
  let promo: { code: string; discount: number } | null = null;
  if (input.promoCode?.trim()) {
    const { quoteOffer } = await import("@/lib/offers/server");
    const q = await quoteOffer(db, org, { code: input.promoCode, place: "gifts", courseId: null, subtotal: amount, email });
    if (!q.ok) return { ok: false, error: q.error };
    promo = { code: q.offer.code, discount: q.discount };
  }
  const due = Math.max(0, round2(amount - (promo?.discount ?? 0)));
  const cfg = org.stripeReady ? await loadStripe(db, org.id).catch(() => null) : null;
  if (!cfg && due > 0) return { ok: false, error: `${org.name} can't take card payments online right now.` };
  const customer = await ensureCustomer(db, org.id, { email, name });
  const number = await nextNumber(db, org.id);
  const { data: order, error } = await db.from("shop_orders").insert({
    organisation_id: org.id, number, customer_id: customer.id, status: "pending", kind: "gift_card", source: "shop", email, name, delivery: "post",
    items: [{ name: "Coffee gift card", variant: money(amount, org.currency), qty: 1, unit_price: amount, list_price: amount, line_total: amount, kind: "gift_card" }],
    subtotal: amount, discount: promo?.discount ?? 0, total: due, currency: org.currency, coupon_code: promo?.code ?? null,
  }).select("id, view_token").single();
  if (error) return { ok: false, error: error.message };
  const card = await newGiftCard(db, org.id, { amount, orderId: order.id as string, purchaserName: name, purchaserEmail: email, recipientName: input.recipientName?.trim().slice(0, 120) || null, recipientEmail, message: input.message?.trim().slice(0, 600) || null, sendOn });
  if (due <= 0) {
    // Fully covered by the code: nothing to pay, so it's ready now
    await settleShopCheckout(db, org.id, order.id as string, null);
    return { ok: true, redirect: shopUrl(org, `/gift-card/${card.view_token}?paid=1`) };
  }
  try {
    const cs = await createCheckout(cfg!.secretKey, {
      amountCents: toCents(due), currency: org.currency, name: `Coffee gift card — ${money(amount, org.currency)}`, description: [input.recipientName?.trim() ? `For ${input.recipientName.trim()}` : `${org.name} gift card`, promo ? `${promo.code} −${money(promo.discount, org.currency, { cents: true })}` : null].filter(Boolean).join(" · "), email,
      successUrl: shopUrl(org, `/gift-card/${card.view_token}?paid=1`), cancelUrl: shopUrl(org, "/gift-card"),
      metadata: { eventureos_shop_checkout: order.id as string, eventureos_org_id: org.id }, idempotencyKey: `shopgift-${order.id}`, account: cfg!.account,
    });
    if (!cs.url) throw new Error("Stripe didn't return a payment page");
    await db.from("shop_orders").update({ stripe_session_id: cs.id }).eq("id", order.id);
    return { ok: true, redirect: cs.url };
  } catch (e) {
    await db.from("shop_orders").update({ status: "cancelled" }).eq("id", order.id);
    await db.from("shop_gift_cards").update({ status: "void" }).eq("id", card.id);
    return { ok: false, error: `Couldn't open the card payment page: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export async function giftCardByToken(token: string, db = createServiceClient()) {
  if (!/^[0-9a-f]{48}$/.test(token)) return null;
  const { data } = await db.from("shop_gift_cards").select("id, organisation_id, code, amount, balance, status, purchaser_name, recipient_name, message, expires_on, order_id").eq("view_token", token).maybeSingle();
  return data as { id: string; organisation_id: string; code: string; amount: number; balance: number; status: string; purchaser_name: string | null; recipient_name: string | null; message: string | null; expires_on: string | null; order_id: string | null } | null;
}

/* ------------------------------------------------------------------ settling a payment */

/** Called by the Stripe webhook, by the return page (if the webhook is slow), or straight away when nothing was due. Safe to call twice. */
export async function settleShopCheckout(db: SupabaseClient, orgId: string, orderId: string, s: (CheckoutSession & { id: string }) | null): Promise<string> {
  const { data: o } = await db.from("shop_orders").select("id, status, number, subscription_id, coupon_code, customer_id, total, gift_amount, email, kind").eq("id", orderId).eq("organisation_id", orgId).maybeSingle();
  if (!o) return "shop order not found";
  if (o.status !== "pending") return "already settled";
  const org = await shopOrgById(db, orgId);
  const now = new Date().toISOString();
  const { data: upd } = await db.from("shop_orders").update({ status: "paid", paid_at: now, stripe_session_id: s?.id ?? null, stripe_payment_intent: s?.payment_intent ?? null })
    .eq("id", orderId).eq("status", "pending").select("id");
  if (!upd?.length) return "already settled";
  if (o.coupon_code) {
    const { data: c } = await db.from("shop_coupons").select("id, uses").eq("organisation_id", orgId).eq("code", o.coupon_code).maybeSingle();
    if (c) await db.from("shop_coupons").update({ uses: (c.uses as number) + 1 }).eq("id", c.id);
  }
  // Remember the card for later deliveries
  if (s?.payment_intent && o.customer_id) {
    try {
      const cfg = await loadStripe(db, orgId);
      if (cfg) {
        const pi = await getPaymentIntent(cfg.secretKey, s.payment_intent, cfg.account);
        const pm = typeof pi.payment_method === "object" && pi.payment_method ? pi.payment_method : null;
        const patch: Record<string, unknown> = {};
        if (pi.customer) patch.stripe_customer_id = pi.customer;
        if (pm?.id && o.subscription_id) { patch.stripe_payment_method = pm.id; patch.card_label = pm.card?.last4 ? `${(pm.card.brand ?? "Card").replace(/^\w/, (x) => x.toUpperCase())} •••• ${pm.card.last4}` : "Card on file"; }
        if (Object.keys(patch).length) await db.from("shop_customers").update(patch).eq("id", o.customer_id);
      }
    } catch (e) { console.error("[shop] saving card:", e); }
  }
  if (o.subscription_id) {
    const { data: sub } = await db.from("shop_subscriptions").select("id, interval_unit, interval_count, next_date, billing, prepaid_remaining, coupon_cycles_left").eq("id", o.subscription_id).maybeSingle();
    if (sub) {
      const next = nextDispatch(addInterval(sub.next_date as string, sub.interval_unit as IntervalUnit, sub.interval_count as number), org.shop);
      await db.from("shop_subscriptions").update({
        status: "active", deliveries_made: 1, next_date: next, failed_attempts: 0, last_error: null,
        prepaid_remaining: sub.billing === "prepaid" ? Math.max(0, ((sub.prepaid_remaining as number) ?? 1) - 1) : null,
        coupon_cycles_left: sub.coupon_cycles_left === null ? null : Math.max(0, (sub.coupon_cycles_left as number) - 1),
      }).eq("id", sub.id);
    }
  }
  // Gift cards in this order
  const { data: cards } = await db.from("shop_gift_cards").select("id").eq("order_id", orderId).eq("status", "pending");
  for (const c of cards ?? []) {
    const exp = new Date(); exp.setMonth(exp.getMonth() + org.shop.giftExpiryMonths);
    await db.from("shop_gift_cards").update({ status: "active", expires_on: exp.toISOString().slice(0, 10) }).eq("id", c.id);
    await deliverGiftCard(db, org, c.id as string, true).catch((e) => console.error("[shop] gift card email:", e));
  }
  await sendOrderEmails(db, org, orderId).catch((e) => console.error("[shop] order email:", e));
  await db.from("activity_logs").insert({ organisation_id: orgId, actor_type: "system", actor_label: "Shop", action: "shop.order_paid", entity_type: "shop_order", entity_id: orderId, summary: `Shop order #${o.number} paid (${money(o.total, org.currency)})` }).then(() => null, () => null);
  return `shop order #${o.number} paid`;
}

/** Return page: if Stripe says it's paid but the webhook hasn't arrived yet, settle now. */
export async function settleFromReturn(orgId: string, orderId: string, sessionId: string | null) {
  if (!sessionId) return;
  const db = createServiceClient();
  const cfg = await loadStripe(db, orgId).catch(() => null);
  if (!cfg) return;
  try {
    const s = await getCheckoutSession(cfg.secretKey, sessionId, cfg.account);
    if (s.payment_status === "paid" && s.metadata?.eventureos_shop_checkout === orderId) await settleShopCheckout(db, orgId, orderId, s as CheckoutSession & { id: string });
  } catch (e) { console.error("[shop] settle from return:", e); }
}

/* ------------------------------------------------------------------ emails */

async function safeSend(org: ShopOrg, m: { to: string; subject: string; html: string; text: string }) {
  if (!emailConfigured()) return;
  try { await sendEmail({ ...m, replyTo: org.settings.reply_to ?? org.contact_email, fromName: org.name }); } catch (e) { console.error("[shop] email:", e); }
}

async function sendOrderEmails(db: SupabaseClient, org: ShopOrg, orderId: string) {
  const { data: o } = await db.from("shop_orders").select("number, email, name, items, subtotal, discount, shipping, gift_amount, total, delivery, address, dispatch_on, kind, view_token, subscription_id").eq("id", orderId).single();
  if (!o?.email || o.kind === "gift_card") return;
  const items = (o.items as { name: string; variant: string; grind_label: string | null; qty: number; line_total: number }[]) ?? [];
  const m = shopEmail(brandOf(org), {
    heading: `Thanks${o.name ? `, ${String(o.name).split(/\s+/)[0]}` : ""} — order #${o.number} is confirmed`,
    intro: [o.subscription_id ? "Your coffee subscription is set up. You can pause, skip, change your coffee or address any time from your account." : "We've got your order.", org.shop.roastNote].filter(Boolean),
    rows: [
      ...items.map((i) => ({ label: `${i.qty} × ${i.name} ${i.variant}`, value: `${i.grind_label ? `${i.grind_label} · ` : ""}${money(i.line_total, org.currency)}` })),
      ...(Number(o.discount) > 0 ? [{ label: "Discount", value: `−${money(o.discount, org.currency)}` }] : []),
      { label: "Shipping", value: Number(o.shipping) > 0 ? money(o.shipping, org.currency) : o.delivery === "pickup" ? "Pick up" : o.delivery === "event" ? "With your event" : "Free" },
      ...(Number(o.gift_amount) > 0 ? [{ label: "Gift card", value: `−${money(o.gift_amount, org.currency)}` }] : []),
      { label: "Total", value: money(Number(o.total) - Number(o.gift_amount), org.currency) },
      ...(o.dispatch_on ? [{ label: o.delivery === "pickup" ? "Ready from" : "Ships", value: new Date(`${o.dispatch_on}T00:00:00`).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" }) }] : []),
      ...(o.delivery === "post" ? [{ label: "Deliver to", value: addressLine(o.address as Address) }] : []),
    ],
    buttons: [{ label: "View your order", url: shopUrl(org, `/order/${o.view_token}`) }, ...(o.subscription_id ? [{ label: "Manage subscription", url: shopUrl(org, "/account") }] : [])],
  });
  await safeSend(org, { to: o.email as string, subject: `Order #${o.number} confirmed — ${org.name}`, html: m.html, text: m.text });
  const office = org.settings.reply_to ?? org.contact_email;
  if (office) {
    const a = shopEmail(brandOf(org), { heading: `New ${o.subscription_id ? "subscription" : "order"} #${o.number}`, intro: [`${o.name ?? o.email} — ${money(o.total, org.currency)}`], rows: items.map((i) => ({ label: `${i.qty} × ${i.name} ${i.variant}`, value: i.grind_label ?? "" })), buttons: [{ label: "Open in EventureOS", url: `${appBaseUrl()}/store` }] });
    await safeSend(org, { to: office, subject: `New shop order #${o.number} — ${o.name ?? o.email}`, html: a.html, text: a.text });
  }
}

export async function deliverGiftCard(db: SupabaseClient, org: ShopOrg, cardId: string, toPurchaser: boolean) {
  const { data: g } = await db.from("shop_gift_cards").select("id, code, amount, purchaser_name, purchaser_email, recipient_name, recipient_email, message, send_on, sent_at, expires_on, view_token").eq("id", cardId).single();
  if (!g) return;
  const view = shopUrl(org, `/gift-card/${g.view_token}`);
  const today = todayIn(org.timezone);
  const body = (to: "purchaser" | "recipient") => shopEmail(brandOf(org), {
    heading: to === "recipient" ? `${g.purchaser_name ?? "Someone"} sent you a ${money(g.amount, org.currency)} coffee gift card` : `Your ${money(g.amount, org.currency)} coffee gift card`,
    intro: [to === "recipient" ? `Use it on freshly roasted coffee from ${org.name}.` : g.recipient_email && g.send_on && g.send_on > today ? `We'll email it to ${g.recipient_name ?? g.recipient_email} on ${g.send_on}.` : "Here it is — print it, forward it, or share the link.", ...(g.message ? [`“${g.message}”`] : [])],
    big: g.code as string,
    rows: [{ label: "Value", value: money(g.amount, org.currency) }, ...(g.expires_on ? [{ label: "Use by", value: g.expires_on as string }] : [])],
    buttons: [{ label: "View gift card", url: view }, { label: "Shop coffee", url: shopUrl(org) }],
  });
  if (toPurchaser && g.purchaser_email) { const m = body("purchaser"); await safeSend(org, { to: g.purchaser_email as string, subject: `Your coffee gift card — ${org.name}`, html: m.html, text: m.text }); }
  if (g.recipient_email && !g.sent_at && (!g.send_on || g.send_on <= today)) {
    const m = body("recipient");
    await safeSend(org, { to: g.recipient_email as string, subject: `A coffee gift card from ${g.purchaser_name ?? org.name}`, html: m.html, text: m.text });
    await db.from("shop_gift_cards").update({ sent_at: new Date().toISOString() }).eq("id", g.id);
  }
}

/* ------------------------------------------------------------------ subscriptions */

export interface ParcelItem { variant_id: string; grind: string | null; adjust: number; qty: number }
export interface SubView {
  id: string; status: string; billing: string; interval_unit: IntervalUnit; interval_count: number; next_date: string | null; paused_until: string | null;
  discount_percent: number; prepaid_remaining: number | null; prepaid_deliveries: number | null; prepaid_months: number | null; deliveries_made: number;
  coupon_code: string | null; last_error: string | null; woo_id: number | null; created_at: string; customer_id: string;
  parcels: { id: string; label: string; delivery: string; address: Address | Record<string, never>; items: ParcelItem[]; position: number }[];
}
export const SUB_COLS = "id, status, billing, interval_unit, interval_count, next_date, paused_until, discount_percent, prepaid_remaining, prepaid_deliveries, prepaid_months, deliveries_made, coupon_code, last_error, woo_id, created_at, customer_id";

export async function loadSubs(db: SupabaseClient, orgId: string, filter: { customerId?: string; ids?: string[] }): Promise<SubView[]> {
  let q = db.from("shop_subscriptions").select(SUB_COLS).eq("organisation_id", orgId).order("created_at", { ascending: false });
  if (filter.customerId) q = q.eq("customer_id", filter.customerId);
  if (filter.ids) q = q.in("id", filter.ids);
  const { data } = await q;
  const ids = (data ?? []).map((s) => s.id as string);
  const { data: parcels } = ids.length ? await db.from("shop_parcels").select("id, subscription_id, label, delivery, address, items, position").in("subscription_id", ids).order("position") : { data: [] };
  return (data ?? []).map((s) => ({
    ...(s as unknown as SubView), discount_percent: Number(s.discount_percent),
    parcels: ((parcels ?? []) as (SubView["parcels"][number] & { subscription_id: string })[]).filter((p) => p.subscription_id === s.id),
  }));
}

/** Price of one delivery of a subscription (all parcels). */
export function subDelivery(sub: Pick<SubView, "parcels" | "discount_percent" | "billing">, products: Product[], s: ShopSettings, coupon: Coupon | null) {
  const settings = { ...s, subDiscount: sub.discount_percent };
  const per = sub.parcels.map((p) => priceCart({ lines: p.items.map((i) => ({ variantId: i.variant_id, grind: i.grind, adjust: i.adjust ?? 0, qty: i.qty })), products, mode: "subscription", settings, delivery: p.delivery === "pickup" ? "pickup" : "post", coupon, couponOk: !!coupon }));
  return { parcels: per, total: round2(per.reduce((a, p) => a + p.perDelivery, 0)) };
}

type SubAction =
  | { type: "pause"; until: string | null } | { type: "resume" } | { type: "skip" } | { type: "sooner" } | { type: "cancel"; reason: string | null }
  | { type: "frequency"; unit: IntervalUnit; count: number } | { type: "next_date"; date: string }
  | { type: "parcel"; parcelId: string; label?: string; delivery?: "post" | "pickup"; address?: unknown; items?: ParcelItem[] }
  | { type: "add_parcel"; label: string; address: unknown; items: ParcelItem[] } | { type: "remove_parcel"; parcelId: string }
  | { type: "reactivate" };

/** Every change a customer (or the office) can make to a subscription. `by` is shown in the activity log. */
export async function changeSubscription(db: SupabaseClient, org: ShopOrg, subId: string, a: SubAction, by: { customerId?: string; office?: string }): Promise<string> {
  let q = db.from("shop_subscriptions").select(SUB_COLS).eq("organisation_id", org.id).eq("id", subId);
  if (by.customerId) q = q.eq("customer_id", by.customerId);
  const { data: sub } = await q.maybeSingle();
  if (!sub) throw new Error("Subscription not found.");
  const today = todayIn(org.timezone);
  const unit = sub.interval_unit as IntervalUnit, count = sub.interval_count as number;
  const woo = sub.billing === "woocommerce";
  const set = async (patch: Record<string, unknown>) => { const { error } = await db.from("shop_subscriptions").update(patch).eq("id", subId); if (error) throw new Error(error.message); };
  const products = (await loadProducts(db, org.id)) ?? [];
  const cleanItems = (items: ParcelItem[] | undefined) => {
    const ok = (items ?? []).map((i) => {
      const p = products.find((x) => x.variants.some((v) => v.id === i.variant_id));
      if (!p || p.kind !== "coffee" || !p.subscribable) return null;
      return { variant_id: i.variant_id, grind: p.grinds.length ? (p.grinds.includes(i.grind ?? "") ? i.grind : p.grinds[0]) : null, adjust: Math.max(-2, Math.min(2, Math.round(i.adjust || 0))), qty: Math.max(1, Math.min(20, Math.round(i.qty) || 1)) };
    }).filter((x): x is ParcelItem => !!x);
    if (!ok.length) throw new Error("Add at least one coffee.");
    return ok.slice(0, 12);
  };
  if (sub.status === "cancelled" && a.type !== "reactivate") throw new Error("This subscription is cancelled.");
  let msg = "Saved.";
  switch (a.type) {
    case "pause": {
      const until = a.until && /^\d{4}-\d{2}-\d{2}$/.test(a.until) && a.until > today ? a.until : null;
      await set({ status: "paused", paused_until: until });
      msg = until ? `Paused until ${until}.` : "Paused — resume whenever you like.";
      break;
    }
    case "resume": {
      const next = !sub.next_date || sub.next_date <= today ? nextDispatch(today, org.shop, org.shop.leadDays) : (sub.next_date as string);
      await set({ status: "active", paused_until: null, next_date: next });
      msg = `Resumed — next delivery ships ${next}.`;
      break;
    }
    case "skip": {
      const next = nextDispatch(addInterval((sub.next_date as string) ?? today, unit, count), org.shop);
      await set({ next_date: next });
      msg = `Skipped — next delivery ships ${next}.`;
      break;
    }
    case "sooner": {
      const next = nextDispatch(today, org.shop, org.shop.leadDays);
      await set({ next_date: next, status: sub.status === "paused" ? "active" : sub.status, paused_until: null });
      msg = `Moved up — ships ${next}.`;
      break;
    }
    case "next_date": {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(a.date) || a.date <= today) throw new Error("Choose a date after today.");
      const next = nextDispatch(a.date, org.shop);
      await set({ next_date: next });
      msg = `Next delivery ships ${next}.`;
      break;
    }
    case "frequency": {
      const c = Math.max(1, Math.min(26, Math.round(a.count)));
      if (a.unit !== "week" && a.unit !== "month") throw new Error("Choose a frequency.");
      await set({ interval_unit: a.unit, interval_count: c });
      msg = `${frequencyLabel(a.unit, c)} from now on.`;
      break;
    }
    case "cancel":
      await set({ status: "cancelled", cancelled_at: new Date().toISOString(), cancel_reason: a.reason?.slice(0, 500) || null });
      msg = woo ? "Cancelled here. This subscription is still billed by the old website — the office will stop it there too." : "Cancelled. We're sorry to see you go — you can restart any time.";
      break;
    case "reactivate":
      if (sub.status !== "cancelled") throw new Error("This subscription is already running.");
      if (sub.billing === "card") {
        const { data: c } = await db.from("shop_customers").select("stripe_payment_method").eq("id", sub.customer_id).single();
        if (!c?.stripe_payment_method) throw new Error("There's no card on file — start a new subscription instead.");
      }
      await set({ status: "active", cancelled_at: null, cancel_reason: null, next_date: nextDispatch(today, org.shop, org.shop.leadDays) });
      msg = "Welcome back — your subscription is running again.";
      break;
    case "parcel": {
      if (!isUuid(a.parcelId)) throw new Error("Not found.");
      const patch: Record<string, unknown> = {};
      if (a.label !== undefined) patch.label = a.label.trim().slice(0, 40) || "Home";
      if (a.delivery) patch.delivery = a.delivery === "pickup" && org.shop.pickup ? "pickup" : "post";
      if (a.address !== undefined) { const ad = cleanAddress(a.address); if (!ad && patch.delivery !== "pickup") throw new Error("Enter the full address (street, suburb, state, 4-digit postcode)."); patch.address = ad ?? {}; }
      if (a.items) patch.items = cleanItems(a.items);
      const { error } = await db.from("shop_parcels").update(patch).eq("id", a.parcelId).eq("subscription_id", subId);
      if (error) throw new Error(error.message);
      if (sub.billing === "prepaid" && a.items) msg = "Saved. Prepaid deliveries keep the price you paid; if the new coffee costs more, the office will be in touch.";
      break;
    }
    case "add_parcel": {
      const ad = cleanAddress(a.address);
      if (!ad) throw new Error("Enter the full address for this delivery.");
      const { count: n } = await db.from("shop_parcels").select("id", { count: "exact", head: true }).eq("subscription_id", subId);
      if ((n ?? 0) >= 4) throw new Error("A subscription can send to up to 4 addresses.");
      const { error } = await db.from("shop_parcels").insert({ organisation_id: org.id, subscription_id: subId, label: a.label?.trim().slice(0, 40) || "Work", delivery: "post", address: ad, items: cleanItems(a.items), position: n ?? 1 });
      if (error) throw new Error(error.message);
      msg = "Added — each delivery now sends to both addresses.";
      break;
    }
    case "remove_parcel": {
      const { count: n } = await db.from("shop_parcels").select("id", { count: "exact", head: true }).eq("subscription_id", subId);
      if ((n ?? 0) <= 1) throw new Error("A subscription needs at least one delivery address.");
      await db.from("shop_parcels").delete().eq("id", a.parcelId).eq("subscription_id", subId);
      msg = "Removed.";
      break;
    }
  }
  await db.from("activity_logs").insert({ organisation_id: org.id, actor_type: by.office ? "user" : "customer", actor_label: by.office ?? "Customer", action: `shop.subscription_${a.type}`, entity_type: "shop_subscription", entity_id: subId, summary: `Coffee subscription: ${msg}` }).then(() => null, () => null);
  return msg;
}

/** Card subscriptions with a failed payment (or a new card): pay the outstanding delivery now and keep the card for next time. */
export async function startCardUpdate(org: ShopOrg, subId: string, customerId: string): Promise<CheckoutResult> {
  const db = createServiceClient();
  const [sub] = await loadSubs(db, org.id, { ids: [subId], customerId });
  if (!sub || sub.billing !== "card") return { ok: false, error: "Not found." };
  const cfg = await loadStripe(db, org.id).catch(() => null);
  if (!cfg) return { ok: false, error: "Card payments aren't available right now." };
  const { data: cust } = await db.from("shop_customers").select(CUSTOMER_COLS).eq("id", customerId).single();
  const { data: failed } = await db.from("shop_orders").select("id, number, total, view_token").eq("subscription_id", subId).eq("status", "failed").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!failed) return { ok: false, error: "Nothing is owing — your next delivery will use the card on file. To change cards, contact us." };
  await db.from("shop_orders").update({ status: "pending" }).eq("id", failed.id);
  const cs = await createCheckout(cfg.secretKey, {
    amountCents: toCents(Number(failed.total)), currency: org.currency, name: `Coffee subscription — order #${failed.number}`, email: cust?.email as string,
    successUrl: shopUrl(org, `/order/${failed.view_token}?paid=1`), cancelUrl: shopUrl(org, "/account"),
    metadata: { eventureos_shop_checkout: failed.id as string, eventureos_org_id: org.id }, idempotencyKey: `shopretry-${failed.id}-${Date.now() >> 16}`, account: cfg.account,
    saveCard: { customerId: (cust?.stripe_customer_id as string) ?? null },
  });
  await db.from("shop_orders").update({ stripe_session_id: cs.id }).eq("id", failed.id);
  await db.from("shop_subscriptions").update({ status: "active", failed_attempts: 0, last_error: null }).eq("id", subId);
  return cs.url ? { ok: true, redirect: cs.url } : { ok: false, error: "Stripe didn't return a payment page." };
}

/* ------------------------------------------------------------------ the daily run */

/**
 * Subscriptions due to ship tomorrow (or earlier) become orders: card subscriptions are charged, prepaid ones use up a delivery.
 * WooCommerce-billed subscriptions are never touched (WooCommerce keeps charging them until the office switches them over).
 * Also: paused-until dates that have passed, and unpaid checkouts older than a day.
 */
export async function runShopJobs(db: SupabaseClient) {
  const out = { created: 0, charged: 0, failed: 0, prepaid: 0, resumed: 0, expired: 0, errors: [] as string[] };
  const { data: orgRows, error } = await db.from("shop_subscriptions").select("organisation_id").in("status", ["active", "paused"]).neq("billing", "woocommerce").limit(5000);
  if (missingTable(error)) return { skipped: "shop not set up" };
  const orgIds = [...new Set((orgRows ?? []).map((r) => r.organisation_id as string))];
  for (const orgId of orgIds) {
    const org = await shopOrgById(db, orgId);
    if (!org.shop.enabled) continue;
    const today = todayIn(org.timezone);
    // Pauses that have ended
    const { data: resumed } = await db.from("shop_subscriptions").update({ status: "active", paused_until: null }).eq("organisation_id", orgId).eq("status", "paused").lte("paused_until", today).select("id, next_date");
    for (const r of resumed ?? []) {
      out.resumed++;
      if (!r.next_date || r.next_date <= today) await db.from("shop_subscriptions").update({ next_date: nextDispatch(today, org.shop, org.shop.leadDays) }).eq("id", r.id);
    }
    const horizon = new Date(`${today}T00:00:00Z`); horizon.setUTCDate(horizon.getUTCDate() + 1);
    const { data: due } = await db.from("shop_subscriptions").select("id").eq("organisation_id", orgId).eq("status", "active").in("billing", ["card", "prepaid"]).lte("next_date", horizon.toISOString().slice(0, 10)).limit(200);
    if (!due?.length) continue;
    const products = (await loadProducts(db, orgId)) ?? [];
    const cfg = await loadStripe(db, orgId).catch(() => null);
    for (const d of due) {
      try { const r = await renewOne(db, org, d.id as string, products, cfg); out[r]++; if (r === "charged" || r === "prepaid") out.created++; }
      catch (e) { out.errors.push(`${d.id}: ${e instanceof Error ? e.message : String(e)}`); }
    }
  }
  // Unfinished checkouts: cancel after a day and give back any gift card balance
  const cutoff = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const { data: stale } = await db.from("shop_orders").select("id, gift_card_id, gift_amount, subscription_id, kind").eq("status", "pending").lt("created_at", cutoff).limit(200);
  for (const o of stale ?? []) {
    await db.from("shop_orders").update({ status: "cancelled", office_note: "Checkout not finished" }).eq("id", o.id).eq("status", "pending");
    if (o.gift_card_id && Number(o.gift_amount) > 0) await db.rpc("shop_return_gift", { p_gift: o.gift_card_id, p_amount: o.gift_amount });
    if (o.subscription_id && o.kind !== "subscription_renewal") await db.from("shop_subscriptions").update({ status: "cancelled", cancel_reason: "Checkout not finished" }).eq("id", o.subscription_id).eq("status", "pending");
    await db.from("shop_gift_cards").update({ status: "void" }).eq("order_id", o.id).eq("status", "pending");
    out.expired++;
  }
  // Gift cards scheduled to be emailed today
  const { data: gifts } = await db.from("shop_gift_cards").select("id, organisation_id").eq("status", "active").is("sent_at", null).not("recipient_email", "is", null).not("send_on", "is", null).limit(100);
  for (const g of gifts ?? []) {
    const org = await shopOrgById(db, g.organisation_id as string);
    await deliverGiftCard(db, org, g.id as string, false).catch(() => null);
  }
  return out;
}

async function renewOne(db: SupabaseClient, org: ShopOrg, subId: string, products: Product[], cfg: Awaited<ReturnType<typeof loadStripe>>): Promise<"charged" | "failed" | "prepaid"> {
  const [sub] = await loadSubs(db, org.id, { ids: [subId] });
  if (!sub || sub.status !== "active" || !sub.next_date) throw new Error("not active");
  // One renewal per dispatch date
  const { count: already } = await db.from("shop_orders").select("id", { count: "exact", head: true }).eq("subscription_id", subId).eq("dispatch_on", sub.next_date).neq("status", "cancelled");
  const advance = async () => db.from("shop_subscriptions").update({ next_date: nextDispatch(addInterval(sub.next_date!, sub.interval_unit, sub.interval_count), org.shop) }).eq("id", subId);
  if (already) { await advance(); return sub.billing === "prepaid" ? "prepaid" : "charged"; }
  const coupon = sub.coupon_code ? await findCoupon(db, org.id, sub.coupon_code) : null;
  const { data: sRow } = await db.from("shop_subscriptions").select("coupon_cycles_left, customer_id").eq("id", subId).single();
  const couponLive = coupon && coupon.active && (sRow?.coupon_cycles_left === null || (sRow?.coupon_cycles_left as number) > 0) ? coupon : null;
  const price = subDelivery(sub, products, org.shop, couponLive);
  const { data: cust } = await db.from("shop_customers").select(CUSTOMER_COLS).eq("id", sRow!.customer_id).single();
  const isPrepaid = sub.billing === "prepaid";
  const orders: { id: string; number: number }[] = [];
  for (const [i, p] of sub.parcels.entries()) {
    const priced = price.parcels[i];
    const number = await nextNumber(db, org.id);
    const { data: o, error } = await db.from("shop_orders").insert({
      organisation_id: org.id, number, customer_id: cust?.id ?? null, subscription_id: subId, parcel_id: p.id, status: isPrepaid ? "paid" : "pending",
      kind: isPrepaid ? "prepaid" : "subscription_renewal", source: "subscription", email: cust?.email ?? null, name: cust?.name ?? null, phone: cust?.phone ?? null,
      delivery: p.delivery === "pickup" ? "pickup" : "post", address: p.address ?? {}, items: priced.lines.map(itemJson),
      subtotal: priced.subtotal, discount: priced.discount, shipping: priced.shipping, total: isPrepaid ? 0 : priced.perDelivery, currency: org.currency,
      coupon_code: couponLive?.code ?? null, dispatch_on: sub.next_date, paid_at: isPrepaid ? new Date().toISOString() : null,
      office_note: isPrepaid ? `Prepaid delivery (${(sub.prepaid_remaining ?? 1) - 1} left after this)` : null,
    }).select("id, number").single();
    if (error) throw new Error(error.message);
    orders.push(o as { id: string; number: number });
  }
  const nextPatch: Record<string, unknown> = {
    next_date: nextDispatch(addInterval(sub.next_date, sub.interval_unit, sub.interval_count), org.shop), deliveries_made: sub.deliveries_made + 1,
    coupon_cycles_left: couponLive && sRow?.coupon_cycles_left !== null ? Math.max(0, (sRow!.coupon_cycles_left as number) - 1) : sRow?.coupon_cycles_left ?? null,
  };
  if (isPrepaid) {
    const left = Math.max(0, (sub.prepaid_remaining ?? 1) - 1);
    nextPatch.prepaid_remaining = left;
    if (left === 0) { nextPatch.status = "cancelled"; nextPatch.cancel_reason = "Prepaid package finished"; nextPatch.cancelled_at = new Date().toISOString(); }
    await db.from("shop_subscriptions").update(nextPatch).eq("id", subId);
    if (left === 0 && cust?.email) {
      const m = shopEmail(brandOf(org), { heading: "That's the last delivery of your prepaid coffee", intro: ["Thanks for being a subscriber. Renew any time — your coffee, grind and address are saved."], buttons: [{ label: "Renew my subscription", url: shopUrl(org, "/subscriptions") }] });
      await safeSend(org, { to: cust.email, subject: `Your prepaid coffee is finishing — ${org.name}`, html: m.html, text: m.text });
    }
    return "prepaid";
  }
  // Card: one charge for all parcels
  const total = round2(price.total);
  const ids = orders.map((o) => o.id);
  const fail = async (why: string) => {
    await db.from("shop_orders").update({ status: "failed", office_note: `Card declined: ${why}`.slice(0, 2000) }).in("id", ids);
    const { data: s2 } = await db.from("shop_subscriptions").select("failed_attempts").eq("id", subId).single();
    await db.from("shop_subscriptions").update({ status: "payment_failed", failed_attempts: ((s2?.failed_attempts as number) ?? 0) + 1, last_error: why.slice(0, 300) }).eq("id", subId);
    if (cust?.email) {
      const m = shopEmail(brandOf(org), { heading: "We couldn't take payment for your coffee", intro: [`Your card was declined (${why}). Your coffee is on hold — update your card and we'll roast and ship straight away.`], buttons: [{ label: "Update card & pay", url: shopUrl(org, "/account") }] });
      await safeSend(org, { to: cust.email, subject: `Payment problem with your coffee subscription — ${org.name}`, html: m.html, text: m.text });
    }
    return "failed" as const;
  };
  if (!cfg || !cust?.stripe_customer_id || !cust.stripe_payment_method) return fail("no card on file");
  if (total <= 0) {
    await db.from("shop_orders").update({ status: "paid", paid_at: new Date().toISOString() }).in("id", ids);
    await db.from("shop_subscriptions").update(nextPatch).eq("id", subId);
    return "charged";
  }
  try {
    const pi = await chargeSavedCard(cfg.secretKey, {
      amountCents: toCents(total), currency: org.currency, customer: cust.stripe_customer_id, paymentMethod: cust.stripe_payment_method, email: cust.email,
      description: `Coffee subscription — order${orders.length > 1 ? "s" : ""} #${orders.map((o) => o.number).join(", #")}`,
      metadata: { eventureos_shop_renewal: subId, eventureos_org_id: org.id }, idempotencyKey: `renew-${subId}-${sub.next_date}`, account: cfg.account,
    });
    if (pi.status !== "succeeded") return fail(pi.last_payment_error?.message ?? `payment ${pi.status}`);
    await db.from("shop_orders").update({ status: "paid", paid_at: new Date().toISOString(), stripe_payment_intent: pi.id }).in("id", ids);
    await db.from("shop_subscriptions").update({ ...nextPatch, failed_attempts: 0, last_error: null }).eq("id", subId);
    for (const id of ids) await sendOrderEmails(db, org, id).catch(() => null);
    return "charged";
  } catch (e) {
    return fail(e instanceof StripeError ? e.message : e instanceof Error ? e.message : String(e));
  }
}

/* ------------------------------------------------------------------ roast plan */

/** What to roast: paid orders not yet shipped + subscription deliveries due in the next `days`, totalled by coffee, size and grind. */
export async function roastPlan(db: SupabaseClient, org: ShopOrg, days = 7) {
  const today = todayIn(org.timezone);
  const until = new Date(`${today}T00:00:00Z`); until.setUTCDate(until.getUTCDate() + days);
  const end = until.toISOString().slice(0, 10);
  const products = (await loadProducts(db, org.id, { all: true })) ?? [];
  const vmap = new Map(products.flatMap((p) => p.variants.map((v) => [v.id, { p, v }] as const)));
  type Row = { name: string; size: string; grind: string; qty: number; grams: number; sources: { orders: number; subs: number; woo: number } };
  const rows = new Map<string, Row>();
  const add = (name: string, size: string, grind: string | null, qty: number, grams: number | null, src: "orders" | "subs" | "woo") => {
    const k = `${name}|${size}|${grind ?? ""}`;
    const r = rows.get(k) ?? { name, size, grind: grind ?? "—", qty: 0, grams: 0, sources: { orders: 0, subs: 0, woo: 0 } };
    r.qty += qty; r.grams += (grams ?? 0) * qty; r.sources[src] += qty; rows.set(k, r);
  };
  const { data: orders } = await db.from("shop_orders").select("items, dispatch_on").eq("organisation_id", org.id).in("status", ["paid", "roasting"]).neq("source", "woocommerce").or(`dispatch_on.is.null,dispatch_on.lte.${end}`);
  for (const o of orders ?? []) for (const i of (o.items as { variant_id?: string; name: string; variant: string; grind_label: string | null; qty: number; kind?: string }[]) ?? []) {
    if (i.kind === "gift_card") continue;
    add(i.name, i.variant, i.grind_label, i.qty, (i.variant_id && vmap.get(i.variant_id)?.v.grams) || null, "orders");
  }
  const { data: subs } = await db.from("shop_subscriptions").select("id, billing, next_date").eq("organisation_id", org.id).eq("status", "active").gte("next_date", today).lte("next_date", end);
  const subViews = subs?.length ? await loadSubs(db, org.id, { ids: subs.map((s) => s.id as string) }) : [];
  for (const s of subViews) {
    // Card/prepaid deliveries due tomorrow already became orders (counted above)
    const { count } = await db.from("shop_orders").select("id", { count: "exact", head: true }).eq("subscription_id", s.id).eq("dispatch_on", s.next_date!);
    if (count) continue;
    for (const p of s.parcels) for (const i of p.items) {
      const hit = vmap.get(i.variant_id);
      if (hit) add(hit.p.name, hit.v.label, grindLabel(i.grind, i.adjust), i.qty, hit.v.grams, s.billing === "woocommerce" ? "woo" : "subs");
    }
  }
  const list = [...rows.values()].sort((a, b) => a.name.localeCompare(b.name) || b.grams - a.grams);
  const byCoffee = new Map<string, number>();
  for (const r of list) byCoffee.set(r.name, (byCoffee.get(r.name) ?? 0) + r.grams);
  return { from: today, to: end, rows: list, totals: [...byCoffee.entries()].map(([name, grams]) => ({ name, grams })).sort((a, b) => b.grams - a.grams) };
}

export { frequencyLabel, grindLabel, addressLine };
