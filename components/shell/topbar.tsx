"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Bell, Check, ChevronDown, Plus, Search, LogOut } from "lucide-react";
import { cn } from "@/lib/cn";
import { relative } from "@/lib/format";
import { Avatar } from "@/components/ui/avatar";
import { Logo } from "@/components/shell/sidebar";
import { globalSearch, markAllNotificationsRead, signOut, switchOrganisation, type SearchResult } from "@/app/(app)/shell-actions";

export interface TopbarProps {
  user: { name: string; email: string };
  orgs: { id: string; name: string; role: string }[];
  currentOrgId: string;
  notifications: { id: string; title: string; body: string | null; link: string | null; created_at: string; read_at: string | null; type: string }[];
  unread: number;
}

function useClickOutside(ref: React.RefObject<HTMLElement | null>, onOut: () => void) {
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onOut();
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [ref, onOut]);
}

export function Topbar(props: TopbarProps) {
  return (
    <header className="pt-safe sticky top-0 z-20 border-b border-line bg-white/90 backdrop-blur">
      <div className="flex h-14 items-center gap-2 px-3 sm:gap-3 sm:px-6 lg:px-8">
        <Link href="/dashboard" aria-label="EventureOS home" className="shrink-0 lg:hidden"><Logo size={30} /></Link>
        <GlobalSearch />
        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
          <QuickCreate />
          <Notifications items={props.notifications} unread={props.unread} />
          <div className="hidden lg:block"><OrgSwitcher orgs={props.orgs} currentOrgId={props.currentOrgId} /></div>
          <div className="hidden lg:block"><UserMenu user={props.user} /></div>
        </div>
      </div>
    </header>
  );
}

const KIND_LABEL: Record<string, string> = {
  customer: "Customers", contact: "Contacts", event: "Events", enquiry: "Enquiries",
  quote: "Quotes", invoice: "Invoices", email: "Email conversations",
};

function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [pending, startTransition] = useTransition();
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useClickOutside(box, () => setOpen(false));

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      startTransition(async () => {
        try {
          setError(null);
          setResults(await globalSearch(q));
          setActive(0);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Search failed");
        }
      });
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    (acc[r.kind] ??= []).push(r);
    return acc;
  }, {});
  const flat = Object.values(grouped).flat();

  function go(r: SearchResult) {
    setOpen(false);
    setQ("");
    router.push(r.href);
  }

  return (
    <div ref={box} className="relative min-w-0 flex-1 lg:max-w-[520px]">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
      <input
        ref={input}
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, flat.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          if (e.key === "Enter" && flat[active]) go(flat[active]);
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Search clients, events, quotes…"
        className="h-9 w-full rounded-lg border border-line bg-canvas pl-9 pr-14 text-[13px] text-ink placeholder:text-ink-faint focus:border-brand-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
      />
      <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-line bg-white px-1.5 text-[10.5px] font-medium text-ink-faint sm:block">⌘K</kbd>
      {open && q.trim().length >= 2 && (
        <div className="fixed inset-x-3 top-[calc(env(safe-area-inset-top)+3.75rem)] z-40 max-h-[70vh] overflow-y-auto rounded-xl border border-line bg-white p-1.5 shadow-pop sm:absolute sm:inset-x-0 sm:top-11">
          {error && <p className="px-3 py-3 text-[12.5px] text-rose-700">{error}</p>}
          {!error && flat.length === 0 && (
            <p className="px-3 py-3 text-[12.5px] text-ink-muted">{pending ? "Searching…" : `No results for “${q}”`}</p>
          )}
          {Object.entries(grouped).map(([kind, rows]) => (
            <div key={kind} className="py-1">
              <div className="px-3 pb-1 pt-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-ink-faint">{KIND_LABEL[kind] ?? kind}</div>
              {rows.map((r) => {
                const idx = flat.indexOf(r);
                return (
                  <button
                    key={r.kind + r.id}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => go(r)}
                    className={cn("flex w-full flex-col items-start rounded-lg px-3 py-2 text-left", idx === active ? "bg-brand-50" : "hover:bg-zinc-50")}
                  >
                    <span className="text-[13px] font-medium text-ink">{r.title}</span>
                    {r.subtitle && <span className="truncate text-[12px] text-ink-muted">{r.subtitle}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Menu({ trigger, children, align = "right", width = 240 }: {
  trigger: (open: boolean) => React.ReactNode; children: (close: () => void) => React.ReactNode; align?: "left" | "right"; width?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));
  return (
    <div ref={ref} className="relative">
      <div onClick={() => setOpen((o) => !o)}>{trigger(open)}</div>
      {open && (
        <div style={{ "--menu-w": `${width}px` } as React.CSSProperties}
          className={cn("fixed inset-x-3 top-[calc(env(safe-area-inset-top)+3.75rem)] z-40 max-h-[75vh] overflow-y-auto rounded-xl border border-line bg-white p-1.5 shadow-pop sm:absolute sm:inset-x-auto sm:top-11 sm:w-[var(--menu-w)]",
            align === "right" ? "sm:right-0" : "sm:left-0")}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

function QuickCreate() {
  const items = [
    { href: "/enquiries/new", label: "New enquiry", hint: "Log a call, DM or walk-in" },
    { href: "/events/new", label: "New event", hint: "For an existing customer" },
    { href: "/quotes/new", label: "New quote", hint: "Build a proposal for an event" },
    { href: "/clients/new", label: "New client", hint: "Checks for duplicates first" },
    { href: "/invoices/new", label: "New invoice", hint: "Deposit, final or full" },
  ];
  return (
    <Menu
      width={250}
      trigger={() => (
        <button className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-500 px-3 text-[13px] font-medium text-white shadow-sm hover:bg-brand-600">
          <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Create</span>
        </button>
      )}
    >
      {(close) => (
        <>
          {items.map((i) => (
            <Link key={i.href} href={i.href} onClick={close} className="block rounded-lg px-3 py-2 hover:bg-zinc-50">
              <div className="text-[13px] font-medium text-ink">{i.label}</div>
              <div className="text-[12px] text-ink-muted">{i.hint}</div>
            </Link>
          ))}
        </>
      )}
    </Menu>
  );
}

function Notifications({ items, unread }: { items: TopbarProps["notifications"]; unread: number }) {
  const [pending, start] = useTransition();
  return (
    <Menu
      width={360}
      trigger={() => (
        <button aria-label="Notifications" className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted hover:bg-zinc-100 hover:text-ink">
          <Bell className="h-[18px] w-[18px]" strokeWidth={1.8} />
          {unread > 0 && (
            <span className="absolute right-1 top-1 min-w-[16px] rounded-full bg-rose-500 px-1 text-center text-[10px] font-semibold leading-4 text-white">{unread}</span>
          )}
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="flex items-center justify-between px-3 pb-2 pt-1.5">
            <span className="text-[13px] font-semibold text-ink">Notifications</span>
            {unread > 0 && (
              <button
                disabled={pending}
                onClick={() => start(() => markAllNotificationsRead())}
                className="inline-flex items-center gap-1 text-[12px] font-medium text-brand-600 hover:text-brand-700"
              >
                <Check className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {items.length === 0 && <p className="px-3 py-6 text-center text-[12.5px] text-ink-muted">You’re all caught up.</p>}
            {items.map((n) => (
              <Link key={n.id} href={n.link ?? "/dashboard"} onClick={close} className="flex gap-3 rounded-lg px-3 py-2.5 hover:bg-zinc-50">
                <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-brand-500")} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium text-ink">{n.title}</span>
                  {n.body && <span className="block truncate text-[12px] text-ink-muted">{n.body}</span>}
                  <span className="text-[11.5px] text-ink-faint">{relative(n.created_at)}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </Menu>
  );
}

function OrgSwitcher({ orgs, currentOrgId }: { orgs: TopbarProps["orgs"]; currentOrgId: string }) {
  const [pending, start] = useTransition();
  const current = orgs.find((o) => o.id === currentOrgId);
  return (
    <Menu
      width={260}
      trigger={() => (
        <button className="inline-flex h-9 max-w-[220px] items-center gap-2 rounded-lg border border-line bg-white px-2.5 text-[13px] font-medium text-ink hover:bg-zinc-50">
          <Avatar name={current?.name} size={20} className="rounded-md" />
          <span className="hidden truncate md:inline">{current?.name}</span>
          <ChevronDown className="h-3.5 w-3.5 text-ink-faint" />
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="px-3 pb-1.5 pt-1 text-[10.5px] font-semibold uppercase tracking-wider text-ink-faint">Organisations</div>
          {orgs.map((o) => (
            <button
              key={o.id}
              disabled={pending}
              onClick={() => { close(); if (o.id !== currentOrgId) start(() => switchOrganisation(o.id)); }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left hover:bg-zinc-50"
            >
              <Avatar name={o.name} size={24} className="rounded-md" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-ink">{o.name}</span>
                <span className="block text-[11.5px] capitalize text-ink-muted">{o.role}</span>
              </span>
              {o.id === currentOrgId && <Check className="h-4 w-4 text-brand-600" />}
            </button>
          ))}
          <Link href="/onboarding?new=1" onClick={close} className="mt-1 block rounded-lg border-t border-line px-3 py-2 text-[12.5px] font-medium text-brand-600 hover:bg-zinc-50">
            + Create another organisation
          </Link>
        </div>
      )}
    </Menu>
  );
}

function UserMenu({ user }: { user: TopbarProps["user"] }) {
  return (
    <Menu
      width={230}
      trigger={() => (
        <button aria-label="Account" className="rounded-full ring-offset-2 hover:ring-2 hover:ring-line">
          <Avatar name={user.name} size={32} />
        </button>
      )}
    >
      {() => (
        <div>
          <div className="px-3 py-2">
            <div className="text-[13px] font-medium text-ink">{user.name}</div>
            <div className="truncate text-[12px] text-ink-muted">{user.email}</div>
          </div>
          <form action={signOut}>
            <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-ink-muted hover:bg-zinc-50 hover:text-ink">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </form>
        </div>
      )}
    </Menu>
  );
}
