import Link from "next/link";
import { notFound } from "next/navigation";
import { Award, CalendarDays, Download, LogOut, Search, Users } from "lucide-react";
import { createServiceClient } from "@/lib/integrations/runtime";
import { bookUrl, publicOrg } from "@/lib/bookings/server";
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

export default async function AgencyPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ q?: string; f?: string }> }) {
  const { org: slug } = await params;
  const sp = await searchParams;
  const org = await publicOrg(slug);
  if (!org) notFound();
  const agent = await currentAgent(org).catch(() => null);
  const signOut = <form action={agentSignOutAction.bind(null, org.slug)}><button className="inline-flex h-11 items-center gap-1.5 rounded-xl px-4 text-[0.875rem] font-semibold text-ink-muted ring-1 ring-line hover:bg-zinc-50"><LogOut className="h-4 w-4" />{agent?.scope === "portal" ? "Sign out" : "Not you?"}</button></form>;

  if (!agent) {
    return (
      <BookShell org={org} embed={false}>
        <div className="mx-auto max-w-lg">
          <div className="rounded-2xl border border-line bg-surface p-6 shadow-card">
            <p className="text-[0.75rem] font-semibold uppercase tracking-wider text-[var(--b)]">Employment agencies</p>
            <h1 className="mt-1 text-[1.5rem] font-bold tracking-tight text-ink">Case managers</h1>
            <p className="mb-5 mt-1 text-[0.9375rem] text-ink-muted">Book your job seekers into a course, get the details to pass on, and download their certificates for job applications.</p>
            <AgencyStart orgSlug={org.slug} />
          </div>
        </div>
      </BookShell>
    );
  }

  if (agent.scope === "book") {
    return (
      <BookShell org={org} embed={false}>
        <div className="mx-auto max-w-lg rounded-2xl border border-line bg-surface p-6 shadow-card">
          <p className="text-[0.75rem] font-semibold uppercase tracking-wider text-[var(--b)]">{agent.agency.name}</p>
          <h1 className="mt-1 text-[1.5rem] font-bold tracking-tight text-ink">Hi {agent.cm.name.split(/\s+/)[0]}</h1>
          <p className="mb-5 mt-1 text-[0.9375rem] text-ink-muted">You can book job seekers now. To see the ones you&apos;ve already booked, we&apos;ll email a sign-in link to {maskEmail(agent.cm.email)}.</p>
          <div className="space-y-3">
            <Link href={`/book/${org.slug}`} className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-[var(--b)] text-[0.9375rem] font-semibold text-[var(--on-b)]">Book a job seeker</Link>
            <AgentLinkButton orgSlug={org.slug} />
          </div>
          <div className="mt-5 flex justify-end">{signOut}</div>
        </div>
      </BookShell>
    );
  }

  // Signed in with the emailed link: all their job seekers
  const all = await agentJobSeekers(createServiceClient(), org, agent.cm.id);
  const q = (sp.q ?? "").trim().toLowerCase().slice(0, 60);
  const f = sp.f ?? "all";
  const list = all.filter((s) => (!q || [s.name, s.email, s.phone, s.course, s.po, s.reference].some((x) => x?.toLowerCase().includes(q)))
    && (f === "all" || (f === "upcoming" && (s.state === "upcoming" || s.state === "waitlist")) || (f === "completed" && s.state === "completed") || (f === "other" && (s.state === "no_show" || s.state === "cancelled"))));
  const people = new Set(all.map((s) => s.name.toLowerCase())).size;
  const tiles = [
    { label: "Job seekers", value: people, icon: Users },
    { label: "Coming up", value: all.filter((s) => s.state === "upcoming").length, icon: CalendarDays },
    { label: "Certificates", value: all.reduce((n, s) => n + s.certificates.length, 0), icon: Award },
  ];

  return (
    <BookShell org={org} embed={false} wide>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[0.75rem] font-semibold uppercase tracking-wider text-[var(--b)]">{agent.agency.name}</p>
          <h1 className="text-[1.625rem] font-bold tracking-tight text-ink sm:text-[2rem]">{agent.cm.name.split(/\s+/)[0]}&apos;s job seekers</h1>
        </div>
        <div className="flex gap-2">
          <Link href={`/book/${org.slug}`} className="inline-flex h-11 items-center rounded-xl bg-[var(--b)] px-4 text-[0.875rem] font-semibold text-[var(--on-b)]">Book a job seeker</Link>
          {signOut}
        </div>
      </div>

      <div className="mb-5 grid grid-cols-3 gap-3">
        {tiles.map(({ label, value, icon: I }) => (
          <div key={label} className="rounded-2xl border border-line bg-surface p-4 shadow-card">
            <I className="mb-1 h-5 w-5 text-[var(--b)]" />
            <p className="text-[1.5rem] font-bold tabular-nums text-ink">{value}</p>
            <p className="text-[0.78rem] text-ink-muted">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <form method="get" className="mb-3 flex gap-2">
            <label htmlFor="ag-q" className="sr-only">Search</label>
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
              <input id="ag-q" name="q" defaultValue={sp.q ?? ""} placeholder="Search name, course, PO…" className="h-11 w-full rounded-xl border border-line-strong bg-surface pl-9 pr-3 text-base text-ink focus:border-[var(--b)] focus:outline-none" />
            </div>
            {f !== "all" && <input type="hidden" name="f" value={f} />}
            <button className="inline-flex h-11 items-center rounded-xl px-4 text-[0.875rem] font-semibold text-ink ring-1 ring-line-strong hover:bg-zinc-50">Search</button>
          </form>
          <div className="no-scrollbar mb-4 flex gap-1.5 overflow-x-auto">
            {FILTERS.map((x) => <Link key={x.id} href={`/book/${org.slug}/agency?f=${x.id}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className={`shrink-0 rounded-full px-3 py-1.5 text-[0.8125rem] font-medium ring-1 ${f === x.id ? "bg-[var(--b)] text-[var(--on-b)] ring-[var(--b)]" : "text-ink ring-line-strong hover:bg-zinc-50"}`}>{x.label}</Link>)}
          </div>

          {all.length === 0 ? (
            <div className="rounded-2xl border border-line bg-surface p-6 text-center shadow-card">
              <p className="text-[1rem] font-semibold text-ink">No job seekers yet</p>
              <p className="mb-4 mt-1 text-[0.875rem] text-ink-muted">Everyone you book shows here, with their certificate after the course.</p>
              <Link href={`/book/${org.slug}`} className="inline-flex h-11 items-center rounded-xl bg-[var(--b)] px-4 text-[0.875rem] font-semibold text-[var(--on-b)]">Book a job seeker</Link>
            </div>
          ) : list.length === 0 ? <p className="rounded-2xl border border-line bg-surface p-5 text-[0.9375rem] text-ink-muted shadow-card">No one matches.</p> : (
            <div className="space-y-3">
              {list.map((s) => (
                <article key={s.id} className="rounded-2xl border border-line bg-surface p-5 shadow-card">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-[1.0625rem] font-semibold text-ink">{s.name}</h2>
                        <span className={`rounded-full px-2 py-0.5 text-[0.72rem] font-semibold ${STATE[s.state].cls}`}>{STATE[s.state].label}</span>
                      </div>
                      <p className="text-[0.875rem] text-ink">{s.course} · {s.when}, {s.time}</p>
                      <p className="text-[0.8125rem] text-ink-muted">{[s.reference, s.po ? `PO ${s.po}` : null, s.site, s.email ?? "no email", s.phone].filter(Boolean).join(" · ")}</p>
                    </div>
                    {(s.state === "upcoming" || s.state === "waitlist") && (
                      <Link href={`/book/${org.slug}/manage/${s.manageToken}`} className="inline-flex h-9 items-center rounded-lg px-3 text-[0.8125rem] font-semibold text-ink ring-1 ring-line hover:bg-zinc-50">Change date or cancel</Link>
                    )}
                  </div>
                  {s.certificates.length > 0 && (
                    <div className="mt-3 space-y-2 rounded-xl bg-emerald-50/60 p-3">
                      {s.certificates.map((c) => (
                        <div key={c.token} className="flex flex-wrap items-center gap-2">
                          <Award className="h-4 w-4 text-emerald-700" />
                          <span className="min-w-0 flex-1 text-[0.8438rem] text-ink">Certificate {c.number}{s.certificates.length > 1 ? ` — ${c.name}` : ""}</span>
                          <a href={`/api/book/certificate/${c.token}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--b)] px-3 text-[0.8125rem] font-semibold text-[var(--on-b)]"><Download className="h-3.5 w-3.5" />PDF</a>
                          <Link href={`/book/${org.slug}/certificate/${c.token}`} className="inline-flex h-9 items-center rounded-lg px-3 text-[0.8125rem] font-semibold text-ink ring-1 ring-line hover:bg-white">View</Link>
                          <CopyLink url={bookUrl(org, `/certificate/${c.token}`)} label="Copy link for employers" />
                        </div>
                      ))}
                    </div>
                  )}
                  {s.state === "completed" && s.certificates.length === 0 && <p className="mt-3 text-[0.8125rem] text-ink-muted">The certificate appears here shortly after the course.</p>}
                  <div className="mt-3"><SeekerActions orgSlug={org.slug} bookingId={s.id} email={s.email} phone={s.phone} canResend={s.state === "upcoming"} /></div>
                </article>
              ))}
            </div>
          )}
        </div>
        <aside className="space-y-4 lg:sticky lg:top-6">
          <section className="rounded-2xl border border-line bg-surface p-5 shadow-card">
            <h2 className="mb-1 text-[1rem] font-semibold text-ink">Your details</h2>
            <p className="mb-3 text-[0.8125rem] text-ink-muted">{agent.cm.name} · {agent.cm.email}</p>
            <AgentDetails orgSlug={org.slug} initial={{ phone: agent.cm.phone ?? "", site: agent.cm.site ?? "" }} />
          </section>
          <p className="px-1 text-[0.78rem] text-ink-muted">Certificates have a QR code employers can scan to check they&apos;re genuine. Questions? {[org.contact_phone, org.contact_email].filter(Boolean).join(" · ")}</p>
        </aside>
      </div>
    </BookShell>
  );
}
