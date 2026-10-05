import { createServiceClient } from "@/lib/integrations/runtime";
import { publicName } from "@/lib/jobs/core";
import { approvedEmployer } from "@/lib/jobs/guard";
import { loadMessages, loadThreads, unreadFor } from "@/lib/jobs/server";
import { EmployerShell } from "@/components/jobs/employer-shell";
import { ThreadsView, threadWhen, type Active } from "@/components/jobs/threads-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Messages", robots: { index: false, follow: false } };

export default async function EmployerMessages({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ t?: string }> }) {
  const { org: slug } = await params;
  const { org, emp } = await approvedEmployer(slug);
  const db = createServiceClient();
  const threads = await loadThreads(db, "employer", emp.id);
  const want = (await searchParams).t;
  const t = threads.find((x) => x.id === want) ?? null;
  let active: Active | null = null;
  if (t) {
    if (t.employer_unread) { await db.from("job_threads").update({ employer_unread: 0 }).eq("id", t.id); t.employer_unread = 0; }
    // Contact only when the barista has shared it (in this conversation or on their profile)
    const { data: pr } = await db.from("job_profiles").select("share_email, share_phone, student:booking_students!inner(email, phone)").eq("id", t.profile_id).single();
    const x = pr as unknown as { share_email: boolean; share_phone: boolean; student: { email: string | null; phone: string | null } };
    const contact = { email: t.contact_shared || x.share_email ? x.student.email : null, phone: t.contact_shared || x.share_phone ? x.student.phone : null };
    active = { id: t.id, heading: publicName(t.profile.student.name, t.profile.display_name), sub: [t.post?.title ?? "General enquiry", t.profile.suburb].filter(Boolean).join(" · "),
      href: `/jobs/${slug}/employers/barista/${t.profile_id}`, contactShared: t.contact_shared, contactRequested: t.contact_requested, contact, messages: await loadMessages(db, t.id) };
  }
  const unread = await unreadFor(db, "employer", emp.id);
  return (
    <EmployerShell org={org} me={{ name: emp.contact_name }} active="messages" unread={unread} legacy>
      <h1 className="mb-4 text-[1.625rem] font-bold tracking-tight text-ink">Messages</h1>
      <ThreadsView slug={slug} side="employer" base={`/jobs/${slug}/employers/messages`} active={active}
        items={threads.map((x) => ({ id: x.id, title: publicName(x.profile.student.name, x.profile.display_name), subtitle: `${x.post?.title ?? "General enquiry"} · ${threadWhen(x.last_message_at)}`, photo: x.profile.photo_url, unread: x.employer_unread, when: x.last_message_at }))} />
    </EmployerShell>
  );
}
