"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Clock, Minus, Plus, ShoppingBag, Sun, Sunrise, Sunset, Trash2, Users } from "lucide-react";
import type { CateringItem, CateringOrder, Slot } from "@/lib/events/core";
import { cateringProblem, SLOTS } from "@/lib/events/core";
import { requestCatering, saveCart } from "@/app/hire/[org]/actions";
import { track } from "@/components/site/tracker";
import { niceDate } from "./calendar-picker";

const field = "h-[52px] w-full rounded-[14px] border border-[#E6DCD4] bg-white px-4 text-[0.9688rem] text-[#151312] outline-none transition placeholder:text-[#A39A93] focus:border-[var(--pk)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--pk)_14%,transparent)]";
const lab = "mb-1.5 block text-[0.8125rem] font-semibold text-[#3A3431]";
const ICON: Record<Slot, typeof Sun> = { morning: Sunrise, lunch: Sun, afternoon: Sunset };
/** Which menu groups suit each delivery (shown first; everything stays available). */
const FIT: Record<Slot, RegExp> = { morning: /breakfast|morning|coffee|tea/i, lunch: /lunch|salad/i, afternoon: /afternoon|coffee|tea/i };
const TIMES = Array.from({ length: 27 }, (_, i) => { const m = 6 * 60 + i * 30; return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; });
const fmtT = (t: string) => { const h = Number(t.slice(0, 2)); return `${h % 12 || 12}${t.slice(3) === "00" ? "" : ":" + t.slice(3)}${h < 12 ? "am" : "pm"}`; };
const aud = (n: number) => `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const inc = (i: CateringItem) => Math.round(i.unit_price * (1 + i.tax_rate / 100) * 100) / 100;
const per = (u: string | null) => (/person|pp|head/i.test(u ?? "") ? "per person" : "each");

type Lines = Record<Slot, Record<string, number>>;

export function CateringBuilder({ slug, menu, today, leadDays, prefill }: {
  slug: string; menu: CateringItem[]; today: string; leadDays: number; prefill: { name: string; email: string; phone: string; company: string };
}) {
  const KEY = `eos-catering-${slug}`;
  const [slot, setSlot] = useState<Slot>("morning");
  const [people, setPeople] = useState<Record<Slot, number>>({ morning: 20, lunch: 20, afternoon: 20 });
  const [times, setTimes] = useState<Record<Slot, string>>({ morning: SLOTS[0].time, lunch: SLOTS[1].time, afternoon: SLOTS[2].time });
  const [lines, setLines] = useState<Lines>({ morning: {}, lunch: {}, afternoon: {} });
  const [date, setDate] = useState("");
  const [venue, setVenue] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [contact, setContact] = useState(prefill);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ reference: string; tentative: boolean } | null>(null);
  const [pending, start] = useTransition();
  const started = useRef(false);

  useEffect(() => {
    try {
      const d = JSON.parse(localStorage.getItem(KEY) ?? "null");
      if (!d) return;
      if (d.lines) setLines({ morning: {}, lunch: {}, afternoon: {}, ...d.lines });
      if (d.people) setPeople(d.people);
      if (d.times) setTimes(d.times);
      if (d.date && d.date >= today) setDate(d.date);
      if (d.venue) setVenue(d.venue);
      if (d.address) setAddress(d.address);
      if (d.contact && !prefill.email) setContact((c) => ({ ...c, ...d.contact }));
    } catch { /* fresh */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (!done) try { localStorage.setItem(KEY, JSON.stringify({ lines, people, times, date, venue, address, contact })); } catch { /* off */ } }, [KEY, lines, people, times, date, venue, address, contact, done]);

  const byId = useMemo(() => new Map(menu.map((m) => [m.id, m])), [menu]);
  const groups = useMemo(() => {
    const g = new Map<string, CateringItem[]>();
    for (const m of menu) g.set(m.group, [...(g.get(m.group) ?? []), m]);
    return [...g.entries()].sort((a, b) => Number(!FIT[slot].test(a[0])) - Number(!FIT[slot].test(b[0])));
  }, [menu, slot]);

  const setQty = (sl: Slot, id: string, q: number) => {
    if (!started.current) { started.current = true; track({ k: "quote_start", sec: "events", l: "catering" }); }
    setLines((L) => { const next = { ...L[sl] }; if (q > 0) next[id] = Math.min(2000, q); else delete next[id]; return { ...L, [sl]: next }; });
  };
  const add = (id: string) => { setQty(slot, id, lines[slot][id] ? lines[slot][id] + 1 : people[slot] || 1); track({ k: "cart_add", sec: "events", l: `Catering: ${byId.get(id)?.name}` }); };
  const setSlotPeople = (sl: Slot, n: number) => {
    const old = people[sl];
    setPeople({ ...people, [sl]: n });
    // Items that matched the old headcount follow the new one
    setLines((L) => ({ ...L, [sl]: Object.fromEntries(Object.entries(L[sl]).map(([id, q]) => [id, q === old && /person/i.test(byId.get(id)?.unit ?? "") ? n : q])) }));
  };

  const totals = useMemo(() => {
    let sub = 0, gst = 0;
    const bySlot = {} as Record<Slot, number>;
    for (const sl of SLOTS) {
      let t = 0;
      for (const [id, q] of Object.entries(lines[sl.id])) { const m = byId.get(id); if (!m) continue; const ex = m.unit_price * q; sub += ex; gst += ex * m.tax_rate / 100; t += inc(m) * q; }
      bySlot[sl.id] = Math.round(t * 100) / 100;
    }
    return { sub: Math.round(sub * 100) / 100, gst: Math.round(gst * 100) / 100, total: Math.round((sub + gst) * 100) / 100, bySlot };
  }, [lines, byId]);
  const count = SLOTS.reduce((a, s) => a + Object.keys(lines[s.id]).length, 0);
  const tentative = !!date && (Date.parse(date) - Date.parse(today)) / 864e5 < leadDays;

  const order: CateringOrder = {
    date, venue, address, notes, guests: Math.max(...SLOTS.map((s) => (Object.keys(lines[s.id]).length ? people[s.id] : 0))) || null,
    slots: SLOTS.map((s) => ({ slot: s.id, time: times[s.id], items: Object.entries(lines[s.id]).map(([serviceId, qty]) => ({ serviceId, qty })) })),
    contact,
  };
  const remember = () => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact.email.trim()) || !count) return;
    saveCart(slug, "catering", { email: contact.email, name: contact.name, summary: `Catering · ${count} item${count > 1 ? "s" : ""}${date ? ` · ${niceDate(date)}` : ""}`, total: totals.total, resume: `/hire/${slug}/catering`, detail: { date } }).catch(() => {});
  };
  const submit = () => {
    setErr(null);
    const p = cateringProblem(order, menu, today);
    if (p) { setErr(p); return; }
    track({ k: "checkout_start", sec: "events", l: "catering" });
    start(async () => {
      const r = await requestCatering(slug, order);
      if (!r.ok) { setErr(r.error); return; }
      track({ k: "quote_submit", sec: "events", l: "catering" });
      try { localStorage.removeItem(KEY); } catch { /* fine */ }
      setDone({ reference: r.reference, tentative: r.tentative });
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  };

  if (done) {
    return (
      <div className="mx-auto max-w-[720px] rounded-[30px] bg-white p-8 text-center ring-1 ring-[#EDE3DB] sm:p-14" role="status">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[color-mix(in_srgb,var(--pk)_14%,white)] text-[var(--pk)]"><CheckCircle2 className="h-8 w-8" /></span>
        <h2 className="shop-serif mt-6 text-[2.5rem] font-semibold leading-tight">Your order is in</h2>
        <p className="mx-auto mt-3 max-w-[520px] text-[1.0625rem] leading-relaxed text-[#5E5853]">We&apos;ll check it and email your quote to <strong className="text-[#151312]">{contact.email}</strong>. Accept it online and we&apos;ll send the invoice to lock it in. Reference <strong className="text-[#151312]">{done.reference}</strong>.</p>
        {done.tentative && <p className="mx-auto mt-5 max-w-[520px] rounded-2xl bg-[#FFF6E8] px-5 py-4 text-[0.9375rem] text-[#7A4B00]">It&apos;s less than {leadDays} days away, so it&apos;s <strong>tentative</strong> until our kitchen confirms — we&apos;ll be in touch quickly.</p>}
        <Link href={`/hire/${slug}/quote`} className="shop-btn mt-8 inline-flex h-[52px] items-center gap-2 rounded-full bg-[var(--pk)] px-7 font-semibold text-white">Add a coffee cart<ArrowRight className="h-4 w-4" /></Link>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
      <div>
        {/* Delivery tabs */}
        <div className="grid gap-3 sm:grid-cols-3" role="tablist" aria-label="Delivery">
          {SLOTS.map((s) => {
            const I = ICON[s.id]; const on = slot === s.id; const n = Object.keys(lines[s.id]).length;
            return (
              <button key={s.id} type="button" role="tab" aria-selected={on} onClick={() => setSlot(s.id)}
                className={`flex items-center gap-3 rounded-[20px] border-2 p-4 text-left transition ${on ? "border-[var(--pk)] bg-white shadow-[0_18px_36px_-26px_var(--pk)]" : "border-[#EDE3DB] bg-white/60 hover:border-[#D9CCC3]"}`}>
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${on ? "bg-[var(--pk)] text-white" : "bg-[#F4ECE6] text-[#3A3431]"}`}><I className="h-5 w-5" /></span>
                <span className="min-w-0"><span className="block font-bold">{s.label.replace(" delivery", "")}</span><span className="text-[0.8125rem] text-[#5E5853]">{fmtT(times[s.id])}{n ? ` · ${n} item${n > 1 ? "s" : ""}` : ""}</span></span>
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-[20px] bg-white p-4 ring-1 ring-[#EDE3DB]">
          <span className="flex items-center gap-2 text-[0.9375rem] font-semibold"><Users className="h-[18px] w-[18px] text-[var(--pk)]" />People</span>
          <div className="inline-flex h-[46px] items-center rounded-[12px] border border-[#E6DCD4]">
            <button type="button" aria-label="Fewer people" onClick={() => setSlotPeople(slot, Math.max(1, people[slot] - 1))} className="grid h-full w-11 place-items-center"><Minus className="h-4 w-4" /></button>
            <input aria-label="People" inputMode="numeric" className="w-14 bg-transparent text-center font-bold outline-none" value={people[slot]} onChange={(e) => setSlotPeople(slot, Math.max(1, Math.min(2000, Number(e.target.value.replace(/\D/g, "")) || 1)))} />
            <button type="button" aria-label="More people" onClick={() => setSlotPeople(slot, people[slot] + 1)} className="grid h-full w-11 place-items-center"><Plus className="h-4 w-4" /></button>
          </div>
          <span className="flex items-center gap-2 text-[0.9375rem] font-semibold"><Clock className="h-[18px] w-[18px] text-[var(--pk)]" />Deliver at</span>
          <select aria-label="Delivery time" className="h-[46px] rounded-[12px] border border-[#E6DCD4] bg-white px-3 font-semibold" value={times[slot]} onChange={(e) => setTimes({ ...times, [slot]: e.target.value })}>{TIMES.map((t) => <option key={t} value={t}>{fmtT(t)}</option>)}</select>
        </div>

        {/* Menu */}
        <div className="mt-8 space-y-10">
          {groups.map(([g, items]) => (
            <div key={g} data-section={`menu-${g.toLowerCase().replace(/[^a-z]+/g, "-")}`}>
              <p className="shop-serif text-[1.875rem] font-semibold">{g}</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {items.map((m) => {
                  const q = lines[slot][m.id] ?? 0;
                  return (
                    <div key={m.id} className={`flex flex-col rounded-[20px] bg-white p-5 ring-1 transition ${q ? "ring-2 ring-[var(--pk)]" : "ring-[#EDE3DB]"}`}>
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-[1.0625rem] font-semibold leading-snug">{m.name}</p>
                        <p className="shrink-0 text-right"><span className="block font-bold">{aud(inc(m))}</span><span className="text-[0.75rem] text-[#8C847D]">{per(m.unit)}</span></p>
                      </div>
                      {m.description && <p className="mt-1.5 flex-1 text-[0.875rem] leading-relaxed text-[#5E5853]">{m.description}</p>}
                      <div className="mt-4">
                        {q ? (
                          <div className="flex items-center justify-between">
                            <div className="inline-flex h-[44px] items-center rounded-full bg-[#F7EFEA]">
                              <button type="button" aria-label={`Fewer ${m.name}`} onClick={() => setQty(slot, m.id, q - 1)} className="grid h-full w-11 place-items-center">{q === 1 ? <Trash2 className="h-4 w-4" /> : <Minus className="h-4 w-4" />}</button>
                              <input aria-label={`${m.name} quantity`} inputMode="numeric" className="w-14 bg-transparent text-center font-bold outline-none" value={q} onChange={(e) => setQty(slot, m.id, Number(e.target.value.replace(/\D/g, "")) || 0)} />
                              <button type="button" aria-label={`More ${m.name}`} onClick={() => setQty(slot, m.id, q + 1)} className="grid h-full w-11 place-items-center"><Plus className="h-4 w-4" /></button>
                            </div>
                            <span className="font-semibold">{aud(inc(m) * q)}</span>
                          </div>
                        ) : (
                          <button type="button" onClick={() => add(m.id)} data-track-kind="cart_add" data-track={`Catering add: ${m.name}`} className="shop-btn inline-flex h-[44px] items-center gap-2 rounded-full border-[1.5px] border-[#1F1B19] px-5 text-[0.9375rem] font-semibold hover:bg-[#151312] hover:text-white">
                            <Plus className="h-4 w-4" />Add{/person/i.test(m.unit ?? "") ? ` for ${people[slot]}` : ""}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {!menu.length && <p className="rounded-[20px] bg-white p-8 text-center text-[#5E5853] ring-1 ring-[#EDE3DB]">Our catering menu is being updated — send us a message below and we&apos;ll help.</p>}
        </div>
      </div>

      {/* Order */}
      <aside className="lg:sticky lg:top-[84px]">
        <div className="rounded-[26px] bg-white p-6 ring-1 ring-[#EDE3DB] sm:p-7">
          <p className="flex items-center gap-2 text-[1.25rem] font-bold"><ShoppingBag className="h-5 w-5 text-[var(--pk)]" />Your order</p>
          {count === 0 ? <p className="mt-3 text-[0.9375rem] text-[#5E5853]">Pick a delivery above, then add from the menu. Your total updates as you go.</p> : (
            <div className="mt-4 space-y-4">
              {SLOTS.filter((s) => Object.keys(lines[s.id]).length).map((s) => (
                <div key={s.id}>
                  <p className="flex justify-between text-[0.8125rem] font-bold uppercase tracking-wide text-[#8C847D]"><span>{s.label.replace(" delivery", "")} · {fmtT(times[s.id])}</span><span>{aud(totals.bySlot[s.id])}</span></p>
                  <ul className="mt-1.5 space-y-1 text-[0.9063rem]">
                    {Object.entries(lines[s.id]).map(([id, q]) => <li key={id} className="flex justify-between gap-3"><span>{q} × {byId.get(id)?.name}</span><button type="button" aria-label="Remove" onClick={() => setQty(s.id, id, 0)} className="text-[#B9AEA6] hover:text-[#151312]"><Trash2 className="h-3.5 w-3.5" /></button></li>)}
                  </ul>
                </div>
              ))}
              <div className="border-t border-[#EDE3DB] pt-3 text-[0.9375rem]">
                <p className="flex justify-between text-[#5E5853]"><span>Includes GST</span><span>{aud(totals.gst)}</span></p>
                <p className="mt-1 flex justify-between text-[1.375rem] font-bold"><span>Total</span><span>{aud(totals.total)}</span></p>
              </div>
            </div>
          )}

          <div className="mt-6 space-y-3 border-t border-[#EDE3DB] pt-5">
            <div><label className={lab} htmlFor="c-date">Delivery date</label><input id="c-date" type="date" min={today} className={field} value={date} onChange={(e) => setDate(e.target.value)} /></div>
            {tentative && <p className="rounded-xl bg-[#FFF6E8] px-4 py-3 text-[0.8438rem] text-[#7A4B00]">Under {leadDays} days away — tentative until the kitchen confirms.</p>}
            <div><label className={lab} htmlFor="c-venue">Venue / company</label><input id="c-venue" className={field} value={venue} onChange={(e) => setVenue(e.target.value)} /></div>
            <div><label className={lab} htmlFor="c-addr">Delivery address</label><input id="c-addr" className={field} autoComplete="street-address" value={address} onChange={(e) => setAddress(e.target.value)} /></div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <div><label className={lab} htmlFor="c-name">Your name</label><input id="c-name" className={field} autoComplete="name" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} onBlur={remember} /></div>
              <div><label className={lab} htmlFor="c-email">Email</label><input id="c-email" type="email" className={field} autoComplete="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} onBlur={remember} /></div>
              <div><label className={lab} htmlFor="c-phone">Mobile</label><input id="c-phone" type="tel" className={field} autoComplete="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} /></div>
            </div>
            <div><label className={lab} htmlFor="c-notes">Dietary needs or notes</label><textarea id="c-notes" rows={2} className={`${field} h-auto py-3`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. 3 gluten free, 2 vegan" /></div>
          </div>
          {err && <p className="mt-4 rounded-xl bg-[#FFF1F1] px-4 py-3 text-[0.875rem] text-[#B42318]" role="alert">{err}</p>}
          <button type="button" onClick={submit} disabled={pending || !count} data-track="Catering: request order" className="shop-btn mt-5 inline-flex h-[56px] w-full items-center justify-center gap-2.5 rounded-full bg-[var(--pk)] text-[1.0625rem] font-semibold text-white disabled:opacity-50">
            {pending ? "Sending…" : <>Request my order{count ? ` · ${aud(totals.total)}` : ""}</>}
          </button>
          <p className="mt-3 text-center text-[0.8125rem] text-[#8C847D]">Nothing to pay now — we confirm and email your invoice.</p>
        </div>
      </aside>
    </div>
  );
}
