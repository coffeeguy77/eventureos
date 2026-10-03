import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/context";
import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { fillSeries, HORIZON_DAYS } from "@/lib/crew/custom-shifts";
import { WEEKDAYS } from "@/lib/crew/series";
import { addDaysISO, fmtDate, todayISO } from "@/lib/format";
import { WageTabs } from "../tabs";
import { AddShiftForm, EndSeriesButton } from "../shifts-ui";
import { EditShiftToggle } from "../shift-editor";

export const metadata = { title: "Shifts" };

const t = (x: string | null) => (x ? x.slice(0, 5) : "?");

/** Shifts that aren't event shifts: one-offs and regular (weekly / fortnightly) ones, e.g. a coffee delivery round. */
export default async function ShiftsPage() {
  const { supabase, org, role } = await requireOrg();
  if (!["owner", "admin", "manager"].includes(role)) redirect("/dashboard");
  const today = todayISO(org.timezone);
  const ready = !(await supabase.from("staff_shifts").select("id", { head: true, count: "exact" }).limit(1)).error;
  if (!ready) return (<div><PageHeader title="Wages" /><WageTabs active="shifts" /><Card><EmptyState title="One database update to go">Run 0044_staff_shifts.sql in Supabase to add your own shifts and regular shifts.</EmptyState></Card></div>);
  await fillSeries(supabase, org.id, org.timezone).catch(() => []); // keep regular shifts topped up
  const [{ data: staffRows }, { data: series }, { data: shifts }] = await Promise.all([
    supabase.from("crew_members").select("id, name").eq("organisation_id", org.id).eq("active", true).order("rank").order("name"),
    supabase.from("staff_shift_series").select("id, title, weekday, every_weeks, start_time, finish_time, location, starts_on, ends_on, member:crew_members(name)").eq("organisation_id", org.id).eq("active", true).order("weekday"),
    supabase.from("staff_shifts").select("id, crew_member_id, title, shift_date, start_time, finish_time, location, notes, hours_override, rate_override, series_id, payment_id, member:crew_members(name)").eq("organisation_id", org.id).gte("shift_date", today).lte("shift_date", addDaysISO(today, HORIZON_DAYS)).order("shift_date").order("start_time"),
  ]);
  const staff = (staffRows ?? []) as { id: string; name: string }[];
  type Ser = { id: string; title: string; weekday: number; every_weeks: number; start_time: string; finish_time: string; location: string | null; starts_on: string; ends_on: string | null; member: { name: string } | null };
  type Sh = { id: string; crew_member_id: string; title: string; shift_date: string; start_time: string | null; finish_time: string | null; location: string | null; notes: string | null; hours_override: number | null; rate_override: number | null; series_id: string | null; payment_id: string | null; member: { name: string } | null };
  const ser = (series ?? []) as unknown as Ser[], list = (shifts ?? []) as unknown as Sh[];
  return (
    <div>
      <PageHeader title="Wages" subtitle="Shifts that aren't event shifts. They show in the staff member's app and Google Calendar, and their hours go into Wages after the day." />
      <WageTabs active="shifts" />
      <div className="space-y-6">
        {staff.length === 0 ? <Card><EmptyState title="No staff yet">Add people to the staff list in Settings → Team first.</EmptyState></Card> : <AddShiftForm staff={staff} today={today} />}
        <Card>
          <CardHeader title="Regular shifts" subtitle={ser.length ? "Filled 8 weeks ahead, automatically." : "None yet — add a shift and choose “Every week”."} />
          {ser.length > 0 && (
            <ul className="divide-y divide-line border-t border-line">
              {ser.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.8438rem] font-medium text-ink">{s.title} · {s.member?.name ?? "—"}</p>
                    <p className="text-[0.75rem] text-ink-muted">Every {s.every_weeks === 2 ? "second " : ""}{WEEKDAYS[s.weekday]} · {t(s.start_time)}–{t(s.finish_time)}{s.location ? ` · ${s.location}` : ""} · from {fmtDate(s.starts_on)}{s.ends_on ? ` until ${fmtDate(s.ends_on)}` : ""}</p>
                  </div>
                  <EndSeriesButton id={s.id} />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Coming up" subtitle={`${list.length} shift${list.length === 1 ? "" : "s"} in the next 8 weeks`} />
          {list.length === 0 ? <EmptyState title="Nothing booked" /> : (
            <ul className="divide-y divide-line border-t border-line">
              {list.map((s) => (
                <li key={s.id} className="px-5 py-2.5">
                  <EditShiftToggle staff={staff} s={{ key: `c:${s.id}`, kind: "custom", crewId: s.crew_member_id, hoursOverride: s.hours_override, rateOverride: s.rate_override, planned: null, rate: 0,
                    title: s.title, date: s.shift_date, start: s.start_time, finish: s.finish_time, location: s.location, notes: s.notes }}>
                    <div className="flex flex-wrap items-baseline gap-3">
                      <div className="w-24 shrink-0 text-[0.75rem] text-ink-muted">{fmtDate(s.shift_date, "weekday")}</div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[0.8125rem] font-medium text-ink">{s.title} · {s.member?.name ?? "—"}{s.series_id && <span className="font-normal text-ink-faint"> · regular</span>}</p>
                        <p className="text-[0.7188rem] text-ink-muted">{t(s.start_time)}–{t(s.finish_time)}{s.location ? ` · ${s.location}` : ""}</p>
                      </div>
                    </div>
                  </EditShiftToggle>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
