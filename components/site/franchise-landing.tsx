import Link from "next/link";
import { ArrowRight, BadgeCheck, Check, Coffee, GraduationCap, Handshake, Megaphone, MessageCircle, Palette, Store, Users, Wrench } from "lucide-react";
import type { PublicOrg } from "@/lib/bookings/server";
import type { InfoPage } from "@/lib/site/site";
import { copyOf, ed, edImg, okImage } from "@/lib/site/copy";
import { footerModel } from "@/lib/site/footer";
import { readCafe } from "@/lib/cafe/core";
import { readLearnSettings } from "@/lib/learn/core";
import { FranchiseEnquiryForm } from "./franchise-form";

const WRAP = "mx-auto w-full max-w-[1240px] px-5 sm:px-8";
const serif = "shop-serif";

/**
 * The franchise page (a page with the "Franchise" design): why join, the two ways in (café/kiosk or brand licence),
 * what you get, who we're looking for, the steps, FAQ and the enquiry form. Every word and photo can be changed
 * on the page with "Edit this page" (copy:franchise.*). No prices are shown — they're shared after the first chat.
 */
export function FranchiseLanding({ org, pg }: { org: PublicOrg; pg: InfoPage }) {
  const T = copyOf(org.rawSettings, "franchise");
  const k = (key: string) => ed(`copy:franchise.${key}`);
  const name = org.name;
  const i = pg.index;
  const raw = org.rawSettings as { site?: { images?: Record<string, unknown> } } | null;
  const cafe = readCafe(org.rawSettings);
  const pic = (key: string, fallback: string | null) => { const v = raw?.site?.images?.[key]; return typeof v === "string" && okImage(v) ? v : fallback; };
  const hero = pg.heroImage ?? pic("frHero", pic("cafe", cafe.heroImage ?? null));
  const learn = readLearnSettings(org.rawSettings);
  const m = footerModel(org);
  const runs = m.groups.map((g) => g.title);

  const kicker = "text-[0.8125rem] font-semibold uppercase tracking-[0.18em] text-[var(--pk)]";
  const h2 = `${serif} text-[clamp(2rem,3.6vw,3rem)] font-semibold leading-[1.04] tracking-[-0.015em]`;
  const btn = "shop-btn inline-flex h-[54px] items-center gap-2 rounded-full bg-[var(--pk)] px-7 text-[1rem] font-semibold text-white shadow-[0_14px_28px_-16px_var(--pk)]";
  const ghost = "shop-btn inline-flex h-[54px] items-center gap-2 rounded-full px-7 text-[1rem] font-semibold text-[#151312] ring-1 ring-[#D9CCC2] hover:bg-white";

  const gets = [
    { key: "g1", I: Palette, title: "A brand people already love", text: `The ${name} name, logo, signage and packaging, with clear guidelines so your place looks and feels right from day one.` },
    { key: "g2", I: Coffee, title: "Coffee roasted by us", text: "Fresh, locally roasted coffee and a menu that's been proven across the counter, so every cup tastes like it should." },
    { key: "g3", I: GraduationCap, title: "Training for you and your team", text: `Hands-on barista training before you open${learn.enabled ? `, plus ${learn.name} online so new staff learn the same way` : ""} — from the perfect pour to running the numbers.` },
    { key: "g4", I: Wrench, title: "Help to get open", text: "Advice on your site, layout, equipment and suppliers, and a plan to opening day so nothing gets missed." },
    { key: "g5", I: Megaphone, title: "Marketing that brings people in", text: "Launch support and brand marketing, with room for your own personality and local ideas." },
    { key: "g6", I: MessageCircle, title: "Someone to call", text: "Ongoing support once you're trading — we check in, answer questions and share what's working across the group." },
  ];
  const steps = [
    { key: "s1", title: "Enquire", text: "Send the form below. It takes two minutes and there's no obligation." },
    { key: "s2", title: "Have a chat", text: "We'll call to get to know you, answer your questions and talk through costs." },
    { key: "s3", title: "Apply", text: "We'll email you a short application about you, your plans and your budget." },
    { key: "s4", title: "Meet us", text: `Visit ${name}, see how we work and meet the team behind the coffee.` },
    { key: "s5", title: "Agree and train", text: "Sign your agreement, then train with us while your site comes together." },
    { key: "s6", title: "Open your doors", text: "We're with you on opening day, and every day after." },
  ];
  const faqs = [
    { key: "f1", q: "How much does it cost?", a: "It depends on the model and your site. We share the full costs — upfront and ongoing — in our information pack after our first chat, so you can plan properly." },
    { key: "f2", q: "Do I need café experience?", a: "No. Some of our best people came from completely different careers. You need to love coffee, enjoy people and be ready to work hard — we'll teach you the rest." },
    { key: "f3", q: "What's the difference between a franchise and a brand licence?", a: `A franchise is a new ${name} café or kiosk, set up and run our way with full support. A brand licence suits an existing business that wants to trade under the ${name} name and serve our coffee.` },
    { key: "f4", q: "Where can I open?", a: "Tell us where you have in mind. We'll talk about the area, foot traffic and what's nearby before anything is agreed." },
    { key: "f5", q: "How long does it take to open?", a: "That mostly depends on finding and fitting out your site. We'll map out a timeline with you once you've applied." },
    { key: "f6", q: "What happens after I enquire?", a: "We'll call you for a relaxed chat. If it feels like a fit on both sides, we'll send you the application." },
  ];

  return (
    <div className="text-[#151312]">
      {/* Hero */}
      <section data-section="hero" className="relative overflow-hidden bg-[#FFF8F3]">
        <div className={`${WRAP} grid items-center gap-10 py-14 sm:py-20 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-16`}>
          <div>
            <p className={kicker} {...ed(`site.pages.${i}.eyebrow`)}>{pg.eyebrow || pg.title}</p>
            <h1 className={`${serif} mt-4 text-[clamp(2.75rem,6vw,4.75rem)] font-semibold leading-[0.98] tracking-[-0.02em]`} {...k("hero.title")}>{T("hero.title", `Open your own ${name}.`)}</h1>
            <p className="mt-6 max-w-xl text-[1.1875rem] leading-relaxed text-[#3A3431]" {...ed(`site.pages.${i}.intro`)}>{pg.intro || `Bring ${name} to your neighbourhood — as a new café or kiosk, or by licensing our brand for the business you already run.`}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="#enquire" className={btn} data-track="Franchise: enquire (hero)">Start the conversation<ArrowRight className="h-5 w-5" /></Link>
              <Link href="#how" className={ghost} data-track="Franchise: how it works (hero)">How it works</Link>
            </div>
            {runs.length > 1 && (
              <div className="mt-10 border-t border-[#EADFD6] pt-6">
                <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.14em] text-[#8C847D]" {...k("hero.runs")}>{T("hero.runs", `Already part of ${name}`)}</p>
                <ul className="mt-3 flex flex-wrap gap-2">{runs.map((r) => <li key={r} className="rounded-full bg-white px-3.5 py-1.5 text-[0.875rem] font-medium text-[#3A3431] ring-1 ring-[#EADFD6]">{r}</li>)}</ul>
              </div>
            )}
          </div>
          {hero
            ? <img {...edImg(`site.pages.${i}.heroImage`)} src={hero} alt={`${name} café`} className="aspect-[4/5] w-full rounded-[32px] object-cover shadow-[0_40px_80px_-50px_rgba(60,20,25,.6)] lg:aspect-[5/6]" />
            : <div {...edImg(`site.pages.${i}.heroImage`)} className="grid aspect-[4/5] w-full place-items-center rounded-[32px] bg-[color-mix(in_srgb,var(--pk)_10%,#FFF1EA)] text-[var(--pk)] lg:aspect-[5/6]"><Store className="h-20 w-20" strokeWidth={1.2} /></div>}
        </div>
      </section>

      {/* Two ways in */}
      <section data-section="models" className="bg-[#161213] text-white">
        <div className={`${WRAP} py-16 sm:py-24`}>
          <p className={kicker} {...k("models.kicker")}>{T("models.kicker", "Two ways to join")}</p>
          <h2 className={`${h2} mt-3 max-w-3xl`} {...k("models.title")}>{T("models.title", "Start fresh, or bring the business you have.")}</h2>
          <div className="mt-10 grid gap-5 lg:grid-cols-2">
            {[
              { key: "m1", I: Store, title: "A café or kiosk", text: `A new ${name}, built around our brand, coffee and way of working — with support at every step from finding your site to opening day.`,
                points: ["Full brand: name, look, signage and packaging", "Our coffee, menu and suppliers", "Training before you open", "Help with site, fit-out and launch"] },
              { key: "m2", I: Handshake, title: "A brand licence", text: `Already run a café, kiosk or coffee business? Trade under the ${name} name and serve our coffee, keeping the team and premises you have.`,
                points: [`Use the ${name} name and brand`, "Our coffee, roasted for you", "Barista training for your team", "Marketing and brand support"] },
            ].map((c) => (
              <div key={c.key} className="flex flex-col rounded-[28px] bg-white/[0.05] p-7 ring-1 ring-white/10 sm:p-9">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--pk)] text-white"><c.I className="h-6 w-6" /></span>
                <h3 className={`${serif} mt-5 text-[2rem] font-semibold leading-tight`} {...k(`${c.key}.title`)}>{T(`${c.key}.title`, c.title)}</h3>
                <p className="mt-3 text-[1.0313rem] leading-relaxed text-white/75" {...k(`${c.key}.text`)}>{T(`${c.key}.text`, c.text)}</p>
                <ul className="mt-6 space-y-2.5 border-t border-white/10 pt-6">
                  {c.points.map((p, j) => <li key={j} className="flex items-start gap-2.5 text-[0.9688rem]"><Check className="mt-0.5 h-5 w-5 shrink-0 text-[var(--pk)]" /><span {...k(`${c.key}.p${j + 1}`)}>{T(`${c.key}.p${j + 1}`, p)}</span></li>)}
                </ul>
                <Link href="#enquire" className="mt-8 inline-flex items-center gap-1.5 text-[0.9688rem] font-semibold text-white hover:text-[var(--pk)]" data-track={`Franchise: enquire (${c.key})`}>Ask about this<ArrowRight className="h-4 w-4" /></Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What you get */}
      <section data-section="support" className={`${WRAP} py-16 sm:py-24`}>
        <div className="max-w-3xl">
          <p className={kicker} {...k("get.kicker")}>{T("get.kicker", "What you get")}</p>
          <h2 className={`${h2} mt-3`} {...k("get.title")}>{T("get.title", "Your business, with a whole team behind it.")}</h2>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {gets.map((g) => (
            <div key={g.key} className="rounded-[24px] bg-white p-6 ring-1 ring-[#EDE3DB] transition hover:-translate-y-0.5 hover:shadow-[0_24px_44px_-30px_rgba(80,45,40,.4)]">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[color-mix(in_srgb,var(--pk)_12%,white)] text-[var(--pk)]"><g.I className="h-5 w-5" /></span>
              <h3 className="mt-4 text-[1.1875rem] font-semibold" {...k(`${g.key}.title`)}>{T(`${g.key}.title`, g.title)}</h3>
              <p className="mt-2 text-[0.9688rem] leading-relaxed text-[#5E5853]" {...k(`${g.key}.text`)}>{T(`${g.key}.text`, g.text)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Who we're looking for */}
      <section data-section="who" className="bg-[color-mix(in_srgb,var(--pk)_6%,#FFF8F3)]">
        <div className={`${WRAP} grid gap-10 py-16 sm:py-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16`}>
          <div>
            <p className={kicker} {...k("who.kicker")}>{T("who.kicker", "Who we're looking for")}</p>
            <h2 className={`${h2} mt-3`} {...k("who.title")}>{T("who.title", "People who love coffee — and people.")}</h2>
            <p className="mt-5 whitespace-pre-line text-[1.0625rem] leading-relaxed text-[#3A3431]" {...k("who.text")}>{T("who.text", "There's no right background. You might be fresh out of uni, a seasoned hospitality pro or changing careers completely. What matters is that you're determined, hands-on and genuinely enjoy making someone's day.")}</p>
          </div>
          <ul className="grid gap-3 self-center">
            {[
              { key: "w1", I: Coffee, t: "A real love of good coffee" },
              { key: "w2", I: Users, t: "Friendly, approachable and great with people" },
              { key: "w3", I: BadgeCheck, t: "Hardworking and ready to be hands-on" },
              { key: "w4", I: Handshake, t: "Keen to follow a proven way — and add your own ideas" },
            ].map((w) => (
              <li key={w.key} className="flex items-center gap-4 rounded-2xl bg-white p-4 ring-1 ring-[#EDE3DB]">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--pk)] text-white"><w.I className="h-5 w-5" /></span>
                <span className="text-[1.0313rem] font-medium" {...k(w.key)}>{T(w.key, w.t)}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* How it works */}
      <section id="how" data-section="how" className={`${WRAP} scroll-mt-24 py-16 sm:py-24`}>
        <p className={kicker} {...k("how.kicker")}>{T("how.kicker", "How it works")}</p>
        <h2 className={`${h2} mt-3 max-w-3xl`} {...k("how.title")}>{T("how.title", "From first chat to opening day.")}</h2>
        <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {steps.map((s, n) => (
            <li key={s.key} className="relative rounded-[24px] bg-white p-6 ring-1 ring-[#EDE3DB]">
              <span className={`${serif} text-[2.75rem] font-semibold leading-none text-[color-mix(in_srgb,var(--pk)_70%,#151312)]`}>{String(n + 1).padStart(2, "0")}</span>
              <h3 className="mt-3 text-[1.1875rem] font-semibold" {...k(`${s.key}.title`)}>{T(`${s.key}.title`, s.title)}</h3>
              <p className="mt-1.5 text-[0.9688rem] leading-relaxed text-[#5E5853]" {...k(`${s.key}.text`)}>{T(`${s.key}.text`, s.text)}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* FAQ + enquiry */}
      <section id="enquire" data-section="enquire" className="scroll-mt-24 bg-[#FFF8F3]">
        <div className={`${WRAP} grid gap-12 py-16 sm:py-24 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-16`}>
          <div>
            <p className={kicker} {...k("faq.kicker")}>{T("faq.kicker", "Questions")}</p>
            <h2 className={`${h2} mt-3`} {...k("faq.title")}>{T("faq.title", "Good to know.")}</h2>
            <div className="mt-8 divide-y divide-[#EADFD6] border-y border-[#EADFD6]">
              {faqs.map((f) => (
                <details key={f.key} className="group py-4">
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-[1.0625rem] font-semibold">
                    <span {...k(`${f.key}.q`)}>{T(`${f.key}.q`, f.q)}</span>
                    <span className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white text-[var(--pk)] ring-1 ring-[#EADFD6] transition group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-2 pr-10 text-[0.9688rem] leading-relaxed text-[#5E5853]" {...k(`${f.key}.a`)}>{T(`${f.key}.a`, f.a)}</p>
                </details>
              ))}
            </div>
            {(org.contact_phone || org.contact_email) && (
              <p className="mt-8 text-[0.9688rem] text-[#5E5853]">Rather talk now? {org.contact_phone && <a href={`tel:${org.contact_phone.replace(/[^\d+]/g, "")}`} className="font-semibold text-[var(--pk)]">{org.contact_phone}</a>}{org.contact_phone && org.contact_email ? " · " : ""}{org.contact_email && <a href={`mailto:${org.contact_email}`} className="font-semibold text-[var(--pk)]">{org.contact_email}</a>}</p>
            )}
          </div>
          <div className="rounded-[28px] bg-white p-6 shadow-[0_40px_80px_-56px_rgba(60,20,25,.55)] ring-1 ring-[#EDE3DB] sm:p-9">
            <p className={`${serif} text-[2rem] font-semibold leading-tight`} {...k("form.title")}>{T("form.title", `Let's talk about your ${name}`)}</p>
            <p className="mt-2 text-[#5E5853]" {...k("form.text")}>{T("form.text", "Start here — we'll be in touch to arrange a relaxed chat.")}</p>
            <div className="mt-6"><FranchiseEnquiryForm slug={org.slug} /></div>
          </div>
        </div>
      </section>
    </div>
  );
}
