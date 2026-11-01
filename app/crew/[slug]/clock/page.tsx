import { requireCrew } from "@/lib/crew/server";
import { addDaysISO, fmtDate, todayISO } from "@/lib/format";
import { openEntry, shiftsToday } from "@/lib/roster/clock";
import { readRosterSettings } from "@/lib/roster/settings";
import { myTimesheets, rosterProfile } from "@/lib/roster/staff";
import { myShifts } from "@/lib/crew/data";
import { ClockPanel } from "../roster-ui";
import { Card, Pill, Section } from "../parts";

export const metadata = { title: "Clock on" };
export const dynamic = "force-dynamic";

const tm = (iso: string | null, tz: string) => (iso ? new Date(iso).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone: tz }) : "—");

export default async function CrewClock({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = await requireCrew(slug);
  const prof = await rosterProfile(s);
  if (!prof.onRoster && !prof.clockEvents) return <Card><p className="text-[0.875rem] text-ink-muted">Clocking on isn&apos;t switched on for you.</p></Card>;
  const { data: org } = await s.db.from("organisations").select("id, timezone, settings").eq("id", s.org.id).single();
  const o = org as { id: string; timezone: string; settings: unknown };
  const settings = readRosterSettings(o.settings);
  const [open, today, sheets] = await Promise.all([openEntry(s.db, s.org.id, s.member.id), shiftsToday(s.db, o, s.member.id), myTimesheets(s, addDaysISO(todayISO(s.org.timezone), -14))]);
  const tz = s.org.timezone;
  // today's confirmed event shifts (when clocking on for events is switched on)
  const events = settings.clock.events
    ? (await myShifts(s, { from: todayISO(tz), to: todayISO(tz) })).filter((x) => x.kind === "event" && x.status === "confirmed").map((x) => ({ id: x.id, name: x.job.name, start: x.start }))
    : [];
  return (
    <div>
      <h1 className="mb-1 text-[1.5rem] font-bold tracking-tight text-ink">Clock on</h1>
      <p className="mb-5 text-[0.875rem] text-ink-muted">{today.length ? `Today: ${today.map((t) => `${t.start_time.slice(0, 5)}–${t.finish_time.slice(0, 5)}${t.area ? ` (${t.area})` : ""}`).join(", ")}` : "You're not rostered on today."}</p>
      <ClockPanel slug={slug} open={open} needsPlace={!!settings.geofence} cafePhone={prof.cafePhone && today.length > 0 || prof.cafePhone && !events.length} cafeIpad={prof.onRoster && settings.clock.cafe === "ipad"} events={events} photo={settings.clock.photo} />
      <Section title="Your hours — last 2 weeks">
        {sheets.length === 0 && <Card><p className="text-[0.875rem] text-ink-muted">Nothing yet.</p></Card>}
        {sheets.map((t) => {
          const hrs = t.paid_start && t.paid_finish ? Math.max(0, (Date.parse(t.paid_finish) - Date.parse(t.paid_start)) / 3_600_000 - t.break_minutes / 60) : null;
          return (
            <Card key={t.id} className="py-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[0.9375rem] font-semibold text-ink">{fmtDate(t.work_date, "weekday")}</p>
                  <p className="text-[0.8125rem] text-ink-muted">{tm(t.clock_in, tz)} – {t.clock_out ? tm(t.clock_out, tz) : "now"}{t.break_minutes ? ` · ${t.break_minutes} min break` : ""}</p>
                  {t.note && <p className="mt-1 text-[0.75rem] text-ink-faint">{t.note}</p>}
                </div>
                <div className="text-right">
                  {hrs != null && <p className="text-[0.9375rem] font-bold text-ink">{Math.round(hrs * 100) / 100} h</p>}
                  <Pill tone={t.status === "approved" ? "green" : t.status === "rejected" ? "red" : "amber"}>{t.status === "open" ? "On now" : t.status === "pending" ? "Waiting for approval" : t.status === "approved" ? "Approved" : "Not approved"}</Pill>
                </div>
              </div>
            </Card>
          );
        })}
      </Section>
    </div>
  );
}
