import { canManage, requireOrg } from "@/lib/context";
import { fmtDateTime } from "@/lib/format";
import { Card, CardHeader } from "@/components/ui/card";
import { AiJobForm, AiJobList, type AiJobRow, type AiSite } from "@/components/nerdherd/ai-maintenance";
import { readAiSettings } from "@/lib/nerdherd/ai-runner";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type JobQ = { id: string; number: number; kind: string; request: string | null; billable: boolean; source: string; status: string; stage_note: string | null; report_summary: string | null; changes: unknown; created_at: string; invoice_id: string | null; websites: { domain: string; customers: { name: string } | null } | null };

/** Nerd Herd → AI maintenance: brief Claude on a connected site, run quick updates, follow every job. */
export default async function AiMaintenancePage({ searchParams }: { searchParams: Promise<{ site?: string; ticket?: string }> }) {
  const sp = await searchParams;
  const { supabase, org, role } = await requireOrg();
  const [{ data: conns, error }, { data: jobs }] = await Promise.all([
    supabase.from("website_connectors").select("website_id, connector_version, updates_core, updates_plugins, updates_themes, websites(domain, customers(name))").eq("organisation_id", org.id).limit(2000),
    supabase.from("nh_ai_jobs").select("id, number, kind, request, billable, source, status, stage_note, report_summary, changes, created_at, invoice_id, websites(domain, customers(name))").eq("organisation_id", org.id).order("created_at", { ascending: false }).limit(60),
  ]);
  if (error) throw new Error(`Couldn't load connected sites: ${error.message}`);
  const sites: AiSite[] = ((conns ?? []) as unknown as { website_id: string; connector_version: string | null; updates_core: number; updates_plugins: number; updates_themes: number; websites: { domain: string; customers: { name: string } | null } | null }[])
    .filter((c) => c.websites)
    .map((c) => ({ id: c.website_id, domain: c.websites!.domain, client: c.websites!.customers?.name ?? null, version: c.connector_version, updates: (c.updates_core ?? 0) + (c.updates_plugins ?? 0) + (c.updates_themes ?? 0) }))
    .sort((a, b) => a.domain.localeCompare(b.domain));
  const rows: AiJobRow[] = ((jobs ?? []) as unknown as JobQ[]).map((j) => ({
    id: j.id, number: j.number, domain: j.websites?.domain ?? "—", client: j.websites?.customers?.name ?? null, kind: j.kind, request: j.request, billable: j.billable, source: j.source,
    status: j.status, stage_note: j.stage_note, report_summary: j.report_summary, changes: Array.isArray(j.changes) ? j.changes.length : 0, when: fmtDateTime(j.created_at, org.timezone), invoice_id: j.invoice_id,
  }));
  const ai = readAiSettings(org.settings);
  const start = new Date(); start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0);
  const { data: spend } = await supabase.from("nh_ai_jobs").select("cost_usd").eq("organisation_id", org.id).gte("created_at", start.toISOString());
  const used = (spend ?? []).reduce((s, r) => s + Number(r.cost_usd || 0), 0);
  const budgetNote = `AI spend this month US$${used.toFixed(2)} of US$${ai.monthlyCapUsd.toFixed(0)}`;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card>
        <CardHeader title="AI maintenance" subtitle="Claude makes the changes on the site through the Web Culture Connector — backup first, every change logged and undoable." />
        <div className="border-t border-line px-5 py-4">
          {canManage(role) ? <AiJobForm sites={sites} preselect={sp.site ?? null} ticketId={sp.ticket ?? null} budgetNote={budgetNote} />
            : <p className="text-[0.8125rem] text-ink-muted">Ask an owner, admin or manager to start AI maintenance jobs.</p>}
        </div>
      </Card>
      <Card className="overflow-hidden">
        <CardHeader title="Jobs" subtitle="Newest first — open one for its report, backup, undo and invoice" />
        <div className="border-t border-line"><AiJobList rows={rows} /></div>
      </Card>
    </div>
  );
}
