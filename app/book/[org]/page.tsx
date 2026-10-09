import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CalendarDays, Clock, Gift, MapPin, Users } from "lucide-react";
import { bookUrl, catalogue, certificatesOffered, publicOrg } from "@/lib/bookings/server";
import { BookLanding } from "@/components/book/landing";
import { createServiceClient } from "@/lib/integrations/runtime";
import { readJobSettings } from "@/lib/jobs/core";
import { trainedCount } from "@/lib/jobs/server";
import { readShop } from "@/lib/shop/core";
import { activeBanners } from "@/lib/shop/server";
import { sessionWhen } from "@/lib/bookings/core";
import { money } from "@/lib/format";
import { BookShell } from "@/components/book/shell";
import { AgentBanner } from "@/components/book/agent-banner";
import { currentAgent } from "@/lib/bookings/agents";

export const dynamic = "force-dynamic";

type P = { params: Promise<{ org: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const org = await publicOrg((await params).org).catch(() => null);
  if (!org) return { title: "Book" };
  const L = org.settings.landing;
  const title = L.title ?? `Book a class — ${org.name}`;
  const description = L.description ?? org.settings.intro ?? `See dates and book online with ${org.name}.`;
  const image = L.heroImage ?? org.logo_url;
  return { title: { absolute: title }, description, alternates: { canonical: bookUrl(org) },
    openGraph: { title, description, siteName: org.name, type: "website", url: bookUrl(org), ...(image ? { images: [{ url: image }] } : {}) } };
}

const dur = (m: number) => (m % 60 === 0 ? `${m / 60} hour${m === 60 ? "" : "s"}` : m > 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`);

export default async function BookHome({ params, searchParams }: P) {
  const { org: slug } = await params;
  const sp = await searchParams;
  const embed = sp.embed === "1";
  const org = await publicOrg(slug);
  if (!org) notFound();
  const q = new URLSearchParams(Object.entries(sp).filter(([k, v]) => typeof v === "string" && (k === "embed" || k.startsWith("utm_") || k === "fbclid" || k === "ref")) as [string, string][]).toString();
  const qs = q ? `?${q}` : "";
  let data: Awaited<ReturnType<typeof catalogue>> = { courses: [], sessions: [] };
  let notReady = false;
  try { data = await catalogue(org); } catch { notReady = true; }
  const giftable = data.courses.filter((c) => c.gift_enabled);

  const agent = embed ? null : await currentAgent(org).catch(() => null);
  // The full landing page (courses, booking form, search content). The website widget keeps the compact list.
  if (!embed && !notReady && org.settings.enabled && data.courses.length) {
    const course = typeof sp.course === "string" ? sp.course : null;
    const source = sp.source === "wordpress" ? "wordpress" : "website";
    const utm = Object.fromEntries(Object.entries(sp).filter(([k, v]) => typeof v === "string" && (k.startsWith("utm_") || k === "fbclid" || k === "gclid" || k === "ref")) as [string, string][]);
    const db = createServiceClient();
    const jobSettings = readJobSettings(org.rawSettings, org.name);
    const trained = await trainedCount(db, org.id).catch(() => 0);
    const jobs = jobSettings.enabled ? { name: jobSettings.name, url: `/jobs/${org.slug}`, trained } : null;
    const shop = readShop(org.rawSettings);
    const promos = shop.enabled ? await activeBanners(db, { ...org, shop }, ["course"]).catch(() => []) : [];
    return <BookLanding org={org} data={data} agent={agent} initialCourse={course} utm={utm} source={source} certificate={await certificatesOffered(org.id)} jobs={jobs} promos={promos} promo={typeof sp.code === "string" ? sp.code.slice(0, 40) : null} trained={trained} />;
  }
  return (
    <BookShell org={org} embed={embed}>
      {agent && <AgentBanner orgSlug={org.slug} agent={agent} />}
      {!embed && (
        <div className="mb-6">
          <h1 className="text-[1.625rem] font-bold tracking-tight text-ink sm:text-[2rem]">Book a class</h1>
          {org.settings.intro && <p className="mt-2 max-w-2xl whitespace-pre-line text-[0.9688rem] text-ink-muted">{org.settings.intro}</p>}
        </div>
      )}
      {notReady || !org.settings.enabled ? (
        <p className="rounded-2xl border border-line bg-surface p-6 text-center text-[0.9375rem] text-ink-muted">Online booking is coming soon. Please contact {org.name}{org.contact_phone ? ` on ${org.contact_phone}` : ""}.</p>
      ) : data.courses.length === 0 ? (
        <p className="rounded-2xl border border-line bg-surface p-6 text-center text-[0.9375rem] text-ink-muted">No classes are open for booking right now — check back soon.</p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {data.courses.map((c) => {
            const next = data.sessions.filter((s) => s.course_id === c.id);
            const open = next.filter((s) => !s.full);
            const first = open[0] ?? next[0];
            return (
              <Link key={c.id} href={`/book/${org.slug}/${c.slug}${qs}`} className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-card transition hover:-translate-y-0.5 hover:shadow-pop">
                {c.image_url ? <img src={c.image_url} alt="" className="aspect-[16/9] w-full object-cover" /> : <div className="aspect-[16/9] w-full bg-[var(--b)] opacity-90" style={{ background: `linear-gradient(135deg, var(--b), color-mix(in srgb, var(--b) 55%, #000))` }} />}
                <div className="flex flex-1 flex-col p-5">
                  <h2 className="text-[1.125rem] font-semibold text-ink">{c.name}</h2>
                  {c.summary && <p className="mt-1 line-clamp-3 text-[0.875rem] text-ink-muted">{c.summary}</p>}
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[0.8125rem] text-ink-muted">
                    <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />{dur(c.duration_minutes)}</span>
                    <span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />Up to {c.capacity}</span>
                    {c.location && <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{c.location.split(",")[0]}</span>}
                  </div>
                  <div className="mt-auto flex items-end justify-between gap-3 pt-4">
                    <div>
                      <p className="text-[1.25rem] font-bold text-ink">{money(c.price, org.currency, { cents: Number(c.price) % 1 !== 0 })}<span className="text-[0.8125rem] font-normal text-ink-muted"> per person</span></p>
                      <p className="mt-0.5 inline-flex items-center gap-1.5 text-[0.78rem] text-ink-muted"><CalendarDays className="h-3.5 w-3.5" />
                        {first ? `Next: ${sessionWhen(first.starts_at, first.ends_at, org.timezone).short}${open.length > 1 ? ` · ${open.length} dates` : ""}` : "New dates soon"}</p>
                    </div>
                    <span className="shrink-0 rounded-xl bg-[var(--b)] px-4 py-2.5 text-[0.875rem] font-semibold text-[var(--on-b)] group-hover:opacity-90">Book</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
      {giftable.length > 0 && org.stripeReady && (
        <Link href={`/book/${org.slug}/gift${qs}`} className="mt-4 flex items-center gap-4 rounded-2xl border border-line bg-surface p-5 shadow-card transition hover:shadow-pop">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[var(--b)] text-[var(--on-b)]"><Gift className="h-6 w-6" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[1rem] font-semibold text-ink">Give it as a gift</span>
            <span className="block text-[0.8438rem] text-ink-muted">Gift certificates for {giftable.map((c) => c.name).join(" or ")} — emailed instantly, or on the day you choose.</span>
          </span>
          <span className="hidden shrink-0 text-[0.875rem] font-semibold text-[var(--b)] sm:block">Buy a gift →</span>
        </Link>
      )}
    </BookShell>
  );
}
