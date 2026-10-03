import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { fmtDate } from "@/lib/format";
import type { StaffingIssue } from "@/lib/crew/staffing";

/** Upcoming jobs that need staffing attention. */
export function StaffingCard({ issues }: { issues: StaffingIssue[] }) {
  return (
    <Card>
      <CardHeader title="Staffing" subtitle={issues.length ? `${issues.length} upcoming job${issues.length === 1 ? "" : "s"} need attention (next 30 days)` : "Every confirmed job in the next 30 days is staffed and accepted"}
        action={<Link href="/settings/team" className="text-[0.7812rem] font-medium text-brand-600 hover:text-brand-700">Staff list</Link>} />
      {issues.length > 0 && (
        <ul className="divide-y divide-line border-t border-line">
          {issues.slice(0, 12).map((i) => (
            <li key={i.eventId} className="px-5 py-2.5">
              <Link href={`/events/${i.eventId}`} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-[0.8125rem] font-medium text-ink hover:text-brand-700">{i.name}</span>
                <span className="shrink-0 text-[0.7188rem] text-ink-faint">{i.date ? fmtDate(i.date) : "TBC"}</span>
              </Link>
              <p className="mt-0.5 flex flex-wrap gap-x-2 text-[0.7188rem]">
                {i.short > 0 && <span className="font-medium text-rose-700">Needs {i.short} more</span>}
                {i.declined.length > 0 && <span className="font-medium text-rose-700">{i.declined.join(", ")} declined in Google Calendar</span>}
                {i.cover.length > 0 && <span className="text-amber-700">{i.cover.join(", ")} looking for cover</span>}
                {i.waiting.length > 0 && <span className="text-amber-700">{i.waiting.join(", ")} not accepted yet</span>}
                <span className="text-ink-faint">{i.accepted}/{i.needed} accepted</span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
