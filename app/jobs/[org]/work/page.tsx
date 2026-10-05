import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CalendarDays, Clock, DollarSign, MapPin, Users } from "lucide-react";
import { createServiceClient } from "@/lib/integrations/runtime";
import { currentStudent } from "@/lib/bookings/student-auth";
import { JOB_KINDS } from "@/lib/jobs/core";
import { jobsOrg, openPosts, profileFor, unreadFor } from "@/lib/jobs/server";
import { baristaNav, card, JobsShell } from "@/components/jobs/shell";
import { InterestButton } from "@/components/jobs/tools";

export const dynamic = "force-dynamic";
export const metadata = { title: "Jobs & shifts", robots: { index: false, follow: false } };

const fmt = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });

export default async function Work({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const org = await jobsOrg(slug);
  if (!org || !org.jobs.enabled) notFound();
  const me = await currentStudent(org).catch(() => null);
  if (!me) redirect(`/jobs/${slug}`);
  const db = createServiceClient();
  const prof = await profileFor(db, org.id, me.id).catch(() => null);
  const near = prof?.lat != null && prof?.lng != null ? { lat: prof.lat, lng: prof.lng } : null;
  const [posts, unread, { data: mine }] = await Promise.all([
    openPosts(db, org.id, near).catch(() => []),
    unreadFor(db, "barista", prof?.id),
    prof ? db.from("job_threads").select("id, post_id").eq("profile_id", prof.id).not("post_id", "is", null) : Promise.resolve({ data: [] }),
  ]);
  const applied = new Map(((mine ?? []) as { id: string; post_id: string }[]).map((t) => [t.post_id, t.id]));

  return (
    <JobsShell org={org} nav={baristaNav(slug, unread)} side="barista" wide={false}>
      <h1 className="text-[1.625rem] font-bold tracking-tight text-ink sm:text-[2rem]">Jobs & shifts</h1>
      <p className="mb-5 text-[0.9375rem] text-ink-muted">{near ? `Nearest to ${prof!.suburb} first.` : "Add your suburb on your profile to see the nearest first."} Filled jobs disappear automatically.</p>
      {prof?.status !== "active" && <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-[0.875rem] text-amber-950">Switch your profile on so employers can see who you are when you get in touch. <Link href={`/jobs/${slug}/me`} className="font-semibold underline">My profile</Link></p>}
      {posts.length === 0 ? <p className={`${card} text-[0.9375rem] text-ink-muted`}>No open jobs right now. We&apos;ll email you when an employer gets in touch.</p> : (
        <div className="space-y-3">
          {posts.map((p) => (
            <article key={p.id} className={card}>
              <p className="text-[0.72rem] font-semibold uppercase tracking-wider text-[var(--b)]">{JOB_KINDS.find((k) => k.id === p.kind)?.label}</p>
              <h2 className="text-[1.125rem] font-semibold text-ink">{p.title}</h2>
              <p className="text-[0.875rem] text-ink-muted">{p.employer?.business_name}</p>
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.8438rem] text-ink">
                {p.suburb && <li className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-ink-faint" />{p.suburb}{p.distance != null ? ` · ${p.distance} km` : ""}</li>}
                {p.starts_on && <li className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 text-ink-faint" />{fmt(p.starts_on)}{p.ends_on && p.ends_on !== p.starts_on ? ` – ${fmt(p.ends_on)}` : ""}</li>}
                {p.times && <li className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-ink-faint" />{p.times}</li>}
                {p.pay && <li className="inline-flex items-center gap-1.5"><DollarSign className="h-3.5 w-3.5 text-ink-faint" />{p.pay}</li>}
                {p.positions > 1 && <li className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-ink-faint" />{p.positions} baristas</li>}
              </ul>
              {p.description && <p className="mt-3 whitespace-pre-line text-[0.9063rem] text-ink">{p.description}</p>}
              <div className="mt-4">
                {applied.has(p.id)
                  ? <Link href={`/jobs/${slug}/messages?t=${applied.get(p.id)}`} className="inline-flex h-11 items-center rounded-xl px-4 text-[0.875rem] font-semibold text-ink ring-1 ring-line-strong hover:bg-zinc-50">You&apos;ve been in touch — open messages</Link>
                  : <InterestButton slug={slug} postId={p.id} business={p.employer?.business_name ?? "the employer"} />}
              </div>
            </article>
          ))}
        </div>
      )}
    </JobsShell>
  );
}
