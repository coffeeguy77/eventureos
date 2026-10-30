"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Loader2, Receipt, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/form";
import { jobTotal, JOB_KINDS, JOB_STATUS, JOB_STATUSES, notServicedBrand, type MachineJobKind, type MachineSettings } from "@/lib/machines/core";
import { createMachineJob, invoiceMachineJob, saveMachineJob, type MachineJobInput } from "@/app/(app)/machines/actions";
import { CustomerChooser, type Cust } from "./customer-chooser";
import { ItemsEditor, type PriceRow } from "./items-editor";

const money = (n: number) => `$${n.toFixed(2)}`;
const STEPS = [0.25, 0.5, 1];

/** Create or work a coffee machine job: client, machine, what's wrong, time on the job (callout + hourly), parts, invoice. */
export function MachineJobEditor({ id, initial, settings, customers, priceList, invoice = null, number = null }: {
  id: string | null; initial: MachineJobInput; settings: MachineSettings; customers: Cust[]; priceList: PriceRow[];
  invoice?: { id: string; number: string } | null; number?: string | null;
}) {
  const router = useRouter();
  const [f, setF] = useState<MachineJobInput>({ kind: "repair", callout: true, hours: 0, items: [], ...initial });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = (p: Partial<MachineJobInput>) => setF((o) => ({ ...o, ...p }));
  const kind = (f.kind ?? "repair") as MachineJobKind;
  const items = f.items ?? [];
  const tot = useMemo(() => jobTotal({ kind, hours: Number(f.hours) || 0, callout: f.callout !== false, items: items.filter((i) => i.description && i.qty) }, settings), [kind, f.hours, f.callout, items, settings]);
  const notOurs = f.brand ? notServicedBrand(f.brand, settings) : null;
  const labourN = tot.lines.length - items.filter((i) => i.description && i.qty).length;

  const pickCustomer = (c: Cust | null) => set(c
    ? { customer_id: c.id, contact_name: f.contact_name || c.name, contact_email: f.contact_email || c.email, contact_phone: f.contact_phone || c.phone, company: f.company || c.company, site_address: f.site_address || c.address }
    : { customer_id: null });

  const save = (then?: () => Promise<void>) => start(async () => {
    setMsg(null);
    if (!id) {
      const r = await createMachineJob(f);
      if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
      router.push(`/machines/${r.data}`); return;
    }
    const r = await saveMachineJob(id, f);
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
    if (then) await then(); else setMsg({ ok: true, text: "Saved." });
    router.refresh();
  });
  const invoiceIt = () => save(async () => {
    const r = await invoiceMachineJob(id!);
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
    router.push(`/invoices/${r.data}`);
  });

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-5">
        <Card>
          <CardHeader title="Client" subtitle="Choose an existing client or add a new one." />
          <div className="space-y-3 border-t border-line px-5 py-4">
            <CustomerChooser customers={customers} value={f.customer_id ?? null} onChange={pickCustomer}
              prefill={{ name: f.contact_name ?? "", company: f.company ?? null, email: f.contact_email ?? null, phone: f.contact_phone ?? null, address: f.site_address ?? null }} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label htmlFor="mj-name">Contact on the day</Label><Input id="mj-name" value={f.contact_name ?? ""} onChange={(e) => set({ contact_name: e.target.value })} /></div>
              <div><Label htmlFor="mj-phone">Phone</Label><Input id="mj-phone" type="tel" value={f.contact_phone ?? ""} onChange={(e) => set({ contact_phone: e.target.value })} /></div>
              <div><Label htmlFor="mj-email">Email</Label><Input id="mj-email" type="email" value={f.contact_email ?? ""} onChange={(e) => set({ contact_email: e.target.value })} /></div>
              <div><Label htmlFor="mj-co">Business</Label><Input id="mj-co" value={f.company ?? ""} onChange={(e) => set({ company: e.target.value })} /></div>
              <div className="sm:col-span-2"><Label htmlFor="mj-addr">Where the machine is</Label><Input id="mj-addr" value={f.site_address ?? ""} onChange={(e) => set({ site_address: e.target.value })} placeholder="Street, suburb" /></div>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title={kind === "sale" ? "Machine enquiry" : "The machine"} />
          <div className="grid gap-3 border-t border-line px-5 py-4 sm:grid-cols-3">
            <div><Label htmlFor="mj-brand">Brand</Label><Input id="mj-brand" value={f.brand ?? ""} onChange={(e) => set({ brand: e.target.value })} placeholder="e.g. Dr Coffee" /></div>
            <div><Label htmlFor="mj-model">Model</Label><Input id="mj-model" value={f.model ?? ""} onChange={(e) => set({ model: e.target.value })} /></div>
            <div><Label htmlFor="mj-sn">Serial number</Label><Input id="mj-sn" value={f.serial ?? ""} onChange={(e) => set({ serial: e.target.value })} /></div>
            {notOurs && kind !== "sale" && <p className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-[0.8125rem] font-medium text-rose-800 ring-1 ring-rose-200 sm:col-span-3"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />You don&apos;t service {notOurs} machines (Settings).</p>}
            <div className="sm:col-span-3"><Label htmlFor="mj-issue">{kind === "sale" ? "What they're after" : "What's wrong / what's needed"}</Label><Textarea id="mj-issue" rows={4} value={f.issue ?? ""} onChange={(e) => set({ issue: e.target.value })} /></div>
            {f.preferred && <p className="text-[0.8125rem] text-ink-muted sm:col-span-3"><span className="font-medium text-ink">When suits them:</span> {f.preferred}</p>}
          </div>
        </Card>

        {kind !== "sale" && (
          <Card>
            <CardHeader title="Time on the job" subtitle={`Callout and first hour $${settings.calloutFirstHour} · then $${settings.hourly}/h in ${settings.incrementMin}-minute steps · ${settings.ratesIncGst ? "inc" : "+"} GST`} />
            <div className="space-y-3 border-t border-line px-5 py-4">
              <label className="flex items-center gap-2 text-[0.875rem]"><input type="checkbox" className="h-4 w-4" checked={f.callout !== false} onChange={(e) => set({ callout: e.target.checked })} />Callout (on site) — charges the first hour, however short</label>
              <div className="flex flex-wrap items-end gap-2">
                <div><Label htmlFor="mj-hours">Hours</Label><Input id="mj-hours" type="number" min={0} step="0.25" className="w-28" value={f.hours ?? 0} onChange={(e) => set({ hours: Math.max(0, Number(e.target.value) || 0) })} /></div>
                {STEPS.map((h) => <Button key={h} type="button" size="sm" onClick={() => set({ hours: Math.round(((Number(f.hours) || 0) + h) * 100) / 100 })}>+{h === 1 ? "1 h" : `${h * 60} min`}</Button>)}
                {(Number(f.hours) || 0) > 0 && <Button type="button" size="sm" variant="ghost" onClick={() => set({ hours: 0 })}>Reset</Button>}
              </div>
              {labourN > 0 && (
                <ul className="space-y-1 text-[0.8125rem]">
                  {tot.lines.slice(0, labourN).map((l, k) => <li key={k} className="flex justify-between gap-3"><span className="text-ink-muted">{l.description}</span><span className="tabular-nums text-ink">{money(l.amount)}</span></li>)}
                </ul>
              )}
            </div>
          </Card>
        )}

        <Card>
          <CardHeader title={kind === "sale" ? "Machine and extras" : "Parts and items"} subtitle="From your price list, or a one-off line. Prices include GST." />
          <div className="border-t border-line px-5 py-4">
            <ItemsEditor items={items} onChange={(v) => set({ items: v })} priceList={priceList} first={settings.priceCategories} />
          </div>
        </Card>
      </div>

      <div className="space-y-5">
        <Card className="lg:sticky lg:top-4">
          <div className="space-y-3 px-5 py-4">
            <div className="grid grid-cols-2 gap-3">
              <div><Label htmlFor="mj-kind">Job type</Label><Select id="mj-kind" value={kind} onChange={(e) => set({ kind: e.target.value as MachineJobKind })}>{(Object.keys(JOB_KINDS) as MachineJobKind[]).map((k) => <option key={k} value={k}>{JOB_KINDS[k]}</option>)}</Select></div>
              <div><Label htmlFor="mj-status">Status</Label><Select id="mj-status" value={f.status ?? "new"} onChange={(e) => set({ status: e.target.value as MachineJobInput["status"] })}>{JOB_STATUSES.map((s) => <option key={s} value={s}>{JOB_STATUS[s].label}</option>)}</Select></div>
            </div>
            <div><Label htmlFor="mj-when">Booked for</Label><Input id="mj-when" type="datetime-local" value={f.booked_for ? toLocal(f.booked_for) : ""} onChange={(e) => set({ booked_for: e.target.value ? new Date(e.target.value).toISOString() : null })} /></div>
            <div className="space-y-1 border-t border-line pt-3 text-[0.8125rem]">
              <div className="flex justify-between text-ink-muted"><span>Ex GST</span><span className="tabular-nums">{money(tot.exGst)}</span></div>
              <div className="flex justify-between text-ink-muted"><span>GST</span><span className="tabular-nums">{money(tot.gst)}</span></div>
              <div className="flex justify-between text-[1.0625rem] font-semibold text-ink"><span>Total</span><span className="tabular-nums">{money(tot.total)}</span></div>
            </div>
            <div className="flex flex-col gap-2">
              <Button variant="primary" disabled={pending} onClick={() => save()}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{id ? "Save" : "Create job"}</Button>
              {id && (invoice
                ? <Link href={`/invoices/${invoice.id}`} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg text-[0.875rem] font-semibold text-brand-700 ring-1 ring-line hover:bg-canvas"><Receipt className="h-4 w-4" />Invoice {invoice.number}</Link>
                : <Button disabled={pending || !(tot.total > 0)} onClick={invoiceIt}><Receipt className="h-4 w-4" />Save and create invoice</Button>)}
            </div>
            {msg && <p className={`flex items-center gap-1.5 text-[0.8125rem] ${msg.ok ? "text-emerald-700" : "text-rose-600"}`}>{msg.ok && <Check className="h-4 w-4" />}{msg.text}</p>}
            {number && <p className="text-[0.75rem] text-ink-faint">Job {number}</p>}
          </div>
        </Card>
        <Card>
          <div className="px-5 py-4"><Label htmlFor="mj-notes">Internal notes</Label><Textarea id="mj-notes" rows={4} value={f.internal_notes ?? ""} onChange={(e) => set({ internal_notes: e.target.value })} placeholder="Only you see these" /></div>
        </Card>
      </div>
    </div>
  );
}

function toLocal(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
