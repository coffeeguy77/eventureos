import { ArrowRight } from "lucide-react";
import type { NextAction } from "@/lib/next-action";
import { relative } from "@/lib/format";
import { cn } from "@/lib/cn";

export function NextActionBanner({ action, children }: { action: NextAction; children?: React.ReactNode }) {
  const styles = {
    overdue: "border-rose-200 bg-rose-50/70",
    soon: "border-amber-200 bg-amber-50/70",
    normal: "border-brand-200 bg-brand-50/60",
    done: "border-line bg-white",
  }[action.urgency];
  const label = { overdue: "Overdue", soon: "Next action · soon", normal: "Next action", done: "Status" }[action.urgency];
  return (
    <div className={cn("flex flex-wrap items-center gap-4 rounded-xl border px-5 py-3.5", styles)}>
      <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
        action.urgency === "overdue" ? "bg-rose-100 text-rose-700" : action.urgency === "done" ? "bg-zinc-100 text-ink-muted" : "bg-brand-100 text-brand-700")}>
        <ArrowRight className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className={cn("text-[11px] font-semibold uppercase tracking-wide", action.urgency === "overdue" ? "text-rose-700" : "text-ink-faint")}>{label}</div>
        <div className="text-[14.5px] font-semibold text-ink">{action.label}</div>
        {(action.detail || action.due) && (
          <div className="text-[12.5px] text-ink-muted">
            {action.detail}{action.detail && action.due ? " · " : ""}{action.due ? `Due ${relative(action.due)}` : ""}
          </div>
        )}
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  );
}
