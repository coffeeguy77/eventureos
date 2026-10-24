import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { academy } from "@/lib/learn/page";
import { canOpenLesson } from "@/lib/learn/server";
import { courseOrder, levelOpen, masteryQuestions } from "@/lib/learn/core";
import { AcademyShell } from "@/components/academy/shell";
import { Locked, NotReady } from "@/components/academy/bits";
import { MasteryQuiz } from "@/components/academy/quiz";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mastery quiz" };

export default async function QuizPage({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org: slug, id } = await params;
  const { org, me, state, c, ready } = await academy(slug);
  if (!ready || (!org.learn.enabled && !state?.live)) return <AcademyShell org={org} tab="course" signedIn={!!me}><NotReady org={org} /></AcademyShell>;
  const m = c.modules.find((x) => x.id === id);
  if (!m) notFound();
  if (!me) redirect(`/academy/${org.slug}?signin=1#sign-in`);
  const level = c.levels.find((l) => l.id === m.level_id)!;
  const base = `/academy/${org.slug}`;
  if (!canOpenLesson(c, state, m.id) || !(!!state?.god || levelOpen(level, state?.learner.xp ?? 0))) return <AcademyShell org={org} tab="course" signedIn streak={state?.learner.streak_days}><Locked org={org} what="This quiz" /></AcademyShell>;
  const qs = masteryQuestions(courseOrder(c).lessonsOf(m.id).map((l) => c.lessons.find((x) => x.id === l.id)!));
  return (
    <AcademyShell org={org} tab="course" signedIn streak={state?.learner.streak_days}>
      <div className="mx-auto max-w-3xl">
        <Link href={`${base}/module/${m.id}`} className="text-[0.8125rem] font-medium text-ink-muted hover:text-ink">← {m.title}</Link>
        <h1 className="mb-1 mt-2 text-[1.75rem] font-bold tracking-tight text-ink">Mastery quiz: {m.title}</h1>
        <p className="mb-5 text-[0.9375rem] text-ink-muted">{qs.length} questions · 80% to pass</p>
        <MasteryQuiz slug={org.slug} moduleId={m.id} questions={qs.map((q) => ({ question: q.question, options: q.options, correct_index: q.correct_index, explanation: q.explanation ?? null, lessonTitle: q.lessonTitle }))} back={`${base}/module/${m.id}`} />
      </div>
    </AcademyShell>
  );
}
