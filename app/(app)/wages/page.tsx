import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/context";
import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { loadWageShifts } from "@/lib/crew/wages";
import { fmtHours } from "@/lib/crew/shifts";
import { addDaysISO, fmtDate, money, todayISO } from "@/lib/format";
import { ClaimRow, OwedCard, PaymentRow } from "./ui";

export const metadata = { title: "Wages" };

export default async function WagesPage() {
  const { supabase, org, role } = await requireOrg();
  if (!["owner", "admin", "manager"].includes(role)) redirect("/dashboard");
  const today = todayISO(org.timezone);
  let owed: Awaited<ReturnType<typeof loadWageShifts>>;
  try { owed = await loadWageShifts(supabase, org.id, { until: today, unpaidOnly: true }); }
  catch {
    return (<div><PageHeader title="Wages" /><Card><EmptyState title="One database update to go">Run the staff-app database update (0043_staff_portal.sql) in Supabase, then this page shows the hours your staff are owed.</EmptyState></Card></div>);
  }
  const [{ data: claimRows }, { data: payRows }] = await Promise.all([
    supabase.from("staff_hour_claims").select("id, hours, reason, created_at, shift:event_crew(id, payment_id, member:crew_members(name), event:events(id, name, event_date))").eq("organisation_id", org.id).eq("status", "pending").order("created_at"),
    supabase.from("staff_payments").select("id, paid_on, hours, amount, reference, member:crew_members(name)").eq("organisation_id", org.id).gte("paid_on", addDaysISO(today, -120)).order("paid_on", { ascending: false }).limit(60),
  ]);
  const claims = ((claimRows ?? []) as unknown as { id: string; hours: number; reason: string; created_at: string; shift: { id: string; payment_id: string | null; member: { name: string } | null; event: { id: string; name: string; event_date: string | null } | null } | null }[])
    .map((c) => ({ id: c.id, hours: Number(c.hours), reason: c.reason, who: c.shift?.member?.name ?? "Staff", job: c.shift?.event?.name ?? "Job", eventId: c.shift?.event?.id ?? null, date: c.shift?.event?.event_date ? fmtDate(c.shift.event.event_date) : "TBC", paid: !!c.shift?.payment_id }));
  const people = new Map<string, typeof owed>();
  for (const s of owed) people.set(s.crewId, [...(people.get(s.crewId) ?? []), s]);
  const totalOwed = owed.reduce((t, s) => t + (s.amount ?? 0), 0);
  const payments = ((payRows ?? []) as unknown as { id: string; paid_on: string; hours: number; amount: number; reference: string | null; member: { name: string } | null }[])
    .map((p) => ({ id: p.id, when: fmtDate(p.paid_on), who: p.member?.name ?? "Staff", hours: fmtHours(Number(p.hours)), amount: money(Number(p.amount), org.currency, { cents: true }), reference: p.reference }));

  return (
    <div>
      <PageHeader title="Wages" subtitle={`${money(totalOwed, org.currency, { cents: true })} owed across ${owed.length} shift${owed.length === 1 ? "" : "s"} · hours are setup → finish plus approved extras`} />
      <div className="space-y-6">
        {claims.length > 0 && (
          <Card>
            <CardHeader title="Extra hours to approve" subtitle="Staff added these when a job went longer. Approved hours are added to their pay." />
            <ul className="divide-y divide-line border-t border-line">{claims.map((c) => <ClaimRow key={c.id} c={c} />)}</ul>
          </Card>
        )}
        {people.size === 0 ? (
          <Card><EmptyState title="Nobody's owed anything">Shifts appear here once the job date has passed. Tick the ones you&apos;ve paid and they move to the staff member&apos;s Pay screen.</EmptyState></Card>
        ) : [...people.values()].sort((a, b) => a[0].crewName.localeCompare(b[0].crewName)).map((list) => (
          <OwedCard key={list[0].crewId} crewId={list[0].crewId} name={list[0].crewName} shifts={list} currency={org.currency} today={today} />
        ))}
        {payments.length > 0 && (
          <Card>
            <CardHeader title="Paid" subtitle="Last 4 months — staff see these (date, amount, reference) in their app." />
            <ul className="divide-y divide-line border-t border-line">{payments.map((p) => <PaymentRow key={p.id} p={p} canUndo={role !== "manager"} />)}</ul>
          </Card>
        )}
      </div>
    </div>
  );
}
