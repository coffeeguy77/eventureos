import { cn } from "@/lib/cn";

/** "Emailed 19 Oct · Viewed 2×" / "Not sent yet" for an invoice raised in EventureOS. Nothing before the 0059 update. */
export function InvoiceSentStatus({ i, className }: {
  i: { status: string; emailed_at?: string | null; view_count?: number | null; last_viewed_at?: string | null; reminders?: unknown; origin?: string | null };
  className?: string;
}) {
  if (i.emailed_at === undefined || i.origin === "xero" || i.status === "void") return null;
  const d = (x: string) => new Date(x).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "Australia/Sydney" });
  const rem = Array.isArray(i.reminders) ? i.reminders.length : 0;
  if (!i.emailed_at) return i.status === "paid" ? null : <span className={cn("block text-[0.7188rem] font-medium text-amber-700", className)}>Not sent yet</span>;
  return (
    <span className={cn("block text-[0.7188rem] text-ink-faint", className)}>
      Emailed {d(i.emailed_at)}
      {i.view_count ? <span className="text-emerald-700"> · Viewed{i.view_count > 1 ? ` ${i.view_count}×` : ""}{i.last_viewed_at ? ` ${d(i.last_viewed_at)}` : ""}</span> : " · Not opened"}
      {rem ? ` · ${rem} reminder${rem === 1 ? "" : "s"}` : ""}
    </span>
  );
}
