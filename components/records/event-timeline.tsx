import { Check } from "lucide-react";
import { fmtDateTime } from "@/lib/format";
import type { ActivityLog } from "@/lib/types";
import { cn } from "@/lib/cn";

type Step = { key: string; label: string; match: (a: ActivityLog) => boolean; optional?: boolean };

const STEPS: Step[] = [
  { key: "enquiry", label: "Enquiry received", match: (a) => a.action === "enquiry.received" || a.action === "enquiry.created" },
  { key: "replied", label: "Email replied", match: (a) => a.action === "email.replied" },
  { key: "site", label: "Site inspection", match: (a) => a.action === "event.site_inspection", optional: true },
  { key: "q_created", label: "Quote created", match: (a) => a.action === "quote.created" },
  { key: "q_sent", label: "Quote sent", match: (a) => a.action === "quote.sent" },
  { key: "q_viewed", label: "Customer viewed quote", match: (a) => a.action === "quote.viewed" },
  { key: "q_accepted", label: "Quote accepted", match: (a) => a.action === "quote.accepted" },
  { key: "dep_inv", label: "Deposit invoice generated", match: (a) => a.action === "invoice.created" && /deposit/i.test(a.summary), optional: true },
  { key: "dep_paid", label: "Deposit paid", match: (a) => a.action === "payment.received" && /deposit/i.test(a.summary), optional: true },
  { key: "confirmed", label: "Event confirmed", match: (a) => a.action === "event.status_changed" && JSON.stringify(a.changes ?? {}).toLowerCase().includes("confirmed\"]") },
  { key: "details", label: "Final details requested", match: (a) => a.action === "event.details_requested", optional: true },
  { key: "completed", label: "Event completed", match: (a) => a.action === "event.status_changed" && JSON.stringify(a.changes ?? {}).toLowerCase().includes("completed\"]") },
  { key: "final_paid", label: "Final invoice paid", match: (a) => a.action === "payment.received" && /final|full/i.test(a.summary) },
];

/** The whole customer journey for an event, derived from the audit trail. */
export function EventTimeline({ activity, tz, cancelled }: { activity: ActivityLog[]; tz: string; cancelled: boolean }) {
  const asc = [...activity].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const rows = STEPS.map((s) => ({ ...s, hit: asc.find(s.match) }));
  const lastDone = rows.reduce((i, r, idx) => (r.hit ? idx : i), -1);
  const visible = rows.filter((r, idx) => r.hit || !r.optional || idx > lastDone);
  const firstPending = visible.findIndex((r, idx) => !r.hit && !r.optional && visible.slice(idx).every((x) => !x.hit));

  return (
    <ol className="px-5 pb-5">
      {visible.map((r, i) => {
        const skipped = !r.hit && !r.optional && i < firstPending;
        const isNext = i === firstPending && !cancelled;
        return (
          <li key={r.key} className="relative flex gap-3 pb-3">
            {i < visible.length - 1 && <span className={cn("absolute left-[9px] top-5 h-[calc(100%-12px)] w-px", r.hit ? "bg-brand-300" : "bg-line")} />}
            <span className={cn("mt-0.5 flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full",
              r.hit ? "bg-brand-500 text-white" : isNext ? "border-2 border-brand-400 bg-white" : "border border-line-strong bg-white")}>
              {r.hit && <Check className="h-3 w-3" strokeWidth={3} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn("text-[13px]", r.hit ? "text-ink" : isNext ? "font-medium text-ink" : "text-ink-faint", skipped && "line-through decoration-ink-faint/50")}>
                {r.label}
              </p>
              {r.hit && <p className="text-[11.5px] text-ink-faint">{fmtDateTime(r.hit.created_at, tz)}</p>}
              {isNext && <p className="text-[11.5px] font-medium text-brand-600">Up next</p>}
            </div>
          </li>
        );
      })}
      {cancelled && <li className="ml-8 text-[12.5px] font-medium text-rose-700">Event cancelled</li>}
    </ol>
  );
}
