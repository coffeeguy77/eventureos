"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock, Minus, Pencil, Plus, Trash2, Undo2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";
import { customerChangeQuote } from "@/app/q/actions";

export interface ChangeLine { id: string; name: string; quantity: number; unit: string | null; unit_price: number; tax_rate: number; editable: boolean; section: string }
export interface ChangeItem { id: string; name: string; description: string | null; unit: string | null; unit_price: number; tax_rate: number; category: string | null }

const inc = (p: number, t: number) => p * (1 + t / 100);

/**
 * "Change your order" on the quote link: more or fewer of the catering and drinks, take them off, or add catering from
 * the menu. Saving makes the next version of the quote, shown straight away, ready to accept.
 */
export function CustomerChange({ token, lines, catalogue, currency, businessName, preview = false }: {
  token: string; lines: ChangeLine[]; catalogue: ChangeItem[]; currency: string; businessName: string;
  /** The business looking at the customer's page: everything works, but nothing is saved */
  preview?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState<Record<string, number>>(() => Object.fromEntries(lines.map((l) => [l.id, Number(l.quantity)])));
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState<{ service_id: string; quantity: number }[]>([]);
  const [pick, setPick] = useState(""); const [pickQty, setPickQty] = useState("10");
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const groups = useMemo(() => {
    const m = new Map<string, ChangeItem[]>();
    for (const c of catalogue) { const g = (c.category ?? "Catering").replace(/^catering\s*·\s*/i, "") || "Catering"; m.set(g, [...(m.get(g) ?? []), c]); }
    return [...m.entries()];
  }, [catalogue]);
  const byId = useMemo(() => new Map(catalogue.map((c) => [c.id, c])), [catalogue]);

  const total = lines.reduce((t, l) => t + (removed.has(l.id) ? 0 : inc(l.unit_price, l.tax_rate) * (qty[l.id] ?? l.quantity)), 0)
    + added.reduce((t, a) => { const c = byId.get(a.service_id); return t + (c ? inc(c.unit_price, c.tax_rate) * a.quantity : 0); }, 0);
  const was = lines.reduce((t, l) => t + inc(l.unit_price, l.tax_rate) * Number(l.quantity), 0);
  const changed = added.length > 0 || removed.size > 0 || lines.some((l) => (qty[l.id] ?? l.quantity) !== Number(l.quantity));
  const step = (id: string, by: number) => setQty((q) => ({ ...q, [id]: Math.max(1, Math.min(10000, (q[id] ?? 1) + by)) }));
  const stepBy = (unitQty: number) => (unitQty >= 100 ? 10 : unitQty >= 20 ? 5 : 1);

  const save = () => start(async () => {
    setErr(null);
    if (preview) { setErr("Preview only — in the customer's own link this saves the change and updates their quote."); return; }
    const set = lines.filter((l) => l.editable && !removed.has(l.id) && (qty[l.id] ?? l.quantity) !== Number(l.quantity)).map((l) => ({ id: l.id, quantity: qty[l.id] }));
    const r = await customerChangeQuote(token, { set, remove: [...removed], add: added }).catch(() => ({ ok: false as const, error: "Couldn't reach us — check your connection and try again." }));
    if (!r.ok) { setErr(r.error); return; }
    setDone(`Your quote is updated — version ${r.version}, ${money(r.total, currency, { cents: true })}. Check it above, then accept it below.`);
    setOpen(false); setAdded([]); setRemoved(new Set());
    router.refresh();
  });

  if (!open) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-5 print:hidden">
        {done && <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-[0.875rem] text-emerald-900 ring-1 ring-inset ring-emerald-200">{done}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[0.9375rem] font-semibold text-ink">Need to change something?</p>
            <p className="text-[0.8125rem] text-ink-muted">Change the catering, drinks and supplies numbers, take items off, or add more — the quote updates straight away.</p>
          </div>
          <button type="button" onClick={() => { setDone(null); setOpen(true); }}
            className="inline-flex h-11 items-center gap-2 rounded-xl px-4 text-[0.9375rem] font-semibold text-[color:var(--portal-brand-ink)] ring-1 ring-inset ring-[color:var(--portal-brand)] hover:bg-zinc-50">
            <Pencil className="h-4 w-4" />Change your order
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-4 sm:p-5 print:hidden">
      <p className="text-[1rem] font-semibold text-ink">Change your order</p>
      <p className="mb-3 text-[0.8125rem] text-ink-muted">Items with a lock are set by {businessName} — contact us to change those.</p>
      <ul className="divide-y divide-line rounded-xl border border-line">
        {lines.map((l) => {
          const gone = removed.has(l.id);
          const q = qty[l.id] ?? l.quantity;
          return (
            <li key={l.id} className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5", gone && "bg-zinc-50")}>
              <div className="min-w-0 flex-1">
                <p className={cn("text-[0.875rem] font-medium", gone ? "text-ink-faint line-through" : "text-ink")}>{l.name}</p>
                <p className="text-[0.75rem] text-ink-faint">{money(l.unit_price, currency, { cents: true })}{l.unit ? ` / ${l.unit}` : ""} + GST</p>
              </div>
              {!l.editable ? (
                <span className="inline-flex items-center gap-1.5 text-[0.8125rem] text-ink-muted"><Lock className="h-3.5 w-3.5" />{Number(l.quantity)}{l.unit ? ` ${l.unit}` : ""}</span>
              ) : gone ? (
                <button type="button" onClick={() => setRemoved((s) => { const n = new Set(s); n.delete(l.id); return n; })} className="inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-[0.8125rem] font-medium text-ink ring-1 ring-inset ring-line hover:bg-surface"><Undo2 className="h-4 w-4" />Put back</button>
              ) : (
                <span className="flex items-center gap-2">
                  <span className="inline-flex items-center rounded-lg ring-1 ring-inset ring-line">
                    <button type="button" aria-label={`Fewer ${l.name}`} onClick={() => step(l.id, -stepBy(q))} className="grid h-10 w-10 place-items-center text-ink-muted hover:text-ink"><Minus className="h-4 w-4" /></button>
                    <input aria-label={`${l.name} quantity`} inputMode="numeric" value={q} onChange={(e) => setQty((x) => ({ ...x, [l.id]: Math.max(1, Math.min(10000, Math.round(Number(e.target.value.replace(/\D/g, "")) || 1))) }))}
                      className="h-10 w-16 border-x border-line bg-transparent text-center text-[0.9375rem] tabular focus:outline-none" />
                    <button type="button" aria-label={`More ${l.name}`} onClick={() => step(l.id, stepBy(q))} className="grid h-10 w-10 place-items-center text-ink-muted hover:text-ink"><Plus className="h-4 w-4" /></button>
                  </span>
                  <button type="button" aria-label={`Take off ${l.name}`} onClick={() => setRemoved((s) => new Set(s).add(l.id))} className="grid h-10 w-10 place-items-center rounded-lg text-ink-faint hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                </span>
              )}
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

      {catalogue.length > 0 && (
        <div className="mt-4 rounded-xl bg-zinc-50 p-3">
          <p className="mb-2 text-[0.8125rem] font-semibold text-ink">{catalogue.some((c) => !/^catering\b/i.test(c.category ?? "")) ? "Add catering or supplies" : "Add catering"}</p>
          <div className="flex flex-wrap gap-2">
            <select aria-label="Choose an item to add" value={pick} onChange={(e) => setPick(e.target.value)} className="h-11 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-[0.875rem] text-ink">
              <option value="">Choose an item…</option>
              {groups.map(([g, list]) => (
                <optgroup key={g} label={g}>{list.map((c) => <option key={c.id} value={c.id}>{c.name} · {money(c.unit_price, currency, { cents: true })}{c.unit ? ` / ${c.unit}` : ""} + GST</option>)}</optgroup>
              ))}
            </select>
            <input aria-label="How many" inputMode="numeric" value={pickQty} onChange={(e) => setPickQty(e.target.value.replace(/\D/g, ""))} className="h-11 w-20 rounded-lg border border-line bg-surface px-3 text-center text-[0.875rem] tabular" />
            <button type="button" disabled={!pick || !Number(pickQty)} onClick={() => { setAdded((x) => [...x, { service_id: pick, quantity: Math.min(10000, Math.max(1, Number(pickQty))) }]); setPick(""); }}
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
        <button type="button" disabled={pending} onClick={() => { setOpen(false); setErr(null); setAdded([]); setRemoved(new Set()); setQty(Object.fromEntries(lines.map((l) => [l.id, Number(l.quantity)]))); }}
          className="h-11 rounded-xl px-4 text-[0.9375rem] font-medium text-ink-muted hover:text-ink">Cancel</button>
        <button type="button" disabled={pending || !changed} onClick={save}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--portal-brand)] px-5 text-[0.9375rem] font-semibold text-white disabled:opacity-40">
          {pending ? <><Loader2 className="h-4 w-4 animate-spin" />Updating…</> : "Update my quote"}
        </button>
      </div>
    </div>
  );
}
