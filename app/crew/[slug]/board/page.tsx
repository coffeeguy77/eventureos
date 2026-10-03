import { requireCrew } from "@/lib/crew/server";
import { board } from "@/lib/crew/data";
import { todayISO } from "@/lib/format";
import { HandUpButton, TakeOpenButton, TakeSwapButton } from "../ui";
import { Card, JobSummary, Pill, Section, ShiftRow } from "../parts";

export const metadata = { title: "Job board" };
export const dynamic = "force-dynamic";

export default async function CrewBoard({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = await requireCrew(slug);
  const items = await board(s, todayISO(s.org.timezone));
  const swaps = items.filter((i) => i.kind === "swap"), open = items.filter((i) => i.kind === "open"), tbc = items.filter((i) => i.kind === "tbc");
  const blockedWhy = (i: (typeof items)[number]) => i.away ? "You're marked away that day" : i.clash ? `Clashes with ${i.clash}` : null;
  const warn = (i: (typeof items)[number]) => blockedWhy(i) && <Pill tone="red">{blockedWhy(i)}</Pill>;

  return (
    <div>
      <h1 className="mb-1 text-[1.5rem] font-bold tracking-tight text-ink">Job board</h1>
      <p className="mb-5 text-[0.875rem] text-ink-muted">Pick up shifts, cover for a teammate, or put your hand up for jobs still being quoted.</p>

      <Section title="Teammates need cover" hint="Take it and it moves straight to your calendar.">
        {swaps.length === 0 && <Card><p className="text-[0.875rem] text-ink-muted">Nobody needs cover right now.</p></Card>}
        {swaps.map((i) => (
          <Card key={i.id}>
            <ShiftRow date={i.job.event_date}>
              <JobSummary name={i.job.name} client={i.job.client} venue={i.job.venue} start={i.start} finish={i.finish} hours={i.hours}
                badge={<><Pill tone="amber">From {i.from}</Pill>{warn(i)}</>} />
            </ShiftRow>
            {i.note && <p className="mt-2 rounded-lg bg-zinc-50 px-3 py-2 text-[0.8125rem] italic text-ink-muted">“{i.note}”</p>}
            <div className="mt-3"><TakeSwapButton slug={slug} shiftId={i.id} blocked={blockedWhy(i)} /></div>
          </Card>
        ))}
      </Section>

      {open.length > 0 && (
        <Section title="Open shifts" hint="Confirmed jobs that still need staff.">
          {open.map((i) => (
            <Card key={i.id}>
              <ShiftRow date={i.job.event_date}>
                <JobSummary name={i.job.name} client={i.job.client} venue={i.job.venue} start={i.start} finish={i.finish} hours={i.hours}
                  badge={<><Pill tone="green">Confirmed</Pill><Pill>{i.spots} spot{i.spots === 1 ? "" : "s"}</Pill>{warn(i)}</>} />
              </ShiftRow>
              <div className="mt-3"><TakeOpenButton slug={slug} eventId={i.id} blocked={blockedWhy(i)} /></div>
            </Card>
          ))}
        </Section>
      )}

      <Section title="TBC jobs — put your hand up" hint="These are still being quoted, so they're not guaranteed. If one is confirmed and you're free, you may get the shift — the office's preferred staff get first pick. You can put your hand up for jobs on the same day; you'll only be given one.">
        {tbc.length === 0 && <Card><p className="text-[0.875rem] text-ink-muted">No TBC jobs at the moment.</p></Card>}
        {tbc.map((i) => (
          <Card key={i.id} className={i.interested ? "ring-2 ring-[var(--crew-brand)]" : ""}>
            <ShiftRow date={i.job.event_date}>
              <JobSummary name={i.job.name} venue={i.job.venue} start={i.start} finish={i.finish} hours={i.hours} badge={<><Pill tone="amber">TBC</Pill>{i.away && <Pill tone="red">You&apos;re away that day</Pill>}{i.clash && <Pill>Same day as {i.clash}</Pill>}</>} />
            </ShiftRow>
            <div className="mt-3"><HandUpButton slug={slug} eventId={i.id} on={!!i.interested} blocked={i.away ? "away" : null} /></div>
          </Card>
        ))}
      </Section>
    </div>
  );
}
