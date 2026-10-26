import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requireOrg } from "@/lib/context";
import { Card, EmptyState } from "@/components/ui/card";
import { addDaysISO, todayISO, zonedMidnightUTC } from "@/lib/format";
import { hireable, readHireSettings, usageGrid, type HireItem } from "@/lib/hire/core";
import { loadHolds, loadItems } from "@/lib/hire/server";
import { cn } from "@/lib/cn";

export const metadata = { title: "Availability" };
export const dynamic = "force-dynamic";

const VIEWS = { week: 7, fortnight: 14, month: 31 } as const;

/** Stock free per item per day, counting turnaround time. Quotes show as pencilled in. Tap a day to book it. */
export default async function AvailabilityPage({ searchParams }: { searchParams: Promise<{ from?: string; view?: string; cat?: string; q?: string }> }) {
  const sp = await searchParams;
  const { supabase, org } = await requireOrg();
  const tz = org.timezone;
  const s = readHireSettings(org.settings);
  const today = todayISO(tz);
  const view = (Object.keys(VIEWS) as (keyof typeof VIEWS)[]).find((v) => v === sp.view) ?? "week";
  const n = VIEWS[view];
  const from = sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : today;
  const dates = Array.from({ length: n }, (_, i) => addDaysISO(from, i));
  const days = dates.map((d): [number, number] => [Date.parse(zonedMidnightUTC(d, tz)), Date.parse(zonedMidnightUTC(addDaysISO(d, 1), tz))]);
  const all = await loadItems(supabase, org.id, { activeOnly: true });
  const map = new Map<string, HireItem>(all.map((i) => [i.id, i]));
  const { holds, pencilled } = await loadHolds(supabase, org.id, days[0][0], days[n - 1][1], map);
  const cats = [...new Set(all.filter((i) => i.kind === "hire").map((i) => i.category).filter(Boolean) as string[])].sort();
  const q = (sp.q ?? "").trim().toLowerCase().slice(0, 60);
  const shown = all.filter((i) => i.kind === "hire" && (!sp.cat || i.category === sp.cat) && (!q || `${i.name} ${i.code ?? ""}`.toLowerCase().includes(q)));
  const used = usageGrid(shown, holds, days, s.bufferHours);
  const pencil = usageGrid(shown, pencilled, days, 0);
  const who = (id: string, [a, b]: [number, number]) => holds.filter((h) => h.itemId === id && h.start < b && h.end > a).map((h) => `${h.label} (${h.qty})`);
  const link = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams(); const m = { from, view, cat: sp.cat, q: sp.q, ...o };
    for (const [k, v] of Object.entries(m)) if (v) p.set(k, v);
    return `/rentals/availability?${p.toString()}`;
  };
  const dayLabel = (d: string) => new Intl.DateTimeFormat("en-AU", { timeZone: "UTC", weekday: "short", day: "numeric", month: n > 14 ? undefined : "short" }).format(new Date(d + "T00:00:00Z"));
  const weekend = (d: string) => [0, 6].includes(new Date(d + "T00:00:00Z").getUTCDay());

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-lg ring-1 ring-line-strong">
          <Link href={link({ from: addDaysISO(from, -n) })} aria-label="Earlier" className="grid h-9 w-9 place-items-center text-ink-muted hover:text-ink"><ChevronLeft className="h-4 w-4" /></Link>
          <Link href={link({ from: today })} className="px-2 text-[0.8125rem] font-medium text-ink-muted hover:text-ink">Today</Link>
          <Link href={link({ from: addDaysISO(from, n) })} aria-label="Later" className="grid h-9 w-9 place-items-center text-ink-muted hover:text-ink"><ChevronRight className="h-4 w-4" /></Link>
        </div>
        <div className="flex rounded-lg ring-1 ring-line-strong">
          {(Object.keys(VIEWS) as (keyof typeof VIEWS)[]).map((v) => <Link key={v} href={link({ view: v })} className={cn("px-3 py-2 text-[0.8125rem] font-medium capitalize", v === view ? "bg-ink text-surface first:rounded-l-lg last:rounded-r-lg" : "text-ink-muted hover:text-ink")}>{v}</Link>)}
        </div>
        <form className="ml-auto flex w-full flex-wrap gap-2 sm:w-auto">
          <input type="hidden" name="from" value={from} /><input type="hidden" name="view" value={view} />
          <select name="cat" defaultValue={sp.cat ?? ""} aria-label="Category" className="h-9 rounded-lg border border-line-strong bg-surface px-2 text-[0.8125rem]"><option value="">All categories</option>{cats.map((c) => <option key={c} value={c}>{c}</option>)}</select>
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Find an item" aria-label="Find an item" className="h-9 flex-1 rounded-lg border border-line-strong bg-surface px-3 text-[0.8125rem] sm:w-48" />
          <button className="h-9 rounded-lg bg-surface px-3 text-[0.8125rem] font-medium ring-1 ring-line-strong">Show</button>
        </form>
      </div>
      <p className="mb-3 flex flex-wrap items-center gap-3 text-[0.75rem] text-ink-muted">
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-emerald-100" />Plenty free</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-amber-100" />Running low</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-rose-200" />None free / overbooked</span>
        <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-sky-500" />Quoted (not held)</span>
        <span>Numbers are how many are free. Tap a day to book it.</span>
      </p>
      {!shown.length ? <Card><EmptyState title="No items to show" action={<Link href="/rentals/items/new" className="text-[0.8125rem] font-medium text-brand-700 hover:underline">Add an item</Link>} /></Card> : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[0.75rem]">
              <thead>
                <tr className="bg-zinc-50/80">
                  <th className="sticky left-0 z-10 min-w-[180px] bg-zinc-50 px-3 py-2 text-left font-medium text-ink-muted">Item</th>
                  <th className="px-1 py-2 text-center font-medium text-ink-muted">Own</th>
                  {dates.map((d) => <th key={d} className={cn("min-w-[44px] px-1 py-2 text-center font-medium", d === today ? "text-brand-700" : weekend(d) ? "text-ink-faint" : "text-ink-muted")}>{dayLabel(d)}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shown.map((it) => {
                  const own = hireable(it), u = used.get(it.id)!, p = pencil.get(it.id)!;
                  return (
                    <tr key={it.id}>
                      <td className="sticky left-0 z-10 max-w-[240px] truncate bg-surface px-3 py-1.5"><Link href={`/rentals/items/${it.id}`} className="font-medium text-ink hover:underline">{it.name}</Link>{it.category && <span className="ml-1 text-ink-faint">· {it.category}</span>}</td>
                      <td className="px-1 py-1.5 text-center tabular-nums text-ink-muted" title={it.out_of_service ? `${it.out_of_service} out of service` : undefined}>{own}{it.out_of_service ? "*" : ""}</td>
                      {dates.map((d, i) => {
                        const free = own - u[i];
                        const tone = free <= 0 ? "bg-rose-200 text-rose-900" : free < Math.max(1, own * 0.25) ? "bg-amber-100 text-amber-900" : u[i] > 0 ? "bg-emerald-100 text-emerald-900" : "text-ink-faint";
                        const names = who(it.id, days[i]);
                        return (
                          <td key={d} className="p-0.5 text-center">
                            <Link href={`/rentals/bookings/new?item=${it.id}&date=${d}`} title={[`${free} of ${own} free`, ...names, p[i] ? `${p[i]} quoted` : ""].filter(Boolean).join("\n")}
                              className={cn("relative block rounded px-1 py-1 tabular-nums hover:ring-1 hover:ring-brand-400", tone)}>
                              {free}{p[i] > 0 && <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-sky-500" />}
                            </Link>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
