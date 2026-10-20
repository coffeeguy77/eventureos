"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { saveCateringDays } from "../../kitchen/actions";
import { Button } from "@/components/ui/button";
import { FormError, inputClass } from "@/components/ui/form";
import { cn } from "@/lib/cn";

export interface CateringLine { key: string; name: string; qty: number }
interface Day { date: string; time: string }

const nice = (iso: string) => iso ? new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(iso + "T00:00:00Z")) : "No date";
const fmtT = (t: string | null) => { if (!t) return "time TBC"; const h = Number(t.slice(0, 2)); return `${h % 12 || 12}:${t.slice(3, 5)}${h < 12 ? "am" : "pm"}`; };
const nextDay = (iso: string) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };

/** Catering by day: on a multi-day job, how many of each item go out each day, and what time. The kitchen and the chef see it split this way. */
export function CateringDaysCard({ eventId, lines, saved, suggested, fallback, canEdit, ready, fromAccepted }: {
  eventId: string; lines: CateringLine[];
  saved: { days: { date: string; time: string | null }[]; qty: Record<string, Record<string, number>> };
  suggested: { date: string; time: string | null }[]; fallback: { date: string | null; time: string | null };
  canEdit: boolean; ready: boolean; fromAccepted: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const split = saved.days.length >= 2;
  const [editing, setEditing] = useState(false);
  const [days, setDays] = useState<Day[]>([]);
  const [qty, setQty] = useState<Record<string, Record<string, string>>>({});

  const begin = () => {
    let d: Day[] = split ? saved.days.map((x) => ({ date: x.date, time: x.time ?? "" })) : suggested.map((x) => ({ date: x.date, time: x.time ?? "" }));
    if (d.length < 2) { const first = d[0] ?? { date: fallback.date ?? "", time: fallback.time ?? "" }; d = [first, { date: first.date ? nextDay(first.date) : "", time: first.time }]; }
    const q: Record<string, Record<string, string>> = {};
    for (const l of lines) {
      q[l.key] = {};
      const s = split ? saved.qty[l.key] : undefined;
      d.forEach((day, i) => { q[l.key][String(i)] = s ? String(s[day.date] ?? "") : i === 0 ? String(l.qty) : ""; });
    }
    setDays(d); setQty(q); setEditing(true); setError(null); setNote(null);
  };

  const totals = useMemo(() => Object.fromEntries(lines.map((l) => [l.key, days.reduce((s, _d, i) => s + (Number(qty[l.key]?.[String(i)]) || 0), 0)])), [lines, days, qty]);

  const save = (clear = false) => start(async () => {
    setError(null);
    const plan = clear ? { days: [], qty: {} } : {
      days: days.map((d) => ({ date: d.date, time: d.time || null })),
      qty: Object.fromEntries(lines.map((l) => [l.key, Object.fromEntries(days.map((d, i) => [d.date, Number(qty[l.key]?.[String(i)]) || 0]).filter(([, n]) => (n as number) > 0))])),
    };
    if (!clear && days.some((d) => !d.date)) { setError("Give each day a date."); return; }
    const r = await saveCateringDays(eventId, plan).catch(() => ({ ok: false as const, error: "Couldn't reach the server." }));
    if (!r.ok) { setError(r.error); return; }
    setEditing(false);
    setNote(clear ? "All catering now goes out on the job date." : "Saved — the kitchen and the chef see it split by day.");
    router.refresh();
  });

  if (!ready) return <p className="px-5 pb-5 text-[0.8125rem] text-ink-muted">Catering by day needs the database update (0061_kitchen_salary_catering_days.sql).</p>;

  if (!editing) {
    return (
      <div className="px-5 pb-5 text-[0.8125rem]">
        {!fromAccepted && <p className="mb-2 text-[0.75rem] text-amber-700">From the current quote — the kitchen sees it once the quote is accepted.</p>}
        {split ? (
          <div className="space-y-3">
            {saved.days.map((d) => {
              const its = lines.map((l) => ({ name: l.name, n: saved.qty[l.key]?.[d.date] ?? 0 })).filter((x) => x.n > 0);
              return (
                <div key={d.date}>
                  <p className="font-medium text-ink">{nice(d.date)} · {fmtT(d.time)}</p>
                  {its.length ? <ul className="mt-0.5 text-ink-muted">{its.map((x) => <li key={x.name} className="flex justify-between gap-3"><span>{x.name}</span><span className="tabular-nums">{x.n}</span></li>)}</ul> : <p className="text-ink-faint">Nothing this day</p>}
                </div>
              );
            })}
            {lines.filter((l) => !saved.qty[l.key]).map((l) => <p key={l.key} className="text-[0.75rem] text-amber-700">{l.name} isn&apos;t split yet — all {l.qty} go on the first day.</p>)}
            {lines.filter((l) => saved.qty[l.key] && Object.values(saved.qty[l.key]).reduce((s, n) => s + n, 0) !== l.qty).map((l) => <p key={l.key} className="text-[0.75rem] text-amber-700">{l.name}: the days add up to {Object.values(saved.qty[l.key]).reduce((s, n) => s + n, 0)} but the quote has {l.qty}.</p>)}
          </div>
        ) : (
          <p className="text-ink-muted">All catering goes out on {fallback.date ? nice(fallback.date) : "the job date"} at {fmtT(fallback.time)}.</p>
        )}
        {note && <p className="mt-2 text-[0.75rem] text-emerald-700">{note}</p>}
        {canEdit && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={begin}>{split ? "Change days" : "Split over days"}</Button>
            {split && <Button size="sm" variant="ghost" disabled={pending} onClick={() => save(true)}>Put it all on one day</Button>}
          </div>
        )}
        <FormError message={error} />
      </div>
    );
  }

  return (
    <div className="px-5 pb-5 text-[0.8125rem]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[28rem]">
          <thead>
            <tr className="align-bottom">
              <th className="pb-2 pr-3 text-left text-[0.75rem] font-medium text-ink-faint">Item</th>
              {days.map((d, i) => (
                <th key={i} className="pb-2 pr-2 text-left font-normal">
                  <div className="flex items-center gap-1">
                    <input type="date" aria-label={`Day ${i + 1} date`} value={d.date} onChange={(ev) => setDays(days.map((x, j) => j === i ? { ...x, date: ev.target.value } : x))} className={cn(inputClass, "h-8 w-[8.5rem] px-2 text-[0.75rem]")} />
                    {days.length > 2 && <button type="button" aria-label={`Remove day ${i + 1}`} onClick={() => { setDays(days.filter((_, j) => j !== i)); setQty(Object.fromEntries(Object.entries(qty).map(([k, row]) => [k, Object.fromEntries(days.filter((_, j) => j !== i).map((_, j2) => [String(j2), row[String(j2 >= i ? j2 + 1 : j2)] ?? ""]))]))); }} className="text-ink-faint hover:text-rose-600"><X className="h-3.5 w-3.5" /></button>}
                  </div>
                  <input type="time" aria-label={`Day ${i + 1} delivery time`} value={d.time} onChange={(ev) => setDays(days.map((x, j) => j === i ? { ...x, time: ev.target.value } : x))} className={cn(inputClass, "mt-1 h-8 w-[8.5rem] px-2 text-[0.75rem]")} />
                </th>
              ))}
              <th className="whitespace-nowrap pb-2 text-right text-[0.75rem] font-medium text-ink-faint">Total / quote</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {lines.map((l) => (
              <tr key={l.key}>
                <td className="py-2 pr-3 text-ink">{l.name}</td>
                {days.map((_d, i) => (
                  <td key={i} className="py-2 pr-2">
                    <input inputMode="numeric" aria-label={`${l.name} day ${i + 1}`} value={qty[l.key]?.[String(i)] ?? ""} onChange={(ev) => setQty({ ...qty, [l.key]: { ...qty[l.key], [String(i)]: ev.target.value.replace(/[^\d]/g, "") } })} className={cn(inputClass, "h-8 w-20 px-2 text-right tabular-nums")} />
                  </td>
                ))}
                <td className={cn("whitespace-nowrap py-2 text-right tabular-nums", totals[l.key] === l.qty ? "text-ink-muted" : "font-semibold text-rose-600")}>{totals[l.key]} / {l.qty}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" onClick={() => { const last = days[days.length - 1]; setDays([...days, { date: last?.date ? nextDay(last.date) : "", time: last?.time ?? "" }]); }}><Plus className="h-3.5 w-3.5" />Add a day</Button>
        <span className="flex-1" />
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
        <Button size="sm" variant="primary" disabled={pending} onClick={() => save(false)}>{pending ? "Saving…" : "Save"}</Button>
      </div>
      {lines.some((l) => totals[l.key] !== l.qty) && <p className="mt-2 text-[0.75rem] text-rose-600">Some items don&apos;t add up to the quote — you can still save, but check the numbers.</p>}
      <FormError message={error} />
    </div>
  );
}
