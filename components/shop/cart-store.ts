"use client";

import { useCallback, useEffect, useState } from "react";
import type { IntervalUnit, Mode } from "@/lib/shop/core";

/**
 * The cart lives in this browser (per shop). Prices are never trusted from here — the server re-prices everything.
 * If storage is blocked (private mode), the cart still works for this page visit.
 */
export interface CartItem { variantId: string; grind: string | null; adjust: number; qty: number }
export interface Cart {
  items: CartItem[]; mode: Mode; interval: { unit: IntervalUnit; count: number }; prepaidMonths: 3 | 6 | 12 | null;
  coupon: string | null; eventToken: string | null;
}
const EMPTY: Cart = { items: [], mode: "one_off", interval: { unit: "week", count: 2 }, prepaidMonths: null, coupon: null, eventToken: null };
const key = (slug: string) => `eos_cart_${slug}`;
const memory = new Map<string, Cart>();

function read(slug: string): Cart {
  try {
    const raw = window.localStorage.getItem(key(slug));
    if (raw) { const c = JSON.parse(raw) as Cart; if (Array.isArray(c.items)) return { ...EMPTY, ...c }; }
  } catch { /* storage blocked */ }
  return memory.get(slug) ?? EMPTY;
}
function write(slug: string, c: Cart) {
  memory.set(slug, c);
  try { window.localStorage.setItem(key(slug), JSON.stringify(c)); } catch { /* storage blocked */ }
  window.dispatchEvent(new CustomEvent("eos-cart", { detail: slug }));
}

export function useCart(slug: string) {
  const [cart, setCart] = useState<Cart>(EMPTY);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setCart(read(slug)); setReady(true);
    const on = () => setCart(read(slug));
    window.addEventListener("eos-cart", on);
    window.addEventListener("storage", on);
    return () => { window.removeEventListener("eos-cart", on); window.removeEventListener("storage", on); };
  }, [slug]);
  const update = useCallback((f: (c: Cart) => Cart) => { const next = f(read(slug)); write(slug, next); setCart(next); }, [slug]);
  const add = useCallback((item: CartItem, opts?: { mode?: Mode; interval?: { unit: IntervalUnit; count: number } }) => update((c) => {
    const same = c.items.findIndex((x) => x.variantId === item.variantId && x.grind === item.grind && x.adjust === item.adjust);
    const items = same >= 0 ? c.items.map((x, i) => (i === same ? { ...x, qty: Math.min(50, x.qty + item.qty) } : x)) : [...c.items, item];
    return { ...c, items, mode: opts?.mode ?? c.mode, interval: opts?.interval ?? c.interval };
  }), [update]);
  const count = cart.items.reduce((a, x) => a + x.qty, 0);
  return { cart, ready, update, add, count, clear: () => update((c) => ({ ...EMPTY, eventToken: c.eventToken })) };
}
