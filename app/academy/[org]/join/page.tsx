import Link from "next/link";
import { createServiceClient } from "@/lib/integrations/runtime";
import { academy } from "@/lib/learn/page";
import { courseEligible } from "@/lib/learn/server";
import { PLANS, type Plan } from "@/lib/learn/core";
import { money } from "@/lib/format";
import { AcademyShell, card } from "@/components/academy/shell";
import { NotReady, planOptions } from "@/components/academy/bits";
import { JoinForm } from "@/components/academy/forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Join", robots: { index: false, follow: false } };

export default async function Join({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ plan?: string; cancelled?: string }> }) {
  const { org: slug } = await params;
  const sp = await searchParams;
  const { org, me, state, ready } = await academy(slug);
  if (!ready || !org.learn.enabled) return <AcademyShell org={org} tab="join" signedIn={!!me}><NotReady org={org} /></AcademyShell>;
  const eligible = me ? !!(await courseEligible(createServiceClient(), org, me.id, me.email).catch(() => null)) : false;
  const plans = planOptions(org, { courseEligible: eligible }).filter((p) => p.available);
  const initial = PLANS.includes(sp.plan as Plan) ? (sp.plan as Plan) : null;
  const live = state?.live;
  return (
    <AcademyShell org={org} tab="join" signedIn={!!me} streak={state?.learner.streak_days}>
      <div className="mx-auto max-w-3xl space-y-5">
        <div>
          <h1 className="text-[1.75rem] font-bold tracking-tight text-ink">Join {org.learn.name}</h1>
          <p className="mt-1 text-[0.9375rem] text-ink-muted">{org.learn.tagline}</p>
        </div>
        {sp.cancelled && <p className="rounded-xl bg-amber-50 px-4 py-3 text-[0.9063rem] text-amber-900">Payment cancelled — nothing was charged.</p>}
        {live && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-[0.9063rem] text-emerald-900">You already have access{live.ends_at ? ` until ${new Date(live.ends_at).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: org.timezone })}` : ""}. Buying again adds time after that date.</p>}
        {!me && org.learn.plans.with_course && <p className="rounded-xl bg-zinc-50 px-4 py-3 text-[0.875rem] text-ink-muted">Booked on one of our barista courses? <Link href={`/academy/${org.slug}?signin=1#sign-in`} className="font-semibold text-[var(--b)]">Sign in first</Link> to get the course price ({money(org.learn.prices.with_course, org.currency)}).</p>}
        <section className={card}>
          {plans.length ? <JoinForm slug={org.slug} plans={plans} initial={initial} signedIn={!!me} /> : <p className="text-ink-muted">No plans are available right now.</p>}
        </section>
      </div>
    </AcademyShell>
  );
}
