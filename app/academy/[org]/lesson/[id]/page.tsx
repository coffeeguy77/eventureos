import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock, Lightbulb, Zap } from "lucide-react";
import { createServiceClient } from "@/lib/integrations/runtime";
import { academy } from "@/lib/learn/page";
import { canOpenLesson, loadLesson } from "@/lib/learn/server";
import { courseOrder, levelOpen } from "@/lib/learn/core";
import { AcademyShell, btn, card } from "@/components/academy/shell";
import { Locked, NotReady } from "@/components/academy/bits";
import { LessonBody } from "@/components/academy/lesson-body";
import { LessonFinish } from "@/components/academy/quiz";
import { LearnLogin } from "@/components/academy/forms";

export const dynamic = "force-dynamic";

export default async function LessonPage({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org: slug, id } = await params;
  const { org, me, state, c, ready } = await academy(slug);
  if (!ready || (!org.learn.enabled && !state?.live)) return <AcademyShell org={org} tab="course" signedIn={!!me}><NotReady org={org} /></AcademyShell>;
  const meta = c.lessons.find((l) => l.id === id);
  if (!meta) notFound();
  const m = c.modules.find((x) => x.id === meta.module_id)!;
  const level = c.levels.find((l) => l.id === m.level_id)!;
  const base = `/academy/${org.slug}`;
  const open = canOpenLesson(c, state, m.id) && levelOpen(level, state?.learner.xp ?? 0);
  if (!open) return <AcademyShell org={org} tab="course" signedIn={!!me} streak={state?.learner.streak_days}><Link href={`${base}/module/${m.id}`} className="mb-3 inline-flex text-[0.8125rem] font-medium text-ink-muted hover:text-ink">← {m.title}</Link><Locked org={org} what={`“${meta.title}”`} /></AcademyShell>;
  const lesson = await loadLesson(createServiceClient(), org.id, id);
  if (!lesson) notFound();
  const { flat } = courseOrder(c);
  const i = flat.findIndex((f) => f.lessonId === id);
  const nextId = i >= 0 && flat[i + 1] && flat[i + 1].levelId === level.id ? flat[i + 1].lessonId : null;
  const inModule = courseOrder(c).lessonsOf(m.id);
  const pos = inModule.findIndex((x) => x.id === id);
  return (
    <AcademyShell org={org} tab="course" signedIn={!!me} streak={state?.learner.streak_days}>
      <div className="mx-auto max-w-3xl space-y-5">
        <div>
          <Link href={`${base}/module/${m.id}`} className="text-[0.8125rem] font-medium text-ink-muted hover:text-ink">← {m.title} · lesson {pos + 1} of {inModule.length}</Link>
          <h1 className="mt-2 text-[1.75rem] font-bold leading-tight tracking-tight text-ink sm:text-[2.125rem]">{lesson.title}</h1>
          <p className="mt-2 flex gap-4 text-[0.875rem] text-ink-muted"><span className="inline-flex items-center gap-1"><Clock className="h-4 w-4" />{lesson.duration_minutes} min</span><span className="inline-flex items-center gap-1 font-semibold text-[var(--b)]"><Zap className="h-4 w-4" />{lesson.xp_reward} XP</span></p>
        </div>
        <article className={card}><LessonBody content={lesson.content} title={lesson.title} /></article>
        {lesson.key_points.length > 0 && (
          <section className="rounded-2xl border border-[color-mix(in_srgb,var(--b)_35%,transparent)] bg-[color-mix(in_srgb,var(--b)_5%,transparent)] p-5">
            <p className="flex items-center gap-2 text-[0.9375rem] font-semibold text-ink"><Lightbulb className="h-5 w-5 text-[var(--b)]" />Key points</p>
            <ul className="mt-2 list-disc space-y-1 pl-6 text-[0.9375rem] text-ink-muted marker:text-[var(--b)]">{lesson.key_points.map((k) => <li key={k}>{k}</li>)}</ul>
          </section>
        )}
        {me && state ? (
          <LessonFinish slug={org.slug} lessonId={lesson.id} quiz={lesson.quiz} done={state.done.has(lesson.id)} xp={lesson.xp_reward} next={nextId ? `${base}/lesson/${nextId}` : `${base}/module/${m.id}`} />
        ) : (
          <section className={card}>
            <p className="text-[1rem] font-semibold text-ink">Sign in to save your progress and earn XP</p>
            <div className="mt-3 max-w-md"><LearnLogin slug={org.slug} /></div>
            {org.learn.enabled && <Link href={`${base}/join`} className={`${btn} mt-4`}>See plans</Link>}
          </section>
        )}
      </div>
    </AcademyShell>
  );
}
