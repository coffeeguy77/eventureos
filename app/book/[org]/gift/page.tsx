import "@fontsource/playfair-display/700.css";
import { PageBg } from "@/components/site/page-bg";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CalendarDays, Gift, Mail, Users } from "lucide-react";
import { catalogue, publicOrg } from "@/lib/bookings/server";
import { landingCopy } from "@/lib/bookings/core";
import { money } from "@/lib/format";
import { BookShell, PAGE, brandStyle } from "@/components/book/shell";
import { MasterNav } from "@/components/site/master-nav";
import { GiftForm } from "@/components/book/gift-form";
import { giftRedeemText } from "@/lib/bookings/gift-pdf";

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
  const sp = await searchParams;
  const embed = sp.embed === "1";
  const promo = typeof sp.code === "string" ? sp.code.slice(0, 40) : null;
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
  const badge = landingCopy(L, "giftPageBadge") || null;
  const form = available
    ? <GiftForm orgSlug={org.slug} currency={org.currency} options={options} minDate={today} years={years ?? undefined} business={org.name} badge={badge}
      card={L.giftCard ? { art: L.giftCard, backArt: L.giftCardBack, slot: "gift-card-slot", redeem: giftRedeemText(org) } : null} promo={promo} />
    : <p className="rounded-[22px] bg-[#F8F1EE] p-8 text-center text-[#6E6560]">Gift certificates aren&apos;t available online right now. Please contact {org.name}{org.contact_phone ? ` on ${org.contact_phone}` : ""}.</p>;

  if (embed) return <BookShell org={org} embed>{form}</BookShell>;

  const features = [
    { icon: Gift, a: "Beautiful", b: "gift certificate" },
    { icon: CalendarDays, a: "Valid for", b: valid },
    { icon: Users, a: "Choose their", b: "own date" },
    { icon: Mail, a: "Instant email", b: "or print at home" },
  ];
  const steps = [
    { n: "1", t: "Choose a class", d: "Pick the course you'd like to give." },
    { n: "2", t: "Add your message", d: "We'll put it on the certificate for you." },
    { n: "3", t: "Send it your way", d: "Emailed to you to print or forward, or straight to them on the day you choose." },
  ];

  return (
    <div data-book-root style={brandStyle(org)} className="min-h-screen bg-[#1a120d]">
      <PageBg color="#FBF8F4" />
      <MasterNav org={org} active="gifts" />
      <section className="relative isolate overflow-hidden xl:h-[max(1000px,66.667vw)] xl:overflow-visible xl:overflow-x-clip">
        {hero
          ? <img src={hero} alt="" className="absolute inset-0 -z-10 hidden h-full w-full object-cover object-[left_bottom] xl:block" />
          : <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_left,color-mix(in_srgb,var(--b)_30%,#2a1c14),#1a120d)]" />}
        <div className="absolute inset-0 -z-10 hidden bg-[linear-gradient(90deg,rgba(26,18,13,.12),rgba(26,18,13,0)_45%)] xl:block" />
        <div className="mx-auto max-w-[1536px] px-4 pb-6 pt-10 sm:px-8 xl:grid xl:grid-cols-[minmax(0,1fr)_754px] xl:gap-10 xl:pb-6 xl:pl-[97px] xl:pr-5 xl:pt-[93px]">
          <div className="relative isolate -mx-4 -mt-10 px-4 pt-10 text-white sm:-mx-8 sm:px-8 xl:static xl:isolation-auto xl:m-0 xl:p-0 xl:pt-[8px]">
            {hero && <img src={hero} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover object-[6%_bottom] xl:hidden" />}
            {hero && <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(26,18,13,.35),rgba(26,18,13,.1)_55%,rgba(26,18,13,0)_90%,#1a120d)] xl:hidden" />}
            {eyebrow && <p className="text-[0.8125rem] font-medium uppercase tracking-[0.42em] sm:text-[0.9375rem]">{eyebrow}</p>}
            <h1 className="mt-3 text-[3.75rem] font-bold leading-[0.92] tracking-[-0.01em] sm:text-[5rem] xl:mt-[12px] xl:text-[4.1rem] 2xl:text-[5.8rem]" style={{ fontFamily: "'AU Dollar', 'Playfair Display', Georgia, serif" }}>{title.split(/(\*[^*]+\*)/).map((part, i) => (/^\*[^*]+\*$/.test(part) ? <span key={i} className="block text-[var(--b)]">{part.slice(1, -1)}</span> : part))}</h1>
            <p className="mt-6 max-w-[33rem] text-[1.125rem] leading-[1.4] sm:text-[1.25rem] xl:mt-[26px] xl:text-[1.0625rem] 2xl:text-[1.25rem]">
              Perfect for birthdays, Christmas and Father&apos;s Day.<br className="hidden sm:block" /> Valid for {valid} — they choose their own date.
            </p>
            <ul className="mt-7 grid max-w-[552px] grid-cols-4 gap-0 xl:-ml-[23px] xl:mt-[22px]">
              {features.map((f) => (
                <li key={f.a} className="flex flex-col items-center text-center">
                  <span className="grid h-14 w-14 place-items-center rounded-full bg-[color-mix(in_srgb,var(--b)_26%,white)] text-[var(--b)] sm:h-16 sm:w-16"><f.icon className="h-7 w-7 sm:h-[30px] sm:w-[30px]" strokeWidth={1.6} /></span>
                  <span className="mt-2.5 text-[0.8125rem] font-semibold leading-[1.3] text-white sm:text-[0.9375rem] xl:text-[0.8125rem] 2xl:text-[0.9375rem]">{f.a}<br />{f.b}</span>
                </li>
              ))}
            </ul>
            {L.giftCard && available ? (
              /* The live certificate (filled in by the form as they type). On big screens it sits on the photo, in the photo's own
                 coordinates (the box is the picture's size, pinned bottom-left like the picture), so it stays on the bench at any width. */
              <div className="relative py-10 sm:py-14 xl:pointer-events-none xl:absolute xl:inset-y-0 xl:left-0 xl:w-[max(1500px,100%)] xl:p-0">
                <div id="gift-card-slot" className="pointer-events-auto mx-auto w-[86%] max-w-[520px] -rotate-2 xl:absolute xl:left-[4.6%] xl:top-[60%] xl:mx-0 xl:w-[28%] 2xl:top-[54.6%] 2xl:w-[35.2%] xl:max-w-none xl:-rotate-3" />
              </div>
            ) : (
              /* Room for the photo on small screens */
              <div className="h-[400px] sm:h-[520px] xl:hidden" />
            )}
          </div>
          <div className="mx-auto w-full max-w-[754px] xl:mx-0">{form}</div>
        </div>
      </section>
      <section className="bg-[#FBF8F4] py-14 xl:pt-24">
        <div className={PAGE}>
          <h2 className="text-[2rem] font-bold leading-tight text-[#141110] sm:text-[2.5rem]" style={{ fontFamily: "'AU Dollar', 'Playfair Display', Georgia, serif" }}>How it works</h2>
          <ol className="mt-6 grid gap-4 sm:grid-cols-3">
            {steps.map((x) => (
              <li key={x.n} className="flex gap-4 rounded-2xl bg-white p-5 ring-1 ring-[#EDE4DB]">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--b)_14%,white)] text-[1.0625rem] font-bold text-[var(--b)]">{x.n}</span>
                <span><span className="block text-[1.0625rem] font-semibold text-[#1d1916]">{x.t}</span><span className="mt-1 block text-[0.9375rem] leading-relaxed text-[#5f5852]">{x.d}</span></span>
              </li>
            ))}
          </ol>
        </div>
      </section>
      <footer className="bg-[#FBF8F4] pb-10 text-center text-[0.75rem] text-[#8a817a]">{[org.contact_phone, org.contact_email].filter(Boolean).join(" · ")}<p className="mt-1">Secure booking by EventureOS</p></footer>
    </div>
  );
}
