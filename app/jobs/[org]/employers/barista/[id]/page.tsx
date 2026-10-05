import Link from "next/link";
import { notFound } from "next/navigation";
import { Award, Lock, MapPin } from "lucide-react";
import { createServiceClient } from "@/lib/integrations/runtime";
import { certDate } from "@/lib/bookings/certificate";
import { availabilitySummary, DAY_LABEL, DAYS, EXPERIENCE, SLOT_LABEL, SLOTS, WORK_TYPES } from "@/lib/jobs/core";
import { approvedEmployer } from "@/lib/jobs/guard";
import { profileForEmployer, unreadFor } from "@/lib/jobs/server";
import { card } from "@/components/jobs/shell";
import { EmployerShell } from "@/components/jobs/employer-shell";
import { ContactBarista } from "@/components/jobs/tools";

export const dynamic = "force-dynamic";
export const metadata = { title: "Barista profile", robots: { index: false, follow: false } };

export default async function BaristaProfile({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org: slug, id } = await params;
  const { org, emp } = await approvedEmployer(slug);
  const db = createServiceClient();
  const v = await profileForEmployer(db, org, id, emp.id);
  if (!v) notFound();
  const p = v.profile;
  const [unread, { data: posts }] = await Promise.all([
    unreadFor(db, "employer", emp.id),
    db.from("job_posts").select("id, title").eq("employer_id", emp.id).eq("status", "open").order("created_at", { ascending: false }),
  ]);
  const hasContact = !!(v.email || v.phone);
  return (
    <EmployerShell org={org} me={{ name: emp.contact_name }} active="search" unread={unread} legacy>
      <Link href={`/jobs/${slug}/employers/search`} className="mb-4 inline-block text-[0.8125rem] font-medium text-ink-muted hover:text-ink">← Back to search</Link>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          <section className={`${card} flex flex-wrap items-center gap-5`}>
            <span className="h-24 w-24 shrink-0 overflow-hidden rounded-full bg-zinc-100 ring-1 ring-line">
              {p.photo_url ? <img src={p.photo_url} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center text-[2rem] font-semibold text-ink-faint">{v.name.slice(0, 1)}</span>}
            </span>
            <div className="min-w-0">
              <h1 className="text-[1.5rem] font-bold text-ink">{v.name}</h1>
              {p.headline && <p className="text-[1rem] text-ink">{p.headline}</p>}
              <p className="mt-1 flex items-center gap-1 text-[0.875rem] text-ink-muted"><MapPin className="h-4 w-4" />{p.suburb}{p.state ? ` ${p.state}` : ""} · travels up to {p.travel_km} km</p>
              {p.experience && <p className="text-[0.875rem] text-ink-muted">{EXPERIENCE.find((x) => x.id === p.experience)?.label}</p>}
            </div>
          </section>
          {p.bio && <section className={card}><h2 className="mb-2 font-semibold text-ink">About</h2><p className="whitespace-pre-line text-[0.9375rem] text-ink">{p.bio}</p></section>}
          {v.certificates.length > 0 && (
            <section className={card}>
              <h2 className="mb-2 flex items-center gap-2 font-semibold text-ink"><Award className="h-5 w-5 text-[var(--b)]" />Trained by {org.name}</h2>
              <ul className="space-y-1 text-[0.9375rem]">{v.certificates.map((c) => <li key={c.verify_token}><span className="font-medium text-ink">{c.course_name}</span> <span className="text-ink-muted">· {certDate(c.completed_on)}</span></li>)}</ul>
            </section>
          )}
          <section className={card}>
            <h2 className="mb-1 font-semibold text-ink">Availability</h2>
            <p className="mb-3 text-[0.875rem] text-ink-muted">{availabilitySummary(p.availability)}{p.availability_note ? ` — ${p.availability_note}` : ""}</p>
            <div className="overflow-x-auto"><table className="w-full min-w-[360px] border-separate border-spacing-1 text-[0.78rem]">
              <thead><tr><th />{SLOTS.map((s) => <th key={s} className="font-medium text-ink-muted">{SLOT_LABEL[s]}</th>)}</tr></thead>
              <tbody>{DAYS.map((d) => <tr key={d}><th scope="row" className="pr-2 text-left font-semibold text-ink">{DAY_LABEL[d]}</th>{SLOTS.map((s) => {
                const on = (p.availability[d] ?? []).includes(s);
                return <td key={s} className={`h-7 rounded-md ${on ? "bg-[var(--b)]" : "bg-zinc-100"}`} aria-label={on ? "Available" : "Not available"} />;
              })}</tr>)}</tbody>
            </table></div>
            {p.work_types.length > 0 && <p className="mt-3 text-[0.875rem] text-ink">Looking for: {p.work_types.map((w) => WORK_TYPES.find((x) => x.id === w)?.label).filter(Boolean).join(", ")}</p>}
          </section>
          {p.skills.length > 0 && <section className={card}><h2 className="mb-2 font-semibold text-ink">Skills</h2><div className="flex flex-wrap gap-1.5">{p.skills.map((s) => <span key={s} className="rounded-full bg-zinc-100 px-3 py-1 text-[0.8125rem] text-ink">{s}</span>)}</div></section>}
        </div>
        <aside className="space-y-4 lg:sticky lg:top-6">
          <section className={card}>
            <h2 className="mb-2 flex items-center gap-2 font-semibold text-ink"><Lock className="h-4 w-4 text-[var(--b)]" />Contact</h2>
            {hasContact
              ? <p className="text-[0.9375rem] text-ink">{[v.phone, v.email].filter(Boolean).map((x) => <span key={x} className="block">{x}</span>)}</p>
              : <p className="text-[0.875rem] text-ink-muted">{v.name.split(" ")[0]} keeps their phone and email private. Send a message — they can choose to share them with you.</p>}
          </section>
          {v.threads.length > 0 && <Link href={`/jobs/${slug}/employers/messages?t=${v.threads[0].id}`} className="flex h-11 items-center justify-center rounded-xl font-semibold text-ink ring-1 ring-line-strong hover:bg-zinc-50">Open your conversation</Link>}
          <section className={card}>
            <h2 className="mb-3 font-semibold text-ink">Send a message</h2>
            <ContactBarista slug={slug} profileId={p.id} name={v.name} posts={(posts ?? []) as { id: string; title: string }[]} hasContact={hasContact} />
          </section>
        </aside>
      </div>
    </EmployerShell>
  );
}
