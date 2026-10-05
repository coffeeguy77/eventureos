"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, Check, Gift, Loader2, Lock, Minus, PartyPopper, Plus, Store, Tag, Trash2, Truck } from "lucide-react";
import { checkoutAction, eventInfoAction, quoteAction } from "@/app/shop/actions";
import { frequencyLabel, grindLabel, nextDispatch, prepaidDeliveries, type Address, type Delivery, type IntervalUnit, type Priced, type Product, type ShopSettings } from "@/lib/shop/core";
import { useCart } from "./cart-store";
import { GrindAdjuster } from "./buy-box";

const money = (n: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);
const fmtDay = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" });
const input = "h-12 w-full rounded-xl border border-[#E2D8CD] bg-white px-3.5 text-base text-[#171714] placeholder:text-[#9A948F] focus:border-[var(--b)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--b)_25%,transparent)]";
const lab = "mb-1.5 block text-[0.875rem] font-medium text-[#2b2925]";
const STATES = ["ACT", "NSW", "VIC", "QLD", "SA", "WA", "TAS", "NT"];

export interface Me { name: string | null; email: string; phone: string | null; addresses: (Address & { id: string; label: string })[] }

export function Checkout({ slug, products, s, today, me }: { slug: string; products: Product[]; s: ShopSettings; today: string; me: Me | null }) {
  const { cart, ready, update } = useCart(slug);
  const [event, setEvent] = useState<{ name: string; date: string | null } | null>(null);
  useEffect(() => {
    if (!cart.eventToken) { setEvent(null); return; }
    eventInfoAction(slug, cart.eventToken).then((e) => { setEvent(e); if (e) setDelivery("event"); }).catch(() => null);
  }, [cart.eventToken, slug]);
  const [priced, setPriced] = useState<Priced | null>(null);
  const [couponInput, setCouponInput] = useState("");
  const [couponMsg, setCouponMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [gift, setGift] = useState("");
  const [delivery, setDelivery] = useState<Delivery>("post");
  const [firstDate, setFirstDate] = useState("");
  const [c, setC] = useState({ name: me?.name ?? "", email: me?.email ?? "", phone: me?.phone ?? "", marketing: false, note: "" });
  const addr0 = me?.addresses[0];
  const [a, setA] = useState<Address>({ name: addr0?.name ?? "", company: addr0?.company ?? "", line1: addr0?.line1 ?? "", line2: addr0?.line2 ?? "", suburb: addr0?.suburb ?? "", state: addr0?.state ?? "", postcode: addr0?.postcode ?? "", instructions: addr0?.instructions ?? "" });
  const [err, setErr] = useState<string | null>(null);
  const [paying, startPay] = useTransition();
  const [quoting, startQuote] = useTransition();

  const byVariant = useMemo(() => new Map(products.flatMap((p) => p.variants.map((v) => [v.id, { p, v }] as const))), [products]);
  const items = cart.items.filter((i) => byVariant.has(i.variantId));
  const canSub = items.length > 0 && items.every((i) => { const p = byVariant.get(i.variantId)!.p; return p.kind === "coffee" && p.subscribable; });
  const mode = canSub ? cart.mode : "one_off";
  const eventMode = !!(event && cart.eventToken);
  const effDelivery: Delivery = eventMode && delivery === "event" && mode === "one_off" ? "event" : delivery === "event" ? "post" : delivery;
  const firstShip = firstDate && firstDate > today ? nextDispatch(firstDate, s) : nextDispatch(today, s, s.leadDays);

  // Price on the server whenever something that matters changes
  const key = JSON.stringify([items, mode, effDelivery, cart.coupon, cart.prepaidMonths, cart.interval, c.email.includes("@") ? c.email : ""]);
  useEffect(() => {
    if (!ready) return;
    if (!items.length) { setPriced(null); return; }
    const t = setTimeout(() => startQuote(async () => {
      const r = await quoteAction({ orgSlug: slug, lines: items, mode, delivery: effDelivery, couponCode: cart.coupon, email: c.email.includes("@") ? c.email : null, prepaidMonths: mode === "prepaid" ? cart.prepaidMonths ?? 3 : null, interval: cart.interval });
      if (!r.ok) return;
      setPriced(r.data.priced);
      if (cart.coupon) setCouponMsg(r.data.couponError ? { ok: false, text: r.data.couponError } : { ok: true, text: `${cart.coupon} applied${r.data.couponLabel && r.data.couponLabel !== cart.coupon ? ` — ${r.data.couponLabel}` : ""}` });
    }), 250);
    return () => clearTimeout(t);
  }, [key, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const pos = cart.items.map((it, i) => (byVariant.has(it.variantId) ? i : -1)).filter((i) => i >= 0);
  const setItem = (idx: number, patch: Partial<(typeof items)[number]>) => update((x) => ({ ...x, items: x.items.map((it, i) => (i === pos[idx] ? { ...it, ...patch } : it)) }));
  const remove = (idx: number) => update((x) => ({ ...x, items: x.items.filter((_, i) => i !== pos[idx]) }));
  const setMode = (m: "one_off" | "subscription" | "prepaid") => update((x) => ({ ...x, mode: m, prepaidMonths: m === "prepaid" ? x.prepaidMonths ?? (s.prepaid[0]?.months ?? 3) : x.prepaidMonths }));
  const setInterval = (iv: { unit: IntervalUnit; count: number }) => update((x) => ({ ...x, interval: iv }));

  const pay = (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    startPay(async () => {
      const r = await checkoutAction({
        orgSlug: slug, mode, lines: items, interval: cart.interval, prepaidMonths: mode === "prepaid" ? cart.prepaidMonths : null, firstDate: firstDate || null,
        name: c.name, email: c.email, phone: c.phone, marketing: c.marketing, delivery: effDelivery, address: effDelivery === "post" ? a : null, note: c.note,
        couponCode: cart.coupon, giftCode: gift.trim() || null, eventToken: cart.eventToken,
      }).catch(() => ({ ok: false as const, error: "Couldn't reach the shop — please try again." }));
      if (!r.ok) { setErr(r.error); return; }
      window.location.href = r.data;
    });
  };

  if (!ready) return <div className="grid min-h-[40vh] place-items-center"><Loader2 className="h-8 w-8 animate-spin text-[var(--b)]" /></div>;
  if (!items.length) return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <p className="text-[1.75rem] font-semibold">Your cart is empty</p>
      <p className="mt-2 text-[#5b5955]">Freshly roasted coffee is a click away.</p>
      <Link href={`/shop/${slug}`} className="shop-btn mt-6 inline-flex h-14 items-center gap-2 rounded-2xl bg-[var(--b)] px-7 font-semibold text-[var(--on-b)]">Shop coffee<ArrowRight className="h-5 w-5" /></Link>
    </div>
  );

  const seg = (on: boolean) => `flex-1 rounded-xl px-3 py-3 text-center text-[0.9375rem] font-semibold transition ${on ? "bg-[#171714] text-[#FAF7F3] shadow" : "text-[#4a4743] hover:bg-white"}`;
  const choice = (on: boolean) => `flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition ${on ? "border-[var(--b)] bg-[color-mix(in_srgb,var(--b)_6%,white)] ring-1 ring-[var(--b)]" : "border-[#E2D8CD] bg-white hover:border-[#CDBFB1]"}`;
  const months = cart.prepaidMonths ?? s.prepaid[0]?.months ?? 3;

  return (
    <form onSubmit={pay} className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-10">
      <div className="space-y-6">
        {/* Items */}
        <section className="rounded-[26px] bg-[#FFFDFC] p-5 ring-1 ring-[#EAE1D7] sm:p-6">
          <h2 className="text-[1.25rem] font-semibold">Your coffee</h2>
          <ul className="mt-4 divide-y divide-[#EFE7DE]">
            {items.map((it, idx) => {
              const { p, v } = byVariant.get(it.variantId)!;
              const line = priced?.lines.find((l) => l.variantId === it.variantId && l.grind === (p.grinds.length ? it.grind : null) && l.adjust === it.adjust);
              const whole = !it.grind || /whole/i.test(it.grind);
              return (
                <li key={`${it.variantId}-${it.grind}-${it.adjust}`} className="flex gap-4 py-4">
                  <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-[#F3ECE4]">{p.image_url && <img src={p.image_url} alt="" className="h-full w-full object-contain p-2" />}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div><p className="font-semibold leading-tight">{p.name}</p><p className="text-[0.875rem] text-[#6b655f]">{v.label}</p></div>
                      <p className="text-right font-semibold">{line ? money(line.total) : "—"}{line && line.unit < line.base && <span className="block text-[0.8125rem] font-normal text-[#8a817a] line-through">{money(line.base * line.qty)}</span>}</p>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {p.grinds.length > 0 && (
                        <select value={it.grind ?? ""} onChange={(e) => setItem(idx, { grind: e.target.value, adjust: /whole/i.test(e.target.value) ? 0 : it.adjust })} className="h-10 rounded-lg border border-[#E2D8CD] bg-white px-2.5 text-[0.875rem]" aria-label="Grind">
                          {p.grinds.map((g) => <option key={g}>{g}</option>)}
                        </select>
                      )}
                      <div className="flex h-10 items-center rounded-lg border border-[#E2D8CD] bg-white">
                        <button type="button" onClick={() => it.qty > 1 ? setItem(idx, { qty: it.qty - 1 }) : remove(idx)} className="grid h-10 w-9 place-items-center" aria-label="One less"><Minus className="h-3.5 w-3.5" /></button>
                        <span className="w-6 text-center text-[0.9375rem] font-semibold">{it.qty}</span>
                        <button type="button" onClick={() => setItem(idx, { qty: Math.min(50, it.qty + 1) })} className="grid h-10 w-9 place-items-center" aria-label="One more"><Plus className="h-3.5 w-3.5" /></button>
                      </div>
                      <button type="button" onClick={() => remove(idx)} className="grid h-10 w-10 place-items-center rounded-lg text-[#8a817a] hover:bg-[#F3ECE4] hover:text-[#171714]" aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
                    </div>
                    {!whole && p.grinds.length > 0 && <div className="mt-3 max-w-xs"><GrindAdjuster compact value={it.adjust} onChange={(n) => setItem(idx, { adjust: n })} /><p className="mt-1 text-[0.8125rem] text-[#6b655f]">{grindLabel(it.grind, it.adjust)}</p></div>}
                  </div>
                </li>
              );
            })}
          </ul>
          <Link href={`/shop/${slug}`} className="mt-2 inline-flex items-center gap-1 text-[0.9063rem] font-semibold text-[#4a4743] hover:text-[#171714]"><Plus className="h-4 w-4" />Add more coffee</Link>
        </section>

        {/* How often */}
        {canSub && (
          <section className="rounded-[26px] bg-[#FFFDFC] p-5 ring-1 ring-[#EAE1D7] sm:p-6">
            <h2 className="text-[1.25rem] font-semibold">How would you like it?</h2>
            <div className="mt-4 flex gap-1 rounded-2xl bg-[#F3ECE4] p-1" role="radiogroup" aria-label="Purchase type">
              <button type="button" role="radio" aria-checked={mode === "subscription"} onClick={() => setMode("subscription")} className={seg(mode === "subscription")}>Subscription{s.subDiscount > 0 ? <span className="block text-[0.75rem] font-medium opacity-80">save {s.subDiscount}%</span> : null}</button>
              {s.prepaid.length > 0 && <button type="button" role="radio" aria-checked={mode === "prepaid"} onClick={() => setMode("prepaid")} className={seg(mode === "prepaid")}>Prepaid<span className="block text-[0.75rem] font-medium opacity-80">{s.prepaid.map((x) => x.months).join(" / ")} months</span></button>}
              <button type="button" role="radio" aria-checked={mode === "one_off"} onClick={() => setMode("one_off")} className={seg(mode === "one_off")}>One-off<span className="block text-[0.75rem] font-medium opacity-80">just this once</span></button>
            </div>
            {mode !== "one_off" && (
              <div className="mt-5 space-y-5">
                {mode === "prepaid" && (
                  <div>
                    <p className={lab}>Package</p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {s.prepaid.map((pp) => <button key={pp.months} type="button" onClick={() => update((x) => ({ ...x, prepaidMonths: pp.months }))} className={choice(months === pp.months)}>
                        <span className="flex-1"><span className="block font-semibold">{pp.months} months</span><span className="block text-[0.8125rem] text-[#6b655f]">{prepaidDeliveries(pp.months, cart.interval)} deliveries{pp.discount > 0 ? ` · extra ${pp.discount}% off` : ""}</span></span>
                      </button>)}
                    </div>
                  </div>
                )}
                <div>
                  <p className={lab}>Deliver</p>
                  <div className="flex flex-wrap gap-2">
                    {s.frequencies.map((f) => { const on = f.unit === cart.interval.unit && f.count === cart.interval.count; return <button key={`${f.unit}${f.count}`} type="button" onClick={() => setInterval(f)} className={`rounded-full border px-3.5 py-2 text-[0.875rem] font-medium ${on ? "border-[#171714] bg-[#171714] text-white" : "border-[#DCD0C4] bg-white"}`}>{frequencyLabel(f.unit, f.count)}</button>; })}
                    <span className="inline-flex items-center gap-2 rounded-full border border-[#DCD0C4] bg-white px-3 py-1 text-[0.875rem]">Every
                      <input type="number" min={1} max={26} value={cart.interval.count} onChange={(e) => setInterval({ ...cart.interval, count: Math.max(1, Math.min(26, Number(e.target.value) || 1)) })} className="h-8 w-12 rounded-md border border-[#E2D8CD] text-center" aria-label="How many" />
                      <select value={cart.interval.unit} onChange={(e) => setInterval({ ...cart.interval, unit: e.target.value as IntervalUnit })} className="h-8 rounded-md border border-[#E2D8CD] bg-white" aria-label="Weeks or months"><option value="week">weeks</option><option value="month">months</option></select>
                    </span>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-[#F6F0E9] p-4">
                    <p className="flex items-center gap-2 text-[0.875rem] font-semibold"><CalendarDays className="h-4 w-4 text-[var(--b)]" />First delivery ships</p>
                    <p className="mt-1 text-[1.0313rem] font-semibold">{fmtDay(firstShip)}</p>
                    <label className="mt-2 block text-[0.8125rem] text-[#6b655f]">Start later? <input type="date" min={today} value={firstDate} onChange={(e) => setFirstDate(e.target.value)} className="ml-1 h-8 rounded-md border border-[#E2D8CD] bg-white px-2 text-[0.8125rem]" /></label>
                  </div>
                  <ul className="space-y-1.5 rounded-2xl bg-[#F6F0E9] p-4 text-[0.875rem]">
                    {["Pause, skip or cancel any time", "Swap coffee, grind or size", "Add a second address (home + work)"].map((t) => <li key={t} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--b)]" strokeWidth={2.5} />{t}</li>)}
                  </ul>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Delivery */}
        <section className="rounded-[26px] bg-[#FFFDFC] p-5 ring-1 ring-[#EAE1D7] sm:p-6">
          <h2 className="text-[1.25rem] font-semibold">Delivery</h2>
          <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
            <button type="button" onClick={() => setDelivery("post")} className={choice(effDelivery === "post")}><Truck className="h-6 w-6 shrink-0 text-[var(--b)]" /><span><span className="block font-semibold">Post it to me</span><span className="block text-[0.8125rem] text-[#6b655f]">{s.carrier || "Delivered"}{s.freeOver !== null ? ` · free over ${money(s.freeOver).replace(/\.00$/, "")}` : ""}</span></span></button>
            {s.pickup && <button type="button" onClick={() => setDelivery("pickup")} className={choice(effDelivery === "pickup")}><Store className="h-6 w-6 shrink-0 text-[var(--b)]" /><span><span className="block font-semibold">Pick up</span><span className="block text-[0.8125rem] text-[#6b655f]">Free</span></span></button>}
            {eventMode && mode === "one_off" && <button type="button" onClick={() => setDelivery("event")} className={choice(effDelivery === "event")}><PartyPopper className="h-6 w-6 shrink-0 text-[var(--b)]" /><span><span className="block font-semibold">With my event</span><span className="block text-[0.8125rem] text-[#6b655f]">{event!.name}{event!.date ? ` · ${event!.date}` : ""}</span></span></button>}
          </div>
          {effDelivery === "pickup" && s.pickupNote && <p className="mt-3 rounded-xl bg-[#F6F0E9] p-3 text-[0.9063rem]">{s.pickupNote}</p>}
          {effDelivery === "event" && <p className="mt-3 rounded-xl bg-[#F6F0E9] p-3 text-[0.9063rem]">We&apos;ll bring your coffee with the equipment for {event!.name} — no shipping.</p>}
          {effDelivery === "post" && (
            <div className="mt-5 grid gap-4 sm:grid-cols-6">
              {me && me.addresses.length > 1 && (
                <div className="sm:col-span-6"><label className={lab} htmlFor="ad-pick">Saved addresses</label>
                  <select id="ad-pick" className={input} onChange={(e) => { const x = me.addresses.find((y) => y.id === e.target.value); if (x) setA({ ...x }); }} defaultValue={addr0?.id}>{me.addresses.map((x) => <option key={x.id} value={x.id}>{x.label} — {x.line1}, {x.suburb}</option>)}</select></div>
              )}
              <div className="sm:col-span-3"><label className={lab} htmlFor="ad-n">Name on the parcel <span className="font-normal text-[#8a817a]">(if different)</span></label><input id="ad-n" className={input} value={a.name ?? ""} onChange={(e) => setA({ ...a, name: e.target.value })} autoComplete="shipping name" /></div>
              <div className="sm:col-span-3"><label className={lab} htmlFor="ad-c">Business <span className="font-normal text-[#8a817a]">(optional)</span></label><input id="ad-c" className={input} value={a.company ?? ""} onChange={(e) => setA({ ...a, company: e.target.value })} autoComplete="shipping organization" /></div>
              <div className="sm:col-span-4"><label className={lab} htmlFor="ad-1">Street address</label><input id="ad-1" className={input} required value={a.line1} onChange={(e) => setA({ ...a, line1: e.target.value })} autoComplete="shipping address-line1" /></div>
              <div className="sm:col-span-2"><label className={lab} htmlFor="ad-2">Unit / level</label><input id="ad-2" className={input} value={a.line2 ?? ""} onChange={(e) => setA({ ...a, line2: e.target.value })} autoComplete="shipping address-line2" /></div>
              <div className="sm:col-span-3"><label className={lab} htmlFor="ad-s">Suburb</label><input id="ad-s" className={input} required value={a.suburb} onChange={(e) => setA({ ...a, suburb: e.target.value })} autoComplete="shipping address-level2" /></div>
              <div className="sm:col-span-1"><label className={lab} htmlFor="ad-st">State</label><select id="ad-st" className={`${input} px-2`} required value={a.state} onChange={(e) => setA({ ...a, state: e.target.value })}><option value="" />{STATES.map((x) => <option key={x}>{x}</option>)}</select></div>
              <div className="sm:col-span-2"><label className={lab} htmlFor="ad-p">Postcode</label><input id="ad-p" className={input} required inputMode="numeric" pattern="\d{4}" maxLength={4} value={a.postcode} onChange={(e) => setA({ ...a, postcode: e.target.value.replace(/\D/g, "") })} autoComplete="shipping postal-code" /></div>
              <div className="sm:col-span-6"><label className={lab} htmlFor="ad-i">Delivery instructions <span className="font-normal text-[#8a817a]">(optional)</span></label><input id="ad-i" className={input} value={a.instructions ?? ""} onChange={(e) => setA({ ...a, instructions: e.target.value })} placeholder="e.g. leave at reception" /></div>
            </div>
          )}
        </section>

        {/* Contact */}
        <section className="rounded-[26px] bg-[#FFFDFC] p-5 ring-1 ring-[#EAE1D7] sm:p-6">
          <h2 className="text-[1.25rem] font-semibold">Your details</h2>
          {!me && <p className="mt-1 text-[0.875rem] text-[#6b655f]">Ordered before? <Link href={`/shop/${slug}/account?next=cart`} className="font-semibold underline">Sign in</Link> to use your saved address.</p>}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div><label className={lab} htmlFor="c-n">Name</label><input id="c-n" className={input} required value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} autoComplete="name" /></div>
            <div><label className={lab} htmlFor="c-p">Mobile</label><input id="c-p" className={input} type="tel" value={c.phone} onChange={(e) => setC({ ...c, phone: e.target.value })} autoComplete="tel" /></div>
            <div className="sm:col-span-2"><label className={lab} htmlFor="c-e">Email</label><input id="c-e" className={input} required type="email" inputMode="email" value={c.email} onChange={(e) => setC({ ...c, email: e.target.value })} autoComplete="email" readOnly={!!me} />
              <p className="mt-1.5 text-[0.8125rem] text-[#6b655f]">Receipts, tracking{mode !== "one_off" ? " and your subscription sign-in link" : ""} go here.</p></div>
            <div className="sm:col-span-2"><label className={lab} htmlFor="c-note">Note for the roaster <span className="font-normal text-[#8a817a]">(optional)</span></label><input id="c-note" className={input} value={c.note} onChange={(e) => setC({ ...c, note: e.target.value })} maxLength={1000} /></div>
            <label className="flex items-center gap-2.5 text-[0.9063rem] sm:col-span-2"><input type="checkbox" checked={c.marketing} onChange={(e) => setC({ ...c, marketing: e.target.checked })} className="h-5 w-5 rounded accent-[var(--b)]" />Tell me about new coffees and special offers</label>
          </div>
        </section>
      </div>

      {/* Summary */}
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-[26px] bg-[#FFFDFC] p-5 shadow-[0_30px_70px_-40px_rgba(60,40,25,.55)] ring-1 ring-[#EAE1D7] sm:p-6">
          <h2 className="flex items-center justify-between text-[1.25rem] font-semibold">Summary{quoting && <Loader2 className="h-4 w-4 animate-spin text-[#8a817a]" />}</h2>
          {priced && (
            <>
              {priced.freeShippingGap !== null && priced.freeShippingGap > 0 && s.freeOver && (
                <div className="mt-4 rounded-2xl bg-[#F6F0E9] p-3.5">
                  <p className="text-[0.875rem]">Add <span className="font-bold">{money(priced.freeShippingGap)}</span> for free shipping</p>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-[var(--b)] transition-all" style={{ width: `${Math.min(100, Math.round((priced.subtotal / s.freeOver) * 100))}%` }} /></div>
                </div>
              )}
              <dl className="mt-4 space-y-2.5 text-[0.9688rem]">
                <div className="flex justify-between"><dt className="text-[#5b5955]">Coffee</dt><dd>{money(priced.listSubtotal)}</dd></div>
                {priced.saved > 0 && <div className="flex justify-between text-[var(--b)]"><dt>Subscriber saving</dt><dd>−{money(priced.saved)}</dd></div>}
                {priced.discount > 0 && <div className="flex justify-between text-[var(--b)]"><dt>Discount</dt><dd>−{money(priced.discount)}</dd></div>}
                <div className="flex justify-between"><dt className="text-[#5b5955]">Shipping</dt><dd>{effDelivery !== "post" ? "Free" : priced.shipping > 0 ? money(priced.shipping) : "Free"}</dd></div>
                {mode === "prepaid" && <div className="flex justify-between border-t border-[#EFE7DE] pt-2.5"><dt className="text-[#5b5955]">Each delivery</dt><dd>{money(priced.perDelivery)} × {priced.deliveries}</dd></div>}
              </dl>
              <div className="mt-4 flex items-baseline justify-between border-t border-[#EFE7DE] pt-4"><span className="text-[1.0625rem] font-semibold">{mode === "subscription" ? "Today" : "Total"}</span><span className="text-[1.75rem] font-bold">{money(priced.total)}</span></div>
              {mode === "subscription" && <p className="mt-1 text-right text-[0.875rem] text-[#5b5955]">then {money(priced.perDelivery)} {frequencyLabel(cart.interval.unit, cart.interval.count).toLowerCase()}</p>}
              {mode === "prepaid" && <p className="mt-1 text-right text-[0.875rem] text-[#5b5955]">{priced.deliveries} deliveries, {frequencyLabel(cart.interval.unit, cart.interval.count).toLowerCase()} · nothing more to pay</p>}
            </>
          )}

          {/* Codes */}
          <div className="mt-5 space-y-3 border-t border-[#EFE7DE] pt-5">
            {cart.coupon ? (
              <p className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-[0.875rem] font-medium ${couponMsg && !couponMsg.ok ? "bg-rose-50 text-rose-800" : "bg-emerald-50 text-emerald-800"}`}>
                <span className="flex items-center gap-2"><Tag className="h-4 w-4" />{couponMsg?.text ?? cart.coupon}</span>
                <button type="button" onClick={() => { update((x) => ({ ...x, coupon: null })); setCouponMsg(null); }} className="text-[0.8125rem] underline">Remove</button>
              </p>
            ) : (
              <div className="flex gap-2"><input className={`${input} h-11 uppercase`} placeholder="Promo code" value={couponInput} onChange={(e) => setCouponInput(e.target.value)} aria-label="Promo code" />
                <button type="button" onClick={() => { const v = couponInput.trim().toUpperCase(); if (v) update((x) => ({ ...x, coupon: v })); }} className="h-11 rounded-xl bg-[#171714] px-4 text-[0.875rem] font-semibold text-white">Apply</button></div>
            )}
            {mode !== "subscription" && (
              <div className="relative"><Gift className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a817a]" /><input className={`${input} h-11 pl-9 uppercase`} placeholder="Gift card code (optional)" value={gift} onChange={(e) => setGift(e.target.value)} aria-label="Gift card code" /></div>
            )}
          </div>

          {priced?.problems.map((p) => <p key={p} className="mt-4 rounded-xl bg-amber-50 px-3 py-2.5 text-[0.875rem] text-amber-900">{p}</p>)}
          {err && <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-[0.9063rem] font-medium text-rose-800">{err}</p>}
          <button type="submit" disabled={paying || !priced || priced.problems.length > 0} className="shop-btn mt-5 flex h-16 w-full items-center justify-center gap-2.5 rounded-2xl bg-[var(--b)] text-[1.125rem] font-semibold text-[var(--on-b)] shadow-[0_14px_30px_-14px_var(--b)] disabled:opacity-60">
            {paying ? <Loader2 className="h-5 w-5 animate-spin" /> : <Lock className="h-5 w-5" />}{mode === "subscription" ? "Start subscription" : "Pay securely"}{priced ? ` · ${money(priced.total)}` : ""}
          </button>
          <p className="mt-3 text-center text-[0.8125rem] text-[#6b655f]">Card payments by Stripe.{mode === "subscription" ? " Your card is saved for future deliveries — you're in control and can pause or cancel any time." : ""}</p>
          {s.roastNote && <p className="mt-4 rounded-2xl bg-[#F6F0E9] p-3.5 text-[0.8438rem] leading-relaxed text-[#4a4743]">{s.roastNote}</p>}
        </div>
      </aside>
    </form>
  );
}
