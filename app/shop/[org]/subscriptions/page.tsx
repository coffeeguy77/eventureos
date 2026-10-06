import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowRight, Bean, CalendarDays, Check, Gift, Heart, Mail, PackageOpen, Repeat, SlidersHorizontal, Truck, Wallet } from "lucide-react";
import { createServiceClient } from "@/lib/integrations/runtime";
import { activeBanners, loadProducts, shopOrg } from "@/lib/shop/server";
import { dayList, frequencyLabel, prepaidDeliveries } from "@/lib/shop/core";
import { ShopFrame, serif, hand, btn, eyebrow, WRAP } from "@/components/shop/frame";
import { $, ProductCard, ShopClosed } from "@/components/shop/bits";

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
  const photo = s.subsHero ?? s.subsImage ?? s.heroImage;
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
    { icon: Bean, t: "Choose your coffee", d: "Pick from our range or switch it up anytime." },
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
    { icon: Bean, t: "Choose your coffee", d: "Pick your favourites or explore something new." },
    { icon: CalendarDays, t: "Choose how often", d: "Weekly, fortnightly, monthly, or any number of weeks." },
    { icon: Truck, t: "We roast & deliver", d: [s.roastDays.length ? `Roasted ${dayList(s.roastDays)}` : "Freshly roasted", s.dispatchDays.length ? `shipped ${dayList(s.dispatchDays)}${s.carrier ? ` via ${s.carrier}` : ""}` : "sent to your door"].join(", ") + "." },
    { icon: SlidersHorizontal, t: "Manage anytime", d: "Skip, pause, swap or change your address whenever you like." },
  ];

  const card = "rounded-[16px] bg-white shadow-[0_2px_4px_rgba(60,40,30,.03),0_18px_40px_-30px_rgba(80,45,40,.4)]";
  const h2 = `${serif} font-[620] tracking-[-0.025em]`;

  return (
    <ShopFrame org={org} active="subs" topBanners={top} cta={{ href: "#choose", label: "Subscribe" }}>
      {/* Hero: the delivery box on the bench, words on the left */}
      <section className="relative isolate overflow-hidden bg-[#FDF7F2] lg:h-[624px]">
        {photo && (
          <div className="absolute inset-0 -z-10 hidden lg:block">
            <img src={photo} alt="" className="h-full w-full object-cover object-right" />
            {!s.subsHero && <div className="absolute inset-0 bg-[linear-gradient(90deg,#FDF7F2_0%,#FDF7F2_34%,rgba(253,247,242,.7)_44%,rgba(253,247,242,0)_60%)]" />}
            <div className="absolute right-[2.4%] top-[3%] flex items-start gap-1 text-[#2A2522]">
              <svg viewBox="0 0 60 70" className="mt-7 h-[58px] w-[50px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M54 5C30 9 16 26 16 60" /><path d="M8 50l8 12 9-10" />
              </svg>
              <p className={`${hand} max-w-[10.5rem] rotate-[-8deg] text-[1.75rem] leading-[1.02]`}>Your favourite coffee, regularly delivered</p>
            </div>
          </div>
        )}
        <div className={`${WRAP} lg:flex lg:h-full lg:items-start`}>
          <div className="pb-8 pt-12 lg:pt-[56px]">
            <p className={`${eyebrow} text-[0.9375rem] font-semibold tracking-[0.13em]`}>{org.currency === "AUD" ? "Australian specialty coffee" : "Specialty coffee"}</p>
            <h1 className={`${h2} mt-[10px] text-[2.75rem] leading-[0.98] sm:text-[3.5rem] lg:text-[4rem] lg:leading-[1.02]`}>
              Fresh coffee<br />that fits your life<span className="block text-[var(--pk)]">delivered to your door</span>
            </h1>
            <p className="mt-5 max-w-[520px] text-[1.0625rem] leading-[1.55] text-[#2A2522] lg:text-[1.1563rem]">
              {s.subDiscount > 0 ? `Save ${s.subDiscount}% on every bag. ` : ""}Freshly roasted coffee on your schedule — flexible plans, easy to manage, and always a better cup at home.
            </p>
            <div className="mt-8 flex flex-wrap gap-3 lg:mt-[38px]">
              <a href="#choose" className={`${btn} h-[58px] px-8`}>Start your subscription<ArrowRight className="h-[18px] w-[18px]" strokeWidth={2.2} /></a>
              <Link href={base} className="shop-btn inline-flex h-[58px] items-center justify-center rounded-full border-[1.5px] border-[color-mix(in_srgb,var(--pk)_40%,white)] bg-white px-8 text-[1rem] font-semibold text-[#1F1B19] hover:border-[var(--pk)]">Explore our coffee</Link>
            </div>
            <ul className="mt-9 flex flex-wrap gap-x-[50px] gap-y-4">
              {chips.map((c) => (
                <li key={c.t} className="flex items-center gap-3.5">
                  <c.icon className="h-[38px] w-[38px] shrink-0 text-[var(--pk)]" strokeWidth={1.3} />
                  <span className="text-[0.9375rem] leading-snug"><span className="block font-semibold">{c.t}</span><span className="text-[#4E4844]">{c.d}</span></span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        {photo && <img src={photo} alt="" className="mx-4 mb-6 aspect-[4/3] w-[calc(100%-2rem)] rounded-[20px] object-cover object-right sm:mx-8 sm:w-[calc(100%-4rem)] lg:hidden" />}
      </section>

      {/* Everything you can do */}
      <section className="mx-auto w-full max-w-[1440px] px-5 pb-12 pt-12 sm:px-8 lg:px-10 lg:pt-[44px]">
        <h2 className={`${h2} text-center text-[2.5rem] leading-tight sm:text-[3.25rem]`}>Everything you can do</h2>
        <p className="mt-1 text-center text-[1.0625rem] text-[#3A3431]">A subscription that puts you in control.</p>
        <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6 xl:gap-[13px]">
          {cards.map((c) => (
            <li key={c.t} className={`${card} min-h-[291px] px-[24px] pb-6 pt-[26px]`}>
              <c.icon className="mx-auto h-[50px] w-[50px] text-[var(--pk)]" strokeWidth={1.25} />
              <p className={`${serif} mt-[18px] text-center text-[1.5rem] font-semibold leading-[1.15]`}>{c.t}</p>
              <p className="mt-3 text-[1rem] leading-[1.5] text-[#3A3431]">{c.d}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Built around you */}
      <section className="relative overflow-hidden bg-[linear-gradient(90deg,#F7EBE3,#FBF2EC_55%,#F9EEE8)]">
        <img src="/media/beanculture/subs-beans-left.jpg" alt="" aria-hidden className="pointer-events-none absolute bottom-0 left-0 hidden h-full w-auto mix-blend-multiply lg:block" />
        <div className={`${WRAP} grid gap-10 py-12 lg:h-[409px] lg:grid-cols-[1fr_646px] lg:items-center lg:gap-10 lg:py-0`}>
          <div className="lg:pl-[76px]">
            <p className={`${eyebrow} text-[0.875rem] font-semibold tracking-[0.2em]`}>Built around you</p>
            <h2 className={`${h2} mt-[10px] text-[3rem] leading-[1.02] sm:text-[4.375rem] sm:leading-[1.1]`}>Better coffee,<br />more often</h2>
            <p className="mt-3 max-w-[440px] text-[1.1563rem] leading-[1.6] text-[#2A2522]">Not just a one-off purchase. A flexible subscription designed to bring incredible coffee into your routine, with less effort and more enjoyment.</p>
          </div>
          <div className="relative">
            <ul className={`${card} min-h-[361px] space-y-[16px] px-[40px] py-[32px] sm:pr-[150px]`}>
              {checks.map(([b, rest]) => (
                <li key={b} className="flex items-center gap-[16px] text-[0.9688rem]">
                  <span className="grid h-[32px] w-[32px] shrink-0 place-items-center rounded-full bg-[var(--pk)] text-white"><Check className="h-[18px] w-[18px]" strokeWidth={3.2} /></span>
                  <span><span className="font-semibold">{b}</span>{rest}</span>
                </li>
              ))}
            </ul>
            <div className="pointer-events-none absolute bottom-[40px] right-[22px] hidden w-[128px] rotate-[-14deg] text-center text-[#1F1B19] sm:block">
              <p className={`${hand} text-[1.75rem] leading-[1.05]`}>Great coffee made easy</p>
              <svg viewBox="0 0 120 14" className="mx-auto mt-1 h-3 w-24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M4 10c30-6 70-9 112-6" /></svg>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto w-full max-w-[1440px] px-5 py-12 sm:px-8 lg:px-10 lg:pt-[50px]">
        <h2 className={`${h2} text-center text-[2.5rem] leading-tight sm:text-[3.25rem]`}>How it works</h2>
        <p className="mt-1 text-center text-[1.0625rem] text-[#3A3431]">Get started in minutes. Great coffee, on repeat.</p>
        <ol className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-[1fr_38px_1fr_38px_1fr_38px_1fr] xl:gap-0">
          {steps.map((x, i) => (
            <li key={x.t} className="contents">
              {i > 0 && <span aria-hidden className="hidden items-center justify-center text-[var(--pk)] xl:flex"><ArrowRight className="h-5 w-5" strokeWidth={1.8} /></span>}
              <div className={`${card} min-h-[237px] px-[34px] pb-6 pt-[26px]`}>
                <div className="flex items-start justify-between">
                  <span className={`${serif} text-[3.25rem] font-semibold leading-none text-[var(--pk)]`}>{i + 1}</span>
                  <x.icon className="h-[46px] w-[46px] text-[var(--pk)]" strokeWidth={1.25} />
                </div>
                <p className={`${serif} mt-5 text-[1.5rem] font-semibold`}>{x.t}</p>
                <p className="mt-2 text-[1rem] leading-[1.5] text-[#3A3431]">{x.d}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Prepay */}
      {prepay && (
        <section className="relative overflow-hidden bg-[linear-gradient(90deg,#FCE3E5,#FDEBEC_50%,#FCE6E6)]">
          <img src="/media/beanculture/subs-beans-mid.jpg" alt="" aria-hidden className="pointer-events-none absolute bottom-0 left-[42%] hidden h-[145px] w-auto mix-blend-multiply xl:block" />
          <div className={`${WRAP} relative grid gap-10 py-12 lg:h-[345px] lg:grid-cols-[1fr_600px] lg:items-center lg:py-0`}>
            <div>
              <p className={`${eyebrow} text-[0.875rem] font-semibold tracking-[0.2em]`}>Prepaid subscriptions</p>
              <h2 className={`${h2} mt-[10px] text-[2.5rem] leading-[1.05] sm:text-[3.25rem] xl:whitespace-nowrap`}>Prepay and forget about it</h2>
              <p className="mt-3 max-w-[560px] text-[1.0938rem] leading-[1.6] text-[#2A2522]">Pay once for {months} months of coffee and enjoy uninterrupted deliveries. Still fully flexible — pause or change your coffee whenever you like.</p>
              <a href="#choose" className={`${btn} mt-7 h-[58px] px-8`}>Explore prepay options<ArrowRight className="h-[18px] w-[18px]" strokeWidth={2.2} /></a>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {s.prepaid.map((pp, i) => {
                const off = s.subDiscount > 0 ? `Save ${s.subDiscount + (pp.discount > 0 ? pp.discount : 0)}%` : pp.discount > 0 ? `Save ${pp.discount}%` : null;
                return (
                  <div key={pp.months} className={`${card} flex min-h-[262px] flex-col px-[34px] pb-6 pt-[30px]`}>
                    <p className={`${serif} text-[3.5rem] font-semibold leading-none ${i === 0 ? "text-[var(--pk)]" : ""}`}>{pp.months}</p>
                    <p className={`${serif} mt-1 text-[1.375rem] font-semibold`}>months</p>
                    <p className="mt-4 text-[0.9375rem] leading-[1.5] text-[#3A3431]">{prepaidDeliveries(pp.months, { unit: "week", count: 2 })} deliveries {frequencyLabel("week", 2).toLowerCase()}, or {prepaidDeliveries(pp.months, { unit: "month", count: 1 })} monthly.</p>
                    {off && <p className="mt-auto pt-5"><span className="inline-flex rounded-[10px] bg-[#FFE0EC] px-5 py-2.5 text-[1rem] font-semibold text-[var(--pk)]">{off}</span></p>}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Choose your coffee */}
      <section id="choose" className="mx-auto w-full max-w-[1440px] scroll-mt-28 px-5 py-12 sm:px-8 lg:px-[50px] lg:pt-[44px]">
        <div className="relative">
          <h2 className={`${h2} text-center text-[2.5rem] leading-tight sm:text-[3.25rem]`}>Choose your coffee</h2>
          <p className="mx-auto mt-1 max-w-[52rem] text-center text-[1.0625rem] text-[#3A3431]">Explore our range of specialty coffees. Pick one, choose &ldquo;Subscribe&rdquo;{prepay ? " or \u201cPrepaid\u201d" : ""} and how often.</p>
          <Link href={base} className="mx-auto mt-5 flex h-[56px] w-fit items-center gap-2 rounded-full border-[1.5px] border-[color-mix(in_srgb,var(--pk)_55%,white)] bg-white px-7 text-[1rem] font-semibold text-[var(--pk)] transition hover:border-[var(--pk)] lg:absolute lg:right-0 lg:top-[-8px] lg:mt-0">View all coffee<ArrowRight className="h-4 w-4" /></Link>
        </div>
        <div className="mt-9 grid gap-[13px] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{coffee.map((p) => <ProductCard key={p.id} p={p} slug={org.slug} s={s} currency={org.currency} prices="split" />)}</div>
      </section>

      {/* Give a subscription */}
      <section id="gift" className="relative scroll-mt-28 overflow-hidden bg-[#FDEBE8] bg-cover bg-center" style={{ backgroundImage: "url(/media/beanculture/subs-gift-band.jpg)" }}>
        <div className={`${WRAP} relative grid gap-10 py-12 lg:h-[264px] lg:grid-cols-[1fr_520px] lg:items-center lg:py-0`}>
          <div>
            <p className={`${eyebrow} text-[0.875rem] font-semibold tracking-[0.2em]`}>The perfect gift</p>
            {prepay ? (
              <>
                <h2 className={`${h2} mt-[8px] text-[2.5rem] leading-[1.05] sm:text-[3.25rem]`}>Give a subscription</h2>
                <p className="mt-2 max-w-[600px] text-[1.0938rem] leading-[1.55] text-[#2A2522]">Exceptional coffee makes a thoughtful gift. Choose a coffee, pick &ldquo;Prepaid&rdquo; at checkout for {months} months, and enter their delivery address.</p>
                <a href="#choose" className={`${btn} mt-5 h-[57px] px-8`}>Give the gift of great coffee<ArrowRight className="h-[18px] w-[18px]" strokeWidth={2.2} /></a>
              </>
            ) : (
              <>
                <h2 className={`${h2} mt-[8px] text-[2.5rem] leading-[1.05] sm:text-[3.25rem]`}>Give the gift of coffee</h2>
                <p className="mt-2 max-w-[600px] text-[1.0938rem] leading-[1.55] text-[#2A2522]">A coffee gift card, emailed instantly or on the day you choose, with your message on the back.</p>
                <Link href={`${base}/gift-card`} className={`${btn} mt-5 h-[57px]`}>Send a gift card<ArrowRight className="h-[18px] w-[18px]" strokeWidth={2.2} /></Link>
              </>
            )}
          </div>
          <ul className="grid grid-cols-3 divide-x divide-[#E9CFCB]">
            {[
              { icon: Gift, t: "A unique and thoughtful gift" },
              { icon: Heart, t: "Your choice of coffee, size and grind" },
              { icon: Mail, t: "Delivered straight to their door" },
            ].map((x) => (
              <li key={x.t} className="px-4 text-center">
                <x.icon className="mx-auto h-[34px] w-[34px] text-[var(--pk)]" strokeWidth={1.3} />
                <p className="mx-auto mt-3 max-w-[9.5rem] text-[1.0313rem] leading-[1.4] text-[#2A2522]">{x.t}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </ShopFrame>
  );
}
