import Link from "next/link";
import { notFound } from "next/navigation";
import { Award, CalendarClock, CalendarDays, Download, Gift, LogOut, MapPin } from "lucide-react";
import { createServiceClient } from "@/lib/integrations/runtime";
import { bookUrl, COURSE_COLS, publicOrg, SESSION_COLS } from "@/lib/bookings/server";
import { hoursUntil, sessionWhen } from "@/lib/bookings/core";
import { certDate } from "@/lib/bookings/certificate";
import { certificatesForStudent, type CertRow } from "@/lib/bookings/certificates";
import { currentStudent } from "@/lib/bookings/student-auth";
import { signOutAction } from "@/app/book/account-actions";
import { money } from "@/lib/format";
import { BookShell } from "@/components/book/shell";
import { DetailsForm, LoginForm, RequestCertificate } from "@/components/book/account-tools";

export const dynamic = "force-dynamic";
export const metadata = { title: "My bookings", robots: { index: false, follow: false } };

type B = { id: string; reference: string; status: string; seats: number; manage_token: string; attendees: { name: string }[];
  session: { starts_at: string; ends_at: string }; course: { name: string; slug: string; location: string | null } };

export default async function AccountPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const org = await publicOrg(slug);
  if (!org) notFound();
  const me = await currentStudent(org).catch(() => null);

  if (!me) {
    return (
      <BookShell org={org} embed={false}>
        <div className="mx-auto max-w-md">
          <div className="rounded-2xl border border-line bg-surface p-6 shadow-card">
            <h1 className="text-[1.5rem] font-bold tracking-tight text-ink">My bookings</h1>
            <p className="mb-5 mt-1 text-[0.9375rem] text-ink-muted">See your classes, change a date and download your certificates.</p>
            <LoginForm orgSlug={org.slug} />
          </div>
          <p className="mt-5 text-center text-[0.875rem]"><Link href={`/book/${org.slug}`} className="font-semibold text-[var(--b)]">Book a class →</Link></p>
        </div>
      </BookShell>
    );
  }

  const db = createServiceClient();
  const cols = `id, reference, status, seats, manage_token, attendees, session:booking_sessions(${SESSION_COLS}), course:booking_courses(${COURSE_COLS})`;
  const [byId, byEmail] = await Promise.all([
    db.from("bookings").select(cols).eq("organisation_id", org.id).eq("student_id", me.id).in("status", ["confirmed", "attended", "waitlist", "no_show"]),
    me.email ? db.from("bookings").select(cols).eq("organisation_id", org.id).eq("contact_email", me.email).in("status", ["confirmed", "attended", "waitlist", "no_show"]) : Promise.resolve({ data: [] }),
  ]);
  const all = new Map<string, B>();
  for (const b of [...(byId.data ?? []), ...(byEmail.data ?? [])] as unknown as B[]) if (b.session && b.course) all.set(b.id, b);
  const list = [...all.values()].sort((a, b) => a.session.starts_at.localeCompare(b.session.starts_at));
  const upcoming = list.filter((b) => Date.parse(b.session.ends_at) > Date.now());
  const past = list.filter((b) => Date.parse(b.session.ends_at) <= Date.now()).reverse();
  const certs = await certificatesForStudent(db, org.id, me.id, list.map((b) => b.id)).catch(() => [] as CertRow[]);
  const { data: gifts } = me.email ? await db.from("booking_gifts").select("code, amount, balance, status, recipient_name, view_token, expires_on").eq("organisation_id", org.id).in("status", ["active", "redeemed"]).or(`purchaser_email.eq.${me.email},recipient_email.eq.${me.email}`) : { data: [] };
  const first = me.name.split(/\s+/)[0];

  return (
    <BookShell org={org} embed={false} wide>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[1.625rem] font-bold tracking-tight text-ink sm:text-[2rem]">Hi {first}</h1>
          <p className="text-[0.9375rem] text-ink-muted">Your classes and certificates with {org.name}.</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/book/${org.slug}`} className="inline-flex h-11 items-center rounded-xl bg-[var(--b)] px-4 text-[0.875rem] font-semibold text-[var(--on-b)]">Book a class</Link>
          <form action={signOutAction.bind(null, org.slug)}><button className="inline-flex h-11 items-center gap-1.5 rounded-xl px-4 text-[0.875rem] font-semibold text-ink-muted ring-1 ring-line hover:bg-zinc-50"><LogOut className="h-4 w-4" />Sign out</button></form>
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <section>
            <h2 className="mb-2 flex items-center gap-2 text-[1.0625rem] font-semibold text-ink"><CalendarDays className="h-5 w-5 text-[var(--b)]" />Coming up</h2>
            {upcoming.length === 0 ? <p className="rounded-2xl border border-line bg-surface p-5 text-[0.9375rem] text-ink-muted shadow-card">Nothing booked yet. <Link href={`/book/${org.slug}`} className="font-semibold text-[var(--b)]">See dates →</Link></p> : (
              <div className="space-y-3">
                {upcoming.map((b) => {
                  const w = sessionWhen(b.session.starts_at, b.session.ends_at, org.timezone);
                  const canChange = b.status === "waitlist" || hoursUntil(b.session.starts_at) >= org.settings.cancel_hours;
                  return (
                    <div key={b.id} className="rounded-2xl border border-line bg-surface p-5 shadow-card">
                      <div className="flex flex-wrap items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-[0.72rem] font-semibold uppercase tracking-wider text-ink-faint">{b.reference}{b.status === "waitlist" ? " · Waitlist" : ""}</p>
                          <p className="text-[1.125rem] font-semibold text-ink">{b.course.name}</p>
                          <p className="text-[0.9375rem] text-ink">{w.day}</p>
                          <p className="text-[0.875rem] text-ink-muted">{w.time} · {b.seats} {b.seats === 1 ? "seat" : "seats"}</p>
                          {b.course.location && <p className="mt-1 inline-flex items-center gap-1.5 text-[0.8125rem] text-ink-muted"><MapPin className="h-3.5 w-3.5" />{b.course.location}</p>}
                        </div>
                        <Link href={`/book/${org.slug}/manage/${b.manage_token}`} className="inline-flex h-11 items-center gap-1.5 rounded-xl px-4 text-[0.875rem] font-semibold text-ink ring-1 ring-line-strong hover:bg-zinc-50">
                          <CalendarClock className="h-4 w-4" />{canChange ? "Change date or cancel" : "View booking"}
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-2 flex items-center gap-2 text-[1.0625rem] font-semibold text-ink"><Award className="h-5 w-5 text-[var(--b)]" />Certificates</h2>
            {certs.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {certs.map((c) => (
                  <div key={c.id} className="flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-card">
                    <p className="text-[0.72rem] font-semibold uppercase tracking-wider text-ink-faint">Certificate {c.number}</p>
                    <p className="mt-0.5 text-[1rem] font-semibold text-ink">{c.course_name}</p>
                    <p className="text-[0.875rem] text-ink-muted">{c.person_name} · {certDate(c.completed_on)}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <a href={`/api/book/certificate/${c.verify_token}`} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[var(--b)] px-3.5 text-[0.8438rem] font-semibold text-[var(--on-b)]"><Download className="h-4 w-4" />Download PDF</a>
                      <Link href={`/book/${org.slug}/certificate/${c.verify_token}`} className="inline-flex h-10 items-center rounded-xl px-3.5 text-[0.8438rem] font-semibold text-ink ring-1 ring-line hover:bg-zinc-50">View & share</Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : past.length > 0 ? (
              <p className="rounded-2xl border border-line bg-surface p-5 text-[0.9375rem] text-ink-muted shadow-card">Your certificate will appear here shortly after your class.</p>
            ) : (
              <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
                <p className="mb-3 text-[0.9375rem] text-ink-muted">Did a course with us before we moved to this system? Tell us which one and we&apos;ll send your certificate.</p>
                <RequestCertificate orgSlug={org.slug} requested={!!me.certificate_requested_at} />
              </div>
            )}
          </section>

          {past.length > 0 && (
            <section>
              <h2 className="mb-2 text-[1.0625rem] font-semibold text-ink">Past classes</h2>
              <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
                {past.map((b) => (
                  <div key={b.id} className="flex items-center gap-3 px-5 py-3 text-[0.9063rem]">
                    <span className="min-w-0 flex-1 text-ink">{b.course.name}</span>
                    <span className="text-ink-muted">{sessionWhen(b.session.starts_at, b.session.ends_at, org.timezone).short}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6">
          <section className="rounded-2xl border border-line bg-surface p-5 shadow-card">
            <h2 className="mb-3 text-[1rem] font-semibold text-ink">Your details</h2>
            <p className="mb-3 text-[0.8125rem] text-ink-muted">Signed in as {me.email}</p>
            <DetailsForm orgSlug={org.slug} initial={{ name: me.name, phone: me.phone ?? "", marketing: me.marketing_ok }} />
          </section>
          {(gifts ?? []).length > 0 && (
            <section className="rounded-2xl border border-line bg-surface p-5 shadow-card">
              <h2 className="mb-2 flex items-center gap-2 text-[1rem] font-semibold text-ink"><Gift className="h-4 w-4 text-[var(--b)]" />Gift certificates</h2>
              <ul className="space-y-2 text-[0.875rem]">
                {(gifts as { code: string; amount: number; balance: number; status: string; recipient_name: string | null; view_token: string }[]).map((g) => (
                  <li key={g.code} className="flex items-center justify-between gap-2">
                    <Link href={`/book/${org.slug}/gift/${g.view_token}`} className="font-mono font-semibold text-ink hover:underline">{g.code}</Link>
                    <span className="text-ink-muted">{g.status === "redeemed" ? "Used" : `${money(g.balance, org.currency)} left`}{g.recipient_name ? ` · ${g.recipient_name}` : ""}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <p className="px-1 text-center text-[0.8125rem] text-ink-muted"><a href={bookUrl(org)} className="font-semibold text-[var(--b)]">All classes</a></p>
        </aside>
      </div>
    </BookShell>
  );
}
