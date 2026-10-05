import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock, LogOut, Plus, Search } from "lucide-react";
import { createServiceClient } from "@/lib/integrations/runtime";
import { JOB_KINDS } from "@/lib/jobs/core";
import { currentEmployer, jobsOrg, POST_COLS, unreadFor, type Post } from "@/lib/jobs/server";
import { employerSignOutAction } from "@/app/jobs/actions";
import { card, employerNav, JobsShell } from "@/components/jobs/shell";
import { EmployerAuth, EmployerDetailsForm, PostStatusButtons } from "@/components/jobs/tools";

export const dynamic = "force-dynamic";
export const metadata = { title: "Employers", robots: { index: false, follow: false } };

export default async function EmployerHome({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ posted?: string }> }) {
  const { org: slug } = await params;
  const org = await jobsOrg(slug);
  if (!org || !org.jobs.enabled) notFound();
  const emp = await currentEmployer(org).catch(() => null);
  const db = createServiceClient();

  if (!emp) {
    const { count } = await db.from("job_profiles").select("id", { count: "exact", head: true }).eq("organisation_id", org.id).eq("status", "active");
    return (
      <JobsShell org={org} side="employer" nav={[{ href: `/jobs/${slug}`, label: "For baristas" }]}>
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div>
            <p className="text-[0.8125rem] font-semibold uppercase tracking-wider text-[var(--b)]">For cafés, carts & events</p>
            <h1 className="mt-1 text-[2rem] font-bold leading-tight tracking-tight text-ink sm:text-[2.5rem]">Find trained baristas near you</h1>
            <p className="mt-3 max-w-xl text-[1.0625rem] text-ink-muted">Search baristas trained by {org.name} by suburb and availability, message them, and post one-off shifts, events or regular spots.</p>
            {(count ?? 0) > 0 && <p className="mt-4 text-[0.9375rem] font-semibold text-ink">{count} baristas on the board right now.</p>}
            <ul className="mt-6 space-y-2 text-[0.9375rem] text-ink">
              <li>• Free for cafés, coffee carts and event businesses.</li>
              <li>• Baristas choose whether to share their phone and email — message them through the board first.</li>
              <li>• When a job is filled, mark it filled and it comes off the board.</li>
            </ul>
          </div>
          <div className={card}><h2 className="mb-4 text-[1.25rem] font-bold text-ink">Employers</h2><EmployerAuth slug={slug} approval={org.jobs.employerApproval} /></div>
        </div>
      </JobsShell>
    );
  }

  const [{ data: posts }, unread] = await Promise.all([
    db.from("job_posts").select(POST_COLS).eq("employer_id", emp.id).neq("status", "removed").order("created_at", { ascending: false }).limit(50),
    unreadFor(db, "employer", emp.id),
  ]);
  const list = (posts ?? []) as Post[];
  const approved = emp.status === "approved";

  return (
    <JobsShell org={org} side="employer" nav={approved ? employerNav(slug, unread) : []}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[1.625rem] font-bold tracking-tight text-ink sm:text-[2rem]">{emp.business_name}</h1>
          <p className="text-[0.9375rem] text-ink-muted">Signed in as {emp.contact_name} · {emp.email}</p>
        </div>
        <form action={employerSignOutAction.bind(null, slug)}><button className="inline-flex h-11 items-center gap-1.5 rounded-xl px-4 text-[0.875rem] font-semibold text-ink-muted ring-1 ring-line hover:bg-zinc-50"><LogOut className="h-4 w-4" />Sign out</button></form>
      </div>
      {!approved && <div className="mb-6 flex items-start gap-3 rounded-2xl bg-amber-50 p-5 text-amber-950"><Clock className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-semibold">Thanks for signing up — we&apos;re checking your details.</p><p className="text-[0.9375rem]">We&apos;ll email you as soon as you can search baristas and post jobs (usually within a day).</p></div></div>}
      {(await searchParams).posted && approved && <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-[0.9375rem] text-emerald-900">Your job is live — baristas can see it now.</p>}
      <div className="space-y-6">
        <div className="min-w-0 space-y-4">
          {approved && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Link href={`/jobs/${slug}/employers/search`} className={`${card} flex items-center gap-3 hover:bg-zinc-50`}><Search className="h-6 w-6 text-[var(--b)]" /><span><span className="block font-semibold text-ink">Find baristas</span><span className="text-[0.8125rem] text-ink-muted">By suburb, days and skills</span></span></Link>
              <Link href={`/jobs/${slug}/employers/post`} className={`${card} flex items-center gap-3 hover:bg-zinc-50`}><Plus className="h-6 w-6 text-[var(--b)]" /><span><span className="block font-semibold text-ink">Post a job or shift</span><span className="text-[0.8125rem] text-ink-muted">One-off, event or regular</span></span></Link>
            </div>
          )}
          {approved && (
            <section>
              <h2 className="mb-2 text-[1.0625rem] font-semibold text-ink">Your jobs</h2>
              {list.length === 0 ? <p className={`${card} text-[0.9375rem] text-ink-muted`}>No jobs posted yet.</p> : (
                <div className="space-y-3">
                  {list.map((p) => (
                    <div key={p.id} className={card}>
                      <div className="flex flex-wrap items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-[0.72rem] font-semibold uppercase tracking-wider text-ink-faint">{JOB_KINDS.find((k) => k.id === p.kind)?.label} · {p.status === "open" ? "On the board" : p.status === "filled" ? "Filled" : "Closed"}</p>
                          <p className="font-semibold text-ink">{p.title}</p>
                          <p className="text-[0.8125rem] text-ink-muted">{[p.suburb, p.starts_on, p.times, p.pay].filter(Boolean).join(" · ")}</p>
                        </div>
                        <Link href={`/jobs/${slug}/employers/post?id=${p.id}`} className="text-[0.8125rem] font-semibold text-[var(--b)]">Edit</Link>
                      </div>
                      <div className="mt-3"><PostStatusButtons slug={slug} postId={p.id} status={p.status} /></div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
        <section className={card}>
          <h2 className="mb-1 text-[1rem] font-semibold text-ink">Your business</h2>
          <p className="mb-4 text-[0.8125rem] text-ink-muted">Baristas see these details on your jobs and when you get in touch, so they know who you are.</p>
          <EmployerDetailsForm slug={slug} initial={{ business: emp.business_name, name: emp.contact_name, phone: emp.phone ?? "", website: emp.website ?? "", instagram: emp.instagram ?? "",
            address: emp.address ?? "", suburb: emp.suburb ?? "", state: emp.state ?? "", postcode: emp.postcode ?? "", about: emp.about ?? "", equipment: emp.equipment }} />
        </section>
      </div>
    </JobsShell>
  );
}
