"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AlertTriangle, ArrowRight, CalendarDays, Check, CircleCheck, Loader2, Mail, Minus, Phone, Plus, Search, ShoppingBag, Sparkles, Store, Trash2, Truck, X } from "lucide-react";
import type { ShopItem } from "@/lib/hire/shop";
import { shopAvailabilityAction, shopQuoteAction, shopSubmitAction, type BasketPrice } from "@/app/hire/[org]/shop/actions";

type Win = { startDate: string; startTime: string; endDate: string; endTime: string };
type Avail = Record<string, { free: number; freeFrom: number | null }>;
type Settings = { depositPct: number; zone: { label: string; fee: number; states: string[] } | null; instant: boolean; intro: string | null; defaultStart: string; defaultEnd: string };
const STATES = ["ACT", "NSW", "VIC", "QLD", "SA", "WA", "TAS", "NT"];

const addDays = (d: string, n: number) => { const t = new Date(d + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const dow = (d: string) => new Date(d + "T00:00:00Z").getUTCDay();

/**
 * The online hire shop. Dates first, so every item shows what's actually free (and when it frees up if not);
 * a basket priced by the server as you go, with delivery charged automatically inside the delivery area;
 * then an instant booking with a card deposit, or a request the business confirms.
 */
export function HireShop({ slug, tz, today, currency, org, items, brands, settings, initialWindow, initialAvail }: {
  slug: string; tz: string; today: string; currency: string;
  org: { name: string; logo: string | null; colour: string | null; phone: string | null; email: string | null; address: string | null };
  items: ShopItem[]; brands: { key: string; name: string }[]; settings: Settings; initialWindow: Win; initialAvail: Avail;
}) {
  const money = (n: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency, minimumFractionDigits: n % 1 ? 2 : 0 }).format(n);
  const when = (ms: number) => new Intl.DateTimeFormat("en-AU", { timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(ms));
  const [win, setWin] = useState<Win>(initialWindow);
  const [avail, setAvail] = useState<Avail>(initialAvail);
  const [checking, setChecking] = useState(false);
  const [winErr, setWinErr] = useState<string | null>(null);
  const [brand, setBrand] = useState<string>(brands[0]?.key ?? "");
  const [cat, setCat] = useState<string>("");
  const [q, setQ] = useState("");
  const [basket, setBasket] = useState<{ id: string; qty: number }[]>([]);
  const [fulfilment, setFulfilment] = useState<"collect" | "deliver">("deliver");
  const [addr, setAddr] = useState({ street: "", suburb: "", state: settings.zone?.states[0] ?? "ACT", postcode: "" });
  const [price, setPrice] = useState<BasketPrice | null>(null);
  const [step, setStep] = useState<"shop" | "details" | "done">("shop");
  const [open, setOpen] = useState(false);
  const [me, setMe] = useState({ name: "", email: "", phone: "", company: "", notes: "", website: "" });
  const [result, setResult] = useState<{ kind: "paid" | "request"; number: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const loadedAt = useRef(Date.now());
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  // availability for the dates
  const wkey = `${win.startDate}${win.startTime}${win.endDate}${win.endTime}`;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    let live = true; setChecking(true); setWinErr(null);
    const t = setTimeout(async () => {
      const r = await shopAvailabilityAction(slug, win).catch(() => null);
      if (!live) return;
      setChecking(false);
      if (r?.ok) setAvail(r.data); else setWinErr(r?.error ?? "Couldn't check those dates.");
    }, 250);
    return () => { live = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wkey]);

  // the basket, priced by the server
  const pkey = JSON.stringify([wkey, basket, fulfilment, addr.state]);
  useEffect(() => {
    if (!basket.length) { setPrice(null); return; }
    let live = true;
    const t = setTimeout(async () => {
      const r = await shopQuoteAction(slug, { ...win, lines: basket, fulfilment, address: fulfilment === "deliver" ? addr : null }).catch(() => null);
      if (live && r?.ok) setPrice(r.data);
    }, 300);
    return () => { live = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pkey]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return items.filter((i) => (!brands.length || !brand || i.brand === brand) && (!cat || (i.category ?? "Other") === cat)
      && s.every((w) => `${i.name} ${i.category ?? ""} ${i.description ?? ""}`.toLowerCase().includes(w)));
  }, [items, brand, cat, q, brands.length]);
  const cats = useMemo(() => [...new Set(items.filter((i) => !brands.length || !brand || i.brand === brand).map((i) => i.category ?? "Other"))].sort(), [items, brand, brands.length]);
  const grouped = useMemo(() => {
    const m = new Map<string, ShopItem[]>();
    for (const i of shown) { const k = i.category ?? "Other"; m.set(k, [...(m.get(k) ?? []), i]); }
    return [...m].sort((a, b) => a[0].localeCompare(b[0]));
  }, [shown]);

  const qtyOf = (id: string) => basket.find((b) => b.id === id)?.qty ?? 0;
  const freeOf = (id: string) => avail[id]?.free ?? byId.get(id)?.max ?? 0;
  const setQty = (id: string, qty: number) => setBasket((bs) => {
    const max = Math.max(0, freeOf(id));
    const n = Math.max(0, Math.min(qty, byId.get(id)?.kind === "sale" ? 999 : max));
    if (!n) return bs.filter((b) => b.id !== id);
    return bs.some((b) => b.id === id) ? bs.map((b) => (b.id === id ? { ...b, qty: n } : b)) : [...bs, { id, qty: n }];
  });
  const add = (id: string) => setQty(id, qtyOf(id) + 1);
  const suggestions = useMemo(() => {
    const out: { id: string; qty: number; for: string }[] = [];
    for (const b of basket) for (const c of byId.get(b.id)?.companions ?? []) if (!basket.some((x) => x.id === c.id) && !out.some((x) => x.id === c.id) && byId.has(c.id)) out.push({ id: c.id, qty: c.qty * b.qty, for: byId.get(b.id)!.name });
    return out;
  }, [basket, byId]);
  const count = basket.reduce((a, b) => a + b.qty, 0);
  const estimate = basket.reduce((a, b) => a + (byId.get(b.id)?.price ?? 0) * b.qty, 0);
  const total = price?.total ?? estimate;
  const short = price?.shortages ?? [];
  const instant = settings.instant && !short.length && !(price?.deliveryQuoted) && (price?.deposit ?? 0) > 0;

  const quick = (k: "tomorrow" | "sat" | "weekend" | "nextweekend") => {
    const sat = addDays(today, ((6 - dow(today)) + 7) % 7 || 7);
    const fri = addDays(sat, -1);
    if (k === "tomorrow") { const d = addDays(today, 1); setWin({ startDate: d, startTime: settings.defaultStart, endDate: d, endTime: settings.defaultEnd }); }
    if (k === "sat") setWin({ startDate: sat, startTime: settings.defaultStart, endDate: sat, endTime: settings.defaultEnd });
    if (k === "weekend") setWin({ startDate: fri, startTime: "15:00", endDate: addDays(sat, 2), endTime: "10:00" });
    if (k === "nextweekend") setWin({ startDate: addDays(fri, 7), startTime: "15:00", endDate: addDays(sat, 9), endTime: "10:00" });
  };

  const submit = () => start(async () => {
    setErr(null);
    const r = await shopSubmitAction(slug, { ...win, lines: basket, fulfilment, address: fulfilment === "deliver" ? addr : null, ...me, company: me.company || null, notes: me.notes || null, t: loadedAt.current });
    if (!r.ok) { setErr(r.error); return; }
    if (r.payUrl) { window.location.href = r.payUrl; return; }
    setResult({ kind: r.kind, number: r.number }); setStep("done"); setOpen(false); window.scrollTo({ top: 0, behavior: "smooth" });
  });

  const colour = org.colour && /^#[0-9a-f]{6}$/i.test(org.colour) ? org.colour : "#1f2937";
  const input = "h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 text-[0.9375rem] text-zinc-900 outline-none focus:border-[var(--bc)] focus:ring-2 focus:ring-[var(--bc)]/20";

  if (step === "done" && result) {
    return (
      <Frame org={org} colour={colour}>
        <div className="mx-auto max-w-xl px-4 py-20 text-center">
          <CircleCheck className="mx-auto h-14 w-14 text-emerald-600" />
          <h1 className="mt-5 text-[2rem] font-bold tracking-tight text-zinc-900">Thanks{me.name ? `, ${me.name.split(" ")[0]}` : ""}!</h1>
          <p className="mt-3 text-[1.0625rem] text-zinc-600">Your booking request <strong className="text-zinc-900">{result.number}</strong> is with {org.name}. They&apos;ll check everything and confirm with you shortly.</p>
          <p className="mt-6 text-[0.9375rem] text-zinc-500">Questions? {org.phone && <a href={`tel:${org.phone.replace(/\s/g, "")}`} className="font-semibold text-[var(--bc)]">{org.phone}</a>}{org.phone && org.email ? " · " : ""}{org.email && <a href={`mailto:${org.email}`} className="font-semibold text-[var(--bc)]">{org.email}</a>}</p>
        </div>
      </Frame>
    );
  }

  const Basket = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
        <p className="flex items-center gap-2 text-[1rem] font-bold text-zinc-900"><ShoppingBag className="h-5 w-5" />Your hire</p>
        <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-zinc-100 lg:hidden"><X className="h-5 w-5" /></button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <p className="mb-3 flex items-center gap-2 rounded-xl bg-zinc-50 px-3 py-2 text-[0.8125rem] text-zinc-600"><CalendarDays className="h-4 w-4 shrink-0" />{fmtWin(win, tz)}</p>
        {!basket.length ? <p className="py-8 text-center text-[0.9375rem] text-zinc-500">Nothing added yet. Tap <strong>Add</strong> on anything you&apos;d like to hire.</p> : (
          <ul className="space-y-3">
            {basket.map((b) => {
              const it = byId.get(b.id)!; const pl = price?.lines.find((l) => l.id === b.id);
              const sh = short.find((x) => x.itemId === b.id);
              return (
                <li key={b.id} className="rounded-xl border border-zinc-200 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[0.875rem] font-semibold leading-snug text-zinc-900">{it.name}</p>
                    <button type="button" aria-label={`Remove ${it.name}`} onClick={() => setQty(b.id, 0)} className="text-zinc-400 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <Stepper qty={b.qty} max={it.kind === "sale" ? 999 : freeOf(b.id)} onChange={(n) => setQty(b.id, n)} />
                    <p className="text-[0.875rem] font-semibold tabular-nums text-zinc-900">{money(pl?.total ?? it.price * b.qty)}</p>
                  </div>
                  {sh && <p className="mt-2 flex items-start gap-1.5 text-[0.75rem] text-amber-800"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />Only {Math.max(0, b.qty - sh.short)} free for these dates{sh.freeFrom ? `, more from ${when(sh.freeFrom)}` : ""}. We&apos;ll check what we can do.</p>}
                </li>
              );
            })}
          </ul>
        )}
        {suggestions.length > 0 && (
          <div className="mt-4 rounded-xl bg-[var(--bc)]/5 p-3">
            <p className="flex items-center gap-1.5 text-[0.75rem] font-semibold text-[var(--bc)]"><Sparkles className="h-3.5 w-3.5" />Goes well with</p>
            {suggestions.map((s) => <button key={s.id} type="button" onClick={() => setQty(s.id, s.qty)} className="mt-2 flex w-full items-center justify-between rounded-lg bg-white px-3 py-2 text-left text-[0.8125rem] ring-1 ring-zinc-200 hover:ring-[var(--bc)]"><span>+ {s.qty} × {byId.get(s.id)!.name}</span><span className="text-zinc-500">{money(byId.get(s.id)!.price * s.qty)}</span></button>)}
          </div>
        )}
        {basket.length > 0 && (
          <div className="mt-5">
            <div className="grid grid-cols-2 gap-2">
              {(["deliver", "collect"] as const).map((m) => (
                <button key={m} type="button" aria-pressed={fulfilment === m} onClick={() => setFulfilment(m)} className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-[0.8125rem] font-semibold ring-1 ${fulfilment === m ? "bg-[var(--bc)] text-white ring-[var(--bc)]" : "bg-white text-zinc-700 ring-zinc-300"}`}>
                  {m === "deliver" ? <Truck className="h-4 w-4" /> : <Store className="h-4 w-4" />}{m === "deliver" ? "Deliver it" : "I'll pick up"}
                </button>
              ))}
            </div>
            {fulfilment === "deliver" ? (
              <div className="mt-3 grid grid-cols-6 gap-2">
                <input aria-label="Street address" placeholder="Street address" value={addr.street} onChange={(e) => setAddr({ ...addr, street: e.target.value })} className={`${input} col-span-6`} />
                <input aria-label="Suburb" placeholder="Suburb" value={addr.suburb} onChange={(e) => setAddr({ ...addr, suburb: e.target.value })} className={`${input} col-span-3`} />
                <select aria-label="State" value={addr.state} onChange={(e) => setAddr({ ...addr, state: e.target.value })} className={`${input} col-span-1 px-1`}>{STATES.map((s) => <option key={s}>{s}</option>)}</select>
                <input aria-label="Postcode" placeholder="Postcode" inputMode="numeric" value={addr.postcode} onChange={(e) => setAddr({ ...addr, postcode: e.target.value.replace(/\D/g, "").slice(0, 4) })} className={`${input} col-span-2`} />
              </div>
            ) : org.address && <p className="mt-3 text-[0.8125rem] text-zinc-600">Pick up from <span className="whitespace-pre-line font-medium text-zinc-900">{org.address.replace(/\n/g, ", ")}</span></p>}
          </div>
        )}
      </div>
      {basket.length > 0 && (
        <div className="border-t border-zinc-200 px-5 py-4">
          <dl className="space-y-1 text-[0.875rem]">
            {fulfilment === "deliver" && <div className="flex justify-between text-zinc-600"><dt>Delivery &amp; collection</dt><dd className="tabular-nums">{price ? (price.deliveryQuoted ? "Quoted" : money(price.deliveryFee)) : "…"}</dd></div>}
            <div className="flex justify-between text-[1.0625rem] font-bold text-zinc-900"><dt>Total</dt><dd className="tabular-nums">{money(total)}{price?.deliveryQuoted && fulfilment === "deliver" ? " + delivery" : ""}</dd></div>
            <div className="flex justify-between text-[0.75rem] text-zinc-500"><dt>Includes GST</dt><dd className="tabular-nums">{money(price?.gst ?? total / 11)}</dd></div>
            {(price?.bond ?? 0) > 0 && <div className="flex justify-between text-zinc-600"><dt>Refundable bond</dt><dd className="tabular-nums">{money(price!.bond)}</dd></div>}
            {settings.depositPct > 0 && <div className="flex justify-between text-zinc-600"><dt>Deposit to book ({settings.depositPct}%)</dt><dd className="tabular-nums">{money(price?.deposit ?? (total * settings.depositPct) / 100)}</dd></div>}
          </dl>
          {fulfilment === "deliver" && price?.deliveryQuoted && <p className="mt-2 text-[0.75rem] text-zinc-500">Outside {settings.zone?.label ?? "our area"}? We&apos;ll quote delivery when we confirm.</p>}
          {step === "shop"
            ? <button type="button" onClick={() => { setStep("details"); setOpen(true); }} className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--bc)] text-[1rem] font-bold text-white hover:brightness-110">Continue <ArrowRight className="h-4 w-4" /></button>
            : (
              <div className="mt-4 space-y-2">
                <input aria-label="Your name" placeholder="Your name" value={me.name} onChange={(e) => setMe({ ...me, name: e.target.value })} className={input} />
                <input aria-label="Email" type="email" placeholder="Email" value={me.email} onChange={(e) => setMe({ ...me, email: e.target.value })} className={input} />
                <input aria-label="Phone" type="tel" placeholder="Mobile" value={me.phone} onChange={(e) => setMe({ ...me, phone: e.target.value })} className={input} />
                <input aria-label="Company" placeholder="Company or organisation (optional)" value={me.company} onChange={(e) => setMe({ ...me, company: e.target.value })} className={input} />
                <textarea aria-label="Notes" rows={2} placeholder="Anything we should know? Access, setup, the event…" value={me.notes} onChange={(e) => setMe({ ...me, notes: e.target.value })} className={`${input} h-auto py-2`} />
                <input tabIndex={-1} aria-hidden="true" autoComplete="off" value={me.website} onChange={(e) => setMe({ ...me, website: e.target.value })} className="hidden" />
                {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-[0.8125rem] text-rose-700" role="alert">{err}</p>}
                <button type="button" disabled={pending || !me.name || !me.email || !me.phone || (fulfilment === "deliver" && (!addr.street || !addr.suburb))} onClick={submit}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--bc)] text-[1rem] font-bold text-white hover:brightness-110 disabled:opacity-50">
                  {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}{instant ? `Book & pay ${money(price!.deposit)} deposit` : "Send booking request"}
                </button>
                <p className="text-center text-[0.75rem] text-zinc-500">{instant ? "Your booking is held while you pay. The balance is due before your hire." : "No payment now. We'll confirm availability and send your invoice."}</p>
                <button type="button" onClick={() => setStep("shop")} className="w-full text-center text-[0.8125rem] font-medium text-zinc-500 hover:text-zinc-900">Back to items</button>
              </div>
            )}
        </div>
      )}
    </div>
  );

  return (
    <Frame org={org} colour={colour}>
      <section className="bg-[var(--bc)] text-white">
        <div className="mx-auto max-w-[1240px] px-4 pb-8 pt-10 sm:px-6 sm:pt-14">
          <h1 className="text-[2rem] font-extrabold leading-tight tracking-tight sm:text-[2.75rem]">Hire for your event</h1>
          <p className="mt-2 max-w-2xl text-[1.0625rem] text-white/80">{settings.intro ?? "Pick your dates to see what's free and what it costs, then book in a couple of minutes."}</p>
          <div className="mt-6 rounded-2xl bg-white p-3 text-zinc-900 shadow-xl sm:p-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <DateField label="Start" date={win.startDate} time={win.startTime} min={today} onChange={(d, t) => setWin((w) => ({ ...w, startDate: d, startTime: t, endDate: w.endDate < d ? d : w.endDate }))} />
              <DateField label="Finish" date={win.endDate} time={win.endTime} min={win.startDate} onChange={(d, t) => setWin((w) => ({ ...w, endDate: d, endTime: t }))} />
              <p className="flex h-11 items-center gap-2 text-[0.8125rem] font-medium text-zinc-500">{checking ? <><Loader2 className="h-4 w-4 animate-spin" />Checking…</> : <><Check className="h-4 w-4 text-emerald-600" />Showing what&apos;s free</>}</p>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {([["tomorrow", "Tomorrow"], ["sat", "This Saturday"], ["weekend", "This weekend"], ["nextweekend", "Next weekend"]] as const).map(([k, l]) => <button key={k} type="button" onClick={() => quick(k)} className="rounded-full bg-zinc-100 px-3 py-1.5 text-[0.8125rem] font-medium text-zinc-700 hover:bg-zinc-200">{l}</button>)}
            </div>
            {winErr && <p className="mt-2 text-[0.8125rem] text-rose-600">{winErr}</p>}
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-[1240px] gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          {brands.length > 1 && (
            <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Brands">
              {brands.map((b) => <button key={b.key} role="tab" aria-selected={brand === b.key} type="button" onClick={() => { setBrand(b.key); setCat(""); }} className={`rounded-xl px-4 py-2 text-[0.9375rem] font-bold ${brand === b.key ? "bg-zinc-900 text-white" : "bg-white text-zinc-700 ring-1 ring-zinc-200 hover:ring-zinc-400"}`}>{b.name}</button>)}
            </div>
          )}
          <div className="sticky top-0 z-20 -mx-4 bg-[#f7f7f8]/95 px-4 py-3 backdrop-blur sm:mx-0 sm:px-0">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: chairs, marquee, popcorn…" aria-label="Search" className={`${input} pl-9`} />
            </div>
            <div className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto">
              {["", ...cats].map((c) => <button key={c || "all"} type="button" onClick={() => setCat(c)} className={`shrink-0 rounded-full px-3 py-1.5 text-[0.8125rem] font-medium ${cat === c ? "bg-[var(--bc)] text-white" : "bg-white text-zinc-600 ring-1 ring-zinc-200"}`}>{c || "Everything"}</button>)}
            </div>
          </div>
          {!grouped.length && <p className="py-16 text-center text-zinc-500">Nothing matches. Try another search.</p>}
          {grouped.map(([c, list]) => (
            <section key={c} className="mt-6">
              <h2 className="mb-3 text-[1.25rem] font-bold text-zinc-900">{c}</h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {list.map((it) => {
                  const a = avail[it.id]; const free = a?.free ?? it.max; const n = qtyOf(it.id);
                  const out = it.kind !== "sale" && free <= 0;
                  return (
                    <article key={it.id} className={`flex flex-col rounded-2xl bg-white p-4 ring-1 ring-zinc-200 transition ${out ? "opacity-70" : "hover:shadow-md"}`}>
                      {it.image ? <img src={it.image} alt="" className="mb-3 aspect-[4/3] w-full rounded-xl object-cover" /> : (
                        <div className="mb-3 grid aspect-[5/2] place-items-center rounded-xl bg-[var(--bc)]/[0.06] text-[1.5rem] font-black tracking-tight text-[var(--bc)]/40">{initials(it.name)}</div>
                      )}
                      <p className="text-[0.9375rem] font-semibold leading-snug text-zinc-900">{it.name}</p>
                      {it.description && <p className="mt-1 line-clamp-2 whitespace-pre-line text-[0.8125rem] text-zinc-500">{it.description}</p>}
                      <div className="mt-auto pt-3">
                        <p className="text-[0.75rem] font-medium">
                          {it.kind === "sale" ? <span className="text-zinc-500">Add-on to buy</span>
                            : out ? <span className="text-zinc-500">Booked out for these dates{a?.freeFrom ? ` · free from ${when(a.freeFrom)}` : ""}</span>
                              : free <= 3 ? <span className="text-amber-700">Only {free} left for these dates</span>
                                : <span className="text-emerald-700">{free} available</span>}
                        </p>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <p className="text-[1.0625rem] font-bold text-zinc-900">{money(it.price)}<span className="ml-1 text-[0.75rem] font-medium text-zinc-500">{it.priceNote}</span></p>
                          {n ? <Stepper qty={n} max={it.kind === "sale" ? 999 : free} onChange={(v) => setQty(it.id, v)} />
                            : <button type="button" disabled={out} onClick={() => add(it.id)} className="flex h-9 items-center gap-1.5 rounded-full bg-[var(--bc)] px-4 text-[0.875rem] font-semibold text-white hover:brightness-110 disabled:bg-zinc-300"><Plus className="h-4 w-4" />Add</button>}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
        <aside className="hidden lg:block">
          <div className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-hidden rounded-2xl bg-white ring-1 ring-zinc-200">{Basket}</div>
        </aside>
      </div>

      {/* phones: a bar at the bottom, and the basket as a sheet */}
      {count > 0 && !open && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200 bg-white p-3 lg:hidden" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}>
          <button type="button" onClick={() => setOpen(true)} className="flex h-12 w-full items-center justify-between rounded-xl bg-[var(--bc)] px-4 text-white">
            <span className="flex items-center gap-2 font-semibold"><ShoppingBag className="h-5 w-5" />{count} item{count === 1 ? "" : "s"}</span>
            <span className="font-bold">{money(total)} <ArrowRight className="ml-1 inline h-4 w-4" /></span>
          </button>
        </div>
      )}
      {open && <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setOpen(false)}><div className="absolute inset-x-0 bottom-0 top-12 overflow-hidden rounded-t-2xl bg-white" onClick={(e) => e.stopPropagation()}>{Basket}</div></div>}
      {count > 0 && <div className="h-20 lg:hidden" />}
    </Frame>
  );
}

function Frame({ org, colour, children }: { org: { name: string; logo: string | null; phone: string | null; email: string | null; address: string | null }; colour: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f7f7f8] font-sans text-zinc-900" style={{ ["--bc" as string]: colour }}>
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-[1240px] items-center gap-4 px-4 py-3 sm:px-6">
          {org.logo ? <img src={org.logo} alt={org.name} className="h-12 w-auto max-w-[160px] object-contain" /> : <span className="text-[1.125rem] font-bold">{org.name}</span>}
          <div className="ml-auto flex items-center gap-2">
            {org.email && <a href={`mailto:${org.email}`} className="hidden h-10 items-center gap-2 rounded-full px-3 text-[0.875rem] font-medium text-zinc-600 hover:bg-zinc-100 sm:flex"><Mail className="h-4 w-4" />{org.email}</a>}
            {org.phone && <a href={`tel:${org.phone.replace(/\s/g, "")}`} className="flex h-10 items-center gap-2 rounded-full bg-zinc-900 px-4 text-[0.875rem] font-semibold text-white"><Phone className="h-4 w-4" />{org.phone}</a>}
          </div>
        </div>
      </header>
      {children}
      <footer className="border-t border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-3 px-4 py-6 text-[0.8125rem] text-zinc-500 sm:px-6">
          <p>{org.name}{org.address ? ` · ${org.address.replace(/\n/g, ", ")}` : ""}</p>
          <p>Bookings by EventureOS</p>
        </div>
      </footer>
    </div>
  );
}

function DateField({ label, date, time, min, onChange }: { label: string; date: string; time: string; min: string; onChange: (d: string, t: string) => void }) {
  const cls = "h-11 rounded-xl border border-zinc-300 bg-white px-3 text-[0.9375rem] outline-none focus:border-[var(--bc)]";
  return (
    <label className="block">
      <span className="mb-1 block text-[0.75rem] font-semibold uppercase tracking-wide text-zinc-500">{label}</span>
      <span className="flex gap-2">
        <input type="date" value={date} min={min} onChange={(e) => e.target.value && onChange(e.target.value, time)} className={`${cls} min-w-0 flex-1`} />
        <input type="time" value={time} onChange={(e) => e.target.value && onChange(date, e.target.value)} className={`${cls} w-[7.5rem]`} aria-label={`${label} time`} />
      </span>
    </label>
  );
}

function Stepper({ qty, max, onChange }: { qty: number; max: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center rounded-full ring-1 ring-zinc-300">
      <button type="button" aria-label="Fewer" onClick={() => onChange(qty - 1)} className="grid h-9 w-9 place-items-center text-zinc-600 hover:text-zinc-900"><Minus className="h-4 w-4" /></button>
      <input aria-label="Quantity" inputMode="numeric" value={qty} onChange={(e) => onChange(Math.round(Number(e.target.value.replace(/\D/g, "")) || 0))} className="w-10 bg-transparent text-center text-[0.9375rem] font-semibold tabular-nums outline-none" />
      <button type="button" aria-label="More" disabled={qty >= max} onClick={() => onChange(qty + 1)} className="grid h-9 w-9 place-items-center text-zinc-600 hover:text-zinc-900 disabled:opacity-30"><Plus className="h-4 w-4" /></button>
    </div>
  );
}

function initials(name: string) {
  return name.replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter((w) => w && !/^(and|with|the|of|for|\d+)$/i.test(w)).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
}

function fmtWin(w: Win, tz: string) {
  const d = (date: string, time: string) => new Intl.DateTimeFormat("en-AU", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(new Date(`${date}T00:00:00Z`)) + ` ${fmt12(time)}`;
  void tz;
  return `${d(w.startDate, w.startTime)} → ${d(w.endDate, w.endTime)}`;
}
function fmt12(t: string) { const [h, m] = t.split(":").map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")}${h < 12 ? "am" : "pm"}`; }
