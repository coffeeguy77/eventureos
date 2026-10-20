"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Plus, Trash2, X } from "lucide-react";
import { saveKitchenOrder } from "../../kitchen/actions";
import { Button } from "@/components/ui/button";
import { FormError, inputClass } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import type { KitchenOrder, OrderDay } from "@/lib/kitchen/split";

const nice = (iso: string) => iso ? new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(iso + "T00:00:00Z")) : "No date";
const fmtT = (t: string | null) => { if (!t) return null; const h = Number(t.slice(0, 2)); return `${h % 12 || 12}:${t.slice(3, 5)}${h < 12 ? "am" : "pm"}`; };
const nextDay = (iso: string) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
const SOURCE = { website: "From the website catering order", accepted: "From the accepted quote", quote: "From the current quote (not accepted yet)", none: "Nothing on the quote yet" } as const;

type MenuItem = { id: string; name: string; group: string };
type EditDay = { date: string; ready: string; deliver: string; note: string; items: { service_id: string | null; name: string; qty: string; note: string }[] };

/** The kitchen order for a job: each day's ready-by time, delivery time, items (including ones not on the quote) and notes. */
export function KitchenOrderCard({ eventId, menu, saved, draft, warnings, source, ready, canEdit }: {
  eventId: string; menu: MenuItem[]; saved: KitchenOrder | null; draft: KitchenOrder; warnings: string[]; source: keyof typeof SOURCE; ready: boolean; canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ days: EditDay[]; notes: string } | null>(null);
  const shown = saved ?? draft;

  const begin = () => {
    const o = saved ?? draft;
    setEdit({ notes: o.notes ?? "", days: o.days.map((d) => ({ date: d.date, ready: d.ready ?? "", deliver: d.deliver ?? "", note: d.note ?? "", items: d.items.map((i) => ({ service_id: i.service_id, name: i.name, qty: String(i.qty), note: i.note ?? "" })) })) });
    setError(null); setNote(null);
  };
  const save = (reset = false) => start(async () => {
    setError(null);
    const payload = reset || !edit ? null : {
      notes: edit.notes.trim() || null,
      days: edit.days.map((d) => ({ date: d.date, ready: d.ready || null, deliver: d.deliver || null, note: d.note.trim() || null, items: d.items.filter((i) => i.name.trim() && Number(i.qty) > 0).map((i) => ({ service_id: i.service_id, name: i.name.trim(), qty: Math.floor(Number(i.qty)), note: i.note.trim() || null })) })),
    };
    if (payload && payload.days.some((d) => !d.date)) { setError("Give each day a date."); return; }
    const r = await saveKitchenOrder(eventId, payload).catch(() => ({ ok: false as const, error: "Couldn't reach the server." }));
    if (!r.ok) { setError(r.error); return; }
    setEdit(null); setNote(r.data); router.refresh();
  });

  if (!ready) return <p className="px-5 pb-5 text-[0.8125rem] text-ink-muted">The kitchen order needs the database update (0061_kitchen_salary_catering_days.sql).</p>;

  if (!edit) {
    const days = shown.days.filter((d) => d.items.length);
    return (
      <div className="px-5 pb-5 text-[0.8125rem]">
        <p className="mb-2 text-[0.75rem] text-ink-faint">{saved ? "Set for the kitchen" : SOURCE[source]}{!saved && source !== "none" ? " — edit it to set ready-by times, change days or add notes." : ""}</p>
        {days.length === 0 ? <p className="text-ink-muted">No catering for the kitchen on this job.</p> : (
          <div className="space-y-3">
            {days.map((d) => (
              <div key={d.date} className="rounded-lg bg-zinc-50 px-3 py-2.5">
                <p className="flex flex-wrap items-baseline gap-x-3 font-medium text-ink">{nice(d.date)}
                  <span className={cn("text-[0.75rem]", d.ready ? "font-semibold text-brand-700" : "text-amber-700")}>{d.ready ? `Ready by ${fmtT(d.ready)}` : "Ready-by time not set"}</span>
                  {d.deliver && <span className="text-[0.75rem] font-normal text-ink-muted">At the event {fmtT(d.deliver)}</span>}</p>
                <ul className="mt-1 space-y-0.5 text-ink-muted">{d.items.map((i, k) => <li key={k} className="flex justify-between gap-3"><span>{i.name}{i.note && <span className="text-ink-faint"> — {i.note}</span>}</span><span className="tabular-nums text-ink">{i.qty}</span></li>)}</ul>
                {d.note && <p className="mt-1 text-[0.75rem] text-amber-800">{d.note}</p>}
              </div>
            ))}
            {shown.notes && <p className="whitespace-pre-line text-[0.75rem] text-ink-muted">Notes: {shown.notes}</p>}
          </div>
        )}
        {warnings.length > 0 && <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[0.75rem] text-amber-900"><p className="flex items-center gap-1 font-medium"><AlertTriangle className="h-3.5 w-3.5" />Different from the quote</p>{warnings.map((w) => <p key={w}>{w}</p>)}</div>}
        {note && <p className="mt-2 text-[0.75rem] text-emerald-700">{note}</p>}
        {canEdit && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={begin}>{saved ? "Edit kitchen order" : days.length ? "Set ready times / edit" : "Add a kitchen order"}</Button>
            {saved && source !== "none" && <Button size="sm" variant="ghost" disabled={pending} onClick={() => save(true)}>Go back to the quote</Button>}
          </div>
        )}
        <FormError message={error} />
      </div>
    );
  }

  const field = cn(inputClass, "h-8 px-2 text-[0.8125rem]");
  const setDay = (i: number, patch: Partial<EditDay>) => setEdit({ ...edit, days: edit.days.map((d, j) => (j === i ? { ...d, ...patch } : d)) });
  const setItem = (di: number, ii: number, patch: Partial<EditDay["items"][number]>) => setDay(di, { items: edit.days[di].items.map((x, j) => (j === ii ? { ...x, ...patch } : x)) });
  const groups = [...new Set(menu.map((m) => m.group))];
  return (
    <div className="space-y-4 px-5 pb-5 text-[0.8125rem]">
      {edit.days.map((d, di) => (
        <div key={di} className="rounded-xl p-3 ring-1 ring-line">
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-[0.7188rem] text-ink-muted">Day<input type="date" value={d.date} onChange={(e) => setDay(di, { date: e.target.value })} className={cn(field, "block w-[9.5rem]")} /></label>
            <label className="text-[0.7188rem] text-ink-muted">Ready by<input type="time" value={d.ready} onChange={(e) => setDay(di, { ready: e.target.value })} className={cn(field, "block w-[7.5rem]")} /></label>
            <label className="text-[0.7188rem] text-ink-muted">At the event<input type="time" value={d.deliver} onChange={(e) => setDay(di, { deliver: e.target.value })} className={cn(field, "block w-[7.5rem]")} /></label>
            {edit.days.length > 1 && <button type="button" aria-label={`Remove ${nice(d.date)}`} onClick={() => setEdit({ ...edit, days: edit.days.filter((_, j) => j !== di) })} className="ml-auto grid h-8 w-8 place-items-center rounded-md text-ink-faint hover:bg-rose-50 hover:text-rose-600"><X className="h-4 w-4" /></button>}
          </div>
          <table className="mt-3 w-full">
            <tbody className="divide-y divide-line">
              {d.items.map((it, ii) => (
                <tr key={ii}>
                  <td className="py-1.5 pr-2">
                    {it.service_id || !menu.length ? <span className="text-ink">{it.name}</span>
                      : <input value={it.name} onChange={(e) => setItem(di, ii, { name: e.target.value })} aria-label="Item" className={field} />}
                  </td>
                  <td className="w-20 py-1.5 pr-2"><input inputMode="numeric" aria-label={`${it.name} quantity`} value={it.qty} onChange={(e) => setItem(di, ii, { qty: e.target.value.replace(/[^\d]/g, "") })} className={cn(field, "w-full text-right tabular-nums")} /></td>
                  <td className="py-1.5 pr-2"><input aria-label={`${it.name} note`} placeholder="Note (e.g. 5 gluten free)" value={it.note} onChange={(e) => setItem(di, ii, { note: e.target.value })} className={field} /></td>
                  <td className="w-8 py-1.5"><button type="button" aria-label={`Remove ${it.name}`} onClick={() => setDay(di, { items: d.items.filter((_, j) => j !== ii) })} className="grid h-8 w-8 place-items-center rounded-md text-ink-faint hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select aria-label="Add an item" value="" onChange={(e) => {
              const v = e.target.value; if (!v) return;
              const m = menu.find((x) => x.id === v);
              setDay(di, { items: [...d.items, m ? { service_id: m.id, name: m.name, qty: "", note: "" } : { service_id: null, name: "", qty: "", note: "" }] });
            }} className={cn(field, "w-auto")}>
              <option value="">+ Add an item…</option>
              {groups.map((g) => <optgroup key={g} label={g}>{menu.filter((m) => m.group === g).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</optgroup>)}
              <option value="__other">Something else (type it)</option>
            </select>
          </div>
          <input value={d.note} onChange={(e) => setDay(di, { note: e.target.value })} placeholder="Note for this day (e.g. leaves with the van at 7am)" aria-label={`Note for ${nice(d.date)}`} className={cn(field, "mt-2")} />
        </div>
      ))}
      <Button size="sm" variant="ghost" onClick={() => { const last = edit.days[edit.days.length - 1]; setEdit({ ...edit, days: [...edit.days, { date: last?.date ? nextDay(last.date) : "", ready: last?.ready ?? "", deliver: last?.deliver ?? "", note: "", items: [] }] }); }}><Plus className="h-3.5 w-3.5" />Add a day</Button>
      <textarea value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} rows={2} placeholder="Notes for the kitchen (dietary needs, packaging, who's collecting…)" aria-label="Notes for the kitchen" className={cn(inputClass, "text-[0.8125rem]")} />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[0.75rem] text-ink-faint">The chef is emailed when a confirmed job&apos;s kitchen order changes.</span>
        <span className="flex-1" />
        <Button size="sm" variant="ghost" onClick={() => setEdit(null)}>Cancel</Button>
        <Button size="sm" variant="primary" disabled={pending} onClick={() => save(false)}>{pending ? "Saving…" : "Save kitchen order"}</Button>
      </div>
      <FormError message={error} />
    </div>
  );
}

export type { OrderDay };
