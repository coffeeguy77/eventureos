"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Search, Sparkles, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listGscProperties, seoStep, setGscSite, setSeoAuto, undoSeoChange } from "@/app/(app)/nerd-herd/seo/actions";
import type { Phase } from "@/lib/nerdherd/seo";

const LABEL: Record<Phase, string> = { audit: "Checking every page", gsc: "Reading Search Console", pack: "AI search pack", fix: "AI fixing titles, descriptions and alt text", done: "Done" };

/** Runs the SEO steps one server call at a time, showing what each did. */
export function SeoRunner({ websiteId, canRun, auto, outdated }: { websiteId: string; canRun: boolean; auto: boolean; outdated: string | null }) {
  const router = useRouter();
  const [lines, setLines] = useState<{ ok: boolean; text: string }[]>([]);
  const [phase, setPhase] = useState<Phase | null>(null);
  const [isAuto, setIsAuto] = useState(auto);

  const go = async (fix: boolean) => {
    setLines([]);
    let p: Phase = "audit"; let backedUp = false; let guard = 0;
    while (p !== "done" && guard++ < 40) {
      setPhase(p);
      const r = await seoStep(websiteId, p, backedUp, fix);
      if (!r.ok) { setLines((l) => [...l, { ok: false, text: r.error }]); break; }
      setLines((l) => (r.data.next === p && l.length && l[l.length - 1].text.startsWith(LABEL[p]) ? [...l.slice(0, -1), { ok: true, text: `${LABEL[p]}: ${r.data.note}` }] : [...l, { ok: true, text: `${LABEL[p]}: ${r.data.note}` }]));
      p = r.data.next; backedUp = r.data.backedUp;
      router.refresh();
    }
    setPhase(null);
    router.refresh();
  };
  const busy = phase !== null;

  if (outdated) return <p className="rounded-lg bg-amber-50 px-3 py-2 text-[0.7812rem] text-amber-800">{outdated}</p>;
  return (
    <div className="space-y-3">
      {canRun && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" size="sm" disabled={busy} onClick={() => go(true)}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}Check and fix with AI</Button>
          <Button size="sm" disabled={busy} onClick={() => go(false)}><Search className="h-3.5 w-3.5" />Check only</Button>
          <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-[0.7812rem] text-ink-muted">
            <input type="checkbox" className="h-4 w-4 accent-[var(--color-brand-500,#7c3aed)]" checked={isAuto} disabled={busy}
              onChange={async (e) => { const v = e.target.checked; setIsAuto(v); const r = await setSeoAuto(websiteId, v); if (!r.ok) { setIsAuto(!v); setLines([{ ok: false, text: r.error }]); } }} />
            Automatic every week (check, AI search pack and AI fixes)
          </label>
        </div>
      )}
      {busy && <p className="inline-flex items-center gap-2 text-[0.7812rem] text-ink-muted"><Loader2 className="h-3.5 w-3.5 animate-spin" />{LABEL[phase!]}…</p>}
      {lines.length > 0 && (
        <ul className="space-y-1 rounded-lg bg-canvas px-3 py-2 text-[0.7812rem]">
          {lines.map((l, i) => <li key={i} className={l.ok ? "text-ink" : "text-rose-700"}>{l.ok ? <CheckCircle2 className="mr-1.5 inline h-3.5 w-3.5 text-emerald-600" /> : null}{l.text}</li>)}
        </ul>
      )}
    </div>
  );
}

/** Pick (or change) the Search Console property for this site. */
export function GscPicker({ websiteId, current, canRun }: { websiteId: string; current: string | null; canRun: boolean }) {
  const router = useRouter();
  const [opts, setOpts] = useState<{ site: string; permission: string }[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!canRun) return <span className="text-[0.75rem] text-ink-muted">{current ?? "Not linked"}</span>;
  return (
    <div className="flex flex-wrap items-center gap-2 text-[0.75rem]">
      <span className="text-ink-muted">Property:</span>
      {opts ? (
        <select className="h-8 rounded-lg bg-surface px-2 text-[0.75rem] ring-1 ring-inset ring-line-strong" defaultValue={current ?? ""} disabled={busy}
          onChange={async (e) => { setBusy(true); const r = await setGscSite(websiteId, e.target.value || null); setBusy(false); if (!r.ok) setErr(r.error); else { setOpts(null); router.refresh(); } }}>
          <option value="">Match automatically</option>
          {opts.map((o) => <option key={o.site} value={o.site}>{o.site}{o.permission === "siteUnverifiedUser" ? " (not verified)" : ""}</option>)}
        </select>
      ) : (
        <button type="button" className="font-medium text-brand-600 underline" disabled={busy}
          onClick={async () => { setBusy(true); setErr(null); const r = await listGscProperties(websiteId); setBusy(false); if (r.ok) setOpts(r.data); else setErr(r.error); }}>
          {current ?? "Match automatically"} · change
        </button>
      )}
      {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {err && <span className="text-rose-700">{err}</span>}
    </div>
  );
}

export function UndoChange({ websiteId, changeId }: { websiteId: string; changeId: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "done" | string>("idle");
  if (state === "done") return <span className="text-[0.7188rem] text-ink-faint">Undone</span>;
  return (
    <button type="button" title="Undo this change on the site" disabled={state === "busy"}
      className="inline-flex items-center gap-1 text-[0.7188rem] font-medium text-ink-muted hover:text-ink disabled:opacity-50"
      onClick={async () => { if (!window.confirm("Undo this change on the site?")) return; setState("busy"); const r = await undoSeoChange(websiteId, changeId); setState(r.ok ? "done" : r.error); router.refresh(); }}>
      {state === "busy" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />}{typeof state === "string" && !["idle", "busy"].includes(state) ? state : "Undo"}
    </button>
  );
}

