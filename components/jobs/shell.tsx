import Link from "next/link";
import type { JobsOrg } from "@/lib/jobs/server";
import { brandStyle, PAGE } from "@/components/book/shell";

type Nav = { href: string; label: string; badge?: number }[];

/** The frame around every job board page, in the business's colours. */
export function JobsShell({ org, children, nav, side, wide = true }: { org: JobsOrg; children: React.ReactNode; nav?: Nav; side?: "barista" | "employer"; wide?: boolean }) {
  const base = `/jobs/${org.slug}`;
  return (
    <div style={brandStyle(org)} className="min-h-screen bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className={`${PAGE} flex min-h-16 flex-wrap items-center gap-x-4 gap-y-2 py-2`}>
          <Link href={side === "employer" ? `${base}/employers` : base} className="flex min-w-0 items-center gap-3">
            {org.logo_url && /^https:\/\//.test(org.logo_url)
              ? <img src={org.logo_url} alt={org.name} className="h-9 max-w-[140px] object-contain" />
              : null}
            <span className="truncate text-[1rem] font-semibold text-ink">{org.jobs.name}</span>
          </Link>
          <span className="flex-1" />
          {nav && nav.length > 0 && (
            <nav className="no-scrollbar -mx-1 flex w-full gap-1 overflow-x-auto sm:w-auto" aria-label="Job board">
              {nav.map((n) => (
                <Link key={n.href} href={n.href} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[0.875rem] font-medium text-ink-muted hover:bg-zinc-100 hover:text-ink">
                  {n.label}
                  {!!n.badge && <span className="rounded-full bg-[var(--b)] px-1.5 text-[0.6875rem] font-bold leading-5 text-[var(--on-b)]">{n.badge}</span>}
                </Link>
              ))}
            </nav>
          )}
        </div>
      </header>
      <main className={`${PAGE} py-6 sm:py-10`}><div className={wide ? "" : "mx-auto max-w-4xl"}>{children}</div></main>
      <footer className="pb-10 pt-4 text-center text-[0.75rem] text-ink-faint">
        <p>{org.jobs.name} · {[org.contact_phone, org.contact_email].filter(Boolean).join(" · ")}</p>
        <p className="mt-1">Phone numbers and emails stay private unless the barista chooses to share them.</p>
        <p className="mt-1">Locations © <a href="https://www.openstreetmap.org/copyright" className="underline">OpenStreetMap</a> contributors · Powered by EventureOS</p>
      </footer>
    </div>
  );
}

export const baristaNav = (slug: string, unread = 0): Nav => [
  { href: `/jobs/${slug}/me`, label: "My profile" },
  { href: `/jobs/${slug}/work`, label: "Jobs & shifts" },
  { href: `/jobs/${slug}/messages`, label: "Messages", badge: unread },
];

export const employerNav = (slug: string, unread = 0): Nav => [
  { href: `/jobs/${slug}/employers`, label: "Dashboard" },
  { href: `/jobs/${slug}/employers/search`, label: "Find baristas" },
  { href: `/jobs/${slug}/employers/post`, label: "Post a job" },
  { href: `/jobs/${slug}/employers/messages`, label: "Messages", badge: unread },
];

export const card = "rounded-2xl border border-line bg-surface p-5 shadow-card";
export const inputCls = "h-12 w-full rounded-xl border border-line-strong bg-surface px-3.5 text-base text-ink placeholder:text-ink-faint focus:border-[var(--b)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--b)_25%,transparent)]";
export const btnCls = "inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--b)] px-5 text-[0.9375rem] font-semibold text-[var(--on-b)] hover:opacity-90 disabled:opacity-50";
export const btn2Cls = "inline-flex h-11 items-center justify-center gap-1.5 rounded-xl px-4 text-[0.875rem] font-semibold text-ink ring-1 ring-line-strong hover:bg-zinc-50 disabled:opacity-50";
