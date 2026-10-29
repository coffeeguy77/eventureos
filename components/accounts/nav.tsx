"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const ITEMS = [{ href: "/accounts", label: "Money owing" }, { href: "/accounts/resolution", label: "Resolution centre" }, { href: "/accounts/results", label: "Email results" }, { href: "/accounts/templates", label: "Templates" }, { href: "/accounts/terms", label: "Fees & terms" }];

export function AccountsNav() {
  const path = usePathname();
  return (
    <nav className="no-scrollbar mb-5 flex items-end gap-1 overflow-x-auto border-b border-line" aria-label="Accounts">
      {ITEMS.map((i) => {
        const on = i.href === "/accounts" ? path === "/accounts" || /^\/accounts\/[0-9a-f-]{36}/.test(path) : path.startsWith(i.href);
        return <Link key={i.href} href={i.href} aria-current={on ? "page" : undefined} className={cn("shrink-0 whitespace-nowrap border-b-2 px-3 pb-2.5 pt-1 text-[0.8125rem] font-medium", on ? "border-brand-500 text-ink" : "border-transparent text-ink-muted hover:text-ink")}>{i.label}</Link>;
      })}
    </nav>
  );
}
