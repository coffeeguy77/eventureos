"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Search, Ticket, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { findClients, findTickets, ticketFromEnquiry, ticketStart } from "@/app/(app)/nerd-herd/enquiry-actions";
import type { ClientMatch, Sender, TicketHit } from "@/lib/nerdherd/from-enquiry";

const TAB_IDEAS = ["Domain", "Hosting", "Email", "Website", "Updates", "Billing"];
type TabDraft = { name: string; assignedTo: string | null };

/**
 * "Create ticket" on an enquiry: a new ticket built from the email (or add it to an existing one), matched to the right
 * client, the sender saved as a contact on the client's file, and tabs for each issue — each with its own person.
 */
export function TicketFromEnquiry({ enquiryId, className }: { enquiryId: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="primary" className={className} onClick={() => setOpen(true)}><Ticket className="h-4 w-4" />Create ticket</Button>
      {open && <Dialog enquiryId={enquiryId} onClose={() => setOpen(false)} />}
    </>
  );
}

function Dialog({ enquiryId, onClose }: { enquiryId: string; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<{ sender: Sender; subject: string; body: string; matches: ClientMatch[]; tickets: TicketHit[]; members: { id: string; name: string }[] } | null>(null);
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [client, setClient] = useState<ClientMatch | null>(null);
  const [clientQ, setClientQ] = useState("");
  const [clientHits, setClientHits] = useState<ClientMatch[] | null>(null);
  const [ticket, setTicket] = useState<TicketHit | null>(null);
  const [ticketQ, setTicketQ] = useState("");
  const [ticketHits, setTicketHits] = useState<TicketHit[] | null>(null);
  const [contact, setContact] = useState({ save: true, firstName: "", lastName: "", email: "", phone: "", position: "" });
  const [form, setForm] = useState({ subject: "", body: "", kind: "support", priority: "normal" });
  const [tabs, setTabs] = useState<TabDraft[]>([]);
  const [newTab, setNewTab] = useState<TabDraft>({ name: "", assignedTo: null });

  useEffect(() => {
    void ticketStart(enquiryId).then((r) => {
      if (!r.ok) { setError(r.error); return; }
      setLoaded(r);
      setClient(r.matches[0] ?? null);
      setContact({ save: true, firstName: r.sender.firstName, lastName: r.sender.lastName, email: r.sender.email ?? "", phone: r.sender.phone ?? "", position: "" });
      setForm((f) => ({ ...f, subject: r.subject, body: r.body }));
      if (r.tickets.length) setTicketHits(r.tickets);
    });
  }, [enquiryId]);

  const searchC = () => start(async () => { const r = await findClients(clientQ); setClientHits(r.ok ? r.list : []); if (!r.ok) setError(r.error); });
  const searchT = () => start(async () => { const r = await findTickets(ticketQ); setTicketHits(r.ok ? r.list : []); if (!r.ok) setError(r.error); });
  const addTab = (name = newTab.name) => { if (!name.trim() || tabs.some((t) => t.name.toLowerCase() === name.trim().toLowerCase())) return; setTabs([...tabs, { name: name.trim(), assignedTo: newTab.assignedTo }]); setNewTab({ name: "", assignedTo: newTab.assignedTo }); };
  const submit = () => start(async () => {
    setError(null);
    const r = await ticketFromEnquiry({ enquiryId, mode, ticketId: ticket?.id ?? null, customerId: client?.id ?? null, contact, subject: form.subject, body: form.body, kind: form.kind as "support", priority: form.priority as "normal", tabs });
    if (!r.ok) { setError(r.error); return; }
    router.push(`/nerd-herd/tickets/${r.id}`);
  });

  const members = loaded?.members ?? [];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[94dvh] w-full max-w-3xl overflow-y-auto rounded-t-2xl bg-surface p-5 ring-1 ring-line sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-[1.0625rem] font-semibold text-ink">Create a ticket from this email</h2>
          <button onClick={onClose} className="rounded-md p-1.5 text-ink-faint hover:bg-canvas hover:text-ink" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        {!loaded && !error && <p className="flex items-center gap-2 text-[0.875rem] text-ink-muted"><Loader2 className="h-4 w-4 animate-spin" />Reading the email and looking for the client…</p>}
        {loaded && (
          <div className="space-y-5 text-[0.8125rem]">
            <div className="flex rounded-lg bg-canvas p-0.5 ring-1 ring-line sm:inline-flex">
              {(["new", "existing"] as const).map((m) => <button key={m} onClick={() => setMode(m)} className={cn("flex-1 rounded-md px-4 py-1.5 font-medium", mode === m ? "bg-surface text-ink shadow-sm" : "text-ink-muted")}>{m === "new" ? "New ticket" : "Add to an existing ticket"}</button>)}
            </div>

            {/* the client */}
            <section className="space-y-2">
              <p className="font-semibold text-ink">Client</p>
              {loaded.matches.length > 0 && (
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {loaded.matches.map((m) => (
                    <label key={m.id} className={cn("flex cursor-pointer items-start gap-2 rounded-lg px-3 py-2 ring-1", client?.id === m.id ? "bg-canvas ring-brand-500" : "ring-line")}>
                      <input type="radio" className="mt-0.5" checked={client?.id === m.id} onChange={() => setClient(m)} />
                      <span className="min-w-0"><span className="block font-medium text-ink">{m.name}</span><span className="block text-[0.75rem] text-ink-muted">{m.why}</span></span>
                    </label>
                  ))}
                </div>
              )}
              {client && !loaded.matches.some((m) => m.id === client.id) && <p className="rounded-lg bg-canvas px-3 py-2 ring-1 ring-brand-500"><b className="text-ink">{client.name}</b> <span className="text-ink-muted">· {client.why}</span></p>}
              <div className="flex gap-2">
                <Input value={clientQ} onChange={(e) => setClientQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); searchC(); } }} placeholder={loaded.sender.domain ? `Search clients — e.g. ${loaded.sender.domain}, a name or phone` : "Search clients by name, email, phone, contact or website"} />
                <Button size="sm" disabled={pending || clientQ.trim().length < 2} onClick={searchC}><Search className="h-3.5 w-3.5" />Search</Button>
              </div>
              {clientHits && (clientHits.length ? (
                <div className="flex flex-wrap gap-1.5">{clientHits.map((m) => <button key={m.id} onClick={() => { setClient(m); setClientHits(null); }} className="rounded-full bg-canvas px-3 py-1 ring-1 ring-line hover:ring-brand-500"><b className="text-ink">{m.name}</b> <span className="text-ink-muted">· {m.why}</span></button>)}</div>
              ) : <p className="text-ink-muted">No clients found.</p>)}
              <label className="flex items-center gap-2 text-ink-muted"><input type="radio" checked={!client} onChange={() => setClient(null)} />No client yet</label>
            </section>

            {/* the person who emailed */}
            <section className="space-y-2">
              <p className="font-semibold text-ink">Who emailed <span className="font-normal text-ink-muted">— they may not be the client&apos;s main contact</span></p>
              <div className="grid gap-2 sm:grid-cols-3">
                <div><Label>First name</Label><Input value={contact.firstName} onChange={(e) => setContact({ ...contact, firstName: e.target.value })} /></div>
                <div><Label>Last name</Label><Input value={contact.lastName} onChange={(e) => setContact({ ...contact, lastName: e.target.value })} /></div>
                <div><Label hint="optional">Position</Label><Input value={contact.position} onChange={(e) => setContact({ ...contact, position: e.target.value })} placeholder="e.g. Office manager" /></div>
                <div className="sm:col-span-2"><Label>Email</Label><Input type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} /></div>
                <div><Label>Phone</Label><Input type="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} /></div>
              </div>
              <label className={cn("flex items-center gap-2", client ? "text-ink" : "text-ink-faint")}><input type="checkbox" disabled={!client} checked={contact.save && !!client} onChange={(e) => setContact({ ...contact, save: e.target.checked })} />Save them on {client ? `${client.name}'s` : "the client's"} file (added, or their details updated)</label>
            </section>

            {mode === "new" ? (
              <section className="space-y-2">
                <p className="font-semibold text-ink">Ticket</p>
                <div><Label>Subject</Label><Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></div>
                <div><Label hint="from the email — edit as you like">What they asked</Label><Textarea rows={6} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div><Label>Type</Label><Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}><option value="support">Support</option><option value="hosting">Hosting</option><option value="project">Project</option><option value="billing">Billing</option><option value="other">Other</option></Select></div>
                  <div><Label>Priority</Label><Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></Select></div>
                </div>
              </section>
            ) : (
              <section className="space-y-2">
                <p className="font-semibold text-ink">Which ticket?</p>
                <div className="flex gap-2">
                  <Input value={ticketQ} onChange={(e) => setTicketQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); searchT(); } }} placeholder="Ticket #, domain, client, contact, phone or subject" />
                  <Button size="sm" disabled={pending || !ticketQ.trim()} onClick={searchT}><Search className="h-3.5 w-3.5" />Search</Button>
                </div>
                {ticketHits && (ticketHits.length ? (
                  <ul className="divide-y divide-line rounded-lg ring-1 ring-line">
                    {ticketHits.map((t) => (
                      <li key={t.id}><label className={cn("flex cursor-pointer items-center gap-2 px-3 py-2", ticket?.id === t.id && "bg-canvas")}>
                        <input type="radio" checked={ticket?.id === t.id} onChange={() => setTicket(t)} />
                        <span className="w-12 text-ink-faint">#{t.number}</span>
                        <span className="min-w-0 flex-1"><span className="block truncate font-medium text-ink">{t.subject}</span><span className="block truncate text-[0.75rem] text-ink-muted">{[t.customer, t.domain, t.status.replace(/_/g, " ")].filter(Boolean).join(" · ")}</span></span>
                      </label></li>
                    ))}
                  </ul>
                ) : <p className="text-ink-muted">No tickets found.</p>)}
                <p className="text-[0.75rem] text-ink-faint">The email is added to the ticket&apos;s conversation (and reopens it if it was done).</p>
              </section>
            )}

            {/* tabs: one per issue, each with its own person */}
            <section className="space-y-2">
              <p className="font-semibold text-ink">Tabs <span className="font-normal text-ink-muted">— split the job into issues, each with its own person (optional)</span></p>
              {tabs.length > 0 && (
                <ul className="space-y-1.5">
                  {tabs.map((t, k) => (
                    <li key={k} className="flex flex-wrap items-center gap-2 rounded-lg bg-canvas px-3 py-2 ring-1 ring-line">
                      <b className="min-w-[6rem] text-ink">{t.name}</b>
                      <Select className="w-48" value={t.assignedTo ?? ""} onChange={(e) => setTabs(tabs.map((x, j) => (j === k ? { ...x, assignedTo: e.target.value || null } : x)))}><option value="">Unassigned</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select>
                      <button onClick={() => setTabs(tabs.filter((_, j) => j !== k))} className="ml-auto text-ink-faint hover:text-rose-700" aria-label="Remove"><X className="h-4 w-4" /></button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap gap-1.5">{TAB_IDEAS.filter((x) => !tabs.some((t) => t.name === x)).map((x) => <button key={x} onClick={() => addTab(x)} className="rounded-full px-3 py-1 text-ink-muted ring-1 ring-line hover:text-ink">+ {x}</button>)}</div>
              <div className="flex flex-wrap gap-2">
                <Input className="min-w-[10rem] flex-1" value={newTab.name} onChange={(e) => setNewTab({ ...newTab, name: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTab(); } }} placeholder="Another tab, e.g. SSL" />
                <Select className="w-48" value={newTab.assignedTo ?? ""} onChange={(e) => setNewTab({ ...newTab, assignedTo: e.target.value || null })}><option value="">Unassigned</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select>
                <Button size="sm" disabled={!newTab.name.trim()} onClick={() => addTab()}><Plus className="h-3.5 w-3.5" />Add tab</Button>
              </div>
            </section>

            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              <Button variant="primary" disabled={pending || (mode === "existing" && !ticket) || (mode === "new" && !form.subject.trim())} onClick={submit}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{mode === "new" ? "Create ticket" : `Add to #${ticket?.number ?? "…"}`}</Button>
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
            </div>
          </div>
        )}
        {error && <p className="mt-3 text-[0.8125rem] text-rose-700">{error}</p>}
      </div>
    </div>
  );
}
