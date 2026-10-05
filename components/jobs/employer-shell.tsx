import Link from "next/link";
import { ChevronDown, LogOut } from "lucide-react";
import type { JobsOrg } from "@/lib/jobs/server";
import { brandStyle, PAGE } from "@/components/book/shell";
import { MasterNav } from "@/components/site/master-nav";
import { employerSignOutAction } from "@/app/jobs/actions";

export type EmpNavKey = "dashboard" | "search" | "post" | "messages";

/** Dark glass card used on the employer pages. */
export const glass = "rounded-2xl border border-white/[0.12] bg-[#141013]/80 shadow-[0_30px_80px_-40px_rgba(0,0,0,.9)] backdrop-blur-xl";

/**
 * The frame around the employer pages: dark header, the café photo behind everything, and the business's colours.
 * `legacy` wraps older light-styled content in a light panel so it stays readable on the dark photo.
 */
export function EmployerShell({ org, children, me, active, unread = 0, legacy = false }: {
  org: JobsOrg; children: React.ReactNode; me?: { name: string } | null; active?: EmpNavKey; unread?: number; legacy?: boolean;
  /** @deprecated pages now use the full page width, same as the job board */ width?: string;
}) {
  const base = `/jobs/${org.slug}`;
  const nav: { key: EmpNavKey; href: string; label: string; badge?: number }[] = [
    { key: "dashboard", href: `${base}/employers`, label: "Dashboard" },
    { key: "search", href: `${base}/employers/search`, label: "Find baristas" },
    { key: "post", href: `${base}/employers/post`, label: "Post a job" },
    { key: "messages", href: `${base}/employers/messages`, label: "Messages", badge: unread },
  ];
  const initials = (me?.name ?? "").split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]!.toUpperCase()).join("") || "•";
  const bg = org.jobs.employerImage ?? org.jobs.heroImage;
  return (
    <div style={brandStyle(org)} className="relative min-h-screen bg-[#0d0a0b] text-white [color-scheme:dark]">
      {bg && <img src={bg} alt="" className="pointer-events-none fixed inset-0 h-full w-full object-cover" />}
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(90deg,rgba(12,9,10,.86)_0%,rgba(12,9,10,.5)_42%,rgba(12,9,10,.62)_100%)]" />
      <div className="relative z-30"><MasterNav org={org} active="jobs" /></div>
      <header className="relative z-20 border-b border-white/10 bg-[#100c0e]/85 backdrop-blur-md">
        <div className={`${PAGE} flex min-h-[56px] flex-wrap items-center gap-x-5 gap-y-1 py-2`}>
          <Link href={me ? `${base}/employers` : base} className="flex min-w-0 items-center gap-3">
            <span className="truncate text-[1rem] font-medium text-white">{org.jobs.name}</span>
          </Link>
          <span className="flex-1" />
          {me ? (
            <>
              <nav className="no-scrollbar order-last -mx-1 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto sm:gap-5" aria-label="Employer">
                {nav.map((n) => (
                  <Link key={n.key} href={n.href} aria-current={active === n.key ? "page" : undefined}
                    className={`relative inline-flex h-11 shrink-0 items-center gap-1.5 px-1 text-[0.875rem] font-medium transition ${active === n.key ? "text-[var(--b)]" : "text-white/80 hover:text-white"}`}>
                    {n.label}
                    {!!n.badge && <span className="rounded-full bg-[var(--b)] px-1.5 text-[0.6875rem] font-bold leading-5 text-[var(--on-b)]">{n.badge}</span>}
                    {active === n.key && <span className="absolute inset-x-0 -bottom-[9px] h-[2px] rounded-full bg-[var(--b)]" />}
                  </Link>
                ))}
              </nav>
              <details className="relative">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 [&::-webkit-details-marker]:hidden" aria-label="Account">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-[color-mix(in_srgb,var(--b)_30%,#1d1517)] text-[0.8125rem] font-semibold text-white ring-1 ring-white/25">{initials}</span>
                  <ChevronDown className="h-4 w-4 text-white/70" />
                </summary>
                <div className="absolute right-0 top-11 z-30 w-48 rounded-xl border border-white/10 bg-[#171214] p-1.5 shadow-2xl">
                  <Link href={`${base}/employers#business`} className="block rounded-lg px-3 py-2 text-[0.875rem] text-white/85 hover:bg-white/10">Business details</Link>
                  <Link href={base} className="block rounded-lg px-3 py-2 text-[0.875rem] text-white/85 hover:bg-white/10">For baristas</Link>
                  <form action={employerSignOutAction.bind(null, org.slug)}><button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[0.875rem] text-white/85 hover:bg-white/10"><LogOut className="h-4 w-4" />Sign out</button></form>
                </div>
              </details>
            </>
          ) : <Link href={base} className="text-[0.875rem] font-medium text-white/85 hover:text-white">For baristas</Link>}
        </div>
      </header>
      <main className={`${PAGE} relative z-10 py-8 sm:py-10`}>
        {legacy ? <div className="rounded-3xl bg-canvas p-5 text-ink shadow-2xl sm:p-7">{children}</div> : children}
      </main>
      <footer className="relative z-10 pb-10 pt-4 text-center text-[0.75rem] text-white/50">
        <p>{org.jobs.name} · {[org.contact_phone, org.contact_email].filter(Boolean).join(" · ")}</p>
        <p className="mt-1">Phone numbers and emails stay private unless the barista chooses to share them.</p>
        <p className="mt-1">Locations © <a href="https://www.openstreetmap.org/copyright" className="underline">OpenStreetMap</a> contributors · Powered by EventureOS</p>
      </footer>
    </div>
  );
}
