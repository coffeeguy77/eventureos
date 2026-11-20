import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/integrations/runtime";
import type { ReportData } from "@/lib/marketing/report";
import { ReportView } from "@/components/marketing/report-view";
import { AuditView } from "@/components/marketing/audit-view";
import type { AuditData } from "@/lib/marketing/audit";

export const dynamic = "force-dynamic";
export const metadata = { title: "Monthly report", robots: { index: false, follow: false } };

/** A client's monthly marketing report, opened from the private link the agency sends. */
export default async function PublicMarketingReport({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{36}$/.test(token)) notFound();
  const db = createServiceClient();
  const { data: r } = await db.from("mk_reports").select("data, commentary, organisation:organisations(name)").eq("token", token).maybeSingle();
  if (!r) notFound();
  const agency = (r.organisation as unknown as { name: string } | null)?.name ?? "";
  return (
    <main className="min-h-screen bg-canvas px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-4xl">
        {(r.data as { kind?: string }).kind === "audit" ? <AuditView d={r.data as AuditData} agency={agency} /> : <ReportView d={r.data as ReportData} commentary={r.commentary as string | null} agency={agency} />}
        <p className="mt-10 text-center text-[0.75rem] text-ink-faint">Prepared by {agency}. Figures from Google Ads, Google Analytics and Google Search Console.</p>
      </div>
    </main>
  );
}
