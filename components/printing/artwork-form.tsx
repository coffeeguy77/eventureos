"use client";

import { useMemo, useRef, useState } from "react";
import { CheckCircle2, FileUp, Loader2, Plus, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { priceJob, type PrintItem, type PrintRates } from "@/lib/printing/core";

const ARTWORK = /\.(pdf|ai|eps|svg|png|jpe?g|tiff?|psd|zip|cdr|indd|webp|gif)$/i;
const input = "h-12 w-full rounded-xl border border-[#E4DCD5] bg-white px-4 text-[1rem] text-[#151312] outline-none focus:border-[var(--pk)]";
const money = (n: number) => `$${n.toFixed(2)}`;

/** Send a print job: what you need, sizes (for a price estimate) and your artwork files. */
export function ArtworkForm({ slug, rates }: { slug: string; rates: PrintRates }) {
  const [me, setMe] = useState({ name: "", email: "", phone: "", company: "", details: "", neededBy: "", website: "" });
  const [items, setItems] = useState<PrintItem[]>([{ description: "", width_m: 0, length_m: 0, qty: 1 }]);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ number: string; files: number } | null>(null);
  const loaded = useRef(Date.now());
  const pick = useRef<HTMLInputElement>(null);
  const priced = useMemo(() => priceJob({ items: items.filter((i) => i.length_m > 0), setup: true, cut: false }, rates), [items, rates]);
  const setItem = (k: number, p: Partial<PrintItem>) => setItems(items.map((x, j) => (j === k ? { ...x, ...p } : x)));
  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const ok: File[] = [];
    for (const f of Array.from(list)) {
      if (!ARTWORK.test(f.name)) { setErr(`${f.name}: please send PDF, AI, EPS, SVG, PNG, JPG, TIFF, PSD or ZIP files.`); continue; }
      if (f.size > 200 * 1024 * 1024) { setErr(`${f.name} is over 200 MB.`); continue; }
      ok.push(f);
    }
    setFiles((cur) => [...cur, ...ok].slice(0, 20));
  };
  const send = async () => {
    setErr(null);
    if (!me.name.trim() || !me.email.trim()) { setErr("Please add your name and email."); return; }
    if (!files.length && !me.details.trim()) { setErr("Add your artwork files, or tell us what you need."); return; }
    setBusy("Sending your job…");
    try {
      const start = await fetch("/api/public/printing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        slug, ...me, items: items.filter((i) => i.length_m > 0), cut: false, t: loaded.current, files: files.map((f) => ({ name: f.name, size: f.size, type: f.type })),
      }) }).then((r) => r.json());
      if (!start.ok) throw new Error(start.error ?? "Couldn't send — please try again.");
      if (!start.jobId) { setDone({ number: "", files: 0 }); return; }
      const supabase = createClient();
      const sent: { name: string; path: string; size: number; type: string }[] = [];
      for (let k = 0; k < start.uploads.length; k++) {
        const u = start.uploads[k] as { name: string; path: string; token: string };
        const f = files[k];
        setBusy(`Uploading ${k + 1} of ${start.uploads.length}: ${f.name}…`);
        const { error } = await supabase.storage.from("print-artwork").uploadToSignedUrl(u.path, u.token, f, { contentType: f.type || "application/octet-stream" });
        if (error) throw new Error(`${f.name} didn't upload: ${error.message}`);
        sent.push({ name: f.name, path: u.path, size: f.size, type: f.type });
      }
      setBusy("Finishing…");
      const fin = await fetch("/api/public/printing/done", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId: start.jobId, token: start.token, files: sent }) }).then((r) => r.json());
      if (!fin.ok) throw new Error(fin.error ?? "Couldn't finish — please contact us.");
      setDone({ number: fin.number, files: fin.files });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong — please try again.");
    } finally { setBusy(null); }
  };

  if (done) return (
    <div className="rounded-3xl bg-white p-8 text-center ring-1 ring-[#EFE6DF]">
      <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
      <p className="mt-4 text-[1.5rem] font-semibold">Thanks{me.name ? `, ${me.name.split(" ")[0]}` : ""}!</p>
      <p className="mt-2 text-[1.0625rem] text-[#5E5853]">{done.number ? <>Your print job <strong>{done.number}</strong> {done.files ? `and ${done.files} file${done.files === 1 ? "" : "s"} ` : ""}arrived.</> : "Your job arrived."} We&apos;ll check the artwork and send you a quote.</p>
    </div>
  );

  return (
    <div className="space-y-5 rounded-3xl bg-white p-5 ring-1 ring-[#EFE6DF] sm:p-8">
      <div className="grid gap-3 sm:grid-cols-2">
        <input aria-label="Your name" placeholder="Your name *" value={me.name} onChange={(e) => setMe({ ...me, name: e.target.value })} className={input} />
        <input aria-label="Email" type="email" placeholder="Email *" value={me.email} onChange={(e) => setMe({ ...me, email: e.target.value })} className={input} />
        <input aria-label="Phone" type="tel" placeholder="Phone" value={me.phone} onChange={(e) => setMe({ ...me, phone: e.target.value })} className={input} />
        <input aria-label="Company" placeholder="Company (optional)" value={me.company} onChange={(e) => setMe({ ...me, company: e.target.value })} className={input} />
      </div>
      <textarea aria-label="What do you need?" rows={3} placeholder="What do you need? e.g. 2 pull-up banners for a trade show, a vinyl sticker for a coffee cart…" value={me.details} onChange={(e) => setMe({ ...me, details: e.target.value })} className={`${input} h-auto py-3`} />
      <input tabIndex={-1} aria-hidden="true" autoComplete="off" value={me.website} onChange={(e) => setMe({ ...me, website: e.target.value })} className="hidden" />

      <div>
        <p className="text-[0.9375rem] font-semibold">Sizes <span className="font-normal text-[#5E5853]">(optional — for a price estimate)</span></p>
        <div className="mt-2 space-y-2">
          {items.map((it, k) => (
            <div key={k} className="rounded-2xl bg-[#FAF6F2] p-3">
              <div className="flex items-center gap-2">
                <input aria-label="What is it" placeholder="What is it? e.g. Banner" value={it.description} onChange={(e) => setItem(k, { description: e.target.value })} className={`${input} h-11 min-w-0 flex-1 px-3 text-[1rem]`} />
                <button type="button" aria-label="Remove this size" onClick={() => setItems(items.length > 1 ? items.filter((_, j) => j !== k) : [{ description: "", width_m: 0, length_m: 0, qty: 1 }])} className="grid h-11 w-10 shrink-0 place-items-center text-[#8C847D] hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <label className="block"><span className="mb-1 block text-[0.75rem] font-medium text-[#5E5853]">Width (m)</span><input inputMode="decimal" type="number" min={0} step="0.01" placeholder="1.2" value={it.width_m || ""} onChange={(e) => setItem(k, { width_m: Number(e.target.value) })} className={`${input} h-11 px-3 text-[1rem]`} /></label>
                <label className="block"><span className="mb-1 block text-[0.75rem] font-medium text-[#5E5853]">Length (m)</span><input inputMode="decimal" type="number" min={0} step="0.01" placeholder="2" value={it.length_m || ""} onChange={(e) => setItem(k, { length_m: Number(e.target.value) })} className={`${input} h-11 px-3 text-[1rem]`} /></label>
                <label className="block"><span className="mb-1 block text-[0.75rem] font-medium text-[#5E5853]">How many</span><input inputMode="numeric" type="number" min={1} value={it.qty} onChange={(e) => setItem(k, { qty: Math.max(1, Number(e.target.value) || 1) })} className={`${input} h-11 px-3 text-[1rem]`} /></label>
              </div>
              <label className="mt-2 flex items-center gap-2 text-[0.9375rem]"><input type="checkbox" className="h-5 w-5 accent-[var(--pk)]" checked={!!it.cut} onChange={(e) => setItem(k, { cut: e.target.checked })} />Cut to shape <span className="text-[#8C847D]">(stickers, decals, lettering)</span></label>
            </div>
          ))}
          <button type="button" onClick={() => setItems([...items, { description: "", width_m: 0, length_m: 0, qty: 1 }])} className="inline-flex items-center gap-1 text-[0.875rem] font-semibold text-[var(--pk)]"><Plus className="h-4 w-4" />Another size</button>
        </div>
        {priced.tooWide.length > 0 && <p className="mt-2 text-[0.875rem] text-amber-800">Wider than our {rates.rollWidth} m roll — we&apos;ll print it in panels and include that in the quote.</p>}
        {priced.metres > 0 && <p className="mt-2 text-[0.9375rem] text-[#3A3431]">Estimate: <strong>{money(priced.total)}</strong> inc GST <span className="text-[#8C847D]">({priced.metres} lineal metre{priced.metres === 1 ? "" : "s"}{priced.cutMetres ? `, ${priced.cutMetres} m cut` : ""} · {money(priced.exGst)} + GST)</span>. We&apos;ll confirm after checking your artwork.</p>}
      </div>

      <div>
        <p className="text-[0.9375rem] font-semibold">Artwork</p>
        <input ref={pick} type="file" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        <button type="button" onClick={() => pick.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
          className="mt-2 flex w-full flex-col items-center gap-1 rounded-2xl border-2 border-dashed border-[#E4DCD5] px-4 py-8 text-[#5E5853] hover:border-[var(--pk)]">
          <FileUp className="h-7 w-7" /><span className="font-semibold text-[#151312]">Drop files here or tap to choose</span><span className="text-[0.8125rem]">PDF, AI, EPS, SVG, PNG, JPG, TIFF, PSD or ZIP · up to 200 MB each</span>
        </button>
        {files.length > 0 && <ul className="mt-2 space-y-1">{files.map((f, k) => <li key={k} className="flex items-center justify-between rounded-lg bg-[#FAF6F2] px-3 py-2 text-[0.875rem]"><span className="truncate">{f.name} <span className="text-[#8C847D]">· {(f.size / 1_048_576).toFixed(1)} MB</span></span><button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== k))}><X className="h-4 w-4" /></button></li>)}</ul>}
      </div>
      <label className="block">
        <span className="text-[0.9375rem] font-semibold">When do you need it by? <span className="font-normal text-[#5E5853]">(optional)</span></span>
        <span className="mt-0.5 block text-[0.8125rem] text-[#5E5853]">Your event or install date, so we can plan the print run.</span>
        <input type="date" min={new Date().toISOString().slice(0, 10)} value={me.neededBy} onChange={(e) => setMe({ ...me, neededBy: e.target.value })} className={`${input} mt-2 block w-full min-w-0 max-w-full appearance-none sm:max-w-xs`} />
      </label>
      {err && <p className="rounded-xl bg-rose-50 px-4 py-3 text-[0.9375rem] text-rose-700" role="alert">{err}</p>}
      <button type="button" disabled={!!busy} onClick={send} className="shop-btn inline-flex h-[56px] w-full items-center justify-center gap-2 rounded-full bg-[var(--pk)] px-8 text-[1rem] font-semibold text-white disabled:opacity-60 sm:w-auto">{busy ? <><Loader2 className="h-5 w-5 animate-spin" />{busy}</> : "Send my print job"}</button>
    </div>
  );
}
