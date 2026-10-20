"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Award, CheckCircle2, Loader2, RotateCcw, XCircle, Zap } from "lucide-react";
import { completeLessonAction, masteryAction } from "@/app/academy/actions";
import { btn, btnGhost } from "./ui";
import { cn } from "@/lib/cn";

type Q = { question: string; options: string[]; correct_index: number; explanation?: string | null };

function Option({ text, i, picked, reveal, correct, onPick }: { text: string; i: number; picked: boolean; reveal: boolean; correct: boolean; onPick: () => void }) {
  return (
    <button type="button" disabled={reveal} onClick={onPick} aria-pressed={picked}
      className={cn("flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-[0.9375rem] transition",
        reveal && correct ? "border-emerald-500 bg-emerald-50 text-emerald-900" : reveal && picked ? "border-rose-400 bg-rose-50 text-rose-900" : picked ? "border-[var(--b)] bg-[color-mix(in_srgb,var(--b)_8%,transparent)] text-ink" : "border-line text-ink hover:bg-zinc-50")}>
      <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[0.75rem] font-bold", picked ? "border-[var(--b)] bg-[var(--b)] text-[var(--on-b)]" : "border-line-strong text-ink-muted")}>{String.fromCharCode(65 + i)}</span>
      <span className="flex-1">{text}</span>
      {reveal && correct && <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
    </button>
  );
}

/** The knowledge check at the end of a lesson (answer correctly to complete it), or a "Mark complete" button. */
export function LessonFinish({ slug, lessonId, quiz, done, xp, next }: { slug: string; lessonId: string; quiz: Q | null; done: boolean; xp: number; next: string | null }) {
  const [pick, setPick] = useState<number | null>(null);
  const [res, setRes] = useState<{ correct: boolean; xp: number; badges: string[]; levelDone: string | null } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const finished = done || !!res?.correct;
  const submit = () => start(async () => {
    setErr(null);
    const r = await completeLessonAction(slug, lessonId, quiz ? pick : null);
    if (!r.ok) { setErr(r.error); return; }
    setRes(r);
    if (r.correct) router.refresh();
  });
  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6">
      {quiz && !done && (
        <>
          <p className="flex items-center gap-2 text-[0.75rem] font-bold uppercase tracking-[0.12em] text-[var(--b)]"><Zap className="h-4 w-4" />Knowledge check · answer to finish</p>
          <p className="mt-2 text-[1.0625rem] font-semibold text-ink">{quiz.question}</p>
          <div className="mt-3 space-y-2">
            {quiz.options.map((o, i) => <Option key={i} text={o} i={i} picked={pick === i} reveal={!!res} correct={i === quiz.correct_index && !!res?.correct} onPick={() => setPick(i)} />)}
          </div>
          {res && !res.correct && (
            <div className="mt-3 rounded-xl bg-rose-50 px-4 py-3 text-[0.9063rem] text-rose-900">
              <p className="flex items-center gap-2 font-semibold"><XCircle className="h-4 w-4" />Not quite.</p>
              {quiz.explanation && <p className="mt-1">{quiz.explanation}</p>}
              <button type="button" onClick={() => { setRes(null); setPick(null); }} className="mt-2 inline-flex items-center gap-1.5 font-semibold text-rose-900 underline"><RotateCcw className="h-4 w-4" />Try again</button>
            </div>
          )}
        </>
      )}
      {finished ? (
        <div className={quiz && !done ? "mt-4" : ""}>
          <p className="flex items-center gap-2 text-[1.0625rem] font-semibold text-emerald-700"><CheckCircle2 className="h-5 w-5" />{res?.correct ? `Correct! Lesson complete${res.xp ? ` · +${res.xp} XP` : ""}` : "Lesson complete"}</p>
          {quiz && res?.correct && quiz.explanation && <p className="mt-1 text-[0.9063rem] text-ink-muted">{quiz.explanation}</p>}
          {res?.badges.length ? <p className="mt-2 flex items-center gap-2 text-[0.9063rem] font-medium text-[var(--b)]"><Award className="h-4 w-4" />New badge: {res.badges.join(", ")}</p> : null}
          {res?.levelDone && <p className="mt-2 flex items-center gap-2 text-[0.9063rem] font-medium text-[var(--b)]"><Award className="h-4 w-4" />You finished {res.levelDone}! Your certificate is on the leaderboard page.</p>}
          {next && <Link href={next} className={`${btn} mt-4`}>Next lesson →</Link>}
        </div>
      ) : !res ? (
        <div className={quiz ? "mt-4" : ""}>
          <button type="button" disabled={pending || (!!quiz && pick === null)} onClick={submit} className={btn}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}{quiz ? "Check my answer" : `Mark complete${xp ? ` · +${xp} XP` : ""}`}
          </button>
        </div>
      ) : null}
      {err && <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-4 py-3 text-[0.875rem] font-medium text-rose-800">{err}</p>}
    </section>
  );
}

/** A module's mastery quiz: every lesson's question, 80% to pass. */
export function MasteryQuiz({ slug, moduleId, questions, back }: { slug: string; moduleId: string; questions: (Q & { lessonTitle: string })[]; back: string }) {
  const [answers, setAnswers] = useState<(number | null)[]>(questions.map(() => null));
  const [res, setRes] = useState<{ score: number; outOf: number; passed: boolean; xp: number; badges: string[]; levelDone: string | null } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const all = answers.every((a) => a !== null);
  return (
    <div className="space-y-4">
      {res && (
        <div className={cn("rounded-2xl p-5 sm:p-6", res.passed ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900")}>
          <p className="text-[1.375rem] font-bold">{res.score} / {res.outOf} — {res.passed ? "Mastered!" : "Not yet"}</p>
          <p className="mt-1 text-[0.9375rem]">{res.passed ? `${res.xp ? `+${res.xp} XP. ` : ""}Great work.` : "You need 80% to pass. Have another look at the lessons and try again."}</p>
          {res.badges.length > 0 && <p className="mt-1 text-[0.9375rem] font-medium">New badge: {res.badges.join(", ")}</p>}
          {res.levelDone && <p className="mt-1 text-[0.9375rem] font-medium">You finished {res.levelDone}!</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={back} className={btn}>Back to the module</Link>
            {!res.passed && <button type="button" className={btnGhost} onClick={() => { setRes(null); setAnswers(questions.map(() => null)); window.scrollTo({ top: 0 }); }}><RotateCcw className="h-4 w-4" />Try again</button>}
          </div>
        </div>
      )}
      {questions.map((q, n) => (
        <section key={n} className="rounded-2xl border border-line bg-surface p-5 shadow-card">
          <p className="text-[0.75rem] font-semibold uppercase tracking-wider text-ink-faint">Question {n + 1} of {questions.length} · {q.lessonTitle}</p>
          <p className="mt-1 text-[1rem] font-semibold text-ink">{q.question}</p>
          <div className="mt-3 space-y-2">
            {q.options.map((o, i) => <Option key={i} text={o} i={i} picked={answers[n] === i} reveal={!!res} correct={i === q.correct_index} onPick={() => setAnswers(answers.map((a, j) => (j === n ? i : a)))} />)}
          </div>
          {res && answers[n] !== q.correct_index && q.explanation && <p className="mt-2 text-[0.875rem] text-ink-muted">{q.explanation}</p>}
        </section>
      ))}
      {!res && (
        <div className="sticky bottom-3 rounded-2xl border border-line bg-surface/95 p-3 shadow-card backdrop-blur">
          <button type="button" disabled={pending || !all} className={`${btn} w-full`} onClick={() => start(async () => {
            setErr(null);
            const r = await masteryAction(slug, moduleId, answers);
            if (!r.ok) { setErr(r.error); return; }
            setRes(r); window.scrollTo({ top: 0, behavior: "smooth" }); router.refresh();
          })}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}{all ? "Submit answers" : `Answer all ${questions.length} questions`}</button>
          {err && <p role="alert" className="mt-2 text-[0.875rem] font-medium text-rose-700">{err}</p>}
        </div>
      )}
    </div>
  );
}
