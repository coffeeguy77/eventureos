import { redirect } from "next/navigation";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { canManage, requireOrg } from "@/lib/context";
import { Card, CardHeader } from "@/components/ui/card";
import { ga4Configured, serviceAccountEmail } from "@/lib/marketing/ga4";

export const dynamic = "force-dynamic";

/** A malformed key should show a message, not crash the page. */
function safeEmail(): { email: string | null; error: string | null } {
  try {
    return { email: serviceAccountEmail(), error: null };
  } catch (e) {
    return { email: null, error: e instanceof Error ? e.message : String(e) };
  }
}

export default async function MarketingSetup() {
  const { role } = await requireOrg();
  if (!canManage(role)) redirect("/marketing");

  const configured = ga4Configured();
  const { email, error } = configured ? safeEmail() : { email: null, error: null };

  return (
    <div className="max-w-3xl space-y-5">
      <Card className="p-4">
        <div className="flex items-start gap-3">
          {configured && !error ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /> : <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />}
          <div className="min-w-0">
            <h3 className="text-[0.875rem] font-semibold text-ink">{configured && !error ? "Google Analytics is connected" : "Google Analytics isn't connected yet"}</h3>
            {configured && !error && email && (
              <p className="mt-1 text-[0.8125rem] text-ink-muted">
                Reading as <span className="rounded bg-canvas px-1.5 py-0.5 font-mono text-[0.75rem] text-ink">{email}</span>. Add this address as a <strong>Viewer</strong> on each client&apos;s GA4 property.
              </p>
            )}
            {error && <p className="mt-1 text-[0.8125rem] text-rose-700">{error}</p>}
            {!configured && <p className="mt-1 text-[0.8125rem] text-ink-muted">Follow the steps below once. It&apos;s free and read-only — no Google Ads spend or billing involved.</p>}
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="One-time setup" subtitle="Done once in your Google account — then every client is just their Property ID." />
        <ol className="list-decimal space-y-3 border-t border-line px-7 py-4 text-[0.8125rem] text-ink-muted marker:text-ink-faint">
          <li>In <strong>Google Cloud Console</strong> (the Bean Culture account), create a <strong>Service account</strong> and download its <strong>JSON key</strong>.</li>
          <li>Enable the <strong>Google Analytics Data API</strong> for that project (APIs &amp; Services → Enable APIs). It has a free quota — no billing is charged for reporting reads.</li>
          <li>In <strong>Vercel</strong> → EventureOS → Settings → Environment Variables, add <span className="font-mono text-ink">GA4_SERVICE_ACCOUNT_JSON</span> (mark it Sensitive) and paste the whole key file as its value. Redeploy.</li>
          <li>For each client, open <strong>GA4 → Admin → Property access management</strong>, add the service-account email as a <strong>Viewer</strong>, and copy the <strong>Property ID</strong> (Admin → Property details — a number like 393878887).</li>
          <li>Back here on the Overview tab, add the client with that Property ID. Their figures appear within a minute.</li>
        </ol>
      </Card>

      <p className="text-[0.75rem] text-ink-faint">
        GA4 gives website traffic and sales (including which share comes from Google Ads). Ad spend, cost-per-sale and keywords come from the Google Ads API — a later add-on to this module.
      </p>
    </div>
  );
}
