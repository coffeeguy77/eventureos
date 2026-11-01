import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/context";
import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { loadWageShifts } from "@/lib/crew/wages";
import { fmtHours, staffMinHours } from "@/lib/crew/shifts";
import { addDaysISO, fmtDate, money, todayISO } from "@/lib/format";
import { ClaimRow, OwedCard, PaymentRow } from "./ui";
import { WageTabs } from "./tabs";

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
    supabase.from("staff_hour_claims").select("id, hours, reason, created_at, shift:event_crew(id, payment_id, member:crew_members(name), event:events(id, name, event_date)), custom:staff_shifts(id, payment_id, title, shift_date, member:crew_members(name))").eq("organisation_id", org.id).eq("status", "pending").order("created_at"),
    supabase.from("staff_payments").select("id, paid_on, hours, amount, reference, note, member:crew_members(name)").eq("organisation_id", org.id).gte("paid_on", addDaysISO(today, -120)).order("paid_on", { ascending: false }).limit(60),
  ]);
  type ClaimRaw = { id: string; hours: number; reason: string; created_at: string;
    shift: { id: string; payment_id: string | null; member: { name: string } | null; event: { id: string; name: string; event_date: string | null } | null } | null;
    custom: { id: string; payment_id: string | null; title: string; shift_date: string; member: { name: string } | null } | null };
  const claims = ((claimRows ?? []) as unknown as ClaimRaw[]).map((c) => {
    const d = c.shift?.event?.event_date ?? c.custom?.shift_date ?? null;
    return { id: c.id, hours: Number(c.hours), reason: c.reason, who: c.shift?.member?.name ?? c.custom?.member?.name ?? "Staff", job: c.shift?.event?.name ?? c.custom?.title ?? "Job",
      eventId: c.shift?.event?.id ?? null, date: d ? fmtDate(d) : "TBC", paid: !!(c.shift?.payment_id ?? c.custom?.payment_id) };
  });
  const people = new Map<string, typeof owed>();
  for (const s of owed) people.set(s.crewId, [...(people.get(s.crewId) ?? []), s]);
  const totalOwed = owed.reduce((t, s) => t + (s.amount ?? 0), 0);
  const payments = ((payRows ?? []) as unknown as { id: string; paid_on: string; hours: number; amount: number; reference: string | null; note: string | null; member: { name: string } | null }[])
    .map((p) => ({ id: p.id, when: fmtDate(p.paid_on), who: p.member?.name ?? "Staff", hours: fmtHours(Number(p.hours)), amount: money(Number(p.amount), org.currency, { cents: true }), reference: p.reference, method: p.note }));
  const [{ data: staffRows }, { data: orgRow }] = await Promise.all([
    supabase.from("crew_members").select("id, name").eq("organisation_id", org.id).eq("active", true).order("rank").order("name"),
    supabase.from("organisations").select("settings").eq("id", org.id).single(),
  ]);
  const staff = (staffRows ?? []) as { id: string; name: string }[];
  // bank transfers in the last 3 weeks, by date, for the ABA bank file
  const { data: bt } = await supabase.from("staff_payments").select("paid_on, amount, crew_member_id, member:crew_members(name)").eq("organisation_id", org.id).eq("note", "Bank transfer").gte("paid_on", addDaysISO(today, -21)).order("paid_on", { ascending: false });
  const btList = (bt ?? []) as unknown as { paid_on: string; amount: number; crew_member_id: string; member: { name: string } | null }[];
  const { data: bankRows, error: bankErr } = btList.length ? await supabase.from("staff_bank_accounts").select("crew_member_id").in("crew_member_id", [...new Set(btList.map((p) => p.crew_member_id))]) : { data: [], error: null };
  const hasBank = new Set(((bankRows ?? []) as { crew_member_id: string }[]).map((b) => b.crew_member_id));
  const abaDays = bankErr ? [] : [...new Set(btList.map((p) => p.paid_on))].map((date) => {
    const on = btList.filter((p) => p.paid_on === date);
    return { date, count: on.length, total: Math.round(on.reduce((t, p) => t + Number(p.amount), 0) * 100) / 100, missing: [...new Set(on.filter((p) => !hasBank.has(p.crew_member_id)).map((p) => p.member?.name ?? "?"))] };
  });
  const aba = (await import("@/lib/roster/settings")).readRosterSettings(orgRow?.settings).aba;
  const abaReady = !!(aba.bank && aba.bsb && aba.account && aba.user_id);
  const minHours = staffMinHours((orgRow?.settings as Record<string, unknown> | null) ?? null);

  return (
    <div>
      <PageHeader title="Wages" subtitle={`${money(totalOwed, org.currency, { cents: true })} owed across ${owed.length} shift${owed.length === 1 ? "" : "s"} · hours are setup → finish (minimum ${minHours} hrs) plus approved extras`} />
      <WageTabs active="owed" />
      <div className="space-y-6">
        {claims.length > 0 && (
          <Card>
            <CardHeader title="Extra hours to approve" subtitle="Staff added these when a job went longer. Approved hours are added to their pay." />
            <ul className="divide-y divide-line border-t border-line">{claims.map((c) => <ClaimRow key={c.id} c={c} />)}</ul>
          </Card>
        )}
        {people.size === 0 ? (
          <Card><EmptyState title="Nobody's owed anything">Shifts appear here once the job date has passed. Missing some? Record who worked recent jobs under “Past jobs — who worked”.</EmptyState></Card>
        ) : [...people.values()].sort((a, b) => a[0].crewName.localeCompare(b[0].crewName)).map((list) => (
          <OwedCard key={list[0].crewId} crewId={list[0].crewId} name={list[0].crewName} shifts={list} currency={org.currency} today={today} staff={staff} minHours={minHours} />
        ))}
        {abaDays.length > 0 && (
          <Card>
            <CardHeader title="Bank file (ABA)" subtitle="Bank transfers recorded here, ready to upload in your online banking as one bulk payment. Your account details are in Roster → Setup → Bank file; each person's in Staff details." />
            <ul className="divide-y divide-line border-t border-line text-[0.8125rem]">
              {abaDays.map((d) => (
                <li key={d.date} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
                  <span className="w-28 font-medium text-ink">{fmtDate(d.date, "weekday")}</span>
                  <span className="min-w-0 flex-1 text-ink-muted">{d.count} payment{d.count === 1 ? "" : "s"} · {money(d.total, org.currency, { cents: true })}{d.missing.length ? <span className="text-rose-700"> · no bank details: {d.missing.join(", ")}</span> : null}</span>
                  {!d.missing.length && abaReady && <a href={`/api/wages/aba?date=${d.date}`} className="text-[0.8125rem] font-semibold text-brand-600">Download bank file</a>}
                </li>
              ))}
            </ul>
            {!abaReady && <p className="border-t border-line px-5 py-2 text-[0.75rem] text-amber-800">Add your business bank details in Roster → Setup → Bank file to download.</p>}
          </Card>
        )}
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
