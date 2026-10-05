import Link from "next/link";
import { requireOrg } from "@/lib/context";
import { createServiceClient } from "@/lib/integrations/runtime";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { JOB_KINDS, publicName, readJobSettings } from "@/lib/jobs/core";
import { jobsOrg, jobsUrl, jobStats, welcomeEligible, welcomeEmailFor } from "@/lib/jobs/server";
import { EmployerButtons, RemovePostButton, WelcomeLetter } from "@/components/bookings/jobs-admin";

export const dynamic = "force-dynamic";

const FILTERS = [
  { id: "all", label: "Everyone sent" }, { id: "opened", label: "Opened" }, { id: "ignored", label: "Not opened" }, { id: "clicked", label: "Clicked" },
  { id: "joined", label: "Switched on" }, { id: "queued", label: "Waiting to send" }, { id: "failed", label: "Didn't send" },
] as const;
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "Australia/Sydney" }) : "—");

export default async function JobsAdmin({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const f = (await searchParams).f ?? "all";
  const { supabase, org, role } = await requireOrg();
  const canManage = ["owner", "admin", "manager"].includes(role);
  const { error: dbErr } = await supabase.from("job_invites").select("id", { head: true, count: "exact" }).eq("organisation_id", org.id);
  if (dbErr) return (<><PageHeader title="Barista jobs" /><Card className="p-6 text-[0.875rem] text-ink-muted">Run the 0051 database update (barista jobs) in Supabase first.</Card></>);

  const db = createServiceClient();
  const jo = await jobsOrg(org.slug, db);
  const settings = jo?.jobs ?? readJobSettings(org.settings, org.name);
  let iq = supabase.from("job_invites").select("id, email, status, sent_at, opened_at, clicked_at, joined_at, error, student:booking_students(name)").eq("organisation_id", org.id).order("sent_at", { ascending: false, nullsFirst: false }).limit(300);
  if (f === "opened") iq = iq.not("opened_at", "is", null);
  else if (f === "ignored") iq = iq.eq("status", "sent").is("opened_at", null);
  else if (f === "clicked") iq = iq.not("clicked_at", "is", null);
  else if (f === "joined") iq = iq.not("joined_at", "is", null);
  else if (f === "queued") iq = iq.eq("status", "queued");
  else if (f === "failed") iq = iq.in("status", ["failed", "skipped"]);
  else iq = iq.eq("status", "sent");

  const [stats, eligible, { data: invites }, { data: employers }, { data: posts }, { data: baristas }] = await Promise.all([
    jobStats(db, org.id),
    canManage ? welcomeEligible(db, org.id).then((l) => l.length) : Promise.resolve(0),
    iq,
    supabase.from("job_employers").select("id, business_name, contact_name, email, phone, website, suburb, about, status, created_at, last_active_at").eq("organisation_id", org.id).order("created_at", { ascending: false }).limit(200),
    supabase.from("job_posts").select("id, title, kind, suburb, starts_on, status, created_at, employer:job_employers(business_name)").eq("organisation_id", org.id).in("status", ["open", "filled"]).order("created_at", { ascending: false }).limit(100),
    supabase.from("job_profiles").select("id, display_name, suburb, activated_at, last_active_at, student:booking_students(name, email)").eq("organisation_id", org.id).eq("status", "active").order("activated_at", { ascending: false }).limit(300),
  ]);
  const preview = jo ? await welcomeEmailFor(jo, { name: "Charlotte Sample", token: "0".repeat(40) }) : null;
  const emps = (employers ?? []) as { id: string; business_name: string; contact_name: string; email: string; phone: string | null; website: string | null; suburb: string | null; about: string | null; status: string; created_at: string; last_active_at: string | null }[];
  const pending = emps.filter((e) => e.status === "pending");
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
  const sentAll = stats.sent;

  const tiles: { label: string; value: string | number; sub?: string }[] = [
    { label: "Total on your list", value: stats.total, sub: `${stats.withEmail} with an email` },
    { label: "Active baristas", value: stats.active, sub: "Profile switched on" },
    { label: "Welcome letter sent", value: sentAll, sub: stats.queued ? `${stats.queued} waiting to send` : undefined },
    { label: "Opened", value: stats.opened, sub: `${pct(stats.opened, sentAll)} of sent` },
    { label: "Not opened", value: Math.max(0, sentAll - stats.opened) },
    { label: "Clicked", value: stats.clicked, sub: `${stats.joined} switched on` },
    { label: "Employers", value: stats.employersApproved, sub: stats.employersPending ? `${stats.employersPending} waiting for approval` : "approved" },
    { label: "Jobs on the board", value: stats.openJobs, sub: `${stats.filledJobs} filled` },
  ];

  return (
    <>
      <PageHeader title={settings.name} subtitle="Your barista job board — students switch on a profile, approved employers search and post jobs. Phone numbers and emails stay private unless the barista shares them."
        actions={jo ? <a href={jobsUrl(jo)} target="_blank" rel="noreferrer" className="text-[0.8125rem] font-semibold text-brand-700 hover:underline">Open the job board ↗</a> : null} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label} className="p-4">
            <p className="text-[0.75rem] font-medium text-ink-muted">{t.label}</p>
            <p className="mt-1 text-[1.5rem] font-bold tabular-nums text-ink">{t.value}</p>
            {t.sub && <p className="text-[0.75rem] text-ink-muted">{t.sub}</p>}
          </Card>
        ))}
      </div>
      <p className="mt-2 text-[0.75rem] text-ink-faint">“Opened” is a guide: some email apps load images automatically (counts as opened) and some block them (won&apos;t count). Clicks are reliable.</p>

      {pending.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-[0.9375rem] font-semibold text-ink">Employers waiting for approval <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-[0.75rem] text-amber-900">{pending.length}</span></h2>
          <div className="space-y-2">
            {pending.map((e) => (
              <Card key={e.id} className="p-4">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1 text-[0.875rem]">
                    <p className="font-semibold text-ink">{e.business_name} <span className="font-normal text-ink-muted">· {e.suburb ?? "no suburb"} · signed up {day(e.created_at)}</span></p>
                    <p className="text-ink">{e.contact_name} · {e.email}{e.phone ? ` · ${e.phone}` : ""}{e.website ? ` · ${e.website}` : ""}</p>
                    {e.about && <p className="mt-1 whitespace-pre-line text-ink-muted">{e.about}</p>}
                  </div>
                  {canManage && <EmployerButtons id={e.id} status={e.status} />}
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {canManage && preview && (
        <section className="mt-8">
          <h2 className="mb-1 text-[0.9375rem] font-semibold text-ink">Welcome letter</h2>
          <p className="mb-3 text-[0.8125rem] text-ink-muted">Introduce the job board to everyone who has trained with you. Each person gets their own button that takes them straight to their profile.</p>
          <Card className="p-5"><WelcomeLetter initial={settings} previewHtml={preview.html} eligible={eligible} queued={stats.queued} publicUrl={jo ? jobsUrl(jo) : "#"} /></Card>
        </section>
      )}

      <section className="mt-8">
        <h2 className="mb-2 text-[0.9375rem] font-semibold text-ink">Who&apos;s opened it</h2>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {FILTERS.map((x) => <Link key={x.id} href={`/bookings/jobs?f=${x.id}`} className={`rounded-full px-3 py-1.5 text-[0.8125rem] font-medium ring-1 ${f === x.id ? "bg-brand-500 text-on-brand ring-brand-500" : "text-ink ring-line-strong hover:bg-zinc-50"}`}>{x.label}</Link>)}
        </div>
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-[0.8438rem]">
            <thead><tr className="border-b border-line text-left text-[0.75rem] text-ink-muted"><th className="px-4 py-2 font-medium">Name</th><th className="px-2 py-2 font-medium">Email</th><th className="px-2 py-2 font-medium">Sent</th><th className="px-2 py-2 font-medium">Opened</th><th className="px-2 py-2 font-medium">Clicked</th><th className="px-2 py-2 font-medium">Switched on</th></tr></thead>
            <tbody>
              {((invites ?? []) as unknown as { id: string; email: string; status: string; sent_at: string | null; opened_at: string | null; clicked_at: string | null; joined_at: string | null; error: string | null; student: { name: string } | null }[]).map((i) => (
                <tr key={i.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-2 text-ink">{i.student?.name ?? "—"}</td>
                  <td className="px-2 py-2 text-ink-muted">{i.email}{i.error ? <span className="block text-rose-700">{i.error}</span> : null}</td>
                  <td className="px-2 py-2">{i.status === "sent" ? day(i.sent_at) : i.status === "queued" ? "Waiting" : i.status === "skipped" ? "Unsubscribed" : "Failed"}</td>
                  <td className="px-2 py-2">{day(i.opened_at)}</td>
                  <td className="px-2 py-2">{day(i.clicked_at)}</td>
                  <td className="px-2 py-2">{i.joined_at ? <span className="font-semibold text-emerald-700">{day(i.joined_at)}</span> : "—"}</td>
                </tr>
              ))}
              {(invites ?? []).length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-ink-muted">Nobody here yet.</td></tr>}
            </tbody>
          </table>
        </Card>
        {(invites ?? []).length >= 300 && <p className="mt-1 text-[0.75rem] text-ink-muted">Showing the latest 300.</p>}
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-2 text-[0.9375rem] font-semibold text-ink">Baristas on the board ({stats.active})</h2>
          <Card className="max-h-[420px] divide-y divide-line overflow-y-auto p-0">
            {((baristas ?? []) as unknown as { id: string; display_name: string | null; suburb: string | null; activated_at: string | null; student: { name: string; email: string | null } | null }[]).map((b) => (
              <div key={b.id} className="flex items-center gap-3 px-4 py-2.5 text-[0.8438rem]">
                <span className="min-w-0 flex-1 text-ink">{b.student?.name ?? publicName("", b.display_name)}<span className="block text-[0.75rem] text-ink-muted">{b.student?.email}</span></span>
                <span className="text-ink-muted">{b.suburb ?? "—"}</span>
                <span className="text-[0.75rem] text-ink-faint">since {day(b.activated_at)}</span>
              </div>
            ))}
            {(baristas ?? []).length === 0 && <p className="px-4 py-6 text-center text-[0.8438rem] text-ink-muted">No one has switched their profile on yet.</p>}
          </Card>
        </div>
        <div>
          <h2 className="mb-2 text-[0.9375rem] font-semibold text-ink">Jobs</h2>
          <Card className="max-h-[420px] divide-y divide-line overflow-y-auto p-0">
            {((posts ?? []) as unknown as { id: string; title: string; kind: string; suburb: string | null; starts_on: string | null; status: string; employer: { business_name: string } | null }[]).map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-2.5 text-[0.8438rem]">
                <span className="min-w-0 flex-1 text-ink">{p.title}<span className="block text-[0.75rem] text-ink-muted">{p.employer?.business_name} · {JOB_KINDS.find((k) => k.id === p.kind)?.label}{p.suburb ? ` · ${p.suburb}` : ""}</span></span>
                <span className={p.status === "open" ? "text-emerald-700" : "text-ink-muted"}>{p.status === "open" ? "Open" : "Filled"}</span>
                {canManage && p.status === "open" && <RemovePostButton id={p.id} />}
              </div>
            ))}
            {(posts ?? []).length === 0 && <p className="px-4 py-6 text-center text-[0.8438rem] text-ink-muted">No jobs posted yet.</p>}
          </Card>
        </div>
      </section>

      {emps.some((e) => e.status !== "pending") && (
        <section className="mt-8">
          <h2 className="mb-2 text-[0.9375rem] font-semibold text-ink">All employers</h2>
          <Card className="divide-y divide-line p-0">
            {emps.filter((e) => e.status !== "pending").map((e) => (
              <div key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-[0.8438rem]">
                <span className="min-w-0 flex-1 text-ink">{e.business_name}<span className="block text-[0.75rem] text-ink-muted">{e.contact_name} · {e.email}{e.last_active_at ? ` · last seen ${day(e.last_active_at)}` : ""}</span></span>
                <span className={e.status === "approved" ? "text-emerald-700" : "text-rose-700"}>{e.status === "approved" ? "Approved" : "Blocked"}</span>
                {canManage && <EmployerButtons id={e.id} status={e.status} />}
              </div>
            ))}
          </Card>
        </section>
      )}
    </>
  );
}
