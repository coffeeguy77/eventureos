"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { History, Loader2, Mail, Pencil, Plus, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/form";
import { findSenders, saveSupplier, syncInvoices, type SupplierInput } from "@/app/(app)/pricing/actions";

export type SupplierRow = {
  id: string; name: string; match_from: string[]; match_subject: string | null; match_exclude: string[]; parser: string; active: boolean;
  min_order: number | null; free_delivery_over: number | null; delivery_fee: number | null; rep_name: string | null; rep_email: string | null; rep_phone: string | null; notes: string | null;
  last_synced_at: string | null; invoices: number; lines: number; last_invoice: string | null;
};
type Sender = { email: string; name: string | null; domain: string; count: number; subject: string | null; last: string | null };

const blank = (): SupplierInput => ({ name: "", match_from: [], match_subject: "", match_exclude: ["Statement"], parser: "auto", active: true });

/** Suppliers: who sends invoices, from which address; reading new and past invoices from Gmail. */
export function Suppliers({ initial, gmail, today }: { initial: SupplierRow[]; gmail: boolean; today: string }) {
  const router = useRouter();
  const [edit, setEdit] = useState<{ id: string | null; f: SupplierInput } | null>(null);
  const [senders, setSenders] = useState<Sender[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [from, setFrom] = useState(() => { const d = new Date(today + "T00:00:00Z"); d.setUTCFullYear(d.getUTCFullYear() - 2); return d.toISOString().slice(0, 10); });
  const [pending, start] = useTransition();

  const save = () => start(async () => {
    if (!edit) return;
    setMsg(null);
    const r = await saveSupplier(edit.id, edit.f);
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
    setEdit(null); setMsg({ ok: true, text: "Saved. Use “Read new invoices” or “Import history” to bring in their invoices." }); router.refresh();
  });
  const discover = async () => {
    setBusy("find"); setMsg(null);
    const r = await findSenders();
    setBusy(null);
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
    setSenders(r.data);
  };
  // reading runs in ~45-second rounds; keep going until it's done
  const run = async (key: string, opts: { supplierId?: string; historyFrom?: string }) => {
    setBusy(key); setMsg(null); setLog([]);
    let total = { imported: 0, duplicates: 0, skipped: 0, failed: 0 };
    for (let round = 0; round < 60; round++) {
      const r = await syncInvoices(opts);
      if (!r.ok) { setMsg({ ok: false, text: r.error }); break; }
      total = { imported: total.imported + r.data.imported, duplicates: total.duplicates + r.data.duplicates, skipped: total.skipped + r.data.skipped, failed: total.failed + r.data.failed };
      setLog((l) => [...l, ...r.data.lines].slice(-60));
      setMsg({ ok: true, text: `${r.data.more ? "Still reading… " : "Done. "}${total.imported} invoice${total.imported === 1 ? "" : "s"} read${total.duplicates ? `, ${total.duplicates} already in` : ""}${total.skipped ? `, ${total.skipped} skipped` : ""}${total.failed ? `, ${total.failed} couldn't be read` : ""}.` });
      if (!r.data.more) break;
    }
    setBusy(null); router.refresh();
  };
  const addFromSender = (s: Sender) => {
    const exists = initial.find((x) => x.match_from.includes(s.email) || x.match_from.includes(`@${s.domain}`));
    if (exists) { setEdit({ id: exists.id, f: { ...exists } }); return; }
    const name = (s.name ?? s.domain.split(".")[0]).replace(/\b(accounts?|invoices?|billing|noreply|no-reply)\b/gi, "").replace(/[<>"]/g, "").trim() || s.domain;
    setEdit({ id: null, f: { ...blank(), name, match_from: [s.email] } });
  };
  const f = edit?.f;
  const set = (patch: Partial<SupplierInput>) => setEdit((e) => (e ? { ...e, f: { ...e.f, ...patch } } : e));

  return (
    <div className="space-y-5">
      {!gmail && <p className="rounded-lg bg-amber-50 px-4 py-3 text-[0.8125rem] text-amber-900">Connect Gmail (Settings → Integrations) to read invoices from your email. You can still upload invoice PDFs on the Invoices tab.</p>}
      <Card>
        <CardHeader title="Suppliers" subtitle="Who you buy from, and the address their invoices come from. Only suppliers you add here are read — nothing else in your email."
          action={<div className="flex flex-wrap gap-2">
            {gmail && <Button size="sm" disabled={!!busy} onClick={discover}>{busy === "find" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}Find suppliers in Gmail</Button>}
            <Button size="sm" variant="primary" onClick={() => setEdit({ id: null, f: blank() })}><Plus className="h-4 w-4" />Add a supplier</Button>
          </div>} />
        {senders && (
          <div className="border-t border-line bg-zinc-50/60 px-5 py-4">
            <p className="text-[0.8125rem] font-medium text-ink">Who&apos;s emailed you PDF invoices in the last year</p>
            <p className="text-[0.75rem] text-ink-muted">Pick the ones that are suppliers. Customers paying you, software subscriptions and the like can be ignored.</p>
            {!senders.length ? <p className="mt-2 text-[0.8125rem] text-ink-muted">None found.</p> : (
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {senders.map((s) => {
                  const added = initial.some((x) => x.match_from.includes(s.email) || x.match_from.includes(`@${s.domain}`));
                  return (
                    <li key={s.email} className="flex items-center gap-3 rounded-lg bg-surface p-2.5 ring-1 ring-line">
                      <Mail className="h-4 w-4 shrink-0 text-ink-faint" />
                      <span className="min-w-0 flex-1"><span className="block truncate text-[0.8125rem] font-medium text-ink">{s.name ?? s.email}</span><span className="block truncate text-[0.7188rem] text-ink-faint">{s.email} · {s.count} email{s.count === 1 ? "" : "s"}{s.subject ? ` · “${s.subject}”` : ""}</span></span>
                      <Button size="sm" variant={added ? "ghost" : "secondary"} onClick={() => addFromSender(s)}>{added ? "Added" : "Add"}</Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
        {edit && f && (
          <div className="grid gap-3 border-t border-line px-5 py-4 sm:grid-cols-2">
            <div><Label htmlFor="ps-name">Supplier</Label><Input id="ps-name" value={f.name} maxLength={120} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Five Senses Coffee" /></div>
            <div><Label htmlFor="ps-from" hint="addresses or @domain, comma separated">Invoices come from</Label><Input id="ps-from" value={Array.isArray(f.match_from) ? f.match_from.join(", ") : f.match_from} onChange={(e) => set({ match_from: e.target.value })} placeholder="accounts@supplier.com.au" /></div>
            <div><Label htmlFor="ps-subj" hint="optional">Subject contains</Label><Input id="ps-subj" value={f.match_subject ?? ""} maxLength={120} onChange={(e) => set({ match_subject: e.target.value })} placeholder="e.g. Tax Invoice" /></div>
            <div><Label htmlFor="ps-ex" hint="comma separated">Skip subjects containing</Label><Input id="ps-ex" value={Array.isArray(f.match_exclude) ? f.match_exclude.join(", ") : f.match_exclude ?? ""} onChange={(e) => set({ match_exclude: e.target.value })} placeholder="Statement, Remittance" /></div>
            <div><Label htmlFor="ps-parser">How to read their invoices</Label>
              <Select id="ps-parser" value={f.parser ?? "auto"} onChange={(e) => set({ parser: e.target.value })}>
                <option value="auto">Automatic (layout first, then AI)</option><option value="ai">Always use AI</option><option value="bidfood">Bidfood layout</option><option value="fresho">Fresho layout</option><option value="longpark">LongPark layout</option>
              </Select></div>
            <label className="flex items-end gap-2 pb-2 text-[0.8125rem] text-ink"><input type="checkbox" className="h-4 w-4" checked={f.active !== false} onChange={(e) => set({ active: e.target.checked })} />Read their invoices</label>
            <div className="grid grid-cols-3 gap-2 sm:col-span-2">
              <div><Label htmlFor="ps-min" hint="$">Minimum order</Label><Input id="ps-min" type="number" min={0} step="0.01" value={f.min_order ?? ""} onChange={(e) => set({ min_order: e.target.value })} /></div>
              <div><Label htmlFor="ps-free" hint="$">Free delivery over</Label><Input id="ps-free" type="number" min={0} step="0.01" value={f.free_delivery_over ?? ""} onChange={(e) => set({ free_delivery_over: e.target.value })} /></div>
              <div><Label htmlFor="ps-fee" hint="$">Delivery fee</Label><Input id="ps-fee" type="number" min={0} step="0.01" value={f.delivery_fee ?? ""} onChange={(e) => set({ delivery_fee: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:col-span-2">
              <div><Label htmlFor="ps-rep">Rep</Label><Input id="ps-rep" value={f.rep_name ?? ""} maxLength={120} onChange={(e) => set({ rep_name: e.target.value })} /></div>
              <div><Label htmlFor="ps-repe">Rep email</Label><Input id="ps-repe" type="email" value={f.rep_email ?? ""} onChange={(e) => set({ rep_email: e.target.value })} /></div>
              <div><Label htmlFor="ps-repp">Rep phone</Label><Input id="ps-repp" value={f.rep_phone ?? ""} onChange={(e) => set({ rep_phone: e.target.value })} /></div>
            </div>
            <div className="sm:col-span-2"><Label htmlFor="ps-notes" hint="optional">Notes</Label><Textarea id="ps-notes" rows={2} value={f.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} placeholder="Order days, account number reference, agreed prices…" /></div>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <Button variant="primary" disabled={pending || !f.name.trim()} onClick={save}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Save supplier</Button>
              <Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button>
            </div>
          </div>
        )}
        <ul className="divide-y divide-line border-t border-line">
          {initial.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-[0.875rem] font-medium text-ink">{s.name}{!s.active && <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-[0.6875rem] text-ink-muted">paused</span>}</p>
                <p className="truncate text-[0.75rem] text-ink-faint">{s.match_from.join(", ") || "No email address yet"}{s.match_subject ? ` · subject “${s.match_subject}”` : ""} · {s.invoices} invoice{s.invoices === 1 ? "" : "s"}, {s.lines} prices{s.last_invoice ? ` · latest ${s.last_invoice}` : ""}</p>
              </div>
              {gmail && s.match_from.length > 0 && <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => run(s.id, { supplierId: s.id })}>{busy === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Read new</Button>}
              <Button size="sm" variant="ghost" onClick={() => setEdit({ id: s.id, f: { ...s } })}><Pencil className="h-4 w-4" />Edit</Button>
            </li>
          ))}
          {!initial.length && <li className="px-5 py-6 text-center text-[0.8125rem] text-ink-muted">No suppliers yet.{gmail ? " Try “Find suppliers in Gmail”." : ""}</li>}
        </ul>
      </Card>

      {gmail && initial.length > 0 && (
        <Card className="p-5">
          <p className="text-[0.875rem] font-semibold text-ink">Read invoices from Gmail</p>
          <p className="mt-0.5 text-[0.75rem] text-ink-muted">New invoices are read every day. Import history to bring in past invoices so you can see how prices have moved. It runs in rounds — leave this page open until it says Done.</p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <Button disabled={!!busy} onClick={() => run("new", {})}>{busy === "new" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Read new invoices</Button>
            <span className="mx-1 text-ink-faint">·</span>
            <div><Label htmlFor="ps-hist">Import history from</Label><Input id="ps-hist" type="date" value={from} max={today} onChange={(e) => setFrom(e.target.value)} className="w-44" /></div>
            <Button variant="primary" disabled={!!busy || !from} onClick={() => run("history", { historyFrom: from })}>{busy === "history" ? <Loader2 className="h-4 w-4 animate-spin" /> : <History className="h-4 w-4" />}Import history</Button>
          </div>
        </Card>
      )}
      {msg && <p role="status" className={`text-[0.8125rem] font-medium ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}</p>}
      {log.length > 0 && <Card className="p-4"><ul className="max-h-72 space-y-1 overflow-y-auto text-[0.75rem] text-ink-muted">{log.map((l, i) => <li key={i}>{l}</li>)}</ul></Card>}
    </div>
  );
}
