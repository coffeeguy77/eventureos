"use client";

import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { useCart } from "./cart-store";

export function CartButton({ slug, dark }: { slug: string; dark?: boolean }) {
  const { count } = useCart(slug);
  return (
    <Link href={`/shop/${slug}/cart`} aria-label={`Cart${count ? `, ${count} item${count === 1 ? "" : "s"}` : ""}`}
      className={`relative grid h-11 w-11 place-items-center rounded-full transition ${dark ? "hover:bg-white/10" : "hover:bg-[#EFE7DE]"}`}>
      <ShoppingBag className="h-5 w-5" />
      {count > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-[var(--b)] px-1 text-[0.6875rem] font-bold text-[var(--on-b)]">{count}</span>}
    </Link>
  );
}
