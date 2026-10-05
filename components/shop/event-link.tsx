"use client";

import { useEffect } from "react";
import { useCart } from "./cart-store";

/** Arriving from a quote link (?event=…) or a promo (?code=…): remember it in the cart. */
export function EventLink({ slug, token, code }: { slug: string; token: string | null; code: string | null }) {
  const { update } = useCart(slug);
  useEffect(() => {
    if (token && /^[0-9a-f]{64}$/.test(token)) update((c) => ({ ...c, eventToken: token, mode: "one_off" }));
    if (code && /^[A-Za-z0-9_-]{2,40}$/.test(code)) update((c) => ({ ...c, coupon: code.toUpperCase() }));
  }, [token, code, update]);
  return null;
}
