"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarCheck, Check, ChevronLeft, ChevronRight, Loader2, Plus, ShoppingBag } from "lucide-react";
import type { ShopItem } from "@/lib/hire/shop";
import { shopAvailabilityAction } from "@/app/hire/[org]/shop/actions";
import { DateField, Stepper, readBasket, writeBasket } from "./hire-shop";

type Win = { startDate: string; startTime: string; endDate: string; endTime: string };
type Avail = Record<string, { free: number; freeFrom: number | null }>;

/** Photos on an item's page: a big one with thumbnails underneath (swipe on phones). */
export function Gallery({ images, name }: { images: string[]; name: string }) {
  const [i, setI] = useState(0);
  const touch = useRef<number | null>(null);
  if (!images.length) return null;
  const go = (d: number) => setI((x) => (x + d + images.length) % images.length);
  return (
    <div>
      <div className="relative overflow-hidden rounded-2xl bg-white ring-1 ring-zinc-200"
        onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => { const s = touch.current; touch.current = null; if (s == null) return; const dx = e.changedTouches[0].clientX - s; if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1); }}>
        <img src={images[i]} alt={i ? `${name} — photo ${i + 1}` : name} className="aspect-[4/3] w-full object-contain" />
        {images.length > 1 && <>
          <button type="button" aria-label="Previous photo" onClick={() => go(-1)} className="absolute left-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 shadow hover:bg-white"><ChevronLeft className="h-5 w-5" /></button>
          <button type="button" aria-label="Next photo" onClick={() => go(1)} className="absolute right-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 shadow hover:bg-white"><ChevronRight className="h-5 w-5" /></button>
        </>}
      </div>
      {images.length > 1 && (
        <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
          {images.map((u, k) => (
            <button key={u} type="button" aria-label={`Show photo ${k + 1}`} aria-current={k === i} onClick={() => setI(k)} className={`shrink-0 overflow-hidden rounded-lg ring-2 ${k === i ? "ring-[var(--bc)]" : "ring-transparent opacity-70 hover:opacity-100"}`}>
              <img src={u} alt="" loading="lazy" className="h-16 w-20 object-cover sm:h-20 sm:w-24" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Check dates, choose how many, tick any add-ons, then book now (straight to the booking with these dates) or add to a hire
 * already being put together.
 */
export function ProductBuy({ slug, tz, today, currency, item, addons, initialWindow, initialAvail }: {
  slug: string; tz: string; today: string; currency: string; item: ShopItem; addons: ShopItem[]; initialWindow: Win; initialAvail: Avail;
}) {
  const money = (n: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency, minimumFractionDigits: n % 1 ? 2 : 0 }).format(n);
  const when = (ms: number) => new Intl.DateTimeFormat("en-AU", { timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(ms));
  const [win, setWin] = useState<Win>(initialWindow);
  const [avail, setAvail] = useState<Avail>(initialAvail);
  const [checking, setChecking] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [picked, setPicked] = useState<string[]>([]);
  const [inBasket, setInBasket] = useState(0);
  const first = useRef(true);
  useEffect(() => { setInBasket(readBasket(slug).reduce((a, b) => a + b.qty, 0)); }, [slug]);
  const wkey = `${win.startDate}${win.startTime}${win.endDate}${win.endTime}`;
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    let live = true; setChecking(true); setErr(null);
    const t = setTimeout(async () => {
      const r = await shopAvailabilityAction(slug, win).catch(() => null);
      if (!live) return;
      setChecking(false);
      if (r?.ok) setAvail(r.data); else setErr(r?.error ?? "Couldn't check those dates.");
    }, 250);
    return () => { live = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wkey]);

  const free = item.kind === "sale" ? 999 : (avail[item.id]?.free ?? item.max);
  const out = item.kind !== "sale" && free <= 0;
  const n = Math.min(qty, Math.max(1, free));
  const lines = [{ id: item.id, qty: n }, ...picked.map((id) => ({ id, qty: 1 }))];
  const total = item.price * n + picked.reduce((a, id) => a + (addons.find((x) => x.id === id)?.price ?? 0), 0);
  const shopUrl = (add: boolean) => {
    const p = new URLSearchParams({ from: win.startDate, to: win.endDate, st: win.startTime, et: win.endTime });
    if (add) p.set("add", lines.map((l) => `${l.id}:${l.qty}`).join(","));
    return `/hire/${slug}/shop?${p.toString()}`;
  };
  const addToHire = (go: boolean) => {
    const b = readBasket(slug);
    for (const l of lines) { const x = b.find((y) => y.id === l.id); if (x) x.qty = Math.max(x.qty, l.qty); else b.push(l); }
    writeBasket(slug, b);
    setInBasket(b.reduce((a, x) => a + x.qty, 0));
    if (go) window.location.href = shopUrl(false);
  };

  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200 sm:p-5">
      <div className="grid gap-3">
        <DateField label="Start" date={win.startDate} time={win.startTime} min={today} onChange={(d, t) => setWin((w) => ({ ...w, startDate: d, startTime: t, endDate: w.endDate < d ? d : w.endDate }))} />
        <DateField label="Finish" date={win.endDate} time={win.endTime} min={win.startDate} onChange={(d, t) => setWin((w) => ({ ...w, endDate: d, endTime: t }))} />
      </div>
      <p className="mt-3 flex min-h-6 items-center gap-2 text-[0.875rem] font-medium" role="status">
        {checking ? <><Loader2 className="h-4 w-4 animate-spin text-zinc-400" /><span className="text-zinc-500">Checking…</span></>
          : err ? <span className="text-rose-600">{err}</span>
            : item.kind === "sale" ? <span className="text-zinc-500">Add-on to buy</span>
              : out ? <span className="text-zinc-600">Booked out for these dates{avail[item.id]?.freeFrom ? ` — free from ${when(avail[item.id]!.freeFrom!)}` : ""}. Try other dates.</span>
                : <><CalendarCheck className="h-4 w-4 text-emerald-600" /><span className="text-emerald-700">Available{free > 1 && free < 50 ? ` — ${free} free` : ""} for your dates</span></>}
      </p>
      {!out && item.max > 1 && item.kind !== "package" && (
        <div className="mt-3 flex items-center justify-between">
          <span className="text-[0.875rem] text-zinc-600">How many</span>
          <Stepper qty={n} max={Math.max(1, free)} onChange={(v) => setQty(Math.max(1, v))} />
        </div>
      )}
      {addons.length > 0 && (
        <fieldset className="mt-4 border-t border-zinc-100 pt-4">
          <legend className="mb-2 text-[0.8125rem] font-semibold text-zinc-900">Add to your hire</legend>
          <div className="space-y-2">
            {addons.map((a) => {
              const aOut = a.kind !== "sale" && (avail[a.id]?.free ?? a.max) <= 0;
              const on = picked.includes(a.id);
              return (
                <label key={a.id} className={`flex cursor-pointer items-center gap-3 rounded-xl p-2 ring-1 ${on ? "ring-[var(--bc)]" : "ring-zinc-200"} ${aOut ? "cursor-not-allowed opacity-50" : "hover:ring-zinc-400"}`}>
                  <input type="checkbox" className="h-4 w-4 accent-[var(--bc)]" disabled={aOut} checked={on} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, a.id] : p.filter((x) => x !== a.id)))} />
                  {a.image && <img src={a.image} alt="" loading="lazy" className="h-10 w-12 rounded-md object-cover" />}
                  <span className="min-w-0 flex-1 text-[0.8125rem] font-medium leading-snug text-zinc-900">{a.name}{aOut && <span className="block text-[0.75rem] font-normal text-zinc-500">Booked out for these dates</span>}</span>
                  <span className="text-[0.8125rem] font-semibold tabular-nums text-zinc-700">+{money(a.price)}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}
      <div className="mt-4 flex items-baseline justify-between border-t border-zinc-100 pt-4">
        <span className="text-[0.875rem] text-zinc-600">From</span>
        <span className="text-[1.375rem] font-extrabold tabular-nums text-zinc-900">{money(total)}<span className="ml-1 text-[0.75rem] font-medium text-zinc-500">{picked.length ? "" : item.priceNote}</span></span>
      </div>
      <p className="text-right text-[0.75rem] text-zinc-500">Final price for your dates shown before you book. Includes GST.</p>
      <div className="mt-4 grid gap-2">
        <a href={out ? undefined : shopUrl(true)} aria-disabled={out} onClick={(e) => { if (out) { e.preventDefault(); return; } writeBasket(slug, readBasket(slug).filter((b) => !lines.some((l) => l.id === b.id))); }}
          className={`flex h-12 items-center justify-center gap-2 rounded-xl text-[1rem] font-bold ${out ? "pointer-events-none bg-zinc-300 text-white" : "bg-[var(--ac)] text-[var(--ac-ink)] hover:brightness-105"}`}><Check className="h-5 w-5" />Book now</a>
        <button type="button" disabled={out} onClick={() => addToHire(false)} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-white text-[1rem] font-semibold text-zinc-900 ring-1 ring-zinc-300 hover:ring-zinc-500 disabled:opacity-50"><Plus className="h-5 w-5" />Add to my hire</button>
      </div>
      {inBasket > 0 && <a href={shopUrl(false)} className="mt-3 flex items-center justify-center gap-2 text-[0.875rem] font-semibold text-[var(--bc)] hover:underline"><ShoppingBag className="h-4 w-4" />{inBasket} item{inBasket === 1 ? "" : "s"} in your hire — keep shopping or check out</a>}
    </div>
  );
}
