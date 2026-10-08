"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Minus, Plus, ShoppingBag } from "lucide-react";
import { ADJUST_LABELS, boxOptions, frequencyLabel, unitPrice, type IntervalUnit, type Product, type ShopSettings } from "@/lib/shop/core";
import { useCart } from "./cart-store";

const money = (n: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n).replace(/\.00$/, "");

export function GrindAdjuster({ value, onChange, compact = false }: { value: number; onChange: (n: number) => void; compact?: boolean }) {
  const steps = [-2, -1, 0, 1, 2];
  return (
    <div>
      <div className="flex items-center justify-between text-[0.8125rem] font-medium text-[#6b655f]"><span>Finer</span><span>Our standard</span><span>Coarser</span></div>
      <div className="relative mt-2 flex items-center justify-between" role="radiogroup" aria-label="Grind adjustment">
        <div className="absolute inset-x-3 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-[linear-gradient(90deg,#3b2a20,#C9A27E_50%,#EBDCC9)]" />
        {steps.map((n) => (
          <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={n === 0 ? "Our standard grind" : ADJUST_LABELS[n]} onClick={() => onChange(n)}
            className={`relative grid place-items-center rounded-full border-2 transition ${compact ? "h-7 w-7" : "h-9 w-9"} ${value === n ? "border-[var(--b)] bg-[var(--b)] shadow-[0_0_0_4px_color-mix(in_srgb,var(--b)_22%,transparent)]" : "border-[#D8CCBF] bg-white hover:border-[#B9A894]"}`}>
            {value === n && <Check className="h-4 w-4 text-[var(--on-b)]" strokeWidth={3} />}
          </button>
        ))}
      </div>
      {!compact && <p className="mt-2 text-[0.8438rem] text-[#6b655f]">{value === 0 ? "Ground to our usual setting for this brew method." : `We'll grind it ${ADJUST_LABELS[value]} than usual.`}</p>}
    </div>
  );
}

export function BuyBox({ slug, p, s, products = [] }: { slug: string; p: Product; s: ShopSettings; products?: Product[] }) {
  const router = useRouter();
  const { add } = useCart(slug);
  const canSub = p.kind === "coffee" && p.subscribable;
  const [mode, setMode] = useState<"one_off" | "subscription">(canSub ? "subscription" : "one_off");
  const [variantId, setVariantId] = useState(p.variants[Math.min(1, p.variants.length - 1)]?.id ?? p.variants[0]?.id);
  const [grind, setGrind] = useState<string | null>(p.grinds[0] ?? null);
  const [adjust, setAdjust] = useState(0);
  const [qty, setQty] = useState(1);
  const quick = s.frequencies;
  const [freq, setFreq] = useState<{ unit: IntervalUnit; count: number }>(quick.find((f) => f.unit === "week" && f.count === 2) ?? quick[0] ?? { unit: "week", count: 2 });
  const [custom, setCustom] = useState(false);
  const [added, setAdded] = useState(false);
  // Selection box: some coffees always in, the rest the customer picks (pre-selected to start)
  const box = s.boxes.find((b) => b.productId === p.id) ?? null;
  const byId = new Map(products.map((x) => [x.id, x]));
  const [picks, setPicks] = useState<string[]>(() => (box ? box.slots.map((sl) => { const opts = boxOptions(sl, products, s.boxes); return sl.default && opts.some((o) => o.id === sl.default) ? sl.default : opts[0]?.id ?? ""; }) : []));
  const v = p.variants.find((x) => x.id === variantId) ?? p.variants[0];
  if (!v) return <p className="rounded-2xl bg-white p-6 text-[#5b5955]">Not available right now.</p>;
  const one = unitPrice(v.price, "one_off", s);
  const sub = unitPrice(v.price, "subscription", s);
  const whole = !grind || /whole/i.test(grind);

  const submit = () => {
    add({ variantId: v.id, grind, adjust: whole ? 0 : adjust, qty, ...(box ? { picks } : {}) }, { mode, interval: mode === "subscription" ? freq : undefined });
    setAdded(true);
    router.push(`/shop/${slug}/cart`);
  };
  const card = (on: boolean) => `relative flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition ${on ? "border-[var(--b)] bg-[color-mix(in_srgb,var(--b)_6%,white)] ring-1 ring-[var(--b)]" : "border-[#E2D8CD] bg-white hover:border-[#CDBFB1]"}`;
  const dot = (on: boolean) => <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${on ? "bg-[var(--b)] text-[var(--on-b)]" : "border-2 border-[#D3C8BD] bg-white"}`}>{on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}</span>;
  const pill = (on: boolean) => `rounded-xl border px-4 py-2.5 text-[0.9375rem] font-semibold transition ${on ? "border-[#171714] bg-[#171714] text-[#FAF7F3]" : "border-[#E2D8CD] bg-white text-[#2b2925] hover:border-[#B9A894]"}`;

  return (
    <div className="rounded-[28px] bg-[#FFFDFC] p-5 shadow-[0_30px_70px_-40px_rgba(60,40,25,.6)] ring-1 ring-[#EAE1D7] sm:p-7">
      {p.variants.length > 1 && (
        <fieldset>
          <legend className="text-[0.9375rem] font-semibold">Size</legend>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {p.variants.map((x) => <button key={x.id} type="button" onClick={() => setVariantId(x.id)} className={pill(x.id === v.id)} aria-pressed={x.id === v.id}>{x.label}<span className="ml-2 font-normal opacity-75">{money(x.price)}</span></button>)}
          </div>
        </fieldset>
      )}

      {box && (
        <fieldset className={p.variants.length > 1 ? "mt-6" : ""}>
          <legend className="text-[0.9375rem] font-semibold">What&apos;s in your box</legend>
          <p className="mt-0.5 text-[0.8438rem] text-[#6b655f]">{box.included.length + box.slots.length} × {box.bag} bags{box.slots.length ? ` — choose ${box.slots.length === 1 ? "the last one" : `the last ${box.slots.length}`}` : ""}.</p>
          <ol className="mt-3 space-y-2">
            {box.included.map((id, i) => (
              <li key={id} className="flex items-center gap-3 rounded-2xl border border-[#E2D8CD] bg-[#FBF7F3] px-3.5 py-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#171714] text-[0.8125rem] font-bold text-white">{i + 1}</span>
                {byId.get(id)?.image_url ? <img src={byId.get(id)!.image_url!} alt="" className="h-10 w-10 shrink-0 object-contain" /> : null}
                <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{byId.get(id)?.name ?? "Coffee"}</span><span className="text-[0.8125rem] text-[#6b655f]">Always included</span></span>
                <Check className="h-4 w-4 shrink-0 text-[var(--b)]" strokeWidth={3} />
              </li>
            ))}
            {box.slots.map((sl, i) => {
              const opts = boxOptions(sl, products, s.boxes);
              const n = box.included.length + i + 1;
              const pick = byId.get(picks[i]);
              return (
                <li key={i} className="flex items-center gap-3 rounded-2xl border border-[var(--b)] bg-white px-3.5 py-3 ring-1 ring-[color-mix(in_srgb,var(--b)_30%,transparent)]">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--b)] text-[0.8125rem] font-bold text-[var(--on-b)]">{n}</span>
                  {pick?.image_url ? <img src={pick.image_url} alt="" className="h-10 w-10 shrink-0 object-contain" /> : null}
                  <label className="min-w-0 flex-1">
                    <span className="block text-[0.8125rem] text-[#6b655f]">Your choice{sl.default && picks[i] === sl.default ? " · our pick" : ""}</span>
                    <select value={picks[i] ?? ""} onChange={(e) => setPicks(picks.map((x, j) => (j === i ? e.target.value : x)))} className="mt-0.5 w-full truncate rounded-lg border-0 bg-transparent p-0 text-[0.9688rem] font-semibold focus:ring-0" aria-label={`Coffee ${n}`}>
                      {opts.map((o) => <option key={o.id} value={o.id}>{o.name}{o.id === sl.default ? " (our pick)" : ""}</option>)}
                    </select>
                  </label>
                </li>
              );
            })}
          </ol>
        </fieldset>
      )}

      {p.grinds.length > 0 && (
        <fieldset className="mt-6">
          <legend className="flex w-full items-center justify-between text-[0.9375rem] font-semibold">Grind<Link href={`/shop/${slug}/grind`} className="text-[0.8438rem] font-medium text-[#6b655f] underline underline-offset-2 hover:text-[#171714]">Which grind?</Link></legend>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {p.grinds.map((g) => <button key={g} type="button" onClick={() => setGrind(g)} className={pill(g === grind)} aria-pressed={g === grind}>{g}</button>)}
          </div>
          {!whole && <div className="mt-4 rounded-2xl bg-[#F6F0E9] p-4"><p className="mb-3 text-[0.875rem] font-semibold">Fine-tune it <span className="font-normal text-[#6b655f]">— was your last bag not quite right?</span></p><GrindAdjuster value={adjust} onChange={setAdjust} /></div>}
        </fieldset>
      )}

      <fieldset className="mt-6 space-y-2.5">
        <legend className="mb-2.5 text-[0.9375rem] font-semibold">How would you like it?</legend>
        {canSub && (
          <button type="button" onClick={() => setMode("subscription")} className={card(mode === "subscription")} aria-pressed={mode === "subscription"}>
            {dot(mode === "subscription")}
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-baseline justify-between gap-x-3"><span className="text-[1.0313rem] font-semibold">Subscribe{s.subDiscount > 0 ? ` & save ${s.subDiscount}%` : ""}</span>
                <span><span className="text-[1.25rem] font-bold">{money(sub)}</span>{s.subDiscount > 0 && <span className="ml-1.5 text-[0.875rem] text-[#8a817a] line-through">{money(one)}</span>}</span></span>
              <span className="mt-1 block text-[0.875rem] leading-snug text-[#6b655f]">Pause, skip, swap or cancel any time. Split between home and work.</span>
            </span>
            <span className="absolute -top-2.5 right-4 rounded-full bg-[var(--b)] px-2.5 py-0.5 text-[0.6875rem] font-bold uppercase tracking-wider text-[var(--on-b)]">Best value</span>
          </button>
        )}
        {mode === "subscription" && canSub && (
          <div className="rounded-2xl bg-[#F6F0E9] p-4">
            <p className="text-[0.875rem] font-semibold">Deliver</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {quick.map((f) => { const on = !custom && f.unit === freq.unit && f.count === freq.count; return <button key={`${f.unit}${f.count}`} type="button" onClick={() => { setCustom(false); setFreq(f); }} className={`rounded-full border px-3.5 py-1.5 text-[0.875rem] font-medium ${on ? "border-[#171714] bg-[#171714] text-white" : "border-[#DCD0C4] bg-white"}`}>{frequencyLabel(f.unit, f.count)}</button>; })}
              <button type="button" onClick={() => setCustom(true)} className={`rounded-full border px-3.5 py-1.5 text-[0.875rem] font-medium ${custom ? "border-[#171714] bg-[#171714] text-white" : "border-[#DCD0C4] bg-white"}`}>Choose my own</button>
            </div>
            {custom && (
              <div className="mt-3 flex items-center gap-2 text-[0.9375rem]">
                Every
                <input type="number" min={1} max={26} value={freq.count} onChange={(e) => setFreq({ ...freq, count: Math.max(1, Math.min(26, Number(e.target.value) || 1)) })} className="h-10 w-16 rounded-lg border border-[#DCD0C4] bg-white px-2 text-center" aria-label="How many" />
                <select value={freq.unit} onChange={(e) => setFreq({ ...freq, unit: e.target.value as IntervalUnit })} className="h-10 rounded-lg border border-[#DCD0C4] bg-white px-2" aria-label="Weeks or months">
                  <option value="week">week{freq.count === 1 ? "" : "s"}</option><option value="month">month{freq.count === 1 ? "" : "s"}</option>
                </select>
              </div>
            )}
          </div>
        )}
        <button type="button" onClick={() => setMode("one_off")} className={card(mode === "one_off")} aria-pressed={mode === "one_off"}>
          {dot(mode === "one_off")}
          <span className="flex flex-1 flex-wrap items-baseline justify-between gap-x-3"><span className="text-[1.0313rem] font-semibold">One-off purchase</span><span className="text-[1.25rem] font-bold">{money(one)}</span></span>
        </button>
      </fieldset>

      <div className="mt-6 flex items-center gap-3">
        <div className="flex h-14 items-center rounded-2xl border border-[#E2D8CD] bg-white">
          <button type="button" onClick={() => setQty(Math.max(1, qty - 1))} className="grid h-14 w-12 place-items-center" aria-label="One less"><Minus className="h-4 w-4" /></button>
          <span className="w-8 text-center text-[1.0625rem] font-semibold" aria-live="polite">{qty}</span>
          <button type="button" onClick={() => setQty(Math.min(20, qty + 1))} className="grid h-14 w-12 place-items-center" aria-label="One more"><Plus className="h-4 w-4" /></button>
        </div>
        <button type="button" onClick={submit} disabled={added} data-track-kind="cart_add" data-track={`Add to cart: ${p.name}`} className="shop-btn flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-[var(--b)] px-5 text-[1.0625rem] font-semibold text-[var(--on-b)] shadow-[0_14px_30px_-14px_var(--b)] disabled:opacity-70">
          <ShoppingBag className="h-5 w-5" />{mode === "subscription" ? `Subscribe — ${money(sub * qty)}` : `Add to cart — ${money(one * qty)}`}
        </button>
      </div>
      {mode === "subscription" && <p className="mt-3 text-center text-[0.8438rem] text-[#6b655f]">{frequencyLabel(freq.unit, freq.count)} · first delivery on the next roast · prepay 3, 6 or 12 months at checkout</p>}
    </div>
  );
}
