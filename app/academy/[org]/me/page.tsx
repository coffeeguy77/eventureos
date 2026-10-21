import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { academy } from "@/lib/learn/page";
import { PLAN_LABEL } from "@/lib/learn/core";
import { money } from "@/lib/format";
import { learnSignOutAction } from "@/app/academy/actions";
import { AcademyShell, btn, btnGhost, card } from "@/components/academy/shell";
import { CancelMonthly, ProfileForm } from "@/components/academy/forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "My account", robots: { index: false, follow: false } };

export default async function Me({ params }: { params: Promise<{ org: string }> }) {
  const { org, me, state } = await academy((await params).org);
  if (!me || !state) redirect(`/academy/${org.slug}?signin=1#sign-in`);
  const d = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: org.timezone }) : "—");
  const live = state.live;
  const history = state.access.filter((a) => (a.status !== "pending" && a.status !== "cancelled") || !!a.cancelled_at);
  return (
    <AcademyShell org={org} tab="me" signedIn streak={state.learner.streak_days}>
      <div className="mx-auto grid max-w-4xl items-start gap-5 md:grid-cols-2">
        <section className={card}>
          <h1 className="text-[1.375rem] font-bold tracking-tight text-ink">Your plan</h1>
          {live ? (
            <div className="mt-2 space-y-2 text-[0.9375rem]">
              <p className="font-semibold text-ink">{PLAN_LABEL[live.plan]}</p>
              {live.plan === "monthly" && live.renews ? <p className="text-ink-muted">Renews {d(live.ends_at)} · {money(org.learn.prices.monthly, org.currency)} a month{live.card_label ? ` on ${live.card_label}` : ""}</p>
                : <p className="text-ink-muted">Access until {d(live.ends_at)}</p>}
              {live.status === "payment_failed" && <p className="rounded-xl bg-rose-50 px-3 py-2 text-[0.875rem] text-rose-800">Your last payment didn&apos;t go through ({live.last_error ?? "card declined"}). We&apos;ll try again — or contact {org.name}.</p>}
              {live.plan === "monthly" && live.renews && <div className="pt-2"><CancelMonthly slug={org.slug} until={d(live.ends_at)} /></div>}
              {live.plan !== "monthly" && org.learn.enabled && <Link href={`/academy/${org.slug}/join`} className={`${btnGhost} mt-2`}>Add more time</Link>}
            </div>
          ) : (
            <div className="mt-2">
              <p className="text-[0.9375rem] text-ink-muted">You don&apos;t have access to the full course right now.</p>
              {org.learn.enabled && <Link href={`/academy/${org.slug}/join`} className={`${btn} mt-3`}>See plans</Link>}
            </div>
          )}
          {history.length > 0 && (
            <ul className="mt-5 divide-y divide-line border-t border-line text-[0.8438rem]">
              {history.map((a) => <li key={a.id} className="flex justify-between gap-3 py-2"><span className="text-ink">{PLAN_LABEL[a.plan]}</span><span className="text-ink-muted">{a.status === "active" ? `to ${d(a.ends_at)}` : a.status.replace("_", " ")}{Number(a.price) > 0 ? ` · ${money(a.price, a.currency)}` : ""}</span></li>)}
            </ul>
          )}
        </section>
        <section className={card}>
          <h2 className="text-[1.125rem] font-semibold text-ink">Your details</h2>
          <p className="mb-4 mt-1 text-[0.875rem] text-ink-muted">Signed in as {me.email}</p>
          <ProfileForm slug={org.slug} initial={{ displayName: state.learner.display_name ?? "", coachStyle: state.learner.coach_style, onLeaderboard: state.learner.on_leaderboard }} />
          <form action={learnSignOutAction.bind(null, org.slug)} className="mt-5 border-t border-line pt-4"><button className={btnGhost}><LogOut className="h-4 w-4" />Sign out</button></form>
        </section>
      </div>
    </AcademyShell>
  );
}
