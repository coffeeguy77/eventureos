import { requireOrg } from "@/lib/context";
import { createServiceClient } from "@/lib/integrations/runtime";
import { readReconcile } from "@/lib/reconcile/core";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { ReconcileTool } from "@/components/accounts/reconcile";
import type { XeroBank } from "@/lib/reconcile/xero";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reconcile" };

/** Transfers between your own bank accounts, paired from a statement export and sent to Xero as ready-made matches. */
export default async function ReconcilePage() {
  const { org, role, user } = await requireOrg();
  const db = createServiceClient();
  const { data: integ } = await db.from("integrations").select("status, scopes, settings").eq("organisation_id", org.id).eq("provider", "xero").maybeSingle();
  const connected = !!integ && ["connected", "syncing", "error"].includes(integ.status as string);
  const { canTransfer } = await import("@/lib/reconcile/xero");
  // a business sharing another's Xero file uses the lender's connection (and its permissions)
  let scopes = (integ?.scopes ?? []) as string[];
  const lender = (integ?.settings as { shared_from?: string } | null)?.shared_from;
  if (lender) scopes = (((await db.from("integrations").select("scopes").eq("id", lender).maybeSingle()).data?.scopes ?? []) as string[]);
  let banks: XeroBank[] = [], bankError: string | null = null;
  if (connected) {
    try {
      const { buildContext } = await import("@/lib/integrations/sync-runner");
      const { xeroBankAccounts } = await import("@/lib/reconcile/xero");
      banks = await xeroBankAccounts(await buildContext(db, "service", org.id, "xero", user.id));
    } catch (e) { bankError = e instanceof Error ? e.message : "Couldn't read your Xero bank accounts."; }
  }
  return (
    <div>
      <PageHeader title="Reconcile" subtitle="Transfers between your own bank accounts, paired from your bank's export and sent to Xero — so each side is just “OK” in Xero." />
      {!connected ? <Card className="p-6 text-[0.875rem] text-ink-muted">Connect Xero first (Settings → Integrations → Xero).</Card>
        : <ReconcileTool banks={banks} bankError={bankError} canTransfer={canTransfer(scopes)} settings={readReconcile(org.settings)} canSend={role === "owner" || role === "admin"} />}
    </div>
  );
}
