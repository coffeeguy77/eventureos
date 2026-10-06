import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowRight, CalendarDays, Check, Coffee, Gift, Heart, Mail, PackageOpen, Repeat, SlidersHorizontal, Star, Truck, Wallet } from "lucide-react";
import { createServiceClient } from "@/lib/integrations/runtime";
import { activeBanners, loadProducts, shopOrg } from "@/lib/shop/server";
import { dayList, frequencyLabel, prepaidDeliveries } from "@/lib/shop/core";
import { ShopFrame, serif, hand, btn, btnOutline, eyebrow } from "@/components/shop/frame";
import { $, ProductCard, ShopClosed } from "@/components/shop/bits";
import { PAGE } from "@/components/book/shell";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ org: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const org = await shopOrg((await params).org).catch(() => null);
  if (!org) return {};
  const title = `Coffee subscriptions — ${org.name}`;
  const description = `Freshly roasted coffee on your schedule${org.shop.subDiscount ? `, ${org.shop.subDiscount}% off every bag` : ""}. Pause, skip, swap or split between home and work any time.`;
  return { title: { absolute: title }, description, openGraph: { title, description, images: org.shop.subsImage ? [org.shop.subsImage] : undefined } };
}

const list = (xs: (string | number)[]) => xs.join(", ").replace(/, ([^,]+)$/, " or $1");

export default async function Subscriptions({ params }: P) {
  const org = await shopOrg((await params).org);
  if (!org) notFound();
  const db = createServiceClient();
  const products = await loadProducts(db, org.id);
  if (!org.shop.enabled || !products) return <ShopFrame org={org}><ShopClosed name={org.name} /></ShopFrame>;
  const s = org.shop;
  const top = await activeBanners(db, org, ["top"]);
  const coffee = products.filter((p) => p.kind === "coffee" && p.subscribable);
  const base = `/shop/${org.slug}`;
  const photo = s.subsImage ?? s.heroImage;
  const free = s.freeOver !== null ? `${$(s.freeOver, org.currency)}` : null;
  const prepay = s.prepaid.length > 0;
  const months = list(s.prepaid.map((x) => x.months));

  const chips = [
    free ? { icon: Truck, t: "Free shipping", d: `On orders over ${free}` } : null,
    { icon: Repeat, t: "Flexible plans", d: "Skip, pause or swap" },
    s.roastDays.length ? { icon: CalendarDays, t: "Roasted fresh", d: dayList(s.roastDays) } : null,
  ].filter((x): x is { icon: typeof Truck; t: string; d: string } => !!x);

  const cards = [
    { icon: CalendarDays, t: "Regular deliveries", d: "Fresh coffee, delivered on your schedule." },
    { icon: Coffee, t: "Choose your coffee", d: "Pick from our range or switch it up any time." },
    { icon: Repeat, t: "Flexible plans", d: "Skip, pause or swap with a few clicks." },
    free ? { icon: Truck, t: "Free shipping", d: `On every order over ${free}.` } : { icon: PackageOpen, t: "Split deliveries", d: "One subscription, two addresses — home and work." },
    prepay ? { icon: Gift, t: s.prepaid.some((x) => x.discount > 0) ? "Prepay & save" : "Prepay", d: `Pay for ${months} months up front. Perfect as a gift.` } : { icon: Wallet, t: "No lock-in", d: "Cancel online any time." },
    { icon: Heart, t: "Better coffee often", d: "A simpler way to enjoy great coffee, more regularly." },
  ];

  const checks: [string, string][] = [
    ...(s.roastDays.length ? [["Freshly roasted", ` every ${dayList(s.roastDays)}`] as [string, string]] : []),
    ["Flexible delivery", " – skip, pause or swap anytime"],
    ["Choose from", " our full range of coffees"],
    ["Split deliveries", " – home and work, one subscription"],
    ...(prepay ? [["Prepay options", ` – ${months} months`] as [string, string]] : []),
    ...(free ? [["Free shipping", ` on orders over ${free}`] as [string, string]] : []),
    ["No lock-in contracts", " – cancel online any time"],
  ];

  const steps = [
    { icon: Coffee, t: "Choose your coffee", d: "Pick your favourites — beans, bag size and grind." },
    { icon: CalendarDays, t: "Choose how often", d: "Weekly, fortnightly, monthly, or any number of weeks." },
    { icon: Truck, t: "We roast & deliver", d: [s.roastDays.length ? `Roasted ${dayList(s.roastDays)}` : "Freshly roasted", s.dispatchDays.length ? `shipped ${dayList(s.dispatchDays)}${s.carrier ? ` via ${s.carrier}` : ""}` : "sent to your door"].join(", ") + "." },
    { icon: SlidersHorizontal, t: "Manage anytime", d: "Skip, pause, swap or change your address whenever you like." },
  ];

  return (
    <ShopFrame org={org} active="subs" topBanners={top} cta={{ href: "#choose", label: "Subscribe" }}>
      {/* Hero */}
      <section className="relative isolate overflow-hidden bg-[linear-gradient(180deg,#FFF8F4,#FFFBF8)]">
        {photo && (
          <div className="absolute inset-y-0 right-0 -z-10 hidden w-[62%] lg:block">
            <img src={photo} alt="" className="h-full w-full object-cover object-[85%_60%]" />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,#FFF9F5_0%,rgba(255,249,245,.85)_12%,rgba(255,249,245,0)_34%)]" />
            <div className="absolute right-[6%] top-[9%] flex items-start gap-2 text-white [text-shadow:0_2px_12px_rgba(0,0,0,.45)]">
              <svg viewBox="0 0 60 70" className="mt-6 h-14 w-12 -scale-x-100 drop-shadow" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                <path d="M50 4C26 10 12 28 14 60" /><path d="M6 50l8 12 9-10" />
              </svg>
              <p className={`${hand} max-w-[11rem] rotate-[-4deg] text-[1.625rem] leading-[1.05]`}>Your favourite coffee, regularly delivered</p>
            </div>
          </div>
        )}
        <div className={`${PAGE} pb-10 pt-12 sm:pt-16 lg:flex lg:min-h-[560px] lg:items-center lg:py-14`}>
          <div className="max-w-[600px]">
            <p className={eyebrow}>{org.currency === "AUD" ? "Australian specialty coffee" : "Specialty coffee"}</p>
            <h1 className={`${serif} mt-4 text-[2.75rem] font-bold leading-[1.02] sm:text-[3.25rem] xl:text-[3.5rem]`}>
              Fresh coffee<br />that fits your life<span className="block text-[var(--b)]">delivered to your door</span>
            </h1>
            <p className="mt-5 max-w-[29rem] text-[1.0625rem] leading-relaxed text-[#3F3A36]">
              {s.subDiscount > 0 ? `Save ${s.subDiscount}% on every bag. ` : ""}Freshly roasted coffee on your schedule — flexible plans, easy to manage, and always a better cup at home.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#choose" className={btn}>Start your subscription<ArrowRight className="h-[18px] w-[18px]" /></a>
              <Link href={base} className={btnOutline}>Explore our coffee</Link>
            </div>
            <ul className="mt-10 flex flex-wrap gap-x-8 gap-y-4">
              {chips.map((c) => (
                <li key={c.t} className="flex items-center gap-3">
                  <c.icon className="h-7 w-7 shrink-0 text-[var(--b)]" strokeWidth={1.5} />
                  <span className="text-[0.8125rem] leading-snug"><span className="block font-semibold">{c.t}</span><span className="text-[#5E5853]">{c.d}</span></span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        {photo && <img src={photo} alt="" className="mx-4 mb-6 aspect-[4/3] w-[calc(100%-2rem)] rounded-[22px] object-cover sm:mx-8 sm:w-[calc(100%-4rem)] lg:hidden" />}
      </section>

      {/* Everything you can do */}
      <section className={`${PAGE} py-14 sm:py-16`}>
        <h2 className={`${serif} text-center text-[2.125rem] font-bold leading-tight sm:text-[2.625rem]`}>Everything you can do</h2>
        <p className="mt-2 text-center text-[1rem] text-[#5E5853]">A subscription that puts you in control.</p>
        <ul className="mt-9 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {cards.map((c) => (
            <li key={c.t} className="rounded-[16px] bg-white px-5 pb-6 pt-6 text-center shadow-[0_12px_30px_-24px_rgba(80,45,40,.4)] ring-1 ring-[#EFE6DF]">
              <c.icon className="mx-auto h-9 w-9 text-[var(--b)]" strokeWidth={1.4} />
              <p className={`${serif} mt-4 text-[1.1875rem] font-bold leading-tight`}>{c.t}</p>
              <p className="mt-2 text-[0.8125rem] leading-relaxed text-[#5E5853]">{c.d}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Built around you */}
      <section className="bg-[linear-gradient(90deg,#FFF1EC,#FFF7F4)]">
        <div className={`${PAGE} grid gap-10 py-14 sm:py-16 lg:grid-cols-[1fr_1fr] lg:items-center lg:gap-16`}>
          <div className="lg:pl-[8%]">
            <p className={eyebrow}>Built around you</p>
            <h2 className={`${serif} mt-3 text-[2.5rem] font-bold leading-[1.02] sm:text-[3.25rem]`}>Better coffee,<br />more often</h2>
            <p className="mt-5 max-w-[27rem] text-[1.0625rem] leading-relaxed text-[#3F3A36]">Not just a one-off purchase. A flexible subscription designed to bring great coffee into your routine, with less effort and more enjoyment.</p>
          </div>
          <div className="relative">
            <ul className="space-y-3.5 rounded-[18px] bg-white p-7 shadow-[0_24px_50px_-34px_rgba(80,45,40,.45)] ring-1 ring-[#F1E6E0] sm:pr-36">
              {checks.map(([b, rest]) => (
                <li key={b} className="flex items-start gap-3 text-[0.9375rem]">
                  <span className="mt-[1px] grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-[var(--b)] text-white"><Check className="h-3.5 w-3.5" strokeWidth={3.5} /></span>
                  <span><span className="font-semibold">{b}</span>{rest}</span>
                </li>
              ))}
            </ul>
            <p className={`${hand} pointer-events-none absolute right-6 top-1/2 hidden w-28 -translate-y-1/2 rotate-[-10deg] text-center text-[1.75rem] leading-[1.05] text-[#3F3A36] sm:block`}>Great coffee made easy</p>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className={`${PAGE} py-14 sm:py-16`}>
        <h2 className={`${serif} text-center text-[2.125rem] font-bold leading-tight sm:text-[2.625rem]`}>How it works</h2>
        <p className="mt-2 text-center text-[1rem] text-[#5E5853]">Get started in minutes. Great coffee, on repeat.</p>
        <ol className="mt-9 grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] xl:items-stretch">
          {steps.map((x, i) => (
            <li key={x.t} className="contents">
              {i > 0 && <span aria-hidden className="hidden items-center text-[var(--b)] xl:flex"><ArrowRight className="h-5 w-5" /></span>}
              <div className="rounded-[16px] bg-white p-6 shadow-[0_12px_30px_-24px_rgba(80,45,40,.4)] ring-1 ring-[#EFE6DF]">
                <div className="flex items-start justify-between">
                  <span className={`${serif} text-[2.5rem] font-bold leading-none text-[var(--b)]`}>{i + 1}</span>
                  <x.icon className="h-8 w-8 text-[var(--b)]" strokeWidth={1.4} />
                </div>
                <p className={`${serif} mt-4 text-[1.1875rem] font-bold`}>{x.t}</p>
                <p className="mt-1.5 text-[0.875rem] leading-relaxed text-[#5E5853]">{x.d}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Prepay */}
      {prepay && (
        <section className="bg-[linear-gradient(90deg,#FFE6E4,#FFF0EC)]">
          <div className={`${PAGE} grid gap-10 py-14 sm:py-16 lg:grid-cols-[1fr_1.05fr] lg:items-center`}>
            <div>
              <p className={eyebrow}>Prepaid subscriptions</p>
              <h2 className={`${serif} mt-3 text-[2.25rem] font-bold leading-[1.05] sm:text-[2.75rem]`}>Prepay and forget about it</h2>
              <p className="mt-4 max-w-[30rem] text-[1rem] leading-relaxed text-[#3F3A36]">Pay once for {months} months of coffee. Still fully flexible — pause or change your coffee whenever you like. A brilliant gift for the coffee lover in your life.</p>
              <a href="#choose" className={`${btn} mt-7`}>Explore prepay options<ArrowRight className="h-[18px] w-[18px]" /></a>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {s.prepaid.map((pp) => {
                const off = s.subDiscount > 0 ? `Save ${s.subDiscount}%${pp.discount > 0 ? ` + ${pp.discount}%` : ""}` : pp.discount > 0 ? `Save ${pp.discount}%` : null;
                return (
                  <div key={pp.months} className="flex flex-col rounded-[16px] bg-white p-6 shadow-[0_16px_34px_-26px_rgba(120,40,50,.45)]">
                    <p className={`${serif} text-[2.75rem] font-bold leading-none text-[var(--b)]`}>{pp.months}</p>
                    <p className={`${serif} mt-1 text-[1.25rem] font-bold`}>months</p>
                    <p className="mt-3 text-[0.8125rem] leading-relaxed text-[#5E5853]">{prepaidDeliveries(pp.months, { unit: "week", count: 2 })} deliveries {frequencyLabel("week", 2).toLowerCase()}, or {prepaidDeliveries(pp.months, { unit: "month", count: 1 })} monthly</p>
                    {off && <p className="mt-auto pt-5"><span className="inline-flex rounded-lg bg-[color-mix(in_srgb,var(--b)_14%,white)] px-3.5 py-1.5 text-[0.875rem] font-semibold text-[var(--b)]">{off}</span></p>}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Choose your coffee */}
      <section id="choose" className={`${PAGE} scroll-mt-28 py-14 sm:py-16`}>
        <div className="relative">
          <h2 className={`${serif} text-center text-[2.125rem] font-bold leading-tight sm:text-[2.625rem]`}>Choose your coffee</h2>
          <p className="mx-auto mt-2 max-w-xl text-center text-[1rem] text-[#5E5853]">Pick a coffee, choose &ldquo;Subscribe&rdquo;{prepay ? " or “Prepaid”" : ""} and how often. You can add more coffees, or a second address, any time.</p>
          <Link href={base} className="mx-auto mt-5 flex w-fit items-center gap-1.5 rounded-full border-[1.5px] border-[var(--b)] px-5 py-2 text-[0.875rem] font-semibold text-[var(--b)] transition hover:bg-[color-mix(in_srgb,var(--b)_8%,white)] lg:absolute lg:right-0 lg:top-2 lg:mt-0">View all coffee<ArrowRight className="h-4 w-4" /></Link>
        </div>
        <div className="mt-9 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{coffee.map((p) => <ProductCard key={p.id} p={p} slug={org.slug} s={s} currency={org.currency} prices="split" />)}</div>
      </section>

      {/* Give a subscription */}
      <section id="gift" className="scroll-mt-28 bg-[linear-gradient(100deg,#FFE9E8,#FFF4F1_55%,#FFEDEB)]">
        <div className={`${PAGE} grid gap-10 py-12 sm:py-14 lg:grid-cols-[1.1fr_1fr] lg:items-center`}>
          <div>
            <p className={eyebrow}>The perfect gift</p>
            {prepay ? (
              <>
                <h2 className={`${serif} mt-3 text-[2.25rem] font-bold leading-[1.05] sm:text-[2.75rem]`}>Give a subscription</h2>
                <p className="mt-3 max-w-[32rem] text-[1rem] leading-relaxed text-[#3F3A36]">Great coffee makes a thoughtful gift. Choose a coffee, pick &ldquo;Prepaid&rdquo; at checkout for {months} months, and enter their delivery address.</p>
                <a href="#choose" className={`${btn} mt-6`}>Give the gift of great coffee<ArrowRight className="h-[18px] w-[18px]" /></a>
              </>
            ) : (
              <>
                <h2 className={`${serif} mt-3 text-[2.25rem] font-bold leading-[1.05] sm:text-[2.75rem]`}>Give the gift of coffee</h2>
                <p className="mt-3 max-w-[32rem] text-[1rem] leading-relaxed text-[#3F3A36]">A coffee gift card, emailed instantly or on the day you choose, with your message on the back.</p>
                <Link href={`${base}/gift-card`} className={`${btn} mt-6`}>Send a gift card<ArrowRight className="h-[18px] w-[18px]" /></Link>
              </>
            )}
          </div>
          <ul className="grid grid-cols-3 divide-x divide-[#EBD3CF]">
            {[
              { icon: Gift, t: "A unique and thoughtful gift" },
              { icon: Star, t: "Your choice of coffee, size and grind" },
              { icon: Mail, t: "Delivered straight to their door" },
            ].map((x) => (
              <li key={x.t} className="px-3 text-center">
                <x.icon className="mx-auto h-8 w-8 text-[var(--b)]" strokeWidth={1.4} />
                <p className="mx-auto mt-3 max-w-[9rem] text-[0.875rem] leading-snug text-[#3F3A36]">{x.t}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </ShopFrame>
  );
}
