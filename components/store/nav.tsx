"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/cn";

const ITEMS = [
  { href: "/store", label: "Orders" },
  { href: "/store/roast", label: "Roast plan" },
  { href: "/store/subscriptions", label: "Subscriptions" },
  { href: "/store/products", label: "Products" },
  { href: "/store/customers", label: "Customers" },
  { href: "/offers", label: "Offers & coupons" },
  { href: "/store/banners", label: "Banners" },
  { href: "/store/gift-cards", label: "Gift cards" },
  { href: "/store/settings", label: "Settings" },
];

export function StoreNav({ slug, toRoast }: { slug: string; toRoast: number }) {
  const path = usePathname();
  return (
    <nav className="no-scrollbar -mx-4 mb-5 flex items-end gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0" aria-label="Shop">
      {ITEMS.map((i) => {
        const on = i.href === "/store" ? path === "/store" || path.startsWith("/store/orders") : path.startsWith(i.href);
        return (
          <Link key={i.href} href={i.href} aria-current={on ? "page" : undefined}
            className={cn("flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 pb-2.5 pt-1 text-[0.8125rem] font-medium", on ? "border-brand-500 text-ink" : "border-transparent text-ink-muted hover:text-ink")}>
            {i.label}
            {i.href === "/store" && toRoast > 0 && <span className="rounded-full bg-amber-100 px-1.5 text-[0.6875rem] font-semibold text-amber-900">{toRoast}</span>}
          </Link>
        );
      })}
      <span className="flex-1" />
      <a href={`/shop/${slug}`} target="_blank" rel="noreferrer" className="mb-2 hidden shrink-0 items-center gap-1 text-[0.8125rem] font-medium text-ink-muted hover:text-ink sm:inline-flex">View shop<ExternalLink className="h-3.5 w-3.5" /></a>
    </nav>
  );
}
