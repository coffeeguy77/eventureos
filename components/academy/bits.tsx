import Link from "next/link";
import { Award, BookOpen, Coffee, Flame, Lock, MessageCircle, Sparkles, Thermometer, Trophy } from "lucide-react";
import { money } from "@/lib/format";
import { PLAN_LABEL, priceStory, type Plan } from "@/lib/learn/core";
import type { LearnOrg } from "@/lib/learn/server";
import { btn, card } from "./shell";

/** The three ways to buy, worked out from the prices (labels like "save 50%" come from the numbers, not fixed text). */
export function planOptions(org: LearnOrg, opts: { courseEligible: boolean }) {
  const s = org.learn, st = priceStory(s);
  const $ = (n: number) => money(n, org.currency).replace(/\.00$/, "");
  const out: { plan: Plan; title: string; price: string; note: string; badge: string | null; available: boolean }[] = [];
  if (s.plans.with_course) out.push({ plan: "with_course", title: "With a barista course", price: $(s.prices.with_course), badge: st.courseSavePct > 0 ? `Save ${st.courseSavePct}%` : null, available: opts.courseEligible,
    note: `${s.accessMonths} months, paid once${opts.courseEligible ? "" : " — add it when you book a barista course"}` });
  if (s.plans.yearly) out.push({ plan: "yearly", title: "Yearly", price: $(s.prices.yearly), badge: st.monthsFree > 0 ? `${st.monthsFree} months free` : null, available: true, note: `${s.accessMonths} months, paid once (${$(st.perMonthYearly)} a month)` });
  if (s.plans.monthly) out.push({ plan: "monthly", title: "Monthly", price: `${$(s.prices.monthly)}/mo`, badge: null, available: true, note: "Cancel any time" });
  return out;
}

export function PlanCards({ org, courseEligible, signedIn }: { org: LearnOrg; courseEligible: boolean; signedIn: boolean }) {
  const plans = planOptions(org, { courseEligible });
  const base = `/academy/${org.slug}`;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {plans.map((p) => (
        <div key={p.plan} className={`relative flex flex-col rounded-2xl border p-5 ${p.available ? "border-line bg-surface shadow-card" : "border-dashed border-line-strong bg-zinc-50"}`}>
          {p.badge && <span className="absolute -top-2.5 right-4 rounded-full bg-[var(--b)] px-2.5 py-0.5 text-[0.6875rem] font-bold uppercase tracking-wide text-[var(--on-b)]">{p.badge}</span>}
          <p className="text-[0.9375rem] font-semibold text-ink">{p.title}</p>
          <p className="mt-1 text-[1.75rem] font-bold tracking-tight text-ink">{p.price}</p>
          <p className="mt-1 flex-1 text-[0.875rem] text-ink-muted">{p.note}</p>
          {p.available
            ? <Link href={`${base}/join?plan=${p.plan}`} className={`${btn} mt-4`}>{signedIn ? "Choose" : "Get started"}</Link>
            : <Link href={`/${org.slug}`} className="mt-4 inline-flex h-11 items-center justify-center rounded-xl px-4 text-[0.9063rem] font-semibold text-[var(--b)] ring-1 ring-line-strong hover:bg-white">See barista courses</Link>}
        </div>
      ))}
    </div>
  );
}

export function Features({ counts, ai, rooms }: { counts: { lessons: number; modules: number; levels: number; quizzes: number }; ai: boolean; rooms: boolean }) {
  const items = [
    { Icon: BookOpen, title: `${counts.lessons} lessons`, text: `${counts.modules} modules across ${counts.levels} levels — espresso, milk & latte art, specialty coffee, roasting, grinders and more.` },
    { Icon: Sparkles, title: `${counts.quizzes} knowledge checks`, text: "Quick questions in each lesson and a mastery quiz for every module." },
    { Icon: Thermometer, title: "Roast simulator", text: "Charge, find the turning point, hit first crack and drop — scored on development and rate of rise." },
    ...(ai ? [{ Icon: MessageCircle, title: "AI coach", text: "Ask Bean Coach about your shots and pours, or snap a photo for a score and tips." }] : []),
    { Icon: Trophy, title: "XP, streaks & badges", text: "Earn XP, keep your streak going, unlock badges and climb the leaderboard." },
    { Icon: Award, title: "Certificates", text: "Finish a level to get its certificate." },
    ...(rooms ? [{ Icon: Coffee, title: "Training rooms", text: "Find a training room near you, anywhere in Australia." }] : []),
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map(({ Icon, title, text }) => (
        <div key={title} className="rounded-2xl border border-line bg-surface p-5 shadow-card">
          <Icon className="h-6 w-6 text-[var(--b)]" />
          <p className="mt-2 text-[1rem] font-semibold text-ink">{title}</p>
          <p className="mt-1 text-[0.875rem] text-ink-muted">{text}</p>
        </div>
      ))}
    </div>
  );
}

export function Locked({ org, what }: { org: LearnOrg; what: string }) {
  return (
    <div className={`${card} text-center`}>
      <Lock className="mx-auto h-8 w-8 text-ink-faint" />
      <p className="mt-2 text-[1.125rem] font-semibold text-ink">{what} is part of the full course</p>
      <p className="mt-1 text-[0.9375rem] text-ink-muted">{org.learn.enabled ? "Join to unlock every lesson, the roast simulator, the AI coach and more." : "The online course isn't open yet — check back soon."}</p>
      {org.learn.enabled && <Link href={`/academy/${org.slug}/join`} className={`${btn} mt-4`}>See plans</Link>}
    </div>
  );
}

export function NotReady({ org }: { org: LearnOrg }) {
  return (
    <div className={`${card} mx-auto max-w-lg text-center`}>
      <Sparkles className="mx-auto h-8 w-8 text-[var(--b)]" />
      <p className="mt-2 text-[1.25rem] font-semibold text-ink">{org.learn.name} is coming soon</p>
      <p className="mt-1 text-[0.9375rem] text-ink-muted">We&apos;re putting the finishing touches on it. Check back soon.</p>
    </div>
  );
}

export function Bar({ pct, className }: { pct: number; className?: string }) {
  return <div className={`h-2 overflow-hidden rounded-full bg-zinc-200 ${className ?? ""}`}><div className="h-2 rounded-full bg-[var(--b)] transition-all" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></div>;
}

export const Streak = ({ n }: { n: number }) => <span className="inline-flex items-center gap-1 font-semibold text-orange-600"><Flame className="h-4 w-4" />{n} day{n === 1 ? "" : "s"}</span>;

export const planLabel = (p: Plan | "comp") => PLAN_LABEL[p];
