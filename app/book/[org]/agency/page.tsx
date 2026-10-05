import Link from "next/link";
import { notFound } from "next/navigation";
import { Award, CalendarDays, Download, FileCheck2, LogOut, Mail, Search, Send, Users } from "lucide-react";
import { createServiceClient } from "@/lib/integrations/runtime";
import { sessionWhen } from "@/lib/bookings/core";
import { bookUrl, catalogue, publicOrg, type PublicOrg } from "@/lib/bookings/server";
import { agentJobSeekers, currentAgent, maskEmail, type JobSeeker } from "@/lib/bookings/agents";
import { agentSignOutAction } from "@/app/book/agent-actions";
import { BookShell } from "@/components/book/shell";
import { AgencyStart, AgentDetails, AgentLinkButton, CopyLink, SeekerActions } from "@/components/book/agent-tools";

export const dynamic = "force-dynamic";
export const metadata = { title: "Case managers", robots: { index: false, follow: false } };

const STATE: Record<JobSeeker["state"], { label: string; cls: string }> = {
  upcoming: { label: "Booked", cls: "bg-sky-50 text-sky-800" },
  waitlist: { label: "Waitlist", cls: "bg-amber-50 text-amber-900" },
  completed: { label: "Completed", cls: "bg-emerald-50 text-emerald-800" },
  no_show: { label: "Didn't attend", cls: "bg-rose-50 text-rose-800" },
  cancelled: { label: "Cancelled", cls: "bg-zinc-100 text-ink-muted" },
};
const FILTERS = [{ id: "all", label: "All" }, { id: "upcoming", label: "Coming up" }, { id: "completed", label: "Completed" }, { id: "other", label: "Didn't attend / cancelled" }] as const;
const card = "rounded-2xl border border-line bg-surface shadow-card";

/** The next course dates (with seats left), to help pick a date before booking. */
async function UpcomingDates({ org, limit = 8 }: { org: PublicOrg; limit?: number }) {
  const data = await catalogue(org, { days: 120 }).catch(() => null);
  const names = new Map((data?.courses ?? []).map((c) => [c.id, { name: c.name, slug: c.slug }]));
  const list = (data?.sessions ?? []).slice(0, limit);
  return (
    <section className={`${card} p-5`}>
      <h2 className="mb-3 flex items-center gap-2 text-[1rem] font-semibold text-ink"><CalendarDays className="h-4 w-4 text-[var(--b)]" />Upcoming dates</h2>
      {list.length === 0 ? <p className="text-[0.875rem] text-ink-muted">New dates coming soon.</p> : (
        <ul className="divide-y divide-line">
          {list.map((s) => {
            const c = names.get(s.course_id);
            const w = sessionWhen(s.starts_at, s.ends_at, org.timezone);
            return (
              <li key={s.id}>
                <Link href={`/book/${org.slug}/${c?.slug ?? ""}?session=${s.id}`} className="flex items-center gap-3 py-2.5 text-[0.875rem] hover:bg-zinc-50">
                  <span className="min-w-0 flex-1"><span className="block font-medium text-ink">{w.short} · {w.start}</span><span className="block truncate text-[0.8125rem] text-ink-muted">{c?.name}</span></span>
                  <span className={`shrink-0 text-[0.78rem] font-semibold ${s.full ? "text-amber-700" : "text-emerald-700"}`}>{s.full ? "Full" : `${s.left} left`}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default async function AgencyPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ q?: string; f?: string }> }) {
  const { org: slug } = await params;
  const sp = await searchParams;
  const org = await publicOrg(slug);
  if (!org) notFound();
  const agent = await currentAgent(org).catch(() => null);
  const signOut = <form action={agentSignOutAction.bind(null, org.slug)}><button className="inline-flex h-11 items-center gap-1.5 rounded-xl px-4 text-[0.875rem] font-semibold text-ink-muted ring-1 ring-line hover:bg-zinc-50"><LogOut className="h-4 w-4" />{agent?.scope === "portal" ? "Sign out" : "Not you?"}</button></form>;

  // ---------- not signed in: what it's for (left) + agency code and name (right)
  if (!agent) {
    const perks = [
      { i: Send, t: "Book job seekers in minutes", d: "Pick a date, enter their name and the PO — no payment, we invoice your organisation." },
      { i: Mail, t: "Course details to pass on", d: "You get an email with the date, location and what to bring, ready to forward to your client." },
      { i: Award, t: "Certificates for job applications", d: "After the course their certificate is emailed to you as a PDF, with a QR code employers can check." },
      { i: Users, t: "All your job seekers in one place", d: "See who's booked, who's finished, and download certificates any time." },
    ];
    return (
      <BookShell org={org} embed={false}>
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_480px] lg:gap-12">
          <div className="lg:pt-4">
            <p className="text-[0.8125rem] font-semibold uppercase tracking-wider text-[var(--b)]">Employment agencies</p>
            <h1 className="mt-1 text-[2rem] font-bold leading-tight tracking-tight text-ink sm:text-[2.5rem]">Case manager portal</h1>
            <p className="mt-3 max-w-2xl text-[1.0625rem] text-ink-muted">Book your job seekers into {org.name} courses, get the details to pass on, and download their certificates for job applications.</p>
            <ul className="mt-8 grid gap-4 sm:grid-cols-2">
              {perks.map(({ i: I, t, d }) => (
                <li key={t} className={`${card} p-5`}><I className="mb-2 h-5 w-5 text-[var(--b)]" /><p className="font-semibold text-ink">{t}</p><p className="mt-1 text-[0.875rem] text-ink-muted">{d}</p></li>
              ))}
            </ul>
            <div className="mt-8 hidden lg:block"><UpcomingDates org={org} limit={6} /></div>
          </div>
          <div className={`${card} order-first p-6 sm:p-8 lg:sticky lg:top-6 lg:order-none`}>
            <h2 className="text-[1.375rem] font-bold tracking-tight text-ink">Sign in</h2>
            <p className="mb-5 mt-1 text-[0.9375rem] text-ink-muted">Enter your agency code, then choose your name.</p>
            <AgencyStart orgSlug={org.slug} />
          </div>
        </div>
      </BookShell>
    );
  }

  // ---------- picked their name: book now; seeing past job seekers needs the emailed link
  if (agent.scope === "book") {
    return (
      <BookShell org={org} embed={false}>
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-12">
          <div className={`${card} p-6 sm:p-8`}>
            <p className="text-[0.8125rem] font-semibold uppercase tracking-wider text-[var(--b)]">{agent.agency.name}</p>
            <h1 className="mt-1 text-[1.875rem] font-bold tracking-tight text-ink">Hi {agent.cm.name.split(/\s+/)[0]}</h1>
            <p className="mb-6 mt-2 max-w-xl text-[1rem] text-ink-muted">You can book job seekers straight away. To see the ones you&apos;ve already booked, we&apos;ll email a sign-in link to {maskEmail(agent.cm.email)}.</p>
            <div className="grid max-w-xl gap-3 sm:grid-cols-2">
              <Link href={`/book/${org.slug}`} className="inline-flex h-12 items-center justify-center rounded-xl bg-[var(--b)] text-[0.9375rem] font-semibold text-[var(--on-b)]">Book a job seeker</Link>
              <AgentLinkButton orgSlug={org.slug} label="See my job seekers" />
            </div>
            <div className="mt-8 flex justify-end">{signOut}</div>
          </div>
          <UpcomingDates org={org} />
        </div>
      </BookShell>
    );
  }

  // ---------- signed in with the emailed link: all their job seekers
  const all = await agentJobSeekers(createServiceClient(), org, agent.cm.id);
  const q = (sp.q ?? "").trim().toLowerCase().slice(0, 60);
  const f = sp.f ?? "all";
  const list = all.filter((s) => (!q || [s.name, s.email, s.phone, s.course, s.po, s.reference].some((x) => x?.toLowerCase().includes(q)))
    && (f === "all" || (f === "upcoming" && (s.state === "upcoming" || s.state === "waitlist")) || (f === "completed" && s.state === "completed") || (f === "other" && (s.state === "no_show" || s.state === "cancelled"))));
  const tiles = [
    { label: "Job seekers", value: new Set(all.map((s) => s.name.toLowerCase())).size, icon: Users },
    { label: "Coming up", value: all.filter((s) => s.state === "upcoming").length, icon: CalendarDays },
    { label: "Completed", value: all.filter((s) => s.state === "completed").length, icon: FileCheck2 },
    { label: "Certificates", value: all.reduce((n, s) => n + s.certificates.length, 0), icon: Award },
  ];

  return (
    <BookShell org={org} embed={false}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[0.8125rem] font-semibold uppercase tracking-wider text-[var(--b)]">{agent.agency.name}</p>
          <h1 className="text-[1.75rem] font-bold tracking-tight text-ink sm:text-[2.125rem]">{agent.cm.name.split(/\s+/)[0]}&apos;s job seekers</h1>
        </div>
        <div className="flex gap-2">
          <Link href={`/book/${org.slug}`} className="inline-flex h-11 items-center rounded-xl bg-[var(--b)] px-5 text-[0.9375rem] font-semibold text-[var(--on-b)]">Book a job seeker</Link>
          {signOut}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map(({ label, value, icon: I }) => (
          <div key={label} className={`${card} flex items-center gap-4 p-5`}>
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--b)_12%,white)]"><I className="h-5 w-5 text-[var(--b)]" /></span>
            <span><span className="block text-[1.625rem] font-bold leading-none tabular-nums text-ink">{value}</span><span className="text-[0.8125rem] text-ink-muted">{label}</span></span>
          </div>
        ))}
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
              {FILTERS.map((x) => <Link key={x.id} href={`/book/${org.slug}/agency?f=${x.id}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className={`shrink-0 rounded-full px-3.5 py-2 text-[0.8438rem] font-medium ring-1 ${f === x.id ? "bg-[var(--b)] text-[var(--on-b)] ring-[var(--b)]" : "bg-surface text-ink ring-line-strong hover:bg-zinc-50"}`}>{x.label}</Link>)}
            </div>
            <form method="get" className="flex gap-2 lg:w-[420px]">
              <label htmlFor="ag-q" className="sr-only">Search</label>
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
                <input id="ag-q" name="q" defaultValue={sp.q ?? ""} placeholder="Search name, course, PO…" className="h-11 w-full rounded-xl border border-line-strong bg-surface pl-9 pr-3 text-base text-ink focus:border-[var(--b)] focus:outline-none" />
              </div>
              {f !== "all" && <input type="hidden" name="f" value={f} />}
              <button className="inline-flex h-11 items-center rounded-xl px-4 text-[0.875rem] font-semibold text-ink ring-1 ring-line-strong hover:bg-zinc-50">Search</button>
            </form>
          </div>

          {all.length === 0 ? (
            <div className={`${card} p-8 text-center`}>
              <p className="text-[1.0625rem] font-semibold text-ink">No job seekers yet</p>
              <p className="mb-4 mt-1 text-[0.9375rem] text-ink-muted">Everyone you book shows here, with their certificate after the course.</p>
              <Link href={`/book/${org.slug}`} className="inline-flex h-11 items-center rounded-xl bg-[var(--b)] px-5 text-[0.875rem] font-semibold text-[var(--on-b)]">Book a job seeker</Link>
            </div>
          ) : list.length === 0 ? <p className={`${card} p-6 text-[0.9375rem] text-ink-muted`}>No one matches.</p> : (
            <div className={`${card} overflow-hidden`}>
              {/* Column headings (desktop) */}
              <div className="hidden grid-cols-[minmax(0,1.3fr)_minmax(0,1.5fr)_120px_minmax(0,1fr)_minmax(0,1.2fr)] gap-4 border-b border-line bg-zinc-50 px-5 py-3 text-[0.75rem] font-semibold uppercase tracking-wider text-ink-faint lg:grid">
                <span>Job seeker</span><span>Course</span><span>Status</span><span>PO · office</span><span>Certificate</span>
              </div>
              <ul className="divide-y divide-line">
                {list.map((s) => (
                  <li key={s.id} className="px-5 py-4">
                    <div className="grid gap-x-4 gap-y-2 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.5fr)_120px_minmax(0,1fr)_minmax(0,1.2fr)] lg:items-start">
                      <div className="min-w-0">
                        <p className="font-semibold text-ink">{s.name}</p>
                        <p className="truncate text-[0.8125rem] text-ink-muted">{[s.email ?? "no email", s.phone].filter(Boolean).join(" · ")}</p>
                      </div>
                      <div className="min-w-0 text-[0.875rem]">
                        <p className="text-ink">{s.course}</p>
                        <p className="text-[0.8125rem] text-ink-muted">{s.when}, {s.time}</p>
                      </div>
                      <div><span className={`inline-block rounded-full px-2.5 py-1 text-[0.75rem] font-semibold ${STATE[s.state].cls}`}>{STATE[s.state].label}</span></div>
                      <div className="text-[0.8125rem] text-ink-muted"><span className="lg:block">{s.po ? `PO ${s.po}` : "—"}</span>{s.site && <span className="lg:block"> · {s.site}</span>}<span className="block text-[0.75rem] text-ink-faint">{s.reference}</span></div>
                      <div className="flex flex-wrap gap-2">
                        {s.certificates.length > 0 ? s.certificates.map((c) => (
                          <span key={c.token} className="flex flex-wrap gap-2">
                            <a href={`/api/book/certificate/${c.token}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--b)] px-3 text-[0.8125rem] font-semibold text-[var(--on-b)]" title={`Certificate ${c.number}`}><Download className="h-3.5 w-3.5" />PDF</a>
                            <CopyLink url={bookUrl(org, `/certificate/${c.token}`)} label="Copy link" />
                          </span>
                        )) : <span className="text-[0.8125rem] text-ink-faint">{s.state === "completed" ? "Coming shortly" : "After the course"}</span>}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-start gap-2">
                      {(s.state === "upcoming" || s.state === "waitlist") && (
                        <Link href={`/book/${org.slug}/manage/${s.manageToken}`} className="inline-flex h-9 items-center rounded-lg px-3 text-[0.8125rem] font-semibold text-ink ring-1 ring-line hover:bg-zinc-50">Change date or cancel</Link>
                      )}
                      <div className="min-w-0 flex-1"><SeekerActions orgSlug={org.slug} bookingId={s.id} email={s.email} phone={s.phone} canResend={s.state === "upcoming"} /></div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <aside className="grid gap-4 sm:grid-cols-2 xl:sticky xl:top-6 xl:grid-cols-1">
          <UpcomingDates org={org} limit={6} />
          <section className={`${card} p-5`}>
            <h2 className="mb-1 text-[1rem] font-semibold text-ink">Your details</h2>
            <p className="mb-3 text-[0.8125rem] text-ink-muted">{agent.cm.name} · {agent.cm.email}</p>
            <AgentDetails orgSlug={org.slug} initial={{ phone: agent.cm.phone ?? "", site: agent.cm.site ?? "" }} />
            <p className="mt-4 text-[0.78rem] text-ink-muted">Certificates have a QR code employers can scan to check they&apos;re genuine. Questions? {[org.contact_phone, org.contact_email].filter(Boolean).join(" · ")}</p>
          </section>
        </aside>
      </div>
    </BookShell>
  );
}
