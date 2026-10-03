"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Download, FileText, Globe, Loader2, Lock, Trash2, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { fmtDate } from "@/lib/format";
import { fileSize, groupByCategory, LIBRARY_CATEGORIES, type LibraryDoc } from "@/lib/documents/library-shared";
import { addLibraryDocument, libraryShareLink, removeLibraryDocument, updateLibraryDocument } from "./library-actions";

const MAX_BYTES = 25 * 1024 * 1024; // the documents bucket limit
const safeName = (n: string) => (n.normalize("NFKD").replace(/[^\w.\-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "file").slice(-120);
const field = "h-9 rounded-md border border-line bg-surface px-2 text-[0.8125rem] text-ink";

/** Upload and manage the business documents every customer can get (insurance, food licence, artwork templates…). */
export function DocumentLibrary({ orgId, docs, today, canEdit }: { orgId: string; docs: LibraryDoc[]; today: string; canEdit: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [form, setForm] = useState({ category: "Insurance certificate", description: "", expires: "", pub: true });
  const soon = (d: string | null) => !!d && d >= today && Date.parse(d) - Date.parse(today) < 31 * 86400000;

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setMsg(null);
    const list = Array.from(files);
    const big = list.find((f) => f.size > MAX_BYTES);
    if (big) { setMsg({ text: `${big.name} is larger than 25 MB.`, ok: false }); return; }
    setBusy(true);
    const supabase = createClient();
    try {
      for (const f of list) {
        const path = `${orgId}/library/${crypto.randomUUID()}-${safeName(f.name)}`;
        const { error } = await supabase.storage.from("documents").upload(path, f, { contentType: f.type || undefined, upsert: false });
        if (error) throw new Error(`Couldn't upload ${f.name}: ${error.message}`);
        const r = await addLibraryDocument({ name: f.name, path, mime: f.type || null, size: f.size, category: form.category, description: form.description || null, expires_on: form.expires || null, public_share: form.pub });
        if (!r.ok) throw new Error(r.error);
      }
      setMsg({ text: `${list.length === 1 ? "Uploaded" : `${list.length} files uploaded`} — customers can see ${list.length === 1 ? "it" : "them"} in their portal.`, ok: true });
      setForm((x) => ({ ...x, description: "", expires: "" }));
      router.refresh();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Upload failed.", ok: false });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function open(d: LibraryDoc) {
    if (!d.storage_path) return;
    const { data, error } = await createClient().storage.from("documents").createSignedUrl(d.storage_path, 120, { download: d.name });
    if (error || !data) { setMsg({ text: `Couldn't open ${d.name}.`, ok: false }); return; }
    window.location.assign(data.signedUrl);
  }
  const act = (fn: () => Promise<{ ok: boolean; error?: string; message?: string; data?: unknown }>, after?: (data: unknown) => void) => start(async () => {
    const r: { ok: boolean; error?: string; message?: string; data?: unknown } = await fn().catch(() => ({ ok: false, error: "Couldn't reach the server." }));
    setMsg(r.ok ? (r.message ? { text: r.message, ok: true } : null) : { text: r.error ?? "Something went wrong.", ok: false });
    if (r.ok) { after?.(r.data); router.refresh(); }
  });
  const copyLink = (regenerate = false) => act(() => libraryShareLink(regenerate), (url) => {
    void navigator.clipboard?.writeText(String(url));
    setMsg({ text: `${regenerate ? "New link made and copied" : "Link copied"}: ${url}`, ok: true });
  });

  return (
    <div className="px-5 pb-5">
      {canEdit && (
        <div className="mb-4 space-y-2 rounded-xl border border-dashed border-line-strong bg-zinc-50/60 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={field} aria-label="Type of document">
              {LIBRARY_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={500} placeholder="Description (optional) e.g. $20m public liability, QBE" className={cn(field, "min-w-0 flex-1 basis-56")} />
            <label className="flex items-center gap-1.5 text-[0.75rem] text-ink-muted">Expires<input type="date" value={form.expires} onChange={(e) => setForm({ ...form, expires: e.target.value })} className={field} /></label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-[0.75rem] text-ink">
              <input type="checkbox" checked={form.pub} onChange={(e) => setForm({ ...form, pub: e.target.checked })} className="h-4 w-4 accent-brand-600" />
              Also on the public share link (no login)
            </label>
            <input ref={input} type="file" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
            <Button size="sm" variant="primary" className="ml-auto" disabled={busy} onClick={() => input.current?.click()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}Upload {form.category.toLowerCase()}
            </Button>
          </div>
        </div>
      )}
      {msg && <p className={cn("mb-3 break-all text-[0.75rem]", msg.ok ? "text-emerald-700" : "text-rose-700")}>{msg.text}</p>}

      {docs.length === 0 ? <p className="text-[0.8125rem] text-ink-muted">Nothing yet. Upload your public liability certificate, food licence and artwork templates — every customer can then download them from their portal.</p> : (
        <div className="space-y-4">
          {groupByCategory(docs).map(([category, list]) => (
            <div key={category}>
              <p className="mb-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">{category}</p>
              <ul className="divide-y divide-line rounded-lg ring-1 ring-line">
                {list.map((d) => {
                  const expired = !!d.expires_on && d.expires_on < today;
                  return (
                    <li key={d.id} className={cn("flex flex-wrap items-center gap-3 px-3 py-2.5", expired && "bg-rose-50/50")}>
                      <FileText className="h-4 w-4 shrink-0 text-ink-faint" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[0.8125rem] font-medium text-ink">{d.name}</p>
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.7188rem] text-ink-muted">
                          {d.description && <span>{d.description}</span>}
                          {fileSize(d.size_bytes) && <span className="text-ink-faint">{fileSize(d.size_bytes)}</span>}
                          {d.expires_on && (expired ? <Badge tone="red">Expired {fmtDate(d.expires_on)} — hidden from customers</Badge>
                            : soon(d.expires_on) ? <Badge tone="amber">Expires {fmtDate(d.expires_on)}</Badge> : <span>Expires {fmtDate(d.expires_on)}</span>)}
                        </p>
                      </div>
                      {canEdit ? (
                        <button type="button" disabled={pending} onClick={() => act(() => updateLibraryDocument(d.id, { public_share: !d.public_share }))}
                          title={d.public_share ? "On the public share link — click to make it portal-only" : "Portal only — click to add to the public share link"}
                          className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-medium ring-1 ring-inset", d.public_share ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "text-ink-muted ring-line")}>
                          {d.public_share ? <Globe className="h-3 w-3" /> : <Lock className="h-3 w-3" />}{d.public_share ? "Public link" : "Portal only"}
                        </button>
                      ) : null}
                      {canEdit && (
                        <input type="date" defaultValue={d.expires_on ?? ""} aria-label="Expiry date" title="Expiry date"
                          onBlur={(e) => { if ((e.target.value || null) !== d.expires_on) act(() => updateLibraryDocument(d.id, { expires_on: e.target.value || null })); }}
                          className="h-7 rounded-md border border-line bg-surface px-1.5 text-[0.7188rem] text-ink-muted" />
                      )}
                      <button type="button" onClick={() => open(d)} className="rounded-md p-1.5 text-ink-faint hover:bg-zinc-100 hover:text-ink" aria-label={`Download ${d.name}`}><Download className="h-4 w-4" /></button>
                      {canEdit && <button type="button" disabled={pending} onClick={() => act(() => removeLibraryDocument(d.id))} className="rounded-md p-1.5 text-ink-faint hover:bg-rose-50 hover:text-rose-700" aria-label={`Remove ${d.name}`}><Trash2 className="h-4 w-4" /></button>}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      {canEdit && docs.some((d) => d.public_share) && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-[0.75rem] text-ink-muted">
          <Globe className="h-4 w-4 text-ink-faint" />
          <span className="min-w-0 flex-1">Public share link — paste it into an email for venues or new clients. No login needed; shows only the documents marked Public link that haven&apos;t expired.</span>
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => copyLink(false)}><Copy className="h-4 w-4" />Copy link</Button>
          <button type="button" disabled={pending} onClick={() => copyLink(true)} className="text-ink-faint hover:text-ink hover:underline">Make a new link</button>
        </div>
      )}
    </div>
  );
}
