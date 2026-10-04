import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarPlus, CheckCircle2, Clock, Loader2, MapPin, XCircle } from "lucide-react";
import { bookingByToken, bookUrl, emailBits, publicOrg, settleFromStripe } from "@/lib/bookings/server";
import { shareLink } from "@/lib/bookings/core";
import { money } from "@/lib/format";
import { BookShell } from "@/components/book/shell";
import { AutoRefresh } from "@/components/book/auto-refresh";
import { ShareBox } from "@/components/book/share";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your booking", robots: { index: false, follow: false } };

type P = { params: Promise<{ org: string; token: string }>; searchParams: Promise<{ paid?: string; cancelled?: string }> };

export default async function DonePage({ params, searchParams }: P) {
  const { org: slug, token } = await params;
  const sp = await searchParams;
  const org = await publicOrg(slug);
  let b = org ? await bookingByToken(token) : null;
  if (!org || !b || b.organisation_id !== org.id) notFound();
  // Back from Stripe before the webhook: check with Stripe directly
  if (sp.paid === "1" && b.status === "held") {
    await settleFromStripe("booking", b.id, org.id, b.stripe_session_id).catch(() => undefined);
    b = (await bookingByToken(token))!;
  }
  const bits = emailBits(org, b);
  const confirmed = ["confirmed", "attended"].includes(b.status);
  const courseUrl = shareLink(bookUrl(org, `/${b.course.slug}`), "share", "referral");

  return (
    <BookShell org={org} embed={false}>
      <div className="mx-auto max-w-xl">
        {confirmed ? (
          <div className="text-center">
            <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-600" />
            <h1 className="mt-3 text-[1.625rem] font-bold tracking-tight text-ink">You&apos;re booked in!</h1>
            <p className="mt-1 text-[0.9375rem] text-ink-muted">{b.contact_email ? <>Confirmation sent to <b className="font-semibold text-ink">{b.contact_email}</b>.</> : "Keep this page for your records."}</p>
          </div>
        ) : b.status === "waitlist" ? (
          <div className="text-center">
            <Clock className="mx-auto h-14 w-14 text-amber-500" />
            <h1 className="mt-3 text-[1.625rem] font-bold tracking-tight text-ink">You&apos;re on the waitlist</h1>
            <p className="mt-1 text-[0.9375rem] text-ink-muted">We&apos;ll email you if a seat opens up. Nothing has been charged.</p>
          </div>
        ) : b.status === "held" && sp.paid === "1" ? (
          <div className="text-center">
            <AutoRefresh />
            <Loader2 className="mx-auto h-12 w-12 animate-spin text-[var(--b)]" />
            <h1 className="mt-3 text-[1.5rem] font-bold tracking-tight text-ink">Confirming your payment…</h1>
            <p className="mt-1 text-[0.9375rem] text-ink-muted">This takes a few seconds. You&apos;ll also get an email.</p>
          </div>
        ) : (
          <div className="text-center">
            <XCircle className="mx-auto h-14 w-14 text-zinc-400" />
            <h1 className="mt-3 text-[1.5rem] font-bold tracking-tight text-ink">{sp.cancelled === "1" || b.status === "held" ? "Payment not finished" : "This booking isn't active"}</h1>
            <p className="mt-1 text-[0.9375rem] text-ink-muted">{b.status === "held" ? "Your seat is held for a few more minutes." : "Nothing was charged."}</p>
            <Link href={`/book/${org.slug}/${b.course.slug}?session=${b.session_id}`} className="mt-5 inline-flex h-12 items-center rounded-xl bg-[var(--b)] px-6 text-[0.9375rem] font-semibold text-[var(--on-b)]">Try again</Link>
          </div>
        )}

        <div className="mt-6 overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
          <div className="border-b border-line p-5">
            <p className="text-[0.72rem] font-semibold uppercase tracking-wider text-ink-faint">{b.status === "waitlist" ? "Waitlist" : "Booking"} {b.reference}</p>
            <p className="mt-1 text-[1.1875rem] font-semibold text-ink">{b.course.name}</p>
            <p className="mt-1 text-[0.9375rem] text-ink">{bits.w.day}</p>
            <p className="text-[0.9375rem] text-ink-muted">{bits.w.time}</p>
            {b.course.location && <p className="mt-2 inline-flex items-start gap-1.5 text-[0.875rem] text-ink-muted"><MapPin className="mt-0.5 h-4 w-4 shrink-0" />{b.course.location}</p>}
          </div>
          <dl className="space-y-1.5 p-5 text-[0.875rem]">
            <div className="flex justify-between gap-3"><dt className="text-ink-muted">{b.seats === 1 ? "Seat" : "Seats"}</dt><dd className="text-right text-ink">{(b.attendees ?? []).map((a) => a.name).filter(Boolean).join(", ") || b.seats}</dd></div>
            {bits.input.paidLine && <div className="flex justify-between gap-3"><dt className="text-ink-muted">Payment</dt><dd className="text-right text-ink">{bits.input.paidLine}</dd></div>}
            {b.payment_method === "agency" && b.po_number && <div className="flex justify-between gap-3"><dt className="text-ink-muted">Purchase order</dt><dd className="text-ink">{b.po_number}</dd></div>}
            {confirmed && Number(b.total) > 0 && b.payment_method !== "agency" && <div className="flex justify-between gap-3"><dt className="text-ink-muted">Total</dt><dd className="text-ink">{money(b.total, org.currency, { cents: true })}</dd></div>}
          </dl>
          {confirmed && (
            <div className="flex flex-wrap gap-2 border-t border-line bg-zinc-50 p-4">
              <a href={bits.googleUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center gap-2 rounded-xl bg-surface px-4 text-[0.875rem] font-semibold text-ink ring-1 ring-line hover:bg-zinc-100"><CalendarPlus className="h-4 w-4" />Google Calendar</a>
              <a href={bits.icsUrl} className="inline-flex h-11 items-center gap-2 rounded-xl bg-surface px-4 text-[0.875rem] font-semibold text-ink ring-1 ring-line hover:bg-zinc-100"><CalendarPlus className="h-4 w-4" />Apple / Outlook</a>
              <Link href={`/book/${org.slug}/manage/${b.manage_token}`} className="inline-flex h-11 items-center rounded-xl px-4 text-[0.875rem] font-semibold text-ink-muted hover:text-ink">Change or cancel</Link>
            </div>
          )}
        </div>

        {confirmed && (
          <div className="mt-6 rounded-2xl border border-line bg-surface p-5 shadow-card">
            <p className="text-[1rem] font-semibold text-ink">Bring a friend?</p>
            <p className="mb-3 text-[0.875rem] text-ink-muted">Share the class — it&apos;s more fun together.</p>
            <ShareBox url={courseUrl} text={`I just booked ${b.course.name} with ${org.name}!`} />
          </div>
        )}
        {org.website && /^https?:\/\//.test(org.website) && <p className="mt-6 text-center"><a href={org.website} className="text-[0.875rem] font-semibold text-[var(--b)]">← Back to {org.name}</a></p>}
      </div>
    </BookShell>
  );
}
