"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  BarChart3, CalendarCheck2, CalendarDays, Check, CreditCard, FileText, Globe, Inbox, LayoutDashboard, LogOut,
  MoreHorizontal, Plus, Receipt, Settings, ShieldCheck, Users, Workflow, X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui/avatar";
import { signOut, switchOrganisation } from "@/app/(app)/shell-actions";

const TABS = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/enquiries", label: "Enquiries", icon: Inbox, badge: true },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/events", label: "Events", icon: CalendarCheck2 },
];

const MORE = [
  { href: "/crm", label: "CRM", icon: Workflow },
  { href: "/quotes", label: "Quotes", icon: FileText },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/invoices", label: "Invoices", icon: Receipt },
  { href: "/payments", label: "Payments", icon: CreditCard },
  { href: "/portal", label: "Portal", icon: Globe },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

const CREATE = [
  { href: "/enquiries/new", label: "Enquiry" },
  { href: "/events/new", label: "Event" },
  { href: "/quotes/new", label: "Quote" },
  { href: "/clients/new", label: "Client" },
  { href: "/invoices/new", label: "Invoice" },
];

const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(href + "/");

/** App-style bottom tab bar for phones and tablets (hidden on desktop, where the sidebar shows). */
export function MobileTabBar({ enquiries, isSuperAdmin, orgs, currentOrgId, user }: {
  enquiries: number;
  isSuperAdmin: boolean;
  orgs: { id: string; name: string; role: string }[];
  currentOrgId: string;
  user: { name: string; email: string };
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [open]);

  const moreActive = !open && MORE.some((m) => isActive(pathname, m.href));
  const current = orgs.find((o) => o.id === currentOrgId);

  return (
    <>
      <nav aria-label="Main" className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 backdrop-blur lg:hidden">
        <div className="mx-auto grid h-16 max-w-xl grid-cols-5">
          {TABS.map((t) => {
            const active = !open && isActive(pathname, t.href);
            const Icon = t.icon;
            return (
              <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined}
                className={cn("relative flex flex-col items-center justify-center gap-1 text-[10.5px] font-medium", active ? "text-brand-600" : "text-ink-muted")}>
                <span className="relative">
                  <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.2 : 1.8} />
                  {t.badge && enquiries > 0 && (
                    <span className="absolute -right-2.5 -top-1.5 min-w-[18px] rounded-full bg-brand-500 px-1 text-center text-[10px] font-semibold leading-[18px] text-white ring-2 ring-white">
                      {enquiries > 99 ? "99+" : enquiries}
                    </span>
                  )}
                </span>
                {t.label}
              </Link>
            );
          })}
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="more-sheet"
            className={cn("flex flex-col items-center justify-center gap-1 text-[10.5px] font-medium", open || moreActive ? "text-brand-600" : "text-ink-muted")}>
            <MoreHorizontal className="h-[22px] w-[22px]" strokeWidth={open || moreActive ? 2.2 : 1.8} />
            More
          </button>
        </div>
      </nav>

      {open && (
        <div className="fixed inset-0 z-30 lg:hidden" role="dialog" aria-modal="true" aria-label="More">
          <button aria-label="Close" className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div id="more-sheet" className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-white pb-[calc(env(safe-area-inset-bottom)+5rem)] shadow-2xl">
            <div className="sticky top-0 flex items-center justify-between bg-white px-5 pb-2 pt-4">
              <span className="text-[15px] font-semibold">Menu</span>
              <button onClick={() => setOpen(false)} aria-label="Close menu" className="rounded-full p-1.5 text-ink-muted hover:bg-zinc-100"><X className="h-5 w-5" /></button>
            </div>

            <div className="grid grid-cols-4 gap-2 px-4 pb-4 sm:grid-cols-8">
              {MORE.map((m) => {
                const Icon = m.icon;
                const active = isActive(pathname, m.href);
                return (
                  <Link key={m.href} href={m.href}
                    className={cn("flex flex-col items-center gap-1.5 rounded-xl px-1 py-3 text-[11.5px] font-medium",
                      active ? "bg-brand-50 text-brand-700" : "text-ink hover:bg-zinc-50")}>
                    <Icon className={cn("h-6 w-6", active ? "text-brand-600" : "text-ink-muted")} strokeWidth={1.8} />
                    {m.label}
                  </Link>
                );
              })}
              {isSuperAdmin && (
                <Link href="/admin" className="flex flex-col items-center gap-1.5 rounded-xl px-1 py-3 text-[11.5px] font-medium text-ink hover:bg-zinc-50">
                  <ShieldCheck className="h-6 w-6 text-ink-muted" strokeWidth={1.8} /> Admin
                </Link>
              )}
            </div>

            <div className="border-t border-line px-5 py-4">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Create</div>
              <div className="flex flex-wrap gap-2">
                {CREATE.map((c) => (
                  <Link key={c.href} href={c.href} className="inline-flex items-center gap-1 rounded-full border border-line px-3 py-1.5 text-[13px] font-medium text-ink hover:bg-zinc-50">
                    <Plus className="h-3.5 w-3.5 text-brand-600" /> {c.label}
                  </Link>
                ))}
              </div>
            </div>

            <div className="border-t border-line px-5 py-4">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Organisation</div>
              <div className="space-y-1">
                {orgs.map((o) => (
                  <button key={o.id} disabled={pending}
                    onClick={() => { if (o.id !== currentOrgId) start(() => switchOrganisation(o.id)); setOpen(false); }}
                    className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-zinc-50">
                    <Avatar name={o.name} size={32} className="rounded-lg" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium text-ink">{o.name}</span>
                      <span className="block text-[12px] capitalize text-ink-muted">{o.role}</span>
                    </span>
                    {o.id === currentOrgId && <Check className="h-5 w-5 text-brand-600" />}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3 border-t border-line px-5 py-4">
              <Avatar name={user.name} size={36} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-medium">{user.name}</div>
                <div className="truncate text-[12px] text-ink-muted">{user.email}{current ? ` · ${current.name}` : ""}</div>
              </div>
              <form action={signOut}>
                <button className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-[13px] font-medium text-ink-muted hover:bg-zinc-50 hover:text-ink">
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
