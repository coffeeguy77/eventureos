import Link from "next/link";
import { requireCrew } from "@/lib/crew/server";
import { myPayments, myShifts } from "@/lib/crew/data";
import { fmtHours } from "@/lib/crew/shifts";
import { addDaysISO, fmtDate, money, todayISO } from "@/lib/format";
import { Card, Pill, Section } from "../parts";

export const metadata = { title: "Pay" };
export const dynamic = "force-dynamic";

export default async function CrewPay({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = await requireCrew(slug);
  const today = todayISO(s.org.timezone);
  const [shifts, payments] = await Promise.all([myShifts(s, { from: addDaysISO(today, -180), to: today }), myPayments(s)]);
  const worked = shifts.filter((x) => x.status === "confirmed").reverse();
  const owed = worked.filter((x) => !x.paymentId);
  const owedTotal = owed.reduce((t, x) => t + (x.amount ?? 0), 0);
  const owedHours = owed.reduce((t, x) => t + (x.hours ?? 0), 0);
  const cur = s.org.currency;
  return (
    <div>
      <h1 className="mb-4 text-[1.5rem] font-bold tracking-tight text-ink">Pay</h1>
      <Card className="mb-6 bg-[var(--crew-brand)] text-white ring-0">
        <p className="text-[0.75rem] font-semibold uppercase tracking-wide opacity-80">Owed to you</p>
        <p className="mt-1 text-[2rem] font-bold leading-none">{money(owedTotal, cur, { cents: true })}</p>
        <p className="mt-1 text-[0.8125rem] opacity-80">{fmtHours(Math.round(owedHours * 100) / 100)} across {owed.length} shift{owed.length === 1 ? "" : "s"} · rate {money(s.member.hourly_rate ?? s.org.staff_hourly_rate, cur, { cents: true })}/hr</p>
      </Card>

      <Section title="Payments">
        {payments.length === 0 && <Card><p className="text-[0.875rem] text-ink-muted">No payments recorded yet.</p></Card>}
        {payments.map((p) => (
          <Card key={p.id} className="flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-[0.9375rem] font-semibold text-ink">{fmtDate(p.paid_on, "long")}</p>
              <p className="text-[0.8125rem] text-ink-muted">{fmtHours(p.hours)}{p.reference ? ` · Ref ${p.reference}` : ""}</p>
            </div>
            <p className="text-[1.0625rem] font-bold text-emerald-700">{money(p.amount, cur, { cents: true })}</p>
          </Card>
        ))}
      </Section>

      <Section title="Shifts worked" hint="Last 6 months. Extra hours show once the office approves them.">
        {worked.length === 0 && <Card><p className="text-[0.875rem] text-ink-muted">No shifts yet.</p></Card>}
        {worked.map((x) => (
          <Link key={x.id} href={`/crew/${slug}/shift/${x.id}`} className="block">
            <Card className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.9375rem] font-semibold text-ink">{x.job.name}</p>
                <p className="text-[0.8125rem] text-ink-muted">{x.job.event_date ? fmtDate(x.job.event_date) : "TBC"} · {fmtHours(x.hours)}{x.extraPending ? ` · +${fmtHours(x.extraPending)} waiting` : ""}</p>
              </div>
              <div className="text-right">
                <p className="text-[0.9375rem] font-semibold text-ink">{x.amount != null ? money(x.amount, cur, { cents: true }) : "—"}</p>
                {x.paymentId ? <Pill tone="green">Paid</Pill> : <Pill tone="amber">Owed</Pill>}
              </div>
            </Card>
          </Link>
        ))}
      </Section>
    </div>
  );
}
