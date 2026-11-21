import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { requireOrg } from "@/lib/context";
import { Card, EmptyState } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { listConnections, loadReport } from "@/lib/marketing/server";
import { serviceAccountEmail } from "@/lib/marketing/ga4";
import { MarketingReportView } from "@/components/marketing/report";
import { AddClientForm, RemoveClient } from "@/components/marketing/client-form";

export const dynamic = "force-dynamic";

const DAY_OPTIONS = [7, 28, 90];

const chip = (active: boolean) =>
  cn("rounded-full border px-3 py-1 text-[0.75rem] font-medium transition-colors", active ? "border-brand-300 bg-brand-50 text-brand-800" : "border-line bg-surface text-ink-muted hover:text-ink");

export default async function MarketingOverview({ searchParams }: { searchParams: Promise<{ client?: string; days?: string }> }) {
  const sp = await searchParams;
  const { supabase, org } = await requireOrg();
  const clients = await listConnections(supabase, org.id);

  if (!clients.length) {
    return (
      <Card>
        <EmptyState title="No clients yet" action={<AddClientForm />}>
          Add a client and their GA4 Property ID to pull live sales, revenue and traffic into one report. The Setup tab shows the one-time Google step.
        </EmptyState>
      </Card>
    );
  }

  const selected = clients.find((c) => c.id === sp.client) ?? clients[0];
  const days = DAY_OPTIONS.includes(Number(sp.days)) ? Number(sp.days) : 28;
  const result = await loadReport(selected.ga4_property_id, days);

  return (
    <div className="space-y-5">
      {clients.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          {clients.map((c) => (
            <Link key={c.id} href={`/marketing?client=${c.id}&days=${days}`} className={chip(c.id === selected.id)}>{c.label}</Link>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[1.0625rem] font-semibold text-ink">{selected.label}</h2>
          <p className="text-[0.75rem] text-ink-faint">Google Analytics property {selected.ga4_property_id}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {DAY_OPTIONS.map((d) => (
            <Link key={d} href={`/marketing?client=${selected.id}&days=${d}`} className={chip(d === days)}>{d} days</Link>
          ))}
          <RemoveClient id={selected.id} label={selected.label} />
        </div>
      </div>

      {result.ok ? (
        <MarketingReportView report={result.report} currency={selected.currency} days={days} />
      ) : result.reason === "no-credentials" ? (
        <Card>
          <EmptyState title="Google isn't connected yet" action={<Link href="/marketing/settings" className="text-[0.8125rem] font-medium text-brand-600">Open Setup →</Link>}>
            Add the Google service-account key once (Setup tab) and every client&apos;s figures appear here. Nothing is made up until it&apos;s connected.
          </EmptyState>
        </Card>
      ) : result.reason === "no-access" ? (
        <Card>
          <EmptyState title="Can't read this property yet">
            Google Analytics is connected, but this property hasn&apos;t shared access. In GA4 → Admin → Property access management, add{" "}
            <span className="font-mono text-ink">{serviceAccountEmail() ?? "the service account"}</span> as a <strong>Viewer</strong>, then refresh. Also check the Property ID ({selected.ga4_property_id}) is right.
          </EmptyState>
        </Card>
      ) : (
        <Card>
          <EmptyState title="Couldn't load this report">{result.message}</EmptyState>
        </Card>
      )}

      {clients.length === 1 && (
        <div className="flex items-center gap-3 pt-1">
          <AddClientForm />
          <a href="https://analytics.google.com/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[0.75rem] text-ink-faint hover:text-ink-muted">
            Open Google Analytics <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}
    </div>
  );
}
