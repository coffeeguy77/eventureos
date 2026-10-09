import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowRight, Check } from "lucide-react";
import { CafeClosed, CafeFrame, WRAP, btn, eyebrow, hand, serif } from "@/components/cafe/frame";
import { ContactForm } from "@/components/events/contact-form";
import { cafePages } from "@/lib/cafe/core";
import { appSnapshot, cafeOrg } from "@/lib/cafe/server";
import { readShop } from "@/lib/shop/core";

import { ed, edImg } from "@/lib/site/copy";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ org: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const org = await cafeOrg((await params).org);
  if (!org || !org.cafe.wholesale) return {};
  return { title: { absolute: `${org.cafe.wholesaleTitle} — ${org.name}` }, description: org.cafe.wholesaleIntro.slice(0, 160) };
}

export default async function WholesalePage({ params }: P) {
  const org = await cafeOrg((await params).org);
  if (!org) notFound();
  const c = org.cafe;
  if (!cafePages(c).wholesale) return <CafeFrame org={org} active="wholesale"><CafeClosed name={org.name} what="The wholesale page" /></CafeFrame>;
  const shop = readShop(org.rawSettings).enabled;
  return (
    <CafeFrame org={org} active="wholesale" weekly={(c.appUrl ? (await appSnapshot(c.appUrl, false)).cfg?.hours?.weekly : null) ?? null} cta={{ href: "#enquire", label: "Enquire" }}>
      <section data-section="hero" className={`${WRAP} grid items-center gap-10 py-12 sm:py-16 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-16 lg:py-20`}>
        <div>
          <p className={`${hand} text-[1.75rem] leading-none text-[var(--pk)]`}>For cafés, offices &amp; restaurants</p>
          <h1 className={`${serif} mt-3 text-[clamp(2.5rem,5.4vw,4.25rem)] font-semibold leading-[1.02]`} {...ed("cafe.wholesaleTitle")}>{c.wholesaleTitle}</h1>
          <p {...ed("cafe.wholesaleIntro")} className="mt-5 max-w-xl text-[1.125rem] leading-relaxed text-[#5E5853]">{c.wholesaleIntro}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="#enquire" className={btn} data-track="Wholesale: enquire">Talk to us<ArrowRight className="h-5 w-5" /></Link>
            {shop && <Link href={`/shop/${org.slug}`} className="shop-btn inline-flex h-[60px] items-center rounded-full px-8 font-semibold ring-[1.5px] ring-[#1F1B19] hover:bg-white">Try our coffee first</Link>}
          </div>
        </div>
        {c.wholesaleImage && <img {...edImg("cafe.wholesaleImage")} src={c.wholesaleImage} alt="" className="aspect-[4/3] w-full rounded-[32px] object-cover shadow-[0_40px_80px_-50px_rgba(60,30,20,.55)]" />}
      </section>

      {c.wholesalePoints.length > 0 && (
        <section data-section="why" className="bg-[#1E1A18] text-white">
          <div className={`${WRAP} py-16 sm:py-20`}>
            <p className={`${eyebrow} !text-[color-mix(in_srgb,var(--pk)_55%,white)]`}>What you get</p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {c.wholesalePoints.map((p) => (
                <div key={p.title} className="rounded-[22px] bg-white/[0.06] p-6 ring-1 ring-white/10">
                  <p className="flex items-start gap-2 text-[1.125rem] font-semibold"><Check className="mt-1 h-4 w-4 shrink-0 text-[color-mix(in_srgb,var(--pk)_60%,white)]" />{p.title}</p>
                  <p className="mt-2 leading-relaxed text-white/70">{p.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {c.wholesaleFaq.length > 0 && (
        <section data-section="faq" className={`${WRAP} pt-16`}>
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

      <section id="enquire" data-section="contact" className={`${WRAP} scroll-mt-24 grid gap-10 py-16 sm:py-20 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16`}>
        <div>
          <p className={eyebrow}>Wholesale enquiries</p>
          <h2 className={`${serif} mt-3 text-[clamp(2rem,3.6vw,3rem)] font-semibold leading-tight`}>Let&apos;s talk about your coffee</h2>
          <p className="mt-4 text-[1.0625rem] leading-relaxed text-[#5E5853]">Tell us about your business — roughly how much coffee you go through each week and what you serve — and we&apos;ll come back with options and a tasting.</p>
        </div>
        <ContactForm slug={org.slug} section="wholesale" heading="Wholesale enquiry" showEvent={false} messageHint="Your business, roughly how many kilos a week, your equipment, and when you'd like to start" />
      </section>
    </CafeFrame>
  );
}
