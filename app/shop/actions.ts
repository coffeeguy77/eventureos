"use server";

import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/integrations/runtime";
import { cleanPhone } from "@/lib/bookings/core";
import { consumeShopLogin, currentShopCustomer, requestShopLogin, signOutShop } from "@/lib/shop/auth";
import {
  changeSubscription, quoteCart, shopOrg, startCardUpdate, startGiftCardPurchase, startShopCheckout, isUuid,
  type CheckoutInput, type GiftCardInput, type ParcelItem,
} from "@/lib/shop/server";
import type { CartLine, Delivery, IntervalUnit, Mode, Priced } from "@/lib/shop/core";

type R<T = string> = { ok: true; data: T } | { ok: false; error: string };
const err = (e: unknown) => (e instanceof Error ? e.message : String(e));

export interface QuoteInput { orgSlug: string; lines: CartLine[]; mode: Mode; delivery: Delivery; couponCode?: string | null; email?: string | null; prepaidMonths?: 3 | 6 | 12 | null; interval?: { unit: IntervalUnit; count: number } }

/** Live totals for the cart page. */
export async function quoteAction(i: QuoteInput): Promise<R<{ priced: Priced; couponError: string | null; couponLabel: string | null }>> {
  try {
    const org = await shopOrg(i.orgSlug);
    if (!org) return { ok: false, error: "Not found" };
    const lines = (Array.isArray(i.lines) ? i.lines : []).slice(0, 40).filter((l) => isUuid(l.variantId));
    const r = await quoteCart(org, { ...i, lines });
    return { ok: true, data: { priced: r.priced, couponError: r.couponError, couponLabel: r.coupon ? r.coupon.description || r.coupon.code : null } };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export async function checkoutAction(i: CheckoutInput): Promise<R<string>> {
  try {
    const r = await startShopCheckout(i);
    return r.ok ? { ok: true, data: r.redirect } : { ok: false, error: r.error };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export async function giftCardAction(i: GiftCardInput): Promise<R<string>> {
  try {
    const r = await startGiftCardPurchase(i);
    return r.ok ? { ok: true, data: r.redirect } : { ok: false, error: r.error };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export async function shopLoginAction(orgSlug: string, email: string): Promise<R<string>> {
  const org = await shopOrg(orgSlug);
  if (!org) return { ok: false, error: "Not found" };
  const r = await requestShopLogin(org, email);
  return r.ok ? { ok: true, data: r.message } : { ok: false, error: r.error };
}

export async function shopVerifyAction(orgSlug: string, token: string): Promise<R<string>> {
  const org = await shopOrg(orgSlug);
  if (!org) return { ok: false, error: "Not found" };
  const r = await consumeShopLogin(org, token);
  if (!r.ok) return r;
  redirect(`/shop/${org.slug}/account`);
}

export async function shopSignOutAction(orgSlug: string) {
  const org = await shopOrg(orgSlug);
  if (org) await signOutShop(org);
  redirect(`/shop/${orgSlug}`);
}

export type SubChange =
  | { type: "pause"; until: string | null } | { type: "resume" } | { type: "skip" } | { type: "sooner" } | { type: "cancel"; reason: string | null }
  | { type: "frequency"; unit: IntervalUnit; count: number } | { type: "next_date"; date: string } | { type: "reactivate" }
  | { type: "parcel"; parcelId: string; label?: string; delivery?: "post" | "pickup"; address?: unknown; items?: ParcelItem[] }
  | { type: "add_parcel"; label: string; address: unknown; items: ParcelItem[] } | { type: "remove_parcel"; parcelId: string };

/** A signed-in customer changing their own subscription. */
export async function mySubAction(orgSlug: string, subId: string, change: SubChange): Promise<R<string>> {
  try {
    const org = await shopOrg(orgSlug);
    if (!org) return { ok: false, error: "Not found" };
    const me = await currentShopCustomer(org);
    if (!me) return { ok: false, error: "Please sign in again." };
    if (!isUuid(subId)) return { ok: false, error: "Not found." };
    return { ok: true, data: await changeSubscription(createServiceClient(), org, subId, change, { customerId: me.id }) };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export async function myCardAction(orgSlug: string, subId: string): Promise<R<string>> {
  try {
    const org = await shopOrg(orgSlug);
    if (!org) return { ok: false, error: "Not found" };
    const me = await currentShopCustomer(org);
    if (!me) return { ok: false, error: "Please sign in again." };
    const r = await startCardUpdate(org, subId, me.id);
    return r.ok ? { ok: true, data: r.redirect } : { ok: false, error: r.error };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export async function myDetailsAction(orgSlug: string, d: { name: string; phone: string; marketing: boolean }): Promise<R<string>> {
  const org = await shopOrg(orgSlug);
  if (!org) return { ok: false, error: "Not found" };
  const me = await currentShopCustomer(org);
  if (!me) return { ok: false, error: "Please sign in again." };
  const name = d.name.trim().slice(0, 120);
  if (name.length < 2) return { ok: false, error: "Enter your name." };
  await createServiceClient().from("shop_customers").update({ name, phone: d.phone.trim() ? cleanPhone(d.phone) : null, marketing_ok: !!d.marketing }).eq("id", me.id);
  return { ok: true, data: "Saved." };
}

/** Name and date of the event a quote link belongs to (for "deliver with my event"). */
export async function eventInfoAction(orgSlug: string, token: string): Promise<{ name: string; date: string | null } | null> {
  const org = await shopOrg(orgSlug);
  if (!org || !org.shop.eventAddon) return null;
  const { eventForQuoteToken } = await import("@/lib/shop/server");
  const ev = await eventForQuoteToken(createServiceClient(), org.id, token).catch(() => null);
  return ev ? { name: ev.name, date: ev.date } : null;
}
