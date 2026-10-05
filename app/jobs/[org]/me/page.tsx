import { notFound, redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { createServiceClient } from "@/lib/integrations/runtime";
import { currentStudent } from "@/lib/bookings/student-auth";
import { jobsOrg, profileFor, unreadFor } from "@/lib/jobs/server";
import { jobsSignOutAction } from "@/app/jobs/actions";
import { baristaNav, card, JobsShell } from "@/components/jobs/shell";
import { ProfileEditor } from "@/components/jobs/tools";

export const dynamic = "force-dynamic";
export const metadata = { title: "My barista profile", robots: { index: false, follow: false } };

export default async function MyProfile({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const org = await jobsOrg(slug);
  if (!org || !org.jobs.enabled) notFound();
  const me = await currentStudent(org).catch(() => null);
  if (!me) redirect(`/jobs/${slug}`);
  const db = createServiceClient();
  const prof = await profileFor(db, org.id, me.id).catch(() => null);
  if (!prof) return <JobsShell org={org}><p className={card}>The job board is being set up — please try again soon.</p></JobsShell>;
  const [{ data: certs }, unread] = await Promise.all([
    db.from("booking_certificates").select("course_name").eq("student_id", me.id).eq("status", "issued"),
    unreadFor(db, "barista", prof.id),
  ]);
  return (
    <JobsShell org={org} nav={baristaNav(slug, unread)} side="barista" wide={false}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[1.625rem] font-bold tracking-tight text-ink sm:text-[2rem]">Hi {me.name.split(/\s+/)[0]}</h1>
          <p className="text-[0.9375rem] text-ink-muted">Your barista profile on {org.jobs.name}.</p>
        </div>
        <form action={jobsSignOutAction.bind(null, slug)}><button className="inline-flex h-11 items-center gap-1.5 rounded-xl px-4 text-[0.875rem] font-semibold text-ink-muted ring-1 ring-line hover:bg-zinc-50"><LogOut className="h-4 w-4" />Sign out</button></form>
      </div>
      <ProfileEditor slug={slug} initial={prof} student={{ name: me.name, email: me.email, phone: me.phone }} certificates={[...new Set(((certs ?? []) as { course_name: string }[]).map((c) => c.course_name))]} />
    </JobsShell>
  );
}
