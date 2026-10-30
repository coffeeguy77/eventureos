"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const ITEMS = [
  { href: "/machines", label: "Jobs" },
  { href: "/machines/quick-sale", label: "Quick sale" },
  { href: "/machines/price-list", label: "Price list" },
  { href: "/machines/settings", label: "Settings & machines" },
];

export function MachinesNav() {
  const path = usePathname();
  return (
    <nav className="no-scrollbar mb-5 flex items-end gap-1 overflow-x-auto border-b border-line" aria-label="Coffee machines">
      {ITEMS.map((i) => {
        const on = i.href === "/machines" ? path === "/machines" || /^\/machines\/(new|[0-9a-f-]{36})/.test(path) : path.startsWith(i.href);
        return <Link key={i.href} href={i.href} aria-current={on ? "page" : undefined} className={cn("shrink-0 whitespace-nowrap border-b-2 px-3 pb-2.5 pt-1 text-[0.8125rem] font-medium", on ? "border-brand-500 text-ink" : "border-transparent text-ink-muted hover:text-ink")}>{i.label}</Link>;
      })}
    </nav>
  );
}
