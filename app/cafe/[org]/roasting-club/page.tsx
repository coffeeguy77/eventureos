import Link from "next/link";
import { siteMeta } from "@/lib/site/meta";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowRight, Check, Clock, Coffee, ExternalLink, Flame, GraduationCap, KeyRound, Layers, Monitor, Package, Printer, Sprout, Tag, Warehouse, Wifi } from "lucide-react";
import { CafeClosed, CafeFrame, WRAP, serif } from "@/components/cafe/frame";
import { ContactForm } from "@/components/events/contact-form";
import { RoastCalculator } from "@/components/cafe/roast-calculator";
import { cafePages } from "@/lib/cafe/core";
import { appSnapshot, cafeOrg } from "@/lib/cafe/server";
import { packagePrices, readRoast } from "@/lib/roast/config";
import { copyOf, ed, edImg, okImage } from "@/lib/site/copy";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ org: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const org = await cafeOrg((await params).org);
  if (!org || !org.cafe.club) return {};
  return siteMeta(org, `/cafe/${org.slug}/roasting-club`, { title: { absolute: `${org.cafe.clubTitle} — shared coffee roastery in Mitchell, Canberra | ${org.name}` }, description: org.cafe.clubIntro.slice(0, 160) });
}

/* Roast Culture palette — warm ivory, burgundy, sage and terracotta */
const BURG = "#6B1D2E";
const rcBtn = "shop-btn inline-flex h-[56px] items-center justify-center gap-2.5 rounded-full bg-[#6B1D2E] px-8 text-[1rem] font-semibold text-white shadow-[0_16px_30px_-18px_#6B1D2E] hover:bg-[#561525]";
const rcOutline = "shop-btn inline-flex h-[56px] items-center justify-center gap-2 rounded-full border-[1.5px] border-[#1F1A17] px-8 text-[1rem] font-semibold text-[#1F1A17] hover:bg-white";
const kicker = "text-[0.8125rem] font-semibold uppercase tracking-[0.18em] text-[#6B1D2E]";
const h2 = `${serif} text-[clamp(2rem,3.8vw,3.25rem)] font-semibold leading-[1.05] tracking-[-0.01em]`;
const card = "rounded-[24px] bg-white p-6 ring-1 ring-[#E8DFD3]";
const aud = (n: number) => `$${n.toLocaleString("en-AU", { maximumFractionDigits: 2 })}`;

export default async function RoastCulturePage({ params }: P) {
  const org = await cafeOrg((await params).org);
  if (!org) notFound();
  const c = org.cafe;
  if (!cafePages(c).club) return <CafeFrame org={org} active="club"><CafeClosed name={org.name} what="This page" /></CafeFrame>;

  const T = copyOf(org.rawSettings, "roast");
  const k = (key: string) => ed(`copy:roast.${key}`);
  const raw = org.rawSettings as { site?: { images?: Record<string, unknown> } } | null;
  const pic = (key: string, fallback: string | null) => { const v = raw?.site?.images?.[key]; return typeof v === "string" && okImage(v) ? v : fallback; };
  const cfg = readRoast(c);
  const weekly = (c.appUrl ? (await appSnapshot(c.appUrl, false)).cfg?.hours?.weekly : null) ?? null;
  const from = Math.min(...cfg.machines.map((m) => m.hourly));

  const facilities = [
    { I: Flame, title: "Roast", items: ["50 g IKAWA Pro sample roaster", "1 kg Aillio Bullet", "1.5 kg Giesen", "15 kg Giesen", "45 kg Giesen", "Giesen profile software on our Giesen roasters"] },
    { I: Layers, title: "Process & pack", items: ["De-stoners", "Action Pak coffee packing machine", "Dolzan coffee packing machine", "Pallet racking"] },
    { I: Printer, title: "Brand & print", items: ["HP Latex wide-format printer", "Graphtec cutter", "Epson label printers"] },
    { I: GraduationCap, title: "Train & work", items: ["Training room with three Café Racer espresso machines", "Hot desks", "1 Gbps internet"] },
    { I: Sprout, title: "Learn", items: ["Hydroponic coffee farm"] },
    { I: KeyRound, title: "Access", items: ["24/7 digital entry for inducted members", `Staff-assisted preheating, ${cfg.staffHours}`] },
  ];

  return (
    <CafeFrame org={org} active="club" weekly={weekly} cta={{ href: "#join", label: "Join" }}>
      <div className="bg-[#F8F3EA] text-[#1F1A17]">
        {/* 1 · Hero */}
        <section data-section="hero" className={`${WRAP} grid items-center gap-10 py-12 sm:py-16 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-16 lg:py-20`}>
          <div>
            <p className={kicker} {...k("hero.kicker")}>{T("hero.kicker", `${c.clubTitle} · by ${org.name} · Mitchell, Canberra`)}</p>
            <h1 className={`${serif} mt-4 text-[clamp(2.75rem,6vw,5rem)] font-semibold leading-[0.98] tracking-[-0.02em]`} {...k("hero.title")}>{T("hero.title", "Your coffee. Your brand. Our roastery.")}</h1>
            <p {...ed("cafe.clubIntro")} className="mt-6 max-w-xl text-[1.1875rem] leading-relaxed text-[#4A423D]">{c.clubIntro}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="#join" className={rcBtn} data-track="Roast Culture: join (hero)">Join The Roast Society<ArrowRight className="h-5 w-5" /></Link>
              <Link href="#calculator" className={rcOutline} data-track="Roast Culture: calculator (hero)">What could your coffee earn?</Link>
            </div>
            <ul className="mt-10 grid max-w-xl grid-cols-3 gap-4 border-t border-[#E3D8C9] pt-6">
              <li><p className={`${serif} text-[1.75rem] font-semibold leading-none`}>50 g–45 kg</p><p className="mt-1.5 text-[0.8125rem] text-[#6A615B]">five roasters</p></li>
              <li><p className={`${serif} text-[1.75rem] font-semibold leading-none`}>{aud(from)}/hr</p><p className="mt-1.5 text-[0.8125rem] text-[#6A615B]">roaster hire from</p></li>
              <li><p className={`${serif} text-[1.75rem] font-semibold leading-none`}>24/7</p><p className="mt-1.5 text-[0.8125rem] text-[#6A615B]">entry for inducted members</p></li>
            </ul>
          </div>
          {c.clubImage && <img {...edImg("cafe.clubImage")} src={c.clubImage} alt="Roasting at the roastery in Mitchell" className="aspect-[4/5] w-full rounded-[32px] object-cover shadow-[0_40px_80px_-50px_rgba(60,20,25,.6)] lg:aspect-[5/6]" />}
        </section>

        {/* 2 · Membership */}
        <section id="membership" data-section="membership" className="scroll-mt-24 bg-white">
          <div className={`${WRAP} grid gap-10 py-16 sm:py-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:gap-16`}>
            <div>
              <p className={kicker} {...k("member.kicker")}>{T("member.kicker", "The Roast Society")}</p>
              <h2 className={`${h2} mt-3`} {...k("member.title")}>{T("member.title", "Create your coffee. Grow your brand.")}</h2>
              <p className="mt-5 max-w-xl whitespace-pre-line text-[1.0625rem] leading-relaxed text-[#4A423D]" {...k("member.text")}>{T("member.text", "Membership opens the roastery to you: professional roasters from sample size to production scale, the space to pack and brand your coffee, and people around you who roast every day. Learn, test, develop your profiles and build something of your own — at your pace.")}</p>
            </div>
            <div className="rounded-[28px] p-7 text-white sm:p-9" style={{ background: `linear-gradient(160deg, ${BURG}, #4A1220)` }}>
              <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.16em] text-white/70">The Roast Society</p>
              <p className="mt-3"><span className={`${serif} text-[3.5rem] font-semibold leading-none`}>{aud(cfg.membershipMonthly)}</span> <span className="text-white/70">per month</span></p>
              <ul className="mt-6 space-y-3 text-[0.9688rem]">
                {[
                  ["m1", "Book our roasters at member hire rates"],
                  ["m2", "24/7 digital entry once you're inducted"],
                  ["m3", "Hot desks and 1 Gbps internet, subject to availability"],
                  ["m4", "Arrange packing, printing, storage and training when you need them"],
                ].map(([key, d]) => <li key={key} className="flex items-start gap-2.5"><Check className="mt-0.5 h-5 w-5 shrink-0 text-[#D9B26A]" /><span {...k(key)}>{T(key, d)}</span></li>)}
              </ul>
              <p className="mt-6 border-t border-white/15 pt-4 text-[0.8438rem] text-white/70" {...k("member.note")}>{T("member.note", "Membership and roaster hire are separate charges. Extra services and materials are priced separately or quoted.")}</p>
              <Link href="#join" className="shop-btn mt-6 inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-white font-semibold text-[#6B1D2E] hover:bg-[#F8F3EA]" data-track="Roast Culture: join (membership)">Join or book a visit<ArrowRight className="h-5 w-5" /></Link>
            </div>
          </div>
        </section>

        {/* 3 · Pathways */}
        <section data-section="pathways" className={`${WRAP} py-16 sm:py-24`}>
          <p className={kicker} {...k("paths.kicker")}>{T("paths.kicker", "Your path")}</p>
          <h2 className={`${h2} mt-3 max-w-3xl`} {...k("paths.title")}>{T("paths.title", "Learn it. Roast it. Make it yours.")}</h2>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              { key: "p1", I: GraduationCap, title: "Learn", text: "Start small and build confidence. Sample-roast 50 g at a time on the IKAWA Pro, train in a room with three Café Racer espresso machines, and see coffee growing on our hydroponic farm.", links: [["Sample roasting", "#equipment"], ["Training", "#training"]] },
              { key: "p2", I: Flame, title: "Roast", text: "Develop a profile on the 1 kg Aillio Bullet or 1.5 kg Giesen, then scale up to the 15 kg and 45 kg Giesens when your orders grow. Save your profiles and roast them again.", links: [["Roasters & prices", "#equipment"], ["Profile software", "#software"]] },
              { key: "p3", I: Tag, title: "Create your brand", text: "Pack on the Action Pak and Dolzan machines, print your own labels and stickers, and store your stock on our racking — the practical side of turning a roast into a product.", links: [["Packing & printing", "#packing"], ["Plan your costs", "#calculator"]] },
            ].map((p) => (
              <div key={p.key} className={`${card} flex flex-col`}>
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#F3E6E2] text-[#6B1D2E]"><p.I className="h-6 w-6" /></span>
                <h3 className={`${serif} mt-5 text-[1.75rem] font-semibold`} {...k(`${p.key}.title`)}>{T(`${p.key}.title`, p.title)}</h3>
                <p className="mt-2 flex-1 leading-relaxed text-[#4A423D]" {...k(`${p.key}.text`)}>{T(`${p.key}.text`, p.text)}</p>
                <p className="mt-5 flex flex-wrap gap-x-4 gap-y-1 text-[0.9063rem] font-semibold text-[#6B1D2E]">{p.links.map(([l, h]) => <Link key={h + l} href={h} className="inline-flex items-center gap-1 hover:underline">{l}<ArrowRight className="h-4 w-4" /></Link>)}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 4 · Equipment & hire pricing */}
        <section id="equipment" data-section="equipment" className="scroll-mt-24 bg-white">
          <div className={`${WRAP} py-16 sm:py-24`}>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end">
              <div>
                <p className={kicker} {...k("eq.kicker")}>{T("eq.kicker", "Roasters & hire")}</p>
                <h2 className={`${h2} mt-3`} {...k("eq.title")}>{T("eq.title", "From a 50 g sample to a 45 kg production run")}</h2>
              </div>
              <p className="text-[1.0625rem] leading-relaxed text-[#4A423D]" {...k("eq.text")}>{T("eq.text", "Hire is booked in a two-hour minimum or an eight-hour day. The day is 50% off eight standard hourly charges — the same price as four hours — subject to availability.")}</p>
            </div>
            <div className="mt-10 overflow-x-auto rounded-[24px] ring-1 ring-[#E8DFD3]">
              <table className="w-full min-w-[620px] text-left">
                <thead className="bg-[#F8F3EA] text-[0.8125rem] uppercase tracking-wide text-[#6A615B]">
                  <tr><th className="px-5 py-3.5 font-semibold">Roaster</th><th className="px-5 py-3.5 text-right font-semibold">Hourly</th><th className="px-5 py-3.5 text-right font-semibold">Two-hour minimum</th><th className="px-5 py-3.5 text-right font-semibold">Eight-hour day</th></tr>
                </thead>
                <tbody>
                  {cfg.machines.map((m) => {
                    const p = packagePrices(m.hourly);
                    return (
                      <tr key={m.id} className="border-t border-[#EFE7DC]">
                        <td className="px-5 py-4"><span className="font-semibold">{m.name}</span>{m.giesen && <span className="ml-2 rounded-full bg-[#EEF3EC] px-2 py-0.5 text-[0.75rem] font-semibold text-[#4F6B4C]">Profile software</span>}</td>
                        <td className="px-5 py-4 text-right tabular-nums">{aud(p.hourly)}</td>
                        <td className="px-5 py-4 text-right tabular-nums">{aud(p.twoHour)}</td>
                        <td className="px-5 py-4 text-right font-semibold tabular-nums text-[#6B1D2E]">{aud(p.day)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-6 grid gap-4 text-[0.9375rem] text-[#4A423D] md:grid-cols-3">
              <p className="flex items-start gap-2.5"><Clock className="mt-0.5 h-5 w-5 shrink-0 text-[#6B1D2E]" /><span {...k("eq.n1")}>{T("eq.n1", "Warm-up and final cleaning don't use your paid roasting time — but please arrive early enough to preheat.")}</span></p>
              <p className="flex items-start gap-2.5"><Coffee className="mt-0.5 h-5 w-5 shrink-0 text-[#6B1D2E]" /><span {...k("eq.n2")}>{T("eq.n2", "Prices are in Australian dollars and include GST. Membership is separate.")}</span></p>
              <p className="flex items-start gap-2.5"><Package className="mt-0.5 h-5 w-5 shrink-0 text-[#6B1D2E]" /><span {...k("eq.n3")}>{T("eq.n3", "Green coffee, packaging, printing, storage and training are priced separately or quoted.")}</span></p>
            </div>
          </div>
        </section>

        {/* 5 · Calculator */}
        <section id="calculator" data-section="calculator" className="scroll-mt-24">
          <div className={`${WRAP} py-16 sm:py-24`}>
            <div className="max-w-3xl">
              <p className={kicker} {...k("calc.kicker")}>{T("calc.kicker", "Profitability calculator")}</p>
              <h2 className={`${h2} mt-3`} {...k("calc.title")}>{T("calc.title", "What could your coffee earn?")}</h2>
              <p className="mt-4 text-[1.0625rem] leading-relaxed text-[#4A423D]" {...k("calc.text")}>{T("calc.text", "Model your production, see your costs and explore the potential of your own coffee brand.")}</p>
            </div>
            <div className="mt-10"><RoastCalculator machines={cfg.machines} membershipMonthly={cfg.membershipMonthly} /></div>
          </div>
        </section>

        {/* 6 · Giesen software */}
        <section id="software" data-section="software" className="scroll-mt-24 bg-[#1F1A17] text-white">
          <div className={`${WRAP} grid gap-10 py-16 sm:py-24 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16`}>
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-[#D9B26A] px-3.5 py-1 text-[0.8125rem] font-semibold text-[#1F1A17]"><Monitor className="h-4 w-4" /><span {...k("soft.badge")}>{T("soft.badge", "Giesen profile software included")}</span></span>
              <h2 className={`${h2} mt-5`} {...k("soft.title")}>{T("soft.title", "Develop it. Save it. Roast it again.")}</h2>
              <p className="mt-5 text-[1.0625rem] leading-relaxed text-white/75" {...k("soft.text")}>{T("soft.text", "Record your roasts, work alongside saved reference profiles and use automated playback or custom triggers on supported equipment. Develop a repeatable process around your coffee, with the operator in control.")}</p>
              {pic("rcSoftware", "/media/beanculture/giesen-profiler.webp") && <img {...edImg("site.images.rcSoftware")} src={pic("rcSoftware", "/media/beanculture/giesen-profiler.webp")!} alt="Giesen profile software showing a live roast curve" className="mt-8 aspect-[3/2] w-full rounded-[24px] object-cover ring-1 ring-white/10" />}
              <p className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-[0.875rem] text-white/60">
                {[["About Giesen Profiler", "https://giesen.com/profiler"], ["Using a saved profile", "https://giesen.com/support/use-a-saved-roast-profile-in-giesen-profiler-2"], ["Using triggers", "https://giesen.com/support/how-to-use-triggers-in-giesen-profiler-2"]].map(([l, h]) => (
                  <a key={h} href={h} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline-offset-4 hover:text-white hover:underline">{l}<ExternalLink className="h-3.5 w-3.5" /></a>
                ))}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ["s1", "Record every roast", "Keep each roast's profile and history, so you can look back at what you did and why."],
                ["s2", "Roast against a reference", "Follow a live roast alongside a saved reference profile and see where it differs."],
                ["s3", "Reuse what worked", "Load saved roast data and supported control setpoints to start from a profile you trust."],
                ["s4", "Automated playback", "Play a saved profile back on supported equipment — with you watching and ready to step in."],
                ["s5", "Custom triggers", "Set triggers on supported conditions such as time, temperature, rate of rise or roast events."],
                ["s6", "Control, machine by machine", "The actions available depend on each Giesen's installed setup and software configuration."],
              ].map(([key, title, d]) => (
                <div key={key} className="rounded-[20px] bg-white/[0.06] p-5 ring-1 ring-white/10">
                  <p className="flex items-start gap-2 font-semibold"><Check className="mt-0.5 h-4 w-4 shrink-0 text-[#D9B26A]" /><span {...k(`${key}.t`)}>{T(`${key}.t`, title)}</span></p>
                  <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-white/70" {...k(`${key}.d`)}>{T(`${key}.d`, d)}</p>
                </div>
              ))}
              <p className="text-[0.8438rem] leading-relaxed text-white/55 sm:col-span-2" {...k("soft.fine")}>{T("soft.fine", "The software runs on our Giesen roasters — not the IKAWA or the Aillio. Automation supports the roaster; it doesn't replace them, and no two roasts are guaranteed identical. Members' profiles are kept private, and features depend on each machine's setup — ask us what's available on the roaster you plan to use.")}</p>
            </div>
          </div>
        </section>

        {/* 7 · Packing, printing and storage */}
        <section id="packing" data-section="packing" className={`${WRAP} scroll-mt-24 grid gap-10 py-16 sm:py-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-16`}>
          {pic("rcPack", c.wholesaleImage) && <img {...edImg("site.images.rcPack")} src={pic("rcPack", c.wholesaleImage)!} alt="" className="aspect-[4/3] w-full rounded-[28px] object-cover" />}
          <div>
            <p className={kicker} {...k("pack.kicker")}>{T("pack.kicker", "Packing, printing & storage")}</p>
            <h2 className={`${h2} mt-3`} {...k("pack.title")}>{T("pack.title", "From roast to a product on the shelf")}</h2>
            <p className="mt-4 text-[1.0625rem] leading-relaxed text-[#4A423D]" {...k("pack.text")}>{T("pack.text", "Clean your coffee, pack it properly and put your own brand on it — all in one place.")}</p>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {[
                [Layers, "pk1", "De-stoners", "Take stones and debris out before packing."],
                [Package, "pk2", "Action Pak & Dolzan", "Two coffee packing machines for consistent bags."],
                [Printer, "pk3", "HP Latex & Graphtec", "Print and cut full-colour labels and stickers."],
                [Tag, "pk4", "Epson label printers", "Short runs of labels, printed on demand."],
                [Warehouse, "pk5", "Pallet racking", "Space to store green coffee and stock."],
              ].map(([I, key, title, d]) => {
                const Icon = I as typeof Layers;
                return (
                  <li key={key as string} className="flex gap-3 rounded-[18px] bg-white p-4 ring-1 ring-[#E8DFD3]">
                    <Icon className="mt-0.5 h-5 w-5 shrink-0 text-[#C46B42]" />
                    <span><span className="block font-semibold" {...k(`${key}.t`)}>{T(`${key}.t`, title as string)}</span><span className="text-[0.9063rem] text-[#6A615B]" {...k(`${key}.d`)}>{T(`${key}.d`, d as string)}</span></span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-5 text-[0.875rem] text-[#6A615B]" {...k("pack.fine")}>{T("pack.fine", "Packing, printing, materials and storage are arranged and priced separately — they aren't unlimited or included in membership.")}</p>
          </div>
        </section>

        {/* 8 · Training, hot desks, farm */}
        <section id="training" data-section="training" className="scroll-mt-24 bg-white">
          <div className={`${WRAP} py-16 sm:py-24`}>
            <p className={kicker} {...k("train.kicker")}>{T("train.kicker", "Train, work & learn")}</p>
            <h2 className={`${h2} mt-3 max-w-3xl`} {...k("train.title")}>{T("train.title", "More than a roaster")}</h2>
            <p className="mt-4 max-w-3xl text-[1.0625rem] leading-relaxed text-[#4A423D]" {...k("train.text")}>{T("train.text", "Between roasts there's room to work too: hot desks with a 1 Gbps internet connection for planning, answering orders and building your brand, subject to availability.")}</p>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {[
                { key: "tr1", I: GraduationCap, img: pic("rcTrain", "/media/academy/bean-culture/cafe.jpg"), imgKey: "rcTrain", title: "Training room", text: "Three Café Racer espresso machines for dialling in your coffee, training baristas and testing how your roast performs in the cup." },
                { key: "tr4", I: Printer, img: pic("rcBrand", null), imgKey: "rcBrand", title: "Branding & packaging", text: "Design it, print it, pack it: full-colour labels and stickers on the HP Latex and Graphtec cutter, short label runs on the Epson printers, and bags filled on the Action Pak and Dolzan." },
                { key: "tr3", I: Sprout, img: pic("rcFarm", "/media/beanculture/hydroponic-farm.jpg"), imgKey: "rcFarm", title: "Hydroponic coffee farm", text: "See coffee growing from plant to cherry — a hands-on way to understand where every bean begins." },
              ].map((x) => (
                <div key={x.key} className="overflow-hidden rounded-[24px] bg-[#F8F3EA] ring-1 ring-[#E8DFD3]">
                  {x.img && x.imgKey ? <img {...edImg(`site.images.${x.imgKey}`)} src={x.img} alt="" className="aspect-[16/10] w-full object-cover" /> : <div {...(x.imgKey ? edImg(`site.images.${x.imgKey}`) : {})} className="grid aspect-[16/10] w-full place-items-center bg-[#EFE5D6] text-[#7F9C7B]"><x.I className="h-12 w-12" strokeWidth={1.4} /></div>}
                  <div className="p-6">
                    <h3 className={`${serif} text-[1.5rem] font-semibold`} {...k(`${x.key}.title`)}>{T(`${x.key}.title`, x.title)}</h3>
                    <p className="mt-2 leading-relaxed text-[#4A423D]" {...k(`${x.key}.text`)}>{T(`${x.key}.text`, x.text)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 9 · Access & bookings */}
        <section id="access" data-section="access" className={`${WRAP} scroll-mt-24 py-16 sm:py-24`}>
          <div className="grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
            <div>
              <p className={kicker} {...k("acc.kicker")}>{T("acc.kicker", "Access & bookings")}</p>
              <h2 className={`${h2} mt-3`} {...k("acc.title")}>{T("acc.title", "How a roasting day works")}</h2>
              <p className="mt-4 text-[1.0625rem] leading-relaxed text-[#4A423D]" {...k("acc.text")}>{T("acc.text", "Inducted members have 24/7 digital entry. 24/7 access doesn't mean 24/7 staffing — outside our staffed hours you're preheating, roasting and cleaning on your own.")}</p>
              <div className="mt-6 rounded-[20px] bg-white p-5 ring-1 ring-[#E8DFD3]">
                <p className="flex items-center gap-2 font-semibold"><Clock className="h-5 w-5 text-[#6B1D2E]" /><span {...k("acc.staffTitle")}>{T("acc.staffTitle", "Staffed preheating")}</span></p>
                <p className="mt-1.5 text-[0.9375rem] text-[#4A423D]" {...k("acc.staff")}>{T("acc.staff", `During business hours (${cfg.staffHours}) our team can arrange preheating around your booked start time. Outside those hours, let yourself in with digital entry and preheat the roaster yourself.`)}</p>
              </div>
            </div>
            <ol className="space-y-3">
              {[
                ["a1", "Join and get inducted", "Become a member and complete your induction on the equipment you'll use — then your digital entry is switched on."],
                ["a2", "Book your roaster", "Choose a two-hour minimum or an eight-hour day on the machine that suits your batch. Full days depend on availability."],
                ["a3", "Arrive and preheat", "Come early enough to warm the roaster up. Warm-up doesn't use your paid roasting time, but the machine is yours while it heats."],
                ["a4", "Roast", "Your paid time is for roasting. Use your saved profiles on the Giesens, and keep an eye on every batch."],
                ["a5", "Clean down and hand over", "Do your own setup and cleanup and leave the roaster ready for the next person. Please don't leave machines preheated for long periods."],
              ].map(([key, title, d], i) => (
                <li key={key} className="flex gap-4 rounded-[20px] bg-white p-5 ring-1 ring-[#E8DFD3]">
                  <span className={`${serif} grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#6B1D2E] text-[1.125rem] font-semibold text-white`}>{i + 1}</span>
                  <span><span className="block text-[1.0625rem] font-semibold" {...k(`${key}.t`)}>{T(`${key}.t`, title)}</span><span className="mt-1 block text-[0.9375rem] leading-relaxed text-[#4A423D]" {...k(`${key}.d`)}>{T(`${key}.d`, d)}</span></span>
                </li>
              ))}
              <li className="px-1 text-[0.875rem] text-[#6A615B]" {...k("acc.book")}>{T("acc.book", "Bookings are arranged with our team for now — send us a message below and we'll confirm a time with you.")}</li>
            </ol>
          </div>
        </section>

        {/* Everything here, at a glance */}
        <section data-section="facilities" className="bg-white">
          <div className={`${WRAP} py-14`}>
            <p className={kicker} {...k("fac.kicker")}>{T("fac.kicker", "Everything under one roof")}</p>
            <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {facilities.map((f) => (
                <div key={f.title}>
                  <p className="flex items-center gap-2 font-semibold"><f.I className="h-5 w-5 text-[#7F9C7B]" />{f.title}</p>
                  <ul className="mt-2 space-y-1 text-[0.9375rem] text-[#4A423D]">{f.items.map((x) => <li key={x}>{x}</li>)}</ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 10 · FAQs */}
        {c.clubFaq.length > 0 && (
          <section data-section="faq" className={`${WRAP} py-16 sm:py-20`}>
            <h2 className={h2} {...k("faq.title")}>{T("faq.title", "Questions")}</h2>
            <div className="mt-8 divide-y divide-[#E8DFD3] rounded-[24px] bg-white px-6 ring-1 ring-[#E8DFD3]">
              {c.clubFaq.map((f) => (
                <details key={f.q} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[1.0625rem] font-semibold">{f.q}<span className="text-[1.5rem] leading-none text-[#6B1D2E] transition group-open:rotate-45">+</span></summary>
                  <p className="mt-3 whitespace-pre-line leading-relaxed text-[#4A423D]">{f.a}</p>
                </details>
              ))}
            </div>
          </section>
        )}

        {/* 11 · Closing */}
        <section id="join" data-section="contact" className="scroll-mt-24" style={{ background: `linear-gradient(160deg, ${BURG}, #4A1220)` }}>
          <div className={`${WRAP} grid gap-10 py-16 text-white sm:py-24 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16`}>
            <div>
              <h2 className={`${h2}`} {...k("close.title")}>{T("close.title", "Your coffee journey starts here.")}</h2>
              <p className="mt-5 text-[1.1875rem] text-white/80" {...k("close.text")}>{T("close.text", "Professional equipment. Shared knowledge. Room to grow.")}</p>
              <p className="mt-6 max-w-md leading-relaxed text-white/70" {...k("close.more")}>{T("close.more", "Tell us what you'd like to roast — a first sample, a new coffee brand or production for your café — and we'll show you around the roastery.")}</p>
              {org.contact_phone && <p className="mt-6 text-white/80">Or call us on <a href={`tel:${org.contact_phone.replace(/\s+/g, "")}`} className="font-semibold text-white underline-offset-4 hover:underline">{org.contact_phone}</a></p>}
            </div>
            <div className="text-[#1F1A17]" style={{ ["--pk" as string]: BURG } as React.CSSProperties}><ContactForm slug={org.slug} section="club" heading="Join or book a visit" showEvent={false} messageHint="What you'd like to roast, which roaster and roughly how much — and whether you'd like to join The Roast Society or visit first" /></div>
          </div>
        </section>
      </div>
    </CafeFrame>
  );
}
