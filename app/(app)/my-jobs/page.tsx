import Link from "next/link";
import { CalendarDays, Clock, MapPin, Phone, Users } from "lucide-react";
import { requireOrg } from "@/lib/context";
import { Card, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { addDaysISO, fmtDate, fmtTime, todayISO } from "@/lib/format";
import { cn } from "@/lib/cn";

export const metadata = { title: "My jobs" };

interface Job {
  id: string; number: number; name: string; event_date: string | null; start_time: string | null; finish_time: string | null;
  venue: string | null; event_type: string | null; guest_count: number | null; status: string; client: string | null; my_role: string | null;
  onsite_contact: { name: string; phone: string | null } | null;
  team: { name: string; role: string | null }[];
  details_allowed: boolean;
  inclusions: { section: string | null; name: string; description: string | null; quantity: number; unit: string | null; optional: boolean }[] | null;
}

/** The jobs I'm rostered on. Never shows prices — the database only returns what staff may see. */
export default async function MyJobsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const sp = await searchParams;
  const { supabase, org } = await requireOrg();
  const today = todayISO(org.timezone);
  const past = sp.show === "past";
  const { data, error } = await supabase.rpc("my_jobs", past
    ? { p_org: org.id, p_from: addDaysISO(today, -365), p_to: addDaysISO(today, -1) }
    : { p_org: org.id, p_from: today, p_to: null });
  if (error) throw new Error(`Could not load your jobs: ${error.message}`);
  let jobs = (data ?? []) as Job[];
  if (past) jobs = [...jobs].reverse();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="My jobs" subtitle={past ? "Jobs you've worked in the last year." : "Jobs you're rostered on, soonest first."} />
      <div className="mb-4 flex gap-1.5">
        {[["Upcoming", "/my-jobs"], ["Past", "/my-jobs?show=past"]].map(([label, href]) => {
          const active = (label === "Past") === past;
          return <Link key={label} href={href} className={cn("rounded-lg px-3 py-1.5 text-[13px] font-medium ring-1 ring-inset", active ? "bg-brand-50 text-brand-800 ring-brand-300" : "text-ink-muted ring-line-strong hover:bg-zinc-50")}>{label}</Link>;
        })}
      </div>
      {jobs.length === 0 ? (
        <Card><EmptyState title={past ? "No past jobs" : "Nothing rostered yet"}>{past ? "" : "When you're added to an event it shows up here."}</EmptyState></Card>
      ) : (
        <div className="space-y-3">
          {jobs.map((j) => <JobCard key={j.id} j={j} today={today} />)}
        </div>
      )}
    </div>
  );
}

function JobCard({ j, today }: { j: Job; today: string }) {
  const sections = new Map<string, NonNullable<Job["inclusions"]>>();
  for (const i of j.inclusions ?? []) {
    const k = i.section ?? "";
    sections.set(k, [...(sections.get(k) ?? []), i]);
  }
  const isToday = j.event_date === today;
  return (
    <Card className={cn(isToday && "ring-2 ring-brand-300")}>
      <div className="px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-brand-700">{isToday ? "Today" : fmtDate(j.event_date, "weekday")}</p>
            <h2 className="text-[16px] font-semibold text-ink">{j.name}</h2>
            {j.client && <p className="text-[13px] text-ink-muted">{j.client}</p>}
          </div>
          {j.my_role && <Badge tone="brand">{j.my_role}</Badge>}
        </div>
        <ul className="mt-3 space-y-1.5 text-[13px] text-ink">
          <li className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-ink-faint" />{fmtDate(j.event_date, "long")}</li>
          {(j.start_time || j.finish_time) && <li className="flex items-center gap-2"><Clock className="h-4 w-4 text-ink-faint" />{fmtTime(j.start_time)}{j.finish_time ? ` – ${fmtTime(j.finish_time)}` : ""}</li>}
          {j.venue && (
            <li className="flex items-center gap-2"><MapPin className="h-4 w-4 text-ink-faint" />
              <a className="underline decoration-line-strong underline-offset-2 hover:text-brand-700" target="_blank" rel="noreferrer"
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(j.venue)}`}>{j.venue}</a>
            </li>
          )}
          {j.onsite_contact?.name && (
            <li className="flex items-center gap-2"><Phone className="h-4 w-4 text-ink-faint" />
              On the day: {j.onsite_contact.name}{j.onsite_contact.phone ? <> · <a href={`tel:${j.onsite_contact.phone.replace(/\s/g, "")}`} className="font-medium text-brand-700">{j.onsite_contact.phone}</a></> : null}
            </li>
          )}
          {j.team.length > 0 && <li className="flex items-center gap-2"><Users className="h-4 w-4 text-ink-faint" />{j.team.map((t) => t.role ? `${t.name} (${t.role})` : t.name).join(", ")}</li>}
          {j.guest_count ? <li className="pl-6 text-ink-muted">About {j.guest_count} guests</li> : null}
        </ul>
        {j.details_allowed && (j.inclusions?.length ?? 0) > 0 && (
          <div className="mt-4 rounded-lg bg-zinc-50 px-3 py-3 ring-1 ring-inset ring-line">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">What's included</p>
            {[...sections.entries()].map(([title, items]) => (
              <div key={title} className="mb-2 last:mb-0">
                {title && <p className="text-[12.5px] font-medium text-ink">{title}</p>}
                <ul className="text-[13px] text-ink">
                  {items.map((i, k) => (
                    <li key={k} className="flex gap-2">
                      <span className="tabular w-16 shrink-0 text-right text-ink-muted">{Number(i.quantity)}{i.unit ? ` ${i.unit === "person" ? "pp" : i.unit}` : ""}</span>
                      <span className="min-w-0">{i.name}{i.optional && <span className="text-ink-faint"> (optional)</span>}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
