"use client";

import { useEffect } from "react";
import { useCart } from "./cart-store";

/** After a successful payment, empty the cart (once). */
export function ClearCart({ slug }: { slug: string }) {
  const { clear, ready } = useCart(slug);
  useEffect(() => { if (ready) clear(); }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
