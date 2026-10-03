import Link from "next/link";
import { ChevronRight, Clock, MapPin } from "lucide-react";
import { cn } from "@/lib/cn";
import { fmtHours } from "@/lib/crew/shifts";

/** Pieces shared by the staff app pages (server-rendered). */
export function DateBlock({ date }: { date: string | null }) {
  if (!date) return <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-amber-50 text-[0.75rem] font-semibold text-amber-800 ring-1 ring-amber-200">TBC</div>;
  const d = new Date(`${date}T12:00:00`);
  return (
    <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--crew-brand)_10%,white)] text-[var(--crew-brand)]">
      <span className="text-[0.625rem] font-semibold uppercase tracking-wide">{d.toLocaleDateString("en-AU", { weekday: "short" })}</span>
      <span className="text-[1.25rem] font-bold leading-none">{d.getDate()}</span>
      <span className="text-[0.625rem] font-medium uppercase">{d.toLocaleDateString("en-AU", { month: "short" })}</span>
    </div>
  );
}

export function JobSummary({ name, client, venue, start, finish, hours, href, badge }: {
  name: string; client?: string | null; venue?: string | null; start?: string | null; finish?: string | null; hours?: number | null;
  href?: boolean; badge?: React.ReactNode;
}) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 text-[0.9375rem] font-semibold leading-snug text-ink">{name}</p>
        {href && <ChevronRight className="mt-0.5 h-5 w-5 shrink-0 text-ink-faint" />}
      </div>
      {client && client !== name && <p className="text-[0.8125rem] text-ink-muted">{client}</p>}
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[0.8125rem] text-ink-muted">
        <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{start ?? "?"}–{finish ?? "?"}{hours != null && <span className="text-ink-faint">· {fmtHours(hours)}</span>}</span>
        {venue && <span className="inline-flex min-w-0 items-center gap-1"><MapPin className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{venue}</span></span>}
      </div>
      {badge && <div className="mt-1.5 flex flex-wrap gap-1.5">{badge}</div>}
    </div>
  );
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("rounded-2xl bg-surface p-4 shadow-card ring-1 ring-line", className)}>{children}</div>;
}

export function Pill({ tone = "neutral", children }: { tone?: "neutral" | "green" | "amber" | "red" | "brand"; children: React.ReactNode }) {
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold ring-1 ring-inset",
    tone === "neutral" && "bg-zinc-50 text-ink-muted ring-line", tone === "green" && "bg-emerald-50 text-emerald-700 ring-emerald-200",
    tone === "amber" && "bg-amber-50 text-amber-800 ring-amber-200", tone === "red" && "bg-rose-50 text-rose-700 ring-rose-200",
    tone === "brand" && "bg-[color-mix(in_srgb,var(--crew-brand)_10%,white)] text-[var(--crew-brand)] ring-[color-mix(in_srgb,var(--crew-brand)_25%,white)]")}>{children}</span>;
}

export function ShiftRow({ href, date, children }: { href?: string; date: string | null; children: React.ReactNode }) {
  const inner = <div className="flex gap-3"><DateBlock date={date} />{children}</div>;
  return href ? <Link href={href} className="block active:opacity-80">{inner}</Link> : inner;
}

export function Section({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 px-1 text-[0.75rem] font-semibold uppercase tracking-wide text-ink-faint">{title}</h2>
      {hint && <p className="-mt-1 mb-2 px-1 text-[0.75rem] text-ink-faint">{hint}</p>}
      <div className="space-y-3">{children}</div>
    </section>
  );
}
