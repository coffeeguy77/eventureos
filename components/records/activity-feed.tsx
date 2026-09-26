import { Avatar } from "@/components/ui/avatar";
import { fmtDateTime, relative } from "@/lib/format";
import type { ActivityLog } from "@/lib/types";
import { cn } from "@/lib/cn";

const SYSTEM_DOT: Record<string, string> = {
  customer: "bg-emerald-500",
  system: "bg-zinc-400",
  integration: "bg-sky-500",
};

export function ActivityFeed({ items, names, tz, compact = false }: {
  items: ActivityLog[]; names: Record<string, string>; tz: string; compact?: boolean;
}) {
  if (items.length === 0) return <p className="px-5 py-6 text-[12.5px] text-ink-muted">No activity yet.</p>;
  return (
    <ol className="px-5 pb-4">
      {items.map((a, i) => {
        const who = a.actor_type === "user" ? names[a.actor_id ?? ""] ?? "Team member" : a.actor_label ?? (a.actor_type === "customer" ? "Customer" : "System");
        return (
          <li key={a.id} className="relative flex gap-3 pb-3.5">
            {i < items.length - 1 && <span className="absolute left-[11px] top-7 h-[calc(100%-20px)] w-px bg-line" />}
            {a.actor_type === "user" ? (
              <Avatar name={who} size={23} />
            ) : (
              <span className="flex h-[23px] w-[23px] shrink-0 items-center justify-center rounded-full bg-zinc-50 ring-1 ring-line">
                <span className={cn("h-2 w-2 rounded-full", SYSTEM_DOT[a.actor_type] ?? "bg-zinc-400")} />
              </span>
            )}
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="break-words text-[13px] leading-snug text-ink">{a.summary}</p>
              {!compact && a.changes && <ChangeList changes={a.changes} />}
              <p className="mt-0.5 text-[11.5px] text-ink-faint" title={fmtDateTime(a.created_at, tz)}>
                {a.actor_type !== "user" && <span>{who} · </span>}
                {relative(a.created_at)}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

const pretty = (v: unknown) => {
  if (v == null || v === "") return "—";
  const s = String(v);
  return /^[a-z]+(_[a-z]+)*$/.test(s) ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ") : s;
};

function ChangeList({ changes }: { changes: Record<string, [unknown, unknown]> }) {
  return (
    <ul className="mt-1 space-y-0.5">
      {Object.entries(changes).map(([field, [from, to]]) => (
        <li key={field} className="break-words text-[12px] text-ink-muted">
          <span className="capitalize">{field.replace(/_/g, " ")}</span>:{" "}
          <span className="line-through decoration-ink-faint/60">{pretty(from)}</span> → <span className="font-medium text-ink">{pretty(to)}</span>
        </li>
      ))}
    </ul>
  );
}
