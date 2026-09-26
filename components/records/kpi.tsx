import Link from "next/link";
import { cn } from "@/lib/cn";

export function Kpi({ label, value, sub, href, alert }: {
  label: string; value: React.ReactNode; sub?: React.ReactNode; href?: string; alert?: boolean;
}) {
  const body = (
    <>
      <div className="text-[12px] font-medium text-ink-muted">{label}</div>
      <div className={cn("mt-1.5 break-words text-[24px] font-semibold tracking-tight", alert ? "text-rose-700" : "text-ink")}>{value}</div>
      {sub && <div className="mt-0.5 truncate text-[12px] text-ink-faint group-hover:text-ink-muted">{sub}</div>}
    </>
  );
  const cls = "group rounded-xl border border-line bg-white px-4 py-3.5 shadow-card transition-colors";
  return href ? <Link href={href} className={cn(cls, "hover:border-brand-200")}>{body}</Link> : <div className={cls}>{body}</div>;
}
