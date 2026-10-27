"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Download, FileUp, Loader2, Plus, Receipt, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/form";
import { createClient } from "@/lib/supabase/client";
import { priceJob, type Extra, type PrintItem, type PrintRates } from "@/lib/printing/core";
import { PRINT_STATUS } from "@/lib/printing/status";
import { createPrintJob, deletePrintFile, emailPrintQuote, invoicePrintJob, recordStaffFiles, savePrintJob, type JobInput, type JobStatus } from "@/app/(app)/printing/actions";

const money = (n: number) => `$${n.toFixed(2)}`;
const blank: PrintItem = { description: "", width_m: 0, length_m: 0, qty: 1, cut: false };
type FileRow = { id: string; name: string; size: number | null; uploaded_by: string; created_at: string; url: string | null };

export function JobEditor({ id, orgId, initial, rates, files = [], invoice = null, quoteSentAt = null, customerHref = null }: {
  id: string | null; orgId: string; initial: JobInput; rates: PrintRates; files?: FileRow[];
  invoice?: { id: string; number: string } | null; quoteSentAt?: string | null; customerHref?: string | null;
}) {
  const router = useRouter();
  // older jobs had one "cutting" tick for the whole job: carry it onto each print
  const [f, setF] = useState<JobInput>({ ...initial, cut: false, items: initial.items?.length ? initial.items.map((i) => ({ ...i, cut: i.cut ?? !!initial.cut })) : [blank], extras: initial.extras ?? [] });
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [upl, setUpl] = useState<string | null>(null);
  const [askDel, setAskDel] = useState<string | null>(null);
  const pick = useRef<HTMLInputElement>(null);
  const set = (p: Partial<JobInput>) => setF((o) => ({ ...o, ...p }));
  const items = f.items ?? [], extras = f.extras ?? [];
  const setItem = (k: number, p: Partial<PrintItem>) => set({ items: items.map((x, j) => (j === k ? { ...x, ...p } : x)) });
  const setExtra = (k: number, p: Partial<Extra>) => set({ extras: extras.map((x, j) => (j === k ? { ...x, ...p } : x)) });
  const price = useMemo(() => priceJob({ items: items.filter((i) => i.length_m > 0), setup: f.setup !== false, cut: false, extras: extras.filter((e) => e.description && e.amount) }, rates), [items, extras, f.setup, rates]);

  const save = (then?: () => Promise<void>) => start(async () => {
    setMsg(null);
    if (!id) {
      const r = await createPrintJob(f);
      if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
      router.push(`/printing/${r.data}`); return;
    }
    const r = await savePrintJob(id, f);
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
    if (then) await then(); else setMsg({ ok: true, text: "Saved." });
    router.refresh();
  });
  const sendQuote = () => save(async () => {
    const r = await emailPrintQuote(id!, note);
    setMsg(r.ok ? { ok: true, text: r.data } : { ok: false, text: r.error });
    if (r.ok) { setNote(""); if (f.status === "new") set({ status: "quoted" }); }
  });
  const invoiceIt = () => save(async () => {
    const r = await invoicePrintJob(id!);
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
    router.push(`/invoices/${r.data}`);
  });
  const upload = async (list: FileList | null) => {
    if (!id || !list?.length) return;
    setMsg(null);
    const supabase = createClient();
    const sent: { name: string; path: string; size: number; type: string }[] = [];
    try {
      const arr = Array.from(list).slice(0, 20);
      for (let k = 0; k < arr.length; k++) {
        const file = arr[k];
        setUpl(`Uploading ${k + 1} of ${arr.length}…`);
        const path = `${orgId}/${id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${file.name.replace(/[^\w.() -]+/g, "_").slice(-120)}`;
        const { error } = await supabase.storage.from("print-artwork").upload(path, file, { contentType: file.type || "application/octet-stream" });
        if (error) throw new Error(`${file.name}: ${error.message}`);
        sent.push({ name: file.name, path, size: file.size, type: file.type });
      }
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Upload failed." }); }
    if (sent.length) { const r = await recordStaffFiles(id, sent); if (!r.ok) setMsg({ ok: false, text: r.error }); }
    setUpl(null); router.refresh();
  };
  const removeFile = (fileId: string) => start(async () => { const r = await deletePrintFile(fileId); if (!r.ok) setMsg({ ok: false, text: r.error }); router.refresh(); });

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-5">
        <Card>
          <CardHeader title="The job" />
          <div className="space-y-3 border-t border-line px-5 py-4">
            <div><Label htmlFor="pj-t">Job</Label><Input id="pj-t" value={f.title ?? ""} maxLength={120} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. 2 pull-up banners" /></div>
            <div><Label htmlFor="pj-d" hint="what the customer asked for">Details</Label><Textarea id="pj-d" rows={3} value={f.details ?? ""} onChange={(e) => set({ details: e.target.value })} /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label htmlFor="pj-s">Status</Label><Select id="pj-s" value={f.status ?? "new"} onChange={(e) => set({ status: e.target.value as JobStatus })}>{Object.entries(PRINT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></div>
              <div><Label htmlFor="pj-n">Needed by</Label><Input id="pj-n" type="date" value={f.needed_by ?? ""} onChange={(e) => set({ needed_by: e.target.value })} /></div>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Sizes and price" subtitle={`Printing $${rates.printMetre}/m · cutting $${rates.cutFirst} first metre, $${rates.cutMetre}/m after · setup $${rates.setup} · roll ${rates.rollWidth} m · + GST`} />
          <div className="space-y-2 border-t border-line px-5 py-4">
            <div className="hidden grid-cols-[minmax(0,1fr)_80px_80px_64px_44px_32px] gap-2 text-[0.7188rem] font-medium text-ink-muted sm:grid"><span>What</span><span>Width (m)</span><span>Length (m)</span><span>Qty</span><span>Cut</span><span /></div>
            {items.map((it, k) => (
              <div key={k} className="grid grid-cols-[minmax(0,1fr)_80px_80px_64px_44px_32px] items-center gap-2">
                <Input aria-label="What" value={it.description} onChange={(e) => setItem(k, { description: e.target.value })} placeholder="e.g. Vinyl banner" />
                <Input aria-label="Width in metres" type="number" min={0} step="0.01" value={it.width_m || ""} onChange={(e) => setItem(k, { width_m: Number(e.target.value) })} />
                <Input aria-label="Length in metres" type="number" min={0} step="0.01" value={it.length_m || ""} onChange={(e) => setItem(k, { length_m: Number(e.target.value) })} />
                <Input aria-label="Quantity" type="number" min={1} value={it.qty} onChange={(e) => setItem(k, { qty: Math.max(1, Number(e.target.value) || 1) })} />
                <label className="grid h-9 place-items-center" title="Cut to shape"><input type="checkbox" aria-label="Cut to shape" className="h-4 w-4" checked={!!it.cut} onChange={(e) => setItem(k, { cut: e.target.checked })} /></label>
                <button type="button" aria-label="Remove size" onClick={() => set({ items: items.length > 1 ? items.filter((_, j) => j !== k) : [blank] })} className="grid h-9 place-items-center text-ink-faint hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            <button type="button" onClick={() => set({ items: [...items, blank] })} className="inline-flex items-center gap-1 text-[0.8125rem] font-semibold text-brand-600"><Plus className="h-4 w-4" />Add a size</button>
            <div className="flex flex-wrap gap-4 pt-2 text-[0.8125rem]">
              <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4" checked={f.setup !== false} onChange={(e) => set({ setup: e.target.checked })} />Setup (${rates.setup})</label>
            </div>
            {price.tooWide.length > 0 && <p className="text-[0.75rem] text-amber-800">{price.tooWide.length === 1 ? "One print is" : `${price.tooWide.length} prints are`} wider than the {rates.rollWidth} m roll — split it into panels (add each panel as its own size).</p>}
            <p className="pt-2 text-[0.75rem] font-medium text-ink-muted">Extra charges (ex GST) — eyelets, laminating, design time, a discount (negative)…</p>
            {extras.map((x, k) => (
              <div key={k} className="grid grid-cols-[minmax(0,1fr)_110px_32px] items-center gap-2">
                <Input aria-label="Extra description" value={x.description} onChange={(e) => setExtra(k, { description: e.target.value })} />
                <Input aria-label="Extra amount" type="number" step="0.01" value={x.amount || ""} onChange={(e) => setExtra(k, { amount: Number(e.target.value) })} />
                <button type="button" aria-label="Remove extra" onClick={() => set({ extras: extras.filter((_, j) => j !== k) })} className="grid h-9 place-items-center text-ink-faint hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            <button type="button" onClick={() => set({ extras: [...extras, { description: "", amount: 0 }] })} className="inline-flex items-center gap-1 text-[0.8125rem] font-semibold text-brand-600"><Plus className="h-4 w-4" />Add an extra</button>
          </div>
          <div className="border-t border-line px-5 py-4 text-[0.8125rem]">
            {price.lines.length ? <ul className="space-y-1">{price.lines.map((l, k) => <li key={k} className="flex justify-between gap-3"><span className="text-ink-muted">{l.description}</span><span className="tabular-nums">{money(l.amount)}</span></li>)}</ul> : <p className="text-ink-muted">Add a size to see the price.</p>}
            <div className="mt-2 space-y-0.5 border-t border-line pt-2">
              <p className="flex justify-between"><span>{price.metres ? `${price.metres} lineal m${price.cutMetres ? ` (${price.cutMetres} m cut)` : ""} · ` : ""}Subtotal</span><span className="tabular-nums">{money(price.exGst)}</span></p>
              <p className="flex justify-between"><span>GST</span><span className="tabular-nums">{money(price.gst)}</span></p>
              <p className="flex justify-between text-[0.9375rem] font-semibold"><span>Total</span><span className="tabular-nums">{money(price.total)}</span></p>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Internal notes" subtitle="Only your team sees these." />
          <div className="border-t border-line px-5 py-4"><Textarea aria-label="Internal notes" rows={3} value={f.internal_notes ?? ""} onChange={(e) => set({ internal_notes: e.target.value })} placeholder="Stock, finishing, who's printing it…" /></div>
        </Card>
      </div>

      <div className="space-y-5">
        <Card>
          <CardHeader title="Customer" action={customerHref ? <Link href={customerHref} className="text-[0.75rem] font-medium text-brand-600 underline">Client page</Link> : undefined} />
          <div className="space-y-3 border-t border-line px-5 py-4">
            <div><Label htmlFor="pj-cn">Name</Label><Input id="pj-cn" value={f.contact_name ?? ""} onChange={(e) => set({ contact_name: e.target.value })} /></div>
            <div><Label htmlFor="pj-co" hint="optional">Company</Label><Input id="pj-co" value={f.company ?? ""} onChange={(e) => set({ company: e.target.value })} /></div>
            <div><Label htmlFor="pj-ce">Email</Label><Input id="pj-ce" type="email" value={f.contact_email ?? ""} onChange={(e) => set({ contact_email: e.target.value })} /></div>
            <div><Label htmlFor="pj-cp">Phone</Label><Input id="pj-cp" type="tel" value={f.contact_phone ?? ""} onChange={(e) => set({ contact_phone: e.target.value })} /></div>
          </div>
        </Card>

        <Card>
          <div className="space-y-2 px-5 py-4">
            <Button variant="primary" className="w-full" disabled={pending} onClick={() => save()}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{id ? "Save" : "Create job"}</Button>
            {id && <>
              <Textarea aria-label="Note with the quote" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note with the quote (optional)" />
              <Button className="w-full" disabled={pending || !f.contact_email} onClick={sendQuote}><Send className="h-4 w-4" />{quoteSentAt ? "Email the quote again" : "Email the quote"}</Button>
              {quoteSentAt && <p className="text-[0.7188rem] text-ink-muted">Quote last emailed {new Date(quoteSentAt).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}. The customer can approve it from the email.</p>}
              {invoice ? <Link href={`/invoices/${invoice.id}`} className="flex items-center justify-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-[0.8125rem] font-medium text-emerald-800"><Receipt className="h-4 w-4" />Invoice {invoice.number}</Link>
                : <Button className="w-full" disabled={pending} onClick={invoiceIt}><Receipt className="h-4 w-4" />Create invoice</Button>}
            </>}
            {msg && <p role="status" className={`text-[0.8125rem] font-medium ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}</p>}
          </div>
        </Card>

        {id && (
          <Card>
            <CardHeader title="Artwork" subtitle="Files the customer sent, and any you add." />
            <div className="space-y-2 border-t border-line px-5 py-4">
              {files.length ? <ul className="space-y-1.5">{files.map((x) => (
                <li key={x.id} className="flex items-center gap-2 text-[0.8125rem]">
                  <span className="min-w-0 flex-1 truncate">{x.name}<span className="text-ink-faint"> · {x.size ? `${(x.size / 1_048_576).toFixed(1)} MB · ` : ""}{x.uploaded_by === "customer" ? "customer" : "staff"}</span></span>
                  {x.url && <a href={x.url} className="text-ink-muted hover:text-ink" aria-label={`Download ${x.name}`}><Download className="h-4 w-4" /></a>}
                  {askDel === x.id
                    ? <span className="flex items-center gap-2 text-[0.75rem]"><button type="button" disabled={pending} onClick={() => { setAskDel(null); removeFile(x.id); }} className="font-semibold text-rose-700">Delete</button><button type="button" onClick={() => setAskDel(null)} className="text-ink-muted">Keep</button></span>
                    : <button type="button" disabled={pending} onClick={() => setAskDel(x.id)} aria-label={`Delete ${x.name}`} className="text-ink-faint hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>}
                </li>
              ))}</ul> : <p className="text-[0.8125rem] text-ink-muted">No artwork yet.</p>}
              <input ref={pick} type="file" multiple className="hidden" onChange={(e) => { void upload(e.target.files); e.target.value = ""; }} />
              <Button size="sm" disabled={!!upl} onClick={() => pick.current?.click()}>{upl ? <><Loader2 className="h-4 w-4 animate-spin" />{upl}</> : <><FileUp className="h-4 w-4" />Add files</>}</Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
