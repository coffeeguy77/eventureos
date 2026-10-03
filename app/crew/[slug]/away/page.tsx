import { requireCrew } from "@/lib/crew/server";
import { myAway } from "@/lib/crew/data";
import { fmtDate, todayISO } from "@/lib/format";
import { AwayForm, RemoveAwayButton } from "../ui";
import { Card, Section } from "../parts";

export const metadata = { title: "Away" };
export const dynamic = "force-dynamic";

export default async function CrewAway({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = await requireCrew(slug);
  const today = todayISO(s.org.timezone);
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
