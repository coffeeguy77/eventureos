import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Coffee, Snowflake, Sparkles, Sticker, UtensilsCrossed } from "lucide-react";
import { eventsOrg } from "@/lib/events/server";
import { EventsFrame, Heading, btn, btnOutline, eyebrow, serif, WRAP } from "@/components/events/frame";
import { HowItWorks, KindCards, QuoteBand } from "@/components/events/blocks";
import { CartArt } from "@/components/events/art";
import { ContactForm } from "@/components/events/contact-form";

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

export default async function EventsHome({ params }: { params: Promise<{ org: string }> }) {
  const eo = await eventsOrg((await params).org);
  if (!eo) notFound();
  const { org, s } = eo;
  const base = `/hire/${org.slug}`;
  const lines = s.heading.split("|").map((x) => x.trim()).filter(Boolean);
  return (
    <EventsFrame org={org} s={s} active="home">
      {/* Hero */}
      <section className="relative overflow-hidden" data-section="hero">
        <div className={`${WRAP} grid items-center gap-10 py-12 sm:py-16 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:py-20`}>
          <div>
            <p className={eyebrow}>Event coffee{s.city ? ` · ${s.city}` : ""}</p>
            <h1 className={`${serif} mt-4 text-[2.75rem] font-semibold leading-[1.02] sm:text-[3.75rem] lg:text-[4.25rem]`}>
              {lines.map((l, i) => <span key={i} className="block">{l}</span>)}
            </h1>
            <p className="mt-6 max-w-[520px] text-[1.125rem] leading-relaxed text-[#5E5853]">{s.intro}</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href={`${base}/quote`} data-track="Build my quote (hero)" className={btn}>Build my quote<ArrowRight className="h-5 w-5" /></Link>
              <Link href={`${base}/drinks`} className={btnOutline}>See the drinks</Link>
            </div>
            <p className="mt-6 text-[0.9375rem] text-[#5E5853]">Already booked with us? <Link href={`/p/${org.slug}`} className="font-semibold text-[#151312] underline decoration-[var(--pk)] decoration-2 underline-offset-4">Sign in to your client portal</Link></p>
          </div>
          <div className="relative">
            <div className="relative aspect-[5/4] overflow-hidden rounded-[34px]">
              {s.images.hero
                ? <img src={s.images.hero} alt="" className="h-full w-full object-cover" />
                : <div className="grid h-full w-full place-items-center bg-[radial-gradient(120%_90%_at_30%_20%,#FFF1F3_0%,#FBE4E7_55%,#F4D3D8_100%)]"><CartArt className="w-[58%] text-[var(--pk)]" /></div>}
            </div>
            <div className="absolute -left-3 bottom-8 hidden rounded-2xl bg-white px-4 py-3 shadow-[0_20px_40px_-24px_rgba(80,45,40,.45)] ring-1 ring-[#EDE3DB] sm:flex sm:items-center sm:gap-3">
              <Snowflake className="h-5 w-5 text-[var(--pk)]" /><span className="text-[0.9375rem] font-semibold">Iced lattes &amp; cold brew</span>
            </div>
            <div className="absolute -right-2 top-8 hidden rounded-2xl bg-white px-4 py-3 shadow-[0_20px_40px_-24px_rgba(80,45,40,.45)] ring-1 ring-[#EDE3DB] sm:flex sm:items-center sm:gap-3">
              <Sticker className="h-5 w-5 text-[var(--pk)]" /><span className="text-[0.9375rem] font-semibold">Your logo on every cup</span>
            </div>
          </div>
        </div>
      </section>

      {/* Choose */}
      <section className="py-14 sm:py-20" data-section="choose">
        <div className={WRAP}>
          <Heading kicker="What would you like?" title="Choose how you'd like your coffee" intro="Pick one to start your quote — you can add more days, hours and baristas as you go." />
          <div className="mt-10"><KindCards slug={org.slug} s={s} /></div>
        </div>
      </section>

      {/* How */}
      <section className="bg-[#FFF7F5] py-14 sm:py-20" data-section="how">
        <div className={WRAP}>
          <Heading kicker="How it works" title="Quote online in a couple of minutes" />
          <div className="mt-10"><HowItWorks s={s} /></div>
        </div>
      </section>

      {/* More */}
      <section className="py-14 sm:py-20" data-section="more">
        <div className={`${WRAP} grid gap-6 md:grid-cols-3`}>
          {[
            { href: `${base}/drinks`, icon: Coffee, t: "The drinks menu", b: "Hot and iced coffee, cold brew, chai, hot chocolate and every milk you can think of." },
            { href: `${base}/branding`, icon: Sparkles, t: "Brand the cart", b: `Wrap it in your signage${s.stickerPrice ? ` and put your logo on every cup with ${s.stickerSize} stickers` : ""} — everyone remembers who shouted the coffee.` },
            { href: `${base}/catering`, icon: UtensilsCrossed, t: "Catering", b: "Morning tea, lunch and afternoon tea delivered — build your order and see the total as you go." },
          ].map((x) => (
            <Link key={x.href} href={x.href} className="shop-card group rounded-[24px] bg-white p-7 ring-1 ring-[#EDE3DB]">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-[color-mix(in_srgb,var(--pk)_12%,white)] text-[var(--pk)]"><x.icon className="h-[22px] w-[22px]" /></span>
              <p className={`${serif} mt-5 text-[1.625rem] font-semibold`}>{x.t}</p>
              <p className="mt-2 text-[0.9688rem] leading-relaxed text-[#5E5853]">{x.b}</p>
              <span className="mt-5 inline-flex items-center gap-2 font-semibold text-[var(--pk)]">Have a look<ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></span>
            </Link>
          ))}
        </div>
      </section>

      <QuoteBand slug={org.slug} title="Lock in your date" body={s.fleet.van === 1 ? "We only have one coffee van and it books out fast — check your date now." : "Check your date and get your quote by email."} />

      <section className="pb-20" data-section="contact">
        <div className="mx-auto w-full max-w-[940px] px-5 sm:px-8">
          <ContactForm slug={org.slug} section="events" heading="Rather talk it through?" intro="Send us a message and we'll get back to you." messageHint="Tell us about your event" />
        </div>
      </section>
    </EventsFrame>
  );
}
