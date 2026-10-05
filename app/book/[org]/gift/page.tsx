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
  const form = available
    ? <GiftForm orgSlug={org.slug} currency={org.currency} options={options} minDate={today} years={years ?? undefined} business={org.name} />
    : <p className="rounded-[28px] bg-[#FFFDFB] p-8 text-center text-ink-muted shadow-card">Gift certificates aren&apos;t available online right now. Please contact {org.name}{org.contact_phone ? ` on ${org.contact_phone}` : ""}.</p>;

  if (embed) return <BookShell org={org} embed>{form}</BookShell>;

  const features = [
    { icon: Gift, text: "Beautiful gift certificate" },
    { icon: CalendarDays, text: `Valid for ${valid}` },
    { icon: Users, text: "Choose their own date" },
    { icon: Mail, text: "Instant email or print at home" },
  ];

  return (
    <BookShell org={org} embed={false} bare>
      <section className="relative isolate overflow-hidden bg-[#F6EFE9]">
        {hero
          ? <img src={hero} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover object-left-bottom" />
          : <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_left,color-mix(in_srgb,var(--b)_14%,#FBF7F3),#F3EAE2)]" />}
        <div className={`${PAGE} grid gap-10 py-10 lg:min-h-[880px] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-12 lg:py-7`}>
          <div className="lg:pt-10">
            {eyebrow && <p className="text-[0.9375rem] font-medium uppercase tracking-[0.32em] text-[#2A2522]">{eyebrow}</p>}
            <h1 className="mt-4 text-balance text-[3.25rem] font-bold leading-[0.98] tracking-[-0.015em] text-[#141110] sm:text-[4.25rem] xl:text-[5.25rem]" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>{accent(title)}</h1>
            <p className="mt-6 max-w-[34rem] text-[1.125rem] leading-relaxed text-[#3D3733] sm:text-[1.3125rem]">
              Perfect for birthdays, Christmas and Father&apos;s Day. Valid for {valid} — they choose their own date.
            </p>
            <ul className="mt-8 grid max-w-[36rem] grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4">
              {features.map((f) => (
                <li key={f.text} className="flex flex-col items-center text-center">
                  <span className="grid h-16 w-16 place-items-center rounded-full bg-[color-mix(in_srgb,var(--b)_14%,white)] text-[var(--b)]"><f.icon className="h-8 w-8" strokeWidth={1.5} /></span>
                  <span className="mt-3 text-[0.9375rem] font-medium leading-snug text-[#2A2522]">{f.text}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="lg:pt-5">{form}</div>
        </div>
      </section>
    </BookShell>
  );
}
