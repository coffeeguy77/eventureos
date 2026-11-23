"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Check, Clock, Loader2, Lock, Minus, Pencil, Plus, Sparkles, Trash2, Undo2, UserPlus, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";
import { customerChangeQuote } from "@/app/q/actions";
import { addDay, moveDays, staffQuote, type StaffChange, type StaffEdit } from "@/lib/quotes/customer-edit";
import { longDay } from "@/lib/quotes/line-helpers";

export interface ChangeLine {
  id: string; name: string; quantity: number; unit: string | null; unit_price: number; tax_rate: number; editable: boolean; section: string;
  /** A drinks line: hot and cold chosen separately */
  serves?: { hot: number; cold: number } | null;
}
export interface ChangeItem { id: string; name: string; description: string | null; unit: string | null; unit_price: number; tax_rate: number; category: string | null }

const inc = (p: number, t: number) => p * (1 + t / 100);
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const hrs = (h: number) => `${Number.isInteger(h) ? h : Number(h.toFixed(2))} hr${h === 1 ? "" : "s"}`;

/** Every quarter hour from 5am to 11:45pm, shown as "8:30 am". */
const TIMES = Array.from({ length: (24 - 5) * 4 }, (_, i) => {
  const m = 5 * 60 + i * 15, h = Math.floor(m / 60), mm = m % 60;
  return { value: `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`, label: `${h % 12 || 12}:${String(mm).padStart(2, "0")} ${h < 12 ? "am" : "pm"}` };
});
const withTime = (t: string) => (TIMES.some((x) => x.value === t) ? TIMES : [...TIMES, { value: t, label: t }].sort((a, b) => a.value.localeCompare(b.value)));

/**
 * "Change your order" on the quote link: the staff hours (each day), another cart, hot and cold drinks, catering
 * numbers, add-ons like a branded cart, and catering from the menu. Saving makes the next version of the quote,
 * shown straight away, ready to accept.
 */
export function CustomerChange({ token, lines, catalogue, currency, businessName, preview = false, assumed = null, staffEdit = null, upsells = [] }: {
  token: string; lines: ChangeLine[]; catalogue: ChangeItem[]; currency: string; businessName: string;
  /** A line whose number was assumed (they didn't say how many) — asked about up front */
  assumed?: { id: string; quantity: number } | null;
  /** The business looking at the customer's page: everything works, but nothing is saved */
  preview?: boolean;
  staffEdit?: StaffEdit | null;
  upsells?: ChangeItem[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  type Edit = { qty: Record<string, number>; split: Record<string, { hot: number; cold: number }>; staff: StaffChange | null; extras: string[]; removed: string[]; added: { service_id: string; quantity: number }[] };
  const init = (): Edit => ({
    qty: Object.fromEntries(lines.map((l) => [l.id, Number(l.quantity)])),
    split: Object.fromEntries(lines.filter((l) => l.serves).map((l) => [l.id, { ...l.serves! }])),
    staff: staffEdit ? { carts: staffEdit.carts, days: staffEdit.days.map((d) => ({ date: d.date, start: d.start, end: d.end, team: d.team, extra: d.extra.map((x) => ({ ...x })) })) } : null,
    extras: [], removed: [], added: [],
  });
  const [ed, setEd] = useState<Edit>(init);
  const [history, setHistory] = useState<Edit[]>([]);
  /** Every change can be undone, one step at a time */
  const change = (fn: (e: Edit) => Edit) => setEd((cur) => { setHistory((h) => [...h.slice(-49), cur]); return fn(cur); });
  const undo = () => setHistory((h) => { if (!h.length) return h; setEd(h[h.length - 1]); return h.slice(0, -1); });
  const { qty, split, staff } = ed;
  const extras = useMemo(() => new Set(ed.extras), [ed.extras]);
  const removed = useMemo(() => new Set(ed.removed), [ed.removed]);
  const added = ed.added;
  const setStaff = (fn: (s: StaffChange) => StaffChange) => change((e) => (e.staff ? { ...e, staff: fn(e.staff) } : e));
  const setDay = (i: number, patch: Partial<StaffChange["days"][number]>) => setStaff((s) => ({ ...s, days: s.days.map((d, k) => (k === i ? { ...d, ...patch } : d)) }));
  const [pick, setPick] = useState(""); const [pickQty, setPickQty] = useState("10");
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // "Change the number" links (#change-order) open the editor
  useEffect(() => {
    const check = () => { if (window.location.hash === "#change-order") { setDone(null); setOpen(true); } };
    check(); window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, []);

  const groups = useMemo(() => {
    const m = new Map<string, ChangeItem[]>();
    for (const c of catalogue) { const g = (c.category ?? "Catering").replace(/^catering\s*·\s*/i, "") || "Catering"; m.set(g, [...(m.get(g) ?? []), c]); }
    return [...m.entries()];
  }, [catalogue]);
  const byId = useMemo(() => new Map([...catalogue, ...upsells].map((c) => [c.id, c])), [catalogue, upsells]);

  // The staff line and hire as they'd now be charged
  const hireQuoted = Number(lines.find((l) => l.id === staffEdit?.hireLineId)?.quantity ?? 1);
  const sq = useMemo(() => { try { return staffEdit && staff ? staffQuote(staffEdit, staff, hireQuoted) : null; } catch { return null; } }, [staffEdit, staff, hireQuoted]);
  const qtyOf = (l: ChangeLine) => {
    if (staffEdit && sq && l.id === staffEdit.lineId) return sq.hours;
    if (staffEdit && sq && l.id === staffEdit.hireLineId) return sq.hire;
    if (staffEdit?.travel && sq && l.id === staffEdit.travel.lineId) return sq.km;
    if (l.serves) { const s = split[l.id] ?? l.serves; return s.hot + s.cold; }
    return qty[l.id] ?? l.quantity;
  };
  const total = lines.reduce((t, l) => t + (removed.has(l.id) ? 0 : inc(l.unit_price, l.tax_rate) * qtyOf(l)), 0)
    + added.reduce((t, a) => { const c = byId.get(a.service_id); return t + (c ? inc(c.unit_price, c.tax_rate) * a.quantity : 0); }, 0)
    + [...extras].reduce((t, id) => { const c = byId.get(id); return t + (c ? inc(c.unit_price, c.tax_rate) : 0); }, 0);
  const was = lines.reduce((t, l) => t + inc(l.unit_price, l.tax_rate) * Number(l.quantity), 0);
  const staffChanged = !!(staffEdit && staff && JSON.stringify(staff) !== JSON.stringify(init().staff));
  const splitChanged = lines.some((l) => l.serves && !removed.has(l.id) && (split[l.id]?.hot !== l.serves.hot || split[l.id]?.cold !== l.serves.cold));
  const changed = added.length > 0 || removed.size > 0 || extras.size > 0 || staffChanged || splitChanged
    || lines.some((l) => !l.serves && (qty[l.id] ?? l.quantity) !== Number(l.quantity));
  const step = (id: string, by: number) => change((e) => ({ ...e, qty: { ...e.qty, [id]: clamp((e.qty[id] ?? 1) + by, 1, 10000) } }));
  const stepBy = (unitQty: number) => (unitQty >= 100 ? 10 : unitQty >= 20 ? 5 : 1);
  const reset = () => { setEd(init()); setHistory([]); };

  const save = () => start(async () => {
    setErr(null);
    if (preview) { setErr("Preview only — in the customer's own link this saves the change and updates their quote."); return; }
    const set = [
      ...lines.filter((l) => l.editable && !l.serves && !removed.has(l.id) && (qty[l.id] ?? l.quantity) !== Number(l.quantity)).map((l) => ({ id: l.id, quantity: qty[l.id] })),
      ...lines.filter((l) => l.editable && l.serves && !removed.has(l.id) && (split[l.id]?.hot !== l.serves.hot || split[l.id]?.cold !== l.serves.cold))
        .map((l) => ({ id: l.id, quantity: split[l.id].hot + split[l.id].cold, hot: split[l.id].hot, cold: split[l.id].cold })),
    ];
    const r = await customerChangeQuote(token, { set, remove: [...removed], add: [...added, ...[...extras].map((id) => ({ service_id: id, quantity: 1 }))], staff: staffChanged ? staff : null })
      .catch(() => ({ ok: false as const, error: "Couldn't reach us — check your connection and try again." }));
    if (!r.ok) { setErr(r.error); return; }
    setDone(`Your quote is updated — version ${r.version}, ${money(r.total, currency, { cents: true })}. Check it above, then accept it below.`);
    setOpen(false); setHistory([]);
    router.refresh();
  });

  if (!open) {
    const what = [staffEdit ? `${staffEdit.label} days and hours` : null, lines.some((l) => l.serves) ? "hot and cold drinks" : null, catalogue.length ? "catering" : null].filter(Boolean) as string[];
    return (
      <div id="change-order" className="scroll-mt-4 rounded-2xl border border-line bg-surface p-5 print:hidden">
        {assumed && !done && (
          <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-[0.875rem] text-amber-900 ring-1 ring-inset ring-amber-200">
            <b>How many people?</b> You didn&apos;t mention numbers, so we&apos;ve quoted for {assumed.quantity}. Change the number here and your quote updates straight away.
          </p>
        )}
        {done && <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-[0.875rem] text-emerald-900 ring-1 ring-inset ring-emerald-200">{done}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[0.9375rem] font-semibold text-ink">Make it fit your event and budget</p>
            <p className="text-[0.8125rem] text-ink-muted">
              {what.length ? `Change the ${what.length > 1 ? `${what.slice(0, -1).join(", ")} and ${what[what.length - 1]}` : what[0]}` : "Change the numbers"}
              {staffEdit?.canAddCart ? `, or add a second ${staffEdit.unitWord} for faster service` : ""} — the quote updates straight away.
            </p>
          </div>
          <button type="button" onClick={() => { setDone(null); setOpen(true); }}
            className="inline-flex h-11 items-center gap-2 rounded-xl px-4 text-[0.9375rem] font-semibold text-[color:var(--portal-brand-ink)] ring-1 ring-inset ring-[color:var(--portal-brand)] hover:bg-zinc-50">
            <Pencil className="h-4 w-4" />{assumed && !done ? "Change the number" : "Change your order"}
          </button>
        </div>
      </div>
    );
  }

  const sel = "h-11 w-full rounded-lg border border-line bg-surface px-2.5 text-[0.9375rem] text-ink";
  const today = new Date().toLocaleDateString("en-CA");
  return (
    <div id="change-order" className="scroll-mt-4 rounded-2xl border border-line bg-surface p-4 sm:p-5 print:hidden">
      <p className="text-[1rem] font-semibold text-ink">Change your order</p>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <p className="text-[0.8125rem] text-ink-muted">Items with a lock are set by {businessName} — contact us to change those.</p>
        <button type="button" disabled={!history.length} onClick={undo}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[0.8125rem] font-medium text-ink ring-1 ring-inset ring-line hover:bg-zinc-50 disabled:opacity-40"><Undo2 className="h-4 w-4" />Undo</button>
      </div>

      {staffEdit && staff && (
        <section className="mb-4 rounded-xl border border-line p-3 sm:p-4">
          <p className="flex items-center gap-1.5 text-[0.9375rem] font-semibold text-ink"><Clock className="h-4 w-4 text-ink-muted" /><span className="capitalize">{staffEdit.label}</span>&nbsp;days &amp; hours</p>
          <p className="mb-3 text-[0.8125rem] text-ink-muted">
            Change the dates, service times and team for each day. Setup time is added before service{staffEdit.rule.min_hours ? `, and every ${staffEdit.label} is charged at least ${hrs(staffEdit.rule.min_hours)} a shift — even for a shorter service` : ""}.
            {staffEdit.hireLineId ? ` Adding or removing a day changes the ${staffEdit.unitWord} hire too.` : ""}
          </p>
          <div className="space-y-3">
            {staff.days.map((d, i) => {
              const day = sq?.perDay[i];
              const timeSel = (value: string, on: (v: string) => void, label: string) => (
                <label className="block text-[0.75rem] text-ink-muted">{label}
                  <select className={sel} value={value} onChange={(ev) => on(ev.target.value)}>{withTime(value).map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></label>
              );
              return (
                <div key={i} className="rounded-xl bg-zinc-50 p-3 ring-1 ring-inset ring-line">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="min-w-0 flex-1 text-[0.875rem] font-semibold text-ink">
                      {staff.days.length > 1 ? `Day ${i + 1}` : "Your event"}{d.date ? <span className="font-normal text-ink-muted"> · {longDay(d.date)}</span> : null}
                      {day && <span className="block text-[0.75rem] font-normal text-ink-muted">{plural(day.staff, staffEdit.label)} · {hrs(day.hours)} charged</span>}
                    </p>
                    {staff.days.length > 1 && (
                      <button type="button" onClick={() => setStaff((s) => ({ ...s, days: s.days.filter((_, k) => k !== i) }))}
                        className="inline-flex h-9 items-center gap-1 rounded-lg px-2.5 text-[0.8125rem] font-medium text-ink-muted ring-1 ring-inset ring-line hover:bg-rose-50 hover:text-rose-700"><X className="h-4 w-4" />Remove day</button>
                    )}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]">
                    <label className="col-span-2 block text-[0.75rem] text-ink-muted sm:col-span-1">Date
                      <input type="date" className={sel} value={d.date ?? ""} min={today} onChange={(ev) => ev.target.value && setStaff((s) => ({ ...s, days: moveDays(s.days, i, ev.target.value) }))} /></label>
                    {timeSel(d.start, (v) => setDay(i, { start: v }), "Start")}
                    {timeSel(d.end, (v) => setDay(i, { end: v }), "Finish")}
                  </div>
                  {staff.days.length > 1 && <p className="mt-1 text-[0.75rem] text-ink-faint">Changing a date moves the other days with it.</p>}

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-[0.8125rem] text-ink">{plural(d.team, staffEdit.label)} on these hours</span>
                    <span className="inline-flex items-center rounded-lg ring-1 ring-inset ring-line">
                      <button type="button" aria-label={`Fewer ${staffEdit.label}s`} disabled={d.team <= staff.carts} onClick={() => setDay(i, { team: d.team - 1 })} className="grid h-9 w-9 place-items-center text-ink-muted hover:text-ink disabled:opacity-30"><Minus className="h-4 w-4" /></button>
                      <span className="w-8 text-center text-[0.9375rem] tabular">{d.team}</span>
                      <button type="button" aria-label={`More ${staffEdit.label}s`} disabled={d.team + d.extra.length >= 8} onClick={() => setDay(i, { team: d.team + 1 })} className="grid h-9 w-9 place-items-center text-ink-muted hover:text-ink disabled:opacity-30"><Plus className="h-4 w-4" /></button>
                    </span>
                  </div>
                  {d.extra.map((x, k) => (
                    <div key={k} className="mt-2 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2 rounded-lg bg-surface p-2 ring-1 ring-inset ring-line">
                      <p className="col-span-3 text-[0.8125rem] font-medium text-ink">Extra {staffEdit.label} — own hours <span className="font-normal text-ink-muted">(still charged at least {hrs(staffEdit.rule.min_hours_extra ?? staffEdit.rule.min_hours ?? 0)})</span></p>
                      {timeSel(x.start, (v) => setDay(i, { extra: d.extra.map((y, n) => (n === k ? { ...y, start: v } : y)) }), "Start")}
                      {timeSel(x.end, (v) => setDay(i, { extra: d.extra.map((y, n) => (n === k ? { ...y, end: v } : y)) }), "Finish")}
                      <button type="button" aria-label="Remove this extra shift" onClick={() => setDay(i, { extra: d.extra.filter((_, n) => n !== k) })} className="grid h-11 w-11 place-items-center rounded-lg text-ink-faint hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  ))}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" disabled={d.team + d.extra.length >= 8} onClick={() => setDay(i, { team: d.team + 1 })}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[0.8125rem] font-medium text-ink ring-1 ring-inset ring-line hover:bg-surface disabled:opacity-40"><UserPlus className="h-4 w-4" />Extra {staffEdit.label} — need faster service?</button>
                    <button type="button" disabled={d.team + d.extra.length >= 8} onClick={() => setDay(i, { extra: [...d.extra, { start: d.start, end: d.end }] })}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[0.8125rem] font-medium text-ink-muted hover:text-ink disabled:opacity-40">+ Extra {staffEdit.label} on different hours</button>
                  </div>
                </div>
              );
            })}
          </div>
          {!sq && <p className="mt-2 text-[0.8125rem] font-medium text-rose-700">Check the times — each finish needs to be after its start.</p>}
          {staff.days.length < staffEdit.maxDays && (
            <button type="button" onClick={() => setStaff((s) => ({ ...s, days: addDay(s.days) }))}
              className="mt-3 inline-flex h-11 items-center gap-2 rounded-xl px-4 text-[0.9375rem] font-semibold text-[color:var(--portal-brand-ink)] ring-1 ring-inset ring-[color:var(--portal-brand)] hover:bg-zinc-50">
              <CalendarPlus className="h-4 w-4" />Add a day{staffEdit.hireLineId ? ` (${staffEdit.label} + ${staffEdit.unitWord} hire)` : ""}
            </button>
          )}

          {staffEdit.canAddCart && (
            <div className="mt-4">
              <p className="text-[0.875rem] font-semibold text-ink">Second {staffEdit.unitWord}</p>
              <p className="mb-2 text-[0.8125rem] text-ink-muted">Serves twice the queue. {money(inc(staffEdit.hirePrice, staffEdit.hireTax), currency)} inc GST{staffEdit.hirePerDay ? " a day" : ""} — it comes with the first, so there&apos;s no extra delivery. Split your {staffEdit.label}s across both, or add more.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {[1, 2].map((n) => {
                  const on = staff.carts === n;
                  return (
                    <button key={n} type="button" aria-pressed={on} onClick={() => setStaff((s) => ({ ...s, carts: n, days: s.days.map((d) => ({ ...d, team: Math.max(d.team, n) })) }))}
                      className={cn("flex min-h-[3.25rem] items-center gap-3 rounded-xl px-3 py-2 text-left ring-1 ring-inset", on ? "bg-[color:var(--portal-brand)]/10 ring-[color:var(--portal-brand)]" : "ring-line hover:bg-zinc-50")}>
                      <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full ring-1 ring-inset", on ? "bg-[var(--portal-brand)] text-white ring-[color:var(--portal-brand)]" : "ring-line")}>{on && <Check className="h-3 w-3" />}</span>
                      <span className="text-[0.875rem] font-medium text-ink">{n === 1 ? `1 ${staffEdit.unitWord}` : `2 ${staffEdit.unitWord}s (+${money(inc(staffEdit.hirePrice, staffEdit.hireTax), currency)}${staffEdit.hirePerDay ? " a day" : ""})`}{n === staffEdit.carts ? <span className="block text-[0.75rem] font-normal text-ink-muted">As quoted</span> : null}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}

      <ul className="divide-y divide-line rounded-xl border border-line">
        {lines.map((l) => {
          const gone = removed.has(l.id);
          const q = qty[l.id] ?? l.quantity;
          const managed = !!staffEdit && (l.id === staffEdit.lineId || l.id === staffEdit.hireLineId || l.id === staffEdit.travel?.lineId);
          const s = split[l.id];
          return (
            <li key={l.id} className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5", gone && "bg-zinc-50")}>
              <div className="min-w-0 flex-1">
                <p className={cn("text-[0.875rem] font-medium", gone ? "text-ink-faint line-through" : "text-ink")}>{l.name}
                  {assumed?.id === l.id && !gone && <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-px text-[0.6875rem] font-semibold text-amber-800">How many? We guessed {assumed.quantity}</span>}</p>
                <p className="text-[0.75rem] text-ink-faint">{money(l.unit_price, currency, { cents: true })}{l.unit ? ` / ${l.unit}` : ""} + GST</p>
              </div>
              {managed ? (
                <span className="text-[0.8125rem] tabular text-ink-muted">{Number(qtyOf(l).toFixed(2))}{l.unit ? ` ${l.unit}` : ""} <span className="text-ink-faint">· set above</span></span>
              ) : !l.editable ? (
                <span className="inline-flex items-center gap-1.5 text-[0.8125rem] text-ink-muted"><Lock className="h-3.5 w-3.5" />{Number(l.quantity)}{l.unit ? ` ${l.unit}` : ""}</span>
              ) : gone ? (
                <button type="button" onClick={() => change((e) => ({ ...e, removed: e.removed.filter((x) => x !== l.id) }))} className="inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-[0.8125rem] font-medium text-ink ring-1 ring-inset ring-line hover:bg-surface"><Undo2 className="h-4 w-4" />Put back</button>
              ) : l.serves && s ? (
                <span className="flex w-full flex-wrap items-end gap-2 sm:w-auto">
                  <Stepper label="Hot drinks" value={s.hot} min={0} onChange={(v) => change((e) => ({ ...e, split: { ...e.split, [l.id]: { ...e.split[l.id], hot: v } } }))} />
                  <Stepper label="Cold drinks" value={s.cold} min={0} onChange={(v) => change((e) => ({ ...e, split: { ...e.split, [l.id]: { ...e.split[l.id], cold: v } } }))} />
                  <button type="button" aria-label={`Take off ${l.name}`} onClick={() => change((e) => ({ ...e, removed: [...e.removed, l.id] }))} className="grid h-10 w-10 place-items-center rounded-lg text-ink-faint hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <span className="inline-flex items-center rounded-lg ring-1 ring-inset ring-line">
                    <button type="button" aria-label={`Fewer ${l.name}`} onClick={() => step(l.id, -stepBy(q))} className="grid h-10 w-10 place-items-center text-ink-muted hover:text-ink"><Minus className="h-4 w-4" /></button>
                    <input aria-label={`${l.name} quantity`} inputMode="numeric" value={q} onChange={(ev) => { const v = clamp(Math.round(Number(ev.target.value.replace(/\D/g, "")) || 1), 1, 10000); change((e) => ({ ...e, qty: { ...e.qty, [l.id]: v } })); }}
                      className="h-10 w-16 border-x border-line bg-transparent text-center text-[0.9375rem] tabular focus:outline-none" />
                    <button type="button" aria-label={`More ${l.name}`} onClick={() => step(l.id, stepBy(q))} className="grid h-10 w-10 place-items-center text-ink-muted hover:text-ink"><Plus className="h-4 w-4" /></button>
                  </span>
                  <button type="button" aria-label={`Take off ${l.name}`} onClick={() => change((e) => ({ ...e, removed: [...e.removed, l.id] }))} className="grid h-10 w-10 place-items-center rounded-lg text-ink-faint hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                </span>
              )}
              {l.serves && s && !gone && s.hot + s.cold < 1 && <p className="w-full text-[0.75rem] font-medium text-rose-700">Choose at least one drink — or take the drinks off.</p>}
            </li>
          );
        })}
        {added.map((a, i) => {
          const c = byId.get(a.service_id);
          return (
            <li key={`a${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-2 bg-emerald-50/40 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-[0.875rem] font-medium text-ink">{c?.name} <span className="ml-1 rounded-full bg-emerald-100 px-1.5 py-px text-[0.6875rem] font-semibold text-emerald-800">New</span></p>
                <p className="text-[0.75rem] text-ink-faint">{c ? money(c.unit_price, currency, { cents: true }) : ""}{c?.unit ? ` / ${c.unit}` : ""} + GST</p>
              </div>
              <span className="text-[0.875rem] tabular text-ink">× {a.quantity}</span>
              <button type="button" aria-label={`Take off ${c?.name}`} onClick={() => change((e) => ({ ...e, added: e.added.filter((_, n) => n !== i) }))} className="grid h-10 w-10 place-items-center rounded-lg text-ink-faint hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
            </li>
          );
        })}
      </ul>

      {upsells.length > 0 && (
        <div className="mt-4 space-y-2">
          {upsells.map((u) => {
            const on = extras.has(u.id);
            return (
              <button key={u.id} type="button" aria-pressed={on} onClick={() => change((e) => ({ ...e, extras: e.extras.includes(u.id) ? e.extras.filter((x) => x !== u.id) : [...e.extras, u.id] }))}
                className={cn("flex w-full items-start gap-3 rounded-xl p-3 text-left ring-1 ring-inset", on ? "bg-[color:var(--portal-brand)]/10 ring-[color:var(--portal-brand)]" : "ring-line hover:bg-zinc-50")}>
                <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--portal-brand-ink)]" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.9375rem] font-semibold text-ink">{u.name}</span>
                  {u.description && <span className="block text-[0.8125rem] text-ink-muted">{u.description}</span>}
                </span>
                <span className="shrink-0 text-right text-[0.875rem] font-semibold tabular text-ink">+{money(inc(u.unit_price, u.tax_rate), currency)}
                  <span className="block text-[0.75rem] font-normal text-ink-muted">{on ? "Added" : "inc GST"}</span></span>
              </button>
            );
          })}
        </div>
      )}

      {catalogue.length > 0 && (
        <div className="mt-4 rounded-xl bg-zinc-50 p-3">
          <p className="mb-2 text-[0.8125rem] font-semibold text-ink">{catalogue.some((c) => !/^catering\b/i.test(c.category ?? "")) ? "Add catering or supplies" : "Add catering"}</p>
          <div className="flex flex-wrap gap-2">
            <select aria-label="Choose an item to add" value={pick} onChange={(e) => setPick(e.target.value)} className="h-11 min-w-0 flex-1 basis-48 rounded-lg border border-line bg-surface px-3 text-[0.875rem] text-ink">
              <option value="">Choose an item…</option>
              {groups.map(([g, list]) => (
                <optgroup key={g} label={g}>{list.map((c) => <option key={c.id} value={c.id}>{c.name} · {money(c.unit_price, currency, { cents: true })}{c.unit ? ` / ${c.unit}` : ""} + GST</option>)}</optgroup>
              ))}
            </select>
            <input aria-label="How many" inputMode="numeric" value={pickQty} onChange={(e) => setPickQty(e.target.value.replace(/\D/g, ""))} className="h-11 w-20 rounded-lg border border-line bg-surface px-3 text-center text-[0.875rem] tabular" />
            <button type="button" disabled={!pick || !Number(pickQty)} onClick={() => { const a = { service_id: pick, quantity: clamp(Number(pickQty), 1, 10000) }; change((e) => ({ ...e, added: [...e.added, a] })); setPick(""); }}
              className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-[var(--portal-brand)] px-4 text-[0.875rem] font-semibold text-white disabled:opacity-40"><Plus className="h-4 w-4" />Add</button>
          </div>
          {pick && byId.get(pick)?.description && <p className="mt-2 text-[0.75rem] text-ink-muted">{byId.get(pick)!.description}</p>}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-zinc-50 px-3 py-2.5 text-[0.875rem]">
        <span className="text-ink-muted">Estimated total inc GST{changed ? <> (was {money(was, currency, { cents: true })})</> : null}</span>
        <span className="font-semibold tabular text-ink">{money(total, currency, { cents: true })}</span>
      </div>
      {err && <p role="alert" className="mt-2 text-[0.8125rem] font-medium text-rose-700">{err}</p>}
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button type="button" disabled={pending} onClick={() => { setOpen(false); setErr(null); reset(); }}
          className="h-11 rounded-xl px-4 text-[0.9375rem] font-medium text-ink-muted hover:text-ink">Cancel</button>
        <button type="button" disabled={pending || !changed || (staffChanged && !sq)} onClick={save}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--portal-brand)] px-5 text-[0.9375rem] font-semibold text-white disabled:opacity-40">
          {pending ? <><Loader2 className="h-4 w-4 animate-spin" />Updating…</> : "Update my quote"}
        </button>
      </div>
    </div>
  );
}

function Stepper({ label, value, min, onChange }: { label: string; value: number; min: number; onChange: (v: number) => void }) {
  const by = value >= 100 ? 10 : value >= 20 ? 5 : 1;
  return (
    <label className="block text-[0.75rem] text-ink-muted">{label}
      <span className="mt-0.5 flex items-center rounded-lg ring-1 ring-inset ring-line">
        <button type="button" aria-label={`Fewer ${label.toLowerCase()}`} onClick={() => onChange(clamp(value - by, min, 10000))} className="grid h-10 w-10 place-items-center text-ink-muted hover:text-ink"><Minus className="h-4 w-4" /></button>
        <input aria-label={label} inputMode="numeric" value={value} onChange={(e) => onChange(clamp(Math.round(Number(e.target.value.replace(/\D/g, "")) || 0), min, 10000))}
          className="h-10 w-16 border-x border-line bg-transparent text-center text-[0.9375rem] tabular text-ink focus:outline-none" />
        <button type="button" aria-label={`More ${label.toLowerCase()}`} onClick={() => onChange(clamp(value + by, min, 10000))} className="grid h-10 w-10 place-items-center text-ink-muted hover:text-ink"><Plus className="h-4 w-4" /></button>
      </span>
    </label>
  );
}
