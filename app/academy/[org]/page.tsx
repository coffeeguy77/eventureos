import Link from "next/link";
import { siteMeta } from "@/lib/site/meta";
import type { Metadata } from "next";
import { Award, BookOpen, CheckCircle2, Lock, PlayCircle } from "lucide-react";
import { createServiceClient } from "@/lib/integrations/runtime";
import { academy } from "@/lib/learn/page";
import { courseEligible, freeModuleId, learnOrg } from "@/lib/learn/server";
import { challengeFor, countDone, courseOrder, levelOpen, nextLesson, rankFor } from "@/lib/learn/core";
import { todayISO } from "@/lib/format";
import { AcademyShell, btn, btnGhost, card } from "@/components/academy/shell";
import { Bar, Features, NotReady, PlanCards, Streak } from "@/components/academy/bits";
import { ChallengeCard, LearnLogin } from "@/components/academy/forms";
import { AcademySales } from "@/components/academy/sales";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ org: string }> }): Promise<Metadata> {
  const org = await learnOrg((await params).org).catch(() => null);
  return org ? siteMeta(org, `/academy/${org.slug}`, { title: { absolute: `${org.learn.name} — ${org.name}` }, description: org.learn.tagline }) : { title: "Online course" };
}

export default async function AcademyHome({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ welcome?: string; signin?: string }> }) {
  const { org: slug } = await params;
  const sp = await searchParams;
  const { org, me, state, c, ready } = await academy(slug);
  const base = `/academy/${org.slug}`;
  if (!ready || (!org.learn.enabled && !state?.live)) {
    return <AcademyShell org={org} tab="home" signedIn={!!me}><NotReady org={org} />
      {!me && ready && <div className={`${card} mx-auto mt-5 max-w-md`} id="sign-in"><h2 className="mb-3 text-[1.0625rem] font-semibold text-ink">Already have access? Sign in</h2><LearnLogin slug={org.slug} signup={false} /></div>}
    </AcademyShell>;
  }
  const db = createServiceClient();
  const counts = { lessons: c.lessons.length, modules: c.modules.length, levels: c.levels.length, quizzes: c.lessons.filter((l) => l.quiz).length };
  const free = freeModuleId(c);
  const firstFree = free ? courseOrder(c).lessonsOf(free)[0] : null;

  // Not signed in: the sales page
  if (!me || !state) {
    const levels = courseOrder(c).levels.map((l) => ({ id: l.id, key: l.key, number: l.number, title: l.title, description: l.description ?? null }));
    return (
      <AcademyShell org={org} tab="home" signedIn={false} bare>
        <AcademySales org={org} counts={counts} levels={levels} freeLesson={firstFree?.id ?? null} signIn={!!sp.signin} />
      </AcademyShell>
    );
  }

  // Signed in
  const xp = state.learner.xp;
  const rank = rankFor(c.levels, xp);
  const nx = nextLesson(c, state.done, xp, { access: !!state.live, freeModuleId: free });
  const nxLesson = nx ? c.lessons.find((l) => l.id === nx.lessonId) : null;
  const nxModule = nx ? c.modules.find((m) => m.id === nx.moduleId) : null;
  const { levels, modulesOf, lessonsOf } = courseOrder(c);
  const { data: chs } = await db.from("learn_challenges").select("id, title, description, xp_reward").eq("organisation_id", org.id).eq("active", true).order("position");
  const challenge = challengeFor((chs ?? []) as { id: string; title: string; description: string | null; xp_reward: number }[], todayISO(org.timezone));
  const { data: badgeDefs } = await db.from("learn_badges").select("key, name, description").eq("organisation_id", org.id).eq("active", true).order("position");
  const eligible = !state.live && org.learn.enabled ? await courseEligible(db, org, me.id, me.email).catch(() => null) : null;
  const first = me.name.split(/\s+/)[0];

  return (
    <AcademyShell org={org} tab="home" signedIn streak={state.learner.streak_days}>
      {sp.welcome && <p className="mb-5 rounded-2xl bg-emerald-50 px-5 py-4 text-[0.9375rem] font-medium text-emerald-900">Welcome to {org.learn.name}! Everything is unlocked — start with the first lesson below.</p>}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <section className={card}>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-[1.625rem] font-bold tracking-tight text-ink sm:text-[2rem]">Hi {first}</h1>
                <p className="text-[0.9375rem] text-ink-muted">{rank.current ? <>Rank: <span className="font-semibold text-ink">{rank.current.title}</span></> : "Let's get started"} · {xp} XP</p>
              </div>
              <div className="flex gap-4 text-[0.9375rem] text-ink-muted"><Streak n={state.learner.streak_days} /><span>{state.done.size}/{c.lessons.length} lessons</span></div>
            </div>
            {rank.next && <div className="mt-4"><Bar pct={rank.pct} /><p className="mt-1.5 text-[0.8125rem] text-ink-muted">{rank.toNext} XP to {rank.next.title}</p></div>}
            {nxLesson && nxModule ? (
              <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl bg-zinc-50 p-4">
                <PlayCircle className="h-8 w-8 shrink-0 text-[var(--b)]" />
                <div className="min-w-0 flex-1"><p className="text-[0.75rem] font-semibold uppercase tracking-wider text-ink-faint">Up next · {nxModule.title}</p><p className="text-[1.0625rem] font-semibold text-ink">{nxLesson.title}</p><p className="text-[0.8125rem] text-ink-muted">{nxLesson.duration_minutes} min · +{nxLesson.xp_reward} XP</p></div>
                <Link href={`${base}/lesson/${nxLesson.id}`} className={btn}>{state.done.size ? "Continue" : "Start"}</Link>
              </div>
            ) : <p className="mt-5 flex items-center gap-2 rounded-xl bg-emerald-50 p-4 text-[0.9375rem] font-medium text-emerald-800"><CheckCircle2 className="h-5 w-5" />{state.live ? "You've done every lesson that's open to you. Earn more XP to unlock the next level." : "That's the free lessons done."}</p>}
          </section>

          {!state.live && org.learn.enabled && (
            <section className={card}>
              <h2 className="text-[1.125rem] font-semibold text-ink">Unlock the full course</h2>
              <p className="mb-4 mt-1 text-[0.9063rem] text-ink-muted">{eligible ? "You're booked on one of our barista courses, so you get the course price." : "Every lesson, the roast simulator, the AI coach, badges and certificates."}</p>
              <PlanCards org={org} courseEligible={!!eligible} signedIn />
            </section>
          )}

          <section>
            <h2 className="mb-3 text-[1.125rem] font-semibold text-ink">Levels</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {levels.map((l) => {
                const ids = modulesOf(l.id).flatMap((m) => lessonsOf(m.id).map((x) => x.id));
                const p = countDone(ids, state.done);
                const open = levelOpen(l, xp);
                return (
                  <Link key={l.id} href={`${base}/course#level-${l.key}`} className={`${card} block transition hover:-translate-y-0.5 ${open ? "" : "opacity-70"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[0.75rem] font-semibold uppercase tracking-wider text-ink-faint">Level {l.number}</p>
                      {!open ? <span className="inline-flex items-center gap-1 text-[0.75rem] text-ink-muted"><Lock className="h-3.5 w-3.5" />{l.min_xp} XP</span> : p.pct === 100 ? <Award className="h-5 w-5 text-[var(--b)]" /> : null}
                    </div>
                    <p className="mt-0.5 text-[1rem] font-semibold text-ink">{l.title}</p>
                    <Bar pct={p.pct} className="mt-3" />
                    <p className="mt-1 text-[0.8125rem] text-ink-muted">{p.done}/{p.total} lessons</p>
                  </Link>
                );
              })}
            </div>
          </section>
        </div>

        <aside className="space-y-5 lg:sticky lg:top-20">
          {challenge && state.live && <section className={card}><ChallengeCard slug={org.slug} challenge={challenge} done={state.challengeToday} /></section>}
          <section className={card}>
            <div className="flex items-center justify-between"><h2 className="text-[1rem] font-semibold text-ink">Badges</h2><Link href={`${base}/board`} className="text-[0.8125rem] font-semibold text-[var(--b)]">All →</Link></div>
            <ul className="mt-3 grid grid-cols-3 gap-2">
              {((badgeDefs ?? []) as { key: string; name: string; description: string | null }[]).map((b) => {
                const got = state.badges.has(b.key);
                return <li key={b.key} title={b.description ?? undefined} className={`rounded-xl px-2 py-3 text-center ${got ? "bg-[color-mix(in_srgb,var(--b)_10%,transparent)]" : "bg-zinc-50 opacity-50"}`}><Award className={`mx-auto h-6 w-6 ${got ? "text-[var(--b)]" : "text-ink-faint"}`} /><p className="mt-1 text-[0.6875rem] font-semibold leading-tight text-ink">{b.name}</p></li>;
              })}
            </ul>
          </section>
        </aside>
      </div>
    </AcademyShell>
  );
}
