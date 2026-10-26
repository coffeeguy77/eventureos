"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarRange, Loader2, Minus, Pencil, Plus, Search, Sparkles, Store, Trash2, Truck, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";
import { previewBooking, quickClient, saveBooking, type BookingInput, type LineInput, type Preview } from "@/app/(app)/rentals/actions";
import type { HireStatus } from "@/lib/hire/core";

export type PickItem = { id: string; name: string; code: string | null; kind: "hire" | "sale" | "package"; category: string | null; quantity: number; companions: { item_id: string; qty: number; auto: boolean }[]; package_lines: { item_id: string; qty: number }[] };
type Line = LineInput & { key: string };

let seq = 0;
const key = () => `l${Date.now().toString(36)}${(seq++).toString(36)}`;
const addDays = (d: string, n: number) => { const t = new Date(d + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

/**
 * The hire booking screen: client, dates, delivery, items. Every change is priced and stock-checked live on the
 * server: the cheapest rate for the length of hire, what's short (who has it, when it's free, what could go instead),
 * matching quotes, items that go together, the bond and the deposit.
 */
export function BookingEditor({ bookingId, status, initial, customers: initialCustomers, events, items, currency, today, tz }: {
  bookingId: string | null; status: HireStatus | null; initial: BookingInput; customers: { id: string; name: string }[];
  events: { id: string; label: string; customerId: string }[]; items: PickItem[]; currency: string; today: string; tz: string;
}) {
  const router = useRouter();
  const [f, setF] = useState<Omit<BookingInput, "lines">>(() => { const { lines: _l, ...rest } = initial; return rest; });
  const [lines, setLines] = useState<Line[]>(() => initial.lines.map((l) => ({ ...l, key: key() })));
  const [customers, setCustomers] = useState(initialCustomers);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [checking, setChecking] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [allowShort, setAllowShort] = useState(false);
  const [pending, start] = useTransition();
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((o) => ({ ...o, [k]: v }));

  const input = useMemo<BookingInput>(() => ({ ...f, lines: lines.map(({ key: _k, ...l }) => l) }), [f, lines]);
  // price and check every change (debounced)
  const ticket = useRef(0);
  const priceKey = JSON.stringify([f.start_date, f.start_time, f.end_date, f.end_time, f.fulfilment, f.delivery_fee, f.discount, lines.map((l) => [l.item_id, l.quantity, l.manual ? l.unit_price : null, l.name])]);
  useEffect(() => {
    const n = ++ticket.current;
    if (!lines.length) { setPreview(null); return; }
    setChecking(true);
    const tm = setTimeout(async () => {
      const r = await previewBooking(input, bookingId).catch(() => null);
      if (n !== ticket.current) return;
      setChecking(false);
      if (r?.ok) setPreview(r.data); else if (r) setMsg({ ok: false, text: r.error });
    }, 350);
    return () => clearTimeout(tm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceKey]);

  const addItem = (id: string, qty = 1) => {
    const it = byId.get(id); if (!it) return;
    setLines((ls) => {
      const next = [...ls];
      const at = next.findIndex((l) => l.item_id === id);
      if (at >= 0) next[at] = { ...next[at], quantity: Number(next[at].quantity) + qty };
      else next.push({ key: key(), item_id: id, name: it.name, kind: it.kind, quantity: qty });
      // items that always go with it (e.g. weights with a marquee)
      for (const c of it.companions.filter((c) => c.auto)) {
        const ci = byId.get(c.item_id); if (!ci) continue;
        const j = next.findIndex((l) => l.item_id === ci.id);
        if (j >= 0) next[j] = { ...next[j], quantity: Number(next[j].quantity) + c.qty * qty };
        else next.push({ key: key(), item_id: ci.id, name: ci.name, kind: ci.kind, quantity: c.qty * qty });
      }
      return next;
    });
  };
  const swap = (from: string, to: string) => setLines((ls) => ls.map((l) => (l.item_id === from ? { ...l, item_id: to, name: byId.get(to)?.name ?? l.name, manual: false, unit_price: null } : l)));
  const setLine = (k: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === k ? { ...l, ...patch } : l)));
  const quick = (days: number | "half" | "weekend") => {
    if (days === "half") { setF((o) => ({ ...o, end_date: o.start_date, end_time: addHours(o.start_time, 4) })); return; }
    if (days === "weekend") {
      const d = new Date(f.start_date + "T00:00:00Z"); const toFri = (5 - d.getUTCDay() + 7) % 7;
      const fri = addDays(f.start_date, toFri);
      setF((o) => ({ ...o, start_date: fri, start_time: "15:00", end_date: addDays(fri, 3), end_time: "10:00" })); return;
    }
    setF((o) => ({ ...o, end_date: addDays(o.start_date, days), end_time: o.start_time }));
  };

  const priced = (i: number) => preview?.lines[i];
  const holdsStock = status ? ["reservation", "booked", "out"].includes(status) : false;

  const save = (as?: HireStatus) => start(async () => {
    setMsg(null);
    const r = await saveBooking(bookingId, input, { status: as, allowShort });
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
    if (!bookingId) router.push(`/rentals/bookings/${r.data}`);
    else { setMsg({ ok: true, text: "Saved." }); router.refresh(); }
  });

  const evs = events.filter((e) => !f.customer_id || e.customerId === f.customer_id);
  const shortages = preview?.shortages ?? [];

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-5">
        <Card className="p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <ClientPicker value={f.customer_id} customers={customers} onChange={(id) => set("customer_id", id)} onAdded={(c) => { setCustomers((cs) => [...cs, c].sort((a, b) => a.name.localeCompare(b.name))); set("customer_id", c.id); }} />
            <div><Label htmlFor="bk-ev" hint="optional">Event</Label>
              <Select id="bk-ev" value={f.event_id ?? ""} onChange={(e) => set("event_id", e.target.value || null)}><option value="">Not linked to an event</option>{evs.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}</Select></div>
            <div className="sm:col-span-2"><Label htmlFor="bk-title" hint="optional">What's it for</Label><Input id="bk-title" value={f.title ?? ""} maxLength={160} onChange={(e) => set("title", e.target.value)} placeholder="e.g. 40th birthday, backyard marquee" /></div>
          </div>
        </Card>

        <Card className="p-5">
          <p className="mb-3 flex items-center gap-2 text-[0.8438rem] font-semibold text-ink"><CalendarRange className="h-4 w-4 text-ink-faint" />When</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor="bk-sd">Hire starts</Label><div className="flex gap-2"><Input id="bk-sd" type="date" value={f.start_date} onChange={(e) => { const d = e.target.value; setF((o) => ({ ...o, start_date: d, end_date: o.end_date < d ? d : o.end_date })); }} /><Input aria-label="Start time" type="time" value={f.start_time} onChange={(e) => set("start_time", e.target.value)} className="w-32" /></div></div>
            <div><Label htmlFor="bk-ed">Hire ends</Label><div className="flex gap-2"><Input id="bk-ed" type="date" min={f.start_date} value={f.end_date} onChange={(e) => set("end_date", e.target.value)} /><Input aria-label="End time" type="time" value={f.end_time} onChange={(e) => set("end_time", e.target.value)} className="w-32" /></div></div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {([["half", "Half day"], [1, "1 day"], [2, "2 days"], ["weekend", "Weekend"], [7, "1 week"]] as const).map(([v, l]) => (
              <button key={l} type="button" onClick={() => quick(v)} className="rounded-full bg-zinc-100 px-2.5 py-1 text-[0.75rem] font-medium text-ink-muted hover:bg-zinc-200 hover:text-ink">{l}</button>
            ))}
            {f.start_date < today && <span className="text-[0.75rem] text-amber-700">Starts in the past.</span>}
          </div>
          <div className="mt-4 flex gap-2">
            {(["collect", "deliver"] as const).map((m) => (
              <button key={m} type="button" onClick={() => set("fulfilment", m)} aria-pressed={f.fulfilment === m}
                className={cn("flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-[0.8125rem] font-medium ring-1", f.fulfilment === m ? "bg-brand-50 text-brand-800 ring-brand-300" : "bg-surface text-ink-muted ring-line hover:text-ink")}>
                {m === "deliver" ? <Truck className="h-4 w-4" /> : <Store className="h-4 w-4" />}{m === "deliver" ? "We deliver & collect" : "Client picks up"}
              </button>
            ))}
          </div>
          {f.fulfilment === "deliver" && (
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div className="sm:col-span-3"><Label htmlFor="bk-addr">Delivery address</Label><Textarea id="bk-addr" rows={2} value={f.address ?? ""} onChange={(e) => set("address", e.target.value)} /></div>
              <div><Label htmlFor="bk-dt" hint="on the start day">Deliver at</Label><Input id="bk-dt" type="time" value={f.delivery_time ?? ""} onChange={(e) => set("delivery_time", e.target.value)} /></div>
              <div><Label htmlFor="bk-pt" hint="on the end day">Collect at</Label><Input id="bk-pt" type="time" value={f.pickup_time ?? ""} onChange={(e) => set("pickup_time", e.target.value)} /></div>
              <div><Label htmlFor="bk-df">Delivery fee</Label><Input id="bk-df" type="number" min={0} step="0.01" inputMode="decimal" value={f.delivery_fee ?? ""} onChange={(e) => set("delivery_fee", e.target.value === "" ? null : Number(e.target.value))} /></div>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Items" subtitle={preview ? `Priced for ${hoursText(preview.hours)} of hire, using the cheapest mix of your rates.` : "Search your items to add them."} action={checking ? <Loader2 className="h-4 w-4 animate-spin text-ink-faint" aria-label="Checking" /> : null} />
          <div className="border-t border-line px-5 py-3"><ItemSearch items={items} onPick={(id) => addItem(id)} /></div>
          {lines.length > 0 && (
            <ul className="divide-y divide-line border-t border-line">
              {lines.map((l, i) => {
                const p = priced(i);
                const sh = l.item_id ? shortages.filter((s) => s.itemId === l.item_id) : [];
                // a package's items that are short (unless that item has its own line, where it's shown)
                const inPack = new Set((l.item_id ? byId.get(l.item_id)?.package_lines ?? [] : []).map((x) => x.item_id));
                const pk = shortages.filter((s) => inPack.has(s.itemId) && !lines.some((o) => o.item_id === s.itemId));
                const pc = preview?.pencilled.find((x) => x.itemId === l.item_id);
                return (
                  <li key={l.key} className="px-5 py-3">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <div className="min-w-0 flex-1 basis-48">
                        <input aria-label="Line description" value={l.name} onChange={(e) => setLine(l.key, { name: e.target.value })} className="w-full truncate bg-transparent text-[0.8438rem] font-medium text-ink outline-none focus:underline" />
                        <p className="text-[0.75rem] text-ink-faint">{!l.item_id ? "Extra charge" : byId.get(l.item_id)?.kind === "sale" ? "Sale item" : byId.get(l.item_id)?.kind === "package" ? "Package" : p?.price_note ?? ""}</p>
                      </div>
                      <div className="flex items-center rounded-lg ring-1 ring-line-strong">
                        <button type="button" aria-label="Fewer" className="grid h-8 w-8 place-items-center text-ink-muted hover:text-ink" onClick={() => setLine(l.key, { quantity: Math.max(1, Number(l.quantity) - 1) })}><Minus className="h-3.5 w-3.5" /></button>
                        <input aria-label="Quantity" inputMode="numeric" value={l.quantity} onChange={(e) => setLine(l.key, { quantity: Math.max(1, Math.round(Number(e.target.value.replace(/\D/g, "")) || 1)) })} className="h-8 w-12 bg-transparent text-center text-[0.8438rem] tabular-nums outline-none" />
                        <button type="button" aria-label="More" className="grid h-8 w-8 place-items-center text-ink-muted hover:text-ink" onClick={() => setLine(l.key, { quantity: Number(l.quantity) + 1 })}><Plus className="h-3.5 w-3.5" /></button>
                      </div>
                      <PriceCell line={l} computed={p?.unit_price ?? null} currency={currency} onChange={(patch) => setLine(l.key, patch)} />
                      <p className="w-20 text-right text-[0.8438rem] font-medium tabular-nums text-ink">{p ? money(p.line_total, currency) : "—"}</p>
                      <button type="button" aria-label={`Remove ${l.name}`} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="grid h-8 w-8 place-items-center rounded-lg text-ink-faint hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                    </div>
                    {[...sh, ...pk].map((s) => (
                      <div key={s.itemId} className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-[0.75rem] text-rose-900">
                        <p className="flex items-center gap-1.5 font-semibold"><AlertTriangle className="h-3.5 w-3.5" />{s.short} short{s.itemId !== l.item_id ? ` (${s.name})` : ""}: {s.free} of {s.wanted} free at this time</p>
                        {s.clashes.length > 0 && <p className="mt-0.5">Out on {s.clashes.slice(0, 3).map((c) => `${c.label} (${c.qty})`).join(", ")}{s.clashes.length > 3 ? ` and ${s.clashes.length - 3} more` : ""}.</p>}
                        {s.freeFrom && <p className="mt-0.5">Enough free from {fmtWhen(s.freeFrom, tz)}.</p>}
                        {s.alternatives.length > 0 && s.itemId === l.item_id && <p className="mt-1 flex flex-wrap items-center gap-1.5">Send instead: {s.alternatives.map((a) => <button key={a.id} type="button" onClick={() => swap(l.item_id!, a.id)} className="rounded-full bg-white px-2 py-0.5 font-medium text-rose-900 ring-1 ring-rose-200 hover:bg-rose-100">{a.name} ({a.free} free)</button>)}</p>}
                      </div>
                    ))}
                    {pc && <p className="mt-1.5 text-[0.75rem] text-amber-800">Also quoted at this time: {pc.labels.slice(0, 3).join(", ")}{pc.labels.length > 3 ? "…" : ""}.</p>}
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex flex-wrap gap-2 border-t border-line px-5 py-3">
            <Button size="sm" variant="ghost" onClick={() => setLines((ls) => [...ls, { key: key(), item_id: null, name: "Extra charge", kind: "misc", quantity: 1, unit_price: 0, manual: true }])}><Plus className="h-4 w-4" />Extra charge</Button>
          </div>
          {preview && preview.suggestions.length > 0 && (
            <div className="border-t border-line bg-brand-50/50 px-5 py-3">
              <p className="mb-1.5 flex items-center gap-1.5 text-[0.75rem] font-semibold text-brand-800"><Sparkles className="h-3.5 w-3.5" />Usually goes with these</p>
              <div className="flex flex-wrap gap-1.5">{preview.suggestions.map((s) => <button key={s.item_id} type="button" onClick={() => addItem(s.item_id, s.qty)} className="rounded-full bg-white px-2.5 py-1 text-[0.75rem] font-medium text-brand-800 ring-1 ring-brand-200 hover:bg-brand-50">+ {s.qty} × {s.name} <span className="font-normal text-ink-faint">for {s.for}</span></button>)}</div>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label htmlFor="bk-ref" hint="optional">Client PO / reference</Label><Input id="bk-ref" value={f.reference ?? ""} maxLength={120} onChange={(e) => set("reference", e.target.value)} /></div>
            <div><Label htmlFor="bk-exp" hint="quotes">Quote valid until</Label><Input id="bk-exp" type="date" value={f.quote_expires ?? ""} onChange={(e) => set("quote_expires", e.target.value || null)} /></div>
            <div className="sm:col-span-2"><Label htmlFor="bk-notes" hint="the client sees these">Notes for the client</Label><Textarea id="bk-notes" rows={3} value={f.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></div>
            <div className="sm:col-span-2"><Label htmlFor="bk-int" hint="only your team sees these">Internal notes</Label><Textarea id="bk-int" rows={2} value={f.internal_notes ?? ""} onChange={(e) => set("internal_notes", e.target.value)} /></div>
          </div>
        </Card>
      </div>

      <div className="lg:sticky lg:top-20 lg:self-start">
        <Card className="p-5">
          <p className="text-[0.8438rem] font-semibold text-ink">Summary</p>
          <dl className="mt-3 space-y-1.5 text-[0.8125rem]">
            <Row label="Items" value={money(preview?.items ?? 0, currency)} />
            {f.fulfilment === "deliver" && <Row label="Delivery" value={money(Number(f.delivery_fee) || 0, currency)} />}
            <div className="flex items-center justify-between gap-3"><dt className="text-ink-muted">Discount</dt><dd><input aria-label="Discount" type="number" min={0} step="0.01" inputMode="decimal" value={f.discount ?? ""} onChange={(e) => set("discount", e.target.value === "" ? null : Number(e.target.value))} className="h-7 w-24 rounded-md border border-line-strong bg-surface px-2 text-right tabular-nums" placeholder="0.00" /></dd></div>
            <div className="flex justify-between border-t border-line pt-2 text-[0.9375rem] font-semibold text-ink"><dt>Total</dt><dd className="tabular-nums">{money(preview?.total ?? 0, currency)}</dd></div>
            <Row label="Includes GST" value={money(preview?.gst ?? 0, currency)} faint />
            {(preview?.bond ?? 0) > 0 && <Row label="Bond (refundable)" value={money(preview!.bond, currency)} />}
            {(preview?.deposit ?? 0) > 0 && <Row label="Deposit to book" value={money(preview!.deposit, currency)} />}
          </dl>
          {shortages.length > 0 && (
            <div className="mt-4 rounded-lg bg-rose-50 p-3 text-[0.75rem] text-rose-900">
              <p className="flex items-center gap-1.5 font-semibold"><AlertTriangle className="h-3.5 w-3.5" />{shortages.length} item{shortages.length === 1 ? "" : "s"} short at this time</p>
              <p className="mt-1">You can still save it as a quote. To reserve or book it, swap items, change the dates, or tick below if you&apos;ll cross-hire.</p>
              <label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={allowShort} onChange={(e) => setAllowShort(e.target.checked)} />Book anyway (I&apos;ll cross-hire)</label>
            </div>
          )}
          {msg && <p className={cn("mt-3 text-[0.8125rem]", msg.ok ? "text-emerald-700" : "text-rose-600")} role="status">{msg.text}</p>}
          <div className="mt-4 grid gap-2">
            {bookingId ? (
              <Button variant="primary" disabled={pending || !f.customer_id || !lines.length || (holdsStock && shortages.length > 0 && !allowShort)} onClick={() => save()}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Save changes</Button>
            ) : (
              <>
                <Button variant="primary" disabled={pending || !f.customer_id || !lines.length || (shortages.length > 0 && !allowShort)} onClick={() => save("booked")}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Book it</Button>
                <Button disabled={pending || !f.customer_id || !lines.length || (shortages.length > 0 && !allowShort)} onClick={() => save("reservation")}>Reserve (holds stock)</Button>
                <Button disabled={pending || !f.customer_id || !lines.length} onClick={() => save("quote")}>Save as quote</Button>
              </>
            )}
          </div>
          {!f.customer_id && <p className="mt-2 text-[0.75rem] text-ink-faint">Choose the client to save.</p>}
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value, faint }: { label: string; value: string; faint?: boolean }) {
  return <div className={cn("flex justify-between gap-3", faint && "text-[0.75rem]")}><dt className="text-ink-muted">{label}</dt><dd className={cn("tabular-nums", faint ? "text-ink-faint" : "text-ink")}>{value}</dd></div>;
}

function PriceCell({ line, computed, currency, onChange }: { line: Line; computed: number | null; currency: string; onChange: (p: Partial<Line>) => void }) {
  const [editing, setEditing] = useState(false);
  if (editing || (line.manual && !line.item_id)) {
    return (
      <div className="flex items-center gap-1">
        <input aria-label="Price each" type="number" min={0} step="0.01" inputMode="decimal" autoFocus={editing} value={line.unit_price ?? computed ?? 0}
          onChange={(e) => onChange({ unit_price: Number(e.target.value), manual: true })} onBlur={() => setEditing(false)}
          className="h-8 w-24 rounded-md border border-line-strong bg-surface px-2 text-right text-[0.8125rem] tabular-nums" />
        {line.item_id && line.manual && <button type="button" title="Back to the rate price" aria-label="Use the rate price" onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange({ manual: false, unit_price: null }); setEditing(false); }} className="text-ink-faint hover:text-ink"><X className="h-3.5 w-3.5" /></button>}
      </div>
    );
  }
  return (
    <button type="button" onClick={() => setEditing(true)} title="Change the price" className="group flex h-8 w-24 items-center justify-end gap-1 rounded-md px-2 text-[0.8125rem] tabular-nums text-ink-muted hover:bg-zinc-100">
      {line.manual && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" title="Price changed by hand" />}
      {computed == null ? "—" : money(computed, currency)}<Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100" />
    </button>
  );
}

function ItemSearch({ items, onPick }: { items: PickItem[]; onPick: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const found = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items.slice(0, 12);
    const words = s.split(/\s+/);
    return items.filter((i) => { const hay = `${i.name} ${i.code ?? ""} ${i.category ?? ""}`.toLowerCase(); return words.every((w) => hay.includes(w)); })
      .sort((a, b) => Number((b.code ?? "").toLowerCase() === s) - Number((a.code ?? "").toLowerCase() === s) || a.name.localeCompare(b.name)).slice(0, 12);
  }, [q, items]);
  const pick = (id: string) => { onPick(id); setQ(""); setHi(0); };
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
      <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(found.length - 1, h + 1)); } else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); } else if (e.key === "Enter" && found[hi]) { e.preventDefault(); pick(found[hi].id); } }}
        placeholder={items.length ? "Add an item: name, code or category" : "No items yet: add them in Items & rates"} aria-label="Add an item"
        className="h-10 w-full rounded-lg border border-line-strong bg-surface pl-9 pr-3 text-[0.8438rem]" />
      {open && found.length > 0 && (
        <ul role="listbox" className="absolute z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-xl bg-surface p-1 shadow-xl ring-1 ring-line">
          {found.map((i, n) => (
            <li key={i.id} role="option" aria-selected={n === hi}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(i.id)} className={cn("flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-[0.8125rem]", n === hi ? "bg-zinc-100" : "hover:bg-zinc-50")}>
                <span className="min-w-0 truncate"><span className="font-medium text-ink">{i.name}</span>{i.code && <span className="ml-1.5 text-ink-faint">#{i.code}</span>}</span>
                <span className="shrink-0 text-[0.75rem] text-ink-faint">{i.kind === "package" ? "Package" : i.kind === "sale" ? "Sale" : `${i.quantity} owned`}{i.category ? ` · ${i.category}` : ""}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ClientPicker({ value, customers, onChange, onAdded }: { value: string; customers: { id: string; name: string }[]; onChange: (id: string) => void; onAdded: (c: { id: string; name: string }) => void }) {
  const [adding, setAdding] = useState(false);
  const [c, setC] = useState({ name: "", email: "", phone: "", company: "" });
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (adding) {
    return (
      <div className="space-y-2 rounded-lg bg-zinc-50 p-3 sm:col-span-2">
        <p className="text-[0.8125rem] font-semibold text-ink">New client</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Input aria-label="Name" placeholder="Name" value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} />
          <Input aria-label="Company" placeholder="Company (optional)" value={c.company} onChange={(e) => setC({ ...c, company: e.target.value })} />
          <Input aria-label="Email" type="email" placeholder="Email" value={c.email} onChange={(e) => setC({ ...c, email: e.target.value })} />
          <Input aria-label="Phone" type="tel" placeholder="Phone" value={c.phone} onChange={(e) => setC({ ...c, phone: e.target.value })} />
        </div>
        {err && <p className="text-[0.8125rem] text-rose-600">{err}</p>}
        <div className="flex gap-2">
          <Button size="sm" variant="primary" disabled={pending || !c.name.trim()} onClick={() => start(async () => { setErr(null); const r = await quickClient(c); if (!r.ok) setErr(r.error); else { onAdded(r.data); setAdding(false); } })}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Add client</Button>
          <Button size="sm" onClick={() => setAdding(false)}>Cancel</Button>
        </div>
      </div>
    );
  }
  return (
    <div>
      <Label htmlFor="bk-client">Client</Label>
      <div className="flex gap-2">
        <Select id="bk-client" value={value} onChange={(e) => onChange(e.target.value)}><option value="">Choose a client…</option>{customers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>
        <Button type="button" aria-label="New client" title="New client" onClick={() => setAdding(true)}><UserPlus className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

function addHours(hhmm: string, h: number) { const [a, b] = hhmm.split(":").map(Number); const m = Math.min(23 * 60 + 59, a * 60 + b + h * 60); return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; }
function hoursText(h: number) { if (h < 24) return `${h} hour${h === 1 ? "" : "s"}`; const d = Math.floor(h / 24), r = h % 24; return `${d} day${d === 1 ? "" : "s"}${r ? ` ${r}h` : ""}`; }
function fmtWhen(ms: number, tz: string) { return new Intl.DateTimeFormat("en-AU", { timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(ms)); }
