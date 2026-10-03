import Link from "next/link";
import { requireCrew } from "@/lib/crew/server";
import { myShifts } from "@/lib/crew/data";
import { addDaysISO, todayISO } from "@/lib/format";
import { AcceptDecline } from "./ui";
import { Card, JobSummary, Pill, Section, ShiftRow } from "./parts";

export const metadata = { title: "Shifts" };
export const dynamic = "force-dynamic";

export default async function CrewShifts({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = await requireCrew(slug);
  const today = todayISO(s.org.timezone);
  const shifts = await myShifts(s, { from: today });
  const offered = shifts.filter((x) => x.status === "offered");
  const confirmed = shifts.filter((x) => x.status === "confirmed");
  const hands = shifts.filter((x) => x.status === "interested");
  const thisWeek = confirmed.filter((x) => (x.job.event_date ?? "9999") <= addDaysISO(today, 7));

  return (
    <div>
      <h1 className="mb-1 text-[1.5rem] font-bold tracking-tight text-ink">Your shifts</h1>
      <p className="mb-5 text-[0.875rem] text-ink-muted">{confirmed.length ? `${confirmed.length} coming up${thisWeek.length ? ` · ${thisWeek.length} in the next 7 days` : ""}` : "Nothing booked yet."}</p>

      {offered.length > 0 && (
        <Section title="Needs your answer" hint="You've been rostered on these — accept so the office knows you're coming.">
          {offered.map((x) => (
            <Card key={x.id} className="ring-2 ring-[var(--crew-brand)]">
              <ShiftRow href={`/crew/${slug}/shift/${x.id}`} date={x.job.event_date}>
                <JobSummary name={x.job.name} client={x.job.client} venue={x.job.venue} start={x.start} finish={x.finish} hours={x.hours} href />
              </ShiftRow>
              <AcceptDecline slug={slug} shiftId={x.id} />
            </Card>
          ))}
        </Section>
      )}

      <Section title="Coming up">
        {confirmed.length === 0 && (
          <Card><p className="text-[0.875rem] text-ink-muted">No confirmed shifts. Check the <Link href={`/crew/${slug}/board`} className="font-semibold text-[var(--crew-brand)]">job board</Link> for open shifts and TBC jobs.</p></Card>
        )}
        {confirmed.map((x) => (
          <Card key={x.id}>
            <ShiftRow href={`/crew/${slug}/shift/${x.id}`} date={x.job.event_date}>
              <JobSummary name={x.job.name} client={x.job.client} venue={x.job.venue} start={x.start} finish={x.finish} hours={x.hours} href
                badge={<>
                  <Pill tone="green">Confirmed</Pill>
                  {x.boardPostedAt && <Pill tone="amber">On job board — looking for cover</Pill>}
                  {x.calendarResponse === "declined" && <Pill tone="red">Declined in Google Calendar</Pill>}
                </>} />
            </ShiftRow>
          </Card>
        ))}
      </Section>

      {hands.length > 0 && (
        <Section title="Hand up — TBC" hint="Not guaranteed. If the job is confirmed and you're free, the shift may be yours.">
          {hands.map((x) => (
            <Card key={x.id} className="bg-zinc-50/60">
              <ShiftRow href={`/crew/${slug}/board`} date={x.job.event_date}>
                <JobSummary name={x.job.name} venue={x.job.venue} start={x.start} finish={x.finish} hours={x.hours} badge={<Pill tone="amber">TBC</Pill>} />
              </ShiftRow>
            </Card>
          ))}
        </Section>
      )}
    </div>
  );
}
