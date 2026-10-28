"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock, Loader2, Receipt, Send, StickyNote, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormError, Input, Label, Select, Textarea } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";
import {
  KINDS, KIND_LABEL, PRIORITIES, PRIORITY, TICKET_STATUSES, TICKET_STATUS, timeLine, type ChecklistItem, type Priority, type TicketKind, type TicketStatus,
} from "@/lib/nerdherd/core";
import { addUpdate, billTime, deleteTicket, setChecklist, updateTicket } from "@/app/(app)/nerd-herd/actions";

type Msg = { ok: boolean; text: string } | null;
const Status = ({ m }: { m: Msg }) => (m ? <p role="status" className={`text-[0.7812rem] font-medium ${m.ok ? "text-emerald-700" : "text-rose-700"}`}>{m.text}</p> : null);

export function TicketControls({ id, initial, members, clients, sites }: {
  id: string;
  initial: { status: TicketStatus; priority: Priority; kind: TicketKind; assigned_to: string | null; customer_id: string | null; website_id: string | null; due_date: string | null };
  members: { id: string; name: string }[]; clients: { id: string; name: string }[]; sites: { id: string; domain: string; customer_id: string | null }[];
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const [client, setClient] = useState(clients.find((c) => c.id === initial.customer_id)?.name ?? "");
  const clientId = clients.find((c) => c.name.toLowerCase() === client.trim().toLowerCase())?.id ?? null;
  const siteList = useMemo(() => (clientId ? sites.filter((s) => s.customer_id === clientId || s.id === initial.website_id) : sites), [clientId, sites, initial.website_id]);
  const save = (p: Parameters<typeof updateTicket>[1]) => start(async () => {
    setMsg(null);
    const r = await updateTicket(id, p);
    setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error });
    if (r.ok) router.refresh();
  });
  return (
    <div className="space-y-3">
      <div><Label htmlFor="tc-status">Status</Label><Select id="tc-status" defaultValue={initial.status} disabled={pending} onChange={(e) => save({ status: e.target.value as TicketStatus })}>{TICKET_STATUSES.map((s) => <option key={s} value={s}>{TICKET_STATUS[s].label}</option>)}</Select></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label htmlFor="tc-pri">Priority</Label><Select id="tc-pri" defaultValue={initial.priority} disabled={pending} onChange={(e) => save({ priority: e.target.value as Priority })}>{PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY[p].label}</option>)}</Select></div>
        <div><Label htmlFor="tc-kind">Type</Label><Select id="tc-kind" defaultValue={initial.kind} disabled={pending} onChange={(e) => save({ kind: e.target.value as TicketKind })}>{KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</Select></div>
      </div>
      <div><Label htmlFor="tc-who">Assigned to</Label><Select id="tc-who" defaultValue={initial.assigned_to ?? ""} disabled={pending} onChange={(e) => save({ assigned_to: e.target.value || null })}><option value="">Unassigned</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select></div>
      <div><Label htmlFor="tc-due">Due</Label><Input id="tc-due" type="date" defaultValue={initial.due_date ?? ""} disabled={pending} onChange={(e) => save({ due_date: e.target.value || null })} /></div>
      <div>
        <Label htmlFor="tc-client">Client</Label>
        <Input id="tc-client" list="tc-clients" value={client} onChange={(e) => setClient(e.target.value)} onBlur={() => {
          const name = client.trim();
          if (!name && initial.customer_id) save({ customer_id: null });
          else if (clientId && clientId !== initial.customer_id) save({ customer_id: clientId });
          else if (name && !clientId) setMsg({ ok: false, text: "Choose the client from the list." });
        }} placeholder="Start typing a client's name" />
        <datalist id="tc-clients">{clients.map((c) => <option key={c.id} value={c.name} />)}</datalist>
      </div>
      <div><Label htmlFor="tc-site">Website</Label><Select id="tc-site" defaultValue={initial.website_id ?? ""} disabled={pending} onChange={(e) => save({ website_id: e.target.value || null })}><option value="">—</option>{siteList.map((s) => <option key={s.id} value={s.id}>{s.domain}</option>)}</Select></div>
      <div className="flex h-5 items-center gap-2">{pending && <Loader2 className="h-4 w-4 animate-spin text-ink-faint" />}<Status m={msg} /></div>
    </div>
  );
}

export function Composer({ id, status, hasClient }: { id: string; status: TicketStatus; hasClient: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"comment" | "note" | "time">(hasClient ? "comment" : "note");
  const [body, setBody] = useState("");
  const [mins, setMins] = useState("");
  const [billable, setBillable] = useState(true);
  const [next, setNext] = useState<TicketStatus | "">("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const send = () => start(async () => {
    setError(null);
    const r = await addUpdate(id, { kind: mode, body, minutes: mins ? Number(mins) : null, billable, public: mode === "comment", status: next || null });
    if (!r.ok) { setError(r.error); return; }
    setBody(""); setMins(""); setNext("");
    router.refresh();
  });
  const tab = (k: typeof mode, label: string, Icon: typeof Send) => (
    <button type="button" onClick={() => setMode(k)} disabled={k === "comment" && !hasClient} className={cn("inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[0.7812rem] font-medium disabled:opacity-40", mode === k ? "bg-ink text-surface" : "text-ink-muted hover:bg-zinc-100")}><Icon className="h-3.5 w-3.5" />{label}</button>
  );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">{tab("comment", "Reply to client", Send)}{tab("note", "Internal note", StickyNote)}{tab("time", "Log time", Clock)}</div>
      {mode !== "time" && <Textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder={mode === "comment" ? "Shows in the client's portal…" : "Only your team sees this…"} aria-label="Message" />}
      {mode === "time" && <Input value={body} onChange={(e) => setBody(e.target.value)} placeholder="What you did (optional)" aria-label="What you did" />}
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-28"><Label htmlFor="cm-min" hint={mode === "time" ? undefined : "optional"}>Minutes</Label><Input id="cm-min" inputMode="numeric" value={mins} onChange={(e) => setMins(e.target.value.replace(/[^0-9]/g, ""))} placeholder="30" /></div>
        {(mins || mode === "time") && <label className="flex items-center gap-2 pb-2 text-[0.7812rem] text-ink"><input type="checkbox" className="h-4 w-4" checked={billable} onChange={(e) => setBillable(e.target.checked)} />Billable</label>}
        <div className="w-44"><Label htmlFor="cm-next" hint="optional">Then set status</Label><Select id="cm-next" value={next} onChange={(e) => setNext(e.target.value as TicketStatus | "")}><option value="">Leave as {TICKET_STATUS[status].label}</option>{TICKET_STATUSES.filter((s) => s !== status).map((s) => <option key={s} value={s}>{TICKET_STATUS[s].label}</option>)}</Select></div>
        <Button variant="primary" disabled={pending} onClick={send}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Save</Button>
      </div>
      {mode === "comment" && <p className="text-[0.7188rem] text-ink-muted">The client sees replies when they sign in to their portal. Email the client from their Emails tab if they need it straight away.</p>}
      <FormError message={error} />
    </div>
  );
}

export function Checklist({ id, items, locked }: { id: string; items: ChecklistItem[]; locked: boolean }) {
  const router = useRouter();
  const [list, setList] = useState(items);
  const [add, setAdd] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const save = (next: ChecklistItem[]) => {
    setList(next);
    start(async () => { setMsg(null); const r = await setChecklist(id, next); if (!r.ok) setMsg({ ok: false, text: r.error }); else router.refresh(); });
  };
  const done = list.filter((x) => x.done).length;
  return (
    <div className="space-y-3">
      {locked && <p className="rounded-lg bg-amber-50 px-3 py-2 text-[0.7812rem] text-amber-800 ring-1 ring-inset ring-amber-200">Waiting for payment — the work starts once the invoice is paid.</p>}
      <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100"><div className="h-full bg-emerald-500" style={{ width: `${list.length ? (done / list.length) * 100 : 0}%` }} /></div>
      <ul className="space-y-1.5">
        {list.map((x, k) => (
          <li key={`${x.label}-${k}`} className="flex items-start gap-2.5 text-[0.8438rem]">
            <input type="checkbox" className="mt-0.5 h-4 w-4" checked={x.done} disabled={pending} onChange={(e) => save(list.map((y, j) => (j === k ? { ...y, done: e.target.checked } : y)))} aria-label={x.label} />
            <span className={cn("flex-1", x.done && "text-ink-muted line-through")}>{x.label}{x.done && x.by ? <span className="ml-1.5 text-[0.7188rem] text-ink-faint no-underline">({x.by})</span> : null}</span>
            <button type="button" onClick={() => save(list.filter((_, j) => j !== k))} className="text-[0.7188rem] text-ink-faint hover:text-rose-700" aria-label={`Remove ${x.label}`}>Remove</button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2"><Input value={add} onChange={(e) => setAdd(e.target.value)} placeholder="Add a check" aria-label="Add a check" /><Button disabled={!add.trim() || pending} onClick={() => { save([...list, { label: add.trim(), done: false }]); setAdd(""); }}>Add</Button></div>
      <Status m={msg} />
    </div>
  );
}

export function BillTime({ id, unbilled, rate, currency, hasClient }: { id: string; unbilled: number; rate: number; currency: string; hasClient: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  if (!unbilled) return <p className="text-[0.7812rem] text-ink-muted">Log billable time in the work log and it can be invoiced from here at {money(rate, currency)}/hr + GST.</p>;
  const l = timeLine(unbilled, rate, "", null);
  return (
    <div className="space-y-2">
      <p className="text-[0.8125rem] text-ink">{l.quantity} h × {money(l.unit_amount, currency)} inc GST = <strong>{money(l.quantity * l.unit_amount, currency)}</strong></p>
      <Button disabled={pending || !hasClient} onClick={() => start(async () => {
        setMsg(null);
        const r = await billTime(id);
        if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
        router.push(`/invoices/${r.data}`);
      })}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}Raise draft invoice</Button>
      {!hasClient && <p className="text-[0.7188rem] text-ink-muted">Choose the client first.</p>}
      <Status m={msg} />
    </div>
  );
}

export function DeleteTicket({ id }: { id: string }) {
  const router = useRouter();
  const [sure, setSure] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  return sure ? (
    <div className="space-y-2 rounded-lg border border-rose-200 bg-rose-50/60 p-3">
      <p className="text-[0.7812rem] text-rose-800">Delete this ticket and its whole log? This can't be undone.</p>
      <div className="flex gap-2">
        <Button variant="danger" size="sm" disabled={pending} onClick={() => start(async () => { const r = await deleteTicket(id); if (!r.ok) { setMsg({ ok: false, text: r.error }); return; } router.push("/nerd-herd/tickets"); })}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}Delete</Button>
        <Button size="sm" variant="ghost" onClick={() => setSure(false)}>Keep it</Button>
      </div>
      <Status m={msg} />
    </div>
  ) : <button type="button" onClick={() => setSure(true)} className="text-[0.75rem] text-ink-faint hover:text-rose-700">Delete ticket</button>;
}
