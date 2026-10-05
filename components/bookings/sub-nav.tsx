"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const ITEMS = [
  { href: "/bookings", label: "Sessions" },
  { href: "/bookings/courses", label: "Courses" },
  { href: "/bookings/students", label: "Students" },
  { href: "/bookings/gifts", label: "Gift certificates" },
  { href: "/bookings/certificates", label: "Certificates" },
  { href: "/bookings/agencies", label: "Agencies" },
  { href: "/bookings/website", label: "Website & settings" },
];

export function BookingsNav({ drafts }: { drafts: number }) {
  const path = usePathname();
  return (
    <nav className="no-scrollbar -mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0" aria-label="Bookings">
      {ITEMS.map((i) => {
        const on = i.href === "/bookings" ? path === "/bookings" || path.startsWith("/bookings/sessions") : path.startsWith(i.href);
        return (
          <Link key={i.href} href={i.href} aria-current={on ? "page" : undefined}
            className={cn("flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 pb-2.5 pt-1 text-[0.8125rem] font-medium", on ? "border-brand-500 text-ink" : "border-transparent text-ink-muted hover:text-ink")}>
            {i.label}
            {i.href === "/bookings/agencies" && drafts > 0 && <span className="rounded-full bg-amber-100 px-1.5 text-[0.6875rem] font-semibold text-amber-900">{drafts}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
