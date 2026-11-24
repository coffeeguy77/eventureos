"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Mail, Pencil, Plus, Receipt, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea, FormError } from "@/components/ui/form";
import { addPortalPerson, addTime, billProject, createProject, deleteTime, importRecord, saveProject, sendProjectInvite, setClientMargin, setInvoiceMargin, setPortalRole, updateTime, type ProjectPatch } from "@/app/(app)/nerd-herd/projects/actions";
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
  const blank = { date: today, start: "", end: "", hours: "", work: "", kind: "staff", billable: true, who: "" };
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
      if (r.ok) { setF({ ...blank, date: f.date, kind: f.kind, who: f.who }); router.refresh(); } else setErr(r.error);
    }); }}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.7fr)]">
        <div className="col-span-2 sm:col-span-1"><Label htmlFor="t-d">Date</Label><Input id="t-d" type="date" value={f.date} onChange={(e) => set("date", e.target.value)} /></div>
        <div><Label htmlFor="t-s">Start</Label><Input id="t-s" type="time" value={f.start} onChange={(e) => set("start", e.target.value)} /></div>
        <div><Label htmlFor="t-e">Finish</Label><Input id="t-e" type="time" value={f.end} onChange={(e) => set("end", e.target.value)} /></div>
        <div className="col-span-2 sm:col-span-1"><Label htmlFor="t-h">Hours</Label><Input id="t-h" inputMode="decimal" value={f.hours} onChange={(e) => set("hours", e.target.value)} placeholder="1.5" /></div>
      </div>
      {f.kind === "meeting" && <div><Label htmlFor="t-who">Who was there</Label><Input id="t-who" value={f.who} onChange={(e) => set("who", e.target.value)} placeholder="e.g. Shaun, Chris Kingdom, the owner" /></div>}
      <div><Label htmlFor="t-w" hint={f.kind === "meeting" ? "one point a line" : undefined}>{f.kind === "meeting" ? "What was discussed" : "What was done"}</Label>
        <Textarea id="t-w" rows={f.kind === "meeting" ? 4 : 2} value={f.work} onChange={(e) => set("work", e.target.value)} placeholder={f.kind === "meeting" ? "Walked through the TradeUp AI demo\nAgreed credit notes come next\nChris to send Bitbucket access" : "e.g. Worked through the variations flow; tested on phone"} /></div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="inline-flex items-center gap-2 text-[0.8125rem] text-ink"><input type="radio" name="kind" checked={f.kind === "staff"} onChange={() => set("kind", "staff")} />My time (planning, testing, calls)</label>
        <label className="inline-flex items-center gap-2 text-[0.8125rem] text-ink"><input type="radio" name="kind" checked={f.kind === "meeting"} onChange={() => set("kind", "meeting")} />Meeting</label>
        <label className="inline-flex items-center gap-2 text-[0.8125rem] text-ink"><input type="radio" name="kind" checked={f.kind === "ai"} onChange={() => set("kind", "ai")} />AI session (client margin applies)</label>
        <label className="inline-flex items-center gap-2 text-[0.8125rem] text-ink"><input type="checkbox" checked={f.billable} onChange={(e) => set("billable", e.target.checked)} />Billable</label>
        <Button type="submit" variant="primary" size="sm" className="ml-auto" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{f.kind === "meeting" ? "Add meeting" : "Add time"}</Button>
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
    rate: p.rate == null ? "" : String(p.rate),
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

      <div className="max-w-xs"><Label htmlFor="pf-r" hint="ex GST — blank = your Nerd Herd rate">Hourly rate</Label><Input id="pf-r" inputMode="decimal" value={f.rate} onChange={(e) => set("rate", e.target.value)} placeholder="120" /></div>

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

/* ------------------------------------------------------------------ client margin */

export function ClientMargin({ customerId, value, clientName }: { customerId: string; value: number; clientName: string }) {
  const router = useRouter();
  const [v, setV] = useState(String(value || ""));
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [busy, start] = useTransition();
  const n = Number(v || 0);
  return (
    <div className="space-y-2 border-t border-line px-5 py-4">
      <div className="flex items-end gap-2">
        <div className="w-28"><Label htmlFor="cm">Margin %</Label><Input id="cm" inputMode="decimal" value={v} onChange={(e) => { setOk(false); setV(e.target.value); }} placeholder="0" /></div>
        <Button size="sm" variant="primary" disabled={busy} onClick={() => start(async () => { setErr(null); const r = await setClientMargin(customerId, v); if (r.ok) { setOk(true); router.refresh(); } else setErr(r.error); })}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}Save</Button>
      </div>
      <p className="text-[0.75rem] text-ink-muted">AI session time for {clientName} is multiplied up by this on every project and invoice{n > 0 ? ` — 10 hrs becomes ${Number((10 * (1 + n / 100)).toFixed(2))} hrs` : ""}. Your own time is billed as logged. The client only sees the billed hours.</p>
      {ok && <p className="text-[0.8125rem] text-emerald-700 dark:text-emerald-400">Saved.</p>}
      <FormError message={err} />
    </div>
  );
}

/* ------------------------------------------------------------------ edit an entry */

export function EditTime({ id, e, computed }: { id: string; e: { id: string; work: string; hours: number; billed_hours?: number | null; billable: boolean; source: string | null; by_name: string | null }; computed: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ work: e.work, hours: String(e.hours), billed: e.billed_hours == null ? "" : String(e.billed_hours), billable: e.billable, who: e.by_name ?? "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="mt-1 inline-flex items-center gap-1 text-[0.75rem] font-medium text-brand-700 hover:underline dark:text-brand-300"><Pencil className="h-3 w-3" />Edit</button>;
  return (
    <div className="mt-2 space-y-2 rounded-lg bg-zinc-50 p-3 ring-1 ring-inset ring-line dark:bg-white/[0.03]">
      {e.source === "meeting" && <div><Label htmlFor={`w-${e.id}`}>Who was there</Label><Input id={`w-${e.id}`} value={f.who} onChange={(x) => setF({ ...f, who: x.target.value })} /></div>}
      <div><Label htmlFor={`k-${e.id}`}>{e.source === "meeting" ? "What was discussed" : "What was done"}</Label><Textarea id={`k-${e.id}`} rows={3} value={f.work} onChange={(x) => setF({ ...f, work: x.target.value })} /></div>
      <div className="grid grid-cols-2 gap-2">
        <div><Label htmlFor={`h-${e.id}`}>Recorded hours</Label><Input id={`h-${e.id}`} inputMode="decimal" value={f.hours} onChange={(x) => setF({ ...f, hours: x.target.value })} /></div>
        <div><Label htmlFor={`b-${e.id}`} hint={`blank = ${computed}`}>Billed hours</Label><Input id={`b-${e.id}`} inputMode="decimal" value={f.billed} onChange={(x) => setF({ ...f, billed: x.target.value })} placeholder={String(computed)} /></div>
      </div>
      <p className="text-[0.75rem] text-ink-muted">Set billed hours to cover time the record doesn't show — e.g. hours working out the screens before the build. The client sees the billed hours.</p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-2 text-[0.8125rem] text-ink"><input type="checkbox" checked={f.billable} onChange={(x) => setF({ ...f, billable: x.target.checked })} />Billable</label>
        <span className="ml-auto flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button size="sm" variant="primary" disabled={busy} onClick={() => start(async () => { setErr(null); const r = await updateTime(id, e.id, f); if (r.ok) { setOpen(false); router.refresh(); } else setErr(r.error); })}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Save</Button>
        </span>
      </div>
      <FormError message={err} />
    </div>
  );
}

/* ------------------------------------------------------------------ margin on one draft invoice */

/** Override the margin on a draft invoice (office only — the client never sees a margin). Blank = the client's margin. */
export function InvoiceMargin({ id, invoiceId, value, clientMargin, ready }: { id: string; invoiceId: string; value: number | null; clientMargin: number; ready: boolean }) {
  const router = useRouter();
  const [v, setV] = useState(value == null ? "" : String(value));
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const changed = v.trim() !== (value == null ? "" : String(value));
  return (
    <div className="flex flex-wrap items-center gap-2 px-5 pb-3 text-[0.75rem] text-ink-muted">
      <label htmlFor={`im-${invoiceId}`}>Margin on this invoice</label>
      <Input id={`im-${invoiceId}`} inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} placeholder={`${clientMargin}`} className="h-8 w-20" disabled={!ready} />
      <span>%</span>
      {changed && <Button size="sm" variant="primary" disabled={busy} onClick={() => start(async () => { setErr(null); const r = await setInvoiceMargin(id, invoiceId, v); if (r.ok) router.refresh(); else setErr(r.error); })}>
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Apply</Button>}
      <span className="w-full">{!ready ? "Run update 0120 in Supabase to set a margin per invoice." : value == null ? `Blank uses the client's ${clientMargin}%. Lines are rebuilt when you apply.` : `Overrides the client's ${clientMargin}%. Clear it to go back.`} Only your office sees this.</span>
      {err && <span className="w-full"><FormError message={err} /></span>}
    </div>
  );
}

/* ------------------------------------------------------------------ who can sign in to the portal */

type Person = { id: string; name: string; email: string | null; signedIn: boolean; role: "accounts" | "team" };
const ROLE_TEXT = { accounts: "Accounts — sees hours, invoices and what's owed", team: "Team — sees the work and requests only, no prices or hours" } as const;

/** The client's people: what each one sees in the portal, adding someone, and emailing them a sign-in link. */
export function PortalPeople({ id, manage, clientName, people, ready }: { id: string; manage: boolean; clientName: string; people: Person[]; ready: boolean }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ first: "", last: "", email: "", role: "team" });
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const withEmail = people.filter((x) => x.email);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => start(async () => {
    setErr(null); setSent(null);
    const r = await fn();
    if (r.ok) { after?.(); router.refresh(); } else setErr(r.error ?? "Something went wrong.");
  });
  return (
    <div className="space-y-3 text-[0.8125rem]">
      {!ready && <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/30">Run update 0120 in Supabase to choose what each person sees. Until then everyone who signs in sees everything.</p>}
      {!withEmail.length && <p className="text-ink-muted">Nobody at {clientName} has an email on file yet.</p>}
      <ul className="space-y-2.5">
        {withEmail.map((x) => (
          <li key={x.id} className="rounded-lg bg-zinc-50 p-3 ring-1 ring-inset ring-line dark:bg-white/[0.03]">
            <p className="flex flex-wrap items-center gap-x-2 font-medium text-ink">{x.name}{x.signedIn && <span className="inline-flex items-center gap-0.5 text-[0.75rem] font-normal text-emerald-700 dark:text-emerald-400"><Check className="h-3 w-3" />has signed in</span>}</p>
            <p className="break-all text-[0.75rem] text-ink-muted">{x.email}</p>
            {manage ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Select aria-label={`What ${x.name} sees`} value={x.role} disabled={busy || !ready} onChange={(e) => run(() => setPortalRole(id, x.id, e.target.value))} className="h-9 min-w-0 flex-1 text-[0.8125rem]">
                  <option value="accounts">{ROLE_TEXT.accounts}</option>
                  <option value="team">{ROLE_TEXT.team}</option>
                </Select>
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(() => sendProjectInvite(id, x.id), () => setSent(x.id))}><Mail className="h-3.5 w-3.5" />Email sign-in link</Button>
              </div>
            ) : <p className="mt-1 text-[0.75rem] text-ink-muted">{ROLE_TEXT[x.role]}</p>}
            {sent === x.id && <p className="mt-1 text-[0.75rem] text-emerald-700 dark:text-emerald-400">Sent to {x.email}.</p>}
          </li>
        ))}
      </ul>
      {manage && (adding ? (
        <form className="space-y-2 rounded-lg p-3 ring-1 ring-inset ring-line" onSubmit={(e) => { e.preventDefault(); run(() => addPortalPerson(id, f), () => { setAdding(false); setF({ first: "", last: "", email: "", role: "team" }); }); }}>
          <div className="grid gap-2 sm:grid-cols-2">
            <div><Label htmlFor="pp-f">First name</Label><Input id="pp-f" value={f.first} onChange={(e) => setF({ ...f, first: e.target.value })} required /></div>
            <div><Label htmlFor="pp-l">Last name</Label><Input id="pp-l" value={f.last} onChange={(e) => setF({ ...f, last: e.target.value })} /></div>
          </div>
          <div><Label htmlFor="pp-e">Email</Label><Input id="pp-e" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></div>
          <div><Label htmlFor="pp-r">What they see</Label>
            <Select id="pp-r" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
              <option value="team">{ROLE_TEXT.team}</option>
              <option value="accounts">{ROLE_TEXT.accounts}</option>
            </Select></div>
          <p className="text-[0.75rem] text-ink-muted">They're added as a contact for {clientName}. Nothing is emailed until you press “Email sign-in link”.</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="primary" disabled={busy || !ready}>{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Add person</Button>
            <Button size="sm" variant="ghost" type="button" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline dark:text-brand-300"><Plus className="h-3.5 w-3.5" />Add someone at {clientName}</button>
      ))}
      <FormError message={err} />
    </div>
  );
}
