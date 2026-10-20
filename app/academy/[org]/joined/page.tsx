import Link from "next/link";
import { CheckCircle2, Mail } from "lucide-react";
import { createServiceClient } from "@/lib/integrations/runtime";
import { academy } from "@/lib/learn/page";
import { settleLearnReturn } from "@/lib/learn/server";
import { AcademyShell, btn, card } from "@/components/academy/shell";
import { LearnLogin } from "@/components/academy/forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Welcome", robots: { index: false, follow: false } };

/** Back from Stripe: settle the payment if the webhook hasn't yet, then say what happens next. */
export default async function Joined({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ a?: string }> }) {
  const { org: slug } = await params;
  const a = (await searchParams).a ?? "";
  const first = await academy(slug);
  if (/^[0-9a-f-]{36}$/i.test(a)) await settleLearnReturn(first.org, a).catch(() => undefined);
  const { data } = /^[0-9a-f-]{36}$/i.test(a) ? await createServiceClient().from("learn_access").select("status").eq("organisation_id", first.org.id).eq("id", a).maybeSingle() : { data: null };
  const { org, me } = first;
  const active = data?.status === "active";
  return (
    <AcademyShell org={org} tab="join" signedIn={!!me}>
      <div className={`${card} mx-auto max-w-lg text-center`}>
        {active ? <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" /> : <Mail className="mx-auto h-10 w-10 text-[var(--b)]" />}
        <h1 className="mt-2 text-[1.5rem] font-bold tracking-tight text-ink">{active ? "You're in!" : "Thanks — we're confirming your payment"}</h1>
        <p className="mt-1 text-[0.9375rem] text-ink-muted">{active ? `${org.learn.name} is unlocked.` : "This usually takes a few seconds. Refresh in a moment."}</p>
        {me ? <Link href={`/academy/${org.slug}?welcome=1`} className={`${btn} mt-5`}>Start learning</Link> : (
          <div className="mt-5 text-left"><p className="mb-3 text-[0.9063rem] text-ink-muted">Sign in with the email you used to start learning.</p><LearnLogin slug={org.slug} signup={false} /></div>
        )}
      </div>
    </AcademyShell>
  );
}
