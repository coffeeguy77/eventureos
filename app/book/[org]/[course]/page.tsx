import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Clock, MapPin, Users } from "lucide-react";
import { catalogue, certificatesOffered, publicOrg } from "@/lib/bookings/server";
import { pickUtm } from "@/lib/bookings/core";
import { money } from "@/lib/format";
import { BookShell } from "@/components/book/shell";
import { BookingFlow } from "@/components/book/booking-flow";
import { AgentBanner } from "@/components/book/agent-banner";
import { currentAgent } from "@/lib/bookings/agents";
import { InfoPanel } from "@/components/book/info-panel";

export const dynamic = "force-dynamic";

type P = { params: Promise<{ org: string; course: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { org: slug, course } = await params;
  const org = await publicOrg(slug).catch(() => null);
  if (!org) return { title: "Book" };
  const c = await catalogue(org, { courseSlug: course }).then((d) => d.courses[0]).catch(() => null);
  if (!c) return { title: { absolute: `Book — ${org.name}` } };
  const title = `${c.name} — ${org.name}`;
  const description = c.summary ?? `Book ${c.name} online with ${org.name}. ${money(c.price, org.currency)} per person.`;
  return { title: { absolute: title }, description, openGraph: { title, description, siteName: org.name, ...(c.image_url ? { images: [{ url: c.image_url }] } : org.logo_url ? { images: [{ url: org.logo_url }] } : {}) } };
}

const dur = (m: number) => (m % 60 === 0 ? `${m / 60} hour${m === 60 ? "" : "s"}` : m > 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`);

export default async function CoursePage({ params, searchParams }: P) {
  const { org: slug, course: courseSlug } = await params;
  const sp = await searchParams;
  const embed = sp.embed === "1";
  const org = await publicOrg(slug);
  if (!org) notFound();
  const data = await catalogue(org, { courseSlug }).catch(() => null);
  const course = data?.courses[0];
  if (!course) notFound();
  const sessions = data!.sessions.filter((s) => s.course_id === course.id);
  const pre = typeof sp.session === "string" ? sp.session : null;
  const source = sp.source === "wordpress" ? "wordpress" : "website";
  const certificate = await certificatesOffered(org.id);
  // A case manager booking a job seeker (not inside the website widget)
  const agent = embed ? null : await currentAgent(org).catch(() => null);

  return (
    <BookShell org={org} embed={embed} wide back={embed ? undefined : { href: `/book/${org.slug}`, label: "All classes" }}>
      {agent && <AgentBanner orgSlug={org.slug} agent={agent} />}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
        <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
          {course.image_url && !embed && <img src={course.image_url} alt="" className="aspect-[21/9] w-full object-cover" />}
          <div className="p-5 sm:p-6">
            <h1 className="text-[1.5rem] font-bold tracking-tight text-ink sm:text-[1.75rem]">{course.name}</h1>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.875rem] text-ink-muted">
              <span className="font-semibold text-ink">{money(course.price, org.currency, { cents: Number(course.price) % 1 !== 0 })} per person</span>
              <span className="inline-flex items-center gap-1.5"><Clock className="h-4 w-4" />{dur(course.duration_minutes)}</span>
              <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4" />Small group, up to {course.capacity}</span>
              {course.location && <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" />{course.location}</span>}
            </div>
            {course.description && <div className="mt-4 whitespace-pre-line text-[0.9375rem] leading-relaxed text-ink">{course.description}</div>}
          </div>
        </section>
        <BookingFlow
          org={{ slug: org.slug, name: org.name, currency: org.currency, timezone: org.timezone, stripeReady: org.stripeReady, showSeatsLeft: org.settings.show_seats_left, waitlist: org.settings.waitlist && course.waitlist, terms: org.settings.terms, cancelHours: org.settings.cancel_hours }}
          course={{ id: course.id, name: course.name, price: Number(course.price), maxSeats: course.max_seats_per_booking, questions: course.questions ?? [] }}
          sessions={sessions} preselect={pre} utm={pickUtm(sp)} embed={embed} source={source} promo={typeof sp.code === "string" ? sp.code.slice(0, 40) : null}
          agent={agent ? { code: agent.agency.code, agency: agent.agency.name, price: agent.agency.price === null ? null : Number(agent.agency.price), poRequired: agent.agency.po_required, name: agent.cm.name, site: agent.cm.site } : null}
        />
        </div>
        <InfoPanel orgSlug={org.slug} orgName={org.name} phone={org.contact_phone} location={course.location} whatToBring={course.what_to_bring} certificate={certificate}
          gifts={course.gift_enabled && org.stripeReady} faqs={org.settings.faqs} terms={org.settings.terms} embed={embed} />
      </div>
    </BookShell>
  );
}
