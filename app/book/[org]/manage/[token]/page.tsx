import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarPlus } from "lucide-react";
import { bookingByToken, catalogue, emailBits, publicOrg } from "@/lib/bookings/server";
import { hoursUntil, sessionWhen } from "@/lib/bookings/core";
import { BookShell } from "@/components/book/shell";
import { ManageActions } from "@/components/book/manage-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Manage booking", robots: { index: false, follow: false } };

export default async function ManagePage({ params }: { params: Promise<{ org: string; token: string }> }) {
  const { org: slug, token } = await params;
  const org = await publicOrg(slug);
  const b = org ? await bookingByToken(token) : null;
  if (!org || !b || b.organisation_id !== org.id) notFound();
  const bits = emailBits(org, b);
  const active = ["confirmed", "waitlist"].includes(b.status);
  const past = Date.parse(b.session.ends_at) < Date.now();
  const inTime = hoursUntil(b.session.starts_at) >= org.settings.cancel_hours;
  const { sessions } = await catalogue(org, { courseSlug: b.course.slug }).catch(() => ({ sessions: [] as Awaited<ReturnType<typeof catalogue>>["sessions"] }));
  const options = sessions.filter((s) => s.id !== b.session_id && !s.full).map((s) => { const w = sessionWhen(s.starts_at, s.ends_at, org.timezone); return { id: s.id, label: `${w.short}, ${w.start}`, left: s.left }; });
  const contact = [org.contact_phone, org.contact_email].filter(Boolean).join(" or ");
  const policy = b.status === "waitlist" ? "" : Number(b.amount_paid) > 0 ? `${org.name} will contact you about a refund or credit.` : "";

  return (
    <BookShell org={org} embed={false}>
      <div className="mx-auto max-w-xl">
        <h1 className="text-[1.5rem] font-bold tracking-tight text-ink">Your booking</h1>
        <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
          <div className="p-5">
            <p className="text-[0.72rem] font-semibold uppercase tracking-wider text-ink-faint">{b.reference} · {b.status === "confirmed" ? "Confirmed" : b.status === "waitlist" ? "Waitlist" : b.status === "attended" ? "Attended" : b.status === "cancelled" ? "Cancelled" : b.status === "held" ? "Not paid" : b.status}</p>
            <p className="mt-1 text-[1.1875rem] font-semibold text-ink">{b.course.name}</p>
            <p className="text-[0.9375rem] text-ink">{bits.w.day}</p>
            <p className="text-[0.9375rem] text-ink-muted">{bits.w.time} · {b.seats} seat{b.seats === 1 ? "" : "s"}</p>
            {b.status === "confirmed" && !past && (
              <div className="mt-3 flex flex-wrap gap-2">
                <a href={bits.googleUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-2 rounded-xl px-3 text-[0.8438rem] font-semibold text-ink ring-1 ring-line hover:bg-zinc-50"><CalendarPlus className="h-4 w-4" />Google Calendar</a>
                <a href={bits.icsUrl} className="inline-flex h-10 items-center gap-2 rounded-xl px-3 text-[0.8438rem] font-semibold text-ink ring-1 ring-line hover:bg-zinc-50"><CalendarPlus className="h-4 w-4" />Apple / Outlook</a>
              </div>
            )}
          </div>
          {active && !past && (
            <div className="border-t border-line p-5">
              <ManageActions token={token} options={b.status === "confirmed" ? options : []} seats={b.seats} canChange={b.status === "waitlist" || inTime}
                policy={inTime || b.status === "waitlist" ? policy : `It's less than ${org.settings.cancel_hours} hours until your class, so changes need to go through ${org.name}${contact ? ` — ${contact}` : ""}.`} />
            </div>
          )}
          {b.status === "cancelled" && <p className="border-t border-line p-5 text-[0.875rem] text-ink-muted">This booking was cancelled. <Link href={`/book/${org.slug}/${b.course.slug}`} className="font-semibold text-[var(--b)]">Book again</Link></p>}
        </div>
      </div>
    </BookShell>
  );
}
