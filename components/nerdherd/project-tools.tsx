"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Receipt, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea, FormError } from "@/components/ui/form";
import { addTime, billProject, createProject, deleteTime, importRecord, saveProject, type ProjectPatch } from "@/app/(app)/nerd-herd/projects/actions";
import type { Project } from "@/lib/nerdherd/projects";

/* ------------------------------------------------------------------ new project */

export function NewProject({ clients }: { clients: { id: string; name: string }[] }) {
  const router = useRouter();
  const [customerId, setCustomer] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  return (
    <form className="space-y-3 p-5" onSubmit={(e) => { e.preventDefault(); start(async () => {
      setErr(null);
      const r = await createProject({ customerId, name });
      if (r.ok) router.push(`/nerd-herd/projects/${r.data}`); else setErr(r.error);
    }); }}>
      <div><Label htmlFor="np-c">Client</Label>
        <Select id="np-c" value={customerId} onChange={(e) => setCustomer(e.target.value)}>
          <option value="">Choose…</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select></div>
      <div><Label htmlFor="np-n">Project name</Label><Input id="np-n" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. TradeUp AI rebuild" /></div>
      <FormError message={err} />
      <Button type="submit" variant="primary" disabled={busy || !customerId || !name.trim()}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Start project</Button>
    </form>
  );
}

/* ------------------------------------------------------------------ time */

export function AddTime({ id, today }: { id: string; today: string }) {
  const router = useRouter();
  const blank = { date: today, start: "", end: "", hours: "", work: "", kind: "staff", billable: true };
  const [f, setF] = useState(blank);
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => {
    const n = { ...x, [k]: v };
    // fill the hours from a start and finish
    if ((k === "start" || k === "end") && /^\d{1,2}:\d{2}$/.test(n.start) && /^\d{1,2}:\d{2}$/.test(n.end)) {
      const m = (t: string) => Number(t.split(":")[0]) * 60 + Number(t.split(":")[1]);
      let d = m(n.end) - m(n.start); if (d <= 0) d += 1440;
      n.hours = String(Math.round((d / 60) * 100) / 100);
    }
    return n;
  });
  return (
    <form className="space-y-3 border-t border-line p-4 sm:p-5" onSubmit={(e) => { e.preventDefault(); start(async () => {
      setErr(null);
      const r = await addTime(id, f);
      if (r.ok) { setF({ ...blank, date: f.date, kind: f.kind }); router.refresh(); } else setErr(r.error);
    }); }}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.7fr)]">
        <div className="col-span-2 sm:col-span-1"><Label htmlFor="t-d">Date</Label><Input id="t-d" type="date" value={f.date} onChange={(e) => set("date", e.target.value)} /></div>
        <div><Label htmlFor="t-s">Start</Label><Input id="t-s" type="time" value={f.start} onChange={(e) => set("start", e.target.value)} /></div>
        <div><Label htmlFor="t-e">Finish</Label><Input id="t-e" type="time" value={f.end} onChange={(e) => set("end", e.target.value)} /></div>
        <div className="col-span-2 sm:col-span-1"><Label htmlFor="t-h">Hours</Label><Input id="t-h" inputMode="decimal" value={f.hours} onChange={(e) => set("hours", e.target.value)} placeholder="1.5" /></div>
      </div>
      <div><Label htmlFor="t-w">What was done</Label><Textarea id="t-w" rows={2} value={f.work} onChange={(e) => set("work", e.target.value)} placeholder="e.g. Worked through the variations flow with Chris; tested on phone" /></div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="inline-flex items-center gap-2 text-[0.8125rem] text-ink"><input type="radio" name="kind" checked={f.kind === "staff"} onChange={() => set("kind", "staff")} />My time (planning, testing, calls)</label>
        <label className="inline-flex items-center gap-2 text-[0.8125rem] text-ink"><input type="radio" name="kind" checked={f.kind === "ai"} onChange={() => set("kind", "ai")} />AI session (margin applies)</label>
        <label className="inline-flex items-center gap-2 text-[0.8125rem] text-ink"><input type="checkbox" checked={f.billable} onChange={(e) => set("billable", e.target.checked)} />Billable</label>
        <Button type="submit" variant="primary" size="sm" className="ml-auto" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Add time</Button>
      </div>
      <FormError message={err} />
    </form>
  );
}

export function DeleteTime({ id, entryId }: { id: string; entryId: string }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end">
      <button type="button" aria-label="Delete this time" disabled={busy} onClick={() => start(async () => { const r = await deleteTime(id, entryId); if (r.ok) router.refresh(); else setErr(r.error); })}
        className="grid h-8 w-8 place-items-center rounded-lg text-ink-faint hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</button>
      {err && <span className="text-[0.6875rem] text-rose-600">{err}</span>}
    </span>
  );
}

export function BillProject({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <div>
      <Button variant="primary" size="sm" disabled={busy} onClick={() => start(async () => { setErr(null); const r = await billProject(id); if (r.ok) router.push(`/invoices/${r.data}`); else setErr(r.error); })}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}{label}
      </Button>
      <FormError message={err} />
    </div>
  );
}

/* ------------------------------------------------------------------ details */

const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

export function ProjectForm({ p }: { p: Project }) {
  const router = useRouter();
  const [f, setF] = useState({
    name: p.name, status: p.status, status_note: p.status_note ?? "", summary: p.summary ?? "", delivered_by: p.delivered_by ?? "", started: p.started ?? "",
    rate: p.rate == null ? "" : String(p.rate), margin_percent: String(p.margin_percent), margin_label: p.margin_label,
    phases: p.phases.map((x) => [x.name, x.dates ?? "", x.status ?? ""].join(" | ")).join("\n"),
    links: p.links.map((x) => `${x.label} | ${x.url}`).join("\n"),
    open_items: p.open_items.join("\n"), notes: p.notes ?? "", staff_notes: p.staff_notes ?? "", portal: p.portal,
  });
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [busy, start] = useTransition();
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => { setOk(false); setF((x) => ({ ...x, [k]: v })); };
  const save = () => start(async () => {
    setErr(null);
    const patch: ProjectPatch = {
      ...f,
      phases: lines(f.phases).map((l) => { const [name, dates, status] = l.split("|").map((x) => x.trim()); return { name, dates: dates || null, status: status || null }; }),
      links: lines(f.links).map((l) => { const i = l.lastIndexOf("|"); return i > 0 ? { label: l.slice(0, i).trim(), url: l.slice(i + 1).trim() } : { label: "", url: l }; }),
      open_items: lines(f.open_items),
    };
    const r = await saveProject(p.id, patch);
    if (r.ok) { setOk(true); router.refresh(); } else setErr(r.error);
  });
  return (
    <div className="space-y-4 border-t border-line p-4 sm:p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Label htmlFor="pf-n">Name</Label><Input id="pf-n" value={f.name} onChange={(e) => set("name", e.target.value)} /></div>
        <div><Label htmlFor="pf-s">Status</Label>
          <Select id="pf-s" value={f.status} onChange={(e) => set("status", e.target.value as Project["status"])}>
            <option value="active">In progress</option><option value="on_hold">On hold</option><option value="complete">Complete</option><option value="archived">Archived</option>
          </Select></div>
        <div><Label htmlFor="pf-st">Started</Label><Input id="pf-st" type="date" value={f.started} onChange={(e) => set("started", e.target.value)} /></div>
        <div className="sm:col-span-2"><Label htmlFor="pf-sn" hint="one line the client sees at the top">Where it's up to</Label><Input id="pf-sn" value={f.status_note} onChange={(e) => set("status_note", e.target.value)} /></div>
        <div className="sm:col-span-2"><Label htmlFor="pf-su">Summary</Label><Textarea id="pf-su" rows={3} value={f.summary} onChange={(e) => set("summary", e.target.value)} /></div>
      </div>

      <fieldset className="rounded-xl p-3 ring-1 ring-inset ring-line">
        <legend className="px-1 text-[0.8125rem] font-semibold text-ink">Billing</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          <div><Label htmlFor="pf-r" hint="ex GST — blank = your Nerd Herd rate">Hourly rate</Label><Input id="pf-r" inputMode="decimal" value={f.rate} onChange={(e) => set("rate", e.target.value)} placeholder="120" /></div>
          <div><Label htmlFor="pf-m" hint="added to AI session time">Margin %</Label><Input id="pf-m" inputMode="decimal" value={f.margin_percent} onChange={(e) => set("margin_percent", e.target.value)} placeholder="0" /></div>
          <div><Label htmlFor="pf-ml" hint="how the margin line reads">Margin line</Label><Input id="pf-ml" value={f.margin_label} onChange={(e) => set("margin_label", e.target.value)} /></div>
        </div>
        <p className="mt-2 text-[0.75rem] text-ink-muted">AI session time is only what the session timestamps show. The margin adds your own planning, direction and testing on top, as its own line on the record and the invoice (e.g. 50% on 10 hrs = 5 hrs). Or log your own time as “My time” entries — or both.</p>
      </fieldset>

      <div className="grid gap-3 lg:grid-cols-2">
        <div><Label htmlFor="pf-ph" hint="one a line: name | dates | status">Phases</Label><Textarea id="pf-ph" rows={4} value={f.phases} onChange={(e) => set("phases", e.target.value)} /></div>
        <div><Label htmlFor="pf-l" hint="one a line: label | https://…">Links</Label><Textarea id="pf-l" rows={4} value={f.links} onChange={(e) => set("links", e.target.value)} /></div>
        <div><Label htmlFor="pf-o" hint="one a line">Open items & next steps</Label><Textarea id="pf-o" rows={5} value={f.open_items} onChange={(e) => set("open_items", e.target.value)} /></div>
        <div><Label htmlFor="pf-no" hint="what's been delivered, findings — the client sees this">Notes for the client</Label><Textarea id="pf-no" rows={5} value={f.notes} onChange={(e) => set("notes", e.target.value)} /></div>
        <div className="lg:col-span-2"><Label htmlFor="pf-sf" hint="never shown to the client">Staff notes</Label><Textarea id="pf-sf" rows={3} value={f.staff_notes} onChange={(e) => set("staff_notes", e.target.value)} /></div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex items-center gap-2 text-[0.8125rem] text-ink"><input type="checkbox" checked={f.portal} onChange={(e) => set("portal", e.target.checked)} />Show in the client's portal</label>
        <Button variant="primary" className="ml-auto" disabled={busy} onClick={save}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Save</Button>
      </div>
      {ok && <p className="text-[0.8125rem] text-emerald-700 dark:text-emerald-400">Saved.</p>}
      <FormError message={err} />
    </div>
  );
}

/* ------------------------------------------------------------------ import a record */

export function ImportRecord({ id }: { id: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [replace, setReplace] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  return (
    <div className="space-y-3 border-t border-line p-4 sm:p-5">
      <p className="text-[0.8125rem] text-ink-muted">Paste the JSON block from a project record (e.g. the one an AI session writes up). New time entries are added; ones already here are skipped, so you can paste an updated record after each session.</p>
      <Textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder='{"project": {...}, "phases": [...], "time_entries": [...], "links": [...], "open_items": [...]}' className="font-mono text-[0.75rem]" />
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex items-center gap-2 text-[0.8125rem] text-ink"><input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />Also replace the summary, phases, links and open items</label>
        <Button variant="secondary" size="sm" className="ml-auto" disabled={busy || !text.trim()} onClick={() => start(async () => {
          setErr(null); setMsg(null);
          const r = await importRecord(id, text, replace);
          if (r.ok) { setMsg(`Added ${r.data.added} time ${r.data.added === 1 ? "entry" : "entries"}${r.data.skipped ? `, skipped ${r.data.skipped} already here` : ""}.`); setText(""); router.refresh(); } else setErr(r.error);
        })}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}Import</Button>
      </div>
      {msg && <p className="text-[0.8125rem] text-emerald-700 dark:text-emerald-400">{msg}</p>}
      <FormError message={err} />
    </div>
  );
}
