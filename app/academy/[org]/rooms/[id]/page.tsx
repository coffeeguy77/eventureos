import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin, Users, Wrench } from "lucide-react";
import { createServiceClient } from "@/lib/integrations/runtime";
import { academy } from "@/lib/learn/page";
import { venueById } from "@/lib/learn/server";
import { money } from "@/lib/format";
import { AcademyShell, card } from "@/components/academy/shell";
import { EnquiryForm } from "@/components/academy/forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Training room" };

export default async function Room({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org: slug, id } = await params;
  const { org, me, state } = await academy(slug);
  if (!org.learn.marketplace.enabled) notFound();
  const v = await venueById(createServiceClient(), org.id, id);
  if (!v) notFound();
  return (
    <AcademyShell org={org} tab="rooms" signedIn={!!me} streak={state?.learner.streak_days}>
      <Link href={`/academy/${org.slug}/rooms`} className="mb-3 inline-flex text-[0.8125rem] font-medium text-ink-muted hover:text-ink">← All training rooms</Link>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
        <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
          {v.image_url && /^https:\/\//.test(v.image_url) && <img src={v.image_url} alt="" className="aspect-[21/9] w-full object-cover" />}
          <div className="space-y-3 p-5 sm:p-6">
            <h1 className="text-[1.75rem] font-bold tracking-tight text-ink">{v.name}</h1>
            {v.business_name && <p className="text-[0.9375rem] text-ink-muted">{v.business_name}</p>}
            <p className="flex flex-wrap gap-x-5 gap-y-1 text-[0.9375rem] text-ink">
              <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4 text-ink-faint" />{[v.suburb, v.state, v.postcode].filter(Boolean).join(" ")}</span>
              {v.capacity && <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4 text-ink-faint" />Up to {v.capacity} people</span>}
              {v.hourly_rate ? <span>{money(v.hourly_rate, org.currency)} per hour</span> : null}
              {v.day_rate ? <span>{money(v.day_rate, org.currency)} per day</span> : null}
            </p>
            {v.description && <p className="whitespace-pre-line text-[0.9375rem] leading-relaxed text-ink-muted">{v.description}</p>}
            {v.equipment && <div><p className="flex items-center gap-1.5 text-[0.9375rem] font-semibold text-ink"><Wrench className="h-4 w-4" />Equipment</p><p className="mt-1 whitespace-pre-line text-[0.9063rem] text-ink-muted">{v.equipment}</p></div>}
          </div>
        </section>
        <section className={card}>
          <h2 className="text-[1.125rem] font-semibold text-ink">Ask about hiring this room</h2>
          <p className="mb-4 mt-1 text-[0.875rem] text-ink-muted">{org.name} looks after bookings — we&apos;ll confirm the date with the venue and send you a payment link.</p>
          <EnquiryForm slug={org.slug} venueId={v.id} />
        </section>
      </div>
    </AcademyShell>
  );
}
