import Link from "next/link";
import { CalendarClock, Flame, PackageCheck, Pause, Repeat, SkipForward, Shuffle, Split, Truck, Wallet } from "lucide-react";
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
  { icon: Repeat, t: "Any frequency", d: "Weekly, fortnightly, every 5 weeks — or set your own." },
  { icon: Pause, t: "Pause anytime", d: "Away for a while? Pause until a date, or until you're back." },
  { icon: SkipForward, t: "Skip or send sooner", d: "Running low or still stocked? Move the next delivery." },
  { icon: Shuffle, t: "Swap your coffee", d: "Change beans, size, grind or quantity before any delivery." },
  { icon: Split, t: "Split deliveries", d: "One subscription, two addresses — home and work." },
  { icon: Wallet, t: "Prepay & relax", d: "Pay for 3, 6 or 12 months up front. A great gift too." },
  { icon: CalendarClock, t: "Change address", d: "Moving or on holiday? Update where it goes in seconds." },
];

export function ProductCard({ p, slug, s, currency }: { p: Product; slug: string; s: ShopSettings; currency: string }) {
  const from = priceFrom(p);
  const sub = p.subscribable && p.kind === "coffee" && s.subDiscount > 0 ? unitPrice(from, "subscription", s) : null;
  return (
    <Link href={`/shop/${slug}/p/${p.slug}`} className="shop-card group flex h-full flex-col overflow-hidden rounded-[26px] border border-[#E9DFD5] bg-[#FFFDFC]">
      <div className="relative aspect-[4/3.4] overflow-hidden bg-[radial-gradient(ellipse_at_50%_35%,#FFFFFF,color-mix(in_srgb,var(--b)_9%,#F3ECE4))]">
        {p.image_url
          ? <img src={p.image_url} alt="" className="shop-zoom absolute inset-0 h-full w-full object-contain p-6" loading="lazy" />
          : <span className={`${serif} absolute inset-0 grid place-items-center text-[3rem] text-[var(--b)]`}>{p.name[0]}</span>}
        {p.featured && <span className="absolute left-4 top-4 rounded-full bg-[#171714] px-3 py-1 text-[0.75rem] font-semibold text-[#FAF7F3]">Featured</span>}
        {sub !== null && <span className="absolute right-4 top-4 rounded-full bg-[var(--b)] px-3 py-1 text-[0.75rem] font-bold text-[var(--on-b)]">Save {s.subDiscount}% on subscription</span>}
      </div>
      <div className="flex flex-1 flex-col p-6">
        {p.category && <p className="text-[0.75rem] font-semibold uppercase tracking-[0.16em] text-[#8a817a]">{p.category}</p>}
        <h3 className={`${serif} mt-1 text-[1.5rem] font-semibold leading-tight text-[#171714]`}>{p.name}</h3>
        {p.tasting_notes && <p className="mt-2 text-[0.9688rem] leading-relaxed text-[#5b5955]">{p.tasting_notes}</p>}
        {p.best_for && <p className="mt-3 inline-flex w-fit rounded-full bg-[#F1EAE2] px-3 py-1 text-[0.8125rem] font-medium text-[#4a4743]">Best for {p.best_for.toLowerCase()}</p>}
        <div className="mt-auto flex items-end justify-between gap-3 pt-5">
          <p className="text-[0.9375rem] text-[#5b5955]">From <span className="text-[1.375rem] font-bold text-[#171714]">{$(from, currency)}</span></p>
          {sub !== null && <p className="text-right text-[0.8125rem] leading-tight text-[#5b5955]">Subscribers<br /><span className="text-[1rem] font-bold text-[var(--b)]">{$(sub, currency)}</span></p>}
        </div>
      </div>
    </Link>
  );
}

export function ShopClosed({ name }: { name: string }) {
  return <div className="grid min-h-[60vh] place-items-center px-6 text-center"><div><p className="text-[1.5rem] font-semibold">{name}&apos;s shop is opening soon.</p><p className="mt-2 text-[#5b5955]">Check back shortly.</p></div></div>;
}
