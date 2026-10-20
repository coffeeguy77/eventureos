import Link from "next/link";
import { notFound } from "next/navigation";
import { academy } from "@/lib/learn/page";
import { AcademyShell, card } from "@/components/academy/shell";
import { ListRoomForm } from "@/components/academy/forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "List your training room" };

export default async function ListRoom({ params }: { params: Promise<{ org: string }> }) {
  const { org, me, state } = await academy((await params).org);
  if (!org.learn.marketplace.enabled) notFound();
  return (
    <AcademyShell org={org} tab="rooms" signedIn={!!me} streak={state?.learner.streak_days}>
      <div className="mx-auto max-w-3xl">
        <Link href={`/academy/${org.slug}/rooms`} className="mb-3 inline-flex text-[0.8125rem] font-medium text-ink-muted hover:text-ink">← All training rooms</Link>
        <h1 className="text-[1.75rem] font-bold tracking-tight text-ink">List your training room</h1>
        <p className="mb-5 mt-1 text-[0.9375rem] text-ink-muted">Run a roastery, café or training space with a commercial machine? List it here and baristas around Australia can hire it.</p>
        <section className={card}><ListRoomForm slug={org.slug} commission={org.learn.marketplace.commissionPct} /></section>
      </div>
    </AcademyShell>
  );
}
