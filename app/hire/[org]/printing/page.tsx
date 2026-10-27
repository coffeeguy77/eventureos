import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { siteMeta } from "@/lib/site/meta";
import { eventsOrg } from "@/lib/events/server";
import { readPrinting } from "@/lib/printing/core";
import { EventsFrame, eyebrow, serif, WRAP } from "@/components/events/frame";
import { ArrowRight, Printer, Scissors } from "lucide-react";
import { ArtworkForm } from "@/components/printing/artwork-form";
import { PriceGuide } from "@/components/printing/price-guide";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ org: string }> }): Promise<Metadata> {
  const eo = await eventsOrg((await params).org);
  if (!eo || !readPrinting(eo.org.rawSettings).enabled) return { title: "Not found" };
  return siteMeta(eo.org, `/hire/${eo.org.slug}/printing`, { title: `Banner & Sign Printing${eo.s.city ? ` ${eo.s.city}` : ""} | ${eo.org.name}`, description: "Banners, signage, stickers and vinyl — send your artwork and get a quote." });
}

/** Printing: a hero that sells it, the price guide, then send a print job with your artwork. */
export default async function PrintingPage({ params }: { params: Promise<{ org: string }> }) {
  const eo = await eventsOrg((await params).org);
  if (!eo) notFound();
  const p = readPrinting(eo.org.rawSettings);
  if (!p.enabled) notFound();
  return (
    <EventsFrame org={eo.org} s={eo.s} active="printing">
      {/* Hero */}
      <section className="relative overflow-hidden bg-[#161213] text-white">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-[#00AEEF] opacity-25 blur-3xl" />
          <div className="absolute right-0 top-0 h-80 w-80 rounded-full bg-[var(--pk)] opacity-30 blur-3xl" />
          <div className="absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-[#FFE600] opacity-15 blur-3xl" />
          <div className="absolute inset-0 opacity-[0.07] [background-image:radial-gradient(#fff_1px,transparent_1px)] [background-size:14px_14px]" />
        </div>
        <div className={`${WRAP} relative grid items-center gap-10 py-14 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12`}>
          <div>
            <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.18em] text-white/70">In-house printing{eo.s.city ? ` · ${eo.s.city}` : ""}</p>
            <h1 className={`${serif} mt-4 text-[2.75rem] font-semibold leading-[1.02] sm:text-[4.25rem]`}>Print it big.<br /><span className="bg-[linear-gradient(90deg,#00AEEF,var(--pk),#FFE600)] bg-clip-text italic text-transparent">Make it pop.</span></h1>
            <p className="mt-5 max-w-[520px] text-[1.0625rem] leading-relaxed text-white/75">{p.intro ?? "Banners, signage, stickers and decals — printed and cut right here. Send your artwork, see a price straight away, and we'll check every file before it prints."}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a href="#send" className="shop-btn inline-flex h-[56px] items-center justify-center gap-2 rounded-full bg-[var(--pk)] px-8 text-[1rem] font-semibold text-white shadow-[0_16px_30px_-12px_var(--pk)]">Send your artwork <ArrowRight className="h-5 w-5" /></a>
              <a href="#price" className="shop-btn inline-flex h-[56px] items-center justify-center rounded-full border-[1.5px] border-white/40 px-8 text-[1rem] font-semibold text-white hover:bg-white/10">Price my job</a>
            </div>
            {p.equipment.length > 0 && (
              <div className="mt-8 flex flex-wrap gap-2">
                {p.equipment.map((e, k) => <span key={k} className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-2 text-[0.8125rem] font-medium ring-1 ring-white/15">{/cut|plot|graphtec/i.test(e) ? <Scissors className="h-4 w-4 text-[#FFE600]" /> : <Printer className="h-4 w-4 text-[#00AEEF]" />}{e}</span>)}
              </div>
            )}
          </div>
          <PrinterArt rollWidth={p.rollWidth} />
        </div>
        <div className="relative border-t border-white/10">
          <div className={`${WRAP} grid grid-cols-3 divide-x divide-white/10 py-5 text-center`}>
            <div><p className="text-[1.5rem] font-semibold sm:text-[1.875rem]">{p.rollWidth} m</p><p className="text-[0.75rem] text-white/60 sm:text-[0.875rem]">wide rolls</p></div>
            <div><p className="text-[1.5rem] font-semibold sm:text-[1.875rem]">${p.printMetre}<span className="text-[1rem] text-white/60">/m</span></p><p className="text-[0.75rem] text-white/60 sm:text-[0.875rem]">printed, + GST</p></div>
            <div><p className="text-[1.5rem] font-semibold sm:text-[1.875rem]">Any shape</p><p className="text-[0.75rem] text-white/60 sm:text-[0.875rem]">contour cut</p></div>
          </div>
        </div>
      </section>

      {/* Price guide */}
      <section id="price" className={`${WRAP} scroll-mt-24 py-14 sm:py-20`}>
        <p className={eyebrow}>Price guide</p>
        <h2 className={`${serif} mt-3 max-w-[720px] text-[2.25rem] font-semibold leading-[1.08] sm:text-[3rem]`}>Priced by the metre. No surprises.</h2>
        <div className="mt-8"><PriceGuide rates={p} /></div>
      </section>

      {/* Send a job */}
      <section id="send" className="scroll-mt-24 bg-[#F6F1EC] py-14 sm:py-20">
        <div className={`${WRAP} grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-14`}>
          <div>
            <p className={eyebrow}>Send your job</p>
            <h2 className={`${serif} mt-3 text-[2.25rem] font-semibold leading-[1.08] sm:text-[2.75rem]`}>Upload it. We&apos;ll check it. You approve it.</h2>
            <ol className="mt-6 space-y-4">
              {["Tell us what you need and add your artwork files.", "We check the files and email your quote.", "Approve it online and we print."].map((t, k) => (
                <li key={k} className="flex gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--pk)] text-[0.875rem] font-semibold text-white">{k + 1}</span><span className="pt-1 text-[1rem] text-[#3A3431]">{t}</span></li>
              ))}
            </ol>
          </div>
          <ArtworkForm slug={eo.org.slug} rates={p} />
        </div>
      </section>
    </EventsFrame>
  );
}

/** A wide-format printer feeding out a freshly printed banner, with a contour-cut sticker on it. */
function PrinterArt({ rollWidth }: { rollWidth: number }) {
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-[520px]">
      <style>{`@keyframes feed{0%{transform:translateY(-38%)}100%{transform:translateY(0)}}@keyframes drop{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}.feed{animation:feed 3.2s cubic-bezier(.2,.7,.2,1) both}.drop{animation:drop 3s ease-in-out infinite}@media (prefers-reduced-motion:reduce){.feed,.drop{animation:none}}`}</style>
      <svg viewBox="0 0 520 440" className="w-full">
        <defs>
          <linearGradient id="pa-cmyk" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#00AEEF" /><stop offset=".45" stopColor="#EC008C" /><stop offset=".8" stopColor="#FFE600" /><stop offset="1" stopColor="#FF7A00" /></linearGradient>
          <linearGradient id="pa-body" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#3A3536" /><stop offset="1" stopColor="#201C1D" /></linearGradient>
          <clipPath id="pa-clip"><rect x="70" y="118" width="380" height="322" /></clipPath>
        </defs>
        {/* the banner coming out */}
        <g clipPath="url(#pa-clip)"><g className="feed">
          <rect x="88" y="90" width="344" height="380" rx="6" fill="url(#pa-cmyk)" />
          <g opacity=".18" fill="#fff">{Array.from({ length: 9 }, (_, k) => <rect key={k} x="88" y={110 + k * 40} width="344" height="14" />)}</g>
          <text x="260" y="250" textAnchor="middle" fill="#fff" style={{ font: "700 54px/1 Georgia, serif", letterSpacing: "-1px" }}>BIG</text>
          <text x="260" y="300" textAnchor="middle" fill="#fff" style={{ font: "italic 600 34px/1 Georgia, serif" }}>&amp; bold</text>
          {/* contour-cut sticker */}
          <g transform="translate(366 372) rotate(-12) scale(.85)">
            <path d="M0-46 13-14 47-12 21 9 30 42 0 24-30 42-21 9-47-12-13-14Z" fill="#fff" />
            <path d="M0-56 16-18 58-15 26 11 37 52 0 30-37 52-26 11-58-15-16-18Z" fill="none" stroke="#fff" strokeWidth="2.5" strokeDasharray="7 6" />
          </g>
        </g></g>
        {/* the printer */}
        <rect x="30" y="70" width="460" height="62" rx="18" fill="url(#pa-body)" stroke="#4A4445" />
        <rect x="70" y="118" width="380" height="8" rx="4" fill="#0D0B0C" />
        <rect x="58" y="86" width="150" height="10" rx="5" fill="#555" />
        <circle cx="440" cy="101" r="7" fill="#3BE37A" /><circle cx="416" cy="101" r="7" fill="#555" />
        <g className="drop">
          <circle cx="96" cy="40" r="11" fill="#00AEEF" /><circle cx="128" cy="30" r="9" fill="#EC008C" /><circle cx="156" cy="44" r="8" fill="#FFE600" /><circle cx="182" cy="34" r="7" fill="#F4F0EC" />
        </g>
        <text x="462" y="56" textAnchor="end" fill="#ffffff99" style={{ font: "600 14px/1 system-ui, sans-serif", letterSpacing: "2px" }}>{`${rollWidth} M ROLL`}</text>
      </svg>
    </div>
  );
}
