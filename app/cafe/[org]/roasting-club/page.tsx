import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowRight, Check, Cloud, Flame, GraduationCap, Package, Printer, Warehouse } from "lucide-react";
import { CafeClosed, CafeFrame, WRAP, btn, eyebrow, hand, serif } from "@/components/cafe/frame";
import { ContactForm } from "@/components/events/contact-form";
import { cafePages, TIER_UNITS, tierPrice, type Equipment } from "@/lib/cafe/core";
import { appSnapshot, cafeOrg } from "@/lib/cafe/server";

import { ed, edImg } from "@/lib/site/copy";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ org: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const org = await cafeOrg((await params).org);
  if (!org || !org.cafe.club) return {};
  return { title: { absolute: `${org.cafe.clubTitle} — ${org.name}` }, description: org.cafe.clubIntro.slice(0, 160) };
}

const groupIcon = (g: string) => /pack|label|print/i.test(g) ? (/print|label/i.test(g) ? Printer : Package) : /train|espresso|barista/i.test(g) ? GraduationCap : /stor|green/i.test(g) ? Warehouse : Flame;

export default async function ClubPage({ params }: P) {
  const org = await cafeOrg((await params).org);
  if (!org) notFound();
  const c = org.cafe;
  if (!cafePages(c).club) return <CafeFrame org={org} active="club"><CafeClosed name={org.name} what="The roasting club page" /></CafeFrame>;
  const groups = c.equipment.reduce<Map<string, Equipment[]>>((m, e) => m.set(e.group, [...(m.get(e.group) ?? []), e]), new Map());
  const tiers = c.clubTiers.filter((t) => t.show);
  const roasters = c.equipment.filter((e) => /roast/i.test(e.group)).slice(0, 5);

  return (
    <CafeFrame org={org} active="club" weekly={(c.appUrl ? (await appSnapshot(c.appUrl, false)).cfg?.hours?.weekly : null) ?? null} cta={{ href: "#join", label: "Join the club" }}>
      {/* Hero */}
      <section data-section="hero" className="relative overflow-hidden bg-[#141011] text-white">
        {c.clubImage && <img {...edImg("cafe.clubImage")} src={c.clubImage} alt="" className="absolute inset-0 h-full w-full object-cover opacity-45" />}
        <div className="absolute inset-0 bg-[linear-gradient(90deg,#141011_0%,rgba(20,16,17,.86)_42%,rgba(20,16,17,.25)_100%)]" />
        <div className={`${WRAP} relative py-20 sm:py-28 lg:py-36`}>
          <p className={`${hand} text-[1.875rem] leading-none text-[color-mix(in_srgb,var(--pk)_60%,white)]`}>Roast your own</p>
          <h1 className={`${serif} mt-3 max-w-3xl text-[clamp(2.75rem,6.2vw,5.25rem)] font-semibold leading-[0.98]`} {...ed("cafe.clubTitle")}>{c.clubTitle}</h1>
          <p {...ed("cafe.clubIntro")} className="mt-6 max-w-xl text-[1.1875rem] leading-relaxed text-white/80">{c.clubIntro}</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="#join" className={btn} data-track="Club: join">Join the club<ArrowRight className="h-5 w-5" /></Link>
            <Link href="#equipment" className="shop-btn inline-flex h-[60px] items-center rounded-full px-8 font-semibold text-white ring-1 ring-white/35 hover:bg-white/10">See the equipment</Link>
          </div>
          {roasters.length > 0 && (
            <ul className="mt-12 flex flex-wrap gap-2.5">
              {roasters.map((r) => <li key={r.id} className="rounded-full bg-white/10 px-4 py-2 text-[0.875rem] font-medium text-white/90 ring-1 ring-white/15 backdrop-blur">{r.name}</li>)}
            </ul>
          )}
        </div>
      </section>

      {/* How it works */}
      <section data-section="how" className={`${WRAP} py-16 sm:py-20`}>
        <p className={eyebrow}>How it works</p>
        <h2 className={`${serif} mt-3 max-w-2xl text-[clamp(2rem,3.6vw,3rem)] font-semibold leading-tight`}>From green bean to your own label</h2>
        <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Meet us", "Tell us what you want to roast and come for a look around the roastery."],
            ["Learn the machines", "We'll show you how to run the roasters safely and get consistent results."],
            ["Book roast time", "Roast on the machine that suits your batch — from samples to production runs."],
            ["Pack & label", "Bag, seal and label your coffee on site, ready to sell or share."],
          ].map(([t, d], i) => (
            <li key={t} className="relative rounded-[24px] bg-white p-6 ring-1 ring-[#EDE3DB]">
              <span className={`${serif} text-[2.75rem] font-semibold leading-none text-[color-mix(in_srgb,var(--pk)_70%,white)]`}>{String(i + 1).padStart(2, "0")}</span>
              <p className="mt-3 text-[1.125rem] font-semibold">{t}</p>
              <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-[#5E5853]">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Equipment */}
      {groups.size > 0 && (
        <section id="equipment" data-section="equipment" className="scroll-mt-24 bg-[#1E1A18] text-white">
          <div className={`${WRAP} py-16 sm:py-20`}>
            <p className={`${eyebrow} !text-[color-mix(in_srgb,var(--pk)_55%,white)]`}>The equipment</p>
            <h2 className={`${serif} mt-3 max-w-2xl text-[clamp(2rem,3.6vw,3rem)] font-semibold leading-tight`}>Everything you need under one roof</h2>
            <div className="mt-10 space-y-10">
              {[...groups.entries()].map(([g, items]) => {
                const I = groupIcon(g);
                return (
                  <div key={g}>
                    <p className="flex items-center gap-2 text-[0.9375rem] font-semibold uppercase tracking-[0.14em] text-white/60"><I className="h-4 w-4" />{g}</p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {items.map((e) => (
                        <div key={e.id} className="rounded-[20px] bg-white/[0.06] p-5 ring-1 ring-white/10">
                          <p className="text-[1.0625rem] font-semibold">{e.name}</p>
                          {e.detail && <p className="mt-1.5 text-[0.9063rem] leading-relaxed text-white/70">{e.detail}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Software */}
      {c.software.length > 0 && (
        <section data-section="software" className={`${WRAP} grid gap-10 py-16 sm:py-20 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16`}>
          <div>
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[color-mix(in_srgb,var(--pk)_12%,white)] text-[var(--pk)]"><Cloud className="h-6 w-6" /></span>
            <p className={`${eyebrow} mt-5`}>Roast data in the cloud</p>
            <h2 className={`${serif} mt-3 text-[clamp(2rem,3.4vw,2.75rem)] font-semibold leading-tight`}>Your profiles, saved and ready</h2>
            <p className="mt-4 text-[1.0625rem] leading-relaxed text-[#5E5853]">Good roasting is repeatable roasting. Your roast profiles and logs aren&apos;t stuck on one machine&apos;s screen — you can look back, compare and roast it again.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {c.software.map((s) => (
              <div key={s.title} className="rounded-[22px] bg-white p-5 ring-1 ring-[#EDE3DB]">
                <p className="flex items-start gap-2 font-semibold"><Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--pk)]" />{s.title}</p>
                <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-[#5E5853]">{s.text}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Membership */}
      {tiers.length > 0 && (
        <section id="membership" data-section="membership" className="scroll-mt-24 border-y border-[#EDE3DB] bg-white">
          <div className={`${WRAP} py-16 sm:py-20`}>
            <p className={eyebrow}>Membership</p>
            <h2 className={`${serif} mt-3 text-[clamp(2rem,3.6vw,3rem)] font-semibold leading-tight`}>Find your fit</h2>
            <div className={`mt-10 grid gap-4 sm:grid-cols-2 ${tiers.length >= 4 ? "xl:grid-cols-4" : "lg:grid-cols-3"}`}>
              {tiers.map((t) => {
                const pr = tierPrice(t);
                return (
                  <div key={t.id} className={`relative flex flex-col rounded-[26px] p-6 ${t.featured ? "bg-[#151312] text-white shadow-[0_40px_70px_-40px_rgba(20,16,17,.7)]" : "bg-[#FCFAF7] ring-1 ring-[#EDE3DB]"}`}>
                    <p className="text-[1.25rem] font-semibold">{t.name}</p>
                    {t.tagline && <p className={`mt-1 text-[0.9375rem] ${t.featured ? "text-white/70" : "text-[#5E5853]"}`}>{t.tagline}</p>}
                    <p className="mt-5">{pr ? <><span className={`${serif} text-[2.5rem] font-semibold`}>{pr}</span> <span className={`text-[0.9375rem] ${t.featured ? "text-white/60" : "text-[#8C847D]"}`}>{TIER_UNITS[t.unit]}</span></> : <span className={`${serif} text-[1.5rem] font-semibold`}>Enquire for pricing</span>}</p>
                    <ul className="mt-5 flex-1 space-y-2 text-[0.9375rem]">
                      {t.features.map((f) => <li key={f} className="flex items-start gap-2"><Check className={`mt-0.5 h-4 w-4 shrink-0 ${t.featured ? "text-[color-mix(in_srgb,var(--pk)_60%,white)]" : "text-[var(--pk)]"}`} />{f}</li>)}
                    </ul>
                    <Link href="#join" className={`shop-btn mt-7 inline-flex h-[50px] items-center justify-center rounded-full font-semibold ${t.featured ? "bg-[var(--pk)] text-white" : "ring-1 ring-[#1F1B19] hover:bg-white"}`} data-track={`Club tier: ${t.name}`}>{pr ? "Join" : "Ask about it"}</Link>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Perks */}
      {c.clubPerks.length > 0 && (
        <section data-section="perks" className={`${WRAP} py-16 sm:py-20`}>
          <p className={eyebrow}>Why roast with us</p>
          <div className="mt-8 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {c.clubPerks.map((p) => <div key={p.title}><p className="text-[1.125rem] font-semibold">{p.title}</p><p className="mt-1.5 leading-relaxed text-[#5E5853]">{p.text}</p></div>)}
          </div>
        </section>
      )}

      {/* FAQ */}
      {c.clubFaq.length > 0 && (
        <section data-section="faq" className={`${WRAP} pb-6`}>
          <h2 className={`${serif} text-[clamp(1.875rem,3vw,2.5rem)] font-semibold`}>Questions</h2>
          <div className="mt-6 divide-y divide-[#EDE3DB] rounded-[24px] bg-white px-6 ring-1 ring-[#EDE3DB]">
            {c.clubFaq.map((f) => (
              <details key={f.q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">{f.q}<span className="text-[1.5rem] leading-none text-[var(--pk)] transition group-open:rotate-45">+</span></summary>
                <p className="mt-3 whitespace-pre-line leading-relaxed text-[#5E5853]">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      )}

      {/* Join */}
      <section id="join" data-section="contact" className={`${WRAP} scroll-mt-24 grid gap-10 py-16 sm:py-20 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16`}>
        <div>
          <p className={`${hand} text-[1.75rem] leading-none text-[var(--pk)]`}>Come and roast</p>
          <h2 className={`${serif} mt-2 text-[clamp(2rem,3.6vw,3rem)] font-semibold leading-tight`}>Join the club or book a tour</h2>
          <p className="mt-4 text-[1.0625rem] leading-relaxed text-[#5E5853]">Tell us a little about what you&apos;d like to roast — a hobby, a new coffee brand or production for your café — and we&apos;ll be in touch to show you around.</p>
        </div>
        <ContactForm slug={org.slug} section="club" heading="Tell us about your roasting" showEvent={false} messageHint="What you'd like to roast, how much and how often, and which membership interests you" />
      </section>
    </CafeFrame>
  );
}
