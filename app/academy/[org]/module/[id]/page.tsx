import Link from "next/link";
import { notFound } from "next/navigation";
import { Award, CheckCircle2, Circle, Lock } from "lucide-react";
import { academy } from "@/lib/learn/page";
import { canOpenLesson } from "@/lib/learn/server";
import { courseOrder, levelOpen, masteryQuestions } from "@/lib/learn/core";
import { AcademyShell, btn, card } from "@/components/academy/shell";
import { Locked, NotReady } from "@/components/academy/bits";

export const dynamic = "force-dynamic";
export const metadata = { title: "Module" };

export default async function ModulePage({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org: slug, id } = await params;
  const { org, me, state, c, ready } = await academy(slug);
  if (!ready || (!org.learn.enabled && !state?.live)) return <AcademyShell org={org} tab="course" signedIn={!!me}><NotReady org={org} /></AcademyShell>;
  const m = c.modules.find((x) => x.id === id);
  if (!m) notFound();
  const level = c.levels.find((l) => l.id === m.level_id)!;
  const base = `/academy/${org.slug}`;
  const lessons = courseOrder(c).lessonsOf(m.id);
  const allowed = canOpenLesson(c, state, m.id) && levelOpen(level, state?.learner.xp ?? 0);
  const qs = masteryQuestions(lessons);
  const done = state?.done ?? new Map();
  const mastered = state?.passedModules.has(m.id);
  return (
    <AcademyShell org={org} tab="course" signedIn={!!me} streak={state?.learner.streak_days}>
      <Link href={`${base}/course#level-${level.key}`} className="mb-3 inline-flex text-[0.8125rem] font-medium text-ink-muted hover:text-ink">← {level.title}</Link>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <div>
            <h1 className="text-[1.75rem] font-bold tracking-tight text-ink">{m.title}</h1>
            {m.description && <p className="mt-1 text-[0.9375rem] text-ink-muted">{m.description}</p>}
          </div>
          {!levelOpen(level, state?.learner.xp ?? 0) ? <div className={card}><p className="flex items-center gap-2 font-semibold text-ink"><Lock className="h-4 w-4" />This level opens at {level.min_xp} XP</p><p className="mt-1 text-[0.9063rem] text-ink-muted">Keep going with the earlier levels to unlock it.</p></div>
            : !allowed ? <Locked org={org} what="This module" /> : (
            <ol className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
              {lessons.map((l, i) => (
                <li key={l.id}>
                  <Link href={`${base}/lesson/${l.id}`} className="flex items-center gap-3 px-5 py-4 hover:bg-zinc-50">
                    {done.has(l.id) ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" /> : <Circle className="h-5 w-5 shrink-0 text-ink-faint" />}
                    <span className="min-w-0 flex-1"><span className="block text-[0.75rem] text-ink-faint">Lesson {i + 1}</span><span className="block text-[0.9688rem] font-semibold text-ink">{l.title}</span></span>
                    <span className="shrink-0 text-[0.8125rem] text-ink-muted">{l.duration_minutes} min · {l.xp_reward} XP</span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </div>
        {allowed && qs.length > 0 && (
          <aside className={card}>
            <p className="flex items-center gap-2 text-[1rem] font-semibold text-ink"><Award className="h-5 w-5 text-[var(--b)]" />Mastery quiz</p>
            <p className="mt-1 text-[0.875rem] text-ink-muted">{qs.length} questions from this module. Score 80% to master it{m.xp_reward ? ` and earn ${m.xp_reward} XP` : ""}.</p>
            {mastered ? <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-[0.875rem] font-medium text-emerald-800">Mastered ✓</p> : null}
            {state ? <Link href={`${base}/quiz/${m.id}`} className={`${btn} mt-4 w-full`}>{mastered ? "Take it again" : "Start the quiz"}</Link>
              : <Link href={`${base}#sign-in`} className={`${btn} mt-4 w-full`}>Sign in to take it</Link>}
          </aside>
        )}
      </div>
    </AcademyShell>
  );
}
