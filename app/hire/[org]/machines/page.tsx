import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowRight, BadgeCheck, Coffee, Wrench } from "lucide-react";
import { siteMeta } from "@/lib/site/meta";
import { eventsOrg } from "@/lib/events/server";
import { createServiceClient } from "@/lib/integrations/runtime";
import { readMachines } from "@/lib/machines/core";
import { loadShopMachines } from "@/lib/machines/server";
import { EventsFrame, eyebrow, serif, WRAP } from "@/components/events/frame";
import { MachineChooser } from "@/components/machines/public/chooser";
import { MachineEnquiryForm } from "@/components/machines/public/enquiry-form";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ org: string }> }): Promise<Metadata> {
  const eo = await eventsOrg((await params).org);
  const s = eo ? readMachines(eo.org.rawSettings) : null;
  if (!eo || !s?.enabled) return { title: "Not found" };
  return siteMeta(eo.org, `/hire/${eo.org.slug}/machines`, {
    title: `${s.agentOf ? `${s.agentOf} ` : ""}Office Coffee Machines${s.area ? ` ${s.area}` : eo.s.city ? ` ${eo.s.city}` : ""} | ${eo.org.name}`,
    description: `Bean-to-cup coffee machines for offices and workplaces${s.agentOf ? ` — the full ${s.agentOf} range` : ""}. Find the right machine in a minute, then ask us about it.`,
  });
}

const money = (n: number) => `$${n.toLocaleString("en-AU", { maximumFractionDigits: 0 })}`;

/** Coffee machines for sale: a hero, the machine chooser, the full range, and an enquiry form. */
export default async function MachinesPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ model?: string }> }) {
  const eo = await eventsOrg((await params).org);
  if (!eo) notFound();
  const s = readMachines(eo.org.rawSettings);
  if (!s.enabled) notFound();
  const sp = await searchParams;
  const machines = await loadShopMachines(createServiceClient(), eo.org, s);
  const initial = machines.find((m) => m.slug === sp.model)?.name ?? "";
  const hero = machines.filter((m) => m.image).slice(0, 3);
  const maxCups = machines.reduce((a, m) => Math.max(a, m.cups), 0);
  const from = machines.reduce((a, m) => (m.price !== null && m.price < a ? m.price : a), Infinity);
  const where = s.area ?? eo.s.city ?? null;
  return (
    <EventsFrame org={eo.org} s={eo.s} active="machines">
      <section className="relative overflow-hidden bg-[#1B1412] text-white">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -left-20 top-0 h-80 w-80 rounded-full bg-[#C8772E] opacity-25 blur-3xl" />
          <div className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-[var(--pk)] opacity-25 blur-3xl" />
        </div>
        <div className={`${WRAP} relative grid items-center gap-10 py-14 sm:py-20 lg:grid-cols-[1.05fr_0.95fr]`}>
          <div>
            {s.agentOf && <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-[0.8125rem] font-semibold ring-1 ring-white/15"><BadgeCheck className="h-4 w-4 text-[#F2B66D]" />Authorised {s.agentOf} agent{where ? ` · ${where}` : ""}</p>}
            <h1 className={`${serif} mt-5 text-[2.75rem] font-semibold leading-[1.02] sm:text-[4.25rem]`}>Café coffee.<br /><span className="italic text-[#F2B66D]">At work.</span></h1>
            <p className="mt-5 max-w-[540px] text-[1.0625rem] leading-relaxed text-white/75">{s.intro ?? `Bean-to-cup machines that grind, brew and texture milk at the touch of a button${s.agentOf ? ` — the full ${s.agentOf} range` : ""}, sold and serviced by us${where ? ` in ${where}` : ""}.`}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a href="#choose" className="shop-btn inline-flex h-[56px] items-center justify-center gap-2 rounded-full bg-[var(--pk)] px-8 text-[1rem] font-semibold text-white">Find my machine <ArrowRight className="h-5 w-5" /></a>
              <a href="#range" className="shop-btn inline-flex h-[56px] items-center justify-center rounded-full border-[1.5px] border-white/40 px-8 text-[1rem] font-semibold text-white hover:bg-white/10">See the range</a>
            </div>
          </div>
          {hero.length > 0 && (
            <div aria-hidden className="relative mx-auto grid h-[320px] w-full max-w-[520px] grid-cols-3 items-end gap-3 sm:h-[400px]">
              {hero.map((m, k) => (
                <div key={m.slug} className={`relative overflow-hidden rounded-[22px] bg-white p-3 shadow-[0_30px_50px_-20px_rgba(0,0,0,.6)] ${k === 1 ? "h-full" : "h-[78%]"}`}>
                  <img src={m.image!} alt="" className="h-full w-full object-contain" />
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="relative border-t border-white/10">
          <div className={`${WRAP} grid grid-cols-3 divide-x divide-white/10 py-5 text-center`}>
            <div><p className="text-[1.5rem] font-semibold sm:text-[1.875rem]">{machines.length}</p><p className="text-[0.75rem] text-white/60 sm:text-[0.875rem]">machines</p></div>
            <div><p className="text-[1.5rem] font-semibold sm:text-[1.875rem]">{maxCups ? `${maxCups}+` : "—"}</p><p className="text-[0.75rem] text-white/60 sm:text-[0.875rem]">coffees a day, biggest</p></div>
            <div><p className="text-[1.5rem] font-semibold sm:text-[1.875rem]">{Number.isFinite(from) ? money(from) : "—"}</p><p className="text-[0.75rem] text-white/60 sm:text-[0.875rem]">from, inc GST</p></div>
          </div>
        </div>
      </section>

      <section id="choose" className={`${WRAP} scroll-mt-24 py-14 sm:py-20`}>
        <p className={eyebrow}>Machine chooser</p>
        <h2 className={`${serif} mt-3 max-w-[760px] text-[2.25rem] font-semibold leading-[1.08] sm:text-[3rem]`}>Which machine is right for you?</h2>
        <p className="mt-4 max-w-[640px] text-[1.0625rem] text-[#5E5853]">Tell us how you&apos;ll use it. The matches update as you go.</p>
        <div className="mt-8">{machines.length ? <MachineChooser machines={machines.map((m) => ({ ...m }))} /> : <p className="rounded-2xl bg-white p-8 text-center text-[#5E5853]">Our machines are being added — ask us below.</p>}</div>
      </section>

      {machines.length > 0 && (
        <section id="range" className="scroll-mt-24 bg-[#F6F1EC] py-14 sm:py-20">
          <div className={WRAP}>
            <p className={eyebrow}>The range</p>
            <h2 className={`${serif} mt-3 text-[2.25rem] font-semibold leading-[1.08] sm:text-[3rem]`}>From the staff room to the foyer</h2>
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {[...machines].sort((a, b) => a.cups - b.cups).map((m) => (
                <a key={m.slug} href={m.href} className="shop-card group flex flex-col overflow-hidden rounded-[20px] bg-white shadow-[0_18px_40px_-28px_rgba(80,45,40,.35)]">
                  <div className="relative h-[230px] border-b border-[#EFE8E2] bg-white">
                    {m.image && <img src={m.image} alt={m.name} className="shop-zoom absolute inset-0 h-full w-full object-contain p-6" loading="lazy" />}
                    <span className="absolute left-3 top-3 rounded-full bg-[#151312] px-3 py-1 text-[0.75rem] font-semibold text-white">{m.cups}+ a day</span>
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <h3 className={`${serif} text-[1.5rem] font-semibold leading-tight`}>{m.name}</h3>
                    {m.bestFor && <p className="mt-1 text-[0.9375rem] text-[#5E5853]">{m.bestFor}</p>}
                    <ul className="mt-3 flex flex-wrap gap-1.5 text-[0.75rem] font-medium text-[#3A3431]">
                      <li className="rounded-full bg-[#F6F1EC] px-2.5 py-1">{m.milk === "powder" ? "Powdered milk" : m.milk === "both" ? "Fresh or powdered milk" : "Fresh milk"}</li>
                      <li className="rounded-full bg-[#F6F1EC] px-2.5 py-1">{m.water === "both" ? "Tank or plumbed" : m.water === "plumbed" ? "Plumbed" : "Water tank"}</li>
                      {m.screen && <li className="rounded-full bg-[#F6F1EC] px-2.5 py-1">{m.screen} screen</li>}
                      {m.steamWand && <li className="rounded-full bg-[#F6F1EC] px-2.5 py-1">Steam wand</li>}
                    </ul>
                    <div className="mt-auto flex items-end justify-between pt-5">
                      <p className="text-[1.25rem] font-semibold">{m.price !== null ? money(m.price) : "Ask us"}<span className="ml-1 text-[0.75rem] font-normal text-[#6B645F]">inc GST</span></p>
                      <span className="inline-flex items-center gap-1 text-[0.9375rem] font-semibold text-[var(--pk)]">Details<ArrowRight className="h-4 w-4" /></span>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </section>
      )}

      <section id="enquire" className={`${WRAP} scroll-mt-24 grid gap-8 py-14 sm:py-20 lg:grid-cols-[0.8fr_1.2fr] lg:gap-14`}>
        <div>
          <p className={eyebrow}>Ask us</p>
          <h2 className={`${serif} mt-3 text-[2.25rem] font-semibold leading-[1.08] sm:text-[2.75rem]`}>Get a price on your machine.</h2>
          <ul className="mt-6 space-y-4 text-[1rem] text-[#3A3431]">
            <li className="flex gap-3"><Coffee className="mt-0.5 h-5 w-5 shrink-0 text-[var(--pk)]" />Tell us which machine, or how you&apos;ll use it, and we&apos;ll recommend one.</li>
            <li className="flex gap-3"><Wrench className="mt-0.5 h-5 w-5 shrink-0 text-[var(--pk)]" />We service what we sell, locally.</li>
          </ul>
        </div>
        <MachineEnquiryForm slug={eo.org.slug} mode="sale" notServiced={s.notServiced} machines={machines.map((m) => ({ slug: m.slug, name: m.name }))} initialMachine={initial} />
      </section>
    </EventsFrame>
  );
}
