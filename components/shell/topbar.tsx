"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { flushSync } from "react-dom";
import { Bell, Check, ChevronDown, Plus, Search, LogOut, PenLine, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Personalise } from "./personalise";
import { relative } from "@/lib/format";
import { Avatar } from "@/components/ui/avatar";
import { Logo, Wordmark } from "@/components/shell/sidebar";
import { globalSearch, markAllNotificationsRead, signOut, switchOrganisation, type SearchResult } from "@/app/(app)/shell-actions";

export interface TopbarProps {
  user: { name: string; email: string };
  orgs: { id: string; name: string; role: string }[];
  currentOrgId: string;
  notifications: { id: string; title: string; body: string | null; link: string | null; created_at: string; read_at: string | null; type: string }[];
  unread: number;
  role: string;
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
  const staff = props.role === "staff";
  return (
    <header className="pt-safe sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur">
      <div className="relative flex h-14 items-center gap-2 px-3 sm:gap-3 sm:px-6 lg:px-8">
        {/* Phones: the full wordmark; tablets: the E mark (room for the search box); desktop: the sidebar has the logo */}
        <Link href={staff ? "/my-jobs" : "/dashboard"} aria-label="EventureOS home" className="shrink-0 sm:hidden"><Wordmark height={20} /></Link>
        <Link href={staff ? "/my-jobs" : "/dashboard"} aria-label="EventureOS home" className="hidden shrink-0 sm:block lg:hidden"><Logo size={30} /></Link>
        {!staff && <GlobalSearch />}
        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
          {!staff && <QuickCreate canInvoice={props.role !== "sales"} />}
          <Personalise />
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
  // Phones: search is an icon that expands across the header
  const [expanded, setExpanded] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useClickOutside(box, () => { setOpen(false); if (!q.trim()) setExpanded(false); });
  function expand() {
    flushSync(() => setExpanded(true)); // render the field now so focusing it opens the keyboard on iPhone
    input.current?.focus();
    setOpen(true);
  }
  function collapse() { setOpen(false); setExpanded(false); setQ(""); }

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
    setExpanded(false);
    router.push(r.href);
  }

  return (
    <div ref={box} className={cn("min-w-0 sm:relative sm:flex-1 lg:max-w-[520px]",
      expanded ? "absolute inset-0 z-30 flex items-center gap-2 bg-surface px-3 sm:static sm:z-auto sm:bg-transparent sm:px-0" : "ml-auto sm:ml-0")}>
      {!expanded && (
        <button type="button" onClick={expand} aria-label="Search" className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted hover:bg-zinc-100 hover:text-ink sm:hidden">
          <Search className="h-[1.15rem] w-[1.15rem]" />
        </button>
      )}
      <div className={cn("relative min-w-0 flex-1", !expanded && "hidden sm:block")}>
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
          if (e.key === "Escape") { setOpen(false); if (expanded) collapse(); }
        }}
        type="search" enterKeyHint="search"
        placeholder="Search clients, events, quotes…"
        className="h-10 w-full rounded-lg border border-line bg-canvas pl-9 pr-3 text-base text-ink sm:h-9 sm:pr-14 sm:text-[0.8125rem] [&::-webkit-search-cancel-button]:hidden placeholder:text-ink-faint focus:border-brand-300 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-brand-100"
      />
      <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-line bg-surface px-1.5 text-[0.6562rem] font-medium text-ink-faint sm:block">⌘K</kbd>
      </div>
      {expanded && (
        <button type="button" onClick={collapse} className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg px-2 text-[0.875rem] font-medium text-ink-muted hover:text-ink sm:hidden">
          <X className="h-4 w-4" /><span>Cancel</span>
        </button>
      )}
      {open && q.trim().length >= 2 && (
        <div className="fixed inset-x-3 top-[calc(env(safe-area-inset-top)+3.75rem)] z-40 max-h-[70vh] overflow-y-auto rounded-xl border border-line bg-surface p-1.5 shadow-pop sm:absolute sm:inset-x-0 sm:top-11">
          {error && <p className="px-3 py-3 text-[0.7812rem] text-rose-700">{error}</p>}
          {!error && flat.length === 0 && (
            <p className="px-3 py-3 text-[0.7812rem] text-ink-muted">{pending ? "Searching…" : `No results for “${q}”`}</p>
          )}
          {Object.entries(grouped).map(([kind, rows]) => (
            <div key={kind} className="py-1">
              <div className="px-3 pb-1 pt-1.5 text-[0.6562rem] font-semibold uppercase tracking-wider text-ink-faint">{KIND_LABEL[kind] ?? kind}</div>
              {rows.map((r) => {
                const idx = flat.indexOf(r);
                return (
                  <button
                    key={r.kind + r.id}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => go(r)}
                    className={cn("flex w-full flex-col items-start rounded-lg px-3 py-2 text-left", idx === active ? "bg-brand-50" : "hover:bg-zinc-50")}
                  >
                    <span className="text-[0.8125rem] font-medium text-ink">{r.title}</span>
                    {r.subtitle && <span className="truncate text-[0.75rem] text-ink-muted">{r.subtitle}</span>}
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
          className={cn("fixed inset-x-3 top-[calc(env(safe-area-inset-top)+3.75rem)] z-40 max-h-[75vh] overflow-y-auto rounded-xl border border-line bg-surface p-1.5 shadow-pop sm:absolute sm:inset-x-auto sm:top-11 sm:w-[var(--menu-w)]",
            align === "right" ? "sm:right-0" : "sm:left-0")}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

function QuickCreate({ canInvoice }: { canInvoice: boolean }) {
  const all = [
    { href: "/enquiries/new", label: "New enquiry", hint: "Log a call, DM or walk-in" },
    { href: "/events/new", label: "New event", hint: "For an existing customer" },
    { href: "/quotes/new", label: "New quote", hint: "Build a proposal for an event" },
    { href: "/clients/new", label: "New client", hint: "Checks for duplicates first" },
    { href: "/invoices/new", label: "New invoice", hint: "Deposit, final or full" },
  ];
  const items = canInvoice ? all : all.filter((i) => !i.href.startsWith("/invoices"));
  return (
    <Menu
      width={250}
      trigger={() => (
        <button className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-500 px-3 text-[0.8125rem] font-medium text-on-brand shadow-sm hover:bg-brand-600">
          <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Create</span>
        </button>
      )}
    >
      {(close) => (
        <>
          {items.map((i) => (
            <Link key={i.href} href={i.href} onClick={close} className="block rounded-lg px-3 py-2 hover:bg-zinc-50">
              <div className="text-[0.8125rem] font-medium text-ink">{i.label}</div>
              <div className="text-[0.75rem] text-ink-muted">{i.hint}</div>
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
            <span className="absolute right-1 top-1 min-w-[16px] rounded-full bg-rose-500 px-1 text-center text-[0.625rem] font-semibold leading-4 text-white">{unread}</span>
          )}
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="flex items-center justify-between px-3 pb-2 pt-1.5">
            <span className="text-[0.8125rem] font-semibold text-ink">Notifications</span>
            {unread > 0 && (
              <button
                disabled={pending}
                onClick={() => start(() => markAllNotificationsRead())}
                className="inline-flex items-center gap-1 text-[0.75rem] font-medium text-brand-600 hover:text-brand-700"
              >
                <Check className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {items.length === 0 && <p className="px-3 py-6 text-center text-[0.7812rem] text-ink-muted">You’re all caught up.</p>}
            {items.map((n) => (
              <Link key={n.id} href={n.link ?? "/dashboard"} onClick={close} className="flex gap-3 rounded-lg px-3 py-2.5 hover:bg-zinc-50">
                <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-brand-500")} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.8125rem] font-medium text-ink">{n.title}</span>
                  {n.body && <span className="block truncate text-[0.75rem] text-ink-muted">{n.body}</span>}
                  <span className="text-[0.7188rem] text-ink-faint">{relative(n.created_at)}</span>
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
        <button className="inline-flex h-9 max-w-[220px] items-center gap-2 rounded-lg border border-line bg-surface px-2.5 text-[0.8125rem] font-medium text-ink hover:bg-zinc-50">
          <Avatar name={current?.name} size={20} className="rounded-md" />
          <span className="hidden truncate md:inline">{current?.name}</span>
          <ChevronDown className="h-3.5 w-3.5 text-ink-faint" />
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="px-3 pb-1.5 pt-1 text-[0.6562rem] font-semibold uppercase tracking-wider text-ink-faint">Organisations</div>
          {orgs.map((o) => (
            <button
              key={o.id}
              disabled={pending}
              onClick={() => { close(); if (o.id !== currentOrgId) start(() => switchOrganisation(o.id)); }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left hover:bg-zinc-50"
            >
              <Avatar name={o.name} size={24} className="rounded-md" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.8125rem] font-medium text-ink">{o.name}</span>
                <span className="block text-[0.7188rem] capitalize text-ink-muted">{o.role}</span>
              </span>
              {o.id === currentOrgId && <Check className="h-4 w-4 text-brand-600" />}
            </button>
          ))}
          <Link href="/onboarding?new=1" onClick={close} className="mt-1 block rounded-lg border-t border-line px-3 py-2 text-[0.7812rem] font-medium text-brand-600 hover:bg-zinc-50">
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
      {(close) => (
        <div>
          <div className="px-3 py-2">
            <div className="text-[0.8125rem] font-medium text-ink">{user.name}</div>
            <div className="truncate text-[0.75rem] text-ink-muted">{user.email}</div>
          </div>
          <Link href="/my-signature" onClick={close} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[0.8125rem] text-ink-muted hover:bg-zinc-50 hover:text-ink">
            <PenLine className="h-4 w-4" /> My email signature
          </Link>
          <form action={signOut}>
            <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[0.8125rem] text-ink-muted hover:bg-zinc-50 hover:text-ink">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </form>
        </div>
      )}
    </Menu>
  );
}
