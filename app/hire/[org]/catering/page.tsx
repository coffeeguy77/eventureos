import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/integrations/runtime";
import { cateringMenu, eventsOrg } from "@/lib/events/server";
import { EventsFrame, eyebrow, serif, WRAP } from "@/components/events/frame";
import { CateringBuilder } from "@/components/events/catering-builder";
import { ContactForm } from "@/components/events/contact-form";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ org: string }> }): Promise<Metadata> {
  const eo = await eventsOrg((await params).org);
  if (!eo) return { title: "Not found" };
  return { title: `Corporate Catering${eo.s.city ? ` ${eo.s.city}` : ""} — Breakfast, Lunch & Morning Tea | ${eo.org.name}`, description: "Build your catering order online — morning, lunch and afternoon deliveries — and see your total as you go.", alternates: { canonical: `/hire/${eo.org.slug}/catering` } };
}

export default async function CateringPage({ params }: { params: Promise<{ org: string }> }) {
  const eo = await eventsOrg((await params).org);
  if (!eo) notFound();
  const { org, s, today } = eo;
  const menu = await cateringMenu(createServiceClient(), org.id);
  return (
    <EventsFrame org={org} s={s} active="catering">
      <section className="py-10 sm:py-14" data-section="catering">
        <div className={WRAP}>
          <div className="mb-8 max-w-[780px]">
            <p className={eyebrow}>Catering{s.city ? ` · ${s.city}` : ""}</p>
            <h1 className={`${serif} mt-3 text-[2.5rem] font-semibold leading-[1.05] sm:text-[3.25rem]`}>Morning tea, lunch &amp; afternoon tea — delivered</h1>
            <p className="mt-3 text-[1.0625rem] text-[#5E5853]">Choose a delivery, set how many people, then add from the menu. Your total updates as you go{s.leadDays ? ` — order ${s.leadDays}+ days ahead to lock it in` : ""}.</p>
          </div>
          <CateringBuilder slug={org.slug} menu={menu} today={today} leadDays={s.leadDays} prefill={{ name: "", email: "", phone: "", company: "" }} />
        </div>
      </section>
      <section className="pb-20" data-section="contact">
        <div className="mx-auto w-full max-w-[940px] px-5 sm:px-8">
          <ContactForm slug={org.slug} section="catering" heading="Need something different?" intro="Bigger events, custom menus or dietary needs — tell us and we'll put it together." messageHint="What are you planning?" />
        </div>
      </section>
    </EventsFrame>
  );
}
