import Link from "next/link";
import { ContactForm } from "@/components/events/contact-form";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowRight, CalendarDays, Leaf, Package, Truck } from "lucide-react";
import { createServiceClient } from "@/lib/integrations/runtime";
import { activeBanners, loadProducts, shopOrg } from "@/lib/shop/server";
import { dayList } from "@/lib/shop/core";
import { ShopFrame, serif, btn, btnOutline, eyebrow, WRAP } from "@/components/shop/frame";
import { FLEX, GIFT_TILE, ProductCard, ShopClosed } from "@/components/shop/bits";
import { EventLink } from "@/components/shop/event-link";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ org: string }>; searchParams: Promise<Record<string, string | undefined>> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const org = await shopOrg((await params).org).catch(() => null);
  if (!org) return {};
  const title = `${org.shop.title.replace(/\s*\|\s*/g, " ").replace(/\.$/, "")} — ${org.name}`;
  return { title: { absolute: title }, description: org.shop.tagline, openGraph: { title, description: org.shop.tagline, images: org.shop.heroImage ? [org.shop.heroImage] : undefined } };
}

/*
 * Laid out to the "Freshly roasted coffee" design at 1440 wide: 80px gutters, hero 805 tall with the words 120px in,
 * four product cards, the subscription tiles beside their heading, then the gift-subscription panel.
 */
export default async function Storefront({ params, searchParams }: P) {
  const { org: slug } = await params;
  const sp = await searchParams;
  const org = await shopOrg(slug);
  if (!org) notFound();
  const db = createServiceClient();
  const products = await loadProducts(db, org.id);
  if (!org.shop.enabled || !products) return <ShopFrame org={org}><ShopClosed name={org.name} /></ShopFrame>;
  const banners = await activeBanners(db, org, ["shop", "top"]);
  const top = banners.filter((b) => b.placement === "top");
  const promo = banners.filter((b) => b.placement !== "top");
  const coffee = products.filter((p) => p.kind === "coffee");
  const other = products.filter((p) => p.kind === "other");
  const s = org.shop;
  const base = `/shop/${org.slug}`;
  const subs = coffee.some((p) => p.subscribable);
  const tiles = s.prepaid.length ? [...FLEX, GIFT_TILE] : FLEX;

  // The four facts under the hero — only the ones the business has set
  const facts = [
    s.roastDays.length ? { icon: CalendarDays, text: <>Roasted<br />{dayList(s.roastDays)}</> } : null,
    s.dispatchDays.length ? { icon: Truck, text: <>Ships {dayList(s.dispatchDays)}{s.carrier ? <><br />via {s.carrier}</> : null}</> } : null,
    { icon: Package, text: <>Fresh to<br />your door</> },
    s.roastedIn ? { icon: Leaf, text: <>Locally roasted<br />in {s.roastedIn}</> } : null,
  ].filter((x): x is { icon: typeof Truck; text: React.JSX.Element } => !!x);

  return (
    <ShopFrame org={org} active="shop" topBanners={top}>
      <EventLink slug={org.slug} token={sp.event ?? null} code={sp.code ?? null} />

      {/* Hero: a bright roastery scene, the words over its washed-out left side */}
      <section className="relative isolate overflow-hidden lg:flex lg:min-h-[min(805px,calc(100vw*805/1440))] lg:items-center">
        {s.heroImage && (
          <>
            <img src={s.heroImage} alt="" className="absolute inset-0 -z-10 hidden h-full w-full object-cover object-[60%_50%] lg:block" />
            <div className="absolute inset-0 -z-10 hidden bg-[linear-gradient(90deg,rgba(252,250,247,.86)_0%,rgba(252,250,247,.62)_28%,rgba(252,250,247,0)_48%)] lg:block" />
          </>
        )}
        <div className={WRAP}>
          <div className="pb-10 pt-12 lg:py-[clamp(3rem,6vw,5.5rem)] lg:pl-10">
            <p className={`${eyebrow} text-[0.9375rem] tracking-[0.1em] lg:text-[1.0625rem]`}>Fresh from our roaster</p>
            <h1 className={`${serif} mt-3 max-w-[640px] text-[2.875rem] font-[620] leading-[0.95] tracking-[-0.025em] sm:text-[4rem] lg:mt-[14px] lg:text-[clamp(3.5rem,5.3vw,4.75rem)] lg:leading-[0.9]`}>{s.title.split(/\s*\|\s*/).map((l, i) => <span key={i} className="block">{l}</span>)}</h1>
            {(s.subDiscount > 0 && subs) || s.tagline ? (
              <p className="mt-6 max-w-[490px] text-[1.0625rem] leading-[1.62] text-[#2A2522] lg:mt-[26px] lg:text-[1.1563rem]">
                {s.subDiscount > 0 && subs ? `Save ${s.subDiscount}% on every bag. ` : ""}{s.tagline}
              </p>
            ) : null}
            <div className="mt-8 flex flex-wrap gap-4 lg:mt-[30px]">
              <a href="#coffee" className={btn}>Choose your coffee<ArrowRight className="h-[18px] w-[18px]" strokeWidth={2.2} /></a>
              {subs && <Link href={`${base}/subscriptions`} className={btnOutline}>How subscriptions work</Link>}
            </div>
            {facts.length > 0 && (
              <ul className="mt-10 grid max-w-[720px] grid-cols-2 gap-y-6 sm:grid-cols-4 lg:mt-[clamp(2.5rem,4vw,3.75rem)]">
                {facts.map((f, i) => (
                  <li key={i} className={`pr-4 ${i > 0 ? "sm:border-l sm:border-[#DCD2CA] sm:pl-5 lg:pl-6" : ""}`}>
                    <f.icon className="h-9 w-9 text-[var(--pk)]" strokeWidth={1.35} />
                    <p className="mt-4 text-[0.9375rem] leading-[1.55] text-[#2A2522]">{f.text}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        {s.heroImage && <img src={s.heroImage} alt="" className="mx-4 mb-6 aspect-[4/3] w-[calc(100%-2rem)] rounded-[20px] object-cover object-[70%_50%] sm:mx-8 sm:w-[calc(100%-4rem)] lg:hidden" />}
      </section>

      {promo.length > 0 && (
        <section className={`${WRAP} grid gap-4 pt-8 md:grid-cols-2`}>
          {promo.map((b) => (
            <Link key={b.id} href={b.href ?? "#coffee"} className={`shop-card relative flex min-h-[170px] overflow-hidden rounded-[18px] p-7 ${b.tone === "dark" ? "bg-[#1d1915] text-white" : b.tone === "light" ? "bg-white" : "bg-[var(--pk)] text-white"}`}>
              {b.image_url && <img src={b.image_url} alt="" className="absolute inset-y-0 right-0 h-full w-2/5 object-cover" />}
              <div className={b.image_url ? "relative w-3/5 pr-4" : "relative"}>
                <p className={`${serif} text-[1.75rem] font-semibold leading-tight`}>{b.title}</p>
                {b.body && <p className="mt-2 text-[1rem] opacity-90">{b.body}</p>}
                {b.coupon_code && <p className="mt-3 inline-flex rounded-lg border border-dashed border-current px-3 py-1 font-mono text-[0.9375rem] font-bold tracking-wider">{b.coupon_code}</p>}
                <p className="mt-4 inline-flex items-center gap-1.5 text-[0.9688rem] font-semibold">{b.cta_label || "Shop now"}<ArrowRight className="h-4 w-4" /></p>
              </div>
            </Link>
          ))}
        </section>
      )}

      {/* Coffee */}
      <section id="coffee" className={`${WRAP} scroll-mt-28 pt-[43px]`}>
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 lg:pl-[13px] xl:flex-nowrap">
          <div>
            <p className={`${eyebrow} tracking-[0.12em]`}>Our coffee</p>
            <h2 className={`${serif} mt-[10px] text-[2.5rem] xl:whitespace-nowrap font-[620] leading-none tracking-[-0.025em] sm:text-[3.75rem]`}>Roasted fresh, every week</h2>
          </div>
          <div className="flex items-center gap-9">
            {s.roastNote && <p className="hidden max-w-[330px] text-[0.875rem] leading-[1.55] text-[#3A3431] md:block">{s.roastNote}</p>}
            {subs && <Link href={`${base}/subscriptions#choose`} className="inline-flex h-[49px] shrink-0 items-center gap-2 rounded-full border-[1.5px] border-[var(--pk)] px-6 text-[0.9375rem] font-semibold text-[var(--pk)] transition hover:bg-[color-mix(in_srgb,var(--pk)_7%,white)]">View all coffee<ArrowRight className="h-4 w-4" /></Link>}
          </div>
        </div>
        {coffee.length === 0
          ? <p className="mt-8 rounded-2xl bg-white p-8 text-center text-[#5E5853]">New coffees are on their way.</p>
          : <div className="mt-[34px] grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{coffee.map((p) => <ProductCard key={p.id} p={p} slug={org.slug} s={s} currency={org.currency} />)}</div>}
        {other.length > 0 && <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{other.map((p) => <ProductCard key={p.id} p={p} slug={org.slug} s={s} currency={org.currency} />)}</div>}
      </section>

      {/* Subscriptions */}
      {subs && (
        <section className={`${WRAP} grid gap-10 pb-6 pt-[60px] lg:grid-cols-[440px_minmax(0,1fr)] lg:gap-[22px]`}>
          <div className="lg:pl-[10px] lg:pt-[20px]">
            <p className={`${eyebrow} tracking-[0.12em]`}>Never run out again</p>
            <h2 className={`${serif} mt-[14px] text-[2.5rem] font-[620] leading-[1.06] tracking-[-0.03em] sm:text-[3.5rem]`}>A subscription<br className="hidden lg:block" /> that bends<br className="hidden lg:block" /> around your life.</h2>
            <p className="mt-5 max-w-[400px] text-[1.0625rem] leading-[1.6] text-[#2A2522]">Change anything, any time, from your phone — your coffee, your schedule, your address.</p>
            <Link href={`${base}/subscriptions`} className={`${btn} mt-[34px] h-[60px]`}>How subscriptions work<ArrowRight className="h-[18px] w-[18px]" strokeWidth={2.2} /></Link>
          </div>
          <ul className="grid grid-cols-2 gap-[15px] sm:grid-cols-4">
            {tiles.map((f) => (
              <li key={f.t} className="min-h-[205px] rounded-[14px] bg-white px-[22px] pb-5 pt-[22px] shadow-[0_2px_4px_rgba(60,40,30,.03),0_18px_40px_-30px_rgba(80,45,40,.4)]">
                <f.icon className="h-[42px] w-[42px] text-[var(--pk)]" strokeWidth={1.3} />
                <p className={`${serif} mt-[18px] text-[1.1875rem] font-semibold leading-snug`}>{f.t}</p>
                <p className="mt-[8px] text-[0.9375rem] leading-[1.55] text-[#4E4844]">{f.d}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Gift: a prepaid subscription when offered, otherwise a gift card */}
      <section className="relative mt-4 grid overflow-hidden bg-[#FAF6F1] lg:min-h-[426px] lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        {s.subsImage
          ? <div className="relative min-h-[300px]"><img src={s.subsImage} alt="" className="absolute inset-0 h-full w-full object-cover object-[50%_60%]" /><div className="absolute inset-0 hidden bg-[linear-gradient(90deg,rgba(250,246,241,0)_72%,#FAF6F1)] lg:block" /></div>
          : <div className="hidden lg:block" />}
        <div className="flex items-center px-6 py-12 sm:px-10 lg:py-14 lg:pl-8 lg:pr-12">
          <div className="max-w-[440px]">
            <p className={`${eyebrow} tracking-[0.12em]`}>The perfect gift</p>
            {s.prepaid.length > 0 && subs ? (
              <>
                <h2 className={`${serif} mt-[12px] text-[2.25rem] font-[620] leading-[1.08] tracking-[-0.025em] sm:text-[3rem]`}>Give a subscription of great coffee.</h2>
                <p className="mt-4 text-[1.0625rem] leading-[1.55] text-[#2A2522]">Birthdays, Christmas or just because. Choose their coffee and frequency, and we&apos;ll keep the good coffee coming.</p>
                <Link href={`${base}/subscriptions#gift`} className={`${btn} mt-7 h-[60px]`}>Send a gift subscription<ArrowRight className="h-[18px] w-[18px]" strokeWidth={2.2} /></Link>
              </>
            ) : (
              <>
                <h2 className={`${serif} mt-[12px] text-[2.25rem] font-[620] leading-[1.08] tracking-[-0.025em] sm:text-[3rem]`}>Give the gift of great coffee.</h2>
                <p className="mt-4 text-[1.0625rem] leading-[1.55] text-[#2A2522]">A coffee gift card, emailed instantly or on the day you choose, with your message on the back.</p>
                <Link href={`${base}/gift-card`} className={`${btn} mt-7 h-[64px]`}>Send a gift card<ArrowRight className="h-[18px] w-[18px]" strokeWidth={2.2} /></Link>
              </>
            )}
          </div>
        </div>
      </section>
      <section className="py-16 sm:py-20" data-section="contact">
        <div className="mx-auto w-full max-w-[940px] px-5 sm:px-8">
          <ContactForm slug={org.slug} section="shop" heading="Questions about our coffee?" intro="Wholesale, office coffee, subscriptions or anything else — send us a message." showEvent={false} messageHint="How can we help?" />
        </div>
      </section>
    </ShopFrame>
  );
}
