import { Award, CalendarDays, Check, Clock, Gift, MapPin, Phone, Users } from "lucide-react";
import Link from "next/link";
import type { CourseRow } from "@/lib/bookings/core";
import { sessionWhen } from "@/lib/bookings/core";
import type { PublicOrg, PublicSession } from "@/lib/bookings/server";
import { bookUrl } from "@/lib/bookings/server";
import type { Agent } from "@/lib/bookings/agents";
import { money } from "@/lib/format";
import { BookShell } from "./shell";
import { AgentBanner } from "./agent-banner";
import { InfoPanel } from "./info-panel";
import { BookCourseButton, LandingBooking } from "./landing-booking";

const dur = (m: number) => (m % 60 === 0 ? `${m / 60} hour${m === 60 ? "" : "s"}` : m > 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`);
const clean = (n: string) => n.replace(/\s*\(\d+\s*hrs?\)\s*$/i, "");
const paras = (t: string) => t.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);

/**
 * The public booking page as a landing page: headline + photo + the next class, the courses side by side,
 * the full booking form, then text sections and FAQs for search. Everything comes from the business's settings and courses.
 */
export function BookLanding({ org, data, agent, initialCourse, utm, source, certificate }: {
  org: PublicOrg; data: { courses: CourseRow[]; sessions: PublicSession[] }; agent: Agent | null; initialCourse: string | null;
  utm: Record<string, string>; source: "website" | "wordpress"; certificate: boolean;
}) {
  const L = org.settings.landing;
  const courses = data.courses;
  const byCourse = (id: string) => data.sessions.filter((s) => s.course_id === id);
  const next = data.sessions.find((s) => !s.full) ?? null;
  const nextCourse = next ? courses.find((c) => c.id === next.course_id) : null;
  const hero = L.heroImage ?? courses.find((c) => c.image_url)?.image_url ?? null;
  const location = courses.find((c) => c.location)?.location ?? null;
  const headline = L.headline ?? `Book a class with ${org.name}`;
  const intro = org.settings.intro;
  const fromPrice = Math.min(...courses.map((c) => Number(c.price)));

  // Structured data: each course (with its upcoming dates) and the FAQs, so search engines can show them
  const ld = [
    ...courses.map((c) => ({
      "@context": "https://schema.org", "@type": "Course", name: clean(c.name), description: c.summary ?? c.description ?? `${clean(c.name)} with ${org.name}`,
      url: bookUrl(org, `/${c.slug}`), provider: { "@type": "Organization", name: org.name, ...(org.website ? { sameAs: org.website } : {}) },
      ...(c.image_url ? { image: c.image_url } : {}),
      offers: { "@type": "Offer", price: Number(c.price).toFixed(2), priceCurrency: org.currency, category: "Paid", availability: "https://schema.org/InStock", url: bookUrl(org, `/${c.slug}`) },
      hasCourseInstance: byCourse(c.id).slice(0, 10).map((s) => ({
        "@type": "CourseInstance", courseMode: "Onsite", startDate: s.starts_at, endDate: s.ends_at, courseWorkload: `PT${c.duration_minutes}M`,
        ...(c.location ? { location: { "@type": "Place", name: org.name, address: c.location } } : {}),
      })),
    })),
    ...(org.settings.faqs.length ? [{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: org.settings.faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }] : []),
  ];

  return (
    <BookShell org={org} embed={false}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
      {agent && <AgentBanner orgSlug={org.slug} agent={agent} />}

      {/* Opening: headline and highlights | photo with the next class */}
      <section className="grid items-center gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-14">
        <div>
          <h1 className="text-balance text-[2.25rem] font-extrabold leading-[1.05] tracking-[-0.02em] text-ink sm:text-[3rem] xl:text-[3.75rem]">{headline}</h1>
          {intro && <p className="mt-5 max-w-[34rem] whitespace-pre-line text-[1.0625rem] leading-relaxed text-ink-muted sm:text-[1.125rem]">{intro}</p>}
          {L.highlights.length > 0 && (
            <ul className="mt-6 grid max-w-[36rem] gap-x-6 gap-y-2.5 sm:grid-cols-2">
              {L.highlights.map((h) => <li key={h} className="flex items-start gap-2.5 text-[0.9688rem] text-ink"><Check className="mt-0.5 h-5 w-5 shrink-0 text-[var(--b)]" strokeWidth={2.5} />{h}</li>)}
            </ul>
          )}
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a href="#book" className="inline-flex h-12 items-center rounded-xl bg-[var(--b)] px-6 text-[1rem] font-semibold text-[var(--on-b)] hover:opacity-90">See dates &amp; book</a>
            {courses.length > 1 && <a href="#courses" className="inline-flex h-12 items-center rounded-xl px-5 text-[1rem] font-semibold text-ink ring-1 ring-line-strong hover:bg-surface">Compare courses</a>}
            {Number.isFinite(fromPrice) && <span className="text-[0.9375rem] text-ink-muted">From {money(fromPrice, org.currency)}</span>}
          </div>
        </div>
        <div className="relative">
          {hero
            ? <img src={hero} alt="" className="aspect-[4/3] w-full rounded-[28px] object-cover shadow-pop lg:aspect-[5/4]" />
            : <div className="aspect-[4/3] w-full rounded-[28px] lg:aspect-[5/4]" style={{ background: "linear-gradient(135deg, var(--b), color-mix(in srgb, var(--b) 45%, #000))" }} />}
          {next && nextCourse && (
            <div className="absolute -bottom-6 left-4 right-4 rounded-2xl bg-surface p-4 shadow-pop ring-1 ring-line sm:left-auto sm:right-6 sm:w-[300px]">
              <p className="text-[0.8125rem] font-medium text-ink-muted">Next class</p>
              <p className="mt-0.5 text-[1.0625rem] font-bold text-ink">{sessionWhen(next.starts_at, next.ends_at, org.timezone).day}</p>
              <p className="text-[0.875rem] text-ink-muted">{clean(nextCourse.name)} · {sessionWhen(next.starts_at, next.ends_at, org.timezone).time}</p>
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className={`text-[0.875rem] font-semibold ${next.left <= 2 ? "text-amber-700" : "text-emerald-700"}`}>{next.left} {next.left === 1 ? "seat" : "seats"} left</span>
                <BookCourseButton slug={nextCourse.slug} className="inline-flex h-10 items-center rounded-lg bg-[var(--b)] px-4 text-[0.875rem] font-semibold text-[var(--on-b)]">Book</BookCourseButton>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Courses side by side */}
      <section id="courses" className="mt-20 scroll-mt-6 sm:mt-24">
        <h2 className="text-[1.75rem] font-bold tracking-tight text-ink sm:text-[2.125rem]">{courses.length > 1 ? "Choose your course" : "The course"}</h2>
        <div className={`mt-6 grid gap-6 ${courses.length > 1 ? "md:grid-cols-2" : ""} ${courses.length > 2 ? "xl:grid-cols-3" : ""}`}>
          {courses.map((c) => {
            const ss = byCourse(c.id), open = ss.filter((s) => !s.full);
            return (
              <article key={c.id} className="flex flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-card">
                {c.image_url
                  ? <img src={c.image_url} alt={clean(c.name)} className="aspect-[16/9] w-full object-cover" loading="lazy" />
                  : <div className="aspect-[16/9] w-full" style={{ background: "linear-gradient(135deg, var(--b), color-mix(in srgb, var(--b) 55%, #000))" }} />}
                <div className="flex flex-1 flex-col p-6 sm:p-7">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <h3 className="text-[1.375rem] font-bold tracking-tight text-ink">{clean(c.name)}</h3>
                    <p className="text-[1.375rem] font-bold text-ink">{money(c.price, org.currency, { cents: Number(c.price) % 1 !== 0 })}</p>
                  </div>
                  <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.875rem] text-ink-muted">
                    <span className="inline-flex items-center gap-1.5"><Clock className="h-4 w-4" />{dur(c.duration_minutes)}</span>
                    <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4" />Up to {c.capacity} people</span>
                    {certificate && <span className="inline-flex items-center gap-1.5"><Award className="h-4 w-4" />Certificate</span>}
                  </p>
                  {c.summary && <p className="mt-4 text-[1rem] font-medium leading-relaxed text-ink">{c.summary}</p>}
                  {c.description && <div className="mt-3 space-y-3 text-[0.9375rem] leading-relaxed text-ink-muted">{paras(c.description).map((p, i) => <p key={i} className="whitespace-pre-line">{p}</p>)}</div>}
                  <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-6">
                    <span className="inline-flex items-center gap-1.5 text-[0.875rem] text-ink-muted"><CalendarDays className="h-4 w-4" />
                      {open[0] ? `Next: ${sessionWhen(open[0].starts_at, open[0].ends_at, org.timezone).short}${open.length > 1 ? ` · ${open.length} dates` : ""}` : "New dates soon"}</span>
                    <BookCourseButton slug={c.slug} className="inline-flex h-11 items-center rounded-xl bg-[var(--b)] px-5 text-[0.9375rem] font-semibold text-[var(--on-b)] hover:opacity-90">Book this course</BookCourseButton>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* The full booking form */}
      <section id="book" className="mt-20 scroll-mt-6 sm:mt-24">
        <h2 className="mb-5 text-[1.75rem] font-bold tracking-tight text-ink sm:text-[2.125rem]">Book your spot</h2>
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]">
          <div className="min-w-0">
            <LandingBooking initial={initialCourse}
              base={{ org: { slug: org.slug, name: org.name, currency: org.currency, timezone: org.timezone, stripeReady: org.stripeReady, showSeatsLeft: org.settings.show_seats_left, waitlist: org.settings.waitlist, terms: org.settings.terms, cancelHours: org.settings.cancel_hours },
                utm, embed: false, source,
                agent: agent ? { code: agent.agency.code, agency: agent.agency.name, price: agent.agency.price === null ? null : Number(agent.agency.price), poRequired: agent.agency.po_required, name: agent.cm.name, site: agent.cm.site } : null }}
              courses={courses.map((c) => ({ slug: c.slug, label: clean(c.name), course: { id: c.id, name: c.name, price: Number(c.price), maxSeats: c.max_seats_per_booking, questions: c.questions ?? [] }, sessions: byCourse(c.id) }))} />
          </div>
          <InfoPanel orgSlug={org.slug} orgName={org.name} phone={org.contact_phone} location={location} whatToBring={courses.find((c) => c.what_to_bring)?.what_to_bring ?? null} certificate={certificate}
            gifts={courses.some((c) => c.gift_enabled) && org.stripeReady} faqs={[]} terms={org.settings.terms} embed={false} />
        </div>
      </section>

      {/* Words for people (and search engines) who want to know more */}
      {L.sections.length > 0 && (
        <section className="mt-20 border-t border-line pt-14 sm:mt-24">
          <div className="grid gap-x-14 gap-y-10 lg:grid-cols-2">
            {L.sections.map((x) => (
              <div key={x.heading} className="max-w-[40rem]">
                <h2 className="text-[1.375rem] font-bold tracking-tight text-ink sm:text-[1.5rem]">{x.heading}</h2>
                <div className="mt-3 space-y-3 text-[1rem] leading-[1.7] text-ink-muted">{paras(x.body).map((p, i) => <p key={i} className="whitespace-pre-line">{p}</p>)}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {org.settings.faqs.length > 0 && (
        <section className="mt-16 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div>
            <h2 className="text-[1.75rem] font-bold tracking-tight text-ink sm:text-[2.125rem]">Questions</h2>
            <p className="mt-2 max-w-sm text-[0.9688rem] text-ink-muted">Anything else? {org.contact_phone ? <>Call <a href={`tel:${org.contact_phone.replace(/\s+/g, "")}`} className="font-semibold text-ink underline">{org.contact_phone}</a>.</> : "Just get in touch."}</p>
          </div>
          <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {org.settings.faqs.map((f) => (
              <details key={f.q} className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[1rem] font-semibold text-ink">{f.q}<span className="text-[1.25rem] leading-none text-ink-faint transition-transform group-open:rotate-45" aria-hidden>+</span></summary>
                <p className="mt-3 max-w-[44rem] whitespace-pre-line text-[0.9688rem] leading-relaxed text-ink-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      )}

      {/* Where + gifts */}
      <section className="mt-16 grid gap-6 lg:grid-cols-2">
        {location && (
          <div className="flex items-start gap-4 rounded-2xl border border-line bg-surface p-6">
            <MapPin className="mt-0.5 h-6 w-6 shrink-0 text-[var(--b)]" />
            <div>
              <h2 className="text-[1.125rem] font-semibold text-ink">Where we are</h2>
              <p className="mt-1 text-[0.9688rem] text-ink-muted">{location}</p>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[0.9375rem] font-semibold">
                <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`} target="_blank" rel="noopener noreferrer" className="text-[var(--b)] hover:underline">Directions</a>
                {org.contact_phone && <a href={`tel:${org.contact_phone.replace(/\s+/g, "")}`} className="inline-flex items-center gap-1.5 text-ink hover:underline"><Phone className="h-4 w-4" />{org.contact_phone}</a>}
              </div>
            </div>
          </div>
        )}
        {courses.some((c) => c.gift_enabled) && org.stripeReady && (
          <Link href={`/book/${org.slug}/gift`} className="flex items-start gap-4 rounded-2xl border border-line bg-surface p-6 hover:bg-zinc-50">
            <Gift className="mt-0.5 h-6 w-6 shrink-0 text-[var(--b)]" />
            <span>
              <span className="block text-[1.125rem] font-semibold text-ink">Give it as a gift</span>
              <span className="mt-1 block text-[0.9688rem] text-ink-muted">Gift certificates, emailed instantly or on the day you choose. They pick their own date.</span>
            </span>
          </Link>
        )}
      </section>
    </BookShell>
  );
}
