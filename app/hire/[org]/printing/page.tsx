import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { siteMeta } from "@/lib/site/meta";
import { eventsOrg } from "@/lib/events/server";
import { readPrinting } from "@/lib/printing/core";
import { EventsFrame, eyebrow, serif, WRAP } from "@/components/events/frame";
import { ArtworkForm } from "@/components/printing/artwork-form";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ org: string }> }): Promise<Metadata> {
  const eo = await eventsOrg((await params).org);
  if (!eo || !readPrinting(eo.org.rawSettings).enabled) return { title: "Not found" };
  return siteMeta(eo.org, `/hire/${eo.org.slug}/printing`, { title: `Banner & Sign Printing${eo.s.city ? ` ${eo.s.city}` : ""} | ${eo.org.name}`, description: "Banners, signage, stickers and vinyl — send your artwork and get a quote." });
}

/** Printing: send a print job with your artwork, and see an estimate as you go. */
export default async function PrintingPage({ params }: { params: Promise<{ org: string }> }) {
  const eo = await eventsOrg((await params).org);
  if (!eo) notFound();
  const p = readPrinting(eo.org.rawSettings);
  if (!p.enabled) notFound();
  return (
    <EventsFrame org={eo.org} s={eo.s} active="printing">
      <section className={`${WRAP} grid gap-10 py-12 sm:py-16 lg:grid-cols-[0.85fr_1.15fr] lg:gap-14`}>
        <div>
          <p className={eyebrow}>Printing</p>
          <h1 className={`${serif} mt-4 text-[2.5rem] font-semibold leading-[1.05] sm:text-[3.25rem]`}>Banners, signs and stickers — printed for your event.</h1>
          <p className="mt-5 text-[1.0625rem] leading-relaxed text-[#5E5853]">{p.intro ?? "Send us your artwork and the sizes you need. We'll check the files and come back with a quote."}</p>
          <div className="mt-8 rounded-2xl bg-white p-5 text-[0.9375rem] ring-1 ring-[#EFE6DF]">
            <p className="font-semibold">How we price it</p>
            <ul className="mt-2 space-y-1 text-[#5E5853]">
              <li>${p.firstMetre} for the first lineal metre, then ${p.perMetre} a metre</li>
              <li>Rolls up to {p.rollWidth} m wide</li>
              <li>${p.setup} setup per job{p.cut ? ` · $${p.cut} to cut to shape` : ""}</li>
              <li>Prices plus GST</li>
            </ul>
          </div>
        </div>
        <ArtworkForm slug={eo.org.slug} rates={p} />
      </section>
    </EventsFrame>
  );
}
