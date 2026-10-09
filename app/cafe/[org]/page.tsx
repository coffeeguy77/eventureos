import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowRight, CalendarDays, Clock, Coffee, Flame, MapPin, ShoppingBag, Truck, UtensilsCrossed } from "lucide-react";
import { CafeClosed, CafeFrame, WRAP, btn, btnOutline, eyebrow, hand, serif } from "@/components/cafe/frame";
import { ContactForm } from "@/components/events/contact-form";
import { cafePages, fromPrice, hoursRows, money, nowIn, type MenuItem } from "@/lib/cafe/core";
import { appSnapshot, cafeOrg } from "@/lib/cafe/server";
import { igFeed } from "@/lib/cafe/instagram";
import { readShop } from "@/lib/shop/core";
import { readSiteNav } from "@/lib/site-nav";
import { OpenBadge } from "@/components/cafe/bits";

import { ed, edImg } from "@/lib/site/copy";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ org: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const org = await cafeOrg((await params).org);
  if (!org || !org.cafe.enabled) return {};
  return { title: { absolute: `${org.cafe.heroTitle} — ${org.name}` }, description: org.cafe.heroText.slice(0, 160) };
}

export default async function CafePage({ params }: P) {
  const org = await cafeOrg((await params).org);
  if (!org) notFound();
  const c = org.cafe;
  const pages = cafePages(c);
  if (!pages.home) return <CafeFrame org={org} active="home"><CafeClosed name={org.name} what="Our café page" /></CafeFrame>;

  const [snap, ig] = await Promise.all([c.appUrl ? appSnapshot(c.appUrl, true) : Promise.resolve({ cfg: null, loc: null, menu: null }), igFeed(org.id)]);
  const cfg = snap.cfg;
  const h = cfg?.hours ?? null;
  const tz = h?.timezone || org.timezone;
  const today = nowIn(tz);
  const todayDow = new Date(`${today.date}T00:00:00Z`).getUTCDay();
  const base = `/cafe/${org.slug}`;
  const orderHref = pages.order ? `${base}/order` : pages.appOrder ? c.appUrl : null;
  const hero = c.heroImage ?? cfg?.storePhoto ?? null;
  const picks = (snap.menu ?? []).flatMap((s) => s.items.map((i) => ({ ...i, section: s.category }))).filter((i) => i.image && !i.soldOut).slice(0, 8) as (MenuItem & { section: string })[];
  const kitchenCats = new Set((h?.kitchen?.categories ?? []).map((x) => x.toLowerCase()));
  const kitchenPic = c.kitchenImage ?? (snap.menu ?? []).filter((s) => kitchenCats.has(s.category.toLowerCase())).flatMap((s) => s.items).find((i) => i.image)?.image ?? null;
  const shop = readShop(org.rawSettings).enabled;
  const labels = readSiteNav(org.rawSettings);
  const igUrl = c.instagram ? `https://www.instagram.com/${c.instagram}/` : org.settings.social.instagram ?? null;

  return (
    <CafeFrame org={org} active="home" weekly={h?.weekly} cta={orderHref ? { href: orderHref, label: "Order online" } : undefined}>
      {/* Hero */}
      <section data-section="hero" className={`${WRAP} grid items-center gap-10 py-10 sm:py-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-16 lg:py-20`}>
        <div>
          {h && <OpenBadge hours={h} />}
          <h1 {...ed("cafe.heroTitle")} className={`${serif} mt-5 text-[clamp(2.5rem,5.4vw,4.5rem)] font-semibold leading-[1.02]`}>{c.heroTitle}</h1>
          <p {...ed("cafe.heroText")} className="mt-5 max-w-xl text-[1.125rem] leading-relaxed text-[#5E5853]">{c.heroText}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            {orderHref && <Link href={orderHref} className={btn} data-track="Café: order online"><ShoppingBag className="h-5 w-5" />Order online</Link>}
            {pages.reserve && <Link href={`${base}/reserve`} className={btnOutline} data-track="Café: reserve"><CalendarDays className="h-5 w-5" />Reserve a table</Link>}
          </div>
          {org.address && <p className="mt-7 flex items-start gap-2 text-[0.9375rem] text-[#5E5853]"><MapPin className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[var(--pk)]" />{org.address}</p>}
        </div>
        {hero ? (
          <div className="relative">
            <img {...edImg("cafe.heroImage")} src={hero} alt={`Inside ${org.name}`} className="aspect-[4/3] w-full rounded-[32px] object-cover shadow-[0_40px_80px_-50px_rgba(60,30,20,.55)]" />
            {c.instagram && <span className={`${hand} absolute -bottom-5 left-6 rounded-full bg-white px-5 py-2 text-[1.375rem] text-[var(--pk)] shadow-lg ring-1 ring-[#EDE3DB]`}>@{c.instagram}</span>}
          </div>
        ) : (
          <div className="rounded-[32px] bg-[#1E1A18] p-8 text-white sm:p-10">
            <p className={`${hand} text-[1.75rem] text-[color-mix(in_srgb,var(--pk)_60%,white)]`}>Come and see us</p>
            <p className={`${serif} mt-2 text-[2rem] font-semibold leading-tight`}>{org.name}</p>
            {h?.weekly && <dl className="mt-6 space-y-1.5 text-[0.9375rem]">{hoursRows(h.weekly).map((r) => <div key={r.day} className="flex justify-between gap-6 border-b border-white/10 pb-1.5"><dt className="text-white/70">{r.day}</dt><dd className={r.closed ? "text-white/40" : ""}>{r.text}</dd></div>)}</dl>}
          </div>
        )}
      </section>

      {/* Quick tiles */}
      <section className={`${WRAP} grid gap-4 pb-14 sm:grid-cols-2 lg:grid-cols-4`}>
        {[
          orderHref ? { href: orderHref, I: ShoppingBag, t: "Order ahead", d: "Skip the queue — pay online and pick up." } : null,
          pages.reserve ? { href: `${base}/reserve`, I: CalendarDays, t: "Book a table", d: "Breakfast, lunch or a catch-up — we'll save you a spot." } : null,
          pages.club ? { href: `${base}/roasting-club`, I: Flame, t: c.clubTitle, d: "Roast your own coffee on our equipment." } : null,
          pages.wholesale ? { href: `${base}/wholesale`, I: Truck, t: "Wholesale", d: "Our coffee in your café, office or restaurant." } : null,
          shop ? { href: `/shop/${org.slug}`, I: Coffee, t: labels.shop, d: "Freshly roasted beans, delivered." } : null,
        ].filter((x): x is NonNullable<typeof x> => !!x).slice(0, 4).map(({ href, I, t, d }) => (
          <Link key={t} href={href} className="shop-card group rounded-[24px] bg-white p-6 ring-1 ring-[#EDE3DB]">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-[color-mix(in_srgb,var(--pk)_12%,white)] text-[var(--pk)]"><I className="h-5 w-5" /></span>
            <p className="mt-4 text-[1.125rem] font-semibold">{t}</p>
            <p className="mt-1 text-[0.9375rem] text-[#5E5853]">{d}</p>
            <span className="mt-4 inline-flex items-center gap-1 text-[0.875rem] font-semibold text-[var(--pk)]">Go <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" /></span>
          </Link>
        ))}
      </section>

      {/* Coffee */}
      <section data-section="coffee" className="bg-[#1E1A18] text-white">
        <div className={`${WRAP} grid items-center gap-10 py-16 sm:py-20 lg:grid-cols-2 lg:gap-16`}>
          {c.coffeeImage && <img {...edImg("cafe.coffeeImage")} src={c.coffeeImage} alt="Our roaster" className="aspect-[4/3] w-full rounded-[28px] object-cover lg:order-2" />}
          <div className={c.coffeeImage ? "lg:order-1" : "lg:col-span-2 lg:max-w-3xl"}>
            <p className={`${eyebrow} !text-[color-mix(in_srgb,var(--pk)_55%,white)]`}>Roasted here</p>
            <h2 className={`${serif} mt-3 text-[clamp(2rem,3.6vw,3rem)] font-semibold leading-tight`} {...ed("cafe.coffeeTitle")}>{c.coffeeTitle}</h2>
            <p {...ed("cafe.coffeeText")} className="mt-4 max-w-xl text-[1.0625rem] leading-relaxed text-white/75">{c.coffeeText}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              {shop && <Link href={`/shop/${org.slug}`} className="shop-btn inline-flex h-[54px] items-center gap-2 rounded-full bg-white px-7 font-semibold text-[#151312] hover:bg-[#F6EEE8]">Buy our coffee<ArrowRight className="h-4 w-4" /></Link>}
              {pages.club && <Link href={`${base}/roasting-club`} className="shop-btn inline-flex h-[54px] items-center gap-2 rounded-full px-7 font-semibold text-white ring-1 ring-white/30 hover:bg-white/10">Roast your own</Link>}
            </div>
          </div>
        </div>
      </section>

      {/* Kitchen + menu picks */}
      <section data-section="kitchen" className={`${WRAP} py-16 sm:py-20`}>
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-16">
          <div>
            <p className={eyebrow}><UtensilsCrossed className="mr-1.5 inline h-4 w-4 align-[-2px]" />Our kitchen</p>
            <h2 className={`${serif} mt-3 text-[clamp(2rem,3.6vw,3rem)] font-semibold leading-tight`} {...ed("cafe.kitchenTitle")}>{c.kitchenTitle}</h2>
            <p {...ed("cafe.kitchenText")} className="mt-4 max-w-xl text-[1.0625rem] leading-relaxed text-[#5E5853]">{c.kitchenText}</p>
            {h?.kitchen?.hasHours && h.kitchen.weekly && (
              <p className="mt-4 flex items-center gap-2 text-[0.9375rem] text-[#3A3431]"><Clock className="h-4 w-4 text-[var(--pk)]" />Kitchen today: {hoursRows(h.kitchen.weekly).find((r) => r.dow === todayDow)?.text}</p>
            )}
            {orderHref && <Link href={orderHref} className={`${btn} mt-7`}>See the full menu<ArrowRight className="h-5 w-5" /></Link>}
          </div>
          {kitchenPic && <img {...edImg("cafe.kitchenImage")} src={kitchenPic} alt="From our kitchen" className="aspect-[5/4] w-full rounded-[28px] object-cover" />}
        </div>
        {picks.length > 0 && (
          <div className="mt-14">
            <p className="text-[0.9375rem] font-semibold">From the menu today</p>
            <div className="no-scrollbar -mx-5 mt-4 flex snap-x gap-4 overflow-x-auto px-5 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:px-0 lg:grid-cols-4">
              {picks.map((i) => (
                <Link key={i.id} href={orderHref ?? "#"} className="shop-card w-[72vw] shrink-0 snap-start overflow-hidden rounded-[22px] bg-white ring-1 ring-[#EDE3DB] sm:w-auto">
                  <span className="block aspect-[4/3] overflow-hidden bg-[#F4ECE6]"><img src={i.image!} alt="" loading="lazy" className="shop-zoom h-full w-full object-cover" /></span>
                  <span className="block p-4">
                    <span className="block text-[0.75rem] font-medium uppercase tracking-wide text-[#8C847D]">{i.section}</span>
                    <span className="mt-0.5 block font-semibold leading-snug">{i.name}</span>
                    <span className="mt-1 block text-[0.875rem] text-[#5E5853]">{(i.isGroup || i.variations.length > 1) ? "from " : ""}{money(fromPrice(i))}</span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Instagram */}
      {(ig.posts.length > 0 || igUrl) && (
        <section data-section="instagram" className="border-y border-[#EDE3DB] bg-white">
          <div className={`${WRAP} py-16`}>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className={`${hand} text-[1.75rem] leading-none text-[var(--pk)]`}>Follow along</p>
                <h2 className={`${serif} mt-1 text-[clamp(1.875rem,3vw,2.5rem)] font-semibold`}>{c.instagram ? `@${c.instagram}` : "On Instagram"}</h2>
              </div>
              {igUrl && <a href={igUrl} target="_blank" rel="noopener noreferrer" className={btnOutline} data-track="Café: Instagram">Follow us on Instagram</a>}
            </div>
            {ig.posts.length > 0 ? (
              <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {ig.posts.slice(0, 12).map((p) => (
                  <a key={p.id} href={p.permalink} target="_blank" rel="noopener noreferrer" className="group relative block aspect-square overflow-hidden rounded-[18px] bg-[#F4ECE6]" aria-label={p.caption ? p.caption.slice(0, 80) : "Instagram post"}>
                    <img src={p.image} alt="" loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                    {p.video && <span className="absolute right-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[0.6875rem] font-semibold text-white">Video</span>}
                  </a>
                ))}
              </div>
            ) : (
              <p className="mt-6 max-w-xl text-[#5E5853]">See what&apos;s on the roaster, the specials board and what the kitchen is cooking — we post it all on Instagram.</p>
            )}
          </div>
        </section>
      )}

      {/* Contact */}
      <section data-section="contact" className={`${WRAP} grid gap-10 py-16 sm:py-20 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16`}>
        <div>
          <p className={eyebrow}>Get in touch</p>
          <h2 className={`${serif} mt-3 text-[clamp(2rem,3.4vw,2.75rem)] font-semibold leading-tight`}>Questions, group bookings or something special?</h2>
          <p className="mt-4 text-[1.0625rem] text-[#5E5853]">Send us a message and we&apos;ll get back to you.</p>
          {h?.weekly && (
            <dl className="mt-8 max-w-sm space-y-1.5 text-[0.9375rem]">
              {hoursRows(h.weekly).map((r) => <div key={r.day} className={`flex justify-between gap-6 rounded-lg px-3 py-1.5 ${r.dow === todayDow ? "bg-[color-mix(in_srgb,var(--pk)_10%,white)] font-semibold" : ""}`}><dt>{r.day}</dt><dd className={r.closed ? "text-[#A39A93]" : ""}>{r.text}</dd></div>)}
            </dl>
          )}
        </div>
        <ContactForm slug={org.slug} section="cafe" heading="Send us a message" showEvent={false} messageHint="Group booking, dietary question, function…" />
      </section>
    </CafeFrame>
  );
}
