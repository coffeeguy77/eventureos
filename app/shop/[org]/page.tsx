import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowRight, CalendarDays, Gift, GraduationCap, Leaf, Package, Ruler, Truck } from "lucide-react";
import { createServiceClient } from "@/lib/integrations/runtime";
import { activeBanners, loadProducts, shopOrg } from "@/lib/shop/server";
import { dayList } from "@/lib/shop/core";
import { ShopFrame, serif, btn, btnOutline, eyebrow } from "@/components/shop/frame";
import { FLEX, GIFT_TILE, ProductCard, ShopClosed } from "@/components/shop/bits";
import { EventLink } from "@/components/shop/event-link";
import { PAGE } from "@/components/book/shell";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ org: string }>; searchParams: Promise<Record<string, string | undefined>> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const org = await shopOrg((await params).org).catch(() => null);
  if (!org) return {};
  const title = `${org.shop.title.replace(/\.$/, "")} — ${org.name}`;
  return { title: { absolute: title }, description: org.shop.tagline, openGraph: { title, description: org.shop.tagline, images: org.shop.heroImage ? [org.shop.heroImage] : undefined } };
}

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

      {/* Hero: words on the left, the roaster on the right fading into the page */}
      <section className="relative isolate overflow-hidden">
        {s.heroImage && (
          <div className="absolute inset-y-0 right-0 -z-10 hidden w-[60%] lg:block">
            <img src={s.heroImage} alt="" className="h-full w-full object-cover object-[50%_42%]" />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,#FFFBF8_0%,rgba(255,251,248,.92)_14%,rgba(255,251,248,.45)_30%,rgba(255,251,248,0)_48%)]" />
          </div>
        )}
        <div className={`${PAGE} pb-12 pt-12 sm:pt-16 lg:flex lg:min-h-[650px] lg:items-center lg:py-16`}>
          <div className="max-w-[560px]">
            <p className={eyebrow}>Fresh from our roaster</p>
            <h1 className={`${serif} mt-4 text-balance text-[2.75rem] font-bold leading-[1.02] sm:text-[3.75rem] xl:text-[4.25rem]`}>{s.title}</h1>
            {(s.subDiscount > 0 && subs) || s.tagline ? (
              <p className="mt-5 max-w-[30rem] text-[1.0625rem] leading-relaxed text-[#3F3A36]">
                {s.subDiscount > 0 && subs ? `Save ${s.subDiscount}% on every bag. ` : ""}{s.tagline}
              </p>
            ) : null}
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#coffee" className={btn}>Choose your coffee<ArrowRight className="h-[18px] w-[18px]" /></a>
              {subs && <Link href={`${base}/subscriptions`} className={btnOutline}>How subscriptions work</Link>}
            </div>
            {facts.length > 0 && (
              <ul className="mt-12 grid max-w-[620px] grid-cols-2 gap-y-6 sm:grid-cols-4 lg:w-[620px]">
                {facts.map((f, i) => (
                  <li key={i} className={`pr-4 ${i > 0 ? "sm:border-l sm:border-[#E6DAD1] sm:pl-5" : ""}`}>
                    <f.icon className="h-7 w-7 text-[var(--b)]" strokeWidth={1.5} />
                    <p className="mt-2.5 text-[0.8125rem] leading-snug text-[#3F3A36]">{f.text}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        {s.heroImage && <img src={s.heroImage} alt="" className="mx-4 mb-4 aspect-[4/3] w-[calc(100%-2rem)] rounded-[22px] object-cover object-[50%_40%] sm:mx-8 sm:w-[calc(100%-4rem)] lg:hidden" />}
      </section>

      {promo.length > 0 && (
        <section className={`${PAGE} grid gap-4 pt-6 md:grid-cols-2`}>
          {promo.map((b) => (
            <Link key={b.id} href={b.href ?? "#coffee"} className={`shop-card relative flex min-h-[170px] overflow-hidden rounded-[22px] p-7 ${b.tone === "dark" ? "bg-[#1d1915] text-white" : b.tone === "light" ? "bg-white ring-1 ring-[#EFE6DF]" : "bg-[var(--b)] text-[var(--on-b)]"}`}>
              {b.image_url && <img src={b.image_url} alt="" className="absolute inset-y-0 right-0 h-full w-2/5 object-cover" />}
              <div className={b.image_url ? "relative w-3/5 pr-4" : "relative"}>
                <p className={`${serif} text-[1.75rem] font-bold leading-tight`}>{b.title}</p>
                {b.body && <p className="mt-2 text-[1rem] opacity-90">{b.body}</p>}
                {b.coupon_code && <p className="mt-3 inline-flex rounded-lg border border-dashed border-current px-3 py-1 font-mono text-[0.9375rem] font-bold tracking-wider">{b.coupon_code}</p>}
                <p className="mt-4 inline-flex items-center gap-1.5 text-[0.9688rem] font-semibold">{b.cta_label || "Shop now"}<ArrowRight className="h-4 w-4" /></p>
              </div>
            </Link>
          ))}
        </section>
      )}

      {/* Coffee */}
      <section id="coffee" className={`${PAGE} scroll-mt-28 py-14 sm:py-16`}>
        <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
          <div>
            <p className={eyebrow}>Our coffee</p>
            <h2 className={`${serif} mt-3 text-[2.25rem] font-bold leading-tight sm:text-[2.75rem]`}>Roasted fresh, every week</h2>
          </div>
          {s.roastNote && <p className="max-w-[24rem] text-[0.875rem] leading-relaxed text-[#5E5853]">{s.roastNote}</p>}
        </div>
        {coffee.length === 0
          ? <p className="mt-8 rounded-2xl bg-white p-8 text-center text-[#5E5853]">New coffees are on their way.</p>
          : <div className="mt-9 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{coffee.map((p) => <ProductCard key={p.id} p={p} slug={org.slug} s={s} currency={org.currency} />)}</div>}
        {other.length > 0 && <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{other.map((p) => <ProductCard key={p.id} p={p} slug={org.slug} s={s} currency={org.currency} />)}</div>}
      </section>

      {/* Subscriptions */}
      {subs && (
        <section className={`${PAGE} grid gap-10 pb-16 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,2fr)] lg:items-center lg:gap-12`}>
          <div>
            <p className={eyebrow}>Never run out again</p>
            <h2 className={`${serif} mt-3 text-[2.25rem] font-bold leading-[1.08] sm:text-[2.75rem]`}>A subscription that bends around your life.</h2>
            <p className="mt-4 max-w-[26rem] text-[1rem] leading-relaxed text-[#3F3A36]">Change anything, any time, from your phone — your coffee, your schedule, your address.</p>
            <Link href={`${base}/subscriptions`} className={`${btn} mt-7`}>How subscriptions work<ArrowRight className="h-[18px] w-[18px]" /></Link>
          </div>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {tiles.map((f) => (
              <li key={f.t} className="rounded-[16px] bg-white p-5 shadow-[0_12px_30px_-24px_rgba(80,45,40,.4)] ring-1 ring-[#EFE6DF]">
                <f.icon className="h-8 w-8 text-[var(--b)]" strokeWidth={1.5} />
                <p className={`${serif} mt-3.5 text-[1rem] font-bold leading-snug`}>{f.t}</p>
                <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-[#5E5853]">{f.d}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Gift: a prepaid subscription when offered, otherwise a gift card */}
      <section className="grid bg-[#FFF4F1] lg:grid-cols-[1.25fr_1fr]">
        {s.subsImage
          ? <div className="relative min-h-[300px] lg:min-h-[440px]"><img src={s.subsImage} alt="" className="absolute inset-0 h-full w-full object-cover" /><div className="absolute inset-0 hidden bg-[linear-gradient(90deg,rgba(255,244,241,0)_70%,#FFF4F1)] lg:block" /></div>
          : <div className="hidden lg:block" />}
        <div className="flex items-center px-6 py-12 sm:px-10 lg:py-16 lg:pl-10 lg:pr-[max(2rem,calc((100vw-1536px)/2+3rem))]">
          <div className="max-w-[30rem]">
            <p className={eyebrow}>The perfect gift</p>
            {s.prepaid.length > 0 && subs ? (
              <>
                <h2 className={`${serif} mt-3 text-[2.25rem] font-bold leading-[1.08] sm:text-[2.625rem]`}>Give a subscription of great coffee.</h2>
                <p className="mt-4 text-[1rem] leading-relaxed text-[#3F3A36]">Birthdays, Christmas or just because. Choose their coffee and how often, prepay {s.prepaid.map((x) => x.months).join(", ").replace(/, (\d+)$/, " or $1")} months and send it to their door — we&apos;ll keep the good coffee coming.</p>
                <Link href={`${base}/subscriptions#gift`} className={`${btn} mt-7`}>Send a gift subscription<ArrowRight className="h-[18px] w-[18px]" /></Link>
              </>
            ) : (
              <>
                <h2 className={`${serif} mt-3 text-[2.25rem] font-bold leading-[1.08] sm:text-[2.625rem]`}>Give the gift of great coffee.</h2>
                <p className="mt-4 text-[1rem] leading-relaxed text-[#3F3A36]">A coffee gift card, emailed instantly or on the day you choose, with your message on the back.</p>
                <Link href={`${base}/gift-card`} className={`${btn} mt-7`}>Send a gift card<ArrowRight className="h-[18px] w-[18px]" /></Link>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Grind guide · gift cards · for students */}
      <section className={`${PAGE} grid gap-4 py-14 md:grid-cols-3`}>
        <Link href={`${base}/grind`} className="shop-card flex gap-4 rounded-[18px] bg-white p-6 ring-1 ring-[#EFE6DF]">
          <Ruler className="h-7 w-7 shrink-0 text-[var(--b)]" strokeWidth={1.5} />
          <span><span className={`${serif} block text-[1.1875rem] font-bold`}>Get your grind right</span><span className="mt-1 block text-[0.875rem] leading-relaxed text-[#5E5853]">{s.grinder ? `We grind to order on our ${s.grinder}. ` : "We grind to order. "}Bitter or sour? Go a touch coarser or finer.</span>
            <span className="mt-3 inline-flex items-center gap-1 text-[0.875rem] font-semibold text-[var(--b)]">Grind guide<ArrowRight className="h-4 w-4" /></span></span>
        </Link>
        <Link href={`${base}/gift-card`} className="shop-card flex gap-4 rounded-[18px] bg-white p-6 ring-1 ring-[#EFE6DF]">
          <Gift className="h-7 w-7 shrink-0 text-[var(--b)]" strokeWidth={1.5} />
          <span><span className={`${serif} block text-[1.1875rem] font-bold`}>Coffee gift cards</span><span className="mt-1 block text-[0.875rem] leading-relaxed text-[#5E5853]">Emailed instantly or on the day you choose, with your message on the back.</span>
            <span className="mt-3 inline-flex items-center gap-1 text-[0.875rem] font-semibold text-[var(--b)]">Give coffee<ArrowRight className="h-4 w-4" /></span></span>
        </Link>
        {org.settings.enabled && (
          <Link href={`/${org.slug}`} className="shop-card flex gap-4 rounded-[18px] bg-white p-6 ring-1 ring-[#EFE6DF]">
            <GraduationCap className="h-7 w-7 shrink-0 text-[var(--b)]" strokeWidth={1.5} />
            <span><span className={`${serif} block text-[1.1875rem] font-bold`}>Trained with us?</span><span className="mt-1 block text-[0.875rem] leading-relaxed text-[#5E5853]">Keep practising with the coffee you learned on — your barista account works here too.</span>
              <span className="mt-3 inline-flex items-center gap-1 text-[0.875rem] font-semibold text-[var(--b)]">Barista courses<ArrowRight className="h-4 w-4" /></span></span>
          </Link>
        )}
      </section>
    </ShopFrame>
  );
}
