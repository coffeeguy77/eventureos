import Link from "next/link";
import { Award, CheckCircle2, Lock } from "lucide-react";
import { academy } from "@/lib/learn/page";
import { freeModuleId } from "@/lib/learn/server";
import { countDone, courseOrder, levelOpen } from "@/lib/learn/core";
import { AcademyShell, card } from "@/components/academy/shell";
import { Bar, NotReady } from "@/components/academy/bits";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lessons" };

export default async function Course({ params }: { params: Promise<{ org: string }> }) {
  const { org, me, state, c, ready } = await academy((await params).org);
  if (!ready || (!org.learn.enabled && !state?.live)) return <AcademyShell org={org} tab="course" signedIn={!!me}><NotReady org={org} /></AcademyShell>;
  const base = `/academy/${org.slug}`;
  const xp = state?.learner.xp ?? 0;
  const done = state?.done ?? new Map<string, string>();
  const free = freeModuleId(c);
  const { levels, modulesOf, lessonsOf } = courseOrder(c);
  return (
    <AcademyShell org={org} tab="course" signedIn={!!me} streak={state?.learner.streak_days}>
      <h1 className="text-[1.75rem] font-bold tracking-tight text-ink">Lessons</h1>
      <p className="mb-6 mt-1 text-[0.9375rem] text-ink-muted">{c.lessons.length} lessons in {c.modules.length} modules. Levels open as you earn XP{state?.live ? "" : " — the first module is free to try"}.</p>
      <div className="space-y-8">
        {levels.map((l) => {
          const open = (!!state?.god || levelOpen(l, xp));
          const mods = modulesOf(l.id);
          const lp = countDone(mods.flatMap((m) => lessonsOf(m.id).map((x) => x.id)), done);
          return (
            <section key={l.id} id={`level-${l.key}`} className="scroll-mt-24">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <p className="text-[0.75rem] font-bold uppercase tracking-[0.12em] text-[var(--b)]">Level {l.number}{l.xp_reward ? ` · +${l.xp_reward} XP when finished` : ""}</p>
                  <h2 className="text-[1.25rem] font-bold tracking-tight text-ink">{l.title}</h2>
                  {l.description && <p className="text-[0.9063rem] text-ink-muted">{l.description}</p>}
                </div>
                {open ? <span className="text-[0.875rem] text-ink-muted">{lp.done}/{lp.total} done{lp.pct === 100 && l.certificate_title ? <> · <Link className="font-semibold text-[var(--b)]" href={`${base}/certificate/${l.key}`}>Certificate</Link></> : null}</span>
                  : <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1 text-[0.8125rem] font-medium text-ink-muted"><Lock className="h-3.5 w-3.5" />Opens at {l.min_xp} XP</span>}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {mods.map((m) => {
                  const ls = lessonsOf(m.id);
                  const p = countDone(ls.map((x) => x.id), done);
                  const mastered = state?.passedModules.has(m.id);
                  const avail = open && (!!state?.live || m.id === free);
                  return (
                    <Link key={m.id} href={`${base}/module/${m.id}`} className={`${card} block transition hover:-translate-y-0.5 ${open ? "" : "pointer-events-none opacity-60"}`}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[1rem] font-semibold text-ink">{m.title}</p>
                        {mastered ? <Award className="h-5 w-5 shrink-0 text-[var(--b)]" /> : p.pct === 100 ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" /> : !avail ? <Lock className="h-4 w-4 shrink-0 text-ink-faint" /> : m.id === free && !state?.live ? <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[0.6875rem] font-bold uppercase text-emerald-800">Free</span> : null}
                      </div>
                      {m.description && <p className="mt-1 text-[0.8438rem] text-ink-muted">{m.description}</p>}
                      <Bar pct={p.pct} className="mt-3" />
                      <p className="mt-1 text-[0.8125rem] text-ink-muted">{p.done}/{p.total} lessons{mastered ? " · mastered" : ""}</p>
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </AcademyShell>
  );
}
