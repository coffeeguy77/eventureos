"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bot, Loader2, Package, RefreshCw, Search, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { aiJobStatus, startAiJob } from "@/app/(app)/nerd-herd/ai/actions";

export type AiSite = { id: string; domain: string; client: string | null; version: string | null; updates: number };
export type AiJobRow = {
  id: string; number: number; domain: string; client: string | null; kind: string; request: string | null; billable: boolean; source: string;
  status: string; stage_note: string | null; report_summary: string | null; changes: number; when: string; invoice_id: string | null;
};

export const AI_STATUS: Record<string, { label: string; tone: "neutral" | "blue" | "amber" | "green" | "red" }> = {
  queued: { label: "Queued", tone: "neutral" },
  backing_up: { label: "Backing up", tone: "blue" },
  running: { label: "Working", tone: "blue" },
  finishing: { label: "Writing report", tone: "blue" },
  done: { label: "Done", tone: "green" },
  needs_attention: { label: "Check it", tone: "amber" },
  failed: { label: "Failed", tone: "red" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};
export const ACTIVE = ["queued", "backing_up", "running", "finishing"];
const KIND: Record<string, string> = { request: "Changes", update_plugins: "Update plugins", update_core: "Update WordPress", update_all: "Update everything" };
const MIN_VERSION = 1.004;
const ver = (v: string | null) => (v ?? "0").split(".").map((x) => Number(x) || 0).reduce((a, b, i) => a + b / 1000 ** i, 0);

/** Keep active jobs' status fresh without reloading the page. */
export function useLiveJobs(initial: AiJobRow[]) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  useEffect(() => setRows(initial), [initial]);
  const active = rows.filter((r) => ACTIVE.includes(r.status)).map((r) => r.id);
  useEffect(() => {
    if (!active.length) return;
    const t = setInterval(async () => {
      const r = await aiJobStatus(active);
      if (!r.ok) return;
      let finished = false;
      setRows((cur) => cur.map((row) => {
        const u = r.data.find((x) => x.id === row.id);
        if (!u) return row;
        if (!ACTIVE.includes(u.status)) finished = true;
        return { ...row, status: u.status, stage_note: u.stage_note, changes: u.changes, report_summary: u.report_summary };
      }));
      if (finished) router.refresh();
    }, 4000);
    return () => clearInterval(t);
  }, [active.join(","), router]); // eslint-disable-line react-hooks/exhaustive-deps
  return rows;
}

export function AiJobList({ rows, showSite = true }: { rows: AiJobRow[]; showSite?: boolean }) {
  const live = useLiveJobs(rows);
  if (!live.length) return <p className="px-5 py-6 text-center text-[0.8125rem] text-ink-muted">No AI maintenance jobs yet.</p>;
  return (
    <ul className="divide-y divide-line">
      {live.map((j) => {
        const st = AI_STATUS[j.status] ?? { label: j.status, tone: "neutral" as const };
        return (
          <li key={j.id}>
            <Link href={`/nerd-herd/ai/${j.id}`} className="flex flex-col gap-1 px-5 py-3 hover:bg-canvas sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <span className="min-w-0">
                <span className="block truncate text-[0.8438rem] font-medium text-ink">
                  <span className="text-ink-faint">AI-{j.number}</span> {showSite ? `${j.domain} · ` : ""}{j.kind === "request" ? (j.report_summary || j.request || "Changes") : (j.report_summary || KIND[j.kind])}
                </span>
                <span className="block truncate text-[0.7188rem] text-ink-muted">
                  {j.when}{showSite && j.client ? ` · ${j.client}` : ""} · {KIND[j.kind] ?? j.kind}{j.changes ? ` · ${j.changes} change${j.changes === 1 ? "" : "s"}` : ""}
                  {j.source === "quote" ? " · paid quote" : j.billable ? " · to invoice" : " · no invoice"}
                  {ACTIVE.includes(j.status) && j.stage_note ? ` · ${j.stage_note}` : ""}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {j.invoice_id && <Badge tone="blue">Draft invoice</Badge>}
                <Badge tone={st.tone} dot={ACTIVE.includes(j.status)}>{ACTIVE.includes(j.status) && <Loader2 className="h-3 w-3 animate-spin" />}{st.label}</Badge>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Start a job: pick a connected site, say what to change (or press a quick action), choose whether to invoice. */
export function AiJobForm({ sites, preselect, ticketId, budgetNote }: { sites: AiSite[]; preselect?: string | null; ticketId?: string | null; budgetNote: string }) {
  const router = useRouter();
  const [filter, setFilter] = useState("");
  const [siteId, setSiteId] = useState(preselect && sites.some((s) => s.id === preselect) ? preselect : "");
  const [request, setRequest] = useState("");
  const [billable, setBillable] = useState<boolean | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return (f ? sites.filter((s) => s.domain.toLowerCase().includes(f) || (s.client ?? "").toLowerCase().includes(f)) : sites).slice(0, 300);
  }, [sites, filter]);
  const site = sites.find((s) => s.id === siteId) ?? null;
  const outdated = site ? ver(site.version) < MIN_VERSION : false;

  const go = (kind: "request" | "update_plugins" | "update_core" | "update_all") => {
    setMsg(null);
    if (!site) return setMsg({ ok: false, text: "Choose a website first." });
    if (billable === null) return setMsg({ ok: false, text: "Choose whether this job is invoiced." });
    if (kind === "request" && request.trim().length < 8) return setMsg({ ok: false, text: "Write the changes you want made." });
    if (kind !== "request" && !window.confirm(`${KIND[kind]} on ${site.domain}? A backup is made first.`)) return;
    setBusy(kind);
    start(async () => {
      const r = await startAiJob({ websiteId: site.id, kind, request, billable, ticketId });
      setBusy(null);
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      setMsg({ ok: true, text: `AI-${r.data.number} started on ${site.domain} — a backup is being made, then the work runs. You can leave this page.` });
      if (kind === "request") setRequest("");
      router.refresh();
    });
  };
  const spin = (k: string) => (pending && busy === k ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null);

  return (
    <div className="space-y-4">
      {/* 1. Website */}
      <div>
        <span className="mb-1 block text-[0.75rem] font-medium text-ink-muted">1. Website (connected sites only)</span>
        <div className="grid gap-2 md:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-ink-faint" />
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by domain or client" className="h-9 w-full rounded-lg bg-surface pl-8 pr-3 text-[0.8125rem] text-ink ring-1 ring-inset ring-line-strong placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </label>
          <select value={siteId} onChange={(e) => setSiteId(e.target.value)} className="h-9 w-full min-w-0 rounded-lg bg-surface px-2 text-[0.8125rem] text-ink ring-1 ring-inset ring-line-strong focus:outline-none focus:ring-2 focus:ring-brand-500">
            <option value="">{shown.length ? `Choose a website (${shown.length})` : "No connected sites match"}</option>
            {shown.map((s) => <option key={s.id} value={s.id}>{s.domain}{s.client ? ` — ${s.client}` : ""}</option>)}
          </select>
        </div>
        {site && (
          <p className="mt-1.5 text-[0.7188rem] text-ink-muted">
            Connector {site.version ?? "?"}{site.updates ? ` · ${site.updates} update${site.updates === 1 ? "" : "s"} waiting` : " · up to date"} · <Link href={`/nerd-herd/websites/${site.id}`} className="text-brand-600 underline">open site</Link>
            {outdated && <span className="block font-medium text-amber-700">This site's Connector is older than 1.4.0 — update it on the site page first (AI jobs need backups and content tools).</span>}
          </p>
        )}
      </div>

      {/* 2. Invoice? */}
      <fieldset>
        <legend className="mb-1 block text-[0.75rem] font-medium text-ink-muted">2. Invoice this job?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {[{ v: true, t: "Yes — draft an invoice", d: "Hours a web designer would take by hand + the backup, at your Nerd Herd rate. Ready for the tech to review and send." },
            { v: false, t: "No — record only", d: "Do the work and add the time-stamped report to the client's website file." }].map((o) => (
            <label key={String(o.v)} className={`flex cursor-pointer gap-2.5 rounded-lg p-3 ring-1 ring-inset ${billable === o.v ? "bg-brand-50 ring-brand-500" : "bg-surface ring-line-strong hover:bg-canvas"}`}>
              <input type="radio" name="ai-billable" className="mt-0.5 accent-brand-600" checked={billable === o.v} onChange={() => setBillable(o.v)} />
              <span><span className="block text-[0.8125rem] font-medium text-ink">{o.t}</span><span className="block text-[0.7188rem] text-ink-muted">{o.d}</span></span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* 3. What to do */}
      <div>
        <label htmlFor="ai-request" className="mb-1 block text-[0.75rem] font-medium text-ink-muted">3. Changes to make — write them like you'd brief a web designer</label>
        <textarea id="ai-request" value={request} onChange={(e) => setRequest(e.target.value)} rows={9}
          placeholder={"e.g.\n• On the homepage, change the phone number to 0400 000 000\n• Add a “Drone surveys” service under Our Services, matching the others\n• Set the SEO title of the About page to …\n\nPaste a client's email straight in if that's easier."}
          className="w-full rounded-lg bg-surface px-3 py-2 text-[0.8125rem] leading-relaxed text-ink ring-1 ring-inset ring-line-strong placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-brand-500" />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button variant="primary" disabled={pending || outdated} onClick={() => go("request")}>{spin("request") ?? <Wand2 className="h-3.5 w-3.5" />}Make these changes</Button>
          <span className="text-[0.7188rem] text-ink-muted">Backup first · every change logged and undoable · {budgetNote}</span>
        </div>
      </div>

      {/* Quick actions */}
      <div className="rounded-lg bg-canvas p-3 ring-1 ring-inset ring-line">
        <span className="mb-2 block text-[0.75rem] font-medium text-ink-muted">Quick actions (backup of the database, themes and plugins first)</span>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={pending || outdated} onClick={() => go("update_plugins")}>{spin("update_plugins") ?? <Package className="h-3.5 w-3.5" />}Update plugins</Button>
          <Button size="sm" disabled={pending || outdated} onClick={() => go("update_core")}>{spin("update_core") ?? <RefreshCw className="h-3.5 w-3.5" />}Update WordPress</Button>
          <Button size="sm" disabled={pending || outdated} onClick={() => go("update_all")}>{spin("update_all") ?? <Sparkles className="h-3.5 w-3.5" />}Update everything</Button>
        </div>
      </div>

      {msg && <p role="status" className={`rounded-lg px-3 py-2 text-[0.7812rem] ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>{msg.ok && <Bot className="mr-1 inline h-3.5 w-3.5" />}{msg.text}</p>}
    </div>
  );
}
