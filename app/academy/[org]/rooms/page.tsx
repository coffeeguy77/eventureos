import Link from "next/link";
import { MapPin, Plus, Users } from "lucide-react";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/integrations/runtime";
import { academy } from "@/lib/learn/page";
import { listVenues } from "@/lib/learn/server";
import { AU_STATES } from "@/lib/learn/core";
import { money } from "@/lib/format";
import { AcademyShell, btn, card } from "@/components/academy/shell";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";
export const metadata = { title: "Training rooms" };

export default async function Rooms({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ state?: string }> }) {
  const { org, me, state: st } = await academy((await params).org);
  if (!org.learn.marketplace.enabled) notFound();
  const sp = await searchParams;
  const filter = AU_STATES.includes(sp.state as (typeof AU_STATES)[number]) ? sp.state! : null;
  const venues = await listVenues(createServiceClient(), org.id, filter);
  const base = `/academy/${org.slug}/rooms`;
  return (
    <AcademyShell org={org} tab="rooms" signedIn={!!me} streak={st?.learner.streak_days}>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[1.75rem] font-bold tracking-tight text-ink">Training rooms</h1>
          <p className="mt-1 text-[0.9375rem] text-ink-muted">Barista training rooms and roasteries around Australia you can hire for practice, classes or team training.</p>
        </div>
        <Link href={`${base}/list`} className={btn}><Plus className="h-4 w-4" />List your room</Link>
      </div>
      <div className="no-scrollbar mb-5 flex gap-1.5 overflow-x-auto">
        <Link href={base} className={cn("h-9 shrink-0 rounded-full px-3.5 text-[0.8438rem] font-semibold leading-9", !filter ? "bg-[var(--b)] text-[var(--on-b)]" : "bg-zinc-100 text-ink-muted")}>All</Link>
        {AU_STATES.map((s) => <Link key={s} href={`${base}?state=${s}`} className={cn("h-9 shrink-0 rounded-full px-3.5 text-[0.8438rem] font-semibold leading-9", filter === s ? "bg-[var(--b)] text-[var(--on-b)]" : "bg-zinc-100 text-ink-muted")}>{s}</Link>)}
      </div>
      {venues.length === 0 ? <div className={`${card} text-center text-ink-muted`}>No rooms listed{filter ? ` in ${filter}` : ""} yet. <Link href={`${base}/list`} className="font-semibold text-[var(--b)]">List yours →</Link></div> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {venues.map((v) => (
            <Link key={v.id} href={`${base}/${v.id}`} className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card transition hover:-translate-y-0.5">
              {v.image_url && /^https:\/\//.test(v.image_url) && <img src={v.image_url} alt="" className="aspect-[16/9] w-full object-cover" />}
              <div className="p-5">
                <p className="text-[1.0625rem] font-semibold text-ink">{v.name}</p>
                <p className="mt-1 flex items-center gap-1.5 text-[0.875rem] text-ink-muted"><MapPin className="h-4 w-4" />{[v.suburb, v.state].filter(Boolean).join(", ")}</p>
                <p className="mt-2 flex flex-wrap gap-x-4 text-[0.875rem] text-ink">
                  {v.capacity && <span className="inline-flex items-center gap-1"><Users className="h-4 w-4 text-ink-faint" />Up to {v.capacity}</span>}
                  {v.hourly_rate ? <span>{money(v.hourly_rate, org.currency)}/hr</span> : null}
                  {v.day_rate ? <span>{money(v.day_rate, org.currency)}/day</span> : null}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </AcademyShell>
  );
}
