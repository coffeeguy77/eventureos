"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormError, Input, Label, Select, Textarea } from "@/components/ui/form";
import { KINDS, KIND_LABEL, PRIORITIES, PRIORITY, type Priority, type TicketKind } from "@/lib/nerdherd/core";
import { createTicket } from "@/app/(app)/nerd-herd/actions";

export function TicketForm({ clients, sites, members, initial }: {
  clients: { id: string; name: string }[]; sites: { id: string; domain: string; customer_id: string | null }[]; members: { id: string; name: string }[];
  initial: { customer_id: string | null; website_id: string | null; kind: TicketKind };
}) {
  const router = useRouter();
  const [client, setClient] = useState(clients.find((c) => c.id === initial.customer_id)?.name ?? "");
  const [site, setSite] = useState(initial.website_id ?? "");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<TicketKind>(initial.kind);
  const [priority, setPriority] = useState<Priority>("normal");
  const [assignee, setAssignee] = useState("");
  const [due, setDue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const clientId = clients.find((c) => c.name.toLowerCase() === client.trim().toLowerCase())?.id ?? null;
  const siteList = useMemo(() => (clientId ? sites.filter((s) => s.customer_id === clientId) : sites), [clientId, sites]);

  const submit = () => start(async () => {
    setError(null);
    if (client.trim() && !clientId) { setError("Choose the client from the list, or leave it blank."); return; }
    const r = await createTicket({ customer_id: clientId, website_id: site || null, subject, description, kind, priority, assigned_to: assignee || null, due_date: due || null });
    if (!r.ok) { setError(r.error); return; }
    router.push(`/nerd-herd/tickets/${r.data}`);
  });

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="t-client" hint="optional">Client</Label>
          <Input id="t-client" list="t-clients" value={client} onChange={(e) => { setClient(e.target.value); setSite(""); }} placeholder="Start typing a client's name" />
          <datalist id="t-clients">{clients.map((c) => <option key={c.id} value={c.name} />)}</datalist>
        </div>
        <div>
          <Label htmlFor="t-site" hint="optional">Website</Label>
          <Select id="t-site" value={site} onChange={(e) => setSite(e.target.value)}>
            <option value="">—</option>
            {siteList.map((s) => <option key={s.id} value={s.id}>{s.domain}</option>)}
          </Select>
        </div>
      </div>
      <div><Label htmlFor="t-subject">Subject</Label><Input id="t-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Contact form isn't sending emails" autoFocus /></div>
      <div><Label htmlFor="t-desc" hint="internal note">Details</Label><Textarea id="t-desc" rows={5} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What's wrong, what they asked for, logins needed…" /></div>
      <div className="grid gap-3 sm:grid-cols-4">
        <div><Label htmlFor="t-kind">Type</Label><Select id="t-kind" value={kind} onChange={(e) => setKind(e.target.value as TicketKind)}>{KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</Select></div>
        <div><Label htmlFor="t-pri">Priority</Label><Select id="t-pri" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>{PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY[p].label}</option>)}</Select></div>
        <div><Label htmlFor="t-who">Assign to</Label><Select id="t-who" value={assignee} onChange={(e) => setAssignee(e.target.value)}><option value="">Unassigned</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select></div>
        <div><Label htmlFor="t-due" hint="optional">Due</Label><Input id="t-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>
      </div>
      <FormError message={error} />
      <Button variant="primary" disabled={pending} onClick={submit}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Create ticket</Button>
    </div>
  );
}
