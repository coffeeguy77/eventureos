import Link from "next/link";
import { notFound } from "next/navigation";
import { Briefcase, CalendarDays, Lock, MapPin, Search, ShieldCheck } from "lucide-react";
import { createServiceClient } from "@/lib/integrations/runtime";
import { currentStudent } from "@/lib/bookings/student-auth";
import { JOB_KINDS } from "@/lib/jobs/core";
import { jobsOrg, openPosts } from "@/lib/jobs/server";
import { card, JobsShell } from "@/components/jobs/shell";
import { BaristaAuth } from "@/components/jobs/tools";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ org: string }> }) {
  const org = await jobsOrg((await params).org);
  return { title: org?.jobs.name ?? "Barista jobs", description: org ? `Find trained baristas, or find barista work — ${org.jobs.name}.` : undefined };
}

export default async function JobsHome({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ join?: string }> }) {
  const { org: slug } = await params;
  const org = await jobsOrg(slug);
  if (!org || !org.jobs.enabled) notFound();
  const me = await currentStudent(org).catch(() => null);
  const posts = await openPosts(createServiceClient(), org.id).catch(() => []);
  const joining = (await searchParams).join === "1";

  return (
    <JobsShell org={org} nav={me ? [{ href: `/jobs/${slug}/me`, label: "My profile" }, { href: `/jobs/${slug}/work`, label: "Jobs & shifts" }] : [{ href: `/jobs/${slug}/employers`, label: "For employers" }]}>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div>
          <p className="text-[0.8125rem] font-semibold uppercase tracking-wider text-[var(--b)]">Free for baristas</p>
          <h1 className="mt-1 text-[2rem] font-bold leading-tight tracking-tight text-ink sm:text-[2.5rem]">{org.jobs.name}</h1>
          <p className="mt-3 max-w-xl text-[1.0625rem] text-ink-muted">Cafés, coffee carts and event companies looking for staff can find trained baristas — and post shifts and jobs you can say yes to.</p>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {[
              { i: Lock, t: "Your details stay private", d: "Employers never see your phone or email unless you choose to share them." },
              { i: MapPin, t: "Work near you", d: "Add your suburb and how far you'll travel." },
              { i: CalendarDays, t: "Only when you're free", d: "Weekends only? Mornings? You choose." },
              { i: ShieldCheck, t: "Show you're trained", d: `Your ${org.name} certificate appears on your profile.` },
            ].map(({ i: I, t, d }) => (
              <li key={t} className={card}><I className="mb-2 h-5 w-5 text-[var(--b)]" /><p className="font-semibold text-ink">{t}</p><p className="text-[0.875rem] text-ink-muted">{d}</p></li>
            ))}
          </ul>

          <section className="mt-8">
            <h2 className="mb-2 flex items-center gap-2 text-[1.0625rem] font-semibold text-ink"><Briefcase className="h-5 w-5 text-[var(--b)]" />Jobs & shifts right now</h2>
            {posts.length === 0 ? <p className={`${card} text-[0.9375rem] text-ink-muted`}>No open jobs at the moment — set up your profile so employers can find you.</p> : (
              <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
                {posts.slice(0, 8).map((p) => (
                  <div key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3">
                    <span className="min-w-0 flex-1 font-medium text-ink">{p.title}</span>
                    <span className="text-[0.8125rem] text-ink-muted">{JOB_KINDS.find((k) => k.id === p.kind)?.label}{p.suburb ? ` · ${p.suburb}` : ""}</span>
                  </div>
                ))}
                <p className="px-5 py-3 text-[0.8125rem] text-ink-muted">{me ? <Link href={`/jobs/${slug}/work`} className="font-semibold text-[var(--b)]">See all and apply →</Link> : "Sign in to see details and apply."}</p>
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6">
          <div className={card}>
            {me ? (<>
              <h2 className="text-[1.25rem] font-bold text-ink">Welcome back, {me.name.split(/\s+/)[0]}</h2>
              <p className="mb-4 mt-1 text-[0.9375rem] text-ink-muted">Keep your profile up to date so employers can find you.</p>
              <Link href={`/jobs/${slug}/me`} className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-[var(--b)] font-semibold text-[var(--on-b)]">My profile</Link>
            </>) : (<>
              <h2 className="text-[1.25rem] font-bold text-ink">Baristas</h2>
              <p className="mb-4 mt-1 text-[0.9375rem] text-ink-muted">Set up your free profile in two minutes.</p>
              <BaristaAuth slug={slug} startWith={joining ? "signup" : "signin"} />
            </>)}
          </div>
          <div className={card}>
            <h2 className="flex items-center gap-2 text-[1.0625rem] font-semibold text-ink"><Search className="h-5 w-5 text-[var(--b)]" />Looking for staff?</h2>
            <p className="mb-3 mt-1 text-[0.875rem] text-ink-muted">Search trained baristas near you and post shifts — free for approved businesses.</p>
            <Link href={`/jobs/${slug}/employers`} className="inline-flex h-11 w-full items-center justify-center rounded-xl font-semibold text-ink ring-1 ring-line-strong hover:bg-zinc-50">Employers start here</Link>
          </div>
        </aside>
      </div>
    </JobsShell>
  );
}
