import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Snowflake } from "lucide-react";
import { eventsOrg } from "@/lib/events/server";
import { EventsFrame, btn, eyebrow, serif, WRAP } from "@/components/events/frame";
import { QuoteBand } from "@/components/events/blocks";
import { CupArt } from "@/components/events/art";
import { ContactForm } from "@/components/events/contact-form";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ org: string }> }): Promise<Metadata> {
  const eo = await eventsOrg((await params).org);
  if (!eo) return { title: "Not found" };
  return { title: `Event Drinks Menu — Coffee, Iced Lattes, Cold Brew & Chai${eo.s.city ? ` | ${eo.s.city}` : ""} | ${eo.org.name}`, description: `What our baristas serve at your event: ${eo.s.drinks.flatMap((g) => g.items.map((i) => i.name)).slice(0, 8).join(", ")}.`.slice(0, 160), alternates: { canonical: `/hire/${eo.org.slug}/drinks` } };
}

export default async function DrinksPage({ params }: { params: Promise<{ org: string }> }) {
  const eo = await eventsOrg((await params).org);
  if (!eo) notFound();
  const { org, s } = eo;
  const base = `/hire/${org.slug}`;
  const star = s.drinks.flatMap((g) => g.items).find((i) => i.tag) ?? null;
  return (
    <EventsFrame org={org} s={s} active="drinks">
      <section data-section="hero">
        <div className={`${WRAP} py-12 text-center sm:py-16 lg:py-20`}>
          <p className={eyebrow}>The drinks menu</p>
          <h1 className={`${serif} mx-auto mt-4 max-w-[900px] text-[2.75rem] font-semibold leading-[1.02] sm:text-[3.75rem] lg:text-[4.25rem]`}>Hot, iced and everything in between</h1>
          <p className="mx-auto mt-5 max-w-[620px] text-[1.125rem] leading-relaxed text-[#5E5853]">Everything our baristas can pour at your event — made to order, the way each guest likes it.</p>
        </div>
      </section>

      {star && (
        <section className="pb-14" data-section="feature">
          <div className={WRAP}>
            <div className="grid items-center gap-8 overflow-hidden rounded-[32px] bg-[#151312] p-8 text-white sm:p-12 lg:grid-cols-[1.2fr_1fr]">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full bg-[var(--pk)] px-3.5 py-1.5 text-[0.8125rem] font-bold uppercase tracking-[0.08em]"><Snowflake className="h-4 w-4" />{star.tag}</span>
                <p className={`${serif} mt-5 text-[2.75rem] font-semibold leading-tight sm:text-[3.5rem]`}>{star.name}</p>
                {star.note && <p className="mt-3 max-w-[460px] text-[1.125rem] text-white/75">{star.note}</p>}
                <Link href={`${base}/quote`} data-track={`Drinks: quote (${star.name})`} className={`${btn} mt-8`}>Add it to your event<ArrowRight className="h-5 w-5" /></Link>
              </div>
              {s.images.drinks
                ? <img src={s.images.drinks} alt={star.name} className="aspect-square w-full rounded-[24px] object-cover" />
                : <div className="grid aspect-square place-items-center rounded-[24px] bg-white/[0.06]"><CupArt className="w-[55%] text-[var(--pk)]" /></div>}
            </div>
          </div>
        </section>
      )}

      <section className="pb-6" data-section="menu">
        <div className={WRAP}>
          <div className="rounded-[32px] bg-white px-6 py-10 ring-1 ring-[#EDE3DB] sm:px-12 sm:py-14">
            <div className="grid gap-x-16 gap-y-12 md:grid-cols-2">
              {s.drinks.map((g) => (
                <div key={g.title}>
                  <p className={`${serif} text-[2rem] font-semibold`}>{g.title}</p>
                  {g.intro && <p className="mt-1 text-[0.9688rem] text-[#5E5853]">{g.intro}</p>}
                  <ul className="mt-5 space-y-4">
                    {g.items.map((i) => (
                      <li key={i.name}>
                        <div className="flex items-baseline gap-3">
                          <span className="text-[1.125rem] font-semibold">{i.name}</span>
                          <span aria-hidden className="min-w-6 flex-1 translate-y-[-4px] border-b-2 border-dotted border-[#E3D7CE]" />
                          {i.tag && <span className="shrink-0 rounded-full bg-[color-mix(in_srgb,var(--pk)_12%,white)] px-2.5 py-0.5 text-[0.75rem] font-bold text-[var(--pk)]">{i.tag}</span>}
                        </div>
                        {i.note && <p className="mt-0.5 text-[0.9375rem] text-[#5E5853]">{i.note}</p>}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            {!s.drinks.length && <p className="text-center text-[#5E5853]">Our drinks menu is coming soon — ask us what we can make for your event.</p>}
          </div>
        </div>
      </section>

      <QuoteBand slug={org.slug} title="Pour it at your event" body="Choose a cart, the van or equipment only and we'll email your quote." />

      <section className="pb-20" data-section="contact">
        <div className="mx-auto w-full max-w-[940px] px-5 sm:px-8">
          <ContactForm slug={org.slug} section="drinks" heading="Want something special on the menu?" intro="Ask us about seasonal drinks, branded menus or dietary needs." messageHint="What would you like us to serve?" />
        </div>
      </section>
    </EventsFrame>
  );
}
