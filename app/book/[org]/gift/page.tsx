import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { catalogue, publicOrg } from "@/lib/bookings/server";
import { money } from "@/lib/format";
import { BookShell } from "@/components/book/shell";
import { GiftForm } from "@/components/book/gift-form";

export const dynamic = "force-dynamic";

type P = { params: Promise<{ org: string }>; searchParams: Promise<Record<string, string | undefined>> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const org = await publicOrg((await params).org).catch(() => null);
  const title = org ? `Gift certificates — ${org.name}` : "Gift certificates";
  return { title: { absolute: title }, description: org ? `Give a class with ${org.name}. Emailed instantly or on the day you choose.` : undefined, openGraph: { title } };
}

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
  return (
    <BookShell org={org} embed={embed} back={embed ? undefined : { href: `/book/${org.slug}`, label: "All classes" }}>
      <div className={embed ? "" : "mx-auto max-w-3xl"}>
      <h1 className="text-[1.625rem] font-bold tracking-tight text-ink">Give a class as a gift</h1>
      <p className="mb-5 mt-1 text-[0.9375rem] text-ink-muted">Perfect for birthdays, Christmas and Father&apos;s Day. Valid for {Math.round(org.settings.gift_expiry_months / 12)} years — they choose their own date.</p>
      {!org.stripeReady || !options.length
        ? <p className="rounded-2xl border border-line bg-surface p-6 text-center text-ink-muted">Gift certificates aren&apos;t available online right now. Please contact {org.name}.</p>
        : <GiftForm orgSlug={org.slug} currency={org.currency} options={options} minDate={today} />}
      </div>
    </BookShell>
  );
}
