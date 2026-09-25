import { createClient } from "@/lib/supabase/server";
import { Card, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { fmtDateTime, relative } from "@/lib/format";
import type { Tone } from "@/lib/status";

export const metadata = { title: "Support audit" };

const TZ = "Australia/Sydney";

type AuditRow = {
  id: string; created_at: string; organisation_id: string; organisation_name: string; actor_name: string | null;
  actor_email: string | null; action: string; summary: string; metadata: Record<string, unknown> | null;
};

function kind(action: string): { label: string; tone: Tone } {
  if (action === "support.session_started") return { label: "Session started", tone: "amber" };
  if (action === "support.session_ended") return { label: "Session ended", tone: "slate" };
  if (action.startsWith("platform.")) return { label: "Platform change", tone: "brand" };
  return { label: "Action in org", tone: "blue" };
}

export default async function SupportAudit() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_support_audit", { p_limit: 300 });
  if (error) throw new Error(`Could not load the support audit: ${error.message}`);
  const rows = (data ?? []) as AuditRow[];

  return (
    <>
      <PageHeader
        title="Support audit"
        subtitle="Every support session, platform change and action taken by EventureOS staff inside a customer's organisation (latest 300). Customers see the same entries in their own activity log."
      />
      <Card>
        {rows.length === 0 ? (
          <EmptyState title="No support activity yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-[11.5px] uppercase tracking-wide text-ink-faint">
                  <th className="px-5 py-2.5 font-medium">When (Sydney)</th>
                  <th className="px-3 py-2.5 font-medium">Organisation</th>
                  <th className="px-3 py-2.5 font-medium">Who</th>
                  <th className="px-3 py-2.5 font-medium">Type</th>
                  <th className="px-5 py-2.5 font-medium">What happened</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => {
                  const k = kind(r.action);
                  const until = typeof r.metadata?.until === "string" ? r.metadata.until : null;
                  return (
                    <tr key={r.id} className="align-top">
                      <td className="whitespace-nowrap px-5 py-2.5 text-ink-muted" title={relative(r.created_at)}>{fmtDateTime(r.created_at, TZ)}</td>
                      <td className="px-3 py-2.5 font-medium text-ink">{r.organisation_name}</td>
                      <td className="px-3 py-2.5 text-ink-muted">{r.actor_name ?? r.actor_email ?? "—"}</td>
                      <td className="px-3 py-2.5"><Badge tone={k.tone}>{k.label}</Badge></td>
                      <td className="px-5 py-2.5 text-ink">
                        {r.summary}
                        {until && <span className="text-ink-muted"> · until {fmtDateTime(until, TZ, "time")}</span>}
                        <div className="font-mono text-[11px] text-ink-faint">{r.action}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
