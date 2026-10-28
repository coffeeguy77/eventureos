import Link from "next/link";
import { redirect } from "next/navigation";
import { canManage, requireOrg } from "@/lib/context";
import { readNerd } from "@/lib/nerdherd/core";
import { describeScope, readScope } from "@/lib/integrations/xero-scope";
import { Card, CardHeader } from "@/components/ui/card";
import { NerdSettingsForm } from "@/components/nerdherd/settings-form";

export const dynamic = "force-dynamic";

export default async function NerdSettingsPage() {
  const { supabase, org, role } = await requireOrg();
  if (!canManage(role)) redirect("/nerd-herd");
  const s = readNerd(org.settings);
  const [{ data: gmail }, { data: xero }] = await Promise.all([
    supabase.from("integrations").select("status, account_label").eq("organisation_id", org.id).eq("provider", "gmail").maybeSingle(),
    supabase.from("integrations").select("status, account_label, settings").eq("organisation_id", org.id).eq("provider", "xero").maybeSingle(),
  ]);
  const shared = !!(xero?.settings as { shared_from?: string } | null)?.shared_from;
  const scope = describeScope(readScope(xero?.settings));
  return (
    <div className="grid max-w-5xl gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title="Billing time and tickets" />
        <div className="border-t border-line px-5 py-4">
          <NerdSettingsForm initial={{ hourly_rate: s.hourlyRate, account_code: s.accountCode, email_tickets: s.emailTickets, support_email: s.supportEmail ?? "" }} />
        </div>
      </Card>
      <div className="space-y-5">
        <Card>
          <CardHeader title="Support inbox" />
          <div className="space-y-2 border-t border-line px-5 py-4 text-[0.8125rem] text-ink-muted">
            {gmail?.status === "connected"
              ? <p>Connected to <strong className="text-ink">{gmail.account_label}</strong>. {s.emailTickets ? "New emails from clients become tickets, and their replies are added to the ticket." : "Emails are not turned into tickets (switched off on the left)."}</p>
              : <p><strong className="text-ink">Not connected yet.</strong> Connect your support mailbox (e.g. {s.supportEmail ?? "hello@yourdomain"}) in <Link href="/settings/integrations" className="text-brand-600 underline">Settings → Integrations → Gmail</Link> and every new client email becomes a ticket.</p>}
            <p>Other mailboxes (another Google Workspace, Outlook, cPanel): forward them — or just the mail a filter picks — to your <Link href="/settings/email" className="text-brand-600 underline">forwarding address</Link>. Those emails open tickets too.</p>
          </div>
        </Card>
        <Card>
          <CardHeader title="Xero" />
          <div className="space-y-2 border-t border-line px-5 py-4 text-[0.8125rem] text-ink-muted">
            {xero?.status === "connected" ? <p>Connected to <strong className="text-ink">{xero.account_label}</strong>{shared ? " — shared with your other business (one Xero file, same ABN)" : ""}.</p> : <p><strong className="text-ink">Not connected.</strong> Invoices aren't sent to Xero and payments made there don't show here.</p>}
            {scope && <p>{scope}.</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}
