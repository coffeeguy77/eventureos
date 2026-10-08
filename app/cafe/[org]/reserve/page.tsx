import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CalendarDays, Check } from "lucide-react";
import { CafeClosed, CafeFrame, WRAP, btn, hand, serif } from "@/components/cafe/frame";
import { OpenBadge } from "@/components/cafe/bits";
import { ReserveForm } from "@/components/cafe/reserve-form";
import { cafePages, hoursRows, nowIn, openDates } from "@/lib/cafe/core";
import { appSnapshot, cafeOrg } from "@/lib/cafe/server";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ org: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const org = await cafeOrg((await params).org);
  return org ? { title: { absolute: `Reserve a table — ${org.name}` }, description: `Book a table at ${org.name}. Choose your day, time and party size — we'll confirm by text or a quick call.` } : {};
}

export default async function ReservePage({ params }: P) {
  const org = await cafeOrg((await params).org);
  if (!org) notFound();
  const pages = cafePages(org.cafe);
  if (!pages.reserve) {
    return <CafeFrame org={org} active="reserve">{pages.appOrder
      ? <div className={`${WRAP} py-24 text-center`}><p className={`${serif} text-[2.25rem] font-semibold`}>Book in our app</p><Link href={org.cafe.appUrl} className={`${btn} mt-8`}>Open the app</Link></div>
      : <CafeClosed name={org.name} what="Table bookings" />}</CafeFrame>;
  }
  const { cfg } = await appSnapshot(org.cafe.appUrl, false);
  const h = cfg?.hours ?? null;
  const tz = h?.timezone || cfg?.scheduling?.timezone || org.timezone || "Australia/Sydney";
  const now = nowIn(tz);
  const photo = org.cafe.heroImage ?? cfg?.storePhoto ?? null;
  const usable = !!cfg && cfg.reservations;
  return (
    <CafeFrame org={org} active="reserve" weekly={h?.weekly}>
      <div className={`${WRAP} grid gap-10 py-10 sm:py-14 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16`}>
        <div>
          <p className={`${hand} text-[1.75rem] leading-none text-[var(--pk)]`}>We&apos;ll save you a spot</p>
          <h1 className={`${serif} mt-2 text-[clamp(2.25rem,4.4vw,3.5rem)] font-semibold leading-tight`}>Reserve a table</h1>
          <p className="mt-4 max-w-lg text-[1.0625rem] leading-relaxed text-[#5E5853]">Book ahead and we&apos;ll have your table ready. We&apos;ll confirm by text or a quick call.</p>
          <ul className="mt-6 space-y-2.5 text-[0.9688rem]">
            {["Pick your day, time and party size", "Special requests welcome — high chairs, birthdays, access", "A friendly confirmation before you arrive"].map((t) => (
              <li key={t} className="flex items-start gap-2.5"><span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--pk)_14%,white)] text-[var(--pk)]"><Check className="h-3.5 w-3.5" /></span>{t}</li>
            ))}
          </ul>
          {photo && <img src={photo} alt={`Inside ${org.name}`} className="mt-8 aspect-[16/10] w-full rounded-[28px] object-cover" />}
          {h?.weekly && (
            <div className="mt-8 rounded-[24px] bg-white p-5 ring-1 ring-[#EDE3DB]">
              <div className="flex items-center justify-between gap-3"><p className="font-semibold">Opening hours</p><OpenBadge hours={h} /></div>
              <dl className="mt-3 space-y-1 text-[0.9375rem]">{hoursRows(h.weekly).map((r) => <div key={r.day} className="flex justify-between gap-4"><dt className="text-[#5E5853]">{r.day}</dt><dd className={r.closed ? "text-[#A39A93]" : ""}>{r.text}</dd></div>)}</dl>
            </div>
          )}
        </div>
        <div>
          {usable ? (
            <ReserveForm slug={org.slug} dates={openDates(h?.weekly, h?.closures ?? [], now, 30, 30, 30)} weekly={h?.weekly ?? null} closures={h?.closures ?? []} now={now} phone={org.contact_phone} />
          ) : (
            <div className="rounded-[28px] bg-white p-8 text-center ring-1 ring-[#EDE3DB]">
              <CalendarDays className="mx-auto h-9 w-9 text-[var(--pk)]" />
              <p className={`${serif} mt-4 text-[1.75rem] font-semibold`}>Online booking isn&apos;t available right now</p>
              <p className="mt-2 text-[#5E5853]">{org.contact_phone ? <>Call us on <a className="font-semibold text-[#151312]" href={`tel:${org.contact_phone.replace(/[^\d+]/g, "")}`}>{org.contact_phone}</a> and we&apos;ll book you in.</> : "Please try again shortly."}</p>
            </div>
          )}
        </div>
      </div>
    </CafeFrame>
  );
}
