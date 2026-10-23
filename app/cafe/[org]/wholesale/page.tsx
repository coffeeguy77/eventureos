import Link from "next/link";
import { siteMeta } from "@/lib/site/meta";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowRight, Check, Coffee, Flame, GraduationCap, Package, Store, Truck, Users } from "lucide-react";
import { CafeClosed, CafeFrame, WRAP, btn, eyebrow, hand, serif } from "@/components/cafe/frame";
import { WholesaleOrderNow, WholesaleSignup } from "@/components/cafe/wholesale-forms";
import { cafePages } from "@/lib/cafe/core";
import { appSnapshot, cafeOrg } from "@/lib/cafe/server";
import { readShop } from "@/lib/shop/core";
import { readEvents } from "@/lib/events/core";
import { readLearnSettings } from "@/lib/learn/core";
import { readWholesale } from "@/lib/wholesale/settings";
import { WEEKDAYS } from "@/lib/wholesale/rules";
import { copyOf, ed, edImg, okImage } from "@/lib/site/copy";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ org: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const org = await cafeOrg((await params).org);
  if (!org || !org.cafe.wholesale) return {};
  return siteMeta(org, `/cafe/${org.slug}/wholesale`, { title: { absolute: `${org.cafe.wholesaleTitle} — ${org.name}` }, description: org.cafe.wholesaleIntro.slice(0, 160) });
}

const dollars = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

export default async function WholesalePage({ params }: P) {
  const org = await cafeOrg((await params).org);
  if (!org) notFound();
  const c = org.cafe;
  const pages = cafePages(c);
  if (!pages.wholesale) return <CafeFrame org={org} active="wholesale"><CafeClosed name={org.name} what="The wholesale page" /></CafeFrame>;

  const T = copyOf(org.rawSettings, "wholesale");
  const k = (key: string) => ed(`copy:wholesale.${key}`);
  const raw = org.rawSettings as { site?: { images?: Record<string, unknown> } } | null;
  const pic = (key: string, fallback: string | null) => { const v = raw?.site?.images?.[key]; return typeof v === "string" && okImage(v) ? v : fallback; };
  const storyImg = pic("wsStory", "/media/beanculture/looking-for-work-barista-course.jpg");
  const journeyImg = pic("wsJourney", "/media/academy/bean-culture/deeper.jpg");
  const orderImg = pic("wsOrder", "/media/beanculture/roaster.jpg");

  const ws = readWholesale(org.rawSettings);
  const day = WEEKDAYS[ws.deliveryWeekday];
  const shop = readShop(org.rawSettings).enabled;
  const learn = readLearnSettings(org.rawSettings);
  const classes = !!org.settings?.enabled;
  const events = readEvents(org.rawSettings).enabled;
  const base = org.slug;
  const freight = ws.freeFreightOver > 0 ? `Free freight on orders over ${dollars(ws.freeFreightOver)}` : null;
  const weekly = (c.appUrl ? (await appSnapshot(c.appUrl, false)).cfg?.hours?.weekly : null) ?? null;

  // The journey — every word editable on the page. Steps that point at a page only show when that page is switched on.
  const journey = [
    (classes || learn.enabled) && { key: "j1", I: GraduationCap, title: "Learn the craft", text: `Start behind the machine. Our hands-on barista classes${learn.enabled ? ` and the ${learn.name}` : ""} take you from your first shot to pouring with confidence.`, href: classes ? `/${base}` : `/academy/${base}`, cta: "Barista classes" },
    { key: "j2", I: Coffee, title: "Find your coffee", text: "Come to the roastery, taste through our coffees with the people who roast them, and choose the one that suits your menu and your customers.", href: "#rates", cta: "Ask for a tasting" },
    { key: "j3", I: Users, title: "Train your team", text: "Bring your baristas in before you open. We'll train them on our two-group espresso machines so day one feels like day one hundred.", href: null, cta: null },
    { key: "j4", I: Store, title: "Open your doors", text: ws.ordering ? `Fresh coffee, roasted here and delivered every ${day}. Order online in a minute, and talk to the roasters whenever you need a hand.` : `Fresh coffee, roasted here and delivered every ${day} — and the roasters are only a call away whenever you need a hand.`, href: ws.ordering ? "#order" : "#rates", cta: ws.ordering ? "How ordering works" : null },
    pages.club && { key: "j5", I: Flame, title: "Make it your own", text: "Ready for your own blend and your own label? Roast it yourself in our Roasting Club, with the roasters and label printing on site.", href: `/cafe/${base}/roasting-club`, cta: c.clubTitle },
  ].filter(Boolean) as { key: string; I: typeof Coffee; title: string; text: string; href: string | null; cta: string | null }[];

  const what = [
    shop && { I: Package, t: "Roastery", d: "Coffee roasted fresh in our own roastery.", href: `/shop/${base}`, cta: "Buy our coffee" },
    pages.home && { I: Coffee, t: "Café", d: "Our own café — the coffee we roast, served every day.", href: `/cafe/${base}`, cta: "Visit the café" },
    (classes || learn.enabled) && { I: GraduationCap, t: "Barista training", d: classes && learn.enabled ? `Hands-on classes, plus the ${learn.name} online.` : classes ? "Hands-on barista classes." : `The ${learn.name}, online.`, href: classes ? `/${base}` : `/academy/${base}`, cta: "See the classes" },
    pages.club && { I: Flame, t: c.clubTitle, d: "Roast your own coffee on our equipment.", href: `/cafe/${base}/roasting-club`, cta: "Find out more" },
    events && { I: Truck, t: "Events", d: "Coffee carts and vans for events and functions.", href: `/hire/${base}`, cta: "Hire us" },
  ].filter(Boolean) as { I: typeof Coffee; t: string; d: string; href: string; cta: string }[];

  return (
    <CafeFrame org={org} active="wholesale" weekly={weekly} cta={{ href: "#rates", label: "Get our rates" }}>
      {/* Hero */}
      <section data-section="hero" className={`${WRAP} grid items-center gap-10 py-12 sm:py-16 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-16 lg:py-20`}>
        <div>
          <p {...k("hero.kicker")} className={`${hand} text-[1.75rem] leading-none text-[var(--pk)]`}>{T("hero.kicker", "For cafés, offices & restaurants")}</p>
          <h1 className={`${serif} mt-3 text-[clamp(2.5rem,5.4vw,4.25rem)] font-semibold leading-[1.02]`} {...ed("cafe.wholesaleTitle")}>{c.wholesaleTitle}</h1>
          <p {...ed("cafe.wholesaleIntro")} className="mt-5 max-w-xl text-[1.125rem] leading-relaxed text-[#5E5853]">{c.wholesaleIntro}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="#rates" className={btn} data-track="Wholesale: get rates (hero)">Get our wholesale rates<ArrowRight className="h-5 w-5" /></Link>
            {ws.ordering
              ? <Link href="#order" className="shop-btn inline-flex h-[60px] items-center rounded-full px-8 font-semibold ring-[1.5px] ring-[#1F1B19] hover:bg-white" data-track="Wholesale: order now (hero)">Already with us? Order now</Link>
              : shop && <Link href={`/shop/${base}`} className="shop-btn inline-flex h-[60px] items-center rounded-full px-8 font-semibold ring-[1.5px] ring-[#1F1B19] hover:bg-white">Try our coffee first</Link>}
          </div>
        </div>
        {c.wholesaleImage && <img {...edImg("cafe.wholesaleImage")} src={c.wholesaleImage} alt="" className="aspect-[4/3] w-full rounded-[32px] object-cover shadow-[0_40px_80px_-50px_rgba(60,30,20,.55)]" />}
      </section>

      {/* The dream */}
      <section data-section="story" className="bg-[#1E1A18] text-white">
        <div className={`${WRAP} grid items-center gap-10 py-16 sm:py-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-16`}>
          {storyImg && <img {...edImg("site.images.wsStory")} src={storyImg} alt="" className="aspect-[4/5] w-full rounded-[32px] object-cover lg:aspect-[5/6]" />}
          <div>
            <p {...k("story.eyebrow")} className={`${eyebrow} !text-[color-mix(in_srgb,var(--pk)_55%,white)]`}>{T("story.eyebrow", "The barista life")}</p>
            <h2 {...k("story.title")} className={`${serif} mt-3 text-[clamp(2.125rem,4.2vw,3.5rem)] font-semibold leading-[1.05]`}>{T("story.title", "It starts with loving coffee enough to make it your life")}</h2>
            <p {...k("story.p1")} className="mt-6 whitespace-pre-line text-[1.125rem] leading-relaxed text-white/80">{T("story.p1", "Maybe it began behind someone else's machine. Maybe it's the empty shop you walk past every morning and think, that could be mine. Owning a café is early starts, regulars who become friends, and the quiet pride of a perfect pour before the city wakes up.")}</p>
            <p {...k("story.p2")} className="mt-4 whitespace-pre-line text-[1.125rem] leading-relaxed text-white/80">{T("story.p2", `It's hard work — and there's nothing like it. We know, because we live it too. We roast, we run our own café, and we pull shots every day. When you buy wholesale from ${org.name}, you get coffee from people who understand exactly what your morning rush feels like.`)}</p>
            <p {...k("story.sign")} className={`${hand} mt-8 text-[2rem] leading-none text-[color-mix(in_srgb,var(--pk)_60%,white)]`}>{T("story.sign", "Let's build yours together.")}</p>
          </div>
        </div>
      </section>

      {/* The journey */}
      <section data-section="journey" className={`${WRAP} py-16 sm:py-24`}>
        <div className="max-w-2xl">
          <p {...k("journey.eyebrow")} className={eyebrow}>{T("journey.eyebrow", "Your journey")}</p>
          <h2 {...k("journey.title")} className={`${serif} mt-3 text-[clamp(2rem,3.8vw,3rem)] font-semibold leading-tight`}>{T("journey.title", "From first shot to your own café")}</h2>
          <p {...k("journey.intro")} className="mt-4 text-[1.0625rem] leading-relaxed text-[#5E5853]">{T("journey.intro", "Wherever you're starting from, we'll walk the whole road with you.")}</p>
        </div>
        <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:gap-14">
          <ol className="relative">
            {journey.map((j, i) => (
              <li key={j.key} className="relative flex gap-5 pb-10 last:pb-0">
                {i < journey.length - 1 && <span aria-hidden className="absolute left-[23px] top-12 h-[calc(100%-3rem)] w-px bg-[#E6DCD4]" />}
                <span className="relative grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--pk)_12%,white)] text-[var(--pk)] ring-4 ring-[#FCFAF7]"><j.I className="h-5 w-5" /></span>
                <div className="pt-1">
                  <p className="text-[0.75rem] font-bold uppercase tracking-[0.14em] text-[#8C847D]">Step {i + 1}</p>
                  <h3 {...k(`${j.key}.title`)} className={`${serif} mt-1 text-[1.625rem] font-semibold leading-tight`}>{T(`${j.key}.title`, j.title)}</h3>
                  <p {...k(`${j.key}.text`)} className="mt-2 max-w-xl leading-relaxed text-[#5E5853]">{T(`${j.key}.text`, j.text)}</p>
                  {j.href && j.cta && <Link href={j.href} className="mt-3 inline-flex items-center gap-1.5 text-[0.9375rem] font-semibold text-[var(--pk)] hover:underline">{j.cta}<ArrowRight className="h-4 w-4" /></Link>}
                </div>
              </li>
            ))}
          </ol>
          {journeyImg && <img {...edImg("site.images.wsJourney")} src={journeyImg} alt="" className="hidden aspect-[4/5] w-full rounded-[32px] object-cover lg:sticky lg:top-28 lg:block" />}
        </div>
      </section>

      {/* What you get */}
      {c.wholesalePoints.length > 0 && (
        <section data-section="why" className="bg-[color-mix(in_srgb,var(--pk)_6%,#FFF8F5)]">
          <div className={`${WRAP} py-16 sm:py-20`}>
            <p className={eyebrow}>What you get</p>
            <h2 {...k("why.title")} className={`${serif} mt-3 text-[clamp(2rem,3.6vw,2.75rem)] font-semibold leading-tight`}>{T("why.title", "More than a bag of beans")}</h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {c.wholesalePoints.map((p) => (
                <div key={p.title} className="rounded-[22px] bg-white p-6 ring-1 ring-[#EDE3DB]">
                  <p className="flex items-start gap-2 text-[1.125rem] font-semibold"><Check className="mt-1 h-4 w-4 shrink-0 text-[var(--pk)]" />{p.title}</p>
                  <p className="mt-2 leading-relaxed text-[#5E5853]">{p.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Ordering — only once online wholesale ordering is switched on */}
      {ws.ordering && (
        <section id="order" data-section="order" className="scroll-mt-24 bg-[#1E1A18] text-white">
          <div className={`${WRAP} grid items-center gap-10 py-16 sm:py-24 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-16`}>
            <div>
              <p {...k("order.eyebrow")} className={`${eyebrow} !text-[color-mix(in_srgb,var(--pk)_55%,white)]`}>{T("order.eyebrow", "Wholesale ordering")}</p>
              <h2 {...k("order.title")} className={`${serif} mt-3 text-[clamp(2rem,3.8vw,3rem)] font-semibold leading-tight`}>{T("order.title", "Order in a minute, any time")}</h2>
              <ol className="mt-8 space-y-5">
                {[
                  { key: "o1", t: "Get set up", d: "Ask for our rates below. Once you're on board, your prices are set up for your business." },
                  { key: "o2", t: "Your own ordering link", d: "We email you a private link — no passwords. Bookmark it on the café computer or your phone." },
                  { key: "o3", t: `Delivered every ${day}`, d: `Order whenever suits you and it comes on the next run.${freight ? ` ${freight} (ex GST).` : ""} Pay by card, or on account if we've set one up for you.` },
                ].map((s, i) => (
                  <li key={s.key} className="flex gap-4">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 font-bold">{i + 1}</span>
                    <div><p {...k(`${s.key}.t`)} className="text-[1.125rem] font-semibold">{T(`${s.key}.t`, s.t)}</p><p {...k(`${s.key}.d`)} className="mt-1 leading-relaxed text-white/70">{T(`${s.key}.d`, s.d)}</p></div>
                  </li>
                ))}
              </ol>
              <div className="mt-10 rounded-[24px] bg-white/[0.06] p-6 ring-1 ring-white/10">
                <p className="text-[1.125rem] font-semibold">Already a wholesale customer?</p>
                <p className="mb-4 mt-1 text-white/70">Pop in your email and we&apos;ll send your ordering link straight away.</p>
                <WholesaleOrderNow slug={org.slug} dark />
              </div>
            </div>
            {orderImg && <img {...edImg("site.images.wsOrder")} src={orderImg} alt="" className="aspect-[4/5] w-full rounded-[32px] object-cover" />}
          </div>
        </section>
      )}

      {/* What we do */}
      {what.length > 1 && (
        <section data-section="what" className={`${WRAP} py-16 sm:py-20`}>
          <p {...k("what.eyebrow")} className={eyebrow}>{T("what.eyebrow", "What we do")}</p>
          <h2 {...k("what.title")} className={`${serif} mt-3 max-w-2xl text-[clamp(2rem,3.6vw,2.75rem)] font-semibold leading-tight`}>{T("what.title", `Coffee is all we do — and we do all of it`)}</h2>
          <div className={`mt-8 grid gap-4 sm:grid-cols-2 ${what.length >= 5 ? "lg:grid-cols-5" : what.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
            {what.map((w) => (
              <Link key={w.t} href={w.href} className="group flex flex-col rounded-[22px] bg-white p-6 ring-1 ring-[#EDE3DB] transition hover:-translate-y-0.5 hover:shadow-[0_18px_36px_-26px_rgba(80,45,40,.45)]">
                <span className="grid h-11 w-11 place-items-center rounded-full bg-[color-mix(in_srgb,var(--pk)_12%,white)] text-[var(--pk)]"><w.I className="h-5 w-5" /></span>
                <p className="mt-4 text-[1.125rem] font-semibold">{w.t}</p>
                <p className="mt-1 flex-1 text-[0.9375rem] leading-relaxed text-[#5E5853]">{w.d}</p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-[0.9063rem] font-semibold text-[var(--pk)]">{w.cta}<ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" /></span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Sign up for rates */}
      <section id="rates" data-section="contact" className="scroll-mt-24 bg-[color-mix(in_srgb,var(--pk)_6%,#FFF8F5)]">
        <div className={`${WRAP} grid gap-10 py-16 sm:py-24 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16`}>
          <div>
            <p {...k("rates.eyebrow")} className={eyebrow}>{T("rates.eyebrow", "Wholesale rates")}</p>
            <h2 {...k("rates.title")} className={`${serif} mt-3 text-[clamp(2rem,3.6vw,3rem)] font-semibold leading-tight`}>{T("rates.title", "Get our wholesale rates")}</h2>
            <p {...k("rates.text")} className="mt-4 whitespace-pre-line text-[1.0625rem] leading-relaxed text-[#5E5853]">{T("rates.text", "Tell us a little about your business and we'll come back with our rates, the coffees we'd suggest, and a time for a tasting.")}</p>
            <ul className="mt-6 space-y-2.5 text-[0.9688rem]">
              {[["rates.b1", "Our wholesale price list"], ["rates.b2", "A tasting with the roasters"], ["rates.b3", `Delivery every ${day}`]].map(([key, d]) => (
                <li key={key} className="flex items-start gap-2.5"><Check className="mt-0.5 h-5 w-5 shrink-0 text-[var(--pk)]" /><span {...k(key)}>{T(key, d)}</span></li>
              ))}
            </ul>
            {ws.ordering && <p className="mt-8 text-[0.9375rem] text-[#5E5853]">Already with us? <Link href="#order" className="font-semibold text-[var(--pk)] hover:underline">Order now</Link></p>}
          </div>
          <WholesaleSignup slug={org.slug} />
        </div>
      </section>

      {c.wholesaleFaq.length > 0 && (
        <section data-section="faq" className={`${WRAP} py-16`}>
          <h2 className={`${serif} text-[clamp(1.875rem,3vw,2.5rem)] font-semibold`}>Questions</h2>
          <div className="mt-6 divide-y divide-[#EDE3DB] rounded-[24px] bg-white px-6 ring-1 ring-[#EDE3DB]">
            {c.wholesaleFaq.map((f) => (
              <details key={f.q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">{f.q}<span className="text-[1.5rem] leading-none text-[var(--pk)] transition group-open:rotate-45">+</span></summary>
                <p className="mt-3 whitespace-pre-line leading-relaxed text-[#5E5853]">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      )}
    </CafeFrame>
  );
}
