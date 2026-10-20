import { createServiceClient } from "@/lib/integrations/runtime";
import { academy } from "@/lib/learn/page";
import { AcademyShell, card } from "@/components/academy/shell";
import { NotReady } from "@/components/academy/bits";
import { RoastSimulator } from "@/components/academy/roast";

export const dynamic = "force-dynamic";
export const metadata = { title: "Roast simulator" };

export default async function Roast({ params }: { params: Promise<{ org: string }> }) {
  const { org, me, state, ready } = await academy((await params).org);
  if (!ready || (!org.learn.enabled && !state?.live)) return <AcademyShell org={org} tab="roast" signedIn={!!me}><NotReady org={org} /></AcademyShell>;
  const { data: roasts } = state?.live && me ? await createServiceClient().from("learn_roasts").select("id, name, score, drop_s, first_crack_s, created_at").eq("organisation_id", org.id).eq("student_id", me.id).order("created_at", { ascending: false }).limit(10) : { data: [] };
  return (
    <AcademyShell org={org} tab="roast" signedIn={!!me} streak={state?.learner.streak_days}>
      <h1 className="text-[1.75rem] font-bold tracking-tight text-ink">Roast simulator</h1>
      <p className="mb-5 mt-1 max-w-3xl text-[0.9375rem] text-ink-muted">Roast a virtual batch on a drum roaster: control gas, airflow and drum speed, watch the bean temperature and rate of rise, and drop when you&apos;re ready. Follow the guided steps the first time.{state?.live ? "" : " Try it free — join to save your roasts and earn XP."}</p>
      <RoastSimulator slug={org.slug} canSave={!!state?.live} />
      {(roasts ?? []).length > 0 && (
        <section className={`${card} mt-5`}>
          <h2 className="text-[1rem] font-semibold text-ink">Your saved roasts</h2>
          <ul className="mt-2 divide-y divide-line text-[0.9063rem]">
            {(roasts as { id: string; name: string | null; score: number; drop_s: number | null; created_at: string }[]).map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1 truncate text-ink">{r.name ?? "Roast"}</span>
                <span className="text-ink-muted">{new Date(r.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: org.timezone })}</span>
                <span className="w-14 text-right font-semibold tabular-nums text-ink">{Number(r.score).toFixed(1)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </AcademyShell>
  );
}
