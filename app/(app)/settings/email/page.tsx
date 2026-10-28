import { redirect } from "next/navigation";
import { canManage, requireOrg } from "@/lib/context";
import { fmtDateTime } from "@/lib/format";
import { PROVIDER, type ForwardSettings } from "@/lib/email/inbound";
import { readEmailDomain } from "@/lib/email/domains";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DomainSetup, ForwardingTools, ReplyToForm } from "./tools";

export const dynamic = "force-dynamic";
export const metadata = { title: "Email" };

/** Email without connecting a mailbox: a forwarding address in, and the business's own domain out. */
export default async function EmailSettingsPage() {
  const { supabase, org, role } = await requireOrg();
  if (!canManage(role)) redirect("/settings");
  const [{ data: fwd }, { data: gmail }, { data: o }, { data: setup }] = await Promise.all([
    supabase.from("integrations").select("id, status, account_label, settings, last_sync_at").eq("organisation_id", org.id).eq("provider", PROVIDER).maybeSingle(),
    supabase.from("integrations").select("status, account_label").eq("organisation_id", org.id).eq("provider", "gmail").maybeSingle(),
    supabase.from("organisations").select("settings, contact_email, name").eq("id", org.id).single(),
    supabase.from("platform_settings").select("value").eq("key", "inbound_email").maybeSingle(),
  ]);
  const fs = (fwd?.settings ?? {}) as ForwardSettings;
  const domain = readEmailDomain(o?.settings);
  const replyTo = ((o?.settings ?? {}) as { reply_to?: string }).reply_to ?? "";
  const inbound = (setup?.value ?? null) as { ok?: boolean; error?: string | null; receiving?: string } | null;
  const receivingReady = !!inbound?.ok;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Your forwarding address" subtitle="Forward email here from any mailbox — Gmail, Outlook, cPanel — and it's read like a connected Gmail: new enquiries, client emails onto their record, support tickets in Nerd Herd. No password or Google sign-in needed." />
        <div className="space-y-4 border-t border-line px-5 py-4">
          {!receivingReady && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-[0.7812rem] text-amber-900 ring-1 ring-inset ring-amber-200">
              EventureOS is still switching on receiving for its email domain{inbound?.error ? ` (${inbound.error})` : ""}. You can set up your forwarding now — mail starts arriving as soon as that's done.
            </p>
          )}
          <ForwardingTools address={fwd?.account_label ?? null} on={fwd?.status === "connected"} />
          {fwd?.account_label && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg bg-canvas p-4 text-[0.8125rem] text-ink-muted">
                <p className="font-medium text-ink">Gmail / Google Workspace</p>
                <ol className="mt-2 list-decimal space-y-1 pl-4">
                  <li>In Gmail: Settings (cog) → See all settings → <strong>Forwarding and POP/IMAP</strong> → <strong>Add a forwarding address</strong> → paste the address above.</li>
                  <li>Google emails a confirmation code to the address — it appears below within a minute. Enter it in Gmail and click Verify.</li>
                  <li>To forward only some mail (recommended): Settings → <strong>Filters and blocked addresses</strong> → Create a new filter (e.g. To: support@ or website enquiries, or from clients) → <strong>Forward it to</strong> the address above. Leave the main forwarding switch off.</li>
                  <li>Or forward everything: choose “Forward a copy of incoming mail to” the address.</li>
                </ol>
              </div>
              <div className="rounded-lg bg-canvas p-4 text-[0.8125rem] text-ink-muted">
                <p className="font-medium text-ink">Outlook / Microsoft 365, cPanel and others</p>
                <ul className="mt-2 list-disc space-y-1 pl-4">
                  <li>Outlook: Settings → Mail → <strong>Rules</strong> → Add new rule → condition (e.g. sent to support@) → <strong>Forward to</strong> the address above. (Your Microsoft admin may need to allow forwarding to outside addresses.)</li>
                  <li>cPanel email: Email → <strong>Forwarders</strong> → Add forwarder for the mailbox (or a filter in Email Filters with “Redirect to email”).</li>
                  <li>Website forms: set the form to email the address above directly.</li>
                </ul>
                <p className="mt-2">Mail from your own team and blocked senders is ignored; spam is filed as spam.</p>
              </div>
            </div>
          )}
          {(fs.confirmations?.length ?? 0) > 0 && (
            <div>
              <p className="text-[0.75rem] font-semibold uppercase tracking-wide text-ink-faint">Forwarding confirmations</p>
              <ul className="mt-2 divide-y divide-line rounded-lg ring-1 ring-line">
                {fs.confirmations!.map((c, k) => (
                  <li key={k} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[0.8125rem]">
                    <span className="min-w-0">{c.to ?? c.from} · {fmtDateTime(c.at, org.timezone)}</span>
                    <span className="flex items-center gap-2">
                      {c.code && <span className="rounded bg-ink px-2 py-0.5 font-mono text-[0.875rem] text-surface">{c.code}</span>}
                      {c.link && <a href={c.link} target="_blank" rel="noreferrer" className="font-medium text-brand-600 underline">Confirm link</a>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(fs.recent?.length ?? 0) > 0 && (
            <div>
              <p className="text-[0.75rem] font-semibold uppercase tracking-wide text-ink-faint">Recently received</p>
              <ul className="mt-2 divide-y divide-line rounded-lg ring-1 ring-line">
                {fs.recent!.slice(0, 12).map((r, k) => (
                  <li key={k} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[0.8125rem]">
                    <span className="min-w-0 truncate"><span className="text-ink">{r.subject ?? "(no subject)"}</span> <span className="text-ink-faint">· {r.from} · {fmtDateTime(r.at, org.timezone)}</span></span>
                    <span className="flex items-center gap-2">{r.detail && <span className="text-[0.7188rem] text-ink-muted">{r.detail}</span>}<Badge tone={r.outcome === "processed" ? "green" : r.outcome === "confirmation" ? "brand" : "neutral"}>{r.outcome}</Badge></span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {gmail?.status === "connected" && <p className="text-[0.75rem] text-ink-muted">Gmail ({gmail.account_label}) is also connected — both feed the same inbox.</p>}
        </div>
      </Card>

      <Card>
        <CardHeader title="Send from your own domain" subtitle="Quotes, invoices, reminders and replies come from your address (e.g. hello@yourdomain.com.au) — nothing says EventureOS. Add a few DNS records once; each one gets a tick when it's found." />
        <div className="border-t border-line px-5 py-4">
          <DomainSetup domain={domain} businessName={o?.name ?? org.name} tz={org.timezone} />
        </div>
      </Card>

      <Card>
        <CardHeader title="Replies" subtitle="Without your own domain, emails come from EventureOS's address with your business name — replies go here." />
        <div className="border-t border-line px-5 py-4"><ReplyToForm initial={replyTo} fallback={o?.contact_email ?? null} /></div>
      </Card>
    </div>
  );
}
