import type { AppHours } from "@/lib/cafe/server";
import { fmtMin } from "@/lib/cafe/core";

const hhmm = (s: string | null | undefined) => {
  const m = typeof s === "string" ? s.match(/^(\d{1,2}):(\d{2})/) : null;
  return m ? fmtMin(Number(m[1]) * 60 + Number(m[2])) : null;
};

/** "Open now · until 2pm" / "Closed · opens tomorrow at 7am" — live from the café app. */
export function OpenBadge({ hours, dark = false }: { hours: AppHours; dark?: boolean }) {
  if (typeof hours.open !== "boolean") return null;
  const until = hhmm(hours.closesAt ?? null);
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[0.875rem] font-semibold ${hours.open ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200" : dark ? "bg-white/10 text-white/85" : "bg-[#F4ECE6] text-[#3A3431]"}`}>
      <span className={`h-2 w-2 rounded-full ${hours.open ? "animate-pulse bg-emerald-500" : "bg-[#A39A93]"}`} />
      {hours.open ? `Open now${until ? ` · until ${until}` : ""}` : `Closed${hours.nextOpen?.label ? ` · opens ${hours.nextOpen.label}` : ""}`}
    </span>
  );
}
