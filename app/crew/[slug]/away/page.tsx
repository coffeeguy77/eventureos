import { requireCrew } from "@/lib/crew/server";
import { myAway } from "@/lib/crew/data";
import { fmtDate, todayISO } from "@/lib/format";
import { LEAVE_LABEL } from "@/lib/roster/settings";
import { myAvailability, myLeave, rosterProfile } from "@/lib/roster/staff";
import { AwayForm, RemoveAwayButton } from "../ui";
import { AvailabilityEditor, CancelLeaveButton, LeaveForm } from "../roster-ui";
import { Card, Pill, Section } from "../parts";

export const metadata = { title: "Away" };
export const dynamic = "force-dynamic";

export default async function CrewAway({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = await requireCrew(slug);
  const today = todayISO(s.org.timezone);
  const prof = await rosterProfile(s);

  if (prof.onRoster) {
    const [leave, avail] = await Promise.all([myLeave(s, today), myAvailability(s)]);
    return (
      <div>
        <h1 className="mb-1 text-[1.5rem] font-bold tracking-tight text-ink">Leave &amp; availability</h1>
        <p className="mb-5 text-[0.875rem] text-ink-muted">Ask for leave, and tell the office when you can work so the roster fits around you.</p>
        <Section title="Ask for leave"><LeaveForm slug={slug} today={today} /></Section>
        <Section title="Your leave">
          {leave.length === 0 && <Card><p className="text-[0.875rem] text-ink-muted">Nothing booked.</p></Card>}
          {leave.map((l) => (
            <Card key={l.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-[0.9375rem] font-semibold text-ink">{l.starts_on === l.ends_on ? fmtDate(l.starts_on, "weekday") : `${fmtDate(l.starts_on)} – ${fmtDate(l.ends_on)}`}</p>
                <p className="text-[0.8125rem] text-ink-muted">{l.leave_type ? LEAVE_LABEL[l.leave_type] : "Away"}{l.hours ? ` · ${l.hours} h` : ""}{l.note ? ` · ${l.note}` : ""}</p>
                {l.decline_reason && <p className="text-[0.75rem] text-rose-700">{l.decline_reason}</p>}
              </div>
              <Pill tone={l.status === "approved" ? "green" : l.status === "declined" ? "red" : "amber"}>{l.status === "pending" ? "Waiting" : l.status === "approved" ? "Approved" : "Declined"}</Pill>
              {l.status === "pending" && <CancelLeaveButton slug={slug} id={l.id} />}
            </Card>
          ))}
        </Section>
        <Section title="When you can work" hint="Your usual week. The office sees this when they build the roster.">
          <AvailabilityEditor slug={slug} rows={avail.map((a) => ({ weekday: a.weekday, available: a.available, start: a.start_time, finish: a.finish_time }))} />
        </Section>
      </div>
    );
  }

  const away = await myAway(s, today);
  return (
    <div>
      <h1 className="mb-1 text-[1.5rem] font-bold tracking-tight text-ink">Away</h1>
      <p className="mb-5 text-[0.875rem] text-ink-muted">Let the office know in advance when you can&apos;t work. If you&apos;re already on a shift those days, post it on the job board first — once someone takes it you can mark yourself away.</p>
      <Section title="Add dates"><AwayForm slug={slug} today={today} /></Section>
      <Section title="You're away">
        {away.length === 0 && <Card><p className="text-[0.875rem] text-ink-muted">Nothing booked.</p></Card>}
        {away.map((a) => (
          <Card key={a.id} className="flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-[0.9375rem] font-semibold text-ink">{a.starts_on === a.ends_on ? fmtDate(a.starts_on, "weekday") : `${fmtDate(a.starts_on)} – ${fmtDate(a.ends_on)}`}</p>
              {a.note && <p className="text-[0.8125rem] text-ink-muted">{a.note}</p>}
            </div>
            <RemoveAwayButton slug={slug} id={a.id} />
          </Card>
        ))}
      </Section>
    </div>
  );
}
