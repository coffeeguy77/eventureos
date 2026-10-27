"use client";

import { useRef, useState } from "react";
import { CheckCircle2, FileUp, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/** On the customer's job page: approve the quote, and send more artwork. */
export function CustomerJob({ jobId, token, canApprove, approved }: { jobId: string; token: string; canApprove: boolean; approved: boolean }) {
  const [state, setState] = useState<{ approved: boolean; busy: string | null; msg: string | null; err: string | null }>({ approved, busy: null, msg: null, err: null });
  const pick = useRef<HTMLInputElement>(null);
  const approve = async () => {
    setState((s) => ({ ...s, busy: "Approving…", err: null }));
    const r = await fetch("/api/public/printing/approve", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId, token }) }).then((x) => x.json()).catch(() => ({ ok: false, error: "Couldn't reach us — please try again." }));
    setState((s) => ({ ...s, busy: null, approved: r.ok ? true : s.approved, err: r.ok ? null : r.error, msg: r.ok ? "Thanks — approved. We'll get printing." : null }));
  };
  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    const files = Array.from(list).slice(0, 20);
    setState((s) => ({ ...s, busy: "Getting ready…", err: null, msg: null }));
    try {
      const start = await fetch("/api/public/printing/more", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId, token, files: files.map((f) => ({ name: f.name, size: f.size })) }) }).then((x) => x.json());
      if (!start.ok) throw new Error(start.error);
      const supabase = createClient();
      const sent = [];
      for (let k = 0; k < start.uploads.length; k++) {
        const u = start.uploads[k] as { path: string; token: string };
        setState((s) => ({ ...s, busy: `Uploading ${k + 1} of ${start.uploads.length}…` }));
        const { error } = await supabase.storage.from("print-artwork").uploadToSignedUrl(u.path, u.token, files[k], { contentType: files[k].type || "application/octet-stream" });
        if (error) throw new Error(`${files[k].name} didn't upload: ${error.message}`);
        sent.push({ name: files[k].name, path: u.path, size: files[k].size, type: files[k].type });
      }
      const fin = await fetch("/api/public/printing/done", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId, token, files: sent }) }).then((x) => x.json());
      if (!fin.ok) throw new Error(fin.error);
      setState((s) => ({ ...s, busy: null, msg: `${fin.files} file${fin.files === 1 ? "" : "s"} sent — thanks.` }));
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) { setState((s) => ({ ...s, busy: null, err: e instanceof Error ? e.message : "Upload failed — please try again." })); }
  };
  return (
    <div className="space-y-3">
      {canApprove && !state.approved && <button type="button" disabled={!!state.busy} onClick={approve} className="shop-btn inline-flex h-[56px] w-full items-center justify-center gap-2 rounded-full bg-[var(--pk)] px-8 text-[1rem] font-semibold text-white disabled:opacity-60">{state.busy === "Approving…" ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}Approve this quote</button>}
      {state.approved && <p className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 font-medium text-emerald-800"><CheckCircle2 className="h-5 w-5" />Quote approved</p>}
      <input ref={pick} type="file" multiple className="hidden" onChange={(e) => { void upload(e.target.files); e.target.value = ""; }} />
      <button type="button" disabled={!!state.busy} onClick={() => pick.current?.click()} className="shop-btn inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-full border-[1.5px] border-[#1F1B19] bg-white px-8 font-semibold disabled:opacity-60">{state.busy && state.busy !== "Approving…" ? <><Loader2 className="h-5 w-5 animate-spin" />{state.busy}</> : <><FileUp className="h-5 w-5" />Send more artwork</>}</button>
      {state.msg && <p className="text-center text-[0.9375rem] font-medium text-emerald-700">{state.msg}</p>}
      {state.err && <p className="rounded-xl bg-rose-50 px-4 py-3 text-[0.9375rem] text-rose-700" role="alert">{state.err}</p>}
    </div>
  );
}
