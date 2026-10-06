"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2, ChevronDown, Clock, LayoutGrid, List, Minus, Plus, RotateCcw, Search, ShoppingBag, SlidersHorizontal, Store, Sun, Sunrise, Sunset, Trash2, Truck, Users, X } from "lucide-react";
import type { CateringItem, CateringOrder, CateringSettings, Slot } from "@/lib/events/core";
import { cateringProblem, deliveryCharge, menuOrder, SLOTS } from "@/lib/events/core";
import { requestCatering, saveCart } from "@/app/hire/[org]/actions";
import { track } from "@/components/site/tracker";

const field = "h-[52px] w-full rounded-[14px] border border-[#E6DCD4] bg-white px-4 text-[0.9688rem] text-[#151312] outline-none transition placeholder:text-[#A39A93] focus:border-[var(--pk)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--pk)_14%,transparent)]";
const lab = "mb-1.5 block text-[0.8125rem] font-semibold text-[#3A3431]";
const ICON: Record<Slot, typeof Sun> = { morning: Sunrise, lunch: Sun, afternoon: Sunset };
const SHORT: Record<Slot, string> = { morning: "Morning", lunch: "Lunch", afternoon: "Afternoon" };
const TIMES = Array.from({ length: 27 }, (_, i) => { const m = 6 * 60 + i * 30; return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; });
const fmtT = (t: string) => { const h = Number(t.slice(0, 2)); return `${h % 12 || 12}${t.slice(3) === "00" ? "" : ":" + t.slice(3)}${h < 12 ? "am" : "pm"}`; };
const aud = (n: number) => `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const perPerson = (u: string | null) => /person|pp|head/i.test(u ?? "");
const niceDate = (s: string) => new Intl.DateTimeFormat("en-AU", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(s + "T00:00:00Z"));

type Lines = Record<Slot, Record<string, number>>;
type Custom = Record<Slot, string[]>;
const emptyLines = (): Lines => ({ morning: {}, lunch: {}, afternoon: {} });
const emptyCustom = (): Custom => ({ morning: [], lunch: [], afternoon: [] });

export function CateringBuilder({ slug, menu, today, leadDays, cs, pickupFrom, prefill }: {
  slug: string; menu: CateringItem[]; today: string; leadDays: number; cs: CateringSettings; pickupFrom: string | null;
  prefill: { name: string; email: string; phone: string; company: string };
}) {
  const KEY = `eos-catering-${slug}`;
  const min = cs.minQty;
  const [step, setStep] = useState<"menu" | "details">("menu");
  const [slot, setSlot] = useState<Slot>("morning");
  const [people, setPeople] = useState<Record<Slot, number>>({ morning: Math.max(20, min), lunch: Math.max(20, min), afternoon: Math.max(20, min) });
  const [times, setTimes] = useState<Record<Slot, string>>({ morning: SLOTS[0].time, lunch: SLOTS[1].time, afternoon: SLOTS[2].time });
  const [lines, setLines] = useState<Lines>(emptyLines);
  const [custom, setCustom] = useState<Custom>(emptyCustom);
  const [extra, setExtra] = useState<Record<Slot, string[]>>({ morning: [], lunch: [], afternoon: [] });
  const [tab, setTab] = useState<string | null>(null);
  const [showOther, setShowOther] = useState(false);
  const [layout, setLayout] = useState(cs.layout);
  const [view, setView] = useState(cs.display);
  const [query, setQuery] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const filterBox = useRef<HTMLDivElement>(null);
  const [pickup, setPickup] = useState(cs.deliveryFee === null);
  const [date, setDate] = useState("");
  const [venue, setVenue] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [contact, setContact] = useState(prefill);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ reference: string; tentative: boolean } | null>(null);
  const [pending, start] = useTransition();
  const started = useRef(false);
  const top = useRef<HTMLDivElement>(null);

  // Keep the order on this device so coming back picks up where they left off
  useEffect(() => {
    try {
      const d = JSON.parse(localStorage.getItem(KEY) ?? "null");
      if (!d) return;
      if (d.lines) setLines({ ...emptyLines(), ...d.lines });
      if (d.custom) setCustom({ ...emptyCustom(), ...d.custom });
      if (d.people) setPeople(d.people);
      if (d.times) setTimes(d.times);
      if (d.date && d.date >= today) setDate(d.date);
      if (d.venue) setVenue(d.venue);
      if (d.address) setAddress(d.address);
      if (typeof d.pickup === "boolean" && (d.pickup ? cs.pickup : cs.deliveryFee !== null)) setPickup(d.pickup);
      if (d.contact && !prefill.email) setContact((c) => ({ ...c, ...d.contact }));
    } catch { /* fresh */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    try { const v = JSON.parse(localStorage.getItem("eos-catering-view") ?? "null"); if (v?.layout === "list" || v?.layout === "tabs") setLayout(v.layout); if (v?.view === "tiles" || v?.view === "rows") setView(v.view); } catch { /* default */ }
  }, []);
  const choose = (patch: { layout?: "list" | "tabs"; view?: "tiles" | "rows" }) => {
    const next = { layout: patch.layout ?? layout, view: patch.view ?? view };
    setLayout(next.layout); setView(next.view);
    try { localStorage.setItem("eos-catering-view", JSON.stringify(next)); } catch { /* off */ }
  };
  useEffect(() => {
    if (!filterOpen) return;
    const close = (e: MouseEvent) => { if (filterBox.current && !filterBox.current.contains(e.target as Node)) setFilterOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setFilterOpen(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [filterOpen]);
  useEffect(() => { if (!done) try { localStorage.setItem(KEY, JSON.stringify({ lines, custom, people, times, date, venue, address, pickup, contact })); } catch { /* off */ } },
    [KEY, lines, custom, people, times, date, venue, address, pickup, contact, done]);

  const byId = useMemo(() => new Map(menu.map((m) => [m.id, m])), [menu]);
  const allGroups = useMemo(() => [...new Set(menu.map((m) => m.group))], [menu]);
  const { first, rest } = useMemo(() => menuOrder(allGroups, slot, cs), [allGroups, slot, cs]);
  const preferred = first.length ? first : allGroups;
  const others = first.length ? rest : [];
  const shown = [...preferred, ...extra[slot].filter((g) => others.includes(g))];
  const activeTab = tab && shown.includes(tab) ? tab : shown[0];
  useEffect(() => { setTab(null); setShowOther(false); }, [slot]);

  const begin = () => { if (!started.current) { started.current = true; track({ k: "quote_start", sec: "events", l: "catering" }); } };
  const isCustom = (sl: Slot, id: string) => custom[sl].includes(id);
  const markCustom = (sl: Slot, id: string, on: boolean) => setCustom((c) => ({ ...c, [sl]: on ? [...new Set([...c[sl], id])] : c[sl].filter((x) => x !== id) }));
  const setQty = (sl: Slot, id: string, q: number, manual: boolean) => {
    begin();
    setLines((L) => { const next = { ...L[sl] }; if (q > 0) next[id] = Math.min(2000, q); else delete next[id]; return { ...L, [sl]: next }; });
    if (q <= 0) markCustom(sl, id, false); else if (manual) markCustom(sl, id, true);
  };
  const follow = (id: string) => Math.max(min, perPerson(byId.get(id)?.unit ?? null) ? people[slot] : min);
  const add = (id: string) => { setQty(slot, id, follow(id), false); track({ k: "cart_add", sec: "events", l: `Catering: ${byId.get(id)?.name}` }); };
  const setSlotPeople = (sl: Slot, n: number) => {
    setPeople({ ...people, [sl]: n });
    // Per-person items follow the headcount — unless the customer set their own amount
    setLines((L) => ({ ...L, [sl]: Object.fromEntries(Object.entries(L[sl]).map(([id, q]) => [id, !custom[sl].includes(id) && perPerson(byId.get(id)?.unit ?? null) ? Math.max(min, n) : q])) }));
  };

  const order: CateringOrder = {
    date, venue, address, notes, pickup,
    guests: Math.max(0, ...SLOTS.map((s) => (Object.keys(lines[s.id]).length ? people[s.id] : 0))) || null,
    slots: SLOTS.map((s) => ({ slot: s.id, time: times[s.id], items: Object.entries(lines[s.id]).map(([serviceId, qty]) => ({ serviceId, qty })) })),
    contact,
  };
  const totals = useMemo(() => {
    let sub = 0, gst = 0;
    const bySlot = {} as Record<Slot, number>;
    for (const sl of SLOTS) {
      let t = 0;
      for (const [id, q] of Object.entries(lines[sl.id])) { const m = byId.get(id); if (!m) continue; const ex = m.unit_price * q; sub += ex; gst += ex * m.tax_rate / 100; t += ex; }
      bySlot[sl.id] = Math.round(t * 100) / 100;
    }
    const d = deliveryCharge({ slots: SLOTS.map((s) => ({ slot: s.id, time: "", items: Object.entries(lines[s.id]).map(([serviceId, qty]) => ({ serviceId, qty })) })), pickup }, cs);
    const del = d.qty * d.each;
    gst += del * 0.1;
    const r = (n: number) => Math.round(n * 100) / 100;
    return { items: r(sub), delivery: r(del), deliveryQty: d.qty, gst: r(gst), total: r(sub + del + gst), bySlot };
  }, [lines, byId, pickup, cs]);
  const count = SLOTS.reduce((a, s) => a + Object.keys(lines[s.id]).length, 0);
  const under = SLOTS.flatMap((s) => Object.entries(lines[s.id]).filter(([, q]) => q < min).map(([id]) => byId.get(id)?.name)).filter(Boolean);
  const tentative = !!date && (Date.parse(date) - Date.parse(today)) / 864e5 < leadDays;

  const goDetails = () => {
    setErr(null);
    if (!count) { setErr("Add something from the menu first."); return; }
    if (under.length) { setErr(`The minimum is ${min} of each item — check ${under[0]}.`); return; }
    track({ k: "checkout_start", sec: "events", l: "catering" });
    setStep("details");
    requestAnimationFrame(() => top.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const remember = () => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact.email.trim()) || !count) return;
    saveCart(slug, "catering", { email: contact.email, name: contact.name, summary: `Catering · ${count} item${count > 1 ? "s" : ""}${date ? ` · ${niceDate(date)}` : ""}`, total: totals.total, resume: `/hire/${slug}/catering`, detail: { date } }).catch(() => {});
  };
  const submit = () => {
    setErr(null);
    const p = cateringProblem(order, menu, today, cs);
    if (p) { setErr(p); return; }
    start(async () => {
      const r = await requestCatering(slug, order);
      if (!r.ok) { setErr(r.error); return; }
      track({ k: "quote_submit", sec: "events", l: "catering" });
      try { localStorage.removeItem(KEY); } catch { /* fine */ }
      setDone({ reference: r.reference, tentative: r.tentative });
      requestAnimationFrame(() => top.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    });
  };

  /* ---------------- pieces ---------------- */

  const itemCard = (m: CateringItem) => {
    const q = lines[slot][m.id] ?? 0;
    const own = isCustom(slot, m.id);
    const pp = perPerson(m.unit);
    return (
      <div key={m.id} className={`flex flex-col rounded-[20px] bg-white p-5 ring-1 transition ${q ? "ring-2 ring-[var(--pk)]" : "ring-[#EDE3DB]"}`}>
        <div className="flex items-start justify-between gap-3">
          <p className="text-[1.0625rem] font-semibold leading-snug">{m.name}</p>
          <p className="shrink-0 text-right"><span className="block font-bold">{aud(m.unit_price)} <span className="text-[0.75rem] font-semibold text-[#8C847D]">+ GST</span></span><span className="text-[0.75rem] text-[#8C847D]">{pp ? "per person" : "each"}</span></p>
        </div>
        {m.description && <p className="mt-1.5 flex-1 text-[0.875rem] leading-relaxed text-[#5E5853]">{m.description}</p>}
        <div className="mt-4">
          {q ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <div className="inline-flex h-[44px] items-center rounded-full bg-[#F7EFEA]">
                  <button type="button" aria-label={q <= min ? `Remove ${m.name}` : `Fewer ${m.name}`} onClick={() => setQty(slot, m.id, q <= min ? 0 : q - 1, true)} className="grid h-full w-11 place-items-center">{q <= min ? <Trash2 className="h-4 w-4" /> : <Minus className="h-4 w-4" />}</button>
                  <input aria-label={`${m.name} quantity`} inputMode="numeric" className="w-14 bg-transparent text-center font-bold outline-none" value={q} onChange={(e) => setQty(slot, m.id, Number(e.target.value.replace(/\D/g, "")) || 0, true)} />
                  <button type="button" aria-label={`More ${m.name}`} onClick={() => setQty(slot, m.id, q + 1, true)} className="grid h-full w-11 place-items-center"><Plus className="h-4 w-4" /></button>
                </div>
                <span className="font-semibold">{aud(m.unit_price * q)}</span>
              </div>
              {q < min ? <p className="mt-2 text-[0.8125rem] font-medium text-[#B42318]">Minimum {min}</p>
                : own && pp ? <p className="mt-2 flex flex-wrap items-center gap-x-2 text-[0.8125rem] text-[#5E5853]"><span className="rounded-full bg-[#F4ECE6] px-2 py-0.5 text-[0.75rem] font-semibold text-[#3A3431]">Your own amount</span>won&apos;t change with people
                  <button type="button" onClick={() => { markCustom(slot, m.id, false); setQty(slot, m.id, Math.max(min, people[slot]), false); }} className="inline-flex items-center gap-1 font-semibold text-[var(--pk)]"><RotateCcw className="h-3 w-3" />Match {Math.max(min, people[slot])}</button></p>
                : null}
            </>
          ) : (
            <button type="button" onClick={() => add(m.id)} data-track-kind="cart_add" data-track={`Catering add: ${m.name}`} className="shop-btn inline-flex h-[44px] items-center gap-2 rounded-full border-[1.5px] border-[#1F1B19] px-5 text-[0.9375rem] font-semibold hover:bg-[#151312] hover:text-white">
              <Plus className="h-4 w-4" />Add {follow(m.id)}
            </button>
          )}
        </div>
      </div>
    );
  };
  const itemRow = (m: CateringItem) => {
    const q = lines[slot][m.id] ?? 0;
    const own = isCustom(slot, m.id);
    const pp = perPerson(m.unit);
    return (
      <li key={m.id} className={`flex items-center gap-4 px-4 py-3 sm:px-5 ${q ? "bg-[color-mix(in_srgb,var(--pk)_5%,white)]" : ""}`}>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.9688rem] font-semibold">{m.name}<span className="ml-2 text-[0.8125rem] font-semibold text-[#8C847D] sm:hidden">{aud(m.unit_price)} + GST</span></p>
          <p className="truncate text-[0.8438rem] text-[#5E5853]">{m.description || (pp ? "Per person" : "Each")}</p>
          {q > 0 && q < min && <p className="text-[0.75rem] font-medium text-[#B42318]">Minimum {min}</p>}
          {q >= min && own && pp && <p className="text-[0.75rem] text-[#5E5853]">Your own amount · <button type="button" onClick={() => { markCustom(slot, m.id, false); setQty(slot, m.id, Math.max(min, people[slot]), false); }} className="font-semibold text-[var(--pk)]">match {Math.max(min, people[slot])}</button></p>}
        </div>
        <p className="hidden shrink-0 text-right sm:block"><span className="block text-[0.9375rem] font-bold">{aud(m.unit_price)}</span><span className="text-[0.6875rem] text-[#8C847D]">+ GST {pp ? "pp" : "ea"}</span></p>
        <div className="flex w-[124px] shrink-0 justify-end">
          {q ? (
            <div className="inline-flex h-[40px] items-center rounded-full bg-[#F7EFEA]">
              <button type="button" aria-label={q <= min ? `Remove ${m.name}` : `Fewer ${m.name}`} onClick={() => setQty(slot, m.id, q <= min ? 0 : q - 1, true)} className="grid h-full w-9 place-items-center">{q <= min ? <Trash2 className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}</button>
              <input aria-label={`${m.name} quantity`} inputMode="numeric" className="w-11 bg-transparent text-center text-[0.9375rem] font-bold outline-none" value={q} onChange={(e) => setQty(slot, m.id, Number(e.target.value.replace(/\D/g, "")) || 0, true)} />
              <button type="button" aria-label={`More ${m.name}`} onClick={() => setQty(slot, m.id, q + 1, true)} className="grid h-full w-9 place-items-center"><Plus className="h-3.5 w-3.5" /></button>
            </div>
          ) : (
            <button type="button" onClick={() => add(m.id)} data-track-kind="cart_add" data-track={`Catering add: ${m.name}`} className="shop-btn inline-flex h-[40px] items-center gap-1.5 rounded-full border-[1.5px] border-[#1F1B19] px-4 text-[0.875rem] font-semibold hover:bg-[#151312] hover:text-white">
              <Plus className="h-3.5 w-3.5" />Add {follow(m.id)}
            </button>
          )}
        </div>
      </li>
    );
  };
  const items = (list: CateringItem[]) => view === "rows"
    ? <ul className="divide-y divide-[#EDE3DB] overflow-hidden rounded-[20px] bg-white ring-1 ring-[#EDE3DB]">{list.map(itemRow)}</ul>
    : <div className="grid gap-4 sm:grid-cols-2">{list.map(itemCard)}</div>;
  const q = query.trim().toLowerCase();
  const found = q ? menu.filter((m) => `${m.name} ${m.description ?? ""} ${m.group}`.toLowerCase().includes(q)) : [];
  const group = (g: string, heading = layout === "list") => (
    <div key={g} data-section={`menu-${g.toLowerCase().replace(/[^a-z]+/g, "-")}`}>
      {heading && <p className={`shop-serif font-semibold ${view === "rows" ? "text-[1.5rem]" : "text-[1.875rem]"}`}>{g}</p>}
      <div className={heading ? (view === "rows" ? "mt-3" : "mt-4") : ""}>{items(menu.filter((m) => m.group === g))}</div>
    </div>
  );

  const summaryLines = (compact: boolean) => (
    <div className="space-y-4">
      {SLOTS.filter((s) => Object.keys(lines[s.id]).length).map((s) => (
        <div key={s.id}>
          <p className="flex justify-between text-[0.8125rem] font-bold uppercase tracking-wide text-[#8C847D]"><span>{SHORT[s.id]} · {fmtT(times[s.id])} · {people[s.id]} people</span><span>{aud(totals.bySlot[s.id])}</span></p>
          <ul className="mt-1.5 space-y-1 text-[0.9063rem]">
            {Object.entries(lines[s.id]).map(([id, q]) => (
              <li key={id} className="flex items-start justify-between gap-3">
                <span className={q < min ? "text-[#B42318]" : ""}>{q} × {byId.get(id)?.name}{isCustom(s.id, id) && perPerson(byId.get(id)?.unit ?? null) ? <span className="ml-1.5 text-[0.75rem] text-[#8C847D]">(own amount)</span> : null}</span>
                {!compact && <span className="shrink-0 tabular-nums text-[#5E5853]">{aud((byId.get(id)?.unit_price ?? 0) * q)}</span>}
                {compact && <button type="button" aria-label="Remove" onClick={() => setQty(s.id, id, 0, true)} className="mt-0.5 shrink-0 text-[#B9AEA6] hover:text-[#151312]"><Trash2 className="h-3.5 w-3.5" /></button>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
  const totalBlock = (
    <div className="space-y-1 border-t border-[#EDE3DB] pt-3 text-[0.9375rem]">
      <p className="flex justify-between text-[#5E5853]"><span>Food &amp; drinks</span><span className="tabular-nums">{aud(totals.items)}</span></p>
      <p className="flex justify-between text-[#5E5853]"><span>{pickup ? "Pickup" : `Delivery${totals.deliveryQty > 1 ? ` × ${totals.deliveryQty}` : ""}`}</span><span className="tabular-nums">{pickup ? "Free" : aud(totals.delivery)}</span></p>
      <p className="flex justify-between text-[#5E5853]"><span>GST</span><span className="tabular-nums">{aud(totals.gst)}</span></p>
      <p className="flex justify-between pt-1 text-[1.375rem] font-bold"><span>Total</span><span className="tabular-nums">{aud(totals.total)}</span></p>
    </div>
  );

  /* ---------------- done ---------------- */
  if (done) {
    return (
      <div ref={top} className="mx-auto max-w-[720px] scroll-mt-28 rounded-[30px] bg-white p-8 text-center ring-1 ring-[#EDE3DB] sm:p-14" role="status">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[color-mix(in_srgb,var(--pk)_14%,white)] text-[var(--pk)]"><CheckCircle2 className="h-8 w-8" /></span>
        <h2 className="shop-serif mt-6 text-[2.5rem] font-semibold leading-tight">Your order is in</h2>
        <p className="mx-auto mt-3 max-w-[520px] text-[1.0625rem] leading-relaxed text-[#5E5853]">We&apos;ll check it and email your quote to <strong className="text-[#151312]">{contact.email}</strong>. Accept it online and we&apos;ll send the invoice to lock it in. Reference <strong className="text-[#151312]">{done.reference}</strong>.</p>
        {done.tentative && <p className="mx-auto mt-5 max-w-[520px] rounded-2xl bg-[#FFF6E8] px-5 py-4 text-[0.9375rem] text-[#7A4B00]">It&apos;s less than {leadDays} days away, so it&apos;s <strong>tentative</strong> until our kitchen confirms — we&apos;ll be in touch quickly.</p>}
        <Link href={`/hire/${slug}/quote`} className="shop-btn mt-8 inline-flex h-[52px] items-center gap-2 rounded-full bg-[var(--pk)] px-7 font-semibold text-white">Add a coffee cart<ArrowRight className="h-4 w-4" /></Link>
      </div>
    );
  }

  /* ---------------- step 2: details ---------------- */
  if (step === "details") {
    return (
      <div ref={top} className="scroll-mt-28">
        <button type="button" onClick={() => setStep("menu")} className="mb-5 inline-flex items-center gap-2 text-[0.9375rem] font-semibold text-[#3A3431] hover:text-[var(--pk)]"><ArrowLeft className="h-4 w-4" />Back to the menu</button>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start">
          <div className="space-y-6">
            <section className="rounded-[26px] bg-white p-6 ring-1 ring-[#EDE3DB] sm:p-8">
              <h2 className="shop-serif text-[1.875rem] font-semibold">When and where?</h2>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div><label className={lab} htmlFor="c-date">Date</label><input id="c-date" type="date" min={today} className={field} value={date} onChange={(e) => setDate(e.target.value)} /></div>
                <div><label className={lab} htmlFor="c-venue">Company / venue <span className="font-normal text-[#8C847D]">(optional)</span></label><input id="c-venue" className={field} value={venue} onChange={(e) => setVenue(e.target.value)} /></div>
              </div>
              {tentative && <p className="mt-4 rounded-xl bg-[#FFF6E8] px-4 py-3 text-[0.875rem] text-[#7A4B00]">That&apos;s under {leadDays} days away — we&apos;ll pencil it in as tentative until the kitchen confirms.</p>}
              <div className="mt-5 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Delivery or pickup">
                {cs.deliveryFee !== null && (
                  <button type="button" role="radio" aria-checked={!pickup} onClick={() => setPickup(false)} className={`flex items-start gap-3 rounded-[18px] border-2 p-4 text-left transition ${!pickup ? "border-[var(--pk)] bg-[color-mix(in_srgb,var(--pk)_6%,white)]" : "border-[#EDE3DB] bg-white"}`}>
                    <Truck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--pk)]" /><span><span className="block font-bold">Deliver it — {aud(cs.deliveryFee)} + GST</span><span className="text-[0.875rem] text-[#5E5853]">{cs.deliveryPer === "delivery" ? "Per delivery time" : "For the whole order"}</span></span>
                  </button>
                )}
                {cs.pickup && (
                  <button type="button" role="radio" aria-checked={pickup} onClick={() => setPickup(true)} className={`flex items-start gap-3 rounded-[18px] border-2 p-4 text-left transition ${pickup ? "border-[var(--pk)] bg-[color-mix(in_srgb,var(--pk)_6%,white)]" : "border-[#EDE3DB] bg-white"}`}>
                    <Store className="mt-0.5 h-5 w-5 shrink-0 text-[var(--pk)]" /><span><span className="block font-bold">I&apos;ll pick it up — free</span><span className="text-[0.875rem] text-[#5E5853]">{pickupFrom ? `From ${pickupFrom}` : "From our kitchen"}</span></span>
                  </button>
                )}
              </div>
              {!pickup && <div className="mt-4"><label className={lab} htmlFor="c-addr">Delivery address</label><input id="c-addr" className={field} autoComplete="street-address" value={address} onChange={(e) => setAddress(e.target.value)} /></div>}
              <p className="mt-4 text-[0.875rem] text-[#5E5853]">{pickup ? "Ready to collect at" : "Delivered at"}: {SLOTS.filter((s) => Object.keys(lines[s.id]).length).map((s) => `${SHORT[s.id].toLowerCase()} ${fmtT(times[s.id])}`).join(", ")}. <button type="button" onClick={() => setStep("menu")} className="font-semibold text-[var(--pk)]">Change</button></p>
            </section>
            <section className="rounded-[26px] bg-white p-6 ring-1 ring-[#EDE3DB] sm:p-8">
              <h2 className="shop-serif text-[1.875rem] font-semibold">Your details</h2>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div><label className={lab} htmlFor="c-name">Your name</label><input id="c-name" className={field} autoComplete="name" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} onBlur={remember} /></div>
                <div><label className={lab} htmlFor="c-email">Email</label><input id="c-email" type="email" className={field} autoComplete="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} onBlur={remember} /></div>
                <div><label className={lab} htmlFor="c-phone">Mobile</label><input id="c-phone" type="tel" className={field} autoComplete="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} /></div>
                <div><label className={lab} htmlFor="c-company">Company <span className="font-normal text-[#8C847D]">(optional)</span></label><input id="c-company" className={field} autoComplete="organization" value={contact.company} onChange={(e) => setContact({ ...contact, company: e.target.value })} /></div>
                <div className="sm:col-span-2"><label className={lab} htmlFor="c-notes">Dietary needs or notes</label><textarea id="c-notes" rows={3} className={`${field} h-auto py-3`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. 3 gluten free, 2 vegan, access via loading dock" /></div>
              </div>
            </section>
          </div>
          <aside className="lg:sticky lg:top-[84px]">
            <div className="rounded-[26px] bg-white p-6 ring-1 ring-[#EDE3DB] sm:p-7">
              <div className="flex items-center justify-between"><p className="flex items-center gap-2 text-[1.25rem] font-bold"><ShoppingBag className="h-5 w-5 text-[var(--pk)]" />Your order</p><button type="button" onClick={() => setStep("menu")} className="text-[0.875rem] font-semibold text-[var(--pk)]">Edit</button></div>
              <div className="mt-4">{summaryLines(false)}</div>
              <div className="mt-4">{totalBlock}</div>
              {err && <p className="mt-4 rounded-xl bg-[#FFF1F1] px-4 py-3 text-[0.875rem] text-[#B42318]" role="alert">{err}</p>}
              <button type="button" onClick={submit} disabled={pending} data-track="Catering: request order" className="shop-btn mt-5 inline-flex h-[56px] w-full items-center justify-center gap-2.5 rounded-full bg-[var(--pk)] text-[1.0625rem] font-semibold text-white disabled:opacity-50">
                {pending ? "Sending…" : <>Request my order<ArrowRight className="h-5 w-5" /></>}
              </button>
              <p className="mt-3 text-center text-[0.8125rem] text-[#8C847D]">Nothing to pay now — we confirm and email your invoice.</p>
            </div>
          </aside>
        </div>
      </div>
    );
  }

  /* ---------------- step 1: menu ---------------- */
  return (
    <div ref={top} className="scroll-mt-28 pb-24 lg:pb-0">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <div>
          <div className="grid gap-3 sm:grid-cols-3" role="tablist" aria-label="Delivery time">
            {SLOTS.map((s) => {
              const I = ICON[s.id]; const on = slot === s.id; const n = Object.keys(lines[s.id]).length;
              return (
                <button key={s.id} type="button" role="tab" aria-selected={on} onClick={() => setSlot(s.id)}
                  className={`flex items-center gap-3 rounded-[20px] border-2 p-4 text-left transition ${on ? "border-[var(--pk)] bg-white shadow-[0_18px_36px_-26px_var(--pk)]" : "border-[#EDE3DB] bg-white/60 hover:border-[#D9CCC3]"}`}>
                  <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${on ? "bg-[var(--pk)] text-white" : "bg-[#F4ECE6] text-[#3A3431]"}`}><I className="h-5 w-5" /></span>
                  <span className="min-w-0"><span className="block font-bold">{SHORT[s.id]}</span><span className="text-[0.8125rem] text-[#5E5853]">{fmtT(times[s.id])}{n ? ` · ${n} item${n > 1 ? "s" : ""}` : ""}</span></span>
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
            <span className="flex items-center gap-2 text-[0.9375rem] font-semibold"><Clock className="h-[18px] w-[18px] text-[var(--pk)]" />Time</span>
            <select aria-label="Time" className="h-[46px] rounded-[12px] border border-[#E6DCD4] bg-white px-3 font-semibold" value={times[slot]} onChange={(e) => setTimes({ ...times, [slot]: e.target.value })}>{TIMES.map((t) => <option key={t} value={t}>{fmtT(t)}</option>)}</select>
            <span className="text-[0.8125rem] text-[#8C847D]">Minimum {min} of each item · prices + GST</span>
          </div>

          <div className="mt-6 flex items-center gap-2">
            <label className="relative flex-1">
              <span className="sr-only">Search the menu</span>
              <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#8C847D]" />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the menu — e.g. gluten free, wraps, fruit" className={`${field} pl-11 pr-10`} />
              {query && <button type="button" aria-label="Clear search" onClick={() => setQuery("")} className="absolute right-3 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-[#8C847D] hover:bg-[#F4ECE6]"><X className="h-4 w-4" /></button>}
            </label>
            <div className="relative" ref={filterBox}>
              <button type="button" aria-label="How to show the menu" aria-expanded={filterOpen} onClick={() => setFilterOpen((o) => !o)} className={`grid h-[52px] w-[52px] place-items-center rounded-[14px] border bg-white transition ${filterOpen ? "border-[var(--pk)] text-[var(--pk)]" : "border-[#E6DCD4] hover:border-[#CFC3BA]"}`}><SlidersHorizontal className="h-5 w-5" /></button>
              {filterOpen && (
                <div className="absolute right-0 top-[60px] z-30 w-[270px] rounded-[18px] bg-white p-4 shadow-[0_30px_60px_-24px_rgba(40,20,20,.35)] ring-1 ring-[#EDE3DB]" role="dialog" aria-label="Menu view">
                  <p className="text-[0.75rem] font-bold uppercase tracking-wide text-[#8C847D]">Show items as</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {([["tiles", "Tiles", LayoutGrid], ["rows", "Compact list", List]] as const).map(([k, l, I]) => (
                      <button key={k} type="button" aria-pressed={view === k} onClick={() => choose({ view: k })} className={`flex flex-col items-center gap-1.5 rounded-xl border-2 py-3 text-[0.8125rem] font-semibold ${view === k ? "border-[var(--pk)] bg-[color-mix(in_srgb,var(--pk)_6%,white)]" : "border-[#EDE3DB]"}`}><I className="h-5 w-5" />{l}</button>
                    ))}
                  </div>
                  <p className="mt-4 text-[0.75rem] font-bold uppercase tracking-wide text-[#8C847D]">Menus</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {([["list", "One after another"], ["tabs", "Tabs"]] as const).map(([k, l]) => (
                      <button key={k} type="button" aria-pressed={layout === k} onClick={() => choose({ layout: k })} className={`rounded-xl border-2 px-2 py-2.5 text-[0.8125rem] font-semibold ${layout === k ? "border-[var(--pk)] bg-[color-mix(in_srgb,var(--pk)_6%,white)]" : "border-[#EDE3DB]"}`}>{l}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {q ? (
            <div className="mt-6 space-y-8">
              <p className="text-[0.9375rem] text-[#5E5853]">{found.length ? `${found.length} match${found.length > 1 ? "es" : ""} for “${query.trim()}” — anything you add goes in your ${SHORT[slot].toLowerCase()} order` : `Nothing matches “${query.trim()}”. Try another word, or send us a message below.`}</p>
              {[...new Set(found.map((m) => m.group))].map((g) => (
                <div key={g}>
                  <p className={`shop-serif font-semibold ${view === "rows" ? "text-[1.5rem]" : "text-[1.875rem]"}`}>{g}</p>
                  <div className={view === "rows" ? "mt-3" : "mt-4"}>{items(found.filter((m) => m.group === g))}</div>
                </div>
              ))}
            </div>
          ) : (
            <>
              {layout === "tabs" && shown.length > 1 && (
                <div className="no-scrollbar mt-6 flex gap-2 overflow-x-auto" role="tablist" aria-label="Menus">
                  {shown.map((g) => <button key={g} type="button" role="tab" aria-selected={activeTab === g} onClick={() => setTab(g)} className={`h-11 shrink-0 rounded-full px-5 text-[0.9375rem] font-semibold transition ${activeTab === g ? "bg-[#151312] text-white" : "bg-white text-[#3A3431] ring-1 ring-[#EDE3DB] hover:bg-[#F4ECE6]"}`}>{g}</button>)}
                </div>
              )}
              <div className={`${layout === "tabs" ? "mt-5" : "mt-8"} ${view === "rows" ? "space-y-8" : "space-y-10"}`}>
                {layout === "tabs" ? (activeTab ? group(activeTab, shown.length <= 1) : null) : shown.map((g) => group(g))}
                {!menu.length && <p className="rounded-[20px] bg-white p-8 text-center text-[#5E5853] ring-1 ring-[#EDE3DB]">Our catering menu is being updated — send us a message below and we&apos;ll help.</p>}
              </div>
            </>
          )}

          {!q && others.filter((g) => !extra[slot].includes(g)).length > 0 && (
            <div className="mt-10 rounded-[22px] border-2 border-dashed border-[#E3D7CE] p-5">
              <button type="button" onClick={() => setShowOther((v) => !v)} aria-expanded={showOther} className="flex w-full items-center justify-between gap-3 text-left">
                <span><span className="block text-[1.0625rem] font-bold">Looking for something else?</span><span className="text-[0.875rem] text-[#5E5853]">Add from our other menus to your {SHORT[slot].toLowerCase()} order.</span></span>
                <ChevronDown className={`h-5 w-5 shrink-0 transition ${showOther ? "rotate-180" : ""}`} />
              </button>
              {showOther && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {others.filter((g) => !extra[slot].includes(g)).map((g) => (
                    <button key={g} type="button" onClick={() => { setExtra((x) => ({ ...x, [slot]: [...x[slot], g] })); setTab(g); }} className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-[0.9375rem] font-semibold ring-1 ring-[#EDE3DB] hover:ring-[var(--pk)]"><Plus className="h-4 w-4 text-[var(--pk)]" />{g}</button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Order — scrolls on its own so it's always reachable */}
        <aside className="hidden lg:sticky lg:top-[84px] lg:block">
          <div className="flex max-h-[calc(100vh-108px)] flex-col rounded-[26px] bg-white ring-1 ring-[#EDE3DB]">
            <p className="flex items-center gap-2 px-6 pt-6 text-[1.25rem] font-bold"><ShoppingBag className="h-5 w-5 text-[var(--pk)]" />Your order</p>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
              {count === 0 ? <p className="text-[0.9375rem] text-[#5E5853]">Pick a time, set how many people, then add from the menu.</p> : summaryLines(true)}
            </div>
            <div className="border-t border-[#EDE3DB] px-6 pb-6 pt-4">
              <p className="flex justify-between text-[0.9375rem] text-[#5E5853]"><span>Food &amp; drinks</span><span className="tabular-nums">{aud(totals.items)} + GST</span></p>
              <p className="mt-1 text-[0.8125rem] text-[#8C847D]">{cs.deliveryFee !== null ? `Delivery ${aud(cs.deliveryFee)} + GST${cs.pickup ? " or free pickup" : ""} — choose next` : "Free pickup"}</p>
              {err && <p className="mt-3 rounded-xl bg-[#FFF1F1] px-4 py-3 text-[0.875rem] text-[#B42318]" role="alert">{err}</p>}
              <button type="button" onClick={goDetails} disabled={!count} data-track="Catering: continue to details" className="shop-btn mt-4 inline-flex h-[56px] w-full items-center justify-center gap-2.5 rounded-full bg-[var(--pk)] text-[1.0625rem] font-semibold text-white disabled:opacity-50">Continue<ArrowRight className="h-5 w-5" /></button>
            </div>
          </div>
        </aside>
      </div>

      {/* Phones and tablets: order bar fixed to the bottom */}
      {count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#EDE3DB] bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
          {err && <p className="mb-2 text-[0.8125rem] font-medium text-[#B42318]" role="alert">{err}</p>}
          <div className="mx-auto flex max-w-[720px] items-center gap-3">
            <div className="min-w-0 flex-1"><p className="text-[0.8125rem] text-[#5E5853]">{count} item{count > 1 ? "s" : ""}</p><p className="font-bold tabular-nums">{aud(totals.items)} <span className="text-[0.75rem] font-semibold text-[#8C847D]">+ GST</span></p></div>
            <button type="button" onClick={goDetails} className="shop-btn inline-flex h-[50px] items-center gap-2 rounded-full bg-[var(--pk)] px-6 font-semibold text-white">Review order<ArrowRight className="h-4 w-4" /></button>
          </div>
        </div>
      )}
    </div>
  );
}
