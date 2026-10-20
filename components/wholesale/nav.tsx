"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const ITEMS = [
  { href: "/wholesale", label: "Run sheet" },
  { href: "/wholesale/orders", label: "Orders" },
  { href: "/wholesale/customers", label: "Customers" },
  { href: "/wholesale/products", label: "Products & prices" },
  { href: "/wholesale/settings", label: "Settings" },
];

export function WholesaleNav({ toCheck }: { toCheck: number }) {
  const path = usePathname();
  return (
    <nav className="no-scrollbar -mx-4 mb-5 flex items-end gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0 print:hidden" aria-label="Wholesale">
      {ITEMS.map((i) => {
        const on = i.href === "/wholesale" ? path === "/wholesale" : path.startsWith(i.href);
        return (
          <Link key={i.href} href={i.href} aria-current={on ? "page" : undefined}
            className={cn("flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 pb-2.5 pt-1 text-[0.8125rem] font-medium", on ? "border-brand-500 text-ink" : "border-transparent text-ink-muted hover:text-ink")}>
            {i.label}
            {i.href === "/wholesale/orders" && toCheck > 0 && <span className="rounded-full bg-amber-100 px-1.5 text-[0.6875rem] font-semibold text-amber-900" title="Imported orders to check">{toCheck}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
