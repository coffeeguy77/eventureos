"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail, MessageSquare, Plus, Search, Trash2, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea, FormError } from "@/components/ui/form";
import { OFFERS, OFFER_LABEL, type ClubRates, type Offer, type StandardOrder } from "@/lib/club/core";
import {
  addClubPerson, addFoundPeople, addToClub, cancelClubBooking, findClubPeople, removeClubPerson, resyncClubRuns, saveClubAccount, saveClubSettings,
  searchClubCustomers, sendClubWelcomes, setClubEnabled, updateClubPerson, type FoundPerson,
} from "@/app/(app)/cart-club/actions";

const ok = "rounded-lg bg-emerald-50 px-3 py-2 text-[0.7812rem] text-emerald-800 ring-1 ring-inset ring-emerald-100";

/* ------------------------------------------------------------------ add a client / switch on-off */

export function AddClient() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ id: string; name: string; email: string | null }[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const search = (v: string) => { setQ(v); start(async () => { const r = await searchClubCustomers(v); if (r.ok) setHits(r.data); else setErr(r.error); }); };
  const add = (id: string) => start(async () => { const r = await addToClub(id); if (r.ok) router.push(`/cart-club/${r.data}`); else setErr(r.error); });
  return (
    <div className="space-y-2 p-4 sm:p-5">
      <Label>Add a client</Label>
      <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" /><Input value={q} onChange={(e) => search(e.target.value)} placeholder="Search your clients…" className="pl-9" /></div>
      {hits.length > 0 && (
        <ul className="divide-y divide-line rounded-lg ring-1 ring-line">
          {hits.map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-3 px-3 py-2 text-[0.8125rem]">
              <span className="min-w-0"><span className="font-medium text-ink">{h.name}</span>{h.email && <span className="block truncate text-[0.75rem] text-ink-muted">{h.email}</span>}</span>
              <Button size="sm" variant="primary" disabled={busy} onClick={() => add(h.id)}>Add</Button>
            </li>
          ))}
        </ul>
      )}
      <FormError message={err} />
    </div>
  );
}

export function ClubToggle({ id, enabled, customerId, compact }: { id: string | null; enabled: boolean; customerId: string; compact?: boolean }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const run = () => start(async () => {
    setErr(null);
    const r = id ? await setClubEnabled(id, !enabled) : await addToClub(customerId);
    if (!r.ok) setErr(r.error); else if (!id && typeof r.data === "string") router.push(`/cart-club/${r.data}`); else router.refresh();
  });
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button size="sm" variant={enabled ? "secondary" : "primary"} disabled={busy} onClick={run}>{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{id ? (enabled ? (compact ? "Take off Cart Club" : "Switch off") : "Switch on") : "Add to Cart Club"}</Button>
      {err && <span className="text-[0.75rem] text-rose-600">{err}</span>}
    </span>
  );
}

/* ------------------------------------------------------------------ section settings */

export function ClubSettingsForm({ name, codes, base, eventureUrl }: { name: string; codes: Record<string, string>; base: string | null; eventureUrl: string }) {
  const router = useRouter();
  const [v, setV] = useState({ name, base: base ?? "", codes });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();
  const save = () => start(async () => { const r = await saveClubSettings(v); setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error }); if (r.ok) router.refresh(); });
  return (
    <div className="space-y-4 p-4 sm:p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label>Section name</Label><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} maxLength={40} /></div>
        <div><Label hint="optional">Your own domain</Label><Input value={v.base} onChange={(e) => setV({ ...v, base: e.target.value })} placeholder="https://www.example.com.au" /></div>
      </div>
      <p className="text-[0.75rem] text-ink-muted">Leave the domain blank until it sends <b>/clientname</b> to EventureOS — until then links use {eventureUrl}/&lt;client&gt;.</p>
      <div>
        <Label hint="invoice lines">Accounting item codes</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {(["cart", "delivery", "barista", "coffee", "van"] as const).map((k) => (
            <div key={k}><span className="text-[0.6875rem] text-ink-faint">{({ cart: "Cart hire", delivery: "Delivery", barista: "Barista", coffee: "Coffees", van: "Van hire" })[k]}</span><Input value={v.codes[k] ?? ""} onChange={(e) => setV({ ...v, codes: { ...v.codes, [k]: e.target.value } })} /></div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3"><Button variant="primary" disabled={busy} onClick={save}>Save</Button>{msg && <span className={msg.ok ? "text-[0.8125rem] text-emerald-700" : "text-[0.8125rem] text-rose-600"}>{msg.text}</span>}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ a client's settings */

export interface AccountView {
  id: string; slug: string; name: string; offers: Offer[]; rates: ClubRates; billing: "on_booking" | "monthly"; due_rule: "after_invoice" | "before_event"; due_days: number;
  standard_orders: StandardOrder[]; wholesale_customer_id: string | null; email_invoices: boolean; follow_up: boolean; notes: string | null;
}

export function AccountForm({ a, wholesale, urlPrefix }: { a: AccountView; wholesale: { id: string; name: string }[]; urlPrefix: string }) {
  const router = useRouter();
  const [v, setV] = useState({ ...a, notes: a.notes ?? "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();
  const rate = (k: keyof ClubRates, val: string) => setV({ ...v, rates: { ...v.rates, [k]: Number(val) || 0 } });
  const has = (o: Offer) => v.offers.includes(o);
  const save = () => start(async () => {
    const r = await saveClubAccount(a.id, { ...v, rates: v.rates as unknown as Record<string, unknown>, standard_orders: v.standard_orders });
    setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error });
    if (r.ok) router.refresh();
  });
  const so = (i: number, patch: Partial<StandardOrder>) => setV({ ...v, standard_orders: v.standard_orders.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  return (
    <div className="space-y-5 p-4 sm:p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label>Business name (shown on their page)</Label><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></div>
        <div><Label hint={`${urlPrefix}/…`}>Their address</Label><Input value={v.slug} onChange={(e) => setV({ ...v, slug: e.target.value.toLowerCase() })} /></div>
      </div>

      <div>
        <Label>They can book</Label>
        <div className="flex flex-wrap gap-2">
          {OFFERS.map((o) => (
            <label key={o} className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-[0.8125rem] ring-1 ring-inset ${has(o) ? "bg-brand-50 text-brand-800 ring-brand-200" : "bg-surface text-ink-muted ring-line-strong"}`}>
              <input type="checkbox" checked={has(o)} onChange={(e) => setV({ ...v, offers: e.target.checked ? [...v.offers, o] : v.offers.filter((x) => x !== o) })} />{OFFER_LABEL[o]}
            </label>
          ))}
        </div>
      </div>

      <div>
        <Label hint="ex GST">Their rates</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {has("cart") && <><Num label="Cart, per day" v={v.rates.cart} set={(x) => rate("cart", x)} /><Num label="Delivery run" v={v.rates.delivery} set={(x) => rate("delivery", x)} /></>}
          {has("van") && <Num label="Van, per day" v={v.rates.van} set={(x) => rate("van", x)} />}
          {has("baristas") && <><Num label="Barista, per hour" v={v.rates.barista} set={(x) => rate("barista", x)} /><Num label="Min hours / barista" v={v.rates.minHours} set={(x) => rate("minHours", x)} /><Num label="Setup hrs / barista" v={v.rates.setupHours} set={(x) => rate("setupHours", x)} step="0.25" /></>}
          {has("coffees") && <Num label="Per coffee" v={v.rates.coffee} set={(x) => rate("coffee", x)} step="0.1" />}
        </div>
        {has("cart") && <p className="mt-1.5 text-[0.75rem] text-ink-muted">One delivery run covers days with no more than 2 clear days between them; carts already on site for another of their bookings aren&apos;t charged again.</p>}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div><Label>Invoice</Label><Select value={v.billing} onChange={(e) => setV({ ...v, billing: e.target.value as AccountView["billing"] })}><option value="on_booking">When they book</option><option value="monthly">Month end (all bookings)</option></Select></div>
        <div><Label>Due</Label><Select value={v.billing === "monthly" ? "after_invoice" : v.due_rule} disabled={v.billing === "monthly"} onChange={(e) => setV({ ...v, due_rule: e.target.value as AccountView["due_rule"] })}><option value="after_invoice">Days after the invoice</option><option value="before_event">Days before the event</option></Select></div>
        <Num label="Days" v={v.due_days} set={(x) => setV({ ...v, due_days: Math.round(Number(x) || 0) })} />
      </div>

      <div className="space-y-2">
        <label className="flex items-start gap-2 text-[0.8125rem] text-ink"><input type="checkbox" className="mt-0.5" checked={v.email_invoices} onChange={(e) => setV({ ...v, email_invoices: e.target.checked })} /><span>Email the invoice to them automatically <span className="text-ink-muted">(otherwise it waits in Invoices for you to send)</span></span></label>
        <label className="flex items-start gap-2 text-[0.8125rem] text-ink"><input type="checkbox" className="mt-0.5" checked={v.follow_up} onChange={(e) => setV({ ...v, follow_up: e.target.checked })} /><span>Email a follow-up when a quote isn&apos;t booked a week before the date</span></label>
      </div>

      {(has("cart") || has("baristas") || has("coffees")) && (
        <div>
          <Label hint="one-tap orders on their page">Standard orders</Label>
          <div className="space-y-2">
            {v.standard_orders.map((s, i) => (
              <div key={i} className="grid grid-cols-2 items-end gap-2 rounded-lg bg-zinc-50 p-2 ring-1 ring-line sm:grid-cols-[minmax(0,1.6fr)_repeat(5,minmax(0,1fr))_auto]">
                <div className="col-span-2 sm:col-span-1"><span className="text-[0.6875rem] text-ink-faint">Name</span><Input value={s.name} onChange={(e) => so(i, { name: e.target.value })} /></div>
                <Num label="Carts" v={s.carts} set={(x) => so(i, { carts: Number(x) || 0 })} />
                <Num label="Vans" v={s.van} set={(x) => so(i, { van: Number(x) || 0 })} />
                <Num label="Baristas" v={s.baristas} set={(x) => so(i, { baristas: Number(x) || 0 })} />
                <Num label="Service hrs" v={s.hours} set={(x) => so(i, { hours: Number(x) || 0 })} step="0.5" />
                <Num label="Coffees" v={s.coffees} set={(x) => so(i, { coffees: Number(x) || 0 })} />
                <button type="button" onClick={() => setV({ ...v, standard_orders: v.standard_orders.filter((_, j) => j !== i) })} className="grid h-9 w-9 place-items-center rounded-lg text-ink-muted hover:bg-surface" aria-label="Remove standard order"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
          <Button size="sm" className="mt-2" onClick={() => setV({ ...v, standard_orders: [...v.standard_orders, { name: "Standard order", carts: 1, van: 0, baristas: 0, hours: 0, coffees: 0 }] })}><Plus className="h-3.5 w-3.5" />Add a standard order</Button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label hint="adds a Wholesale tab">Wholesale account</Label><Select value={v.wholesale_customer_id ?? ""} onChange={(e) => setV({ ...v, wholesale_customer_id: e.target.value || null })}><option value="">None</option>{wholesale.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</Select></div>
        <div><Label hint="only you see this">Notes</Label><Textarea value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} className="min-h-[38px]" /></div>
      </div>

      <div className="flex items-center gap-3"><Button variant="primary" disabled={busy} onClick={save}>{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Save settings</Button>{msg && <span className={msg.ok ? "text-[0.8125rem] text-emerald-700" : "text-[0.8125rem] text-rose-600"}>{msg.text}</span>}</div>
    </div>
  );
}

function Num({ label, v, set, step = "1" }: { label: string; v: number; set: (v: string) => void; step?: string }) {
  return <div><span className="text-[0.6875rem] text-ink-faint">{label}</span><Input type="number" min={0} step={step} inputMode="decimal" value={Number.isFinite(v) ? v : 0} onChange={(e) => set(e.target.value)} /></div>;
}

/* ------------------------------------------------------------------ people */

export interface PersonView { id: string; name: string; email: string | null; phone: string | null; active: boolean; welcomed_at: string | null; last_seen_at: string | null }

export function PeoplePanel({ accountId, people, smsReady }: { accountId: string; people: PersonView[]; smsReady: boolean }) {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>([]);
  const [via, setVia] = useState({ email: true, sms: false });
  const [adding, setAdding] = useState(false);
  const [np, setNp] = useState({ name: "", email: "", phone: "" });
  const [editing, setEditing] = useState<string | null>(null);
  const [ed, setEd] = useState({ name: "", email: "", phone: "", active: true });
  const [found, setFound] = useState<{ people: FoundPerson[]; note: string | null; domains: string[] } | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();
  const done = (r: { ok: boolean; error?: string }, text: string) => { setMsg(r.ok ? { ok: true, text } : { ok: false, text: r.error ?? "Something went wrong." }); if (r.ok) router.refresh(); };
  const active = people.filter((p) => p.active);
  const allPicked = active.length > 0 && active.every((p) => picked.includes(p.id));

  return (
    <div>
      <ul className="divide-y divide-line border-t border-line">
        {!people.length && <li className="px-5 py-6 text-center text-[0.8125rem] text-ink-muted">Nobody yet — add people below or find them from your emails.</li>}
        {people.map((p) => editing === p.id ? (
          <li key={p.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:px-5">
            <Input value={ed.name} onChange={(e) => setEd({ ...ed, name: e.target.value })} placeholder="Name" />
            <Input value={ed.email} onChange={(e) => setEd({ ...ed, email: e.target.value })} placeholder="Email" />
            <Input value={ed.phone} onChange={(e) => setEd({ ...ed, phone: e.target.value })} placeholder="Mobile" />
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-[0.75rem] text-ink-muted"><input type="checkbox" checked={ed.active} onChange={(e) => setEd({ ...ed, active: e.target.checked })} />Can sign in</label>
              <Button size="sm" variant="primary" disabled={busy} onClick={() => start(async () => { const r = await updateClubPerson(p.id, ed); done(r, "Saved."); if (r.ok) setEditing(null); })}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            </div>
          </li>
        ) : (
          <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-[0.8125rem] sm:px-5">
            <input type="checkbox" disabled={!p.active} checked={picked.includes(p.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, p.id] : picked.filter((x) => x !== p.id))} aria-label={`Choose ${p.name}`} />
            <div className="min-w-0 flex-1">
              <p className={`font-medium ${p.active ? "text-ink" : "text-ink-faint line-through"}`}>{p.name}</p>
              <p className="truncate text-[0.75rem] text-ink-muted">{[p.email, p.phone].filter(Boolean).join(" · ")}</p>
            </div>
            <span className="text-[0.75rem] text-ink-muted">{p.last_seen_at ? `Signed in ${new Date(p.last_seen_at).toLocaleDateString("en-AU")}` : p.welcomed_at ? `Welcomed ${new Date(p.welcomed_at).toLocaleDateString("en-AU")}` : "Not welcomed yet"}</span>
            <Button size="sm" variant="ghost" onClick={() => { setEditing(p.id); setEd({ name: p.name, email: p.email ?? "", phone: p.phone ?? "", active: p.active }); }}>Edit</Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => start(async () => done(await removeClubPerson(p.id), `${p.name} removed.`))} aria-label={`Remove ${p.name}`}><Trash2 className="h-3.5 w-3.5" /></Button>
          </li>
        ))}
      </ul>

      <div className="space-y-3 border-t border-line p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => setPicked(allPicked ? [] : active.map((p) => p.id))}>{allPicked ? "Untick all" : "Tick everyone"}</Button>
          <label className="flex items-center gap-1.5 text-[0.8125rem] text-ink"><input type="checkbox" checked={via.email} onChange={(e) => setVia({ ...via, email: e.target.checked })} /><Mail className="h-3.5 w-3.5" />Email</label>
          <label className={`flex items-center gap-1.5 text-[0.8125rem] ${smsReady ? "text-ink" : "text-ink-faint"}`} title={smsReady ? "" : "Connect Twilio to send texts"}><input type="checkbox" disabled={!smsReady} checked={via.sms} onChange={(e) => setVia({ ...via, sms: e.target.checked })} /><MessageSquare className="h-3.5 w-3.5" />Text</label>
          <Button size="sm" variant="primary" disabled={busy || !picked.length} onClick={() => start(async () => {
            const r = await sendClubWelcomes(accountId, picked, via);
            if (r.ok) { setMsg({ ok: !r.data.errors.length || r.data.sent.length > 0, text: `${r.data.sent.length ? `Welcome sent to ${r.data.sent.join(", ")}.` : "Nothing sent."}${r.data.errors.length ? ` Not sent: ${r.data.errors.join("; ")}` : ""}` }); setPicked([]); router.refresh(); }
            else setMsg({ ok: false, text: r.error });
          })}>{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Send welcome{picked.length ? ` (${picked.length})` : ""}</Button>
        </div>
        <p className="text-[0.75rem] text-ink-muted">The welcome has a button that signs them straight in (once, for 14 days). After that they sign in with their email or mobile and a code.</p>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setAdding(!adding)}><UserPlus className="h-3.5 w-3.5" />Add a person</Button>
          <Button size="sm" disabled={busy} onClick={() => start(async () => { setMsg(null); const r = await findClubPeople(accountId); if (r.ok) { setFound(r.data); setChosen(r.data.people.map((p) => p.email)); } else setMsg({ ok: false, text: r.error }); })}>{busy && !found ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}Find people from emails</Button>
        </div>
        {adding && (
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
            <Input value={np.name} onChange={(e) => setNp({ ...np, name: e.target.value })} placeholder="Name" />
            <Input value={np.email} onChange={(e) => setNp({ ...np, email: e.target.value })} placeholder="Email" type="email" />
            <Input value={np.phone} onChange={(e) => setNp({ ...np, phone: e.target.value })} placeholder="Mobile" inputMode="tel" />
            <Button variant="primary" disabled={busy} onClick={() => start(async () => { const r = await addClubPerson(accountId, np); done(r, `${np.name} added.`); if (r.ok) { setNp({ name: "", email: "", phone: "" }); setAdding(false); } })}>Add</Button>
          </div>
        )}
        {found && (
          <div className="rounded-lg ring-1 ring-line">
            <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
              <p className="text-[0.75rem] text-ink-muted">{found.note ?? ""} {found.people.length ? `${found.people.length} not on the list yet:` : "Everyone found is already on the list."}</p>
              <button onClick={() => setFound(null)} aria-label="Close"><X className="h-4 w-4 text-ink-faint" /></button>
            </div>
            {found.people.length > 0 && (
              <>
                <ul className="max-h-72 divide-y divide-line overflow-y-auto">
                  {found.people.map((p) => (
                    <li key={p.email} className="flex items-center gap-3 px-3 py-2 text-[0.8125rem]">
                      <input type="checkbox" checked={chosen.includes(p.email)} onChange={(e) => setChosen(e.target.checked ? [...chosen, p.email] : chosen.filter((x) => x !== p.email))} />
                      <div className="min-w-0 flex-1"><p className="font-medium text-ink">{p.name}</p><p className="truncate text-[0.75rem] text-ink-muted">{p.email}</p></div>
                      <span className="text-[0.75rem] text-ink-muted">{p.seen} email{p.seen === 1 ? "" : "s"}{p.last ? ` · last ${new Date(`${p.last}T12:00:00Z`).toLocaleDateString("en-AU")}` : ""}</span>
                    </li>
                  ))}
                </ul>
                <div className="border-t border-line px-3 py-2"><Button size="sm" variant="primary" disabled={busy || !chosen.length} onClick={() => start(async () => {
                  const r = await addFoundPeople(accountId, found.people.filter((p) => chosen.includes(p.email)).map((p) => ({ name: p.name, email: p.email })));
                  if (r.ok) { setFound(null); done(r, `${r.data} added. Check their names, then send the welcome.`); }
                })}>Add {chosen.length} to the list</Button></div>
              </>
            )}
          </div>
        )}
        {msg && <p className={msg.ok ? ok : "rounded-lg bg-rose-50 px-3 py-2 text-[0.7812rem] text-rose-700 ring-1 ring-inset ring-rose-100"}>{msg.text}</p>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ bookings actions */

export function CancelBooking({ id }: { id: string }) {
  const router = useRouter();
  const [sure, setSure] = useState(false);
  const [busy, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  if (!sure) return <Button size="sm" variant="ghost" onClick={() => setSure(true)}>Cancel…</Button>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Button size="sm" variant="danger" disabled={busy} onClick={() => start(async () => { const r = await cancelClubBooking(id); if (r.ok) router.refresh(); else setErr(r.error); })}>Cancel booking</Button>
      <Button size="sm" variant="ghost" onClick={() => setSure(false)}>Keep</Button>
      {err && <span className="text-[0.75rem] text-rose-600">{err}</span>}
    </span>
  );
}

export function ResyncRuns({ id }: { id: string }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  return <Button size="sm" disabled={busy} onClick={() => start(async () => { await resyncClubRuns(id); router.refresh(); })}>{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Redo deliveries on calendar</Button>;
}
