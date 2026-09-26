"use client";

import { useRef, useState } from "react";
import { Download, FileText, Loader2, Paperclip, Trash2, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { attachQuoteDocument, removeQuoteDocument } from "@/app/(app)/quotes/actions";
import { FormError } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { relative } from "@/lib/format";
import type { QuoteDoc } from "./types";

const MAX_BYTES = 25 * 1024 * 1024; // matches the `documents` bucket limit

function size(n: number | null) {
  if (!n) return "";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function safeName(name: string) {
  const cleaned = name.normalize("NFKD").replace(/[^\w.\-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return (cleaned || "file").slice(-120);
}

/** Customer-visible attachments on a quote: uploaded from the browser straight to private Storage. */
export function QuoteAttachments({ quoteId, orgId, initial }: { quoteId: string; orgId: string; initial: QuoteDoc[] }) {
  const [docs, setDocs] = useState(initial);
  const [uploading, setUploading] = useState<string[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function upload(files: FileList | File[]) {
    setError(null);
    const list = Array.from(files);
    const tooBig = list.filter((f) => f.size > MAX_BYTES);
    if (tooBig.length) setError(`${tooBig.map((f) => f.name).join(", ")} ${tooBig.length === 1 ? "is" : "are"} larger than 25 MB and can't be attached.`);
    const ok = list.filter((f) => f.size <= MAX_BYTES && f.size > 0);
    if (!ok.length) return;
    const supabase = createClient();
    setUploading((u) => [...u, ...ok.map((f) => f.name)]);
    await Promise.all(ok.map(async (f) => {
      const path = `${orgId}/quotes/${quoteId}/${crypto.randomUUID()}-${safeName(f.name)}`;
      try {
        const { error: upErr } = await supabase.storage.from("documents").upload(path, f, { contentType: f.type || undefined, upsert: false });
        if (upErr) throw new Error(`Couldn't upload ${f.name}: ${upErr.message}`);
        const res = await attachQuoteDocument(quoteId, { name: f.name, path, mime: f.type || null, size: f.size });
        if (!res.ok) throw new Error(res.error);
        setDocs((d) => [res.data, ...d]);
      } catch (e) {
        setError(e instanceof Error ? e.message : `Couldn't upload ${f.name}.`);
      } finally {
        setUploading((u) => { const i = u.indexOf(f.name); return i < 0 ? u : [...u.slice(0, i), ...u.slice(i + 1)]; });
      }
    }));
    if (fileInput.current) fileInput.current.value = "";
  }

  async function download(d: QuoteDoc) {
    if (!d.storage_path) return;
    setError(null);
    setBusyId(d.id);
    const { data, error: sErr } = await createClient().storage.from("documents").createSignedUrl(d.storage_path, 120, { download: d.name });
    setBusyId(null);
    if (sErr || !data) { setError(`Couldn't open ${d.name}: ${sErr?.message ?? "no link returned"}`); return; }
    window.location.assign(data.signedUrl);
  }

  async function remove(d: QuoteDoc) {
    setError(null);
    setBusyId(d.id);
    const res = await removeQuoteDocument(d.id);
    setBusyId(null);
    if (!res.ok) { setError(res.error); return; }
    setDocs((all) => all.filter((x) => x.id !== d.id));
  }

  return (
    <div className="px-5 pb-5">
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) upload(e.dataTransfer.files); }}
        className={cn("flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-4 py-5 text-center transition-colors",
          drag ? "border-brand-400 bg-brand-50/60" : "border-line-strong")}
      >
        <Upload className="h-4 w-4 text-ink-faint" />
        <p className="text-[12.5px] text-ink-muted">
          Drop files here or{" "}
          <button type="button" onClick={() => fileInput.current?.click()} className="py-2 font-medium text-brand-700 hover:underline sm:py-0">choose files</button>
        </p>
        <p className="text-[11.5px] text-ink-faint">Menus, floor plans, photos — up to 25 MB each. Shared with the customer.</p>
        <input ref={fileInput} type="file" multiple className="sr-only" onChange={(e) => e.target.files && upload(e.target.files)} aria-label="Attach files" />
      </div>
      {error && <div className="mt-3"><FormError message={error} /></div>}
      {(docs.length > 0 || uploading.length > 0) && (
        <ul className="mt-3 divide-y divide-line rounded-lg border border-line">
          {uploading.map((n, i) => (
            <li key={`u-${i}`} className="flex items-center gap-3 px-3 py-2 text-[13px] text-ink-muted">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand-500" /><span className="truncate">Uploading {n}…</span>
            </li>
          ))}
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-2 px-3 py-2 sm:gap-3">
              {d.mime_type?.startsWith("image/") ? <Paperclip className="h-4 w-4 shrink-0 text-ink-faint" /> : <FileText className="h-4 w-4 shrink-0 text-ink-faint" />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-ink">{d.name}</p>
                <p className="text-[11.5px] text-ink-faint">{[size(d.size_bytes), `added ${relative(d.created_at)}`].filter(Boolean).join(" · ")}</p>
              </div>
              <button type="button" onClick={() => download(d)} disabled={busyId === d.id} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-ink-faint hover:bg-zinc-100 hover:text-ink sm:h-7 sm:w-7" aria-label={`Download ${d.name}`} title="Download">
                {busyId === d.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              </button>
              <button type="button" onClick={() => remove(d)} disabled={busyId === d.id} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-ink-faint hover:bg-rose-50 hover:text-rose-700 sm:h-7 sm:w-7" aria-label={`Remove ${d.name}`} title="Remove">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
