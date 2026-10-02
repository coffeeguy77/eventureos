"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, LayoutTemplate, Pencil, Plus, Trash2, X } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormError, Input, Label, inputClass } from "@/components/ui/form";
import { money } from "@/lib/format";
import { cn } from "@/lib/cn";
import { templateTotals, type QuoteTemplate, type TemplateItem, type TemplateSection } from "@/lib/quotes/templates";
import { deleteQuoteTemplate, saveQuoteTemplate } from "./actions";

interface Svc { id: string; name: string; description: string | null; category: string | null; unit: string | null; unit_price: number; tax_rate: number; active: boolean }

/** Settings → Services & pricing → Quote templates: named starting points, e.g. "Coffee cart 3 hr — delivered". */
export function QuoteTemplatesCard({ templates, services, canEdit, currency, ready }: {
  templates: QuoteTemplate[]; services: Svc[]; canEdit: boolean; currency: string; ready: boolean;
}) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const live = services.filter((s) => s.active);
  return (
    <Card>
      <CardHeader title="Quote templates"
        subtitle="Ready-made starting points — e.g. coffee cart + delivery + barista 3 hr. Pick one on any quote; prices always come from your price list."
        action={canEdit && ready && editing === null ? <Button size="sm" onClick={() => setEditing("new")}><Plus className="h-3.5 w-3.5" />New template</Button> : undefined} />
      {!ready && <p className="mx-5 mb-4 rounded-lg bg-amber-50 px-3 py-2 text-[0.7812rem] text-amber-900 ring-1 ring-inset ring-amber-100">Templates need a quick database update before they can be used.</p>}
      <ul className="divide-y divide-line border-t border-line">
        {editing === "new" && <li className="px-5 py-4"><TemplateForm services={live} currency={currency} onDone={() => setEditing(null)} /></li>}
        {templates.length === 0 && editing !== "new" && ready && <li className="px-5 py-4 text-[0.8125rem] text-ink-muted">No templates yet. Make one here, or open a finished quote and choose “Save as template”.</li>}
        {templates.map((t) => (
          <li key={t.id} className="px-5 py-3">
            {editing === t.id ? <TemplateForm initial={t} services={live} currency={currency} onDone={() => setEditing(null)} /> : (
              <div className="flex items-start gap-3">
                <LayoutTemplate className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-[0.8438rem] font-medium text-ink">{t.name}{!t.active && <Badge tone="neutral">Off</Badge>}</p>
                  {t.summary && <p className="text-[0.7812rem] text-ink-muted">{t.summary}</p>}
                  <p className="mt-0.5 text-[0.75rem] text-ink-faint">{describe(t.sections, services)} · {money(templateTotals(t.sections, services).total, currency)} inc GST</p>
                </div>
                {canEdit && <button type="button" onClick={() => setEditing(t.id)} className="rounded-md p-1.5 text-ink-faint hover:bg-zinc-100 hover:text-ink" aria-label={`Edit ${t.name}`}><Pencil className="h-4 w-4" /></button>}
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function describe(sections: TemplateSection[], services: Svc[]) {
  const byId = new Map(services.map((s) => [s.id, s]));
  return sections.flatMap((s) => s.items.map((i) => {
    const name = i.service_id ? byId.get(i.service_id)?.name ?? "(removed item)" : i.name ?? "Item";
    return `${name}${i.quantity !== 1 ? ` × ${i.quantity}` : ""}`;
  })).join(", ");
}

function TemplateForm({ initial, services, currency, onDone }: { initial?: QuoteTemplate; services: Svc[]; currency: string; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(initial?.name ?? "");
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [active, setActive] = useState(initial?.active ?? true);
  const [sections, setSections] = useState<TemplateSection[]>(initial?.sections?.length ? initial.sections : [{ title: "Services", items: [] }]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const byId = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);
  const totals = templateTotals(sections, services);
  const grouped = useMemo(() => {
    const m = new Map<string, Svc[]>();
    for (const s of services) { const k = s.category || "Other"; m.set(k, [...(m.get(k) ?? []), s]); }
    return [...m.entries()];
  }, [services]);

  const setSec = (i: number, f: (s: TemplateSection) => TemplateSection) => setSections((all) => all.map((s, n) => (n === i ? f(s) : s)));
  const setItem = (si: number, ii: number, patch: Partial<TemplateItem>) => setSec(si, (s) => ({ ...s, items: s.items.map((x, n) => (n === ii ? { ...x, ...patch } : x)) }));
  const moveItem = (si: number, ii: number, d: -1 | 1) => setSec(si, (s) => {
    const items = [...s.items]; const j = ii + d;
    if (j < 0 || j >= items.length) return s;
    [items[ii], items[j]] = [items[j], items[ii]];
    return { ...s, items };
  });

  const save = () => start(async () => {
    setError(null);
    const r = await saveQuoteTemplate({ id: initial?.id, name, summary: summary || null, sections, active }).catch(() => ({ ok: false as const, error: "Couldn't reach the server." }));
    if (!r.ok) { setError(r.error); return; }
    router.refresh(); onDone();
  });
  const remove = () => start(async () => {
    if (!initial) return;
    const r = await deleteQuoteTemplate(initial.id).catch(() => ({ ok: false as const, error: "Couldn't reach the server." }));
    if (!r.ok) { setError(r.error); return; }
    router.refresh(); onDone();
  });

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label htmlFor="tp-name">Template name</Label><Input id="tp-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="e.g. Coffee cart 3 hr — delivered" autoFocus /></div>
        <div><Label htmlFor="tp-sum" hint="optional">Short description</Label><Input id="tp-sum" value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={300} placeholder="e.g. Our most popular office package" /></div>
      </div>
      {sections.map((sec, si) => (
        <div key={si} className="rounded-xl p-3 ring-1 ring-inset ring-line">
          <div className="flex items-center gap-2">
            <input value={sec.title} onChange={(e) => setSec(si, (s) => ({ ...s, title: e.target.value }))} aria-label="Section title" maxLength={200}
              className={cn(inputClass, "flex-1 py-1.5 font-medium")} />
            {sections.length > 1 && <button type="button" onClick={() => setSections((all) => all.filter((_, n) => n !== si))} className="rounded-md p-1.5 text-ink-faint hover:bg-zinc-100 hover:text-ink" aria-label="Remove section"><X className="h-4 w-4" /></button>}
          </div>
          <ul className="mt-2 divide-y divide-line">
            {sec.items.map((it, ii) => {
              const svc = it.service_id ? byId.get(it.service_id) : null;
              return (
                <li key={ii} className="flex flex-wrap items-center gap-2 py-2">
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="truncate text-[0.8125rem] font-medium text-ink">{svc ? svc.name : it.name ?? "(removed from price list)"}</p>
                    <p className="text-[0.7188rem] text-ink-faint">{svc ? `${money(svc.unit_price, currency)}${svc.unit ? ` / ${svc.unit}` : ""}` : it.unit_price != null ? `${money(it.unit_price, currency)} (one-off line)` : ""}</p>
                  </div>
                  <label className="flex items-center gap-1.5 text-[0.75rem] text-ink-muted">Qty
                    <input type="number" min={0} step="any" value={it.quantity} onChange={(e) => setItem(si, ii, { quantity: Math.max(0, Number(e.target.value) || 0) })}
                      className={cn(inputClass, "w-20 py-1 text-right")} aria-label="Quantity" /></label>
                  <label className="flex items-center gap-1.5 text-[0.75rem] text-ink-muted">
                    <input type="checkbox" checked={!!it.optional} onChange={(e) => setItem(si, ii, { optional: e.target.checked })} className="h-4 w-4 accent-brand-500" />Optional
                  </label>
                  <button type="button" onClick={() => moveItem(si, ii, -1)} disabled={ii === 0} className="rounded-md p-1 text-ink-faint hover:bg-zinc-100 disabled:opacity-30" aria-label="Move up"><ArrowUp className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={() => moveItem(si, ii, 1)} disabled={ii === sec.items.length - 1} className="rounded-md p-1 text-ink-faint hover:bg-zinc-100 disabled:opacity-30" aria-label="Move down"><ArrowDown className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={() => setSec(si, (s) => ({ ...s, items: s.items.filter((_, n) => n !== ii) }))} className="rounded-md p-1 text-ink-faint hover:bg-rose-50 hover:text-rose-700" aria-label="Remove item"><Trash2 className="h-3.5 w-3.5" /></button>
                </li>
              );
            })}
          </ul>
          <select value="" onChange={(e) => { const id = e.target.value; if (id) setSec(si, (s) => ({ ...s, items: [...s.items, { service_id: id, quantity: 1 }] })); }}
            className={cn(inputClass, "mt-2 py-1.5")} aria-label="Add an item from the price list">
            <option value="">+ Add an item from the price list…</option>
            {grouped.map(([cat, list]) => <optgroup key={cat} label={cat}>{list.map((s) => <option key={s.id} value={s.id}>{s.name} — {money(s.unit_price, currency)}{s.unit ? ` / ${s.unit}` : ""}</option>)}</optgroup>)}
          </select>
        </div>
      ))}
      <button type="button" onClick={() => setSections((all) => [...all, { title: "Extras", items: [] }])} className="text-[0.8125rem] font-medium text-brand-700 hover:underline">+ Add another section</button>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-zinc-50 px-3 py-2 text-[0.8125rem]">
        <span className="text-ink-muted">At today&apos;s prices: <b className="text-ink">{money(totals.subtotal, currency)}</b> + GST = <b className="text-ink">{money(totals.total, currency)}</b></span>
        <label className="flex items-center gap-2 text-ink"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 accent-brand-500" />Show on quotes</label>
      </div>
      <FormError message={error} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>{initial && (confirmDelete
          ? <span className="flex items-center gap-2 text-[0.8125rem] text-rose-800">Delete “{initial.name}”? <Button size="sm" variant="danger" onClick={remove} disabled={pending}>Delete</Button><Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>Keep</Button></span>
          : <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)}><Trash2 className="h-3.5 w-3.5" />Delete</Button>)}</div>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
          <Button size="sm" variant="primary" onClick={save} disabled={pending || !name.trim() || !sections.some((s) => s.items.length)}>{pending ? "Saving…" : "Save template"}</Button>
        </div>
      </div>
    </div>
  );
}
