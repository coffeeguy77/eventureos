"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const ITEMS = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/organisations", label: "Organisations" },
  { href: "/admin/audit", label: "Support audit" },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="no-scrollbar order-last -mx-4 flex w-[calc(100%+2rem)] min-w-0 gap-1 overflow-x-auto px-4 sm:order-none sm:mx-0 sm:w-auto sm:px-0">
      {ITEMS.map((i) => {
        const active = i.exact ? pathname === i.href : pathname.startsWith(i.href);
        return (
          <Link key={i.href} href={i.href}
            className={cn("shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-[13px] font-medium sm:py-1.5",
              active ? "bg-white/15 text-white" : "text-zinc-300 hover:bg-white/10 hover:text-white")}>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
