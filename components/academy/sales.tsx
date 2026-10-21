import "@fontsource-variable/newsreader/opsz.css";
import Link from "next/link";
import {
  ArrowRight, BookOpen, Briefcase, ChevronDown, Coffee, Flame, Gauge, GraduationCap, Home, Leaf, Milk, Send, Settings2, Sparkles, Star, Store, Globe, BarChart3, Bot,
} from "lucide-react";
import { money } from "@/lib/format";
import { priceStory } from "@/lib/learn/core";
import type { LearnOrg } from "@/lib/learn/server";
import { copyOf, ed, edImg } from "@/lib/site/copy";
import { LearnLogin } from "./forms";

type Level = { id: string; key: string; number: number; title: string; description: string | null };

const pk = "text-[var(--pk)]";
const btnPk = "shop-btn inline-flex h-[52px] items-center justify-center gap-2 rounded-full bg-[var(--pk)] px-7 text-[0.9375rem] font-semibold text-white shadow-[0_14px_28px_-16px_var(--pk)] hover:brightness-105";
const btnLine = "shop-btn inline-flex h-[52px] items-center justify-center gap-2 rounded-full border border-[#1F1B19] bg-white/70 px-7 text-[0.9375rem] font-semibold text-[#1F1B19] hover:bg-white";
const eyebrow = "text-[0.8125rem] font-semibold uppercase tracking-[0.16em] text-[var(--pk)]";
const h2 = "shop-serif text-[2.125rem] font-medium leading-[1.06] text-[#151312] sm:text-[2.875rem]";
const NARROW = "mx-auto w-full max-w-[1060px] px-5 sm:px-6";
const MID = "mx-auto w-full max-w-[1200px] px-5 sm:px-6";
const muted = "text-[#5E5853]";
const LEVEL_ICONS = [Coffee, Gauge, Milk, Leaf, Flame, Star, Briefcase, Home, Settings2];

/** The public sales page for the online course (people who aren't signed in). Every number comes from the course and the prices. */
export function AcademySales({ org, counts, levels, freeLesson, signIn }: {
  /** "Sign in" was clicked — show the sign-in box */ signIn?: boolean;
  org: LearnOrg; counts: { lessons: number; modules: number; levels: number; quizzes: number }; levels: Level[]; freeLesson: string | null;
}) {
  const s = org.learn, st = priceStory(s);
  const base = `/academy/${org.slug}`;
  const $ = (n: number) => money(n, org.currency).replace(/\.00$/, "");
  const sell = s.enabled;
  const addon = sell && s.plans.with_course && st.courseSavePct > 0;
  // Every word on the page can be changed with "Edit this page" (saved in settings.site.copy as academy.*).
  // {lessons} {levels} {modules} {months} {price} {pct} {yearly} {monthly} {monthsfree} are filled in from the course and prices.
  const c = copyOf(org.rawSettings, "academy");
  const vars: Record<string, string> = {
    lessons: String(counts.lessons), levels: String(counts.levels), modules: String(counts.modules), quizzes: String(counts.quizzes), months: String(s.accessMonths),
    price: $(s.prices.with_course), pct: String(st.courseSavePct), yearly: $(s.prices.yearly), monthly: $(s.prices.monthly), monthsfree: String(st.monthsFree), name: s.name,
  };
  const fill = (t: string) => t.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
  const T = (key: string, fallback: string) => { const raw = c(key, fallback); return { ...ed(`copy:academy.${key}`, /[{\n]/.test(raw) ? raw : undefined), children: fill(raw) }; };
  const find = (re: RegExp) => levels.find((l) => re.test(l.title));
  const levelHref = (l: Level | undefined) => (l ? `${base}/course#level-${l.key}` : `${base}/course`);
  const journey = [
    { k: "home" as const, Icon: Home, title: "Better coffee at home", text: "Learn the skills to make café-quality coffee in your own kitchen, with clear, step-by-step lessons.", cta: "Explore home coffee", href: levelHref(find(/home/i)) },
    { k: "cafe" as const, Icon: Store, title: "Build your café knowledge", text: "Develop the practical skills and theory used in professional cafés, from espresso to service.", cta: "Explore café skills", href: levelHref(find(/basics/i) ?? find(/work/i)) },
    { k: "deeper" as const, Icon: Leaf, title: "Go deeper into coffee", text: "Explore origins, tasting, processing and roasting, and build a deeper understanding of what's in your cup.", cta: "Explore coffee knowledge", href: levelHref(find(/specialty|origin/i)) },
  ];
  const faqs = [
    { k: "anywhere", q: "Can I learn from anywhere?", a: "Yes. Everything is online, so you can learn on your phone, tablet or computer, whenever it suits you." },
    { k: "machine", q: "Do I need a coffee machine?", a: "Not to start. The lessons, knowledge checks and roast simulator all work without one. To practise your shots and pours you'll want a machine at home or at work." },
    ...(freeLesson ? [{ k: "free", q: "Can I try a lesson free?", a: "Yes — the first module is free. Start it now, no payment needed." }] : []),
    ...(addon ? [{ k: "discount", q: "I'm booked on a hands-on class. Do I get a discount?", a: "Yes. Add {months} months online for {price} when you book an eligible class — {pct}% off the yearly price. Already booked? Sign in with the email you booked with." }] : []),
  ];

  return (
    <div className="text-[#151312]">
      {/* Hero: text on the left, the photo bleeding off the right edge */}
      <section className="relative overflow-hidden">
        {s.heroImage && (
          <div className="relative h-[280px] sm:h-[380px] lg:absolute lg:inset-y-0 lg:right-0 lg:h-auto lg:w-[56%]">
            <img {...edImg("learn.heroImage")} src={s.heroImage} alt="" className="h-full w-full object-cover object-[35%_center]" />
            <div className="absolute inset-y-0 left-0 hidden w-56 bg-gradient-to-r from-[#FCFAF7] via-[#FCFAF7]/60 to-transparent lg:block" />
          </div>
        )}
        <div className="relative mx-auto w-full max-w-[1240px] px-5 sm:px-6">
          <div className="py-10 lg:min-h-[600px] lg:max-w-[660px] lg:py-[72px]">
            <p className={eyebrow} {...T("hero.eyebrow", "{name}")} />
            <h1 className="shop-serif mt-4 text-[2.75rem] font-medium leading-[1.04] tracking-[-0.02em] sm:text-[3.75rem] lg:whitespace-nowrap">
              <span className="block" {...T("hero.title", "Learn to be a barista.")} /><span className={`block ${pk}`} {...T("hero.accent", "From anywhere.")} />
            </h1>
            <p className="mt-5 max-w-[430px] text-[1.125rem] leading-[1.6] text-[#2B2522]" {...T("hero.text", "Build your skills, grow your confidence and make better coffee. Learn online, at your own pace.")} />
            <div className="mt-8 flex flex-wrap gap-3">
              {sell && <Link href={`${base}/join`} className={`${btnPk} px-8`} data-track="Academy: start learning (hero)"><span {...T("hero.button", "Start learning")} /><ArrowRight className="h-4 w-4" /></Link>}
              {freeLesson && <Link href={`${base}/lesson/${freeLesson}`} className={`${btnLine} px-8`} data-track="Academy: free lesson (hero)"><span {...T("hero.free", "Try a free lesson")} /></Link>}
            </div>
            <ul className="mt-10 grid max-w-[460px] grid-cols-4 gap-3">
              {[
                { k: "lessons", Icon: BookOpen, t: "{lessons} lessons" },
                { k: "levels", Icon: BarChart3, t: "{levels} learning levels" },
                ...(s.ai.enabled ? [{ k: "coach", Icon: Bot, t: "AI coffee coach" }] : [{ k: "checks", Icon: Sparkles, t: "{quizzes} knowledge checks" }]),
                { k: "pace", Icon: Globe, t: "Learn at your pace" },
              ].map(({ k, Icon, t }) => (
                <li key={k} className="text-center"><Icon className={`mx-auto h-9 w-9 ${pk}`} strokeWidth={1.5} /><p className="mx-auto mt-2 max-w-[90px] text-[0.8125rem] leading-snug text-[#2B2522]" {...T(`hero.stat.${k}`, t)} /></li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Sign in — opens from "Sign in" in the menu (#sign-in) */}
      <section id="sign-in" className={signIn ? "scroll-mt-28" : "hidden scroll-mt-28 target:block"}>
        <div className="mx-auto max-w-[520px] px-5 pb-6 pt-2">
          <div className="rounded-xl bg-white p-6 ring-1 ring-[#EDE3DB]">
            <p className="shop-serif text-[1.5rem] font-medium" {...T("signin.title", "Sign in")} />
            <p className={`mb-4 mt-1 text-[0.875rem] ${muted}`} {...T("signin.text", "Joined already, or booked a class with us? Use the same email.")} />
            <LearnLogin slug={org.slug} />
          </div>
        </div>
      </section>

      {/* Add-on with a hands-on class */}
      {addon && (
        <div className={`${MID} pt-6`}>
          <Link href={`/${org.slug}`} data-track="Academy: add-on banner" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-[color-mix(in_srgb,var(--pk)_8%,white)] px-5 py-4 ring-1 ring-[color-mix(in_srgb,var(--pk)_18%,white)] hover:brightness-[1.02]">
            <GraduationCap className={`h-6 w-6 shrink-0 ${pk}`} />
            <p className="shop-serif text-[1.1875rem] font-medium" {...T("addon.title", "Taking a hands-on class? Add online training for {pct}% off.")} />
            <p className={`text-[0.8125rem] ${muted}`} {...T("addon.text", "{months} months for {price} with an eligible course.")} />
            <span className={`ml-auto inline-flex items-center gap-1 text-[0.875rem] font-semibold ${pk}`}><span {...T("addon.link", "Explore classes")} /><ArrowRight className="h-4 w-4" /></span>
          </Link>
        </div>
      )}

      {/* Journey */}
      <section className={`${NARROW} py-16 sm:py-[72px]`}>
        <p className={eyebrow} {...T("journey.eyebrow", "Your coffee journey")} />
        <h2 className={`${h2} mt-2`} {...T("journey.title", "Learn it. Practise it. Pour it.")} />
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {journey.map(({ k, Icon, title, text, cta, href }) => (
            <Link key={k} href={href} className="shop-card flex flex-col overflow-hidden rounded-xl bg-white shadow-[0_10px_30px_-24px_rgba(60,30,20,.45)] ring-1 ring-[#EFE6DF]">
              {s.images[k]
                ? <div className="h-[190px] overflow-hidden"><img {...edImg(`learn.images.${k}`)} src={s.images[k]!} alt="" className="shop-zoom h-full w-full object-cover" /></div>
                : <div {...edImg(`learn.images.${k}`)} className="grid h-[190px] place-items-center bg-[linear-gradient(135deg,color-mix(in_srgb,var(--pk)_10%,#FFF6F1),#F6EDE6)]"><Icon className={`h-14 w-14 ${pk}`} strokeWidth={1.3} /></div>}
              <div className="flex flex-1 flex-col p-5">
                <p className="shop-serif text-[1.375rem] font-medium" {...T(`journey.${k}.title`, title)} />
                <p className={`mt-2 flex-1 text-[0.9063rem] leading-relaxed ${muted}`} {...T(`journey.${k}.text`, text)} />
                <span className={`mt-4 inline-flex items-center gap-1 text-[0.875rem] font-semibold ${pk}`}><span {...T(`journey.${k}.link`, cta)} /><ArrowRight className="h-4 w-4" /></span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* AI coach */}
      {s.ai.enabled && (
        <section className="bg-[color-mix(in_srgb,var(--pk)_7%,#FFF8F5)] py-16 sm:py-[72px]">
          <div className={`${NARROW} grid items-center gap-10 lg:grid-cols-[1fr_470px]`}>
            <div>
              <p className={eyebrow} {...T("coach.eyebrow", "Meet Bean Coach")} />
              <h2 className={`${h2} mt-2 whitespace-pre-line`} {...T("coach.title", "A little guidance.\nA better next cup.")} />
              <p className={`mt-4 max-w-[440px] text-[1rem] leading-relaxed ${muted}`} {...T("coach.text", "Ask questions, get personalised advice and even upload a photo of your latte art for feedback from our AI coffee coach.")} />
              <Link href={`${base}/coach`} className={`${btnPk} mt-6`}><span {...T("coach.button", "Meet your AI coach")} /><ArrowRight className="h-4 w-4" /></Link>
            </div>
            <div className="rounded-xl bg-white p-5 shadow-[0_30px_60px_-40px_rgba(80,40,30,.45)] ring-1 ring-[#EDE3DB] sm:p-6" aria-label="Example of the AI coach's feedback">
              <span className="rounded-full bg-[#F4ECE6] px-3 py-1 text-[0.75rem] font-semibold text-[#5E5853]" {...T("coach.example", "Example AI feedback")} />
              <div className="mt-4 flex items-start justify-end gap-3">
                {s.images.coach
                  ? <img {...edImg("learn.images.coach")} src={s.images.coach} alt="" className="h-24 w-28 shrink-0 rounded-xl object-cover" />
                  : <div {...edImg("learn.images.coach")} className="grid h-24 w-28 shrink-0 place-items-center rounded-xl bg-[linear-gradient(135deg,#C8946A,#7A4A2E)]"><Coffee className="h-10 w-10 text-white/90" strokeWidth={1.4} /></div>}
                <p className="rounded-2xl rounded-tr-sm bg-[#F4ECE6] px-4 py-3 text-[0.875rem]" {...T("coach.question", "Can you give me some feedback on my latte art?")} />
              </div>
              <div className="mt-4 flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--pk)_12%,white)]">{s.logo ? <img src={s.logo} alt="" className="h-8 w-8 object-contain" /> : <Bot className={`h-5 w-5 ${pk}`} />}</span>
                <p className="rounded-2xl rounded-tl-sm bg-white px-4 py-3 text-[0.875rem] leading-relaxed ring-1 ring-[#EDE3DB]" {...T("coach.answer", "Nice pour! Your milk texture looks smooth and glossy. Try pouring a little slower at the end to get a more defined heart, and keep the cup slightly tilted for longer.")} />
              </div>
              <Link href={`${base}/coach`} className="mt-5 flex h-11 items-center justify-between rounded-xl px-4 text-[0.875rem] text-[#A39A93] ring-1 ring-[#EDE3DB] hover:ring-[var(--pk)]"><span {...T("coach.ask", "Ask a question…")} /><Send className={`h-4 w-4 ${pk}`} /></Link>
            </div>
          </div>
        </section>
      )}

      {/* Curriculum */}
      <section className={`${NARROW} py-16 sm:py-[72px]`}>
        <p className={eyebrow} {...T("curriculum.eyebrow", "Our curriculum")} />
        <h2 className={`${h2} mt-2`} {...T("curriculum.title", "From your first shot to your next level.")} />
        <p className={`mt-3 text-[0.9375rem] ${muted}`} {...T("curriculum.text", "{modules} modules. {lessons} lessons. Knowledge checks as you go.")} />
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {levels.map((l, i) => {
            const Icon = LEVEL_ICONS[i % LEVEL_ICONS.length];
            return (
              <Link key={l.id} href={levelHref(l)} className="shop-card flex items-start gap-4 rounded-lg bg-white px-5 py-[18px] ring-1 ring-[#EFE6DF]">
                <Icon className={`mt-0.5 h-8 w-8 shrink-0 ${pk}`} strokeWidth={1.4} />
                <span><span className="shop-serif block text-[1.1875rem] font-medium leading-snug">{l.title}</span>{l.description && <span className={`mt-1 block text-[0.8438rem] leading-relaxed ${muted}`}>{l.description}</span>}</span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Roast simulator */}
      <section className="bg-[radial-gradient(ellipse_at_20%_30%,#3A2A24,#1B1514_60%)] py-16 text-white sm:py-[64px]">
        <div className={`${NARROW} grid items-center gap-12 lg:grid-cols-[440px_1fr]`}>
          <RoastPreview />
          <div>
            <p className={eyebrow} {...T("roast.eyebrow", "Interactive roast simulator")} />
            <h2 className="shop-serif mt-2 whitespace-pre-line text-[2rem] font-medium leading-[1.08] sm:text-[2.625rem]" {...T("roast.title", "Explore roasting.\nWithout firing up a roaster.")} />
            <p className="mt-4 max-w-[460px] text-[1rem] leading-relaxed text-white/75" {...T("roast.text", "Learn how roasting works with our interactive simulator. Experiment with profiles, see how changes affect flavour, and build your understanding.")} />
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href={`${base}/roast`} className={btnPk}><span {...T("roast.button", "Try the roast simulator")} /><ArrowRight className="h-4 w-4" /></Link>
              <Link href={levelHref(find(/roast/i))} className="shop-btn inline-flex h-12 items-center rounded-full border-[1.5px] border-white/70 px-7 text-[0.9375rem] font-semibold text-white hover:bg-white/10"><span {...T("roast.more", "Learn more")} /></Link>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      {sell && (s.plans.yearly || s.plans.monthly) && (
        <section className={`${MID} py-16 sm:py-[72px]`} id="pricing">
          <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_660px]">
            <div>
              <p className={eyebrow} {...T("pricing.eyebrow", "Pricing")} />
              <h2 className="shop-serif mt-2 whitespace-pre-line text-[2.125rem] font-medium leading-[1.1] sm:text-[2.375rem]" {...T("pricing.title", "Great coffee knowledge.\nOn your terms.")} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {s.plans.yearly && (
                <div className="relative flex flex-col rounded-xl bg-white p-6 ring-1 ring-[#EFE6DF]">
                  {st.monthsFree > 0 && <span className="absolute right-5 top-5 rounded-full bg-[var(--pk)] px-3 py-1 text-[0.6875rem] font-bold text-white" {...T("pricing.badge", "Best value")} />}
                  <p className="font-semibold">{s.accessMonths === 12 ? "Annual" : `${s.accessMonths} months`}</p>
                  <p className="shop-serif mt-2 text-[2rem] font-medium">{$(s.prices.yearly)}<span className={`text-[0.9375rem] ${muted}`}> / {s.accessMonths === 12 ? "year" : `${s.accessMonths} months`}</span></p>
                  <p className={`mt-2 flex-1 text-[0.875rem] ${muted}`} {...T("pricing.yearly.text", s.ai.enabled ? "Full access to all lessons, tools and your AI coffee coach." : "Full access to all lessons and tools.")} />
                  <Link href={`${base}/join?plan=yearly`} className={`${btnPk} mt-5 w-full`}><span {...T("pricing.yearly.button", s.accessMonths === 12 ? "Get annual access" : "Get full access")} /><ArrowRight className="h-4 w-4" /></Link>
                </div>
              )}
              {s.plans.monthly && (
                <div className="flex flex-col rounded-xl bg-white p-6 ring-1 ring-[#EFE6DF]">
                  <p className="font-semibold">Monthly</p>
                  <p className="shop-serif mt-2 text-[2rem] font-medium">{$(s.prices.monthly)}<span className={`text-[0.9375rem] ${muted}`}> / month</span></p>
                  <p className={`mt-2 flex-1 text-[0.875rem] ${muted}`} {...T("pricing.monthly.text", s.ai.enabled ? "Full access to all lessons, tools and your AI coffee coach. Cancel any time." : "Full access to all lessons and tools. Cancel any time.")} />
                  <Link href={`${base}/join?plan=monthly`} className={`${btnLine} mt-5 w-full`}><span {...T("pricing.monthly.button", "Get monthly access")} /><ArrowRight className="h-4 w-4" /></Link>
                </div>
              )}
            </div>
          </div>
          {addon && (
            <>
              <div className="mt-6 flex flex-wrap items-center gap-4 rounded-xl bg-[color-mix(in_srgb,var(--pk)_8%,white)] px-6 py-5 ring-1 ring-[color-mix(in_srgb,var(--pk)_18%,white)]">
                <GraduationCap className={`h-8 w-8 shrink-0 ${pk}`} strokeWidth={1.5} />
                <div className="min-w-0 flex-1">
                  <p className="shop-serif text-[1.375rem] font-medium" {...T("pricing.class.title", "Hands-on training. A year of learning.")} />
                  <p className={`text-[0.875rem] ${muted}`} {...T("pricing.class.text", "Add {months} months online for {price} — save {pct}% with an eligible barista class.")} />
                </div>
                <Link href={`/${org.slug}`} className={btnPk}><span {...T("pricing.class.button", "Book a class + save")} /><ArrowRight className="h-4 w-4" /></Link>
              </div>
              <p className={`mt-3 text-center text-[0.75rem] ${muted}`} {...T("pricing.note", "Online access extra. Hands-on class priced separately.")} />
            </>
          )}
        </section>
      )}

      {/* FAQ + sign in */}
      <section className={`${MID} grid gap-10 pb-20 lg:grid-cols-[minmax(0,1fr)_640px]`}>
        <div>
          <p className={eyebrow} {...T("faq.eyebrow", "FAQ")} />
          <h2 className="shop-serif mt-2 text-[2.125rem] font-medium leading-[1.1] sm:text-[2.375rem]" {...T("faq.title", "A few good questions.")} />
        </div>
        <div className="space-y-3">
          {faqs.map((f) => (
            <details key={f.k} className="group rounded-lg bg-white px-5 ring-1 ring-[#EFE6DF]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-4 font-medium"><span {...T(`faq.${f.k}.q`, f.q)} /><ChevronDown className="h-4 w-4 shrink-0 transition group-open:rotate-180" /></summary>
              <p className={`pb-4 text-[0.9375rem] leading-relaxed ${muted}`} {...T(`faq.${f.k}.a`, f.a)} />
            </details>
          ))}
        </div>
      </section>

      {/* Closing band */}
      <section className="relative overflow-hidden bg-[#1F3A2E] text-white">
        <Leaf aria-hidden className="pointer-events-none absolute -left-10 -top-6 h-48 w-48 rotate-[-25deg] text-white/[0.06]" strokeWidth={0.8} />
        <Leaf aria-hidden className="pointer-events-none absolute -bottom-10 right-10 h-56 w-56 rotate-[35deg] text-white/[0.06]" strokeWidth={0.8} />
        <div className={`${MID} relative flex flex-wrap items-center justify-between gap-6 py-14`}>
          <div className="flex items-center gap-5">
            <div>
              <h2 className="shop-serif whitespace-pre-line text-[2rem] font-medium leading-tight sm:text-[2.5rem]" {...T("closing.title", "Your barista journey\nstarts here.")} />
              <p className="mt-2 text-[0.9375rem] text-white/75" {...T("closing.text", "Learn at your own pace, with practical skills and expert guidance.")} />
            </div>
          </div>
          <Link href={sell ? `${base}/join` : freeLesson ? `${base}/lesson/${freeLesson}` : `${base}/course`} className={btnPk}><span {...T("closing.button", "Start learning online")} /><ArrowRight className="h-4 w-4" /></Link>
        </div>
      </section>
    </div>
  );
}

/** A still picture of the roast simulator (the real one is interactive, one click away). */
function RoastPreview() {
  const row = (label: string, value: string, pct: number) => (
    <div>
      <div className="flex justify-between text-[0.6875rem] text-white/70"><span>{label}</span><span>{value}</span></div>
      <div className="mt-1.5 h-1.5 rounded-full bg-white/15"><div className="relative h-1.5 rounded-full bg-[var(--pk)]" style={{ width: `${pct}%` }}><span className="absolute -right-1.5 -top-1 h-3.5 w-3.5 rounded-full bg-white" /></div></div>
    </div>
  );
  return (
    <div className="rounded-[20px] bg-[#231C1B] p-5 ring-1 ring-white/10" aria-hidden>
      <p className="flex items-center gap-2 text-[0.875rem] font-semibold"><Flame className="h-4 w-4 text-[var(--pk)]" />Roast Simulator</p>
      <div className="mt-4 grid gap-5 sm:grid-cols-[1fr_170px]">
        <svg viewBox="0 0 300 180" className="w-full">
          {[30, 70, 110, 150].map((y) => <line key={y} x1="28" x2="295" y1={y} y2={y} stroke="rgba(255,255,255,.08)" />)}
          {["250", "200", "150", "100"].map((t, i) => <text key={t} x="0" y={34 + i * 40} fill="rgba(255,255,255,.5)" fontSize="10">{t}</text>)}
          <path d="M30 60 C 45 150, 60 150, 80 120 S 150 70, 200 55 S 270 40, 295 36" fill="none" stroke="var(--pk)" strokeWidth="3" />
          <path d="M30 150 C 70 130, 120 105, 170 92 S 260 78, 295 74" fill="none" stroke="#4EA3FF" strokeWidth="3" />
          <text x="140" y="176" fill="rgba(255,255,255,.5)" fontSize="10">Time (min)</text>
        </svg>
        <div className="space-y-4 rounded-xl bg-white/5 p-4">
          {row("Charge temp", "200 °C", 62)}
          {row("Airflow", "60%", 60)}
          {row("Drum speed", "7 rpm", 45)}
          <p className="rounded-lg py-2 text-center text-[0.75rem] font-semibold ring-1 ring-white/25">Start roast</p>
        </div>
      </div>
      <p className="mt-3 flex gap-4 text-[0.6875rem] text-white/60"><span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-[var(--pk)]" />Bean temp</span><span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-[#4EA3FF]" />Environment</span></p>
    </div>
  );
}
