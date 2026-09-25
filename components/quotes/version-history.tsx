import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { fmtDateTime, money } from "@/lib/format";
import { QUOTE_STATUS } from "@/lib/status";
import type { VersionInfo } from "./types";

/** Every published version of a quote, newest first. Each links to a read-only view of its snapshot. */
export function VersionHistory({ quoteId, versions, currentVersionId, activeNumber, currency, tz, names }: {
  quoteId: string;
  versions: VersionInfo[];
  currentVersionId: string | null;
  activeNumber?: number | null;
  currency: string;
  tz: string;
  names: Record<string, string>;
}) {
  return (
    <Card>
      <CardHeader title="Version history" subtitle="Published versions are locked and never change" />
      {versions.length === 0 ? (
        <p className="px-5 pb-5 text-[12.5px] text-ink-muted">Nothing published yet. When you publish, the customer gets version 1 and this draft stays private.</p>
      ) : (
        <ol className="divide-y divide-line border-t border-line">
          {versions.map((v) => {
            const s = QUOTE_STATUS[v.status];
            const active = activeNumber === v.version_number;
            return (
              <li key={v.id} className={cn("relative px-5 py-3 transition-colors hover:bg-zinc-50/70", active && "bg-brand-50/60")}>
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/quotes/${quoteId}?version=${v.version_number}`} scroll={false}
                    className="text-[13px] font-medium text-ink after:absolute after:inset-0 hover:text-brand-700">
                    Version {v.version_number}
                    {v.id === currentVersionId && <span className="ml-1.5 text-[11.5px] font-normal text-ink-faint">· customer’s copy</span>}
                  </Link>
                  <Badge tone={s.tone}>{s.label}</Badge>
                </div>
                <p className="tabular mt-0.5 text-[13px] text-ink">{money(v.total, currency)}</p>
                <ul className="mt-1 space-y-0.5 text-[12px] text-ink-muted">
                  <li>Sent {fmtDateTime(v.published_at, tz)}{v.published_by && names[v.published_by] ? ` by ${names[v.published_by]}` : ""}</li>
                  {v.viewed_at && <li>Viewed {fmtDateTime(v.viewed_at, tz)}</li>}
                  {v.status === "accepted" && (
                    <li className="text-emerald-700">
                      Accepted{v.accepted_by_name ? ` by ${v.accepted_by_name}` : ""} · {fmtDateTime(v.responded_at, tz)}
                      {v.acceptance_ip ? ` · IP ${v.acceptance_ip}` : ""}
                    </li>
                  )}
                  {v.status === "declined" && (
                    <li className="text-rose-700">Declined · {fmtDateTime(v.responded_at, tz)}{v.decline_reason ? ` — “${v.decline_reason}”` : ""}</li>
                  )}
                  {v.status !== "accepted" && v.status !== "declined" && v.responded_at && <li>Responded {fmtDateTime(v.responded_at, tz)}</li>}
                </ul>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
