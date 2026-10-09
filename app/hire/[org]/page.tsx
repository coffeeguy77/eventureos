import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CalendarCheck, CalendarDays, CircleCheck, Coffee, FileText, Leaf, Mail, Settings, ShoppingCart, Star, Tag, Truck, Users, UtensilsCrossed, type LucideIcon } from "lucide-react";
import { eventsOrg } from "@/lib/events/server";
import { hirePageSlug, offered, type EventsSettings, type HireKind } from "@/lib/events/core";
import { EventsFrame, eyebrow, serif, WRAP } from "@/components/events/frame";
import { KindVisual } from "@/components/events/blocks";
import { ContactForm } from "@/components/events/contact-form";
import { readShop } from "@/lib/shop/core";
import { copyOf, ed, edImg } from "@/lib/site/copy";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ org: string }> }): Promise<Metadata> {
  const eo = await eventsOrg((await params).org);
  if (!eo) return { title: "Not found" };
  const city = eo.s.city ? ` ${eo.s.city}` : "";
  return {
    title: `Coffee Cart, Coffee Van & Event Catering${city} | ${eo.org.name}`,
    description: `${eo.s.intro}`.slice(0, 160),
    alternates: { canonical: `/hire/${eo.org.slug}` },
  };
}

/** "for your *next event.*" → the starred words in the brand pink */
function Pink({ text }: { text: string }) {
  return <>{text.split(/(\*[^*]+\*)/).map((p, i) => (/^\*[^*]+\*$/.test(p) ? <span key={i} className="text-[var(--pk)]">{p.slice(1, -1)}</span> : <span key={i}>{p}</span>))}</>;
}

const KIND_ICON: Record<HireKind, LucideIcon> = { cart: ShoppingCart, van: Truck, diy: Settings };
const kindHref = (k: HireKind, slug: string, s: EventsSettings) => (k === "diy" ? `/hire/${slug}/quote?kind=diy` : `/hire/${slug}/${hirePageSlug(k, s)}`);

/** A photo card with a round icon badge overlapping the photo — used for the hire options and the extras. */
function PhotoCard({ href, icon: I, title, body, cta, image, track, edit }: { href: string; icon: LucideIcon; title: string; body: string; cta: string; image: React.ReactNode; track: string; edit: { title: string; body: string; cta: string } }) {
  return (
    <Link href={href} data-track={track} className="shop-card group flex flex-col overflow-hidden rounded-[14px] bg-white ring-1 ring-[#EDE3DB]">
      <div className="relative aspect-[4/3] overflow-hidden"><div className="shop-zoom h-full w-full">{image}</div></div>
      <div className="relative flex flex-1 flex-col px-6 pb-6 pt-9 sm:px-7">
        <span className="absolute -top-7 left-5 grid h-[54px] w-[54px] place-items-center rounded-full bg-white text-[var(--pk)] shadow-[0_8px_20px_-12px_rgba(60,30,20,.45)] ring-1 ring-[#F1E4E7]"><I className="h-6 w-6" strokeWidth={1.8} /></span>
        <p {...ed(edit.title)} className={`${serif} text-[1.75rem] font-semibold leading-tight`}>{title}</p>
        <p {...ed(edit.body)} className="mt-2 flex-1 text-[1rem] leading-relaxed text-[#5E5853]">{body}</p>
        <span className="mt-5 inline-flex items-center gap-2 text-[1rem] font-semibold text-[var(--pk)]"><span {...ed(edit.cta)}>{cta}</span><ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></span>
      </div>
    </Link>
  );
}

function SectionHead({ kicker, title, intro, k }: { kicker: string; title: string; intro?: string; k: string }) {
  return (
    <div className="grid items-end gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] lg:gap-12">
      <div>
        <p {...ed(`copy:events.${k}.kicker`)} className={eyebrow}>{kicker}</p>
        <h2 {...ed(`copy:events.${k}.title`)} className={`${serif} mt-2 text-[2.25rem] font-semibold leading-[1.05] sm:text-[2.875rem]`}>{title}</h2>
      </div>
      {intro && <p {...ed(`copy:events.${k}.intro`)} className="text-[1rem] leading-relaxed text-[#3F3A36] lg:pb-2">{intro}</p>}
    </div>
  );
}

export default async function EventsHome({ params }: { params: Promise<{ org: string }> }) {
  const eo = await eventsOrg((await params).org);
  if (!eo) notFound();
  const { org, s } = eo;
  const base = `/hire/${org.slug}`;
  const lines = s.heading.split("|").map((x) => x.trim()).filter(Boolean);
  const kinds = offered(s);
  const c = copyOf(org.rawSettings, "events");
  const roastedIn = readShop(org.rawSettings).roastedIn;
  const features: { I: LucideIcon; k: string; t: string }[] = [
    ...(roastedIn ? [{ I: Leaf, k: "f1", t: c("hero.f1", `Locally roasted\nin ${roastedIn}`) }] : []),
    { I: Users, k: "f2", t: c("hero.f2", "Events big\n& small") },
    { I: CalendarDays, k: "f3", t: c("hero.f3", "Flexible hire\noptions") },
    { I: Star, k: "f4", t: c("hero.f4", "Experienced\nbaristas") },
  ];
  const steps: { I: LucideIcon; t: string; b: string }[] = [
    { I: FileText, t: c("how.s1.title", "Build your event"), b: c("how.s1.text", "Tell us the basics — date, location, guests and what you're after.") },
    { I: CalendarCheck, t: c("how.s2.title", "We check the calendar"), b: c("how.s2.text", "We'll confirm availability and suggest the best options.") },
    { I: Mail, t: c("how.s3.title", "Your quote arrives by email"), b: c("how.s3.text", "A detailed quote with everything you need, usually within hours.") },
    { I: CircleCheck, t: c("how.s4.title", "Accept & lock it in"), b: c("how.s4.text", "Happy with the quote? Simply confirm and we'll take care of the rest.") },
  ];
  const optionCount = kinds.length;
  return (
    <EventsFrame org={org} s={s} active="home">
      {/* Hero */}
      <section className="relative overflow-hidden bg-[#FCFAF7]" data-section="hero">
        {s.images.hero && (
          <div className="absolute inset-y-0 right-0 hidden w-[64%] lg:block" aria-hidden>
            <img {...edImg("events.images.hero")} src={s.images.hero} alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-y-0 left-0 w-[46%] bg-[linear-gradient(90deg,#FCFAF7_0%,rgba(252,250,247,.92)_28%,rgba(252,250,247,.55)_62%,rgba(252,250,247,0)_100%)]" />
          </div>
        )}
        <div className={`${WRAP} relative py-12 sm:py-16 lg:min-h-[560px] lg:py-[72px]`}>
          <div className="max-w-[500px]">
            <p {...ed("copy:events.hero.kicker")} className={`${eyebrow} text-[0.8125rem]`}>{c("hero.kicker", `Event coffee${s.city ? ` · ${s.city}` : ""}`)}</p>
            <h1 {...ed("events.heading", s.heading)} className={`${serif} mt-3 text-[3rem] font-semibold leading-[0.98] tracking-[-0.025em] sm:text-[4rem] lg:text-[4.5rem]`}>
              {lines.map((l, i) => <span key={i} className="block"><Pink text={l} /></span>)}
            </h1>
            <p {...ed("events.intro")} className="mt-5 max-w-[440px] text-[1.0625rem] leading-relaxed text-[#2B2623]">{s.intro}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href={`${base}/quote`} data-track="Build my quote (hero)" className="shop-btn inline-flex h-[52px] items-center justify-center gap-2.5 rounded-full bg-[var(--pk)] px-8 text-[1rem] font-semibold text-white shadow-[0_16px_30px_-16px_var(--pk)] hover:brightness-105"><span {...ed("copy:events.hero.cta")}>{c("hero.cta", "Build my quote")}</span><ArrowRight className="h-5 w-5" /></Link>
              <Link href={`${base}/drinks`} className="shop-btn inline-flex h-[52px] items-center justify-center rounded-full border-[1.5px] border-[#1F1B19] bg-white/80 px-8 text-[1rem] font-semibold text-[#1F1B19] hover:bg-white"><span {...ed("copy:events.hero.cta2")}>{c("hero.cta2", "See the drinks")}</span></Link>
            </div>
            <ul className="mt-9 flex flex-wrap gap-x-7 gap-y-5">
              {features.map((f) => (
                <li key={f.t} className="w-[100px]">
                  <f.I className="h-8 w-8 text-[var(--pk)]" strokeWidth={1.6} />
                  <p {...ed(`copy:events.hero.${f.k}`)} className="mt-2 whitespace-pre-line text-[0.875rem] font-medium leading-snug text-[#2B2623]">{f.t}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
        {s.images.hero && <img {...edImg("events.images.hero")} src={s.images.hero} alt="" className="block aspect-[16/10] w-full object-cover lg:hidden" />}
      </section>

      {/* Options */}
      <section className="py-14 sm:py-16" data-section="choose">
        <div className={WRAP}>
          <SectionHead k="options" kicker={c("options.kicker", "Our options")} title={c("options.title", "Choose how you'd like your coffee.")}
            intro={c("options.intro", kinds.length > 1 ? `From a compact ${s.labels.cart.toLowerCase()} to our fully equipped ${s.labels.van.toLowerCase()}, or equipment hire for your own setup — we'll help you find the perfect fit for your event.` : "")} />
          <div className={`mt-9 grid gap-6 ${optionCount >= 3 ? "md:grid-cols-3" : optionCount === 2 ? "md:grid-cols-2" : ""}`}>
            {kinds.map((k) => (
              <PhotoCard key={k} href={kindHref(k, org.slug, s)} icon={KIND_ICON[k]} title={s.labels[k]} body={s.blurbs[k]} cta={c("options.cta", "Find out more")} track={`Choose ${s.labels[k]}`}
                edit={{ title: `events.labels.${k}`, body: `events.blurbs.${k}`, cta: "copy:events.options.cta" }}
                image={<div {...edImg(`events.images.${k}`)} className="h-full w-full"><KindVisual kind={k} s={s} /></div>} />
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="relative overflow-hidden bg-[#FDEFF2] py-14 sm:py-16" data-section="how">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_80%_at_85%_10%,rgba(255,255,255,.7),transparent_70%),radial-gradient(50%_70%_at_10%_90%,rgba(255,255,255,.55),transparent_70%)]" />
        <div className={`${WRAP} relative`}>
          <p {...ed("copy:events.how.kicker")} className={eyebrow}>{c("how.kicker", "How it works")}</p>
          <h2 {...ed("copy:events.how.title")} className={`${serif} mt-2 text-[2.25rem] font-semibold leading-[1.05] sm:text-[2.875rem]`}>{c("how.title", "Quote online in a couple of minutes.")}</h2>
          <ol className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((x, i) => (
              <li key={x.t} className="rounded-[14px] bg-white p-6 shadow-[0_14px_30px_-26px_rgba(80,45,40,.5)] ring-1 ring-[#F3E3E7]">
                <div className="flex items-center gap-4">
                  <span className={`${serif} text-[1.875rem] font-semibold leading-none text-[var(--pk)]`}>{i + 1}</span>
                  <x.I className="h-8 w-8 text-[var(--pk)]" strokeWidth={1.6} />
                </div>
                <p {...ed(`copy:events.how.s${i + 1}.title`)} className={`${serif} mt-4 text-[1.5rem] font-semibold leading-tight`}>{x.t}</p>
                <p {...ed(`copy:events.how.s${i + 1}.text`)} className="mt-2 text-[0.9688rem] leading-relaxed text-[#5E5853]">{x.b}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Extras */}
      <section className="py-14 sm:py-16" data-section="more">
        <div className={WRAP}>
          <SectionHead k="extras" kicker={c("extras.kicker", "Popular extras")} title={c("extras.title", "Make it your own.")} intro={c("extras.intro", "Great coffee is just the beginning. Add catering, custom branding or explore our drinks menu to create a memorable experience.")} />
          <div className="mt-9 grid gap-6 md:grid-cols-3">
            <PhotoCard href={`${base}/drinks`} icon={Coffee} title={c("extras.drinks.title", "The drinks menu")} body={c("extras.drinks.text", "From classic espresso drinks to seasonal specials, cold brew and more. Quality coffee for every occasion.")} cta={c("extras.drinks.cta", "See the menu")} track="Extras: drinks"
              edit={{ title: "copy:events.extras.drinks.title", body: "copy:events.extras.drinks.text", cta: "copy:events.extras.drinks.cta" }}
              image={s.images.drinks ? <img {...edImg("events.images.drinks")} src={s.images.drinks} alt="" className="h-full w-full object-cover" /> : <div className="h-full w-full bg-[#F4ECE6]" />} />
            <PhotoCard href={`${base}/branding`} icon={Tag} title={c("extras.branding.title", "Brand the cart")} edit={{ title: "copy:events.extras.branding.title", body: "copy:events.extras.branding.text", cta: "copy:events.extras.branding.cta" }} body={c("extras.branding.text", `Turn heads with custom branding. We can wrap our ${(s.labels.cart.split(" ").pop() ?? "cart").toLowerCase()}s to showcase your brand${s.stickerPrice ? ` and put your logo on every cup` : ""} and make a lasting impression.`)} cta={c("extras.branding.cta", "Branding options")} track="Extras: branding"
              image={s.images.branding ? <img {...edImg("events.images.branding")} src={s.images.branding} alt="" className="h-full w-full object-cover" /> : <div className="h-full w-full bg-[#F4ECE6]" />} />
            <PhotoCard href={`${base}/catering`} icon={UtensilsCrossed} title={c("extras.catering.title", "Catering")} body={c("extras.catering.text", "Delicious catering options to complement your coffee. From fresh pastries to substantial packs.")} cta={c("extras.catering.cta", "View catering")} track="Extras: catering"
              edit={{ title: "copy:events.extras.catering.title", body: "copy:events.extras.catering.text", cta: "copy:events.extras.catering.cta" }}
              image={s.images.catering ? <img {...edImg("events.images.catering")} src={s.images.catering} alt="" className="h-full w-full object-cover" /> : <div className="h-full w-full bg-[#F4ECE6]" />} />
          </div>
        </div>
      </section>

      {/* Lock in your date */}
      <section className="relative overflow-hidden bg-[#161210] text-white" data-section="quote-band">
        {s.images.band && <img {...edImg("events.images.band")} src={s.images.band} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover object-right" />}
        <div aria-hidden className="absolute inset-0 bg-[linear-gradient(90deg,rgba(22,18,16,.92)_0%,rgba(22,18,16,.75)_38%,rgba(22,18,16,0)_70%)]" />
        <div className={`${WRAP} relative flex flex-col gap-6 py-10 sm:flex-row sm:items-center sm:justify-between sm:py-9`}>
          <div className="max-w-[560px]">
            <p {...ed("copy:events.band.kicker")} className="text-[0.8125rem] font-semibold uppercase tracking-[0.16em] text-white/90">{c("band.kicker", "Your event. Our coffee")}</p>
            <p {...ed("copy:events.band.title")} className={`${serif} mt-1 text-[2.25rem] font-semibold leading-tight sm:text-[2.75rem]`}>{c("band.title", "Lock in your date.")}</p>
            <p {...ed("copy:events.band.text")} className="mt-1.5 text-[1rem] leading-relaxed text-white/85">{c("band.text", `Popular dates fill fast — get your quote online and secure your event with ${org.name}.`)}</p>
          </div>
          <Link href={`${base}/quote`} data-track="Quote band: Lock in your date" className="shop-btn inline-flex h-[52px] shrink-0 items-center justify-center gap-2.5 self-start rounded-full bg-[var(--pk)] px-8 text-[1rem] font-semibold text-white shadow-[0_16px_30px_-16px_var(--pk)] sm:self-auto"><span {...ed("copy:events.band.cta")}>{c("band.cta", "Build my quote")}</span><ArrowRight className="h-5 w-5" /></Link>
        </div>
      </section>

      {/* Contact */}
      <section className="py-12 sm:py-14" data-section="contact">
        <div className={`${WRAP} grid items-center gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-12`}>
          {s.images.contact
            ? <img {...edImg("events.images.contact")} src={s.images.contact} alt="" className="hidden aspect-[7/3] w-full rounded-[14px] object-cover lg:block" />
            : <div className="hidden lg:block" />}
          <div>
            <p {...ed("copy:events.contact.kicker")} className={eyebrow}>{c("contact.kicker", "Have a question?")}</p>
            <h2 {...ed("copy:events.contact.title")} className={`${serif} mt-1 text-[2rem] font-semibold leading-tight sm:text-[2.25rem]`}>{c("contact.title", "Rather talk it through?")}</h2>
            <p {...ed("copy:events.contact.text")} className="mt-1 text-[1rem] text-[#5E5853]">{c("contact.text", "Send us a message and we'll get back to you.")}</p>
            <div className="mt-5"><ContactForm plain slug={org.slug} section="events" heading="Rather talk it through?" messageHint="Tell us about your event" /></div>
          </div>
        </div>
      </section>
    </EventsFrame>
  );
}
