import { requireOrg } from "@/lib/context";
import { createServiceClient } from "@/lib/integrations/runtime";
import { readReconcile } from "@/lib/reconcile/core";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { ReconcileTool } from "@/components/accounts/reconcile";
import type { XeroAccountLite, XeroBank, XeroTaxRate } from "@/lib/reconcile/xero";
import type { OpenInvoice } from "@/lib/reconcile/match";
import { sharedOrgIds } from "@/lib/reconcile/shared";

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
  let banks: XeroBank[] = [], bankError: string | null = null, accounts: XeroAccountLite[] = [], taxRates: XeroTaxRate[] = [];
  if (connected) {
    try {
      const { buildContext } = await import("@/lib/integrations/sync-runner");
      const { xeroAccountsAll, xeroTaxRates } = await import("@/lib/reconcile/xero");
      const ctx = await buildContext(db, "service", org.id, "xero", user.id);
      [accounts, taxRates] = await Promise.all([xeroAccountsAll(ctx), xeroTaxRates(ctx)]);
      // bank account numbers come with the bank-only listing
      const { xeroBankAccounts } = await import("@/lib/reconcile/xero");
      banks = await xeroBankAccounts(ctx);
    } catch (e) { bankError = e instanceof Error ? e.message : "Couldn't read your Xero accounts."; }
  }
  // open invoices in this Xero file (this business and any sharing it)
  const orgIds = await sharedOrgIds(db, org.id);
  const { data: inv } = await db.from("invoices").select("id, xero_invoice_id, number, balance, issue_date, due_date, organisation_id, customer:customers(name, company)")
    .in("organisation_id", orgIds).in("status", ["awaiting_payment", "overdue", "part_paid"]).gt("balance", 0).not("xero_invoice_id", "is", null).limit(3000);
  const invoices: OpenInvoice[] = ((inv ?? []) as unknown as { id: string; xero_invoice_id: string; number: string | null; balance: number; issue_date: string | null; due_date: string | null; organisation_id: string; customer: { name: string; company: string | null } | null }[])
    .filter((i) => i.issue_date).map((i) => ({ id: i.id, xeroId: i.xero_invoice_id, number: i.number, customer: i.customer?.name ?? "Customer", company: i.customer?.company ?? null, balance: Number(i.balance), issueDate: i.issue_date!, dueDate: i.due_date, org: i.organisation_id }));
  // Stripe: connected? and the clearing account EventureOS pays card payments into
  const { data: st } = await db.from("integrations").select("status, settings").eq("organisation_id", org.id).eq("provider", "stripe").maybeSingle();
  const stripeOn = st?.status === "connected";
  const clearingId = (st?.settings as { xero_account?: string } | null)?.xero_account ?? null;
  const cl = clearingId ? accounts.find((a) => a.id === clearingId || a.code === clearingId) : undefined;
  const clearing = cl ? { name: cl.name, code: cl.code, bank: cl.type === "BANK" } : null;
  return (
    <div>
      <PageHeader title="Reconcile" subtitle="Drop in your bank's export: transfers between your accounts, customer payments and Stripe payouts are matched and sent to Xero — so each bank line is just “OK” in Xero." />
      {!connected ? <Card className="p-6 text-[0.875rem] text-ink-muted">Connect Xero first (Settings → Integrations → Xero).</Card>
        : <ReconcileTool banks={banks} bankError={bankError} canTransfer={canTransfer(scopes)} settings={readReconcile(org.settings)} canSend={role === "owner" || role === "admin"}
          invoices={invoices} accounts={accounts} taxRates={taxRates} clearing={clearing} stripeOn={stripeOn} />}
    </div>
  );
}
