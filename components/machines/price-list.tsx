"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { saveService } from "@/app/(app)/settings/pricing/actions";

export interface ListItem { id: string; name: string; description: string | null; category: string | null; unit_price: number; tax_rate: number; code: string | null; unit: string | null; xero_account_code: string | null; active: boolean }
type Draft = { id?: string; name: string; category: string; code: string; inc: string; gst: boolean; active: boolean; description: string | null; unit: string | null; xero_account_code: string | null };

const r2 = (n: number) => Math.round(n * 100) / 100;
const incOf = (i: ListItem) => r2(Number(i.unit_price) * (1 + Number(i.tax_rate) / 100));
const money = (n: number) => `$${n.toFixed(2)}`;

/**
 * Things you sell (machines, parts, cleaners, service items): kept in your price list (Settings → Pricing) so they're
 * one tap onto a job, a quick sale or any invoice. Prices here are entered including GST.
 */
export function MachinePriceList({ items, categories }: { items: ListItem[]; categories: string[] }) {
  const router = useRouter();
  const [edit, setEdit] = useState<Draft | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const blank: Draft = { name: "", category: categories[0] ?? "", code: "", inc: "", gst: true, active: true, description: null, unit: null, xero_account_code: null };
  const open = (i: ListItem): Draft => ({ id: i.id, name: i.name, category: i.category ?? "", code: i.code ?? "", inc: incOf(i).toFixed(2), gst: Number(i.tax_rate) > 0, active: i.active, description: i.description, unit: i.unit, xero_account_code: i.xero_account_code });
  const save = () => start(async () => {
    if (!edit) return;
    setErr(null);
    const inc = Number(edit.inc.replace(/[$,\s]/g, ""));
    if (!Number.isFinite(inc) || inc < 0) { setErr("Enter the price including GST."); return; }
    const r = await saveService({ id: edit.id, name: edit.name, category: edit.category || null, code: edit.code || null, unit_price: edit.gst ? Math.round((inc / 1.1) * 10000) / 10000 : inc,
      tax_rate: edit.gst ? 10 : 0, active: edit.active, description: edit.description, unit: edit.unit, xero_account_code: edit.xero_account_code });
    if (!r.ok) { setErr(r.error); return; }
    setEdit(null); router.refresh();
  });
  const groups = [...categories, ...[...new Set(items.map((i) => i.category ?? ""))].filter((c) => !categories.includes(c))].map((c) => ({ c, list: items.filter((i) => (i.category ?? "") === c) })).filter((g) => g.list.length || categories.includes(g.c));

  const form = edit && (
    <div className="grid gap-2 bg-canvas px-4 py-3 sm:grid-cols-[minmax(0,1fr)_170px_110px_110px]">
      <Input aria-label="Name" placeholder="Name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
      <Select aria-label="Category" value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })}>{[...new Set([...categories, edit.category])].filter(Boolean).map((c) => <option key={c} value={c}>{c}</option>)}</Select>
      <Input aria-label="Code" placeholder="Code (optional)" value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value })} />
      <Input aria-label="Price including GST" placeholder="Price inc GST" inputMode="decimal" value={edit.inc} onChange={(e) => setEdit({ ...edit, inc: e.target.value })} />
      <div className="flex flex-wrap items-center gap-4 text-[0.8125rem] sm:col-span-4">
        <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4" checked={edit.gst} onChange={(e) => setEdit({ ...edit, gst: e.target.checked })} />GST applies</label>
        <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} />In use</label>
        <span className="flex-1" />
        <Button size="sm" variant="primary" disabled={pending || !edit.name.trim()} onClick={save}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Save</Button>
        <Button size="sm" onClick={() => { setEdit(null); setErr(null); }}><X className="h-4 w-4" />Cancel</Button>
      </div>
      {err && <p className="text-[0.8125rem] text-rose-600 sm:col-span-4">{err}</p>}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button variant="primary" onClick={() => setEdit(blank)} disabled={!!edit && !edit.id}><Plus className="h-4 w-4" />Add an item</Button></div>
      {edit && !edit.id && <Card className="overflow-hidden">{form}</Card>}
      {groups.map((g) => (
        <Card key={g.c || "none"} className="overflow-hidden">
          <p className="border-b border-line px-4 py-2.5 text-[0.8125rem] font-semibold text-ink">{g.c || "No category"} <span className="font-normal text-ink-muted">· {g.list.length}</span></p>
          {!g.list.length ? <p className="px-4 py-3 text-[0.8125rem] text-ink-muted">Nothing here yet.</p> : (
            <div className="divide-y divide-line">
              {g.list.map((i) => edit?.id === i.id ? <div key={i.id}>{form}</div> : (
                <div key={i.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-[0.875rem] font-medium ${i.active ? "text-ink" : "text-ink-faint line-through"}`}>{i.name}</p>
                    {i.code && <p className="text-[0.7188rem] text-ink-muted">{i.code}</p>}
                  </div>
                  <span className="text-[0.875rem] tabular-nums text-ink">{money(incOf(i))}</span>
                  <span className="hidden w-16 text-[0.7188rem] text-ink-muted sm:block">{Number(i.tax_rate) > 0 ? "inc GST" : "GST free"}</span>
                  <button type="button" aria-label={`Edit ${i.name}`} onClick={() => { setEdit(open(i)); setErr(null); }} className="grid h-8 w-8 place-items-center rounded-lg text-ink-muted hover:bg-canvas hover:text-ink"><Pencil className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
