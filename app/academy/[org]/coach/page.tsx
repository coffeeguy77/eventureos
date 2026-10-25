import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/integrations/runtime";
import { academy } from "@/lib/learn/page";
import { orgAiKey } from "@/lib/ai/key";
import { todayISO } from "@/lib/format";
import { AcademyShell, card } from "@/components/academy/shell";
import { Locked, NotReady } from "@/components/academy/bits";
import { Coach, PhotoScore } from "@/components/academy/coach";

export const dynamic = "force-dynamic";
export const metadata = { title: "AI coach" };

export default async function CoachPage({ params }: { params: Promise<{ org: string }> }) {
  const { org, me, state, ready } = await academy((await params).org);
  if (!ready || (!org.learn.enabled && !state?.live)) return <AcademyShell org={org} tab="coach" signedIn={!!me}><NotReady org={org} /></AcademyShell>;
  if (!org.learn.ai.enabled) redirect(`/academy/${org.slug}`);
  if (!me || !state?.live) return <AcademyShell org={org} tab="coach" signedIn={!!me} streak={state?.learner.streak_days}><Locked org={org} what="The AI coach" /></AcademyShell>;
  const { data: used } = await createServiceClient().from("learn_ai_usage").select("messages, photos").eq("student_id", me.id).eq("day", todayISO(org.timezone)).maybeSingle();
  const left = { messages: Math.max(0, org.learn.ai.dailyMessages - Number(used?.messages ?? 0)), photos: Math.max(0, org.learn.ai.dailyPhotos - Number(used?.photos ?? 0)) };
  return (
    <AcademyShell org={org} tab="coach" signedIn streak={state.learner.streak_days}>
      <h1 className="text-[1.75rem] font-bold tracking-tight text-ink">AI coach</h1>
      <p className="mb-5 mt-1 text-[0.9375rem] text-ink-muted">Ask questions, troubleshoot your shots and get your latte art scored. The coach is an AI — check anything important with your trainer.</p>
      {!(await orgAiKey(org.id)) ? <div className={card}><p className="text-ink-muted">The AI coach isn&apos;t switched on yet — check back soon.</p></div> : (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Coach slug={org.slug} firstName={me.name.split(/\s+/)[0]} left={left} />
          <PhotoScore slug={org.slug} />
        </div>
      )}
    </AcademyShell>
  );
}
