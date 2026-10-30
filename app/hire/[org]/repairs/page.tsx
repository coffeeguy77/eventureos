import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowRight, Ban, CalendarCheck, ClipboardList, Wrench } from "lucide-react";
import { siteMeta } from "@/lib/site/meta";
import { eventsOrg } from "@/lib/events/server";
import { readMachines } from "@/lib/machines/core";
import { EventsFrame, eyebrow, serif, WRAP } from "@/components/events/frame";
import { MachineEnquiryForm } from "@/components/machines/public/enquiry-form";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ org: string }> }): Promise<Metadata> {
  const eo = await eventsOrg((await params).org);
  const s = eo ? readMachines(eo.org.rawSettings) : null;
  if (!eo || !s?.serviceEnabled) return { title: "Not found" };
  return siteMeta(eo.org, `/hire/${eo.org.slug}/repairs`, {
    title: `Coffee Machine Repairs & Servicing${s.area ? ` ${s.area}` : eo.s.city ? ` ${eo.s.city}` : ""} | ${eo.org.name}`,
    description: "Commercial and office coffee machine repairs, servicing and installs. Send your machine details and we'll book you in.",
  });
}

const fmt = (n: number) => `$${n.toLocaleString("en-AU", { maximumFractionDigits: 2 })}`;

/** Repairs & servicing: the rates up front, the brands we don't touch said loudly, and the form (instead of a phone call). */
export default async function RepairsPage({ params }: { params: Promise<{ org: string }> }) {
  const eo = await eventsOrg((await params).org);
  if (!eo) notFound();
  const s = readMachines(eo.org.rawSettings);
  if (!s.serviceEnabled) notFound();
  const gst = s.ratesIncGst ? "inc GST" : "+ GST";
  const where = s.area ?? eo.s.city ?? null;
  const no = s.notServiced;
  return (
    <EventsFrame org={eo.org} s={eo.s} active="repairs">
      <section className="relative overflow-hidden bg-[#141A1F] text-white">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -right-24 -top-10 h-96 w-96 rounded-full bg-[var(--pk)] opacity-25 blur-3xl" />
          <div className="absolute bottom-0 left-10 h-72 w-72 rounded-full bg-[#2E9BC8] opacity-20 blur-3xl" />
          <div className="absolute inset-0 opacity-[0.06] [background-image:linear-gradient(#fff_1px,transparent_1px),linear-gradient(90deg,#fff_1px,transparent_1px)] [background-size:28px_28px]" />
        </div>
        <div className={`${WRAP} relative grid items-center gap-10 py-14 sm:py-20 lg:grid-cols-[1.1fr_0.9fr]`}>
          <div>
            <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.18em] text-white/70">Coffee machine service{where ? ` · ${where}` : ""}</p>
            <h1 className={`${serif} mt-4 text-[2.75rem] font-semibold leading-[1.02] sm:text-[4rem]`}>Machine down?<br /><span className="italic text-[#7FD3F2]">We&apos;ll fix it.</span></h1>
            <p className="mt-5 max-w-[540px] text-[1.0625rem] leading-relaxed text-white/75">{s.serviceIntro ?? "Repairs, servicing and installs for commercial and office coffee machines. Send us the details below and we'll book you in."}</p>
            <a href="#book" className="shop-btn mt-8 inline-flex h-[56px] items-center justify-center gap-2 rounded-full bg-[var(--pk)] px-8 text-[1rem] font-semibold text-white">Request a service <ArrowRight className="h-5 w-5" /></a>
          </div>
          <div className="rounded-[26px] bg-white p-6 text-[#151312] shadow-2xl sm:p-8">
            <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.16em] text-[#6B645F]">Service rates</p>
            <div className="mt-4 flex items-baseline justify-between gap-3 border-b border-[#EFE8E2] pb-4">
              <div><p className="text-[1.125rem] font-semibold">Callout + first hour</p><p className="text-[0.875rem] text-[#6B645F]">Charged even if it&apos;s a quick fix</p></div>
              <p className="text-[2rem] font-semibold">{fmt(s.calloutFirstHour)}</p>
            </div>
            <div className="flex items-baseline justify-between gap-3 pt-4">
              <div><p className="text-[1.125rem] font-semibold">Each hour after</p><p className="text-[0.875rem] text-[#6B645F]">In {s.incrementMin}-minute steps</p></div>
              <p className="text-[2rem] font-semibold">{fmt(s.hourly)}<span className="text-[1rem] text-[#6B645F]">/h</span></p>
            </div>
            <p className="mt-4 text-[0.8125rem] text-[#6B645F]">Prices {gst}. Parts are extra.</p>
          </div>
        </div>
      </section>

      {no.length > 0 && (
        <section className="bg-[#B42318] text-white">
          <div className={`${WRAP} flex flex-col items-start gap-3 py-6 sm:flex-row sm:items-center sm:gap-5`}>
            <Ban className="h-10 w-10 shrink-0" strokeWidth={2.2} />
            <div>
              <p className="text-[1.375rem] font-bold leading-tight sm:text-[1.625rem]">We don&apos;t service {no.join(" or ")} machines.</p>
              <p className="mt-1 text-[1rem] opacity-90">Not for repairs, servicing or parts — please contact {no.length === 1 ? no[0] : "the maker"} or the store you bought it from.</p>
            </div>
          </div>
        </section>
      )}

      <section className={`${WRAP} py-14 sm:py-16`}>
        <div className="grid gap-5 sm:grid-cols-3">
          {[
            { i: ClipboardList, t: "Send the details", d: "Brand, model and what's going wrong — a photo of any error helps." },
            { i: CalendarCheck, t: "We book you in", d: "We get back to you with a time that suits, by email or phone." },
            { i: Wrench, t: "We fix it", d: "On site, with any parts charged separately." },
          ].map((x, k) => (
            <div key={k} className="rounded-[22px] bg-white p-6 shadow-[0_18px_40px_-28px_rgba(80,45,40,.35)]">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--pk)_12%,white)] text-[var(--pk)]"><x.i className="h-5 w-5" /></span>
              <p className="mt-4 text-[1.125rem] font-semibold">{k + 1}. {x.t}</p>
              <p className="mt-1 text-[0.9375rem] text-[#5E5853]">{x.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="book" className="scroll-mt-24 bg-[#F6F1EC] py-14 sm:py-20">
        <div className={`${WRAP} grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-14`}>
          <div>
            <p className={eyebrow}>Request a service</p>
            <h2 className={`${serif} mt-3 text-[2.25rem] font-semibold leading-[1.08] sm:text-[2.75rem]`}>Use the form — it&apos;s the fastest way.</h2>
            <p className="mt-4 text-[1.0625rem] leading-relaxed text-[#5E5853]">Please send your request here rather than calling. It gives our technician everything they need up front, so we can come with the right parts.</p>
            {no.length > 0 && <p className="mt-5 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-[0.9375rem] font-semibold text-[#B42318] ring-1 ring-[#F3C7C1]"><Ban className="h-5 w-5" />No {no.join(" or ")} machines, sorry.</p>}
          </div>
          <MachineEnquiryForm slug={eo.org.slug} mode="service" notServiced={no} />
        </div>
      </section>
    </EventsFrame>
  );
}
