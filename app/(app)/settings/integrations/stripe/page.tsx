import Link from "next/link";
import { CheckCircle2, ExternalLink } from "lucide-react";
import { canManage, requireOrg } from "@/lib/context";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { Input, Label } from "@/components/ui/form";
import { appBaseUrl } from "@/lib/integrations/registry";
import { buildContext } from "@/lib/integrations/sync-runner";
import { xeroGet } from "@/lib/integrations/xero";
import { ActionForm, SubmitButton } from "../../forms";
import { connectStripe, disconnectStripe, saveStripeXeroAccount } from "./actions";
import { CopyField } from "./copy-field";

export const metadata = { title: "Stripe" };

type XeroAccount = { AccountID: string; Code?: string; Name: string; Type: string; Status: string; EnablePaymentsToAccount?: boolean };

export default async function StripePage() {
  const { supabase, org, role, user } = await requireOrg();
  const manager = canManage(role);
  const { data: integ } = await supabase.from("integrations").select("id, status, account_label, settings, connected_at").eq("organisation_id", org.id).eq("provider", "stripe").maybeSingle();
  const connected = integ?.status === "connected";
  const settings = (integ?.settings ?? {}) as { mode?: string; xero_account?: string | null };
  const webhookUrl = `${appBaseUrl()}/api/stripe/webhook/${org.id}`;

  // Xero bank accounts (needs the newer Xero permissions — falls back to typing a code)
  let xeroAccounts: XeroAccount[] | null = null;
  let xeroNote: string | null = null;
  const { data: xi } = await supabase.from("integrations").select("status").eq("organisation_id", org.id).eq("provider", "xero").maybeSingle();
  if (connected && xi && ["connected", "syncing", "error"].includes(xi.status as string)) {
    try {
      const ctx = await buildContext(supabase, "user", org.id, "xero", user.id);
      const res = await xeroGet<{ Accounts: XeroAccount[] }>(ctx, "/Accounts");
      xeroAccounts = res.Accounts.filter((a) => a.Status === "ACTIVE" && (a.Type === "BANK" || a.EnablePaymentsToAccount));
    } catch {
      xeroNote = "To pick from your Xero accounts, reconnect Xero (Settings → Integrations → Reconnect to allow new features). Until then, type the account code.";
    }
  } else if (connected) xeroNote = "Xero isn't connected — card payments are recorded in EventureOS only.";

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow={<Link href="/settings/integrations" className="hover:text-ink">Integrations</Link>} title="Stripe card payments"
        subtitle="Customers pay invoices by card from a link or their portal. The money goes to your own Stripe account; Xero stays your books." />

      <Card>
        <CardHeader title="1. Connect your Stripe account" action={connected ? <Badge tone={settings.mode === "test" ? "amber" : "green"} dot>{settings.mode === "test" ? "Test mode" : "Connected"}</Badge> : undefined} />
        <div className="space-y-4 border-t border-line px-4 py-5 text-[0.8125rem] sm:px-5">
          {connected && <p className="flex items-center gap-2 text-ink"><CheckCircle2 className="h-4 w-4 text-emerald-600" />{integ?.account_label}</p>}
          <ol className="list-decimal space-y-2 pl-5 text-ink-muted">
            <li>In Stripe, go to <strong className="text-ink">Developers → Webhooks → Add endpoint</strong>. Paste this URL and choose the event <strong className="text-ink">checkout.session.completed</strong>:
              <div className="mt-1.5"><CopyField value={webhookUrl} /></div></li>
            <li>Open the new webhook and copy its <strong className="text-ink">Signing secret</strong> (starts with <code>whsec_</code>).</li>
            <li>Go to <strong className="text-ink">Developers → API keys</strong> and copy the <strong className="text-ink">Secret key</strong> (starts with <code>sk_live_</code>). A restricted key (<code>rk_live_</code>) works too if it can write Checkout Sessions and read the account.</li>
          </ol>
          {manager ? (
            <ActionForm action={connectStripe} resetOnOk>
              <div className="grid gap-4 sm:grid-cols-2">
                <div><Label htmlFor="secret_key">Secret key</Label><Input id="secret_key" name="secret_key" type="password" autoComplete="off" placeholder="sk_live_…" required /></div>
                <div><Label htmlFor="webhook_secret">Webhook signing secret</Label><Input id="webhook_secret" name="webhook_secret" type="password" autoComplete="off" placeholder="whsec_…" required /></div>
              </div>
              <p className="mt-2 text-[0.75rem] text-ink-faint">Keys are kept server-side where no screen or user can read them back. Use test keys (sk_test_) first if you want to try it.</p>
              <div className="mt-4 flex justify-end"><SubmitButton pendingLabel="Checking with Stripe…">{connected ? "Replace keys" : "Connect Stripe"}</SubmitButton></div>
            </ActionForm>
          ) : <p className="text-ink-faint">Only owners, admins and managers can connect Stripe.</p>}
        </div>
      </Card>

      {connected && (
        <Card className="mt-5">
          <CardHeader title="2. Record card payments in Xero" subtitle="For invoices that live in Xero, each card payment is added to Xero straight away, against this account." />
          <div className="space-y-3 border-t border-line px-4 py-5 text-[0.8125rem] sm:px-5">
            <p className="text-ink-muted">
              Use a <strong className="text-ink">Stripe clearing account</strong> — a bank account in Xero called “Stripe”. Payments land there; when Stripe pays out,
              reconcile the payout in your real bank as a transfer from Stripe, and Stripe’s fees as a bank fee. If you use Xero’s own Stripe connection, pick the account it created.
            </p>
            {xeroNote && <p className="rounded-lg bg-amber-50 px-3 py-2 text-[0.75rem] text-amber-800 ring-1 ring-inset ring-amber-100">{xeroNote}</p>}
            {manager && (
              <ActionForm action={saveStripeXeroAccount}>
                <Label htmlFor="xero_account">Xero account for Stripe payments</Label>
                {xeroAccounts ? (
                  <select id="xero_account" name="xero_account" defaultValue={settings.xero_account ?? ""} className="mt-1 block w-full rounded-lg border-0 bg-surface px-3 py-2 text-[0.8125rem] text-ink ring-1 ring-inset ring-line-strong">
                    <option value="">Don’t send card payments to Xero</option>
                    {xeroAccounts.map((a) => <option key={a.AccountID} value={a.AccountID}>{a.Name}{a.Code ? ` (${a.Code})` : ""}{a.Type === "BANK" ? " · bank" : ""}</option>)}
                  </select>
                ) : (
                  <Input id="xero_account" name="xero_account" defaultValue={settings.xero_account ?? ""} placeholder="Account code, e.g. 090" />
                )}
                <div className="mt-3 flex justify-end"><SubmitButton size="sm">Save</SubmitButton></div>
              </ActionForm>
            )}
          </div>
        </Card>
      )}

      {connected && (
        <Card className="mt-5">
          <CardHeader title="3. How customers pay" />
          <ul className="space-y-2 border-t border-line px-4 py-5 text-[0.8125rem] text-ink-muted sm:px-5">
            <li>• Every invoice has a <strong className="text-ink">payment link</strong> — copy it from the invoice page and send it however you like. No login needed.</li>
            <li>• Customers with a portal login see <strong className="text-ink">Pay by card</strong> next to each unpaid invoice.</li>
            <li>• When they pay, the invoice is marked paid, you get a notification, and (for Xero invoices) the payment is added to Xero.</li>
            <li className="flex items-center gap-1.5"><ExternalLink className="h-3.5 w-3.5" /><a className="text-brand-700 underline" href="https://dashboard.stripe.com/payments" target="_blank" rel="noreferrer">Stripe dashboard</a> for refunds and payouts.</li>
          </ul>
          {manager && (
            <div className="border-t border-line px-4 py-4 sm:px-5">
              <ActionForm action={disconnectStripe}><SubmitButton variant="danger" size="sm" pendingLabel="Disconnecting…">Disconnect Stripe</SubmitButton></ActionForm>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
