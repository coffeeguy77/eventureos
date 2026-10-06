"use client";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Check, CheckCircle2, Clock, Coffee, Minus, Plus, Sparkles, Trash2, Truck, Users, UtensilsCrossed } from "lucide-react";
import type { EventsSettings, HireDay, HireKind, HireRequest } from "@/lib/events/core";
import { addDays, requestProblem } from "@/lib/events/core";
import { checkDates, requestHireQuote, saveCart } from "@/app/hire/[org]/actions";
import { track } from "@/components/site/tracker";
import { KIND_ART } from "./art";
import { CalendarPicker, niceDate } from "./calendar-picker";

type Hint = { serves_over: number; max_service_hours: number } | null;
type Status = { date: string; ok: boolean; message: string; free: number; total: number; tentative: boolean };
const field = "h-[52px] w-full rounded-[14px] border border-[#E6DCD4] bg-white px-4 text-[0.9688rem] text-[#151312] outline-none transition placeholder:text-[#A39A93] focus:border-[var(--pk)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--pk)_14%,transparent)]";
const lab = "mb-1.5 block text-[0.8125rem] font-semibold text-[#3A3431]";
const card = "rounded-[26px] bg-white p-6 ring-1 ring-[#EDE3DB] sm:p-8";
const TIMES = Array.from({ length: 38 }, (_, i) => { const m = 5 * 60 + i * 30; return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; });
const EVENT_TYPES = ["Corporate", "Conference", "Wedding", "Party", "Market / festival", "School / uni", "Sport", "Other"];
const hrs = (a: string, b: string) => (Number(b.slice(0, 2)) * 60 + Number(b.slice(3)) - Number(a.slice(0, 2)) * 60 - Number(a.slice(3))) / 60;
const fmtT = (t: string) => { const h = Number(t.slice(0, 2)); return `${h % 12 || 12}${t.slice(3) === "00" ? "" : ":" + t.slice(3)}${h < 12 ? "am" : "pm"}`; };

function Stepper({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="inline-flex h-[52px] items-center rounded-[14px] border border-[#E6DCD4] bg-white" role="group" aria-label={label}>
      <button type="button" aria-label={`Fewer ${label}`} disabled={value <= min} onClick={() => onChange(value - 1)} className="grid h-full w-12 place-items-center text-[#151312] disabled:text-[#D5CCC5]"><Minus className="h-4 w-4" /></button>
      <span className="min-w-[2.5rem] text-center text-[1.0625rem] font-bold tabular-nums">{value}</span>
      <button type="button" aria-label={`More ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)} className="grid h-full w-12 place-items-center text-[#151312] disabled:text-[#D5CCC5]"><Plus className="h-4 w-4" /></button>
    </div>
  );
}

type SettingsLite = Pick<EventsSettings, "labels" | "blurbs" | "fleet" | "leadDays" | "stickerPrice" | "stickerSize">;

export function QuoteBuilder({ slug, s, kinds, today, initialKind, prefill, hints, signedIn }: {
  slug: string; s: SettingsLite; kinds: HireKind[]; today: string; initialKind: HireKind | null;
  prefill: { name: string; email: string; phone: string; company: string }; hints: Partial<Record<HireKind, Hint>>; signedIn: boolean;
}) {
  const KEY = `eos-quote-${slug}`;
  const blankDay = (date = ""): HireDay => ({ date, start: "09:00", end: "12:00", staff: 1, serves: 100 });
  const [kind, setKind] = useState<HireKind | null>(initialKind && kinds.includes(initialKind) ? initialKind : kinds.length === 1 ? kinds[0] : null);
  const [units, setUnits] = useState(1);
  const [days, setDays] = useState<HireDay[]>([blankDay()]);
  const [eventType, setEventType] = useState("");
  const [guests, setGuests] = useState("");
  const [venue, setVenue] = useState("");
  const [address, setAddress] = useState("");
  const [delivery, setDelivery] = useState(true);
  const [stickers, setStickers] = useState(0);
  const [wrap, setWrap] = useState(false);
  const [catering, setCatering] = useState(false);
  const [notes, setNotes] = useState("");
  const [contact, setContact] = useState(prefill);
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ reference: string; tentative: boolean } | null>(null);
  const [pending, start] = useTransition();
  const started = useRef(false);

  // Keep the work in progress on this device, so coming back later picks up where they left off
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (!initialKind && d.kind && kinds.includes(d.kind)) setKind(d.kind);
      if (Array.isArray(d.days) && d.days.length) setDays(d.days.map((x: HireDay) => ({ ...blankDay(), ...x, date: x.date >= today ? x.date : "" })));
      if (d.units) setUnits(d.units);
      if (d.eventType) setEventType(d.eventType);
      if (d.guests) setGuests(d.guests);
      if (d.venue) setVenue(d.venue);
      if (d.address) setAddress(d.address);
      if (typeof d.delivery === "boolean") setDelivery(d.delivery);
      if (d.notes) setNotes(d.notes);
      if (d.contact && !prefill.email) setContact((c) => ({ ...c, ...d.contact }));
    } catch { /* fresh start */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (done) return;
    try { localStorage.setItem(KEY, JSON.stringify({ kind, units, days, eventType, guests, venue, address, delivery, notes, contact })); } catch { /* storage off */ }
  }, [KEY, kind, units, days, eventType, guests, venue, address, delivery, notes, contact, done]);

  const begin = () => { if (!started.current) { started.current = true; track({ k: "quote_start", sec: "events", l: kind ?? "builder" }); } };
  const max = kind ? s.fleet[kind] : 1;
  useEffect(() => { if (units > max) setUnits(max); }, [max, units]);

  // Live availability for the chosen dates
  const dateKey = days.map((d) => d.date).filter(Boolean).sort().join(",");
  useEffect(() => {
    if (!kind || !dateKey) { setStatus({}); return; }
    let live = true;
    const t = setTimeout(() => {
      checkDates(slug, kind, dateKey.split(","), units).then((list) => {
        if (!live) return;
        setStatus(Object.fromEntries(list.map((x) => [x.date, x as Status])));
      }).catch(() => {});
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [slug, kind, units, dateKey]);

  const setDay = (i: number, patch: Partial<HireDay>) => { begin(); setDays((ds) => ds.map((d, j) => (j === i ? { ...d, ...patch } : d))); };
  const addDay = () => {
    begin();
    setDays((ds) => {
      const last = ds[ds.length - 1];
      const used = new Set(ds.map((d) => d.date));
      let next = last?.date ? addDays(last.date, 1) : "";
      while (next && used.has(next)) next = addDays(next, 1);
      return [...ds, { ...(last ?? blankDay()), date: next }];
    });
  };

  const req: HireRequest = useMemo(() => ({
    kind: kind ?? "cart", units, days: kind === "diy" ? days.map((d) => ({ ...d, start: "", end: "", staff: 0, serves: 0 })) : days,
    eventType, guests: guests ? Number(guests) : null, venue, address, delivery: kind === "diy" ? delivery : true,
    stickers, wrap, catering, notes, contact,
  }), [kind, units, days, eventType, guests, venue, address, delivery, stickers, wrap, catering, notes, contact]);

  const firstDate = [...days].map((d) => d.date).filter(Boolean).sort()[0];
  const tentative = !!firstDate && Object.values(status).some((x) => x.date === firstDate && x.tentative);
  const clash = Object.values(status).find((x) => !x.ok);

  const remember = useCallback(() => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact.email.trim()) || !kind) return;
    saveCart(slug, "events", {
      email: contact.email, name: contact.name,
      summary: `${units > 1 ? `${units} × ` : ""}${s.labels[kind]}${firstDate ? ` · ${niceDate(firstDate)}` : ""}`,
      resume: `/hire/${slug}/quote?kind=${kind}`, detail: { kind, date: firstDate ?? "", units },
    }).catch(() => {});
  }, [contact.email, contact.name, kind, units, firstDate, slug, s.labels]);

  const submit = () => {
    setErr(null);
    if (!kind) { setErr("Choose what you'd like to hire."); return; }
    const p = requestProblem(req, { ...(s as EventsSettings), fleet: s.fleet } as EventsSettings, today);
    if (p) { setErr(p); return; }
    if (clash) { setErr(`${niceDate(clash.date)}: ${clash.message}.`); return; }
    start(async () => {
      const r = await requestHireQuote(slug, req);
      if (!r.ok) { setErr(r.error); return; }
      track({ k: "quote_submit", sec: "events", l: kind });
      try { localStorage.removeItem(KEY); } catch { /* fine */ }
      setDone({ reference: r.reference, tentative: r.tentative });
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  };

  if (done) {
    return (
      <div className="mx-auto max-w-[720px] rounded-[30px] bg-white p-8 text-center ring-1 ring-[#EDE3DB] sm:p-14" role="status">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[color-mix(in_srgb,var(--pk)_14%,white)] text-[var(--pk)]"><CheckCircle2 className="h-8 w-8" /></span>
        <h2 className="shop-serif mt-6 text-[2.5rem] font-semibold leading-tight">Your quote is on its way</h2>
        <p className="mx-auto mt-3 max-w-[520px] text-[1.0625rem] leading-relaxed text-[#5E5853]">
          We&apos;re checking the details now and will email your itemised quote to <strong className="text-[#151312]">{contact.email}</strong>. Your reference is <strong className="text-[#151312]">{done.reference}</strong>.
        </p>
        {done.tentative && <p className="mx-auto mt-5 max-w-[520px] rounded-2xl bg-[#FFF6E8] px-5 py-4 text-[0.9375rem] text-[#7A4B00]">Your date is less than {s.leadDays} days away, so it&apos;s pencilled in as <strong>tentative</strong> while we confirm our baristas. We&apos;ll be in touch quickly.</p>}
        <div className="mt-8 grid gap-3 text-left sm:grid-cols-3">
          {["We check the calendar and your details", "Your quote arrives by email", "Accept it online — we send the invoice and it's locked in"].map((t, i) => (
            <div key={t} className="rounded-2xl bg-[#FCF7F4] p-4"><span className="text-[0.75rem] font-bold text-[var(--pk)]">STEP {i + 1}</span><p className="mt-1 text-[0.9375rem] font-medium">{t}</p></div>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href={`/hire/${slug}/catering`} className="shop-btn inline-flex h-[52px] items-center gap-2 rounded-full bg-[var(--pk)] px-7 font-semibold text-white">Add catering<ArrowRight className="h-4 w-4" /></Link>
          <Link href={`/p/${slug}`} className="shop-btn inline-flex h-[52px] items-center rounded-full border-[1.5px] border-[#1F1B19] px-7 font-semibold">Client portal</Link>
        </div>
      </div>
    );
  }

  const hint = kind ? hints[kind] : null;
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
      <div className="space-y-6">
        {/* 1. What */}
        <section className={card} data-section="builder-kind">
          <p className="text-[0.8125rem] font-bold uppercase tracking-[0.14em] text-[var(--pk)]">Step 1</p>
          <h2 className="shop-serif mt-1 text-[1.875rem] font-semibold">What would you like?</h2>
          <div className={`mt-6 grid gap-4 ${kinds.length >= 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`} role="radiogroup" aria-label="What would you like?">
            {kinds.map((k) => {
              const Art = KIND_ART[k];
              const on = kind === k;
              return (
                <button key={k} type="button" role="radio" aria-checked={on} data-track={`Builder: ${s.labels[k]}`} onClick={() => { begin(); setKind(k); }}
                  className={`relative flex flex-col items-center rounded-[22px] border-2 px-4 pb-5 pt-4 text-center transition ${on ? "border-[var(--pk)] bg-[color-mix(in_srgb,var(--pk)_6%,white)]" : "border-[#EDE3DB] bg-white hover:border-[#D9CCC3]"}`}>
                  {on && <span className="absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-full bg-[var(--pk)] text-white"><Check className="h-3.5 w-3.5" /></span>}
                  <Art className={`h-[86px] w-[114px] ${on ? "text-[var(--pk)]" : "text-[#3A3431]"}`} />
                  <span className="mt-2 text-[1.0625rem] font-bold">{s.labels[k]}</span>
                  <span className={`mt-1 text-[0.8125rem] ${s.fleet[k] === 1 ? "font-semibold text-[var(--pk)]" : "text-[#8C847D]"}`}>
                    {s.fleet[k] === 1 ? `Only 1 — book early` : `We have ${s.fleet[k]}`}
                  </span>
                </button>
              );
            })}
          </div>
          {kind && (
            <p className="mt-5 text-[0.9375rem] text-[#5E5853]">{s.blurbs[kind]}</p>
          )}
          {kind && max > 1 && (
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <span className="text-[0.9375rem] font-semibold">How many {kind === "diy" ? "kits" : kind === "cart" ? "carts" : "vans"}?</span>
              <Stepper value={units} min={1} max={max} onChange={(n) => { begin(); setUnits(n); }} label={kind === "diy" ? "kits" : "carts"} />
              <span className="text-[0.8125rem] text-[#8C847D]">Up to {max}</span>
            </div>
          )}
        </section>

        {/* 2. When */}
        {kind && (
          <section className={card} data-section="builder-days">
            <p className="text-[0.8125rem] font-bold uppercase tracking-[0.14em] text-[var(--pk)]">Step 2</p>
            <h2 className="shop-serif mt-1 text-[1.875rem] font-semibold">{kind === "diy" ? "Which days do you need it?" : "Days, hours & baristas"}</h2>
            <div className="mt-6 space-y-4">
              {days.map((d, i) => {
                const st = d.date ? status[d.date] : undefined;
                const h = kind !== "diy" && d.start && d.end ? hrs(d.start, d.end) : 0;
                const busy = !!(hint && d.serves > hint.serves_over && h > 0 && h <= hint.max_service_hours && d.staff < 2);
                return (
                  <div key={i} className="rounded-[20px] border border-[#EDE3DB] bg-[#FFFCFA] p-4 sm:p-5">
                    <div className="flex items-center justify-between">
                      <p className="font-bold">{days.length > 1 ? `Day ${i + 1}` : kind === "diy" ? "Hire day" : "Your event"}</p>
                      {days.length > 1 && <button type="button" onClick={() => setDays((ds) => ds.filter((_, j) => j !== i))} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.8125rem] font-semibold text-[#8C847D] hover:bg-[#F4ECE6] hover:text-[#151312]"><Trash2 className="h-3.5 w-3.5" />Remove</button>}
                    </div>
                    <div className={`mt-3 grid gap-3 ${kind === "diy" ? "" : "sm:grid-cols-[1.4fr_1fr_1fr]"}`}>
                      <div><label className={lab} htmlFor={`d${i}-date`}>Date</label>
                        <CalendarPicker id={`d${i}-date`} slug={slug} kind={kind} value={d.date} onChange={(v) => setDay(i, { date: v })} today={today} total={s.fleet[kind]} wanted={units} leadDays={s.leadDays} /></div>
                      {kind !== "diy" && <>
                        <div><label className={lab} htmlFor={`d${i}-start`}>Coffee starts</label>
                          <select id={`d${i}-start`} className={field} value={d.start} onChange={(e) => setDay(i, { start: e.target.value })}>{TIMES.map((t) => <option key={t} value={t}>{fmtT(t)}</option>)}</select></div>
                        <div><label className={lab} htmlFor={`d${i}-end`}>Finishes</label>
                          <select id={`d${i}-end`} className={field} value={d.end} onChange={(e) => setDay(i, { end: e.target.value })}>{TIMES.filter((t) => t > d.start).map((t) => <option key={t} value={t}>{fmtT(t)}</option>)}</select></div>
                      </>}
                    </div>
                    {kind !== "diy" && (
                      <div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-4">
                        <div><span className={lab}>Baristas</span><Stepper value={d.staff} min={1} max={units * 3} onChange={(n) => setDay(i, { staff: n })} label="baristas" /></div>
                        <div><label className={lab} htmlFor={`d${i}-serves`}>About how many coffees?</label>
                          <div className="flex flex-wrap items-center gap-2">
                            <input id={`d${i}-serves`} inputMode="numeric" className={`${field} w-[110px]`} value={d.serves || ""} onChange={(e) => setDay(i, { serves: Math.max(0, Math.min(10000, Number(e.target.value.replace(/\D/g, "")) || 0)) })} />
                            {[50, 100, 200, 300].map((n) => <button key={n} type="button" onClick={() => setDay(i, { serves: n })} className={`h-9 rounded-full px-3.5 text-[0.875rem] font-semibold transition ${d.serves === n ? "bg-[#151312] text-white" : "bg-[#F4ECE6] text-[#3A3431] hover:bg-[#EDE2DA]"}`}>{n}</button>)}
                          </div>
                        </div>
                      </div>
                    )}
                    {busy && <p className="mt-4 flex gap-2 rounded-xl bg-[#FFF6E8] px-4 py-3 text-[0.875rem] text-[#7A4B00]"><Users className="mt-0.5 h-4 w-4 shrink-0" />Over {hint!.serves_over} coffees in {h <= 1 ? "an hour" : `${h} hours`}? We recommend 2 baristas — one pours shots while the other steams milk and hands out drinks, so the line moves twice as fast.</p>}
                    {st && (
                      <p className={`mt-4 flex items-center gap-2 rounded-xl px-4 py-3 text-[0.875rem] font-medium ${!st.ok ? "bg-[#FFF1F1] text-[#B42318]" : st.total === 1 || st.free < st.total ? "bg-[color-mix(in_srgb,var(--pk)_10%,white)] text-[#151312]" : "bg-[#EEF8F1] text-[#1B6B3A]"}`}>
                        {!st.ok ? <AlertTriangle className="h-4 w-4 shrink-0" /> : st.total === 1 || st.free < st.total ? <Sparkles className="h-4 w-4 shrink-0 text-[var(--pk)]" /> : <Check className="h-4 w-4 shrink-0" />}
                        {st.message}{st.ok && st.tentative ? ` · tentative (under ${s.leadDays} days) until our baristas are confirmed` : ""}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            <button type="button" onClick={addDay} data-track="Builder: add day" className="mt-4 inline-flex h-[48px] items-center gap-2 rounded-full border-[1.5px] border-dashed border-[#CFC3BA] px-6 text-[0.9375rem] font-semibold hover:border-[var(--pk)] hover:text-[var(--pk)]"><Plus className="h-4 w-4" />Add {kind === "diy" ? "another day" : "a day"}</button>
          </section>
        )}

        {/* 3. Event */}
        {kind && (
          <section className={card} data-section="builder-event">
            <p className="text-[0.8125rem] font-bold uppercase tracking-[0.14em] text-[var(--pk)]">Step 3</p>
            <h2 className="shop-serif mt-1 text-[1.875rem] font-semibold">About your event</h2>
            <div className="mt-5 flex flex-wrap gap-2" role="radiogroup" aria-label="Type of event">
              {EVENT_TYPES.map((t) => <button key={t} type="button" role="radio" aria-checked={eventType === t} onClick={() => { begin(); setEventType(eventType === t ? "" : t); }} className={`h-10 rounded-full px-4 text-[0.9063rem] font-semibold transition ${eventType === t ? "bg-[#151312] text-white" : "bg-[#F4ECE6] text-[#3A3431] hover:bg-[#EDE2DA]"}`}>{t}</button>)}
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div><label className={lab} htmlFor="q-guests">Guests <span className="font-normal text-[#8C847D]">(approx.)</span></label><input id="q-guests" inputMode="numeric" className={field} value={guests} onChange={(e) => setGuests(e.target.value.replace(/\D/g, "").slice(0, 6))} /></div>
              <div><label className={lab} htmlFor="q-venue">Venue name</label><input id="q-venue" className={field} value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="e.g. National Convention Centre" /></div>
              <div className="sm:col-span-2"><label className={lab} htmlFor="q-address">Address</label><input id="q-address" className={field} autoComplete="street-address" value={address} onChange={(e) => setAddress(e.target.value)} /></div>
            </div>
            {kind === "diy" && (
              <div className="mt-5 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Delivery">
                {[{ v: true, t: "Deliver & set it up", b: "We bring it, install it and collect it", i: Truck }, { v: false, t: "I'll pick it up", b: "Collect and return it yourself", i: Coffee }].map((o) => (
                  <button key={o.t} type="button" role="radio" aria-checked={delivery === o.v} onClick={() => setDelivery(o.v)} className={`flex items-start gap-3 rounded-[18px] border-2 p-4 text-left transition ${delivery === o.v ? "border-[var(--pk)] bg-[color-mix(in_srgb,var(--pk)_6%,white)]" : "border-[#EDE3DB]"}`}>
                    <o.i className="mt-0.5 h-5 w-5 text-[var(--pk)]" /><span><span className="block font-bold">{o.t}</span><span className="text-[0.875rem] text-[#5E5853]">{o.b}</span></span>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {/* 4. Extras */}
        {kind && (
          <section className={card} data-section="builder-extras">
            <p className="text-[0.8125rem] font-bold uppercase tracking-[0.14em] text-[var(--pk)]">Step 4 · optional</p>
            <h2 className="shop-serif mt-1 text-[1.875rem] font-semibold">Make it yours</h2>
            <div className="mt-5 space-y-3">
              {s.stickerPrice != null && kind !== "diy" && (
                <div className="flex flex-wrap items-center justify-between gap-4 rounded-[18px] border border-[#EDE3DB] p-4">
                  <span><span className="block font-bold">Your logo on every cup</span><span className="text-[0.875rem] text-[#5E5853]">{s.stickerSize} stickers, printed and applied by us</span></span>
                  <div className="flex items-center gap-2">
                    <input inputMode="numeric" aria-label="Number of cup stickers" className={`${field} w-[110px]`} placeholder="0" value={stickers || ""} onChange={(e) => setStickers(Math.min(20000, Number(e.target.value.replace(/\D/g, "")) || 0))} />
                    <button type="button" onClick={() => setStickers(days.reduce((a, d) => a + (d.serves || 0), 0))} className="h-9 rounded-full bg-[#F4ECE6] px-3.5 text-[0.8125rem] font-semibold hover:bg-[#EDE2DA]">One per coffee</button>
                  </div>
                </div>
              )}
              {kind !== "diy" && (
                <label className="flex cursor-pointer items-start gap-3 rounded-[18px] border border-[#EDE3DB] p-4">
                  <input type="checkbox" className="mt-1 h-5 w-5 accent-[var(--pk)]" checked={wrap} onChange={(e) => setWrap(e.target.checked)} />
                  <span><span className="block font-bold">Wrap the {s.labels[kind].toLowerCase()} in our branding</span><span className="text-[0.875rem] text-[#5E5853]">We&apos;ll talk artwork and add it to your quote. <Link href={`/hire/${slug}/branding`} className="font-semibold text-[var(--pk)]">See branding</Link></span></span>
                </label>
              )}
              <label className="flex cursor-pointer items-start gap-3 rounded-[18px] border border-[#EDE3DB] p-4">
                <input type="checkbox" className="mt-1 h-5 w-5 accent-[var(--pk)]" checked={catering} onChange={(e) => setCatering(e.target.checked)} />
                <span><span className="flex items-center gap-2 font-bold"><UtensilsCrossed className="h-4 w-4 text-[var(--pk)]" />I&apos;d like catering too</span><span className="text-[0.875rem] text-[#5E5853]">Morning tea, lunch or afternoon tea. <Link href={`/hire/${slug}/catering`} className="font-semibold text-[var(--pk)]">Build a catering order</Link></span></span>
              </label>
            </div>
          </section>
        )}

        {/* 5. Contact */}
        {kind && (
          <section className={card} data-section="builder-contact">
            <p className="text-[0.8125rem] font-bold uppercase tracking-[0.14em] text-[var(--pk)]">Step 5</p>
            <h2 className="shop-serif mt-1 text-[1.875rem] font-semibold">Where should we send your quote?</h2>
            {!signedIn && <p className="mt-2 text-[0.9375rem] text-[#5E5853]">Booked with us before? <Link href={`/p/${slug}/login`} className="font-semibold text-[#151312] underline decoration-[var(--pk)] decoration-2 underline-offset-4">Sign in</Link> and we&apos;ll fill this in.</p>}
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div><label className={lab} htmlFor="q-name">Your name</label><input id="q-name" className={field} autoComplete="name" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} onBlur={remember} /></div>
              <div><label className={lab} htmlFor="q-email">Email</label><input id="q-email" type="email" className={field} autoComplete="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} onBlur={remember} /></div>
              <div><label className={lab} htmlFor="q-phone">Mobile</label><input id="q-phone" type="tel" className={field} autoComplete="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} /></div>
              <div><label className={lab} htmlFor="q-company">Company <span className="font-normal text-[#8C847D]">(optional)</span></label><input id="q-company" className={field} autoComplete="organization" value={contact.company} onChange={(e) => setContact({ ...contact, company: e.target.value })} /></div>
              <div className="sm:col-span-2"><label className={lab} htmlFor="q-notes">Anything else? <span className="font-normal text-[#8C847D]">(optional)</span></label><textarea id="q-notes" rows={3} className={`${field} h-auto py-3.5`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Access, power, parking, timings…" /></div>
            </div>
          </section>
        )}
      </div>

      {/* Summary */}
      <aside className="lg:sticky lg:top-[84px]">
        <div className="rounded-[26px] bg-[#151312] p-6 text-white sm:p-7">
          <p className="shop-serif text-[1.625rem] font-semibold">Your event</p>
          {!kind ? <p className="mt-3 text-white/70">Choose a cart, the van or equipment only to start.</p> : (
            <div className="mt-4 space-y-3 text-[0.9375rem]">
              <p className="flex items-center justify-between gap-3"><span className="text-white/65">Hiring</span><span className="text-right font-semibold">{units > 1 ? `${units} × ` : ""}{s.labels[kind]}</span></p>
              {days.map((d, i) => (
                <div key={i} className="rounded-2xl bg-white/[0.07] px-4 py-3">
                  <p className="font-semibold">{d.date ? niceDate(d.date) : `Day ${i + 1} — choose a date`}</p>
                  {kind !== "diy" && <p className="mt-0.5 flex flex-wrap gap-x-3 text-[0.8438rem] text-white/70"><span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{fmtT(d.start)}–{fmtT(d.end)}</span><span>{d.staff} barista{d.staff > 1 ? "s" : ""}</span><span>~{d.serves} coffees</span></p>}
                  {d.date && status[d.date] && <p className={`mt-1 text-[0.8125rem] font-semibold ${status[d.date].ok ? "text-[#9BE3B4]" : "text-[#FF9C9C]"}`}>{status[d.date].ok ? (status[d.date].tentative ? "Free · tentative" : "Free") : "Not available"}</p>}
                </div>
              ))}
              {(stickers > 0 || wrap || catering) && <p className="text-[0.8438rem] text-white/70">{[stickers > 0 ? `${stickers} cup stickers` : "", wrap ? "Branded wrap" : "", catering ? "Catering" : ""].filter(Boolean).join(" · ")}</p>}
            </div>
          )}
          {tentative && !clash && <p className="mt-4 rounded-2xl bg-[#3A2A10] px-4 py-3 text-[0.8438rem] text-[#FFD9A0]">Under {s.leadDays} days away — we&apos;ll pencil it in as tentative while we confirm staff.</p>}
          {kind && s.fleet[kind] === 1 && !clash && firstDate && <p className="mt-4 rounded-2xl bg-[color-mix(in_srgb,var(--pk)_30%,#151312)] px-4 py-3 text-[0.8438rem]">We only have one {s.labels[kind].toLowerCase()} — request your quote now to hold the date before someone else does.</p>}
          {err && <p className="mt-4 rounded-2xl bg-[#FFF1F1] px-4 py-3 text-[0.875rem] text-[#B42318]" role="alert">{err}</p>}
          <button type="button" onClick={submit} disabled={pending || !kind} data-track="Builder: email my quote" className="shop-btn mt-6 inline-flex h-[58px] w-full items-center justify-center gap-2.5 rounded-full bg-[var(--pk)] text-[1.0625rem] font-semibold text-white disabled:opacity-50">
            {pending ? "Sending…" : <>Email me my quote<ArrowRight className="h-5 w-5" /></>}
          </button>
          <p className="mt-3 text-center text-[0.8125rem] text-white/60">Free, no obligation. Your itemised quote comes by email.</p>
        </div>
      </aside>
    </div>
  );
}
