import "@fontsource/playfair-display/700.css";
import { PageBg } from "@/components/site/page-bg";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Briefcase, CalendarDays, GraduationCap, Lock, MapPin, ShieldCheck, Store, Users } from "lucide-react";
import { createServiceClient } from "@/lib/integrations/runtime";
import { currentStudent } from "@/lib/bookings/student-auth";
import { JOB_KINDS } from "@/lib/jobs/core";
import { jobsOrg, openPosts, publicBaristas, trainedCount } from "@/lib/jobs/server";
import { trainedLabel as trainedLabelOf } from "@/lib/bookings/core";
import { brandStyle, PAGE } from "@/components/book/shell";
import { MasterNav } from "@/components/site/master-nav";
import { BaristaAuth } from "@/components/jobs/tools";
import { BaristaBoard } from "@/components/jobs/board";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ org: string }> }) {
  const org = await jobsOrg((await params).org);
  return { title: org?.jobs.name ?? "Barista jobs", description: org ? `Find trained baristas, or find barista work — ${org.jobs.name}.` : undefined };
}

const serif = { fontFamily: "'AU Dollar', 'Playfair Display', Georgia, serif" };
const glass = "rounded-2xl border border-white/10 bg-[#141010]/70 backdrop-blur-md";

/** "Bean Culture Barista Jobs" → the last two words in the brand colour on their own line. */
function Title({ name }: { name: string }) {
  const w = name.split(/\s+/);
  if (w.length < 3) return <>{name}</>;
  return <>{w.slice(0, -2).join(" ")}<br /><span className="text-[var(--b)]">{w.slice(-2).join(" ")}</span></>;
}

export default async function JobsHome({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ join?: string }> }) {
  const { org: slug } = await params;
  const org = await jobsOrg(slug);
  if (!org || !org.jobs.enabled) notFound();
  const db = createServiceClient();
  const [me, posts, cards, trained] = await Promise.all([
    currentStudent(org).catch(() => null), openPosts(db, org.id).catch(() => []), publicBaristas(db, org.id).catch(() => []), trainedCount(db, org.id).catch(() => 0),
  ]);
  const joining = (await searchParams).join === "1";
  const trainedLabel = trained >= 20 ? trainedLabelOf(trained) : null;
  const logo = org.logo_url && /^https:\/\//.test(org.logo_url) ? org.logo_url : null;
  const features = [
    { i: Lock, t: "Your details stay private", d: "Employers never see your phone or email unless you choose to share them." },
    { i: MapPin, t: "Work near you", d: "Add your suburb and how far you'll travel." },
    { i: CalendarDays, t: "Only when you're free", d: "Weekends only? Mornings? You choose." },
    { i: ShieldCheck, t: "Show you're trained", d: `Your ${org.name} certificate appears on your profile.` },
  ];

  return (
    <div style={brandStyle(org)} className="min-h-screen bg-[#0E0B0A] text-white">
      <PageBg color="#0E0B0A" />
      <MasterNav org={org} active="jobs" />
      {/* Top: photo, headline, sign-in */}
      <div className="relative isolate overflow-hidden">
        {org.jobs.heroImage
          ? <img src={org.jobs.heroImage} alt="" className="absolute inset-0 -z-20 h-full w-full object-cover object-center" />
          : <div className="absolute inset-0 -z-20 bg-[radial-gradient(ellipse_at_60%_20%,color-mix(in_srgb,var(--b)_22%,#2a201d),#0E0B0A_70%)]" />}
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(14,11,10,0.82)_0%,rgba(14,11,10,0.35)_42%,rgba(14,11,10,0.05)_62%,rgba(14,11,10,0.45)_100%),linear-gradient(180deg,rgba(14,11,10,0.15)_0%,rgba(14,11,10,0)_55%,#0E0B0A_100%)] max-lg:bg-[rgba(14,11,10,0.72)]" />

        <header className="border-b border-white/10">
          <div className={`${PAGE} flex h-16 items-center gap-4`}>
            <Link href={`/jobs/${slug}`} className="flex min-w-0 items-center gap-3">
              <span className="truncate text-[1.0625rem] font-semibold">{org.jobs.name}</span>
            </Link>
            <span className="flex-1" />
            {me ? (
              <nav className="flex items-center gap-1 text-[0.9375rem]">
                <Link href={`/jobs/${slug}/me`} className="rounded-lg px-3 py-2 text-white/85 hover:text-white">My profile</Link>
                <Link href={`/jobs/${slug}/work`} className="rounded-lg px-3 py-2 text-white/85 hover:text-white">Jobs &amp; shifts</Link>
              </nav>
            ) : (
              <Link href={`/jobs/${slug}/employers`} className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-[0.9688rem] font-medium text-white/90 hover:text-white">For employers <ArrowRight className="h-4 w-4 text-[var(--b)]" /></Link>
            )}
          </div>
        </header>

        <div className={`${PAGE} grid gap-8 pb-8 pt-7 lg:grid-cols-[minmax(0,1fr)_390px] lg:gap-10 lg:pb-6 lg:pt-6`}>
          <div>
            <p className="text-[0.8438rem] font-semibold uppercase tracking-[0.14em] text-[var(--b)]">Free for baristas</p>
            <h1 className="mt-2 text-[2.75rem] font-bold leading-[0.98] tracking-[-0.01em] sm:text-[3.5rem] xl:text-[4.25rem]" style={serif}><Title name={org.jobs.name} /></h1>
            <p className="mt-4 max-w-[34rem] text-[1.0625rem] leading-relaxed text-white/85 sm:text-[1.125rem]">Cafés, coffee carts and event companies looking for staff can find trained baristas — and post shifts and jobs you can say yes to.</p>
            <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-4">
              {trainedLabel && (
                <div className="flex items-center gap-3.5">
                  <span className="grid h-14 w-14 place-items-center rounded-full bg-[color-mix(in_srgb,var(--b)_14%,transparent)] ring-1 ring-[color-mix(in_srgb,var(--b)_45%,transparent)]"><GraduationCap className="h-6 w-6 text-[var(--b)]" strokeWidth={1.7} /></span>
                  <span><span className="block text-[1.5rem] font-semibold leading-none">{trainedLabel}</span><span className="mt-1 block text-[0.9063rem] text-white/75">trained students</span></span>
                </div>
              )}
              {trainedLabel && <span className="hidden h-12 w-px bg-white/15 sm:block" />}
              <div className="flex items-center gap-3.5">
                <span className="grid h-14 w-14 place-items-center rounded-full bg-[color-mix(in_srgb,var(--b)_14%,transparent)] ring-1 ring-[color-mix(in_srgb,var(--b)_45%,transparent)]"><Lock className="h-6 w-6 text-[var(--b)]" strokeWidth={1.7} /></span>
                <span><span className="block text-[1.5rem] font-semibold leading-none">Private</span><span className="mt-1 block text-[0.9063rem] text-white/75">contact details</span></span>
              </div>
            </div>
            <ul className="mt-5 grid max-w-[56rem] gap-3 sm:grid-cols-2">
              {features.map(({ i: I, t, d }) => (
                <li key={t}><a href="#barista" className={`${glass} flex h-full items-center gap-4 px-4 py-3.5 transition hover:border-white/25 sm:px-5`}>
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--b)_12%,transparent)]"><I className="h-6 w-6 text-[var(--b)]" strokeWidth={1.7} /></span>
                  <span className="min-w-0 flex-1"><span className="block text-[1.0313rem] font-semibold">{t}</span><span className="mt-0.5 block text-[0.875rem] leading-snug text-white/70">{d}</span></span>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full ring-1 ring-white/20"><ArrowRight className="h-4 w-4 text-white/80" /></span>
                </a></li>
              ))}
            </ul>
          </div>

          <aside className="space-y-4">
            <div id="barista" className="scroll-mt-6 rounded-2xl border border-[color-mix(in_srgb,var(--b)_70%,transparent)] bg-[#141010]/80 p-6 shadow-[0_0_40px_-12px_var(--b)] backdrop-blur-md">
              {me ? (<>
                <h2 className="text-[1.75rem] font-bold" style={serif}>Welcome back, {me.name.split(/\s+/)[0]}</h2>
                <p className="mb-5 mt-1 text-[0.9688rem] text-white/75">Keep your profile up to date so employers can find you.</p>
                <Link href={`/jobs/${slug}/me`} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--b)] font-semibold text-[var(--on-b)]">My profile <ArrowRight className="h-4 w-4" /></Link>
              </>) : (<>
                <h2 className="text-[1.875rem] font-bold" style={serif}>Baristas</h2>
                <p className="mb-5 mt-1 text-[0.9688rem] text-white/75">Set up your free profile in two minutes.</p>
                <BaristaAuth slug={slug} startWith={joining ? "signup" : "signin"} tone="dark" />
              </>)}
            </div>
            <div className={`${glass} p-6`}>
              <div className="flex gap-4">
                <Store className="mt-0.5 h-9 w-9 shrink-0 text-[var(--b)]" strokeWidth={1.5} />
                <div><h2 className="text-[1.25rem] font-semibold">Looking for staff?</h2><p className="mt-1 text-[0.9063rem] text-white/70">Search trained baristas near you and post shifts — free for approved businesses.</p></div>
              </div>
              <Link href={`/jobs/${slug}/employers`} className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl font-semibold text-white ring-1 ring-white/25 transition hover:bg-white/10">Employers start here <ArrowRight className="h-4 w-4" /></Link>
            </div>
          </aside>
        </div>
      </div>

      {/* Baristas available now */}
      <section className={`${PAGE} relative pb-12`}>
        <div className="rounded-[28px] border border-white/10 bg-[#141010]/80 p-5 sm:p-7">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div className="flex items-start gap-4">
              <Users className="mt-1 h-10 w-10 shrink-0 text-[var(--b)]" strokeWidth={1.5} />
              <div><h2 className="text-[1.75rem] font-bold leading-tight" style={serif}>Baristas available now</h2><p className="mt-1 text-[0.9688rem] text-white/70">Browse trained {org.name} baristas looking for casual shifts, events and more.</p></div>
            </div>
            <Link href={`/jobs/${slug}/employers/search`} className="inline-flex items-center gap-2 text-[0.9688rem] font-semibold text-[var(--b)]">View all baristas <ArrowRight className="h-4 w-4" /></Link>
          </div>
          <BaristaBoard cards={cards} slug={slug} business={org.name} />
        </div>

        {/* Jobs and shifts */}
        <div className="mt-6 rounded-[28px] border border-white/10 bg-[#141010]/80 p-5 sm:p-7">
          <h2 className="flex items-center gap-3 text-[1.375rem] font-bold" style={serif}><Briefcase className="h-6 w-6 text-[var(--b)]" strokeWidth={1.6} />Jobs &amp; shifts right now</h2>
          {posts.length === 0 ? <p className="mt-3 text-[0.9375rem] text-white/70">No open jobs at the moment — set up your profile so employers can find you.</p> : (
            <ul className="mt-4 divide-y divide-white/10">
              {posts.slice(0, 8).map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
                  <span className="min-w-0 flex-1 font-medium">{p.title}</span>
                  <span className="text-[0.875rem] text-white/65">{JOB_KINDS.find((k) => k.id === p.kind)?.label}{p.suburb ? ` · ${p.suburb}` : ""}</span>
                </li>
              ))}
            </ul>
          )}
          {posts.length > 0 && <p className="mt-3 text-[0.875rem] text-white/65">{me ? <Link href={`/jobs/${slug}/work`} className="font-semibold text-[var(--b)]">See all and apply →</Link> : "Sign in to see details and apply."}</p>}
        </div>
      </section>

      <footer className="pb-10 text-center text-[0.75rem] text-white/45">
        <p>{org.jobs.name} · {[org.contact_phone, org.contact_email].filter(Boolean).join(" · ")}</p>
        <p className="mt-1">Phone numbers and emails stay private unless the barista chooses to share them.</p>
        <p className="mt-1">Powered by EventureOS</p>
      </footer>
    </div>
  );
}
