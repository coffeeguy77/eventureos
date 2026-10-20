import Link from "next/link";
import { Award, Crown, GraduationCap } from "lucide-react";
import { createServiceClient } from "@/lib/integrations/runtime";
import { academy } from "@/lib/learn/page";
import { leaderboard } from "@/lib/learn/server";
import { readRule, ruleText } from "@/lib/learn/core";
import { AcademyShell, card } from "@/components/academy/shell";
import { NotReady, Streak } from "@/components/academy/bits";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";
export const metadata = { title: "Leaderboard & badges" };

export default async function Board({ params }: { params: Promise<{ org: string }> }) {
  const { org, me, state, c, ready } = await academy((await params).org);
  if (!ready || (!org.learn.enabled && !state?.live)) return <AcademyShell org={org} tab="board" signedIn={!!me}><NotReady org={org} /></AcademyShell>;
  const db = createServiceClient();
  const [board, badges] = await Promise.all([
    org.learn.leaderboard ? leaderboard(db, org.id, 25) : Promise.resolve([]),
    db.from("learn_badges").select("key, name, description, rule").eq("organisation_id", org.id).eq("active", true).order("position"),
  ]);
  const base = `/academy/${org.slug}`;
  const certs = c.levels.filter((l) => l.certificate_title && state?.badges.has(`level-${l.key}`));
  return (
    <AcademyShell org={org} tab="board" signedIn={!!me} streak={state?.learner.streak_days}>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className={card}>
          <h1 className="flex items-center gap-2 text-[1.5rem] font-bold tracking-tight text-ink"><Crown className="h-6 w-6 text-amber-500" />Leaderboard</h1>
          {!org.learn.leaderboard ? <p className="mt-2 text-ink-muted">The leaderboard is switched off.</p> : board.length === 0 ? <p className="mt-2 text-ink-muted">No one on the board yet — finish a lesson to be first.</p> : (
            <ol className="mt-4 divide-y divide-line">
              {board.map((r) => (
                <li key={r.studentId} className={cn("flex items-center gap-3 py-2.5", r.studentId === me?.id && "rounded-xl bg-[color-mix(in_srgb,var(--b)_8%,transparent)] px-2")}>
                  <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full text-[0.875rem] font-bold", r.rank === 1 ? "bg-amber-100 text-amber-800" : r.rank === 2 ? "bg-zinc-200 text-zinc-700" : r.rank === 3 ? "bg-orange-100 text-orange-800" : "bg-zinc-50 text-ink-muted")}>{r.rank}</span>
                  <span className="min-w-0 flex-1 truncate font-medium text-ink">{r.name}{r.studentId === me?.id ? " (you)" : ""}</span>
                  {r.streak > 1 && <span className="text-[0.8125rem]"><Streak n={r.streak} /></span>}
                  <span className="w-20 text-right font-semibold tabular-nums text-ink">{r.xp} XP</span>
                </li>
              ))}
            </ol>
          )}
          {me && org.learn.leaderboard && <p className="mt-3 text-[0.8125rem] text-ink-muted">Change your leaderboard name or hide yourself on <Link className="font-semibold text-[var(--b)]" href={`${base}/me`}>your account</Link>.</p>}
        </section>
        <div className="space-y-5">
          <section className={card}>
            <h2 className="flex items-center gap-2 text-[1.125rem] font-semibold text-ink"><Award className="h-5 w-5 text-[var(--b)]" />Badges</h2>
            <ul className="mt-3 space-y-2">
              {((badges.data ?? []) as { key: string; name: string; description: string | null; rule: unknown }[]).map((b) => {
                const got = state?.badges.has(b.key);
                return (
                  <li key={b.key} className={cn("flex items-center gap-3 rounded-xl px-3 py-2", got ? "bg-[color-mix(in_srgb,var(--b)_8%,transparent)]" : "bg-zinc-50")}>
                    <Award className={cn("h-6 w-6 shrink-0", got ? "text-[var(--b)]" : "text-ink-faint")} />
                    <span className="min-w-0 flex-1"><span className="block text-[0.9063rem] font-semibold text-ink">{b.name}</span><span className="block text-[0.8125rem] text-ink-muted">{b.description ?? ruleText(readRule(b.rule))}</span></span>
                    {got && <span className="text-[0.75rem] font-semibold text-[var(--b)]">Earned</span>}
                  </li>
                );
              })}
            </ul>
          </section>
          <section className={card}>
            <h2 className="flex items-center gap-2 text-[1.125rem] font-semibold text-ink"><GraduationCap className="h-5 w-5 text-[var(--b)]" />Certificates</h2>
            {certs.length ? (
              <ul className="mt-2 space-y-2">{certs.map((l) => <li key={l.id}><Link href={`${base}/certificate/${l.key}`} className="font-semibold text-[var(--b)] hover:underline">{l.certificate_title}</Link></li>)}</ul>
            ) : <p className="mt-2 text-[0.9063rem] text-ink-muted">Finish every lesson in a level to get its certificate.</p>}
          </section>
        </div>
      </div>
    </AcademyShell>
  );
}
