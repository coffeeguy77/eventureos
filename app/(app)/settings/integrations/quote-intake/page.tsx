import Link from "next/link";
import { requireOrg } from "@/lib/context";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { appBaseUrl } from "@/lib/integrations/registry";
import { fmtDateTime, relative } from "@/lib/format";
import type { Tone } from "@/lib/status";
import { CopyField } from "../stripe/copy-field";
import { NewConnection, RevokeButton } from "./controls";

export const metadata = { title: "Quote intake" };

const OUTCOME: Record<string, { label: string; tone: Tone }> = {
  created: { label: "New quote", tone: "green" },
  updated: { label: "Draft updated", tone: "blue" },
  duplicate: { label: "Already had it", tone: "neutral" },
  accepted: { label: "Accepted online", tone: "green" },
  review: { label: "Needs review", tone: "amber" },
  error: { label: "Failed", tone: "red" },
};

const SAMPLE = `{
  "external_id": "qs_8f2c…",          // your id for this quote (required)
  "external_version": 1,               // bump when the customer changes it
  "stage": "submitted",                // or "accepted"
  "source_label": "LeadPages",
  "customer": { "name": "Sam Lee", "email": "sam@example.com", "phone": "0400 000 000", "company": "" },
  "event": { "name": "", "type": "Wedding", "date": "2026-12-05", "start_time": "14:00", "end_time": "18:00",
             "guests": 120, "venue": "The Boathouse", "address": "1 Beach Rd, Sydney NSW" },
  "items": [
    { "section": "Coffee cart", "name": "Barista service", "description": "4 hours",
      "quantity": 4, "unit": "hours", "unit_price": 95.00, "tax_rate": 10 }
  ],
  "totals": { "subtotal": 380.00, "gst": 38.00, "total": 418.00 },
  "notes": "Oat milk please", "valid_until": "2026-10-31", "portal_url": "https://…", "accepted_by": null
}`;

export default async function QuoteIntakePage() {
  const { supabase, org, role } = await requireOrg();
  const allowed = role === "owner" || role === "admin";
  const endpoint = `${appBaseUrl()}/api/public/quote-intake`;

  const [connRes, delRes] = allowed ? await Promise.all([
    supabase.from("inbound_connections").select("id, provider, label, key_prefix, active, created_at, last_used_at, revoked_at")
      .eq("organisation_id", org.id).order("created_at", { ascending: false }),
    supabase.from("inbound_deliveries").select("id, connection_id, external_id, external_version, stage, outcome, message, quote_id, received_at, quote:quotes(number)")
      .eq("organisation_id", org.id).order("received_at", { ascending: false }).limit(25),
  ]) : [{ data: [] }, { data: [] }];
  const conns = (connRes.data ?? []) as { id: string; provider: string; label: string; key_prefix: string; active: boolean; created_at: string; last_used_at: string | null; revoked_at: string | null }[];
  const deliveries = (delRes.data ?? []) as unknown as { id: string; connection_id: string; external_id: string; external_version: number; stage: string; outcome: string; message: string | null; quote_id: string | null; received_at: string; quote: { number: number } | null }[];
  const labels = new Map(conns.map((c) => [c.id, c.label]));
  const live = conns.filter((c) => !c.revoked_at);
  const revoked = conns.filter((c) => c.revoked_at);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow={<Link href="/settings/integrations" className="hover:text-ink">Integrations</Link>} title="Quote intake"
        subtitle="Let your website's quote builder (such as a LeadPages quote form) send finished quotes straight into EventureOS. Each one creates or matches the customer and makes an enquiry, an event and a draft quote for you to check and send." />

      {!allowed ? (
        <Card className="p-5 text-[0.8125rem] text-ink-muted">Only owners and admins can manage quote intake connections.</Card>
      ) : (
        <div className="space-y-5">
          <Card>
            <CardHeader title="Connections" subtitle="One key per website or form. Keys are stored scrambled — you see each one only once." />
            <div className="space-y-4 border-t border-line px-4 py-5 sm:px-5">
              {live.length > 0 && (
                <ul className="divide-y divide-line rounded-xl ring-1 ring-inset ring-line">
                  {live.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3.5 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 text-[0.8125rem] font-medium text-ink">{c.label}<Badge tone="green" dot>Active</Badge></p>
                        <p className="text-[0.75rem] text-ink-muted"><code>{c.key_prefix}…</code> · created {fmtDateTime(c.created_at, org.timezone, "date")} · {c.last_used_at ? `last quote ${relative(c.last_used_at)}` : "no quotes yet"}</p>
                      </div>
                      <RevokeButton id={c.id} label={c.label} />
                    </li>
                  ))}
                </ul>
              )}
              <NewConnection />
              {revoked.length > 0 && <p className="text-[0.75rem] text-ink-faint">Revoked: {revoked.map((c) => `${c.label} (${c.key_prefix}…)`).join(", ")}</p>}
            </div>
          </Card>

          <Card>
            <CardHeader title="For your developer" subtitle="Send each quote from your server — never from the web page, or the key would be public." />
            <div className="space-y-3 border-t border-line px-4 py-5 text-[0.8125rem] sm:px-5">
              <div><p className="mb-1 text-[0.75rem] font-medium text-ink-muted">Endpoint (POST, JSON)</p><CopyField value={endpoint} /></div>
              <p className="text-ink-muted">Header: <code className="rounded bg-zinc-100 px-1 py-0.5 text-[0.75rem]">Authorization: Bearer &lt;connection key&gt;</code></p>
              <pre className="overflow-x-auto rounded-lg bg-zinc-950 p-3.5 text-[0.7188rem] leading-relaxed text-zinc-100">{SAMPLE}</pre>
              <ul className="list-disc space-y-1 pl-5 text-[0.75rem] text-ink-muted">
                <li>Prices are dollars <strong>excluding GST</strong>; <code>tax_rate</code> is 10 for GST or 0 for GST-free.</li>
                <li>Sending the same <code>external_id</code> again is safe. A higher <code>external_version</code> refreshes the draft; if you&apos;ve already sent the quote, you&apos;re asked to review it instead.</li>
                <li><code>stage: &quot;accepted&quot;</code> tells the team the customer accepted online. The booking is confirmed in EventureOS, so deposits and approvals still follow your rules.</li>
                <li>Replies are JSON: <code>{`{ ok, outcome, message, quote_number }`}</code>, or <code>{`{ ok: false, error }`}</code> with a 4xx/5xx status.</li>
              </ul>
            </div>
          </Card>

          <Card>
            <CardHeader title="Recent deliveries" subtitle="Every quote received, including ones that failed." />
            {deliveries.length === 0 ? (
              <p className="border-t border-line px-5 py-4 text-[0.8125rem] text-ink-muted">Nothing received yet.</p>
            ) : (
              <ul className="divide-y divide-line border-t border-line">
                {deliveries.map((d) => {
                  const o = OUTCOME[d.outcome] ?? { label: d.outcome, tone: "neutral" as Tone };
                  return (
                    <li key={d.id} className="px-4 py-3 sm:px-5">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <Badge tone={o.tone}>{d.stage === "accepted" && d.outcome !== "error" ? "Accepted online" : o.label}</Badge>
                        {d.quote_id && d.quote && <Link href={`/quotes/${d.quote_id}`} className="text-[0.8125rem] font-medium text-brand-700 hover:underline">Q-{d.quote.number}</Link>}
                        <span className="min-w-0 flex-1 truncate text-[0.75rem] text-ink-faint">{labels.get(d.connection_id)} · {d.external_id}{d.external_version > 1 ? ` v${d.external_version}` : ""}</span>
                        <span className="text-[0.7188rem] text-ink-faint" title={fmtDateTime(d.received_at, org.timezone)}>{relative(d.received_at)}</span>
                      </div>
                      {d.message && <p className={`mt-1 break-words text-[0.75rem] ${d.outcome === "error" ? "text-rose-700" : "text-ink-muted"}`}>{d.message}</p>}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
