"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Inbox, Workflow, FileText, CalendarCheck2, CalendarDays, Users, Receipt,
  CreditCard, Globe, BarChart3, Settings, ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/cn";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/enquiries", label: "Enquiries", icon: Inbox, countKey: "enquiries" as const },
  { href: "/crm", label: "CRM", icon: Workflow },
  { href: "/quotes", label: "Quotes", icon: FileText },
  { href: "/events", label: "Events", icon: CalendarCheck2 },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/invoices", label: "Invoices", icon: Receipt },
  { href: "/payments", label: "Payments", icon: CreditCard },
  { href: "/portal", label: "Customer Portal", icon: Globe },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({ orgName, counts, isSuperAdmin = false }: { orgName: string; counts: { enquiries: number }; isSuperAdmin?: boolean }) {
  const pathname = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[232px] flex-col border-r border-line bg-white lg:flex">
      <div className="flex h-14 items-center gap-2.5 px-5">
        <Link href="/dashboard" aria-label="EventureOS dashboard"><Wordmark height={21} /></Link>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          const count = item.countKey ? counts[item.countKey] : 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] font-medium transition-colors",
                active ? "bg-brand-50 text-brand-800" : "text-ink-muted hover:bg-zinc-50 hover:text-ink"
              )}
            >
              <Icon className={cn("h-[16px] w-[16px] shrink-0", active ? "text-brand-600" : "text-ink-faint group-hover:text-ink-muted")} strokeWidth={1.8} />
              <span className="flex-1 truncate">{item.label}</span>
              {count > 0 && (
                <span className="rounded-full bg-brand-500 px-1.5 py-px text-[10.5px] font-semibold text-white">{count}</span>
              )}
            </Link>
          );
        })}
        {isSuperAdmin && (
          <Link href="/admin" className="mt-3 flex items-center gap-2.5 rounded-lg border-t border-line px-2.5 pb-[7px] pt-3 text-[13px] font-medium text-ink-muted hover:text-ink">
            <ShieldCheck className="h-[16px] w-[16px] text-ink-faint" strokeWidth={1.8} /> Platform admin
          </Link>
        )}
      </nav>
      <div className="border-t border-line px-5 py-3 text-[11.5px] text-ink-faint">
        <span className="font-medium text-ink-muted">{orgName}</span>
      </div>
    </aside>
  );
}

/** The EventureOS "E" mark (app icon). */
export function Logo({ size = 26 }: { size?: number }) {
  return <Image src="/brand/eventureos-mark.png" width={size} height={size} alt="" aria-hidden="true" priority className="shrink-0 rounded-[22%]" />;
}

/** The EventureOS wordmark. `tone="light"` is for dark backgrounds. */
export function Wordmark({ height = 22, tone = "dark", className }: { height?: number; tone?: "dark" | "light"; className?: string }) {
  const width = Math.round((height * 720) / 109);
  return (
    <Image
      src={tone === "light" ? "/brand/eventureos-wordmark-white.png" : "/brand/eventureos-wordmark.png"}
      width={width} height={height} alt="EventureOS" priority className={cn("shrink-0", className)}
    />
  );
}

