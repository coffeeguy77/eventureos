"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormError, Input, Select } from "@/components/ui/form";
import { saveQuickTasks } from "@/app/(app)/nerd-herd/quote-actions";
import { fmtStep } from "@/lib/nerdherd/quotes";

type Row = { key: number; label: string; hours: number };
const STEPS = Array.from({ length: 48 }, (_, i) => (i + 1) / 4);

/** Edit the Quick add list techs pick from on ticket quotes (and Claude uses when drafting). */
export function QuickTasksForm({ initial }: { initial: { label: string; hours: number }[] }) {
  const [rows, setRows] = useState<Row[]>(() => initial.map((t, i) => ({ key: i, ...t })));
  const [next, setNext] = useState(initial.length);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const edit = (key: number, p: Partial<Row>) => { setSaved(false); setRows((r) => r.map((x) => (x.key === key ? { ...x, ...p } : x))); };
  const add = () => { setSaved(false); setRows((r) => [...r, { key: next, label: "", hours: 0.25 }]); setNext(next + 1); };
  const remove = (key: number) => { setSaved(false); setRows((r) => r.filter((x) => x.key !== key)); };
  const save = () => start(async () => {
    setErr(null);
    const res = await saveQuickTasks(rows.filter((r) => r.label.trim()).map((r) => ({ label: r.label, hours: r.hours })));
    if (!res.ok) { setErr(res.error); return; }
    setRows(res.data.map((t, i) => ({ key: i, ...t }))); setNext(res.data.length); setSaved(true);
  });
  return (
    <div className="space-y-3">
      <p className="text-[0.8125rem] text-ink-muted">Standard steps your techs can drop into a quote in one tap. Claude also uses these wording and times when it drafts a quote. Techs can add to this list from a quote with the bookmark button.</p>
      {rows.length === 0 && <p className="rounded-md border border-dashed border-line px-3 py-4 text-center text-[0.8125rem] text-ink-faint">No Quick add steps yet.</p>}
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.key} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
            <Input aria-label="Step" className="min-w-0 flex-1 basis-full sm:basis-auto" value={r.label} placeholder="e.g. Sign in and check backups" onChange={(e) => edit(r.key, { label: e.target.value })} />
            <Select aria-label="Time" className="w-28 shrink-0" value={String(r.hours)} onChange={(e) => edit(r.key, { hours: Number(e.target.value) })}>
              {(STEPS.includes(r.hours) ? STEPS : [...STEPS, r.hours].sort((a, b) => a - b)).map((h) => <option key={h} value={String(h)}>{fmtStep(h)}</option>)}
            </Select>
            <button type="button" onClick={() => remove(r.key)} className="rounded-md p-2 text-ink-faint hover:bg-canvas hover:text-ink" aria-label="Remove step"><Trash2 className="h-4 w-4" /></button>
          </li>
        ))}
      </ul>
      <FormError message={err} />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" onClick={add}><Plus className="h-4 w-4" /> Add a step</Button>
        <Button type="button" variant="primary" onClick={save} disabled={pending}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null} Save Quick add</Button>
      </div>
    </div>
  );
}
