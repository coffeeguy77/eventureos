"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock, Loader2, Lock, Minus, Pencil, Plus, Sparkles, Trash2, Undo2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";
import { customerChangeQuote } from "@/app/q/actions";
import { staffQuote, type StaffChange, type StaffEdit } from "@/lib/quotes/customer-edit";
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
  const initQty = () => Object.fromEntries(lines.map((l) => [l.id, Number(l.quantity)]));
  const initSplit = () => Object.fromEntries(lines.filter((l) => l.serves).map((l) => [l.id, { ...l.serves! }]));
  const initStaff = (): StaffChange | null => (staffEdit ? { days: staffEdit.days.map((d) => ({ start: d.start, end: d.end })), carts: staffEdit.carts, staff: staffEdit.staff } : null);
  const [qty, setQty] = useState<Record<string, number>>(initQty);
  const [split, setSplit] = useState<Record<string, { hot: number; cold: number }>>(initSplit);
  const [staff, setStaff] = useState<StaffChange | null>(initStaff);
  const [extras, setExtras] = useState<Set<string>>(new Set());
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState<{ service_id: string; quantity: number }[]>([]);
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
  const sq = useMemo(() => { try { return staffEdit && staff ? staffQuote(staffEdit, staff) : null; } catch { return null; } }, [staffEdit, staff]);
  const qtyOf = (l: ChangeLine) => {
    if (staffEdit && sq && l.id === staffEdit.lineId) return sq.hours;
    if (staffEdit && sq && l.id === staffEdit.hireLineId) return Number(l.quantity) + sq.extraHire;
    if (l.serves) { const s = split[l.id] ?? l.serves; return s.hot + s.cold; }
    return qty[l.id] ?? l.quantity;
  };
  const total = lines.reduce((t, l) => t + (removed.has(l.id) ? 0 : inc(l.unit_price, l.tax_rate) * qtyOf(l)), 0)
    + added.reduce((t, a) => { const c = byId.get(a.service_id); return t + (c ? inc(c.unit_price, c.tax_rate) * a.quantity : 0); }, 0)
    + [...extras].reduce((t, id) => { const c = byId.get(id); return t + (c ? inc(c.unit_price, c.tax_rate) : 0); }, 0);
  const was = lines.reduce((t, l) => t + inc(l.unit_price, l.tax_rate) * Number(l.quantity), 0);
  const staffChanged = !!(staffEdit && staff && (staff.carts !== staffEdit.carts || staff.staff !== staffEdit.staff || staff.days.some((d, i) => d.start !== staffEdit.days[i].start || d.end !== staffEdit.days[i].end)));
  const splitChanged = lines.some((l) => l.serves && !removed.has(l.id) && (split[l.id]?.hot !== l.serves.hot || split[l.id]?.cold !== l.serves.cold));
  const changed = added.length > 0 || removed.size > 0 || extras.size > 0 || staffChanged || splitChanged
    || lines.some((l) => !l.serves && (qty[l.id] ?? l.quantity) !== Number(l.quantity));
  const step = (id: string, by: number) => setQty((q) => ({ ...q, [id]: clamp((q[id] ?? 1) + by, 1, 10000) }));
  const stepBy = (unitQty: number) => (unitQty >= 100 ? 10 : unitQty >= 20 ? 5 : 1);
  const reset = () => { setQty(initQty()); setSplit(initSplit()); setStaff(initStaff()); setExtras(new Set()); setAdded([]); setRemoved(new Set()); };

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
    setOpen(false); setAdded([]); setRemoved(new Set()); setExtras(new Set());
    router.refresh();
  });

  if (!open) {
    const what = [staffEdit ? `${staffEdit.label} hours` : null, lines.some((l) => l.serves) ? "hot and cold drinks" : null, catalogue.length ? "catering" : null].filter(Boolean) as string[];
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
              {staffEdit && staffEdit.options.length > 1 ? `, or add a second ${staffEdit.unitWord} for faster service` : ""} — the quote updates straight away.
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
  return (
    <div id="change-order" className="scroll-mt-4 rounded-2xl border border-line bg-surface p-4 sm:p-5 print:hidden">
      <p className="text-[1rem] font-semibold text-ink">Change your order</p>
      <p className="mb-4 text-[0.8125rem] text-ink-muted">Items with a lock are set by {businessName} — contact us to change those.</p>

      {staffEdit && staff && (
        <section className="mb-4 rounded-xl border border-line p-3 sm:p-4">
          <p className="flex items-center gap-1.5 text-[0.9375rem] font-semibold text-ink"><Clock className="h-4 w-4 text-ink-muted" /><span className="capitalize">{staffEdit.label}</span> hours</p>
          <p className="mb-3 text-[0.8125rem] text-ink-muted">
            When you&apos;d like service to run. Setup time is added before it{staffEdit.rule.min_hours ? `, and each ${staffEdit.label} is charged at least ${hrs(staffEdit.rule.min_hours)}` : ""}.
          </p>
          <div className="space-y-3">
            {staffEdit.days.map((d, i) => {
              const day = sq?.perDay[i];
              return (
                <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_9rem_9rem] sm:items-end">
                  <p className="col-span-2 text-[0.875rem] font-medium text-ink sm:col-span-1 sm:pb-3">
                    {d.date ? longDay(d.date) : staffEdit.days.length > 1 ? `Day ${i + 1}` : "Your event"}
                    {day && <span className="block text-[0.75rem] font-normal text-ink-muted">{plural(day.staff, staffEdit.label)} · {hrs(day.hours)} charged</span>}
                  </p>
                  <label className="block text-[0.75rem] text-ink-muted">Start
                    <select className={sel} value={staff.days[i].start} onChange={(e) => setStaff((s) => s && ({ ...s, days: s.days.map((x, n) => (n === i ? { ...x, start: e.target.value } : x)) }))}>
                      {withTime(staff.days[i].start).map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select></label>
                  <label className="block text-[0.75rem] text-ink-muted">Finish
                    <select className={sel} value={staff.days[i].end} onChange={(e) => setStaff((s) => s && ({ ...s, days: s.days.map((x, n) => (n === i ? { ...x, end: e.target.value } : x)) }))}>
                      {withTime(staff.days[i].end).map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select></label>
                </div>
              );
            })}
          </div>
          {!sq && <p className="mt-2 text-[0.8125rem] font-medium text-rose-700">The finish time needs to be after the start time.</p>}

          {staffEdit.options.length > 1 && (
            <div className="mt-4">
              <p className="text-[0.875rem] font-semibold text-ink">Faster service</p>
              <p className="mb-2 text-[0.8125rem] text-ink-muted">A second {staffEdit.unitWord} serves twice the queue. It&apos;s {money(inc(staffEdit.hirePrice, staffEdit.hireTax), currency)} inc GST{staffEdit.hirePerDay ? " a day" : ""} — we bring it with the first, so there&apos;s no extra delivery.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {staffEdit.options.map((o) => {
                  const on = staff.carts === o.carts && staff.staff === o.staff;
                  const quoted = o.carts === staffEdit.carts && o.staff === staffEdit.staff;
                  let delta = 0;
                  try { const q = staffQuote(staffEdit, { ...staff, carts: o.carts, staff: o.staff }); const base = staffQuote(staffEdit, { ...staff, carts: staffEdit.carts, staff: staffEdit.staff }); delta = inc(q.staffCost - base.staffCost, staffEdit.staffTax) + inc(q.hireCost, staffEdit.hireTax); } catch { /* times not valid yet */ }
                  const desc = o.carts === 1 ? `1 ${staffEdit.unitWord} · ${plural(o.staff, staffEdit.label)}`
                    : o.staff === o.carts ? `${o.carts} ${staffEdit.unitWord}s · 1 ${staffEdit.label} each`
                    : `${o.carts} ${staffEdit.unitWord}s · ${plural(o.staff, staffEdit.label)}`;
                  return (
                    <button key={`${o.carts}x${o.staff}`} type="button" aria-pressed={on} onClick={() => setStaff((s) => s && ({ ...s, carts: o.carts, staff: o.staff }))}
                      className={cn("flex min-h-[3.25rem] items-center gap-3 rounded-xl px-3 py-2 text-left ring-1 ring-inset", on ? "bg-[color:var(--portal-brand)]/10 ring-[color:var(--portal-brand)]" : "ring-line hover:bg-zinc-50")}>
                      <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full ring-1 ring-inset", on ? "bg-[var(--portal-brand)] text-white ring-[color:var(--portal-brand)]" : "ring-line")}>{on && <Check className="h-3 w-3" />}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[0.875rem] font-medium text-ink">{desc}</span>
                        <span className="block text-[0.75rem] text-ink-muted">{quoted ? "As quoted" : `${delta >= 0 ? "+" : "−"}${money(Math.abs(delta), currency)} inc GST`}</span>
                      </span>
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
          const managed = !!staffEdit && (l.id === staffEdit.lineId || l.id === staffEdit.hireLineId);
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
                <button type="button" onClick={() => setRemoved((x) => { const n = new Set(x); n.delete(l.id); return n; })} className="inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-[0.8125rem] font-medium text-ink ring-1 ring-inset ring-line hover:bg-surface"><Undo2 className="h-4 w-4" />Put back</button>
              ) : l.serves && s ? (
                <span className="flex w-full flex-wrap items-end gap-2 sm:w-auto">
                  <Stepper label="Hot drinks" value={s.hot} min={0} onChange={(v) => setSplit((x) => ({ ...x, [l.id]: { ...x[l.id], hot: v } }))} />
                  <Stepper label="Cold drinks" value={s.cold} min={0} onChange={(v) => setSplit((x) => ({ ...x, [l.id]: { ...x[l.id], cold: v } }))} />
                  <button type="button" aria-label={`Take off ${l.name}`} onClick={() => setRemoved((x) => new Set(x).add(l.id))} className="grid h-10 w-10 place-items-center rounded-lg text-ink-faint hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <span className="inline-flex items-center rounded-lg ring-1 ring-inset ring-line">
                    <button type="button" aria-label={`Fewer ${l.name}`} onClick={() => step(l.id, -stepBy(q))} className="grid h-10 w-10 place-items-center text-ink-muted hover:text-ink"><Minus className="h-4 w-4" /></button>
                    <input aria-label={`${l.name} quantity`} inputMode="numeric" value={q} onChange={(e) => setQty((x) => ({ ...x, [l.id]: clamp(Math.round(Number(e.target.value.replace(/\D/g, "")) || 1), 1, 10000) }))}
                      className="h-10 w-16 border-x border-line bg-transparent text-center text-[0.9375rem] tabular focus:outline-none" />
                    <button type="button" aria-label={`More ${l.name}`} onClick={() => step(l.id, stepBy(q))} className="grid h-10 w-10 place-items-center text-ink-muted hover:text-ink"><Plus className="h-4 w-4" /></button>
                  </span>
                  <button type="button" aria-label={`Take off ${l.name}`} onClick={() => setRemoved((x) => new Set(x).add(l.id))} className="grid h-10 w-10 place-items-center rounded-lg text-ink-faint hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
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
              <button type="button" aria-label={`Take off ${c?.name}`} onClick={() => setAdded((x) => x.filter((_, n) => n !== i))} className="grid h-10 w-10 place-items-center rounded-lg text-ink-faint hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
            </li>
          );
        })}
      </ul>

      {upsells.length > 0 && (
        <div className="mt-4 space-y-2">
          {upsells.map((u) => {
            const on = extras.has(u.id);
            return (
              <button key={u.id} type="button" aria-pressed={on} onClick={() => setExtras((x) => { const n = new Set(x); if (n.has(u.id)) n.delete(u.id); else n.add(u.id); return n; })}
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
            <button type="button" disabled={!pick || !Number(pickQty)} onClick={() => { setAdded((x) => [...x, { service_id: pick, quantity: clamp(Number(pickQty), 1, 10000) }]); setPick(""); }}
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
