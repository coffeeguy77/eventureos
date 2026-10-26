"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { createClient } from "@/lib/supabase/client";
import { deleteInvoice, importUploaded } from "@/app/(app)/pricing/actions";

/** Upload invoice PDFs for a supplier (for invoices that don't come by email). */
export function UploadInvoices({ orgId, suppliers }: { orgId: string; suppliers: { id: string; name: string }[] }) {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [sup, setSup] = useState(suppliers[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const go = async (files: FileList | null) => {
    if (!files?.length || !sup) return;
    setBusy(true); setLines([]);
    const supabase = createClient();
    for (const f of Array.from(files).slice(0, 30)) {
      if (f.type !== "application/pdf" && !/\.pdf$/i.test(f.name)) { setLines((l) => [...l, `${f.name}: not a PDF`]); continue; }
      const path = `${orgId}/uploads/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${f.name.replace(/[^\w.-]+/g, "_").slice(-60)}`;
      const { error } = await supabase.storage.from("supplier-invoices").upload(path, f, { contentType: "application/pdf", upsert: false });
      if (error) { setLines((l) => [...l, `${f.name}: ${error.message}`]); continue; }
      const r = await importUploaded(sup, path, f.name);
      setLines((l) => [...l, r.ok ? r.data : `${f.name}: ${r.error}`]);
    }
    setBusy(false); if (ref.current) ref.current.value = ""; router.refresh();
  };
  if (!suppliers.length) return <p className="text-[0.8125rem] text-ink-muted">Add a supplier first.</p>;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Select aria-label="Supplier" value={sup} onChange={(e) => setSup(e.target.value)} className="w-auto">{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
        <input ref={ref} type="file" accept="application/pdf" multiple className="hidden" onChange={(e) => go(e.target.files)} />
        <Button disabled={busy} onClick={() => ref.current?.click()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}Upload invoice PDFs</Button>
      </div>
      {lines.length > 0 && <ul className="mt-2 space-y-0.5 text-[0.75rem] text-ink-muted">{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>}
    </div>
  );
}

/** Remove an invoice that was read wrongly — asks once more in place (no pop-up). */
export function DeleteInvoice({ id }: { id: string }) {
  const router = useRouter();
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!sure) return <button type="button" aria-label="Remove invoice" onClick={() => setSure(true)} className="grid h-7 w-7 place-items-center rounded-md text-ink-faint hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>;
  return (
    <span className="flex items-center gap-1 text-[0.75rem]">
      <button type="button" disabled={busy} onClick={async () => { setBusy(true); await deleteInvoice(id); router.refresh(); }} className="rounded-md bg-rose-600 px-2 py-1 font-semibold text-white">{busy ? "…" : "Remove"}</button>
      <button type="button" onClick={() => setSure(false)} className="px-1 text-ink-muted">Keep</button>
    </span>
  );
}
