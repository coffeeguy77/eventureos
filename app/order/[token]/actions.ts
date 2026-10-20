"use server";

import { createServiceClient } from "@/lib/integrations/runtime";
import { placeOrder, type PlaceResult } from "@/lib/wholesale/orders";

/** Place an order from a wholesale customer's ordering link (the token is the customer's private link). */
export async function placeWholesaleOrder(token: string, items: { product_id: string; quantity: number }[], note: string): Promise<PlaceResult> {
  try {
    if (!Array.isArray(items) || items.length > 200) return { ok: false, error: "Refresh the page and try again." };
    return await placeOrder(createServiceClient(), String(token), items.map((i) => ({ product_id: String(i.product_id), quantity: Number(i.quantity) })), typeof note === "string" ? note : null);
  } catch (e) {
    console.error("[wholesale] place order:", e);
    return { ok: false, error: "Couldn't place the order — please try again, or contact us." };
  }
}
