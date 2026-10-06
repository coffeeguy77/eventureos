import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Eye, Gift, Megaphone, PenTool, Printer, Truck } from "lucide-react";
import { eventsOrg } from "@/lib/events/server";
import { offered } from "@/lib/events/core";
import { EventsFrame, Heading, btn, btnOutline, eyebrow, serif, WRAP } from "@/components/events/frame";
import { QuoteBand } from "@/components/events/blocks";
import { CartArt } from "@/components/events/art";
import { ContactForm } from "@/components/events/contact-form";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ org: string }> }): Promise<Metadata> {
  const eo = await eventsOrg((await params).org);
  if (!eo) return { title: "Not found" };
  return { title: `Branded Coffee Cart & Logo Cup Stickers${eo.s.city ? ` ${eo.s.city}` : ""} | ${eo.org.name}`, description: "Wrap the coffee cart in your signage and put your logo on every cup — sponsor the coffee and everyone remembers who shouted it.", alternates: { canonical: `/hire/${eo.org.slug}/branding` } };
}

const money = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

export default async function BrandingPage({ params }: { params: Promise<{ org: string }> }) {
  const eo = await eventsOrg((await params).org);
  if (!eo) notFound();
  const { org, s } = eo;
  const base = `/hire/${org.slug}`;
  const what = offered(s).filter((k) => k !== "diy").map((k) => s.labels[k].toLowerCase()).join(" or ") || "cart";
  const logo = org.logo_url && /^https:\/\//.test(org.logo_url) ? org.logo_url : null;
  return (
    <EventsFrame org={org} s={s} active="branding">
      <section data-section="hero">
        <div className={`${WRAP} grid items-center gap-10 py-12 sm:py-16 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:py-20`}>
          <div>
            <p className={eyebrow}>Branding &amp; sponsorship</p>
            <h1 className={`${serif} mt-4 text-[2.75rem] font-semibold leading-[1.02] sm:text-[3.75rem] lg:text-[4.25rem]`}>Everyone loves a free coffee.<span className="block text-[var(--pk)]">They&apos;ll remember who shouted it.</span></h1>
            <p className="mt-6 max-w-[540px] text-[1.125rem] leading-relaxed text-[#5E5853]">Wrap the {what} in your signage and put your logo on every cup. Your guests get great coffee — your brand gets seen in every hand, every photo and every queue.</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href={`${base}/quote`} data-track="Branding: build quote" className={btn}>Build my quote<ArrowRight className="h-5 w-5" /></Link>
              <a href="#talk" className={btnOutline}>Talk artwork</a>
            </div>
          </div>
          {/* Cup + sticker mock */}
          <div className="relative grid aspect-[5/4] place-items-center overflow-hidden rounded-[34px] bg-[radial-gradient(120%_90%_at_30%_20%,#FFF1F3_0%,#FBE4E7_55%,#F4D3D8_100%)]">
            {s.images.branding ? <img src={s.images.branding} alt="A branded coffee cart" className="absolute inset-0 h-full w-full object-cover" /> : (
              <div className="relative flex items-end gap-6">
                <CartArt className="hidden w-[300px] text-[#151312]/70 sm:block" />
                <div className="relative mb-2">
                  <div className="h-[170px] w-[118px] rounded-b-[26px] rounded-t-[8px] bg-white shadow-[0_30px_50px_-24px_rgba(80,40,40,.5)] [clip-path:polygon(0_0,100%_0,88%_100%,12%_100%)]" />
                  <div className="absolute -top-3 left-[-6px] h-4 w-[130px] rounded-full bg-[#151312]" />
                  <div className="absolute left-1/2 top-[52px] grid h-[64px] w-[64px] -translate-x-1/2 place-items-center overflow-hidden rounded-full bg-[var(--pk)] text-center text-[0.5625rem] font-black uppercase leading-tight tracking-wide text-white ring-4 ring-white">
                    {logo ? <img src={logo} alt="" className="h-full w-full bg-white object-contain p-1.5" /> : <>Your<br />logo</>}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="bg-[#FFF7F5] py-14 sm:py-20" data-section="options">
        <div className={WRAP}>
          <Heading kicker="Two ways to brand it" title="Make the coffee yours" />
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            <div className="rounded-[26px] bg-white p-7 ring-1 ring-[#EDE3DB] sm:p-9">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-[color-mix(in_srgb,var(--pk)_12%,white)] text-[var(--pk)]"><Truck className="h-[22px] w-[22px]" /></span>
              <p className={`${serif} mt-5 text-[1.875rem] font-semibold`}>Wrap the {what}</p>
              <p className="mt-2 text-[1rem] leading-relaxed text-[#5E5853]">Your signage on the {what} — the centrepiece of the room, with your brand front and centre for the whole event. Send us your artwork and we&apos;ll quote it with your hire.</p>
              <ul className="mt-5 space-y-2 text-[0.9688rem]">{["Product launches & expos", "Conferences & sponsor booths", "Staff appreciation days", "Weddings & milestones"].map((t) => <li key={t} className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[var(--pk)]" />{t}</li>)}</ul>
            </div>
            <div className="rounded-[26px] bg-white p-7 ring-1 ring-[#EDE3DB] sm:p-9">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-[color-mix(in_srgb,var(--pk)_12%,white)] text-[var(--pk)]"><Gift className="h-[22px] w-[22px]" /></span>
              <p className={`${serif} mt-5 text-[1.875rem] font-semibold`}>Your logo on every cup</p>
              <p className="mt-2 text-[1rem] leading-relaxed text-[#5E5853]">{s.stickerSize.charAt(0).toUpperCase() + s.stickerSize.slice(1)} stickers with your logo, printed and applied to the cups by us. Every coffee walks out with your brand on it.</p>
              {s.stickerPrice != null && (
                <p className="mt-6 flex items-baseline gap-2"><span className={`${serif} text-[2.75rem] font-semibold text-[var(--pk)]`}>{money(s.stickerPrice)}</span><span className="text-[1rem] font-semibold">each — printed + applied</span></p>
              )}
              <p className="mt-2 text-[0.9375rem] text-[#5E5853]">Add them in the quote builder — one per coffee, or as many as you like.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-14 sm:py-20" data-section="why">
        <div className={WRAP}>
          <Heading kicker="Why sponsor the coffee?" title="The friendliest advertising there is" center />
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {[
              { i: Eye, t: "Seen all day", b: "The coffee queue is the busiest spot at any event — and your brand is right there." },
              { i: Megaphone, t: "Shared everywhere", b: "Cups end up in hands, on desks and in photos long after the last coffee." },
              { i: Gift, t: "Goodwill you can feel", b: "Nobody forgets who shouted the coffee. It's a gift people genuinely enjoy." },
            ].map((x) => (
              <div key={x.t} className="rounded-[22px] bg-white p-7 text-center ring-1 ring-[#EDE3DB]">
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[color-mix(in_srgb,var(--pk)_12%,white)] text-[var(--pk)]"><x.i className="h-[22px] w-[22px]" /></span>
                <p className="mt-4 text-[1.1875rem] font-semibold">{x.t}</p>
                <p className="mt-1.5 text-[0.9688rem] leading-relaxed text-[#5E5853]">{x.b}</p>
              </div>
            ))}
          </div>
          <div className="mx-auto mt-14 grid max-w-[980px] gap-4 sm:grid-cols-3">
            {[{ i: PenTool, t: "Send your artwork", b: "Your logo or design files" }, { i: Eye, t: "Approve the proof", b: "We send it over to check" }, { i: Printer, t: "We print & apply", b: "Ready on the day of your event" }].map((x, n) => (
              <div key={x.t} className="flex items-center gap-4 rounded-2xl bg-[#FCF7F4] p-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-[var(--pk)] ring-1 ring-[#EDE3DB]"><x.i className="h-5 w-5" /></span>
                <span><span className="block text-[0.75rem] font-bold text-[var(--pk)]">STEP {n + 1}</span><span className="block font-semibold">{x.t}</span><span className="text-[0.875rem] text-[#5E5853]">{x.b}</span></span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <QuoteBand slug={org.slug} title="Sponsor the coffee at your next event" body="Build your quote and tick the branding options — we'll talk artwork when we send it." />

      <section className="pb-20" data-section="contact" id="talk">
        <div className="mx-auto w-full max-w-[940px] px-5 sm:px-8">
          <ContactForm slug={org.slug} section="branding" heading="Let's talk artwork" intro="Tell us about your brand and event, and we'll come back with ideas and a quote." messageHint="Logo, colours, event, how many cups…" />
        </div>
      </section>
    </EventsFrame>
  );
}
