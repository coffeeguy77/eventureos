"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Building2, Check, Loader2, MapPin, Phone, Search, UserPlus, Users, Video, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import type { ApptKind, DaySlots } from "@/lib/appointments/core";
import type { ClientMatch } from "@/lib/nerdherd/from-enquiry";
import { apptBook, apptClientContacts, apptFindClients, apptFreeTimes, type ClientContact } from "@/app/(app)/calendar/appointment-actions";
import { SlotPicker } from "@/components/meet/slot-picker";

const KIND: Record<ApptKind, { label: string; icon: typeof Video }> = { video: { label: "Video", icon: Video }, phone: { label: "Phone", icon: Phone }, in_person: { label: "In person", icon: MapPin } };
const dur = (m: number) => (m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m / 60} h`);
const blank = { firstName: "", lastName: "", email: "", phone: "", company: "" };
export interface Prefill { enquiryId: string; customerId: string | null; customerName: string | null; contactId: string | null; person: typeof blank; topic: string }

/** Book a client meeting: pick a client (or start a new one in the CRM), then a time from your free slots. */
export function BookMeeting({ prefill, accent, tz, me, people, durations, kinds, defaults, onClose, onBooked }: {
  prefill: Prefill | null; accent: string; tz: string; me: string; people: { id: string; name: string }[]; durations: number[]; kinds: ApptKind[]; defaults: { location: string; meetingUrl: string };
  onClose: () => void; onBooked: (id: string) => void;
}) {
  const [mode, setMode] = useState<"find" | "new">(prefill && !prefill.customerId ? "new" : "find");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<ClientMatch[]>([]);
  const [client, setClient] = useState<{ id: string; name: string } | null>(prefill?.customerId ? { id: prefill.customerId, name: prefill.customerName ?? "Client" } : null);
  const [contacts, setContacts] = useState<ClientContact[]>([]);
  const [contactId, setContactId] = useState<string>(prefill?.contactId ?? (prefill?.customerId ? "new" : ""));
  const [person, setPerson] = useState(prefill?.person ?? blank);
  const [title, setTitle] = useState("Meeting");
  const [kind, setKind] = useState<ApptKind>(kinds[0] ?? "video");
  const allDur = [...new Set([...durations, 30, 60])].sort((a, b) => a - b);
  const [duration, setDuration] = useState(durations[0] ?? 30);
  const [days, setDays] = useState<DaySlots[] | null>(null);
  const [slot, setSlot] = useState<{ date: string; time: string } | null>(null);
  const [manual, setManual] = useState(false);
  const [mDate, setMDate] = useState(""); const [mTime, setMTime] = useState("10:00");
  const [location, setLocation] = useState(defaults.location);
  const [meetingUrl, setMeetingUrl] = useState(defaults.meetingUrl);
  const [assigned, setAssigned] = useState(me);
  const [topic, setTopic] = useState(prefill?.topic ?? ""); const [notes, setNotes] = useState("");
  const [email, setEmail] = useState(false); const [confirm, setConfirm] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; isNewClient: boolean; emailed: string | null } | null>(null);
  const [pending, start] = useTransition();
  const [searching, startSearch] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  useEffect(() => { setDays(null); setSlot(null); start(async () => { const r = await apptFreeTimes(duration); if (r.ok) setDays(r.days); else setError(r.error); }); }, [duration]);
  // from an enquiry with a client: load their contacts so "Who's coming?" works
  useEffect(() => {
    if (!prefill?.customerId) return;
    void apptClientContacts(prefill.customerId).then((r) => { if (r.ok) setContacts(r.list); });
  }, [prefill?.customerId]);
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) { setHits([]); return; }
    timer.current = setTimeout(() => startSearch(async () => { const r = await apptFindClients(q); if (r.ok) setHits(r.list); }), 250);
  }, [q]);

  const pick = (c: ClientMatch) => {
    setClient({ id: c.id, name: c.name }); setHits([]); setQ("");
    start(async () => {
      const r = await apptClientContacts(c.id);
      if (!r.ok) { setError(r.error); return; }
      setContacts(r.list);
      const first = r.list.find((x) => x.email) ?? r.list[0];
      if (first) { setContactId(first.id); setPerson({ firstName: first.firstName, lastName: first.lastName, email: first.email ?? "", phone: first.phone ?? "", company: r.company }); }
      else { setContactId("new"); setPerson({ ...blank, email: r.email ?? "", phone: r.phone ?? "", company: r.company }); }
    });
  };
  const chooseContact = (id: string) => {
    setContactId(id);
    const c = contacts.find((x) => x.id === id);
    setPerson(c ? { firstName: c.firstName, lastName: c.lastName, email: c.email ?? "", phone: c.phone ?? "", company: c.company } : { ...blank, company: client?.name ?? "" });
  };
  const when = manual ? (mDate && mTime ? { date: mDate, time: mTime } : null) : slot;
  const ready = !!when && !!person.email.trim() && !!person.firstName.trim() && (mode === "new" || !!client);
  const submit = () => start(async () => {
    setError(null);
    if (!when) return;
    const r = await apptBook({ enquiryId: prefill?.enquiryId ?? null, customerId: mode === "find" ? client?.id ?? null : null, contactId: mode === "find" && contactId !== "new" ? contactId : null, client: person, title, kind, date: when.date, time: when.time, duration, notes, topic, location, meetingUrl, assignedTo: assigned, needsConfirm: email && confirm, email });
    if (r.ok) setDone(r); else setError(r.error);
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
      <div role="dialog" aria-modal="true" className="pt-safe relative flex max-h-[100dvh] w-full max-w-4xl flex-col overflow-hidden bg-surface shadow-pop sm:max-h-[92dvh] sm:rounded-3xl">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-6 sm:py-4" style={{ boxShadow: `inset 0 3px 0 ${accent}` }}>
          <h2 className="text-[1.0625rem] font-semibold text-ink">Book a meeting</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-ink-faint hover:bg-canvas hover:text-ink"><X className="h-5 w-5" /></button>
        </div>

        {done ? (
          <div className="flex-1 overflow-y-auto px-6 py-10 text-center">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full text-white" style={{ background: accent }}><Check className="h-8 w-8" strokeWidth={3} /></span>
            <p className="mt-4 text-[1.375rem] font-bold text-ink">Booked</p>
            <ul className="mx-auto mt-3 max-w-sm space-y-1.5 text-left text-[0.9375rem] text-ink-muted">
              <li>✓ On your calendar{email ? "" : " (no email sent)"}</li>
              {done.isNewClient && <li>✓ New client added to your CRM — lead started</li>}
              <li>✓ Client portal ready — they sign in with {person.email}</li>
              {email && !done.emailed && <li>✓ Invite emailed{confirm ? " — they can confirm or suggest another time" : ""}</li>}
              {done.emailed && <li className="text-rose-600">Email not sent: {done.emailed}</li>}
            </ul>
            <div className="mt-6 flex justify-center gap-2"><Button onClick={onClose}>Close</Button><Button variant="primary" onClick={() => onBooked(done.id)}>Open meeting</Button></div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto lg:grid lg:grid-cols-2 lg:divide-x lg:divide-line">
              {/* who */}
              <section className="space-y-4 p-4 sm:p-6">
                <div className="flex gap-1 rounded-xl bg-canvas p-1 ring-1 ring-line">
                  <button type="button" onClick={() => setMode("find")} className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[0.8125rem] font-medium", mode === "find" ? "bg-surface text-ink shadow-sm" : "text-ink-muted")}><Users className="h-4 w-4" />Existing client</button>
                  <button type="button" onClick={() => { setMode("new"); setClient(null); setPerson(blank); }} className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[0.8125rem] font-medium", mode === "new" ? "bg-surface text-ink shadow-sm" : "text-ink-muted")}><UserPlus className="h-4 w-4" />New client</button>
                </div>
                {mode === "find" && !client && (
                  <div>
                    <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" /><Input autoFocus className="pl-9" placeholder="Search clients, contacts, phone or domain" value={q} onChange={(e) => setQ(e.target.value)} />{searching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-ink-faint" />}</div>
                    {hits.length > 0 && <ul className="mt-2 max-h-64 divide-y divide-line overflow-y-auto rounded-xl ring-1 ring-line">{hits.map((h) => <li key={h.id}><button type="button" onClick={() => pick(h)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-canvas"><Building2 className="h-4 w-4 shrink-0 text-ink-faint" /><span className="min-w-0 flex-1"><span className="block truncate font-medium text-ink">{h.name}</span><span className="block truncate text-[0.75rem] text-ink-muted">{h.why}</span></span></button></li>)}</ul>}
                    {q.trim().length >= 2 && !searching && hits.length === 0 && <button type="button" onClick={() => { setMode("new"); setPerson({ ...blank, company: q.trim() }); }} className="mt-2 w-full rounded-xl px-3 py-3 text-left text-[0.875rem] ring-1 ring-dashed ring-line hover:bg-canvas">No match — <span className="font-semibold text-brand-600">add “{q.trim()}” as a new client</span></button>}
                  </div>
                )}
                {mode === "find" && client && (
                  <div className="flex items-center gap-3 rounded-xl bg-canvas p-3 ring-1 ring-line"><Building2 className="h-5 w-5 text-ink-faint" /><span className="min-w-0 flex-1 truncate font-semibold text-ink">{client.name}</span><button type="button" onClick={() => { setClient(null); setContacts([]); }} className="text-[0.8125rem] font-medium text-brand-600">Change</button></div>
                )}
                {mode === "find" && client && (
                  <div><Label>Who&apos;s coming?</Label><Select value={contactId} onChange={(e) => chooseContact(e.target.value)}>{contacts.map((c) => <option key={c.id} value={c.id}>{`${c.firstName} ${c.lastName}`.trim()}{c.email ? ` — ${c.email}` : " (no email)"}</option>)}<option value="new">+ Someone new at {client.name}</option></Select></div>
                )}
                {(mode === "new" || (client && (contactId === "new" || !person.email))) && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div><Label>First name</Label><Input value={person.firstName} onChange={(e) => setPerson({ ...person, firstName: e.target.value })} /></div>
                    <div><Label>Last name</Label><Input value={person.lastName} onChange={(e) => setPerson({ ...person, lastName: e.target.value })} /></div>
                    <div><Label>Email</Label><Input type="email" value={person.email} onChange={(e) => setPerson({ ...person, email: e.target.value })} /></div>
                    <div><Label>Phone</Label><Input type="tel" value={person.phone} onChange={(e) => setPerson({ ...person, phone: e.target.value })} /></div>
                    {mode === "new" && <div className="sm:col-span-2"><Label hint="Leave blank for a person, not a business">Business</Label><Input value={person.company} onChange={(e) => setPerson({ ...person, company: e.target.value })} /></div>}
                  </div>
                )}
                {mode === "new" && <p className="rounded-xl bg-brand-500/10 px-3 py-2.5 text-[0.8125rem] text-ink">They&apos;ll be added to your clients with a new lead, and get their own portal — quotes, invoices and support in one place.</p>}
                <div><Label>What&apos;s it about?</Label><Textarea rows={3} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. New website, hosting move, SEO review" /></div>
              </section>

              {/* when */}
              <section className="space-y-4 border-t border-line p-4 sm:p-6 lg:border-t-0">
                <div><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
                <div className="flex flex-wrap gap-2">{(["video", "phone", "in_person"] as ApptKind[]).map((k) => { const I = KIND[k].icon; return <button key={k} type="button" onClick={() => setKind(k)} className={cn("flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[0.8125rem] font-medium ring-1", kind === k ? "text-white ring-transparent" : "text-ink ring-line")} style={kind === k ? { background: accent } : undefined}><I className="h-4 w-4" />{KIND[k].label}</button>; })}</div>
                {kind === "video" && <Input placeholder="Meeting link (https://…)" value={meetingUrl} onChange={(e) => setMeetingUrl(e.target.value)} />}
                {kind === "in_person" && <Input placeholder="Where" value={location} onChange={(e) => setLocation(e.target.value)} />}
                <div className="flex flex-wrap gap-2">{allDur.map((d) => <button key={d} type="button" onClick={() => setDuration(d)} className={cn("rounded-full px-3.5 py-1.5 text-[0.8125rem] font-semibold ring-1", duration === d ? "text-white ring-transparent" : "text-ink ring-line")} style={duration === d ? { background: accent } : undefined}>{dur(d)}</button>)}</div>
                <div className="flex items-center justify-between"><p className="text-[0.8125rem] font-semibold text-ink">{manual ? "Any time" : "Your free times"}</p><button type="button" onClick={() => setManual(!manual)} className="text-[0.8125rem] font-medium text-brand-600">{manual ? "Show free times" : "Pick any time"}</button></div>
                {manual ? <div className="grid grid-cols-2 gap-3"><Input type="date" value={mDate} onChange={(e) => setMDate(e.target.value)} /><Input type="time" step={300} value={mTime} onChange={(e) => setMTime(e.target.value)} /></div>
                  : !days ? <p className="flex items-center gap-2 text-[0.875rem] text-ink-muted"><Loader2 className="h-4 w-4 animate-spin" />Finding free times…</p> : <SlotPicker days={days} value={slot} onChange={setSlot} accent={accent} />}
                <p className="text-[0.75rem] text-ink-faint">Times are {tz.replace("_", " ")}.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div><Label>With</Label><Select value={assigned} onChange={(e) => setAssigned(e.target.value)}>{people.map((p) => <option key={p.id} value={p.id}>{p.id === me ? `Me (${p.name})` : p.name}</option>)}</Select></div>
                  <div><Label>Private notes</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Only your team sees these" /></div>
                </div>
              </section>
            </div>

            <div className="pb-safe space-y-3 border-t border-line bg-canvas/60 px-4 py-3 sm:px-6">
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-[0.8125rem] text-ink">
                <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4" checked={email} onChange={(e) => setEmail(e.target.checked)} />Email the client an invite</label>
                {email && <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />Ask them to confirm (or suggest another time)</label>}
              </div>
              {error && <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-[0.8125rem] font-medium text-rose-600">{error}</p>}
              <div className="flex gap-2"><Button className="h-11 flex-1 sm:flex-none" onClick={onClose}>Cancel</Button><Button variant="primary" className="h-11 flex-[2] sm:ml-auto sm:flex-none sm:px-8" disabled={!ready || pending} onClick={submit}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Book meeting</Button></div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
