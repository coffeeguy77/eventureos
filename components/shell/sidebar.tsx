"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Inbox, Workflow, FileText, CalendarCheck2, CalendarDays, Users, Receipt,
  CreditCard, Ticket, Wallet, Globe, BarChart3, Settings, ShieldCheck, Briefcase, ListTodo, Coffee, BadgePercent, ChefHat, MonitorSmartphone, Truck, GraduationCap, Handshake, Tent, Tag, Banknote, Printer, Server } from "lucide-react";
import { cn } from "@/lib/cn";
import { canOpen } from "@/lib/access";
import { BusinessRail, type OrgChip } from "./business-rail";
import type { OrgRole } from "@/lib/types";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/tasks", label: "To-do", icon: ListTodo, countKey: "todo" as const },
  { href: "/enquiries", label: "Enquiries", icon: Inbox, countKey: "enquiries" as const },
  { href: "/crm", label: "CRM", icon: Workflow },
  { href: "/quotes", label: "Quotes", icon: FileText },
  { href: "/events", label: "Events", icon: CalendarCheck2 },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/kitchen", label: "Kitchen", icon: ChefHat },
  { href: "/bookings", label: "Bookings", icon: Ticket },
  { href: "/learn", label: "Learn", icon: GraduationCap },
  { href: "/store", label: "Shop", icon: Coffee },
  { href: "/wholesale", label: "Wholesale", icon: Truck },
  { href: "/pricing", label: "Pricing", icon: Tag },
  { href: "/printing", label: "Printing", icon: Printer },
  { href: "/hosting", label: "Hosting", icon: Server },
  { href: "/rentals", label: "Hire", icon: Tent, flag: "hire" as const },
  { href: "/franchise", label: "Franchise", icon: Handshake, flag: "franchise" as const },
  { href: "/offers", label: "Offers", icon: BadgePercent },
  { href: "/website", label: "Website", icon: MonitorSmartphone },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/invoices", label: "Invoices", icon: Receipt },
  { href: "/payments", label: "Payments", icon: CreditCard },
  { href: "/accounts", label: "Accounts", icon: Banknote },
  { href: "/wages", label: "Wages", icon: Wallet },
  { href: "/portal", label: "Customer Portal", icon: Globe },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/my-jobs", label: "My jobs", icon: Briefcase, staffOnly: true },
];

export function Sidebar({ orgName, counts, isSuperAdmin = false, role, flags = {}, orgs = [], currentOrgId = "" }: { orgName: string; counts: { enquiries: number; todo?: number }; isSuperAdmin?: boolean; role: OrgRole; /** sections only some businesses use */ flags?: { franchise?: boolean; hire?: boolean; locked?: string[]; sections?: string[] | null; labels?: Record<string, string> }; orgs?: OrgChip[]; currentOrgId?: string }) {
  const pathname = usePathname();
  const items = NAV.filter((i) => canOpen(role, i.href, flags.sections) && (!("staffOnly" in i && i.staffOnly) || role === "staff") && (!("flag" in i && i.flag) || !!flags[i.flag]) && !(flags.locked ?? []).includes(i.href));
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[232px] flex-col border-r border-line bg-surface lg:flex">
      <div className="flex h-14 items-center gap-2.5 px-5">
        <Link href={role === "staff" ? "/my-jobs" : "/dashboard"} aria-label="EventureOS home" className="flex items-center gap-2"><Logo size={34} /><Wordmark height={20} /></Link>
      </div>
      {orgs.length > 1 && <BusinessRail orgs={orgs} currentOrgId={currentOrgId} />}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          const count = item.countKey ? counts[item.countKey] ?? 0 : 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[0.8125rem] font-medium transition-colors",
                active ? "bg-brand-50 text-brand-800" : "text-ink-muted hover:bg-zinc-50 hover:text-ink"
              )}
            >
              <Icon className={cn("h-[16px] w-[16px] shrink-0", active ? "text-brand-600" : "text-ink-faint group-hover:text-ink-muted")} strokeWidth={1.8} />
              <span className="flex-1 truncate">{flags.labels?.[item.href] ?? item.label}</span>
              {count > 0 && (
                <span className="rounded-full bg-brand-500 px-1.5 py-px text-[0.6562rem] font-semibold text-on-brand">{count}</span>
              )}
            </Link>
          );
        })}
        {isSuperAdmin && (
          <Link href="/admin" className="mt-3 flex items-center gap-2.5 rounded-lg border-t border-line px-2.5 pb-[7px] pt-3 text-[0.8125rem] font-medium text-ink-muted hover:text-ink">
            <ShieldCheck className="h-[16px] w-[16px] text-ink-faint" strokeWidth={1.8} /> Platform admin
          </Link>
        )}
      </nav>
      <div className="border-t border-line px-5 py-3 text-[0.7188rem] text-ink-faint">
        <span className="block truncate font-medium text-ink-muted">{orgName}</span>
        <span className="mt-0.5 block italic">{SLOGAN}</span>
      </div>
    </aside>
  );
}

/** The EventureOS mascot (the early bird) — the whole bird, no tile. `size` is its height in px. */
export function Logo({ size = 26 }: { size?: number }) {
  const width = Math.round((size * 900) / 759);
  return <Image src="/brand/mascot.png" width={width} height={size} alt="" aria-hidden="true" priority className="shrink-0 drop-shadow-[0_2px_4px_rgba(76,29,149,0.25)]" />;
}

/** The EventureOS slogan — shown only to the event business's own team, never to their clients. */
export const SLOGAN = "The early bird gets the booking.";

/**
 * The EventureOS wordmark. "Eventure" is an image; "OS" is painted in the workspace's accent colour (it follows the
 * colour picked in Appearance) through a mask of the original letters. `tone="light"` is for dark backgrounds.
 */
export function Wordmark({ height = 22, tone = "auto", className }: { height?: number; tone?: "auto" | "dark" | "light"; className?: string }) {
  const width = Math.round((height * 720) / 109);
  const img = (src: string, cls?: string) => (
    <Image src={src} width={width} height={height} alt="" aria-hidden="true" priority className={cn("block h-full w-full", cls)} />
  );
  const mask = "url(/brand/eventureos-wordmark-os-mask.png)";
  // The same shade as links (night modes already lighten it); a light one on fixed dark backgrounds
  const os = tone === "light" ? "bg-brand-300" : "bg-brand-600";
  return (
    <span role="img" aria-label="EventureOS" className={cn("relative inline-block shrink-0", className)} style={{ width, height }}>
      {tone === "light" ? img("/brand/eventureos-wordmark-eventure-white.png")
        : tone === "dark" ? img("/brand/eventureos-wordmark-eventure.png")
          : <>{img("/brand/eventureos-wordmark-eventure.png", "dark:hidden")}{img("/brand/eventureos-wordmark-eventure-white.png", "hidden dark:block")}</>}
      <span aria-hidden="true" className={cn("absolute inset-0", os)}
        style={{ WebkitMaskImage: mask, maskImage: mask, WebkitMaskSize: "100% 100%", maskSize: "100% 100%", WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat" }} />
    </span>
  );
}

