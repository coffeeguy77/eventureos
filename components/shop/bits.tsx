import Link from "next/link";
import { CalendarDays, CreditCard, FastForward, Flame, Gift, Home, PackageCheck, PauseCircle, RefreshCw, Split, Truck } from "lucide-react";
import { dayList, unitPrice, type Product, type ShopSettings } from "@/lib/shop/core";
import { serif } from "./frame";

export const $ = (n: number, currency = "AUD") => new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(n).replace(/\.00$/, "");

export function priceFrom(p: Product) {
  const prices = p.variants.map((v) => v.price);
  return prices.length ? Math.min(...prices) : 0;
}

/** "Roasted Wednesday & Thursday · Ships Thursday & Friday · Australia Post" — only the parts the business has set. */
export function scheduleChips(s: ShopSettings) {
  return [
    s.roastDays.length ? { icon: Flame, text: `Roasted ${dayList(s.roastDays)}` } : null,
    s.dispatchDays.length ? { icon: PackageCheck, text: `Ships ${dayList(s.dispatchDays)}` } : null,
    s.carrier ? { icon: Truck, text: `Via ${s.carrier}` } : null,
  ].filter((x): x is { icon: typeof Flame; text: string } => !!x);
}

export const FLEX = [
  { icon: CalendarDays, t: "Any frequency", d: "Weekly, fortnightly, every 5 weeks — or set your own." },
  { icon: PauseCircle, t: "Pause anytime", d: "Away for a while? Pause until a date, or until you're back." },
  { icon: FastForward, t: "Skip or send sooner", d: "Running low or still stocked? Move the next delivery." },
  { icon: RefreshCw, t: "Swap your coffee", d: "Change beans, size, grind or quantity before any delivery." },
  { icon: Split, t: "Split deliveries", d: "One subscription, two addresses — home and work." },
  { icon: CreditCard, t: "Prepay & relax", d: "Pay for 3, 6 or 12 months up front. A great gift too." },
  { icon: Home, t: "Change address", d: "Moving or on holiday? Update where it goes in seconds." },
];
/** The eighth tile: prepaid subscriptions make a gift (only when the business offers prepaid). */
export const GIFT_TILE = { icon: Gift, t: "A great gift", d: "Prepay their coffee and frequency, send it to their door, and we'll keep the good coffee coming." };

/** Shop product card. `prices`: "from" shows From / Subscribe from; "split" shows One-time / Subscribe side by side. */
export function ProductCard({ p, slug, s, currency, prices = "from" }: { p: Product; slug: string; s: ShopSettings; currency: string; prices?: "from" | "split" }) {
  const from = priceFrom(p);
  const sub = p.subscribable && p.kind === "coffee" && s.subDiscount > 0 ? unitPrice(from, "subscription", s) : null;
  const notes = p.tasting_notes || p.short;
  return (
    <Link href={`/shop/${slug}/p/${p.slug}`} className="shop-card group flex h-full flex-col overflow-hidden rounded-[18px] bg-white shadow-[0_1px_0_rgba(21,19,18,.04),0_12px_32px_-22px_rgba(80,45,40,.35)] ring-1 ring-[#EFE6DF]">
      <div className="relative aspect-[1/0.78] overflow-hidden bg-[linear-gradient(180deg,#FFF6F5,color-mix(in_srgb,var(--b)_10%,#FFF3EF))]">
        {p.image_url
          ? <img src={p.image_url} alt="" className="shop-zoom absolute inset-0 h-full w-full object-contain px-6 pb-3 pt-9 drop-shadow-[0_18px_18px_rgba(60,30,20,.18)]" loading="lazy" />
          : <span className={`${serif} absolute inset-0 grid place-items-center text-[3rem] text-[var(--b)]`}>{p.name[0]}</span>}
        {p.featured && <span className="absolute left-3 top-3 rounded-full bg-[#151312] px-2.5 py-[3px] text-[0.6875rem] font-semibold text-white">Featured</span>}
        {sub !== null && <span className="absolute right-3 top-3 rounded-full bg-[color-mix(in_srgb,var(--b)_22%,white)] px-2.5 py-[3px] text-[0.6875rem] font-semibold text-[#151312]">Save {s.subDiscount}% on subscription</span>}
      </div>
      <div className="flex flex-1 flex-col px-5 pb-5 pt-4">
        {p.category && <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[#7A726B]">{p.category}</p>}
        <h3 className={`${serif} mt-1 text-[1.25rem] font-bold leading-[1.2] text-[#151312]`}>{p.name}</h3>
        {notes && <p className="mt-1.5 line-clamp-2 text-[0.875rem] leading-relaxed text-[#5E5853]">{notes}</p>}
        {p.best_for && <p className="mt-2.5 inline-flex w-fit rounded-full bg-[color-mix(in_srgb,var(--b)_12%,#FFF6F2)] px-3 py-1 text-[0.75rem] font-medium text-[#3F3A36]">Best for {p.best_for.toLowerCase()}</p>}
        {prices === "split" ? (
          <div className="mt-auto grid grid-cols-2 gap-2 border-t border-[#F0E8E2] pt-3.5 text-[0.75rem] text-[#7A726B]">
            <p>One-time<span className="mt-0.5 block text-[1.125rem] font-bold text-[#151312]">{$(from, currency)}</span></p>
            {sub !== null && <p className="text-right">Subscribe<span className="mt-0.5 block text-[1.125rem] font-bold text-[var(--b)]">{$(sub, currency)}</span></p>}
          </div>
        ) : (
          <div className="mt-auto flex items-end justify-between gap-3 pt-4">
            <p className="text-[0.875rem] text-[#5E5853]">From <span className="text-[1.125rem] font-bold text-[#151312]">{$(from, currency)}</span></p>
            {sub !== null && <p className="text-right text-[0.75rem] leading-tight text-[#7A726B]">Subscribe from<span className="mt-0.5 block text-[1.25rem] font-bold text-[var(--b)]">{$(sub, currency)}</span></p>}
          </div>
        )}
      </div>
    </Link>
  );
}

export function ShopClosed({ name }: { name: string }) {
  return <div className="grid min-h-[60vh] place-items-center px-6 text-center"><div><p className="text-[1.5rem] font-semibold">{name}&apos;s shop is opening soon.</p><p className="mt-2 text-[#5b5955]">Check back shortly.</p></div></div>;
}
