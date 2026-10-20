import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { createServiceClient } from "@/lib/integrations/runtime";
import { learnOrgById } from "@/lib/learn/server";
import { money } from "@/lib/format";
import { AcademyShell, card } from "@/components/academy/shell";
import { PayHire } from "@/components/academy/forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pay for your room hire", robots: { index: false, follow: false } };

export default async function PayHirePage({ params, searchParams }: { params: Promise<{ org: string; token: string }>; searchParams: Promise<{ paid?: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{48}$/.test(token)) notFound();
  const db = createServiceClient();
  const { data: h } = await db.from("learn_venue_bookings").select("id, organisation_id, name, status, amount, wanted_on, hours, venue:learn_venues(name, suburb, state)").eq("pay_token", token).maybeSingle();
  if (!h) notFound();
  const org = await learnOrgById(db, h.organisation_id as string);
  const v = h.venue as unknown as { name: string; suburb: string | null; state: string | null } | null;
  const paid = h.status === "paid" || (await searchParams).paid === "1";
  return (
    <AcademyShell org={org} tab="rooms" signedIn={false}>
      <div className={`${card} mx-auto max-w-md`}>
        <h1 className="text-[1.375rem] font-bold tracking-tight text-ink">Training room hire</h1>
        <dl className="mt-3 space-y-1.5 text-[0.9375rem]">
          <div className="flex justify-between gap-3"><dt className="text-ink-muted">Room</dt><dd className="text-right font-medium text-ink">{v?.name}{v?.suburb ? `, ${v.suburb}` : ""}</dd></div>
          {h.wanted_on && <div className="flex justify-between gap-3"><dt className="text-ink-muted">Date</dt><dd className="font-medium text-ink">{new Date(`${h.wanted_on}T00:00:00Z`).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}</dd></div>}
          {h.hours && <div className="flex justify-between gap-3"><dt className="text-ink-muted">Hours</dt><dd className="font-medium text-ink">{Number(h.hours)}</dd></div>}
          <div className="flex justify-between gap-3 border-t border-line pt-2 text-[1.0625rem] font-bold"><dt>Total</dt><dd>{money(h.amount, org.currency)}</dd></div>
        </dl>
        <div className="mt-5">
          {paid ? <p className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 font-medium text-emerald-800"><CheckCircle2 className="h-5 w-5" />Paid — thank you!</p>
            : h.status === "confirmed" && Number(h.amount) > 0 ? <PayHire token={token} label={`Pay ${money(h.amount, org.currency)} securely`} />
            : <p className="text-[0.9375rem] text-ink-muted">This hire isn&apos;t ready to pay yet — {org.name} will be in touch.</p>}
        </div>
      </div>
    </AcademyShell>
  );
}
