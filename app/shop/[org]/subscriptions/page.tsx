import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowRight, Check } from "lucide-react";
import { createServiceClient } from "@/lib/integrations/runtime";
import { activeBanners, loadProducts, shopOrg } from "@/lib/shop/server";
import { frequencyLabel, prepaidDeliveries } from "@/lib/shop/core";
import { ShopFrame, serif, hand } from "@/components/shop/frame";
import { FLEX, ProductCard, ShopClosed, scheduleChips } from "@/components/shop/bits";
import { PAGE } from "@/components/book/shell";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ org: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const org = await shopOrg((await params).org).catch(() => null);
  if (!org) return {};
  const title = `Coffee subscriptions — ${org.name}`;
  const description = `Freshly roasted coffee on your schedule${org.shop.subDiscount ? `, ${org.shop.subDiscount}% off every bag` : ""}. Pause, skip, swap or split between home and work any time.`;
  return { title: { absolute: title }, description, openGraph: { title, description } };
}

export default async function Subscriptions({ params }: P) {
  const org = await shopOrg((await params).org);
  if (!org) notFound();
  const db = createServiceClient();
  const products = await loadProducts(db, org.id);
  if (!org.shop.enabled || !products) return <ShopFrame org={org}><ShopClosed name={org.name} /></ShopFrame>;
  const s = org.shop;
  const top = await activeBanners(db, org, ["top"]);
  const coffee = products.filter((p) => p.kind === "coffee" && p.subscribable);
  const chips = scheduleChips(s);
  const base = `/shop/${org.slug}`;
  const compare: (readonly [string, boolean, boolean])[] = [
    ["Choose any frequency — even every 5 weeks", true, false],
    ["Pause until a date, or until you're back", true, false],
    ["Skip a delivery or send the next one sooner", true, true],
    ["Swap coffee, size or grind before any delivery", true, false],
    ["Fine-tune your grind finer or coarser", true, false],
    ["Split one subscription between home and work", true, false],
    ["Prepay 3, 6 or 12 months (perfect as a gift)", s.prepaid.length > 0, false],
    ["Change your delivery address yourself", true, true],
    ["Cancel online, any time — no lock-in", true, false],
  ];
  const steps = [
    { t: "Pick your coffee", d: "Choose your beans, bag size and grind — or mix a couple of coffees." },
    { t: "Choose how often", d: "Weekly, fortnightly, monthly, or any number of weeks that suits you." },
    { t: "We roast & ship", d: chips.length ? chips.map((c) => c.text).join(" · ") + "." : "Freshly roasted and sent to your door." },
    { t: "Change anything, any time", d: "Your account lets you pause, skip, swap and split in a couple of taps." },
  ];

  return (
    <ShopFrame org={org} active="subs" topBanners={top}>
      <section className="relative isolate overflow-hidden bg-[#1d1915] text-[#FFFDFC]">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_15%_10%,color-mix(in_srgb,var(--b)_30%,transparent),transparent_50%),radial-gradient(ellipse_at_90%_90%,rgba(255,255,255,.06),transparent_50%)]" />
        <div className={`${PAGE} py-16 text-center sm:py-24`}>
          <p className={`${hand} text-[1.875rem] leading-none text-[var(--b)]`}>The most flexible coffee subscription</p>
          <h1 className={`${serif} mx-auto mt-4 max-w-4xl text-balance text-[3rem] font-semibold leading-[1.02] tracking-[-0.02em] sm:text-[4.25rem]`}>Fresh coffee that fits your life — not the other way round</h1>
          <p className="mx-auto mt-6 max-w-2xl text-[1.125rem] leading-relaxed text-white/80 sm:text-[1.25rem]">{s.subDiscount > 0 ? `Save ${s.subDiscount}% on every bag. ` : ""}Pause it, skip it, swap it, split it between home and work, or prepay a whole year. You&apos;re in control from your phone.</p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <a href="#choose" className="shop-btn inline-flex h-14 items-center gap-2 rounded-2xl bg-[var(--b)] px-7 text-[1.0313rem] font-semibold text-[var(--on-b)] shadow-[0_14px_30px_-14px_var(--b)]">Choose your coffee<ArrowRight className="h-5 w-5" /></a>
            <Link href={`${base}/account`} className="shop-btn inline-flex h-14 items-center rounded-2xl px-7 text-[1.0313rem] font-semibold ring-1 ring-white/60 hover:bg-white hover:text-[#171714]">Manage my subscription</Link>
          </div>
          {chips.length > 0 && <ul className="mt-9 flex flex-wrap justify-center gap-2.5">{chips.map((c) => <li key={c.text} className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-[0.9375rem] ring-1 ring-white/15"><c.icon className="h-4 w-4 text-[var(--b)]" />{c.text}</li>)}</ul>}
        </div>
      </section>

      <section className={`${PAGE} py-16 sm:py-20`}>
        <h2 className={`${serif} text-center text-[2.25rem] font-semibold sm:text-[2.875rem]`}>Everything you can do</h2>
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FLEX.map((f) => (
            <li key={f.t} className="rounded-[22px] bg-[#FFFDFC] p-6 ring-1 ring-[#E6DCD1]">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[color-mix(in_srgb,var(--b)_14%,white)] text-[var(--b)]"><f.icon className="h-6 w-6" strokeWidth={1.8} /></span>
              <p className="mt-4 text-[1.0625rem] font-semibold">{f.t}</p>
              <p className="mt-1 text-[0.9375rem] leading-relaxed text-[#5b5955]">{f.d}</p>
            </li>
          ))}
          <li className="rounded-[22px] bg-[var(--b)] p-6 text-[var(--on-b)]">
            <p className={`${serif} text-[1.5rem] font-semibold leading-tight`}>Split subscriptions</p>
            <p className="mt-2 text-[0.9688rem] leading-relaxed opacity-90">One subscription, two parcels: a kilo for the office and 500g for home, each with its own grind. One payment, one place to manage it.</p>
          </li>
        </ul>
      </section>

      <section className="bg-[#F1EAE2] py-16 sm:py-20">
        <div className={`${PAGE} grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center`}>
          <div>
            <h2 className={`${serif} text-[2.25rem] font-semibold leading-tight sm:text-[2.75rem]`}>Built around you</h2>
            <p className="mt-4 text-[1.0625rem] leading-relaxed text-[#5b5955]">No lock-in and no phone calls to change things. Everything below is a couple of taps in your account.</p>
          </div>
          <ul className="grid gap-2.5 rounded-[24px] bg-[#FFFDFC] p-6 ring-1 ring-[#E6DCD1] sm:grid-cols-2 sm:p-7">
            {compare.filter(([, us]) => us).map(([t]) => <li key={t} className="flex items-start gap-2.5 text-[0.9688rem]"><Check className="mt-0.5 h-5 w-5 shrink-0 text-[var(--b)]" strokeWidth={3} />{t}</li>)}
          </ul>
        </div>
      </section>

      <section className={`${PAGE} py-16 sm:py-20`}>
        <h2 className={`${serif} text-[2.25rem] font-semibold sm:text-[2.875rem]`}>How it works</h2>
        <ol className="mt-8 grid gap-4 md:grid-cols-4">
          {steps.map((x, i) => (
            <li key={x.t} className="rounded-[22px] bg-[#FFFDFC] p-6 ring-1 ring-[#E6DCD1]">
              <span className={`${serif} text-[2.5rem] font-semibold leading-none text-[var(--b)]`}>{i + 1}</span>
              <p className="mt-3 text-[1.0625rem] font-semibold">{x.t}</p>
              <p className="mt-1 text-[0.9375rem] leading-relaxed text-[#5b5955]">{x.d}</p>
            </li>
          ))}
        </ol>
      </section>

      {s.prepaid.length > 0 && (
        <section className="bg-[#1d1915] py-16 text-[#FFFDFC] sm:py-20">
          <div className={PAGE}>
            <h2 className={`${serif} text-[2.25rem] font-semibold sm:text-[2.875rem]`}>Prepay and forget about it</h2>
            <p className="mt-3 max-w-2xl text-[1.0625rem] text-white/80">Pay once for {s.prepaid.map((x) => x.months).join(", ").replace(/, (\d+)$/, " or $1")} months of coffee. Still fully flexible — pause or change your coffee whenever you like. A brilliant gift for the coffee lover in your life.</p>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {s.prepaid.map((pp) => (
                <div key={pp.months} className="rounded-[22px] bg-white/[0.06] p-6 ring-1 ring-white/10">
                  <p className={`${serif} text-[2.75rem] font-semibold leading-none`}>{pp.months}<span className="text-[1.25rem] font-normal text-white/70"> months</span></p>
                  <p className="mt-3 text-white/80">{prepaidDeliveries(pp.months, { unit: "week", count: 2 })} deliveries {frequencyLabel("week", 2).toLowerCase()}, or {prepaidDeliveries(pp.months, { unit: "month", count: 1 })} monthly</p>
                  {(s.subDiscount > 0 || pp.discount > 0) && <p className="mt-2 font-semibold text-[var(--b)]">Save {s.subDiscount}%{pp.discount > 0 ? ` + an extra ${pp.discount}%` : ""}</p>}
                </div>
              ))}
            </div>
            <p className="mt-5 text-[0.9375rem] text-white/70">Choose &ldquo;Prepaid&rdquo; at checkout.</p>
          </div>
        </section>
      )}

      <section id="choose" className={`${PAGE} scroll-mt-24 py-16 sm:py-20`}>
        <h2 className={`${serif} text-[2.25rem] font-semibold sm:text-[2.875rem]`}>Choose your coffee</h2>
        <p className="mt-2 text-[1.0625rem] text-[#5b5955]">Pick a coffee, choose &ldquo;Subscribe&rdquo; and how often. You can add more coffees, or a second address, any time.</p>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{coffee.map((p) => <ProductCard key={p.id} p={p} slug={org.slug} s={s} currency={org.currency} />)}</div>
      </section>
    </ShopFrame>
  );
}
