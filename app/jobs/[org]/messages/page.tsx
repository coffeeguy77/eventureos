import { notFound, redirect } from "next/navigation";
import { createServiceClient } from "@/lib/integrations/runtime";
import { currentStudent } from "@/lib/bookings/student-auth";
import { employerRow, jobsOrg, loadMessages, loadThreads, profileFor, unreadFor } from "@/lib/jobs/server";
import { baristaNav, JobsShell } from "@/components/jobs/shell";
import { ThreadsView, threadWhen, type Active } from "@/components/jobs/threads-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Messages", robots: { index: false, follow: false } };

export default async function BaristaMessages({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ t?: string }> }) {
  const { org: slug } = await params;
  const org = await jobsOrg(slug);
  if (!org) notFound();
  const me = await currentStudent(org).catch(() => null);
  if (!me) redirect(`/jobs/${slug}`);
  const db = createServiceClient();
  const prof = await profileFor(db, org.id, me.id);
  const threads = prof ? await loadThreads(db, "barista", prof.id) : [];
  const want = (await searchParams).t;
  const t = threads.find((x) => x.id === want) ?? null;
  let active: Active | null = null;
  if (t) {
    if (t.barista_unread) { await db.from("job_threads").update({ barista_unread: 0 }).eq("id", t.id); t.barista_unread = 0; }
    const e = (await employerRow(db, t.employer_id))!;
    active = { id: t.id, heading: e.business_name, sub: t.post?.title ?? "General enquiry", contactShared: t.contact_shared, contactRequested: t.contact_requested,
      employerLines: [`${e.contact_name}${e.phone ? ` · ${e.phone}` : ""} · ${e.email}`], employer: e, messages: await loadMessages(db, t.id) };
  }
  const unread = await unreadFor(db, "barista", prof?.id);
  return (
    <JobsShell org={org} nav={baristaNav(slug, unread)} side="barista">
      <h1 className="mb-4 text-[1.625rem] font-bold tracking-tight text-ink">Messages</h1>
      <ThreadsView slug={slug} side="barista" base={`/jobs/${slug}/messages`} active={active}
        items={threads.map((x) => ({ id: x.id, title: x.employer.business_name, subtitle: `${x.post?.title ?? "General enquiry"} · ${threadWhen(x.last_message_at)}`, unread: x.barista_unread, when: x.last_message_at }))} />
    </JobsShell>
  );
}
