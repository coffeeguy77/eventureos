"use server";

import { quoteBasket, shopAvailability, shopOrg, submitShop, type ShopRequest, type SubmitResult, type Window } from "@/lib/hire/shop";

/** The public hire shop: availability for dates, a priced basket, and sending the booking. */
export async function shopAvailabilityAction(slug: string, w: Window): Promise<{ ok: true; data: Record<string, { free: number; freeFrom: number | null }> } | { ok: false; error: string }> {
  try {
    const so = await shopOrg(slug);
    if (!so) return { ok: false, error: "Online hire isn't available right now." };
    return { ok: true, data: await shopAvailability(so, w) };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Couldn't check availability." }; }
}

export interface BasketPrice {
  lines: { id: string; qty: number; each: number; total: number; note: string }[]; deliveryFee: number; deliveryQuoted: boolean;
  total: number; gst: number; bond: number; deposit: number; shortages: { itemId: string; name: string; short: number; freeFrom: number | null }[];
}
export async function shopQuoteAction(slug: string, r: Pick<ShopRequest, "lines" | "fulfilment" | "address" | keyof Window>): Promise<{ ok: true; data: BasketPrice } | { ok: false; error: string }> {
  try {
    const so = await shopOrg(slug);
    if (!so) return { ok: false, error: "Online hire isn't available right now." };
    const q = await quoteBasket(so, r);
    return { ok: true, data: {
      lines: q.lines.map((l) => ({ id: l.item.id, qty: l.qty, each: l.each, total: l.total, note: l.note })), deliveryFee: q.deliveryFee, deliveryQuoted: q.deliveryQuoted,
      total: q.total, gst: q.gst, bond: q.bond, deposit: q.deposit, shortages: q.shortages.map((x) => ({ itemId: x.itemId, name: x.name, short: x.short, freeFrom: x.freeFrom })),
    } };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Couldn't price that." }; }
}

export async function shopSubmitAction(slug: string, r: ShopRequest): Promise<SubmitResult> {
  return submitShop(slug, r);
}
