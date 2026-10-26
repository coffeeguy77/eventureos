"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { buttonClass } from "@/components/ui/button";

const ITEMS = [
  { href: "/rentals", label: "Today" },
  { href: "/rentals/bookings", label: "Bookings" },
  { href: "/rentals/availability", label: "Availability" },
  { href: "/rentals/items", label: "Items & rates" },
  { href: "/rentals/settings", label: "Settings", manager: true },
];

/** The Hire section's menu (Today, Bookings, Availability, Items & rates, Settings) and the New booking button. */
export function RentalsNav({ overdue, canManage }: { overdue: number; canManage: boolean }) {
  const path = usePathname();
  return (
    <div className="mb-5 flex items-end gap-3 border-b border-line print:hidden">
      <nav className="no-scrollbar -mx-4 flex flex-1 items-end gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label="Hire">
        {ITEMS.filter((i) => !i.manager || canManage).map((i) => {
          const on = i.href === "/rentals" ? path === "/rentals" : path.startsWith(i.href);
          return (
            <Link key={i.href} href={i.href} aria-current={on ? "page" : undefined}
              className={cn("flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 pb-2.5 pt-1 text-[0.8125rem] font-medium", on ? "border-brand-500 text-ink" : "border-transparent text-ink-muted hover:text-ink")}>
              {i.label}
              {i.href === "/rentals" && overdue > 0 && <span className="rounded-full bg-rose-100 px-1.5 text-[0.6875rem] font-semibold text-rose-800" title="Overdue returns">{overdue}</span>}
            </Link>
          );
        })}
      </nav>
      <Link href="/rentals/bookings/new" className={buttonClass("primary", "sm", "mb-2 hidden shrink-0 sm:inline-flex")}><Plus className="h-4 w-4" />New booking</Link>
    </div>
  );
}
