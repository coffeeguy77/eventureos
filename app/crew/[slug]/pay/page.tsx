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
  const [shifts, payments, { data: me }, slipsRes] = await Promise.all([
    myShifts(s, { from: addDaysISO(today, -180), to: today }), myPayments(s),
    s.db.from("crew_members").select("xero_employee_id").eq("id", s.member.id).maybeSingle(),
    s.db.from("staff_payslips").select("id, period_start, period_end, paid_on, gross, tax, super, net, lines").eq("crew_member_id", s.member.id).order("paid_on", { ascending: false }).limit(26),
  ]);
  const onPayroll = !!(me as { xero_employee_id?: string | null } | null)?.xero_employee_id;
  type Slip = { id: string; period_start: string | null; period_end: string | null; paid_on: string | null; gross: number | null; tax: number | null; super: number | null; net: number | null; lines: { name: string; hours: number; rate: number | null; amount: number }[] };
  const slips = (slipsRes.error ? [] : slipsRes.data ?? []) as Slip[];
  const worked = shifts.filter((x) => x.status === "confirmed").reverse();
  // café shifts for people on Xero Payroll are paid by payroll (see payslips), not owed here
  const owed = worked.filter((x) => !x.paymentId && !(x.roster && (onPayroll || x.amount == null)));
  const owedTotal = owed.reduce((t, x) => t + (x.amount ?? 0), 0);
  const owedHours = owed.reduce((t, x) => t + (x.hours ?? 0), 0);
  const cur = s.org.currency;
  return (
    <div>
      <h1 className="mb-4 text-[1.5rem] font-bold tracking-tight text-ink">Pay</h1>
      {s.member.salaried ? (
        <Card className="mb-6 bg-[var(--crew-brand)] text-white ring-0">
          <p className="text-[0.75rem] font-semibold uppercase tracking-wide opacity-80">On salary</p>
          <p className="mt-1 text-[1.25rem] font-bold leading-tight">You&apos;re paid a salary, not by the hour</p>
          <p className="mt-1 text-[0.8125rem] opacity-80">Your shifts are listed below so you can see your hours. Talk to the office about your pay.</p>
        </Card>
      ) : (
        <Card className="mb-6 bg-[var(--crew-brand)] text-white ring-0">
          <p className="text-[0.75rem] font-semibold uppercase tracking-wide opacity-80">Owed to you</p>
          <p className="mt-1 text-[2rem] font-bold leading-none">{money(owedTotal, cur, { cents: true })}</p>
          <p className="mt-1 text-[0.8125rem] opacity-80">{fmtHours(Math.round(owedHours * 100) / 100)} across {owed.length} shift{owed.length === 1 ? "" : "s"} · rate {money(s.member.hourly_rate ?? s.org.staff_hourly_rate, cur, { cents: true })}/hr</p>
        </Card>
      )}

      {(onPayroll || slips.length > 0) && (
        <Section title="Payslips" hint="From payroll (Xero), after each pay run.">
          {slips.length === 0 && <Card><p className="text-[0.875rem] text-ink-muted">Your payslips show here after the next pay run.</p></Card>}
          {slips.map((p) => (
            <details key={p.id} className="rounded-2xl bg-surface p-4 shadow-card ring-1 ring-line">
              <summary className="flex cursor-pointer items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.9375rem] font-semibold text-ink">Paid {p.paid_on ? fmtDate(p.paid_on, "long") : "—"}</span>
                  <span className="block text-[0.8125rem] text-ink-muted">{p.period_start && p.period_end ? `${fmtDate(p.period_start)} – ${fmtDate(p.period_end)}` : ""}</span>
                </span>
                <span className="text-right"><span className="block text-[1.0625rem] font-bold text-emerald-700">{p.net != null ? money(Number(p.net), cur, { cents: true }) : "—"}</span><span className="block text-[0.6875rem] text-ink-faint">take home</span></span>
              </summary>
              <div className="mt-3 space-y-1 border-t border-line pt-3 text-[0.8125rem]">
                {p.lines.map((l, i) => <p key={i} className="flex justify-between gap-3"><span className="text-ink-muted">{l.name}{l.hours ? ` · ${l.hours} h${l.rate != null ? ` × ${money(l.rate, cur, { cents: true })}` : ""}` : ""}</span><span className="text-ink">{money(l.amount, cur, { cents: true })}</span></p>)}
                <p className="flex justify-between gap-3 pt-1 font-semibold"><span className="text-ink">Gross</span><span className="text-ink">{p.gross != null ? money(Number(p.gross), cur, { cents: true }) : "—"}</span></p>
                <p className="flex justify-between gap-3"><span className="text-ink-muted">Tax</span><span className="text-ink">{p.tax != null ? `−${money(Number(p.tax), cur, { cents: true })}` : "—"}</span></p>
                <p className="flex justify-between gap-3"><span className="text-ink-muted">Super (paid to your fund)</span><span className="text-ink">{p.super != null ? money(Number(p.super), cur, { cents: true }) : "—"}</span></p>
              </div>
            </details>
          ))}
        </Section>
      )}

      <Section title="Payments">
        {payments.length === 0 && <Card><p className="text-[0.875rem] text-ink-muted">No payments recorded yet.</p></Card>}
        {payments.map((p) => (
          <Card key={p.id} className="flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-[0.9375rem] font-semibold text-ink">{fmtDate(p.paid_on, "long")}</p>
              <p className="text-[0.8125rem] text-ink-muted">{fmtHours(p.hours)}{p.note && p.note !== "Bank transfer" ? ` · ${p.note}` : ""}{p.reference ? ` · Ref ${p.reference}` : ""}</p>
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
              {!s.member.salaried && (
                <div className="text-right">
                  <p className="text-[0.9375rem] font-semibold text-ink">{x.amount != null ? money(x.amount, cur, { cents: true }) : "—"}</p>
                  {x.paymentId ? <Pill tone="green">Paid</Pill> : <Pill tone="amber">Owed</Pill>}
                </div>
              )}
            </Card>
          </Link>
        ))}
      </Section>
    </div>
  );
}
