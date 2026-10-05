import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowRight, Check, Gift, GraduationCap, Ruler } from "lucide-react";
import { createServiceClient } from "@/lib/integrations/runtime";
import { activeBanners, loadProducts, shopOrg } from "@/lib/shop/server";
import { ShopFrame, serif, hand } from "@/components/shop/frame";
import { FLEX, ProductCard, ShopClosed, scheduleChips } from "@/components/shop/bits";
import { EventLink } from "@/components/shop/event-link";
import { PAGE } from "@/components/book/shell";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ org: string }>; searchParams: Promise<Record<string, string | undefined>> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const org = await shopOrg((await params).org).catch(() => null);
  if (!org) return {};
  const title = `${org.shop.title} — ${org.name}`;
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
  const chips = scheduleChips(org.shop);
  const s = org.shop;
  const base = `/shop/${org.slug}`;

  return (
    <ShopFrame org={org} active="shop" topBanners={top}>
      <EventLink slug={org.slug} token={sp.event ?? null} code={sp.code ?? null} />
      {/* Hero */}
      <section className="relative isolate overflow-hidden bg-[#1d1915] text-[#FFFDFC]">
        {s.heroImage && <img src={s.heroImage} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover opacity-45" />}
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_85%_20%,color-mix(in_srgb,var(--b)_28%,transparent),transparent_55%)]" />
        <div className={`${PAGE} grid items-center gap-10 py-14 sm:py-20 lg:grid-cols-[1.15fr_0.85fr] lg:py-24`}>
          <div>
            <p className={`${hand} text-[1.75rem] leading-none text-[#FFFDFC]/90`}>Fresh from the roaster</p>
            <h1 className={`${serif} mt-4 text-balance text-[3rem] font-semibold leading-[1.02] tracking-[-0.02em] sm:text-[4rem] xl:text-[4.75rem]`}>{s.title}</h1>
            {s.tagline && <p className="mt-5 max-w-[34rem] text-[1.125rem] leading-relaxed text-[#FFFDFC]/85 sm:text-[1.25rem]">{s.tagline}</p>}
            {chips.length > 0 && (
              <ul className="mt-7 flex flex-wrap gap-2.5">
                {chips.map((c) => <li key={c.text} className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-[0.9375rem] font-medium ring-1 ring-white/15 backdrop-blur"><c.icon className="h-4 w-4 text-[var(--b)]" />{c.text}</li>)}
              </ul>
            )}
            <div className="mt-9 flex flex-wrap gap-3">
              <a href="#coffee" className="shop-btn inline-flex h-14 items-center gap-2 rounded-2xl bg-[var(--b)] px-7 text-[1.0313rem] font-semibold text-[var(--on-b)] shadow-[0_14px_30px_-14px_var(--b)]">Shop coffee<ArrowRight className="h-5 w-5" /></a>
              <Link href={`${base}/subscriptions`} className="shop-btn inline-flex h-14 items-center rounded-2xl px-7 text-[1.0313rem] font-semibold ring-1 ring-[#FFFDFC]/60 hover:bg-[#FFFDFC] hover:text-[#171714]">How subscriptions work</Link>
            </div>
          </div>
          {s.subDiscount > 0 && (
            <div className="rounded-[28px] bg-[#FFFDFC] p-7 text-[#171714] shadow-[0_40px_80px_-40px_rgba(0,0,0,.8)] sm:p-8">
              <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.18em] text-[var(--b)]">Subscribe &amp; save</p>
              <p className={`${serif} mt-2 text-[2.25rem] font-semibold leading-tight`}>{s.subDiscount}% off every bag</p>
              <p className="mt-2 text-[1rem] leading-relaxed text-[#5b5955]">The easiest way to never run out — and the most flexible subscription around.</p>
              <ul className="mt-5 space-y-2.5">
                {FLEX.slice(0, 5).map((f) => <li key={f.t} className="flex items-start gap-3 text-[0.9688rem]"><Check className="mt-0.5 h-5 w-5 shrink-0 text-[var(--b)]" strokeWidth={2.5} /><span><span className="font-semibold">{f.t}</span> — {f.d}</span></li>)}
              </ul>
              <Link href={`${base}/subscriptions`} className="mt-6 inline-flex items-center gap-1.5 text-[0.9688rem] font-semibold underline decoration-[var(--b)] decoration-2 underline-offset-4">See everything you can do<ArrowRight className="h-4 w-4" /></Link>
            </div>
          )}
        </div>
      </section>

      {promo.length > 0 && (
        <section className={`${PAGE} grid gap-4 pt-10 md:grid-cols-2`}>
          {promo.map((b) => (
            <Link key={b.id} href={b.href ?? "#coffee"} className={`shop-card relative flex min-h-[170px] overflow-hidden rounded-[26px] p-7 ${b.tone === "dark" ? "bg-[#1d1915] text-[#FFFDFC]" : b.tone === "light" ? "border border-[#E9DFD5] bg-[#FFFDFC]" : "bg-[var(--b)] text-[var(--on-b)]"}`}>
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
      <section id="coffee" className={`${PAGE} scroll-mt-24 py-14 sm:py-20`}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[0.875rem] font-semibold uppercase tracking-[0.18em] text-[#8a817a]">Our coffee</p>
            <h2 className={`${serif} mt-2 text-[2.25rem] font-semibold leading-tight sm:text-[2.875rem]`}>Roasted fresh, every week</h2>
          </div>
          {s.roastNote && <p className="max-w-md text-[1rem] leading-relaxed text-[#5b5955]">{s.roastNote}</p>}
        </div>
        {coffee.length === 0
          ? <p className="mt-8 rounded-2xl bg-white p-8 text-center text-[#5b5955]">New coffees are on their way.</p>
          : <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{coffee.map((p) => <ProductCard key={p.id} p={p} slug={org.slug} s={s} currency={org.currency} />)}</div>}
        {other.length > 0 && <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{other.map((p) => <ProductCard key={p.id} p={p} slug={org.slug} s={s} currency={org.currency} />)}</div>}
      </section>

      {/* Subscriptions */}
      <section className="bg-[#F1EAE2] py-16 sm:py-20">
        <div className={PAGE}>
          <div className="max-w-2xl">
            <p className={`${hand} text-[1.75rem] leading-none text-[var(--b)]`}>Never run out again</p>
            <h2 className={`${serif} mt-3 text-[2.25rem] font-semibold leading-tight sm:text-[2.875rem]`}>A subscription that bends around your life</h2>
            <p className="mt-4 text-[1.0625rem] leading-relaxed text-[#5b5955]">Change anything, any time, from your phone — your coffee, your schedule, your address.</p>
          </div>
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FLEX.map((f) => (
              <li key={f.t} className="rounded-[22px] bg-[#FFFDFC] p-6 ring-1 ring-[#E6DCD1]">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[color-mix(in_srgb,var(--b)_14%,white)] text-[var(--b)]"><f.icon className="h-6 w-6" strokeWidth={1.8} /></span>
                <p className="mt-4 text-[1.0625rem] font-semibold">{f.t}</p>
                <p className="mt-1 text-[0.9375rem] leading-relaxed text-[#5b5955]">{f.d}</p>
              </li>
            ))}
            <li className="flex flex-col justify-between rounded-[22px] bg-[#1d1915] p-6 text-[#FFFDFC]">
              <p className={`${serif} text-[1.5rem] font-semibold leading-tight`}>{s.subDiscount > 0 ? `Save ${s.subDiscount}% on every delivery` : "Fresh coffee on repeat"}</p>
              <Link href={`${base}/subscriptions`} className="shop-btn mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--b)] px-5 font-semibold text-[var(--on-b)]">Start a subscription<ArrowRight className="h-4 w-4" /></Link>
            </li>
          </ul>
        </div>
      </section>

      {/* Grind + gift + students */}
      <section className={`${PAGE} grid gap-5 py-16 md:grid-cols-3`}>
        <Link href={`${base}/grind`} className="shop-card rounded-[26px] border border-[#E9DFD5] bg-[#FFFDFC] p-7">
          <Ruler className="h-8 w-8 text-[var(--b)]" strokeWidth={1.6} />
          <p className={`${serif} mt-4 text-[1.5rem] font-semibold`}>Get your grind right</p>
          <p className="mt-2 text-[0.9688rem] leading-relaxed text-[#5b5955]">{s.grinder ? `We grind to order on our ${s.grinder}. ` : "We grind to order. "}Last bag a little bitter or sour? Go a touch coarser or finer next time.</p>
          <p className="mt-4 inline-flex items-center gap-1.5 font-semibold">Grind guide<ArrowRight className="h-4 w-4" /></p>
        </Link>
        <Link href={`${base}/gift-card`} className="shop-card rounded-[26px] border border-[#E9DFD5] bg-[#FFFDFC] p-7">
          <Gift className="h-8 w-8 text-[var(--b)]" strokeWidth={1.6} />
          <p className={`${serif} mt-4 text-[1.5rem] font-semibold`}>Coffee gift cards</p>
          <p className="mt-2 text-[0.9688rem] leading-relaxed text-[#5b5955]">Emailed instantly or on the day you choose, with your message on the back.</p>
          <p className="mt-4 inline-flex items-center gap-1.5 font-semibold">Give coffee<ArrowRight className="h-4 w-4" /></p>
        </Link>
        <Link href={`/book/${org.slug}`} className="shop-card rounded-[26px] bg-[var(--b)] p-7 text-[var(--on-b)]">
          <GraduationCap className="h-8 w-8" strokeWidth={1.6} />
          <p className={`${serif} mt-4 text-[1.5rem] font-semibold`}>Trained with us?</p>
          <p className="mt-2 text-[0.9688rem] leading-relaxed opacity-90">Keep practising with the same coffee you learned on. Signed in to your barista account? You&apos;re signed in here too.</p>
          <p className="mt-4 inline-flex items-center gap-1.5 font-semibold">Barista courses<ArrowRight className="h-4 w-4" /></p>
        </Link>
      </section>
    </ShopFrame>
  );
}
