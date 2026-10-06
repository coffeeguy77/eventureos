import "@fontsource-variable/fraunces";
import "@fontsource/caveat/600.css";
import {
  ArrowRight, Award, Backpack, CalendarDays, Check, Clock, Coffee, Flame, Gift, GraduationCap, HandHeart, Heart, MapPin, Navigation, Phone, ShieldCheck,
  Sparkles, Star, Users, UserRound,
} from "lucide-react";
import Link from "next/link";
import type { CourseRow } from "@/lib/bookings/core";
import { landingCopy, sessionWhen } from "@/lib/bookings/core";
import type { PublicOrg, PublicSession } from "@/lib/bookings/server";
import { bookUrl } from "@/lib/bookings/server";
import type { Agent } from "@/lib/bookings/agents";
import { money } from "@/lib/format";
import { brandStyle, PAGE } from "./shell";
import { MasterNav } from "@/components/site/master-nav";
import { readSiteNav } from "@/lib/site-nav";
import { AgentBanner } from "./agent-banner";
import { BookCourseButton, LandingBooking } from "./landing-booking";
import { LandingNav, RevealOnScroll, ReviewWall, Stars, StickyBook } from "./landing-client";

const dur = (m: number) => (m % 60 === 0 ? `${m / 60} hour${m === 60 ? "" : "s"}` : m > 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`);
const clean = (n: string) => n.replace(/\s*\(\d+\s*hrs?\)\s*$/i, "");
const paras = (t: string) => t.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
const telHref = (p: string) => `tel:${p.replace(/[^\d+]/g, "")}`;
/** "Barista courses *in Canberra*" → the starred words in the brand colour */
const accent = (t: string) => t.split(/(\*[^*]+\*)/).map((part, i) => (/^\*[^*]+\*$/.test(part) ? <span key={i} className="text-[var(--b)]">{part.slice(1, -1)}</span> : part));
/** "U5, 47-49 Vicars Street, Mitchell ACT 2911" → ["U5, 47-49 Vicars Street", "Mitchell ACT 2911"] */
const addressLines = (a: string) => a.split(/,\s*/).reduce<string[]>((out, p) => (out.length && out[out.length - 1].length <= 6 ? [...out.slice(0, -1), `${out[out.length - 1]}, ${p}`] : [...out, p]), []);

const ICONS = [Users, HandHeart, GraduationCap, Award, Coffee, Flame, Sparkles, Heart];
const STAT_ICONS = [Users, Star, Coffee, GraduationCap, Award, MapPin];

/* Shared looks */
const eyebrowCls = "text-[0.8125rem] font-bold uppercase tracking-[0.16em] text-[var(--b)]";
const h2Cls = "lp-serif text-balance text-[2.25rem] font-semibold leading-[1.06] tracking-[-0.015em] text-[#171714] sm:text-[2.875rem] xl:text-[3.25rem]";
const btnPrimary = "lp-btn inline-flex h-14 items-center justify-center gap-2.5 rounded-2xl bg-[var(--b)] px-7 text-[1.0313rem] font-semibold text-[var(--on-b)] shadow-[0_10px_24px_-12px_var(--b)]";
const btnSecondary = "lp-btn inline-flex h-14 items-center justify-center gap-2 rounded-2xl px-7 text-[1.0313rem] font-semibold text-[#171714] ring-1 ring-[#2b2925]/70 hover:bg-[#171714] hover:text-[#FFFDFC]";

/** A small hand-drawn style arrow for the notes on the photo. */
function Squiggle({ className }: { className?: string }) {
  return <svg viewBox="0 0 60 40" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M4 6c10 2 22 8 28 18 3 5 4 9 3 12" /><path d="M28 30l7 7 6-9" /></svg>;
}
/** A simple line drawing of a cup (no brand artwork). */
function CupArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 120" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M30 52h86v14c0 22-18 38-43 38S30 88 30 66V52z" /><path d="M116 60h8a14 14 0 010 28h-11" /><path d="M18 108h112" />
      <path d="M58 40c-6-8 6-12 0-22M76 40c-6-8 6-12 0-22M94 40c-6-8 6-12 0-22" opacity=".55" />
      <path d="M56 66c8-6 26-6 34 0-4 10-30 10-34 0z" opacity=".6" />
    </svg>
  );
}

/**
 * The public booking page: sells the experience first, then makes booking easy.
 * Everything (words, photos, reviews, prices, dates) comes from the business's settings, courses and live sessions.
 */
export interface LandingJobs { name: string; url: string; trained: number }
export interface LandingPromo { id: string; title: string; body: string | null; cta_label: string | null; href: string | null; coupon_code: string | null; image_url: string | null; tone: string }

export function BookLanding({ org, data, agent, initialCourse, utm, source, certificate, jobs = null, promos = [], promo = null }: {
  org: PublicOrg; data: { courses: CourseRow[]; sessions: PublicSession[] }; agent: Agent | null; initialCourse: string | null;
  utm: Record<string, string>; source: "website" | "wordpress"; certificate: boolean;
  /** An offer code from the link (?code=) — applied at checkout */
  promo?: string | null;
  /** The business's barista job board — sold on the course page as a reason to train here */
  jobs?: LandingJobs | null;
  /** Shop banners placed on the course page */
  promos?: LandingPromo[];
}) {
  const L = org.settings.landing;
  const C = (k: string) => landingCopy(L, k);
  const courses = data.courses;
  const many = courses.length > 1;
  const byCourse = (id: string) => data.sessions.filter((s) => s.course_id === id);
  const next = data.sessions.find((s) => !s.full) ?? null;
  const nextCourse = next ? courses.find((c) => c.id === next.course_id) : null;
  const hero = L.heroImage ?? courses.find((c) => c.image_url)?.image_url ?? null;
  const location = courses.find((c) => c.location)?.location ?? null;
  const whatToBring = courses.find((c) => c.what_to_bring)?.what_to_bring ?? null;
  const headline = L.headline ?? `Book a class with ${org.name}`;
  const phone = L.phone ?? org.contact_phone;
  const gifts = courses.some((c) => c.gift_enabled) && org.stripeReady;
  const reviews = L.reviews;
  const avg = reviews.length ? reviews.reduce((a, r) => a + r.rating, 0) / reviews.length : 0;
  const maps = location ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${org.name}, ${location}`)}` : null;
  const extra = (id: string) => L.courses[id] ?? { badge: null, points: [], bestFor: null, level: null, focus: null };
  const gallery = L.gallery;
  const price = (c: CourseRow) => money(c.price, org.currency, { cents: Number(c.price) % 1 !== 0 });
  const giftImage = L.giftImage ?? courses.map((c) => c.image_url).filter(Boolean).slice(-1)[0] ?? hero;
  const locationImage = L.locationImage ?? null;
  const ratingLine = reviews.length ? `${avg.toFixed(1)} from ${reviews.length} reviews${L.reviewsSource ? ` on ${L.reviewsSource.label}` : ""}` : null;

  const links = [
    { href: "#courses", label: many ? "Courses" : "The course" },
    { href: "#book", label: "Dates" },
    ...(gifts ? [{ href: "#gift", label: "Gift vouchers" }] : []),
    ...(reviews.length ? [{ href: "#reviews", label: "Reviews" }] : []),
    ...(org.settings.faqs.length ? [{ href: "#faq", label: "FAQ" }] : []),
    ...(location || phone ? [{ href: "#location", label: "Contact" }] : []),
  ];

  // Structured data: the business, each course with its upcoming dates, and the FAQs
  const ld = [
    { "@context": "https://schema.org", "@type": "LocalBusiness", name: org.name, url: org.website ?? bookUrl(org), ...(org.logo_url ? { logo: org.logo_url } : {}), ...(hero ? { image: hero } : {}),
      ...(phone ? { telephone: phone } : {}), ...(location ? { address: location } : {}) },
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

  const nextWhen = next ? sessionWhen(next.starts_at, next.ends_at, org.timezone) : null;
  const booked = next ? Math.max(0, next.capacity - next.left) : 0;

  return (
    <div id="top" data-book-root style={brandStyle(org)} className="lp min-h-screen bg-[#FAF7F3] pb-24 text-[#171714] md:pb-0">
      <style>{LANDING_CSS}</style>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
      <RevealOnScroll />
      <MasterNav org={org} active="lessons" />
      <LandingNav logo={null} name={readSiteNav(org.rawSettings).lessons} phone={phone} links={links} />

      {/* ───────── Hero ───────── */}
      <header className="relative isolate overflow-hidden bg-[#1d1915] text-[#FFFDFC]">
        {hero && <img src={hero} alt="" className="lp-hero-img absolute inset-0 -z-20 h-full w-full object-cover" fetchPriority="high" />}
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(24,19,15,0.55)_0%,rgba(24,19,15,0.72)_55%,rgba(24,19,15,0.92)_100%)] lg:bg-[linear-gradient(90deg,rgba(24,19,15,0.9)_0%,rgba(24,19,15,0.72)_38%,rgba(24,19,15,0.18)_68%,rgba(24,19,15,0.05)_100%)]" />
        <div className={`${PAGE} relative grid min-h-[640px] items-center gap-10 pb-14 pt-28 lg:min-h-[740px] lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:pb-20 lg:pt-32`}>
          <div className="max-w-[44rem]">
            {L.eyebrow && <p className="lp-hand text-[1.625rem] leading-none text-[#FFFDFC]/90 sm:text-[1.875rem]">{L.eyebrow}</p>}
            <h1 className="lp-serif mt-3 text-balance text-[3rem] font-semibold leading-[0.98] tracking-[-0.02em] sm:text-[4rem] xl:text-[4.875rem]">{accent(headline)}</h1>
            {org.settings.intro && <p className="mt-6 max-w-[36rem] whitespace-pre-line text-[1.0625rem] leading-relaxed text-[#FFFDFC]/85 sm:text-[1.1875rem]">{org.settings.intro}</p>}
            {L.highlights.length > 0 && (
              <ul className="mt-7 grid max-w-[40rem] grid-cols-2 gap-x-4 gap-y-3 sm:gap-x-6 xl:grid-cols-3">
                {L.highlights.map((h) => (
                  <li key={h} className="flex items-center gap-2 text-[0.875rem] font-medium leading-snug text-[#FFFDFC] sm:gap-2.5 sm:text-[0.9688rem]">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--b)] text-[var(--on-b)]"><Check className="h-3.5 w-3.5" strokeWidth={3} /></span>{h}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <a href="#book" className={btnPrimary}>See dates &amp; book<ArrowRight className="lp-arrow h-5 w-5" /></a>
              {many && <a href="#compare" className="lp-btn inline-flex h-14 items-center rounded-2xl px-7 text-[1.0313rem] font-semibold text-[#FFFDFC] ring-1 ring-[#FFFDFC]/60 hover:bg-[#FFFDFC] hover:text-[#171714]">Compare courses</a>}
            </div>
            {ratingLine && (
              <a href="#reviews" className="mt-8 inline-flex items-center gap-3 text-[0.9375rem] text-[#FFFDFC]/90 hover:text-[#FFFDFC]">
                <Stars n={Math.round(avg)} className="h-[18px] w-[18px]" /><span><span className="font-semibold text-[#FFFDFC]">{avg.toFixed(1)}</span> from {reviews.length} student reviews{L.reviewsSource ? ` on ${L.reviewsSource.label}` : ""}</span>
              </a>
            )}
          </div>

          {/* Next class card */}
          <div className="relative lg:justify-self-end">
            {L.notes[0] && <p className="lp-hand pointer-events-none absolute -top-16 left-2 hidden -rotate-6 text-[1.75rem] leading-tight text-[#FFFDFC]/90 lg:block">{L.notes[0]}<Squiggle className="ml-6 mt-1 h-8 w-12 rotate-12 text-[#FFFDFC]/70" /></p>}
            {next && nextCourse && nextWhen ? (
              <div className="w-full rounded-[24px] bg-[#FFFDFC] p-6 text-[#171714] shadow-[0_30px_60px_-25px_rgba(0,0,0,0.6)] sm:w-[360px]">
                <p className="flex items-center gap-2 text-[0.8125rem] font-bold uppercase tracking-[0.14em] text-[var(--b)]"><CalendarDays className="h-4 w-4" />Next {many ? "class" : "date"}</p>
                <p className="lp-serif mt-3 text-[1.625rem] font-semibold leading-tight">{nextWhen.day}</p>
                <p className="mt-1 flex items-center gap-2 text-[0.9688rem] text-[#696866]"><Clock className="h-4 w-4" />{nextWhen.time}</p>
                <p className="mt-0.5 text-[0.9688rem] font-medium text-[#2b2925]">{clean(nextCourse.name)}</p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-[0.8125rem] font-semibold ${next.left <= 2 ? "bg-amber-100 text-amber-900" : "bg-emerald-50 text-emerald-800"}`}>{next.left} {next.left === 1 ? "spot" : "spots"} left</span>
                  {booked > 0 && <span className="text-[0.8125rem] text-[#696866]">{booked} already booked</span>}
                </div>
                <BookCourseButton slug={nextCourse.slug} session={next.id} className={`${btnPrimary} mt-5 h-12 w-full text-[0.9688rem]`}>Book this date<ArrowRight className="lp-arrow h-4 w-4" /></BookCourseButton>
              </div>
            ) : (
              <div className="w-full rounded-[24px] bg-[#FFFDFC] p-6 text-[#171714] sm:w-[360px]">
                <p className="lp-serif text-[1.375rem] font-semibold">New dates coming soon</p>
                {phone && <p className="mt-2 text-[0.9688rem] text-[#696866]">Call <a href={telHref(phone)} className="font-semibold text-[#171714] underline">{phone}</a> to ask about the next class.</p>}
              </div>
            )}
            {L.notes[1] && <p className="lp-hand pointer-events-none absolute -bottom-14 right-0 hidden rotate-3 text-[1.625rem] text-[#FFFDFC]/85 lg:block">{L.notes[1]}</p>}
          </div>
        </div>
      </header>

      {agent && <div className={`${PAGE} pt-6`}><AgentBanner orgSlug={org.slug} agent={agent} /></div>}

      {/* ───────── Courses ───────── */}
      <section id="courses" className="scroll-mt-24 py-20 sm:py-24">
        <div className={PAGE}>
          <div className="grid items-end gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" data-reveal>
            <div>
              <p className={eyebrowCls}>{C("coursesEyebrow")}</p>
              <h2 className={`${h2Cls} mt-3`}>{accent(C("coursesTitle"))}</h2>
            </div>
            {C("coursesIntro") && <p className="max-w-[34rem] text-[1.0625rem] leading-relaxed text-[#696866] lg:justify-self-end">{C("coursesIntro")}</p>}
          </div>
          <div className={`mt-12 grid gap-6 ${courses.length === 2 ? "md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_300px]" : courses.length > 2 ? "md:grid-cols-2 xl:grid-cols-3" : "lg:grid-cols-[minmax(0,1fr)_340px]"}`}>
            {courses.map((c) => {
              const ss = byCourse(c.id), open = ss.filter((s) => !s.full), x = extra(c.id);
              return (
                <article key={c.id} data-reveal className="group flex flex-col overflow-hidden rounded-[26px] border border-[#E9DFD5] bg-[#FFFDFC] shadow-[0_1px_2px_rgba(23,23,20,0.04)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_24px_50px_-28px_rgba(60,40,25,0.45)]">
                  <div className="relative overflow-hidden">
                    {c.image_url
                      ? <img src={c.image_url} alt={`${clean(c.name)} at ${org.name}`} className="aspect-[16/10] w-full object-cover transition duration-700 group-hover:scale-[1.04]" loading="lazy" />
                      : <div className="aspect-[16/10] w-full" style={{ background: "linear-gradient(135deg, var(--b), color-mix(in srgb, var(--b) 45%, #2b1d16))" }} />}
                    {x.badge && <span className="absolute left-4 top-4 rounded-full bg-[var(--b)] px-3.5 py-1.5 text-[0.75rem] font-bold uppercase tracking-[0.1em] text-[var(--on-b)] shadow-sm">{x.badge}</span>}
                  </div>
                  <div className="flex flex-1 flex-col p-6 sm:p-8">
                    <div className="flex items-start justify-between gap-4">
                      <h3 className="lp-serif text-[1.75rem] font-semibold leading-tight tracking-[-0.01em] sm:text-[1.9375rem]">{clean(c.name)}</h3>
                      <p className="lp-serif shrink-0 text-[1.75rem] font-semibold leading-tight sm:text-[1.9375rem]">{price(c)}</p>
                    </div>
                    <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[0.875rem] font-medium text-[#696866]">
                      <span className="inline-flex items-center gap-1.5"><Clock className="h-4 w-4 text-[var(--b)]" />{dur(c.duration_minutes)}</span>
                      <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4 text-[var(--b)]" />Up to {c.capacity} people</span>
                      {certificate && <span className="inline-flex items-center gap-1.5"><Award className="h-4 w-4 text-[var(--b)]" />Digital certificate</span>}
                    </p>
                    {c.summary && <p className="mt-5 text-[1.0625rem] font-medium leading-relaxed text-[#2b2925]">{c.summary}</p>}
                    {x.points.length > 0 ? (
                      <ul className="mt-5 grid gap-x-5 gap-y-2.5 sm:grid-cols-2">
                        {x.points.map((p) => <li key={p} className="flex items-start gap-2.5 text-[0.9688rem] text-[#2b2925]"><Check className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[var(--b)]" strokeWidth={2.75} />{p}</li>)}
                      </ul>
                    ) : c.description ? (
                      <div className="mt-4 space-y-3 text-[0.9688rem] leading-relaxed text-[#696866]">{paras(c.description).map((p, i) => <p key={i} className="whitespace-pre-line">{p}</p>)}</div>
                    ) : null}
                    <div className="mt-auto pt-7">
                      <p className="mb-4 flex items-center gap-2 text-[0.875rem] text-[#696866]"><CalendarDays className="h-4 w-4" />
                        {open[0] ? <>Next: <span className="font-semibold text-[#2b2925]">{sessionWhen(open[0].starts_at, open[0].ends_at, org.timezone).short}</span>{open.length > 1 ? ` · ${open.length} dates open` : ""}</> : "New dates soon"}</p>
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                        <BookCourseButton slug={c.slug} className={`${btnPrimary} h-12 px-6 text-[0.9688rem]`}>Book {clean(c.name)}<ArrowRight className="lp-arrow h-4 w-4" /></BookCourseButton>
                        <Link href={`/book/${org.slug}/${c.slug}`} className="text-[0.9375rem] font-semibold text-[#2b2925] underline decoration-[#D9CCBF] underline-offset-4 hover:decoration-[var(--b)]">View course details</Link>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
            <aside data-reveal className="relative flex flex-col overflow-hidden rounded-[26px] bg-[color-mix(in_srgb,var(--b)_10%,#FFFDFC)] p-7 sm:p-8 md:col-span-2 xl:col-span-1">
              <Coffee className="h-9 w-9 text-[var(--b)]" strokeWidth={1.6} />
              <h3 className="lp-serif mt-5 text-[1.625rem] font-semibold leading-tight">{C("helpTitle")}</h3>
              <p className="mt-3 text-[1rem] leading-relaxed text-[#5b5955]">{C("helpText")}</p>
              <div className="mt-6 flex flex-wrap gap-3">
                {many && <a href="#compare" className="lp-btn inline-flex h-12 items-center gap-2 rounded-xl bg-[#FFFDFC] px-5 text-[0.9375rem] font-semibold text-[#171714] ring-1 ring-[#2b2925]/25">Compare courses<ArrowRight className="lp-arrow h-4 w-4" /></a>}
                {phone && <a href={telHref(phone)} className="inline-flex h-12 items-center gap-2 rounded-xl px-2 text-[0.9375rem] font-semibold text-[#171714]"><Phone className="h-4 w-4 text-[var(--b)]" />{phone}</a>}
              </div>
              <CupArt className="mt-auto hidden w-40 self-end pt-8 text-[#2b2925]/70 xl:block" />
            </aside>
          </div>
        </div>
      </section>

      {/* ───────── Booking ───────── */}
      <section id="book" className="scroll-mt-20 bg-[color-mix(in_srgb,var(--b)_7%,#F6EEE6)] py-20 sm:py-24">
        <div className={`${PAGE} grid items-start gap-8 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-x-14 lg:gap-y-8`}>
          <div className="lg:col-start-1 lg:row-start-1">
            <p className={eyebrowCls}>{C("bookEyebrow")}</p>
            <h2 className={`${h2Cls} mt-3`}>{accent(C("bookTitle"))}</h2>
            {C("bookIntro") && <div className="mt-5 space-y-3 text-[1.0625rem] leading-relaxed text-[#5b5955]">{paras(C("bookIntro")).map((p, i) => <p key={i} className="whitespace-pre-line">{p}</p>)}</div>}
            {C("bookPoints") && (
              <ul className="mt-6 space-y-3">
                {C("bookPoints").split("\n").map((x) => x.trim()).filter(Boolean).map((p) => (
                  <li key={p} className="flex items-center gap-3 text-[1rem] font-medium text-[#2b2925]"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--b)] text-[var(--on-b)]"><Check className="h-3.5 w-3.5" strokeWidth={3} /></span>{p}</li>
                ))}
              </ul>
            )}
          </div>
          <div className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1">
            <LandingBooking initial={initialCourse} dateStyle="cards"
              base={{ org: { slug: org.slug, name: org.name, currency: org.currency, timezone: org.timezone, stripeReady: org.stripeReady, showSeatsLeft: org.settings.show_seats_left, waitlist: org.settings.waitlist, terms: org.settings.terms, cancelHours: org.settings.cancel_hours },
                utm, embed: false, source, promo,
                agent: agent ? { code: agent.agency.code, agency: agent.agency.name, price: agent.agency.price === null ? null : Number(agent.agency.price), poRequired: agent.agency.po_required, name: agent.cm.name, site: agent.cm.site } : null }}
              courses={courses.map((c) => ({ slug: c.slug, label: clean(c.name), meta: `${dur(c.duration_minutes)} · ${price(c)}`, course: { id: c.id, name: c.name, price: Number(c.price), maxSeats: c.max_seats_per_booking, questions: c.questions ?? [] }, sessions: byCourse(c.id) }))} />
          </div>
          <div className="space-y-3 lg:col-start-1 lg:row-start-2">
              {whatToBring && (
                <div className="rounded-2xl bg-[#FFFDFC]/80 p-5 ring-1 ring-[#E4D6C9]">
                  <p className="flex items-center gap-2 text-[0.9375rem] font-semibold"><Backpack className="h-4 w-4 text-[var(--b)]" />What to bring</p>
                  <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-[#5b5955]">{whatToBring}</p>
                </div>
              )}
              {location && (
                <div className="rounded-2xl bg-[#FFFDFC]/80 p-5 ring-1 ring-[#E4D6C9]">
                  <p className="flex items-center gap-2 text-[0.9375rem] font-semibold"><MapPin className="h-4 w-4 text-[var(--b)]" />Where</p>
                  <p className="mt-1.5 text-[0.9375rem] text-[#5b5955]">{location}</p>
                  {maps && <a href={maps} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-[0.9063rem] font-semibold text-[var(--b)]"><Navigation className="h-3.5 w-3.5" />Directions</a>}
                </div>
              )}
              <div className="rounded-2xl bg-[#FFFDFC]/80 p-5 ring-1 ring-[#E4D6C9]">
                <p className="flex items-center gap-2 text-[0.9375rem] font-semibold"><UserRound className="h-4 w-4 text-[var(--b)]" />Already booked?</p>
                <p className="mt-1.5 text-[0.9375rem] text-[#5b5955]">Sign in with your email to see your booking, change the date or download your certificate. No password needed.</p>
                <Link href={`/book/${org.slug}/account`} className="mt-2 inline-flex text-[0.9063rem] font-semibold text-[var(--b)]">My bookings →</Link>
              </div>
              {org.settings.terms && (
                <details className="group rounded-2xl bg-[#FFFDFC]/80 p-5 ring-1 ring-[#E4D6C9] [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-[0.9375rem] font-semibold"><span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[var(--b)]" />Booking terms</span><span className="text-[1.25rem] leading-none text-[#9a958e] transition-transform group-open:rotate-45" aria-hidden>+</span></summary>
                  <p className="lp-open mt-2 whitespace-pre-line text-[0.875rem] leading-relaxed text-[#5b5955]">{org.settings.terms}</p>
                </details>
              )}
          </div>
        </div>
      </section>

      {/* ───────── Trust strip ───────── */}
      {L.stats.length > 0 && (
        <section aria-label="Why people choose us" className="border-y border-[#E9DFD5] bg-[#FFFDFC]">
          <ul className={`${PAGE} grid grid-cols-2 gap-y-8 py-10 sm:py-12 md:grid-cols-3 ${({ 4: "xl:grid-cols-4", 5: "xl:grid-cols-5", 6: "xl:grid-cols-6" } as Record<number, string>)[L.stats.length] ?? ""}`}>
            {L.stats.map((s, i) => {
              const I = STAT_ICONS[i % STAT_ICONS.length];
              return (
                <li key={i} data-reveal className="flex items-center gap-4 px-2">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full ring-1 sm:h-14 sm:w-14 ring-[color-mix(in_srgb,var(--b)_45%,#FFFDFC)]"><I className="h-6 w-6 text-[var(--b)]" strokeWidth={1.6} /></span>
                  <span className="min-w-0">
                    <span className="lp-serif block text-[1.375rem] font-semibold leading-none sm:text-[1.75rem]">{s.value}</span>
                    <span className="mt-1.5 block text-[0.875rem] leading-snug text-[#696866]">{s.label}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ───────── Reviews ───────── */}
      {reviews.length > 0 && (
        <section id="reviews" className="scroll-mt-24 py-20 sm:py-24">
          <div className={PAGE}>
            <div className="flex flex-wrap items-end justify-between gap-6" data-reveal>
              <div>
                <p className={eyebrowCls}>{C("reviewsEyebrow")}</p>
                <h2 className={`${h2Cls} mt-3`}>{accent(C("reviewsTitle"))}</h2>
              </div>
              <div className="flex items-center gap-4 rounded-2xl bg-[#FFFDFC] px-5 py-4 ring-1 ring-[#E9DFD5]">
                <span className="lp-serif text-[2.5rem] font-semibold leading-none">{avg.toFixed(1)}</span>
                <span>
                  <Stars n={Math.round(avg)} className="h-[18px] w-[18px]" />
                  <span className="mt-1 block text-[0.875rem] text-[#696866]">
                    {reviews.length} reviews{L.reviewsSource ? <> on {L.reviewsSource.url ? <a href={L.reviewsSource.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#171714] underline decoration-[#D9CCBF] underline-offset-2">{L.reviewsSource.label}</a> : L.reviewsSource.label}</> : null}
                  </span>
                </span>
              </div>
            </div>
            <div className="mt-12"><ReviewWall reviews={reviews} /></div>
          </div>
        </section>
      )}

      {/* ───────── Gift vouchers ───────── */}
      {gifts && (
        <section id="gift" className="scroll-mt-24 pb-20 sm:pb-24">
          <div className={PAGE}>
            <div data-reveal className="relative grid overflow-hidden rounded-[30px] bg-[#2E211A] text-[#F7EFE6] lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
              <div className="relative min-h-[260px] lg:min-h-[460px]">
                {giftImage && <img src={giftImage} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />}
                <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_55%,#2E211A_100%)] max-lg:bg-[linear-gradient(180deg,transparent_55%,#2E211A_100%)]" />
              </div>
              <div className="relative grid items-center gap-10 p-8 sm:p-12 xl:grid-cols-[minmax(0,1fr)_240px]">
                <div>
                  <h2 className="lp-serif text-balance text-[2.25rem] font-semibold leading-[1.06] sm:text-[2.875rem]">{accent(C("giftTitle"))}</h2>
                  <p className="mt-4 max-w-[30rem] text-[1.0625rem] leading-relaxed text-[#E6D9CC]">{C("giftText")}</p>
                  <ul className="mt-6 grid max-w-[30rem] grid-cols-2 gap-x-6 gap-y-3 text-[0.9688rem] font-medium">
                    <li className="flex items-center gap-2.5"><CalendarDays className="h-5 w-5 text-[var(--b)]" />Valid for {org.settings.gift_expiry_months} months</li>
                    <li className="flex items-center gap-2.5"><Coffee className="h-5 w-5 text-[var(--b)]" />Use towards any course</li>
                    <li className="flex items-center gap-2.5"><Gift className="h-5 w-5 text-[var(--b)]" />Emailed now or on a set day</li>
                    <li className="flex items-center gap-2.5"><Sparkles className="h-5 w-5 text-[var(--b)]" />They choose their date</li>
                  </ul>
                  <Link href={`/book/${org.slug}/gift`} className={`${btnPrimary} mt-8`}>Buy a gift voucher<ArrowRight className="lp-arrow h-5 w-5" /></Link>
                </div>
                <div aria-hidden className="relative mx-auto hidden w-[230px] rotate-[-5deg] rounded-[20px] bg-[color-mix(in_srgb,var(--b)_16%,#FFFDFC)] p-6 text-[#2b2925] shadow-[0_30px_50px_-20px_rgba(0,0,0,0.6)] sm:block">
                  <span className="absolute inset-y-0 right-10 w-3 bg-[var(--b)] opacity-80" /><span className="absolute inset-x-0 top-12 h-3 bg-[var(--b)] opacity-80" />
                  {org.logo_url && /^https:\/\//.test(org.logo_url) ? <img src={org.logo_url} alt="" className="relative h-8 max-w-[120px] object-contain" /> : <p className="lp-serif relative font-semibold">{org.name}</p>}
                  <p className="lp-hand relative mt-12 text-[2.125rem] leading-none text-[var(--b)]">Gift voucher</p>
                  <p className="relative mt-3 text-[0.75rem] font-semibold uppercase tracking-[0.14em] text-[#696866]">{many ? "Any course" : clean(courses[0].name)}</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ───────── Barista jobs: the course keeps working after the class ───────── */}
      {jobs && (
        <section id="jobs" className="relative isolate scroll-mt-24 overflow-hidden bg-[#171411] py-20 text-[#F7F1EA] sm:py-24">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_85%_15%,color-mix(in_srgb,var(--b)_26%,transparent),transparent_55%)]" />
          <div className={`${PAGE} grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]`}>
            <div data-reveal>
              <p className="lp-hand text-[1.75rem] leading-none text-[var(--b)]">Your course doesn&apos;t end when the class does</p>
              <h2 className="lp-serif mt-4 text-balance text-[2.25rem] font-semibold leading-[1.06] tracking-[-0.015em] sm:text-[2.875rem] xl:text-[3.25rem]">Train with us and get found by employers</h2>
              <p className="mt-5 max-w-[36rem] text-[1.0938rem] leading-relaxed text-[#F7F1EA]/80">Every student gets a free profile on <span className="font-semibold text-[#F7F1EA]">{jobs.name}</span> — our own job board where cafés, coffee carts and event companies look for trained baristas.</p>
              <ul className="mt-7 grid gap-3 sm:grid-cols-2">
                {[
                  { t: "Free profile, included", d: "Switch it on after your course. Add your suburb and the days you're free." },
                  { t: "Your certificate shows", d: "Employers can see you've been trained — and by whom." },
                  { t: "Shifts and jobs", d: "See work that local businesses post, from one-off events to regular shifts." },
                  { t: "You stay in control", d: "Your phone and email stay private until you choose to share them." },
                ].map((x) => (
                  <li key={x.t} className="rounded-2xl bg-white/[0.05] p-5 ring-1 ring-white/10">
                    <p className="flex items-center gap-2 font-semibold"><Check className="h-5 w-5 shrink-0 text-[var(--b)]" strokeWidth={2.75} />{x.t}</p>
                    <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-[#F7F1EA]/70">{x.d}</p>
                  </li>
                ))}
              </ul>
              <div className="mt-8 flex flex-wrap gap-3">
                <a href="#book" className="lp-btn inline-flex h-14 items-center gap-2 rounded-2xl bg-[var(--b)] px-7 text-[1.0313rem] font-semibold text-[var(--on-b)]">Book your course<ArrowRight className="lp-arrow h-5 w-5" /></a>
                <Link href={jobs.url} className="lp-btn inline-flex h-14 items-center rounded-2xl px-7 text-[1.0313rem] font-semibold ring-1 ring-[#F7F1EA]/50 hover:bg-[#F7F1EA] hover:text-[#171714]">See {jobs.name}</Link>
              </div>
            </div>
            <div data-reveal className="relative mx-auto w-full max-w-[420px]">
              {jobs.trained >= 50 && (
                <div className="absolute -left-4 -top-6 z-10 rotate-[-4deg] rounded-2xl bg-[var(--b)] px-5 py-3 text-[var(--on-b)] shadow-xl sm:-left-10">
                  <p className="lp-serif text-[2rem] font-semibold leading-none">{(Math.floor(jobs.trained / 50) * 50).toLocaleString("en-AU")}+</p>
                  <p className="text-[0.8125rem] font-semibold">baristas trained</p>
                </div>
              )}
              {/* An example profile card (illustration) */}
              <div aria-hidden className="rounded-[28px] bg-[#FFFDFC] p-6 text-[#171714] shadow-[0_40px_80px_-40px_rgba(0,0,0,.9)]">
                <div className="flex items-center gap-4">
                  <span className="grid h-16 w-16 place-items-center rounded-2xl bg-[color-mix(in_srgb,var(--b)_18%,white)] text-[var(--b)]"><Coffee className="h-8 w-8" strokeWidth={1.6} /></span>
                  <div><p className="lp-serif text-[1.375rem] font-semibold">Your profile</p><p className="flex items-center gap-1 text-[0.875rem] text-[#696866]"><MapPin className="h-3.5 w-3.5" />Your suburb</p></div>
                </div>
                <div className="mt-5 flex flex-wrap gap-1.5">{["Espresso", "Milk texturing", "Latte art", "Events"].map((t) => <span key={t} className="rounded-full bg-[#F1EAE2] px-3 py-1 text-[0.8125rem] font-medium">{t}</span>)}</div>
                <div className="mt-5 flex items-center gap-3 rounded-2xl bg-[#F6F0E9] p-4">
                  <Award className="h-7 w-7 shrink-0 text-[var(--b)]" strokeWidth={1.6} />
                  <div><p className="text-[0.9375rem] font-semibold">Trained at {org.name}</p><p className="text-[0.8125rem] text-[#696866]">Certificate verified</p></div>
                </div>
                <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[0.6875rem] font-semibold text-[#696866]">
                  {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <span key={i} className={`rounded-lg py-2 ${i >= 5 ? "bg-[var(--b)] text-[var(--on-b)]" : "bg-[#F1EAE2]"}`}>{d}</span>)}
                </div>
                <p className="mt-4 rounded-xl border border-dashed border-[#D9CCBF] p-3 text-center text-[0.875rem] font-medium">A café nearby wants to chat about weekend shifts</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {promos.length > 0 && (
        <section aria-label="Offers" className={`${PAGE} grid gap-4 py-10 md:grid-cols-2`}>
          {promos.map((b) => (
            <a key={b.id} href={b.href ?? "#"} className={`relative flex min-h-[150px] overflow-hidden rounded-[26px] p-7 ${b.tone === "dark" ? "bg-[#1d1915] text-[#FFFDFC]" : b.tone === "light" ? "border border-[#E9DFD5] bg-[#FFFDFC]" : "bg-[var(--b)] text-[var(--on-b)]"}`}>
              {b.image_url && <img src={b.image_url} alt="" className="absolute inset-y-0 right-0 h-full w-2/5 object-cover" />}
              <div className={b.image_url ? "relative w-3/5 pr-4" : "relative"}>
                <p className="lp-serif text-[1.625rem] font-semibold leading-tight">{b.title}</p>
                {b.body && <p className="mt-2 opacity-90">{b.body}</p>}
                {b.coupon_code && <p className="mt-3 inline-flex rounded-lg border border-dashed border-current px-3 py-1 font-mono font-bold tracking-wider">{b.coupon_code}</p>}
                <p className="mt-3 inline-flex items-center gap-1.5 font-semibold">{b.cta_label || "Shop now"}<ArrowRight className="h-4 w-4" /></p>
              </div>
            </a>
          ))}
        </section>
      )}

      {/* ───────── Why us + longer words ───────── */}
      {(L.benefits.length > 0 || L.sections.length > 0) && (
        <section id="why" className="scroll-mt-24 bg-[#FFFDFC] py-20 sm:py-24">
          <div className={PAGE}>
            {L.benefits.length > 0 && (
              <>
                <h2 className={`${h2Cls} max-w-[40rem]`} data-reveal>{accent(C("whyTitle"))}</h2>
                <ul className="mt-12 grid gap-px overflow-hidden rounded-[26px] bg-[#E9DFD5] ring-1 ring-[#E9DFD5] sm:grid-cols-2 xl:grid-cols-3">
                  {L.benefits.map((b, i) => {
                    const I = ICONS[i % ICONS.length];
                    return (
                      <li key={i} data-reveal className="bg-[#FFFDFC] p-7 transition-colors hover:bg-[#FBF6F1] sm:p-8">
                        <I className="h-8 w-8 text-[var(--b)]" strokeWidth={1.6} />
                        <h3 className="mt-5 text-[0.875rem] font-bold uppercase tracking-[0.14em] text-[#171714]">{b.title}</h3>
                        <p className="mt-2.5 text-[1rem] leading-relaxed text-[#5b5955]">{b.body}</p>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
            {L.sections.length > 0 && (
              <div className={`grid gap-x-16 gap-y-12 lg:grid-cols-2 ${L.benefits.length ? "mt-20" : ""}`}>
                {L.sections.map((x) => (
                  <div key={x.heading} className="max-w-[40rem]" data-reveal>
                    <h2 className="lp-serif text-[1.75rem] font-semibold leading-tight tracking-[-0.01em] sm:text-[2rem]">{x.heading}</h2>
                    <div className="mt-4 space-y-4 text-[1.0625rem] leading-[1.75] text-[#5b5955]">{paras(x.body).map((p, i) => <p key={i} className="whitespace-pre-line">{p}</p>)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ───────── The experience (photos) ───────── */}
      {gallery.length >= 3 && (
        <section className="py-20 sm:py-24">
          <div className={PAGE}>
            <h2 className={`${h2Cls} max-w-[44rem] whitespace-pre-line`} data-reveal>{accent(C("galleryTitle"))}</h2>
            <div className="mt-12 grid auto-rows-[180px] grid-cols-2 gap-4 sm:auto-rows-[220px] lg:grid-cols-4">
              {gallery.map((g, i) => {
                const span = ["row-span-2", "", "row-span-2", "", "col-span-2", "", "row-span-2", ""][i % 8];
                return (
                  <figure key={i} data-reveal className={`group relative overflow-hidden rounded-[22px] bg-[#E9DFD5] ${span}`}>
                    <img src={g.image} alt={g.caption ?? ""} className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.05]" loading="lazy" />
                    {g.caption && <figcaption className="absolute inset-x-0 bottom-0 bg-[linear-gradient(180deg,transparent,rgba(20,15,12,0.75))] p-4 pt-12 text-[1rem] font-semibold text-[#FFFDFC]">{g.caption}</figcaption>}
                  </figure>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ───────── Compare ───────── */}
      {many && (
        <section id="compare" className="scroll-mt-24 py-20 sm:py-24">
          <div className={PAGE}>
            <h2 className={`${h2Cls} text-center`} data-reveal>{accent(C("compareTitle"))}</h2>
            <div className="mx-auto mt-12 max-w-[1080px] overflow-x-auto rounded-[26px] border border-[#E9DFD5] bg-[#FFFDFC]" data-reveal>
              <table className="w-full min-w-[560px] border-collapse text-left">
                <thead>
                  <tr>
                    <th className="w-[26%] p-5 sm:p-6"><span className="sr-only">Compare</span></th>
                    {courses.map((c, i) => (
                      <th key={c.id} scope="col" className={`p-5 align-bottom sm:p-6 ${i === 0 ? "" : "border-l border-[#E9DFD5]"}`}>
                        {extra(c.id).badge && <span className="mb-2 block text-[0.75rem] font-bold uppercase tracking-[0.12em] text-[var(--b)]">{extra(c.id).badge}</span>}
                        <span className="lp-serif block text-[1.375rem] font-semibold leading-tight sm:text-[1.5rem]">{clean(c.name)}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="text-[0.9688rem]">
                  {([
                    ["Best for", (c: CourseRow) => extra(c.id).bestFor],
                    ["Duration", (c: CourseRow) => dur(c.duration_minutes)],
                    ["Experience", (c: CourseRow) => extra(c.id).level],
                    ["Focus", (c: CourseRow) => extra(c.id).focus],
                    ["Class size", (c: CourseRow) => `Up to ${c.capacity} people`],
                    ...(certificate ? [["Certificate", () => "Digital certificate included"] as const] : []),
                    ["Price", (c: CourseRow) => price(c)],
                  ] as const).filter(([, f]) => courses.some((c) => (f as (c: CourseRow) => string | null)(c))).map(([label, f]) => (
                    <tr key={label} className="border-t border-[#E9DFD5]">
                      <th scope="row" className="p-5 font-semibold text-[#696866] sm:px-6">{label}</th>
                      {courses.map((c, i) => <td key={c.id} className={`p-5 sm:px-6 ${i === 0 ? "" : "border-l border-[#E9DFD5]"} ${label === "Price" ? "lp-serif text-[1.375rem] font-semibold" : "text-[#2b2925]"}`}>{(f as (c: CourseRow) => string | null)(c) ?? "—"}</td>)}
                    </tr>
                  ))}
                  <tr className="border-t border-[#E9DFD5]">
                    <td className="p-5 sm:px-6" />
                    {courses.map((c, i) => <td key={c.id} className={`p-5 sm:px-6 ${i === 0 ? "" : "border-l border-[#E9DFD5]"}`}><BookCourseButton slug={c.slug} className={`${btnPrimary} h-12 px-5 text-[0.9375rem]`}>Book<ArrowRight className="lp-arrow h-4 w-4" /></BookCourseButton></td>)}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* ───────── FAQ ───────── */}
      {org.settings.faqs.length > 0 && (
        <section id="faq" className="scroll-mt-24 bg-[#FFFDFC] py-20 sm:py-24">
          <div className={`${PAGE} grid gap-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-14`}>
            <div data-reveal>
              <h2 className={h2Cls}>{accent(C("faqTitle"))}</h2>
              <p className="mt-4 max-w-sm text-[1.0625rem] leading-relaxed text-[#5b5955]">Still unsure? {phone ? <>Call us on <a href={telHref(phone)} className="font-semibold text-[#171714] underline decoration-[var(--b)] underline-offset-4">{phone}</a>.</> : "Just get in touch."}</p>
            </div>
            <div className="divide-y divide-[#E9DFD5] border-y border-[#E9DFD5]" data-reveal>
              {org.settings.faqs.map((f) => (
                <details key={f.q} className="group py-1 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex min-h-[64px] cursor-pointer list-none items-center justify-between gap-6 py-4 text-[1.0625rem] font-semibold sm:text-[1.125rem]">
                    {f.q}<span className="grid h-9 w-9 shrink-0 place-items-center rounded-full ring-1 ring-[#D9CCBF] transition duration-300 group-open:rotate-45 group-open:bg-[var(--b)] group-open:text-[var(--on-b)] group-open:ring-[var(--b)]" aria-hidden>+</span>
                  </summary>
                  <p className="lp-open max-w-[46rem] whitespace-pre-line pb-6 text-[1rem] leading-relaxed text-[#5b5955]">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ───────── Location ───────── */}
      {(location || phone) && (
        <section id="location" className="scroll-mt-24 py-20 sm:py-24">
          <div className={`${PAGE} grid items-stretch gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]`}>
            <div data-reveal className="flex flex-col justify-center">
              <h2 className={`${h2Cls} whitespace-pre-line`}>{accent(C("locationTitle"))}</h2>
              <p className="mt-6 text-[1.125rem] font-semibold">{org.name}</p>
              {location && <address className="mt-1 not-italic text-[1.0625rem] leading-relaxed text-[#5b5955]">{addressLines(location).map((p, i) => <span key={i} className="block">{p}</span>)}</address>}
              {phone && <a href={telHref(phone)} className="mt-4 inline-flex items-center gap-2 text-[1.0625rem] font-semibold"><Phone className="h-5 w-5 text-[var(--b)]" />{phone}</a>}
              {L.locationPoints.length > 0 && (
                <ul className="mt-6 space-y-2.5">
                  {L.locationPoints.map((p) => <li key={p} className="flex items-center gap-2.5 text-[1rem] text-[#2b2925]"><Check className="h-[18px] w-[18px] text-[var(--b)]" strokeWidth={2.75} />{p}</li>)}
                </ul>
              )}
              {maps && <a href={maps} target="_blank" rel="noopener noreferrer" className={`${btnSecondary} mt-8 self-start`}><Navigation className="h-5 w-5" />Get directions</a>}
            </div>
            {location && (
              <div data-reveal className={`grid gap-4 ${locationImage ? "sm:grid-cols-2" : ""}`}>
                {locationImage && <img src={locationImage} alt={`Inside ${org.name}`} className="h-full min-h-[280px] w-full rounded-[26px] object-cover" loading="lazy" />}
                <div className="overflow-hidden rounded-[26px] border border-[#E9DFD5] bg-[#EFE4DA]">
                  <iframe title={`Map: ${org.name}`} src={`https://maps.google.com/maps?q=${encodeURIComponent(`${org.name}, ${location}`)}&z=15&output=embed`} className="block h-full min-h-[340px] w-full border-0" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ───────── Final call ───────── */}
      <section className="relative isolate overflow-hidden bg-[#15251F] py-20 text-[#F4EDE4] sm:py-28">
        <svg aria-hidden className="absolute inset-0 -z-10 h-full w-full opacity-[0.05]"><defs><pattern id="lp-beans" width="120" height="120" patternUnits="userSpaceOnUse" patternTransform="rotate(18)"><g fill="none" stroke="#F4EDE4" strokeWidth="2"><ellipse cx="30" cy="30" rx="14" ry="20" /><path d="M30 10c-6 10 6 30 0 40" /><ellipse cx="90" cy="90" rx="14" ry="20" /><path d="M90 70c-6 10 6 30 0 40" /></g></pattern></defs><rect width="100%" height="100%" fill="url(#lp-beans)" /></svg>
        <div className={`${PAGE} flex flex-col items-start justify-between gap-10 lg:flex-row lg:items-end`}>
          <div className="max-w-[46rem]" data-reveal>
            <p className="lp-hand text-[1.875rem] leading-none text-[var(--b)]">{C("ctaEyebrow")}</p>
            <h2 className="lp-serif mt-3 text-balance text-[2.5rem] font-semibold leading-[1.04] tracking-[-0.015em] sm:text-[3.5rem]">{accent(C("ctaTitle"))}</h2>
            {C("ctaText") && <p className="mt-5 max-w-[38rem] text-[1.125rem] leading-relaxed text-[#cfd6d1]">{C("ctaText")}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-3" data-reveal>
            <a href="#book" className={btnPrimary}>See dates &amp; book<ArrowRight className="lp-arrow h-5 w-5" /></a>
            {many && <a href="#compare" className="lp-btn inline-flex h-14 items-center rounded-2xl px-7 text-[1.0313rem] font-semibold text-[#F4EDE4] ring-1 ring-[#F4EDE4]/50 hover:bg-[#F4EDE4] hover:text-[#15251F]">Compare courses</a>}
            {phone && <a href={telHref(phone)} className="inline-flex h-14 items-center gap-2 px-3 text-[1.0313rem] font-semibold text-[#F4EDE4]"><Phone className="h-5 w-5 text-[var(--b)]" />{phone}</a>}
          </div>
        </div>
      </section>

      <footer className="bg-[#101C17] py-8 text-[0.8438rem] text-[#9fa9a3]">
        <div className={`${PAGE} flex flex-wrap items-center justify-between gap-4`}>
          <p>{[org.name, location, phone, org.contact_email].filter(Boolean).join(" · ")}</p>
          <p className="flex flex-wrap gap-x-5 gap-y-1">
            <Link href={`/book/${org.slug}/account`} className="hover:text-[#F4EDE4]">My bookings</Link>
            {org.website && /^https?:\/\//.test(org.website) && <a href={org.website} className="hover:text-[#F4EDE4]">{org.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</a>}
            <span>Secure booking by EventureOS</span>
          </p>
        </div>
      </footer>
      <StickyBook phone={phone} />
    </div>
  );
}

const LANDING_CSS = `
.lp .lp-serif{font-family:'Fraunces Variable',Georgia,'Times New Roman',serif;font-optical-sizing:auto;font-variation-settings:'SOFT' 50}
.lp .lp-hand{font-family:'Caveat',cursive;font-weight:600}
.lp .lp-btn{transition:transform .2s ease,box-shadow .2s ease,background-color .2s ease,color .2s ease,opacity .2s}
.lp .lp-btn:hover{transform:translateY(-1px)}
.lp .lp-btn .lp-arrow{transition:transform .2s ease}
.lp .lp-btn:hover .lp-arrow{transform:translateX(3px)}
.lp .lp-hero-img{animation:lp-zoom 1.6s cubic-bezier(.2,.7,.2,1) both}
@keyframes lp-zoom{from{transform:scale(1.07)}to{transform:scale(1)}}
.lp details[open] .lp-open{animation:lp-fade .3s ease both}
@keyframes lp-fade{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
.lp-js .lp [data-reveal]{opacity:0;transform:translateY(18px);transition:opacity .7s ease,transform .7s cubic-bezier(.2,.7,.2,1)}
.lp-js .lp [data-reveal][data-shown]{opacity:1;transform:none}
html{scroll-behavior:smooth}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}.lp *{animation:none!important;transition:none!important}}
`;
