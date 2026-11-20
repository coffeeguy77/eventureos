import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/context";
import { appBaseUrl } from "@/lib/integrations/registry";
import type { ReportData } from "@/lib/marketing/report";
import { Card, CardHeader } from "@/components/ui/card";
import { CommentaryEditor, ShareReport } from "@/components/marketing/controls";
import { ReportView } from "@/components/marketing/report-view";

export const dynamic = "force-dynamic";

export default async function MarketingReportStaff({ params }: { params: Promise<{ id: string; reportId: string }> }) {
  const { id, reportId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[0-9a-f-]{36}$/i.test(reportId)) notFound();
  const { supabase, org } = await requireOrg();
  const { data: r } = await supabase.from("mk_reports").select("id, data, commentary, status, token, account:mk_accounts(name, report_to)").eq("id", reportId).eq("account_id", id).eq("organisation_id", org.id).maybeSingle();
  if (!r) notFound();
  const d = r.data as ReportData;
  const acct = r.account as unknown as { name: string; report_to: string[] } | null;
  const url = `${appBaseUrl()}/marketing-report/${r.token}`;
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="text-[0.75rem] text-ink-faint"><Link href="/marketing" className="hover:text-ink">Marketing</Link> / <Link href={`/marketing/${id}`} className="hover:text-ink">{acct?.name ?? "Client"}</Link> / {d.period.label}</div>
      <Card>
        <CardHeader title="Send to the client" subtitle="They open a private link — no login." />
        <div className="px-5 pb-5"><ShareReport reportId={reportId} url={url} to={acct?.report_to ?? []} subject={`${d.client} — ${d.period.label} report`} sent={r.status === "sent"} /></div>
      </Card>
      <Card>
        <CardHeader title="Commentary" subtitle="Written by AI from the figures — edit before sending" />
        <div className="px-5 pb-5"><CommentaryEditor reportId={reportId} initial={(r.commentary as string | null) ?? ""} /></div>
      </Card>
      <ReportView d={d} commentary={r.commentary as string | null} agency={org.name} />
    </div>
  );
}
