import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock, MapPin, Navigation, Phone, StickyNote, Users } from "lucide-react";
import { requireCrew } from "@/lib/crew/server";
import { shiftDetail } from "@/lib/crew/data";
import { fmtHours } from "@/lib/crew/shifts";
import { fmtDate, money, todayISO } from "@/lib/format";
import { AcceptDecline, BoardControls, ExtraHours } from "../../ui";
import { Card, Pill } from "../../parts";

export const metadata = { title: "Shift" };
export const dynamic = "force-dynamic";

const t12 = (t: string | null) => {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")}${h < 12 ? "am" : "pm"}`;
};

/** Everything a barista needs for one job — times, where, who to ask for, what's included — and nothing the client pays. */
export default async function ShiftPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const s = await requireCrew(slug);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await shiftDetail(s, id);
  if (!d) notFound();
  const today = todayISO(s.org.timezone);
  const past = !!d.job.event_date && d.job.event_date < today;
  const where = [d.job.venue, d.job.address].filter(Boolean).join(", ");
  const maps = where ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(where)}` : null;

  return (
    <div className="space-y-4">
      <Link href={`/crew/${slug}`} className="inline-flex items-center gap-1 text-[0.875rem] font-medium text-ink-muted"><ArrowLeft className="h-4 w-4" />Shifts</Link>
      <div>
        <div className="flex flex-wrap gap-1.5">
          {d.status === "confirmed" ? <Pill tone="green">Confirmed</Pill> : d.status === "offered" ? <Pill tone="brand">Waiting for your answer</Pill> : <Pill tone="amber">Hand up — TBC</Pill>}
          {d.kind === "custom" && <Pill>Regular / office shift</Pill>}
          {d.job.status !== "confirmed" && <Pill tone="amber">Job not confirmed yet</Pill>}
          {d.boardPostedAt && <Pill tone="amber">On the job board</Pill>}
        </div>
        <h1 className="mt-2 text-[1.5rem] font-bold leading-tight tracking-tight text-ink">{d.job.name}</h1>
        {d.job.client && d.job.client !== d.job.name && <p className="text-[0.9375rem] text-ink-muted">{d.job.client}</p>}
        <p className="mt-1 text-[1rem] font-semibold text-[var(--crew-brand)]">{d.job.event_date ? fmtDate(d.job.event_date, "weekday") : "Date TBC"}</p>
      </div>

      {d.status === "offered" && <Card><p className="text-[0.875rem] text-ink">You&apos;ve been rostered on this job.</p><AcceptDecline slug={slug} shiftId={d.id} /></Card>}

      <Card>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div><p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">Arrive / setup</p><p className="mt-0.5 text-[1.125rem] font-bold text-ink">{t12(d.start)}</p></div>
          <div><p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">Service</p><p className="mt-0.5 text-[1.125rem] font-bold text-ink">{t12(d.job.start_time)}</p></div>
          <div><p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">Finish</p><p className="mt-0.5 text-[1.125rem] font-bold text-ink">{t12(d.finish)}</p></div>
        </div>
        <p className="mt-3 flex items-center justify-center gap-1 border-t border-line pt-3 text-[0.8125rem] text-ink-muted"><Clock className="h-4 w-4" />{fmtHours(d.hours)} paid{d.extraApproved ? ` (incl. ${fmtHours(d.extraApproved)} extra)` : ""}</p>
      </Card>

      {where && (
        <Card>
          <p className="flex items-start gap-2 text-[0.9375rem] text-ink"><MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[var(--crew-brand)]" /><span>{d.job.venue && <b className="block">{d.job.venue}</b>}{d.job.address}</span></p>
          {maps && <a href={maps} target="_blank" rel="noreferrer" className="mt-3 inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-surface text-[0.875rem] font-semibold text-ink ring-1 ring-inset ring-line-strong"><Navigation className="h-4 w-4" />Directions</a>}
        </Card>
      )}

      {(d.onsite || d.team.length > 0) && (
        <Card className="space-y-3">
          {d.onsite && (
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1"><p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">On-site contact</p><p className="text-[0.9375rem] font-medium text-ink">{d.onsite.name}</p></div>
              {d.onsite.phone && <a href={`tel:${d.onsite.phone.replace(/\s+/g, "")}`} className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-[var(--crew-brand)] px-4 text-[0.875rem] font-semibold text-white"><Phone className="h-4 w-4" />Call</a>}
            </div>
          )}
          {d.team.length > 0 && (
            <div className={d.onsite ? "border-t border-line pt-3" : ""}>
              <p className="flex items-center gap-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint"><Users className="h-3.5 w-3.5" />Working with</p>
              {d.team.map((t) => (
                <div key={t.name} className="mt-1.5 flex items-center justify-between gap-2 text-[0.9375rem]">
                  <span className="text-ink">{t.name}{t.role ? <span className="text-ink-faint"> · {t.role}</span> : null}{t.status === "offered" && <span className="text-[0.75rem] text-amber-700"> · not accepted yet</span>}</span>
                  {t.phone && <a href={`tel:${t.phone.replace(/\s+/g, "")}`} className="text-[0.8125rem] font-semibold text-[var(--crew-brand)]">Call</a>}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {(d.notes || d.requirements) && (
        <Card>
          <p className="flex items-center gap-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint"><StickyNote className="h-3.5 w-3.5" />Notes for staff</p>
          {d.notes && <p className="mt-1 whitespace-pre-line text-[0.9375rem] text-ink">{d.notes}</p>}
          {d.requirements && <p className="mt-2 whitespace-pre-line text-[0.875rem] text-ink-muted">{d.requirements}</p>}
        </Card>
      )}

      {(d.inclusions.length > 0 || d.guests || d.serves) && (
        <Card>
          <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">The job</p>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[0.875rem] text-ink-muted">
            {d.type && <span>{d.type}</span>}{d.guests ? <span>{d.guests} guests</span> : null}{d.serves ? <span>{d.serves} serves</span> : null}
          </div>
          {d.inclusions.length > 0 && (
            <ul className="mt-2 divide-y divide-line">
              {d.inclusions.map((i, n) => (
                <li key={n} className="py-2">
                  <p className="text-[0.9375rem] text-ink"><b className="font-semibold">{Number(i.quantity)}{i.unit ? ` ${i.unit}` : ""}</b> · {i.name}</p>
                  {i.description && <p className="whitespace-pre-line text-[0.8125rem] text-ink-muted">{i.description}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {d.status === "confirmed" && (
        <Card className="space-y-3">
          <div className="flex items-baseline justify-between">
            <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">Your pay</p>
            <p className="text-[1.125rem] font-bold text-ink">{d.amount != null ? money(d.amount, s.org.currency, { cents: true }) : "—"}</p>
          </div>
          <p className="-mt-2 text-[0.8125rem] text-ink-muted">{fmtHours(d.hours)} × {money(d.rate, s.org.currency, { cents: true })}/hr{d.paymentId ? " · Paid" : ""}</p>
          {d.claims.length > 0 && (
            <ul className="space-y-1 text-[0.8125rem]">
              {d.claims.map((c) => (
                <li key={c.id} className="flex items-start justify-between gap-2">
                  <span className="text-ink-muted">+{fmtHours(c.hours)} — {c.reason}</span>
                  <Pill tone={c.status === "approved" ? "green" : c.status === "declined" ? "red" : "amber"}>{c.status === "pending" ? "Waiting" : c.status === "approved" ? "Approved" : "Not approved"}</Pill>
                </li>
              ))}
            </ul>
          )}
          {!d.paymentId && (past || d.job.event_date === today) && <ExtraHours slug={slug} shiftId={d.id} />}
          {!past && d.job.event_date !== today && d.kind === "event" && <BoardControls slug={slug} shiftId={d.id} posted={!!d.boardPostedAt} />}
          {!past && d.kind === "custom" && <p className="text-[0.8125rem] text-ink-muted">Can&apos;t make it? Let the office know{s.org.contact_phone ? <> — <a href={`tel:${s.org.contact_phone.replace(/\s+/g, "")}`} className="font-semibold text-[var(--crew-brand)]">call {s.org.contact_phone}</a></> : ""}.</p>}
        </Card>
      )}
    </div>
  );
}
