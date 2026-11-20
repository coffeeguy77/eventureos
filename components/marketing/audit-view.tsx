import { money } from "@/lib/format";
import type { AuditData } from "@/lib/marketing/audit";

const RATING = { good: { label: "Good", cls: "bg-emerald-50 text-emerald-800 ring-emerald-100" }, ok: { label: "Needs work", cls: "bg-amber-50 text-amber-900 ring-amber-100" }, poor: { label: "Poor", cls: "bg-rose-50 text-rose-800 ring-rose-100" } } as const;

/** The starting-point audit of a client's Google Ads, with the baseline later reports compare against. */
export function AuditView({ d, agency }: { d: AuditData; agency: string }) {
  const b = d.baseline, cur = d.currency;
  const fig = (label: string, value: string) => <div className="rounded-xl border border-line bg-surface px-4 py-3"><p className="text-[0.75rem] text-ink-muted">{label}</p><p className="mt-0.5 text-[1.125rem] font-semibold tabular-nums text-ink">{value}</p></div>;
  return (
    <div className="space-y-6">
      <header>
        <p className="text-[0.8125rem] text-ink-muted">{agency} · Google Ads audit · {new Date(`${d.date}T12:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}</p>
        <h1 className="mt-1 text-[1.5rem] font-semibold tracking-tight text-ink sm:text-[1.75rem]">{d.client} — where the account stands</h1>
      </header>
      <section className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5 sm:flex-row sm:items-center">
        <div className="flex h-24 w-24 shrink-0 flex-col items-center justify-center rounded-full border-4 border-brand-500">
          <span className="text-[1.75rem] font-semibold tabular-nums text-ink">{d.score}</span><span className="text-[0.6875rem] text-ink-muted">out of 100</span>
        </div>
        <div><p className="text-[1rem] font-semibold text-ink">{d.headline}</p><p className="mt-1 whitespace-pre-line text-[0.875rem] leading-relaxed text-ink">{d.summary}</p></div>
      </section>
      <section>
        <h2 className="mb-2 text-[0.9375rem] font-semibold text-ink">The starting point (last 30 days before we took over)</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {fig("Spend", money(b.cost, cur, { cents: false }))}
          {fig("Conversions", String(b.conversions))}
          {fig("Per conversion", b.cpa != null ? money(b.cpa, cur) : "—")}
          {fig("Clicks", b.clicks.toLocaleString("en-AU"))}
          {fig("Click-through rate", b.ctr != null ? `${b.ctr}%` : "—")}
          {fig("Spend on searches that never converted", money(b.wasted, cur, { cents: false }))}
          {fig("Average Quality Score", b.qualityScore != null ? `${b.qualityScore}/10` : "—")}
          {fig("Website visits (GA4)", b.sessions ? b.sessions.toLocaleString("en-AU") : "—")}
        </div>
      </section>
      {d.sections.map((s) => (
        <section key={s.title} className="rounded-xl border border-line bg-surface px-5 py-4">
          <div className="flex flex-wrap items-center gap-2"><h2 className="flex-1 text-[0.9375rem] font-semibold text-ink">{s.title}</h2><span className={`rounded-full px-2 py-0.5 text-[0.7188rem] font-medium ring-1 ring-inset ${RATING[s.rating].cls}`}>{RATING[s.rating].label}</span></div>
          {s.findings.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5 text-[0.8438rem] text-ink">{s.findings.map((f, i) => <li key={i}>{f}</li>)}</ul>}
          {s.actions.length > 0 && <><p className="mt-3 text-[0.75rem] font-medium text-ink-muted">What happens next</p><ul className="mt-1 list-disc space-y-1 pl-5 text-[0.8438rem] text-ink">{s.actions.map((f, i) => <li key={i}>{f}</li>)}</ul></>}
        </section>
      ))}
    </div>
  );
}
