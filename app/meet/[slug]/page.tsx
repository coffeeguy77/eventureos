import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createServiceClient } from "@/lib/integrations/runtime";
import { freeSlots, readApptSettings } from "@/lib/appointments/core";
import { busyBetween, loadOrg } from "@/lib/appointments/server";
import { BookingFlow } from "@/components/meet/booking-flow";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const org = await loadOrg(createServiceClient(), { slug: (await params).slug });
  if (!org) return { title: "Book a meeting" };
  const s = readApptSettings(org.settings);
  return { title: `${s.title} — ${org.name}`, description: s.intro || `Book a time with ${org.name}.` };
}

/** Public: book a meeting with the business (their hours, 24 hours' notice, what's already on). */
export default async function MeetPage({ params }: { params: Promise<{ slug: string }> }) {
  const db = createServiceClient();
  const org = await loadOrg(db, { slug: (await params).slug });
  if (!org) notFound();
  const s = readApptSettings(org.settings);
  if (!s.enabled) return <div className="flex min-h-[100dvh] items-center justify-center bg-canvas p-6 text-center"><div><p className="text-[1.25rem] font-semibold text-ink">{org.name}</p><p className="mt-2 text-ink-muted">Online booking isn&apos;t open right now — please get in touch{org.contact_phone ? ` on ${org.contact_phone}` : ""}{org.contact_email ? ` or ${org.contact_email}` : ""}.</p></div></div>;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: org.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const busy = await busyBetween(db, org.id, new Date().toISOString(), new Date(Date.now() + (s.horizon_days + 2) * 86_400_000).toISOString());
  const days = freeSlots(s, { today, tz: org.timezone, now: Date.now(), duration: s.durations[0], busy });
  const accent = /^#[0-9a-f]{6}$/i.test(org.brand_colour ?? "") ? org.brand_colour! : "#6028EC";
  return <BookingFlow slug={org.slug} business={org.name} logo={org.logo_url && /^https:\/\//.test(org.logo_url) ? org.logo_url : null} accent={accent} title={s.title} intro={s.intro} kinds={s.kinds} durations={s.durations} location={s.location} days={days} tz={org.timezone} autoConfirm={s.auto_confirm} />;
}
