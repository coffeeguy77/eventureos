import "@fontsource/playfair-display/700.css";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CalendarDays, Gift, Mail, Users } from "lucide-react";
import { catalogue, publicOrg } from "@/lib/bookings/server";
import { landingCopy } from "@/lib/bookings/core";
import { money } from "@/lib/format";
import { BookShell, PAGE } from "@/components/book/shell";
import { GiftForm } from "@/components/book/gift-form";

export const dynamic = "force-dynamic";

type P = { params: Promise<{ org: string }>; searchParams: Promise<Record<string, string | undefined>> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const org = await publicOrg((await params).org).catch(() => null);
  const title = org ? `Gift certificates — ${org.name}` : "Gift certificates";
  return { title: { absolute: title }, description: org ? `Give a class with ${org.name}. Emailed instantly or on the day you choose.` : undefined, openGraph: { title } };
}

/** "Give a class *as a gift*" → the starred words in the brand colour */
const accent = (t: string) => t.split(/(\*[^*]+\*)/).map((part, i) => (/^\*[^*]+\*$/.test(part) ? <span key={i} className="text-[var(--b)]">{part.slice(1, -1)}</span> : part));

export default async function GiftPage({ params, searchParams }: P) {
  const { org: slug } = await params;
  const embed = (await searchParams).embed === "1";
  const org = await publicOrg(slug);
  if (!org) notFound();
  const { courses } = await catalogue(org, { days: 1 }).catch(() => ({ courses: [] }));
  const dur = (m: number) => (m % 60 === 0 ? `${m / 60} hour${m === 60 ? "" : "s"}` : `${m} min`);
  const options = [
    ...courses.filter((c) => c.gift_enabled && Number(c.price) > 0).map((c) => ({ key: c.id, courseId: c.id, amount: Number(c.price), label: c.name, hint: `One person · ${dur(c.duration_minutes)}` })),
    ...org.settings.gift_amounts.map((a) => ({ key: `amt-${a}`, courseId: null, amount: a, label: `${money(a, org.currency)} gift certificate`, hint: "Use towards any class" })),
  ];
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: org.timezone }).format(new Date());
  const months = org.settings.gift_expiry_months;
  const years = months % 12 === 0 ? months / 12 : null;
  const valid = years ? `${years} year${years === 1 ? "" : "s"}` : `${months} months`;
  const L = org.settings.landing;
  const eyebrow = landingCopy(L, "giftPageEyebrow");
  const title = landingCopy(L, "giftPageTitle");
  const hero = L.giftHero;
  const available = org.stripeReady && options.length > 0;
  const site = org.website?.replace(/^https?:\/\//, "").replace(/\/$/, "") || null;
  const card = L.giftCard ? { front: L.giftCard, back: L.giftCard, redeem: `Book at ${site ?? `eventureos.com.au/book/${org.slug}`} and enter the code at checkout.` } : null;
  const form = available
    ? <GiftForm orgSlug={org.slug} currency={org.currency} options={options} minDate={today} years={years ?? undefined} business={org.name} card={card} />
    : <p className="rounded-[28px] bg-[#FFFDFB] p-8 text-center text-ink-muted shadow-card">Gift certificates aren&apos;t available online right now. Please contact {org.name}{org.contact_phone ? ` on ${org.contact_phone}` : ""}.</p>;

  if (embed) return <BookShell org={org} embed>{form}</BookShell>;

  const features = [
    { icon: Gift, text: "Beautiful gift certificate", sub: "Your message on the back" },
    { icon: CalendarDays, text: `Valid for ${valid}`, sub: "Plenty of time to book" },
    { icon: Users, text: "They choose the date", sub: "Any class, any session" },
    { icon: Mail, text: "Instant email", sub: "Or print at home" },
  ];
  const steps = [
    { n: "1", t: "Choose a class or amount", d: "Pick a course, or a dollar value they can put towards any class." },
    { n: "2", t: "Add your message", d: "It's printed on the back of the certificate — see it as you type." },
    { n: "3", t: "Send it your way", d: "Emailed to you to print or forward, or straight to them on the day you choose." },
  ];

  return (
    <BookShell org={org} embed={false} bare>
      <div className="relative bg-[#F5EEE7]">
        {/* Photo: a banner on phones and tablets; on big screens the whole hero, with the wording over the wall and the form over the café */}
        <section className="relative isolate xl:h-[940px]">
          {hero && (
            <div className="relative h-[300px] overflow-hidden sm:h-[440px] xl:absolute xl:inset-0 xl:h-auto">
              <img src={hero} alt="" className="h-full w-full object-cover object-[30%_75%] xl:object-[left_bottom]" />
              <div className="absolute inset-x-0 top-0 hidden h-[340px] bg-[linear-gradient(180deg,rgba(250,246,241,.78),rgba(250,246,241,0))] xl:block" />
              <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#F5EEE7] to-transparent xl:hidden" />
            </div>
          )}
          <div className={`${PAGE} relative -mt-8 pb-8 xl:mt-0 xl:pb-0 xl:pt-10`}>
            <div className="xl:max-w-[660px]">
            {eyebrow && <p className="text-[0.875rem] font-semibold uppercase tracking-[0.32em] text-[#2A2522]">{eyebrow}</p>}
            <h1 className="mt-3 text-balance text-[2.9rem] font-bold leading-[0.98] tracking-[-0.015em] text-[#141110] sm:text-[4rem] xl:whitespace-nowrap xl:text-[4.25rem]" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>{accent(title)}</h1>
            <p className="mt-4 max-w-[34rem] text-[1.125rem] leading-relaxed text-[#2F2925] sm:text-[1.25rem] xl:max-w-[44rem] xl:text-[1.1875rem]">
              Perfect for birthdays, Christmas and Father&apos;s Day. Valid for {valid} — they choose their own date.
            </p>
            <ul className="mt-6 grid max-w-[40rem] grid-cols-2 gap-2.5 sm:gap-3 xl:max-w-[620px] xl:gap-2.5">
              {features.map((f) => (
                <li key={f.text} className="flex items-center gap-3 rounded-2xl bg-white/80 p-3 shadow-[0_8px_24px_-16px_rgba(40,25,15,.5)] ring-1 ring-white/70 backdrop-blur-md sm:p-3.5 xl:gap-2.5 xl:rounded-full xl:py-2 xl:pl-2 xl:pr-5">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--b)] text-[var(--on-b)] sm:h-12 sm:w-12 xl:h-9 xl:w-9"><f.icon className="h-5 w-5 sm:h-6 sm:w-6 xl:h-[18px] xl:w-[18px]" strokeWidth={1.8} /></span>
                  <span className="min-w-0"><span className="block text-[0.9063rem] font-semibold leading-tight text-[#1d1916] sm:text-[0.9688rem] xl:whitespace-nowrap xl:text-[0.875rem]">{f.text}</span><span className="mt-0.5 block text-[0.8125rem] leading-tight text-[#5f5852] xl:hidden">{f.sub}</span></span>
                </li>
              ))}
            </ul>
            </div>
          </div>
        </section>
        <div className={`${PAGE} pb-10 xl:absolute xl:right-0 xl:top-10 xl:z-10 xl:w-[680px] xl:pb-0 xl:pl-0`}>{form}</div>
        <section className="bg-[#FBF8F4] pb-16 pt-14 xl:min-h-[1040px]">
          <div className={`${PAGE} xl:pr-[720px]`}>
            <h2 className="text-[2rem] font-bold leading-tight text-[#141110] sm:text-[2.5rem]" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>How it works</h2>
            <ol className="mt-6 grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
              {steps.map((x) => (
                <li key={x.n} className="flex gap-4 rounded-2xl bg-white p-5 ring-1 ring-[#EDE4DB]">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--b)_14%,white)] text-[1.0625rem] font-bold text-[var(--b)]">{x.n}</span>
                  <span><span className="block text-[1.0625rem] font-semibold text-[#1d1916]">{x.t}</span><span className="mt-1 block text-[0.9375rem] leading-relaxed text-[#5f5852]">{x.d}</span></span>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </div>
    </BookShell>
  );
}
