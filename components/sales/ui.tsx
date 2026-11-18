"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormError, Input, Label, Select, Textarea } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { createUnit, deleteUnit, saveExpenses, saveStaff, syncSquare, syncSupplierSpend, updateUnit, type ExpenseInput, type StaffInput } from "@/app/(app)/business-sale/actions";
import { yearlyCost } from "@/lib/sales/pnl";
import { aud } from "./charts";

/** Bring in Square sales, carrying on automatically until every location-month is in. */
export function SquareSync({ connected, firstDone }: { connected: boolean; firstDone: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState<number | null>(null);
  if (!connected) return <a href="/settings/integrations/square" className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-ink px-4 text-[0.875rem] font-semibold text-surface">Connect Square</a>;
  const go = async (full: boolean) => {
    setBusy(true); setErr(null); setMsg(null);
    for (let i = 0; i < 400; i++) {
      const r = await syncSquare(full && i === 0);
      if (!r.ok) { setErr(r.error); break; }
      setMsg(r.data.message);
      setPct(r.data.total ? Math.round((r.data.done / r.data.total) * 100) : null);
      if (!r.data.partial) break;
    }
    setBusy(false); setPct(null);
    router.refresh();
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={busy} onClick={() => go(false)}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{firstDone ? "Update Square sales" : "Bring in 3 years of Square sales"}</Button>
        {firstDone && <Button disabled={busy} onClick={() => go(true)}>Reload 3 years</Button>}
      </div>
      {pct !== null && <div className="h-2 overflow-hidden rounded-full bg-canvas"><div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} /></div>}
      {msg && <p className="text-[0.8125rem] text-ink-muted">{msg}</p>}
      <FormError message={err} />
    </div>
  );
}

export function XeroSpendSync({ connected }: { connected: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!connected) return <a href="/settings/integrations/xero" className="text-[0.8125rem] font-medium text-brand-700 underline">Connect Xero to use your actual suppliers</a>;
  return (
    <div className="space-y-1.5">
      <Button disabled={pending} onClick={() => start(async () => { setMsg(null); const r = await syncSupplierSpend(); setMsg(r.ok ? { ok: true, text: r.data.message } : { ok: false, text: r.error }); router.refresh(); })}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Refresh supplier spend from Xero
      </Button>
      {msg && <p className={cn("text-[0.8125rem]", msg.ok ? "text-ink-muted" : "text-rose-600")}>{msg.text}</p>}
    </div>
  );
}

export function NewUnit({ parents }: { parents: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<{ name: string; kind: "business" | "division"; parent_id: string }>({ name: "", kind: "business", parent_id: "" });
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!open) return <Button variant="primary" onClick={() => setOpen(true)}><Plus className="h-4 w-4" />Add a business or division</Button>;
  return (
    <div className="w-full space-y-3 rounded-2xl bg-surface p-4 ring-1 ring-line sm:w-[28rem]">
      <div><Label htmlFor="nu-name">Name</Label><Input id="nu-name" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Tulip Tops café, or Coffee carts" /></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label htmlFor="nu-kind">What&apos;s for sale</Label>
          <Select id="nu-kind" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as "business" | "division" })}><option value="business">The whole business</option><option value="division">A division / part of it</option></Select></div>
        {f.kind === "division" && parents.length > 0 && (
          <div><Label htmlFor="nu-parent">Part of</Label><Select id="nu-parent" value={f.parent_id} onChange={(e) => setF({ ...f, parent_id: e.target.value })}><option value="">—</option>{parents.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></div>
        )}
      </div>
      <FormError message={err} />
      <div className="flex gap-2">
        <Button onClick={() => setOpen(false)}>Cancel</Button>
        <Button variant="primary" disabled={pending} onClick={() => start(async () => { setErr(null); const r = await createUnit({ name: f.name, kind: f.kind, parent_id: f.parent_id || null }); if (!r.ok) { setErr(r.error); return; } router.push(`/business-sale/${r.data.id}?tab=setup`); })}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Create</Button>
      </div>
    </div>
  );
}

const PRESETS: StaffInput[] = [
  { role: "Chef", headcount: 1, pay_type: "annual", annual: 85000 },
  { role: "Barista", headcount: 2, pay_type: "hourly", hourly: 35, hours_per_shift: 7, shifts_per_week: 5, weeks_per_year: 52 },
  { role: "Kitchen hand", headcount: 1, pay_type: "hourly", hourly: 30, hours_per_shift: 6, shifts_per_week: 5, weeks_per_year: 52 },
  { role: "Front of house", headcount: 1, pay_type: "hourly", hourly: 32, hours_per_shift: 7, shifts_per_week: 5, weeks_per_year: 52 },
  { role: "Manager", headcount: 1, pay_type: "annual", annual: 75000 },
];
const nz = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

/** The standard crew it takes to run the unit. */
export function CrewEditor({ unitId, initial, superPct }: { unitId: string; initial: StaffInput[]; superPct: number }) {
  const router = useRouter();
  const [rows, setRows] = useState<StaffInput[]>(initial);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const set = (i: number, p: Partial<StaffInput>) => { setRows((r) => r.map((x, j) => (j === i ? { ...x, ...p } : x))); setSaved(false); };
  const cost = (s: StaffInput) => yearlyCost({ role: s.role, headcount: Number(s.headcount) || 0, pay_type: s.pay_type, annual: nz(s.annual), hourly: nz(s.hourly), hours_per_shift: nz(s.hours_per_shift), shifts_per_week: nz(s.shifts_per_week), weeks_per_year: nz(s.weeks_per_year), super_pct: nz(s.super_pct) }, superPct);
  const total = rows.reduce((t, s) => t + cost(s), 0);
  return (
    <div className="space-y-3">
      {rows.map((s, i) => (
        <div key={i} className="rounded-2xl bg-surface p-3.5 ring-1 ring-line">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-[minmax(0,2fr)_5rem_minmax(0,1.3fr)]">
            <div className="col-span-2 sm:col-span-1"><Label>Role</Label><Input value={s.role} onChange={(e) => set(i, { role: e.target.value })} placeholder="e.g. Barista" /></div>
            <div><Label>How many</Label><Input inputMode="decimal" value={String(s.headcount ?? "")} onChange={(e) => set(i, { headcount: e.target.value })} /></div>
            <div><Label>Paid</Label><Select value={s.pay_type} onChange={(e) => set(i, { pay_type: e.target.value as "annual" | "hourly" })}><option value="hourly">By the hour</option><option value="annual">A year (salary)</option></Select></div>
          </div>
          <div className="mt-2.5 grid grid-cols-2 gap-2.5 sm:grid-cols-5">
            {s.pay_type === "annual" ? (
              <div className="col-span-2"><Label hint="each">Salary a year</Label><Input inputMode="decimal" value={String(s.annual ?? "")} onChange={(e) => set(i, { annual: e.target.value })} placeholder="85000" /></div>
            ) : (<>
              <div><Label>$ an hour</Label><Input inputMode="decimal" value={String(s.hourly ?? "")} onChange={(e) => set(i, { hourly: e.target.value })} placeholder="35" /></div>
              <div><Label>Hours a shift</Label><Input inputMode="decimal" value={String(s.hours_per_shift ?? "")} onChange={(e) => set(i, { hours_per_shift: e.target.value })} placeholder="7" /></div>
              <div><Label>Shifts a week</Label><Input inputMode="decimal" value={String(s.shifts_per_week ?? "")} onChange={(e) => set(i, { shifts_per_week: e.target.value })} placeholder="5" /></div>
              <div><Label>Weeks a year</Label><Input inputMode="decimal" value={String(s.weeks_per_year ?? 52)} onChange={(e) => set(i, { weeks_per_year: e.target.value })} /></div>
            </>)}
            <div><Label hint={`blank = ${superPct}%`}>Super %</Label><Input inputMode="decimal" value={String(s.super_pct ?? "")} onChange={(e) => set(i, { super_pct: e.target.value })} /></div>
          </div>
          <div className="mt-2.5 flex items-center justify-between gap-2 text-[0.8125rem]">
            <span className="text-ink-muted">With super: <b className="tabular-nums text-ink">{aud(cost(s))}</b> a year · <span className="tabular-nums">{aud(cost(s) / 12)}</span> a month</span>
            <button type="button" onClick={() => { setRows((r) => r.filter((_, j) => j !== i)); setSaved(false); }} className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-ink-muted hover:text-rose-600" aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => { setRows((r) => [...r, { role: "", headcount: 1, pay_type: "hourly", weeks_per_year: 52 }]); setSaved(false); }}><Plus className="h-4 w-4" />Add a role</Button>
        {PRESETS.filter((p) => !rows.some((r) => r.role.toLowerCase() === p.role.toLowerCase())).map((p) => (
          <button key={p.role} type="button" onClick={() => { setRows((r) => [...r, { ...p }]); setSaved(false); }} className="h-9 rounded-full px-3 text-[0.8125rem] text-ink-muted ring-1 ring-inset ring-line hover:text-ink">+ {p.role}</button>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-canvas p-3.5 ring-1 ring-line">
        <p className="text-[0.875rem] text-ink">Standard crew: <b className="tabular-nums">{aud(total)}</b> a year · <span className="tabular-nums">{aud(total / 12)}</span> a month</p>
        <div className="flex items-center gap-3">
          {saved && <span className="text-[0.8125rem] font-medium text-emerald-700">Saved.</span>}
          <Button variant="primary" disabled={pending} onClick={() => start(async () => { setErr(null); const r = await saveStaff(unitId, rows); if (!r.ok) { setErr(r.error); return; } setSaved(true); router.refresh(); })}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Save crew</Button>
        </div>
      </div>
      <FormError message={err} />
    </div>
  );
}

export interface SupplierOption { id: string; name: string; total: number }

/** Expenses: actual Xero suppliers (all of it or a share) and anything typed in. */
export function ExpenseEditor({ unitId, initial, suppliers, months }: { unitId: string; initial: ExpenseInput[]; suppliers: SupplierOption[]; months: number }) {
  const router = useRouter();
  const [rows, setRows] = useState<ExpenseInput[]>(initial);
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const byId = useMemo(() => new Map(suppliers.map((s) => [s.id, s])), [suppliers]);
  const set = (i: number, p: Partial<ExpenseInput>) => { setRows((r) => r.map((x, j) => (j === i ? { ...x, ...p } : x))); setSaved(false); };
  const used = new Set(rows.filter((r) => r.source === "xero").map((r) => r.xero_contact_id));
  const found = suppliers.filter((s) => !used.has(s.id) && (!q || s.name.toLowerCase().includes(q.toLowerCase()))).slice(0, 12);
  const yearly = (e: ExpenseInput) => {
    const share = (e.share_pct === undefined || e.share_pct === "" ? 100 : Number(e.share_pct) || 0) / 100;
    if (e.source === "xero") return ((byId.get(e.xero_contact_id ?? "")?.total ?? 0) * share * 12) / Math.max(1, months);
    return (Number(e.annual) || 0) * share;
  };
  const totals = rows.reduce((t, e) => { t[e.kind] += yearly(e); return t; }, { cogs: 0, overhead: 0 });
  return (
    <div className="space-y-3">
      {rows.length === 0 && <p className="text-[0.8125rem] text-ink-muted">No expenses yet. Add the suppliers this business actually uses from Xero, or type in costs like rent.</p>}
      {rows.map((e, i) => (
        <div key={i} className="rounded-2xl bg-surface p-3.5 ring-1 ring-line">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_6rem_minmax(0,1fr)]">
            <div className="col-span-2 sm:col-span-1">
              <Label hint={e.source === "xero" ? "Xero supplier" : "typed in"}>Expense</Label>
              {e.source === "xero" ? <p className="flex h-10 items-center truncate text-[0.875rem] font-medium text-ink">{e.name}</p> : <Input value={e.name} onChange={(ev) => set(i, { name: ev.target.value })} placeholder="e.g. Rent" />}
            </div>
            <div><Label>Counts as</Label><Select value={e.kind} onChange={(ev) => set(i, { kind: ev.target.value as "cogs" | "overhead" })}><option value="cogs">Cost of goods</option><option value="overhead">Overhead</option></Select></div>
            <div><Label hint="of it">Share %</Label><Input inputMode="decimal" value={String(e.share_pct ?? 100)} onChange={(ev) => set(i, { share_pct: ev.target.value })} /></div>
            {e.source === "manual"
              ? <div className="col-span-2 sm:col-span-1"><Label hint="ex GST">A year</Label><Input inputMode="decimal" value={String(e.annual ?? "")} onChange={(ev) => set(i, { annual: ev.target.value })} placeholder="52000" /></div>
              : <div className="col-span-2 sm:col-span-1"><Label hint={`actual, last ${months} months`}>Spend</Label><p className="flex h-10 items-center text-[0.875rem] tabular-nums text-ink">{aud(byId.get(e.xero_contact_id ?? "")?.total ?? 0)}</p></div>}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 text-[0.8125rem]">
            <span className="text-ink-muted">Counted: <b className="tabular-nums text-ink">{aud(yearly(e))}</b> a year</span>
            <button type="button" onClick={() => { setRows((r) => r.filter((_, j) => j !== i)); setSaved(false); }} className="inline-flex h-9 items-center rounded-lg px-2 text-ink-muted hover:text-rose-600" aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
          </div>
        </div>
      ))}
      <div className="rounded-2xl bg-canvas p-3.5 ring-1 ring-line">
        <p className="mb-2 text-[0.8125rem] font-semibold text-ink">Add a Xero supplier</p>
        {suppliers.length === 0 ? <p className="text-[0.8125rem] text-ink-muted">No supplier spend yet — press “Refresh supplier spend from Xero” on the Business Sales page.</p> : (<>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search suppliers (e.g. milk, bakery, rent)" />
          <ul className="mt-2 divide-y divide-line">
            {found.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-2 text-[0.8125rem]">
                <span className="min-w-0 truncate text-ink">{s.name}</span>
                <span className="flex shrink-0 items-center gap-2"><span className="tabular-nums text-ink-muted">{aud(s.total)}</span>
                  <button type="button" onClick={() => { setRows((r) => [...r, { kind: "cogs", source: "xero", xero_contact_id: s.id, name: s.name, share_pct: 100 }]); setSaved(false); }} className="h-8 rounded-lg px-2.5 font-medium text-brand-700 ring-1 ring-inset ring-line">Add</button></span>
              </li>
            ))}
          </ul>
        </>)}
        <button type="button" onClick={() => { setRows((r) => [...r, { kind: "overhead", source: "manual", name: "", share_pct: 100, annual: "" }]); setSaved(false); }} className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[0.8125rem] font-medium text-ink ring-1 ring-inset ring-line"><Plus className="h-4 w-4" />Type in an expense</button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-canvas p-3.5 ring-1 ring-line">
        <p className="text-[0.875rem] text-ink">A year: cost of goods <b className="tabular-nums">{aud(totals.cogs)}</b> · overheads <b className="tabular-nums">{aud(totals.overhead)}</b></p>
        <div className="flex items-center gap-3">
          {saved && <span className="text-[0.8125rem] font-medium text-emerald-700">Saved.</span>}
          <Button variant="primary" disabled={pending} onClick={() => start(async () => { setErr(null); const r = await saveExpenses(unitId, rows); if (!r.ok) { setErr(r.error); return; } setSaved(true); router.refresh(); })}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Save expenses</Button>
        </div>
      </div>
      <FormError message={err} />
    </div>
  );
}

/** Name, what's for sale, its Square locations, categories to leave out, period and super. */
export function UnitSetup({ unit, locations, categories }: {
  unit: { id: string; name: string; kind: "business" | "division"; square_location_ids: string[]; exclude_categories: string[]; super_pct: number; months: number; notes: string | null };
  locations: { id: string; name: string }[]; categories: { category: string; sales: number }[];
}) {
  const router = useRouter();
  const [f, setF] = useState(unit);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const set = (p: Partial<typeof f>) => { setF((o) => ({ ...o, ...p })); setSaved(false); };
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label htmlFor="us-name">Name</Label><Input id="us-name" value={f.name} onChange={(e) => set({ name: e.target.value })} /></div>
        <div><Label htmlFor="us-kind">What&apos;s for sale</Label><Select id="us-kind" value={f.kind} onChange={(e) => set({ kind: e.target.value as "business" | "division" })}><option value="business">The whole business</option><option value="division">A division / part of it</option></Select></div>
        <div><Label htmlFor="us-months" hint="up to today">Default period</Label><Select id="us-months" value={String(f.months)} onChange={(e) => set({ months: Number(e.target.value) })}>{[3, 6, 12, 24, 36].map((m) => <option key={m} value={m}>Last {m} months</option>)}</Select></div>
        <div><Label htmlFor="us-super" hint="on wages">Super %</Label><Input id="us-super" inputMode="decimal" value={String(f.super_pct)} onChange={(e) => set({ super_pct: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 })} /></div>
      </div>
      <div>
        <p className="mb-1.5 text-[0.8125rem] font-medium text-ink">Square locations that are part of this sale</p>
        {locations.length === 0 ? <p className="text-[0.8125rem] text-ink-muted">Bring in Square sales first (Business Sales page), then choose the locations here.</p> : (
          <div className="flex flex-wrap gap-2">
            {locations.map((l) => {
              const on = f.square_location_ids.includes(l.id);
              return <button key={l.id} type="button" onClick={() => set({ square_location_ids: toggle(f.square_location_ids, l.id) })} className={cn("min-h-9 rounded-full px-3 text-[0.8125rem] ring-1 ring-inset", on ? "bg-brand-50 font-medium text-brand-800 ring-brand-200" : "text-ink-muted ring-line")}>{on ? "✓ " : ""}{l.name}</button>;
            })}
          </div>
        )}
      </div>
      <div><Label htmlFor="us-notes" hint="for you, not buyers">Notes</Label><Textarea id="us-notes" rows={3} value={f.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} placeholder="e.g. the coffee cart and its van go with this sale" /></div>
      {categories.length > 0 && (
        <div>
          <p className="mb-1 text-[0.8125rem] font-medium text-ink">Leave out these Square categories</p>
          <p className="mb-1.5 text-[0.75rem] text-ink-muted">For a division, untick what isn&apos;t part of the sale — e.g. leave out coffee beans to show the kitchen alone. Their sales come off the totals.</p>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => {
              const out = f.exclude_categories.some((x) => x.toLowerCase() === c.category.toLowerCase());
              return <button key={c.category} type="button" onClick={() => set({ exclude_categories: out ? f.exclude_categories.filter((x) => x.toLowerCase() !== c.category.toLowerCase()) : [...f.exclude_categories, c.category] })} className={cn("min-h-9 rounded-full px-3 text-[0.8125rem] ring-1 ring-inset", out ? "bg-rose-50 text-rose-700 line-through ring-rose-200" : "text-ink ring-line")}>{c.category}</button>;
            })}
          </div>
        </div>
      )}
      <FormError message={err} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="primary" disabled={pending} onClick={() => start(async () => { setErr(null); const r = await updateUnit(unit.id, f); if (!r.ok) { setErr(r.error); return; } setSaved(true); router.refresh(); })}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Save</Button>
          {saved && <span className="text-[0.8125rem] font-medium text-emerald-700">Saved.</span>}
        </div>
        {confirm
          ? <span className="flex items-center gap-2 text-[0.8125rem]"><span className="text-ink-muted">Delete {unit.name} and its crew and expenses?</span><Button variant="danger" disabled={pending} onClick={() => start(async () => { const r = await deleteUnit(unit.id); if (r.ok) router.push("/business-sale"); else setErr(r.error); })}>Delete</Button><Button onClick={() => setConfirm(false)}>Keep</Button></span>
          : <button type="button" onClick={() => setConfirm(true)} className="text-[0.8125rem] text-ink-muted hover:text-rose-600">Delete…</button>}
      </div>
    </div>
  );
}
