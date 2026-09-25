import Link from "next/link";
import { headers } from "next/headers";
import { RefreshCw } from "lucide-react";
import { requireOrg } from "@/lib/context";
import { Card, CardHeader } from "@/components/ui/card";
import { relative } from "@/lib/format";
import { ActionButton, CopyButton } from "../forms";
import { regenerateFormKey } from "../actions";

export const metadata = { title: "Website enquiry form" };

const FIELDS: [string, string][] = [
  ["name", "Contact name (name or email is required)"],
  ["email", "Email address"],
  ["phone", "Phone"],
  ["company", "Company"],
  ["event_type", "Event type, e.g. Wedding"],
  ["event_date", "Event date (YYYY-MM-DD)"],
  ["guests", "Guest count"],
  ["budget", "Budget"],
  ["venue", "Venue or suburb"],
  ["message", "Message"],
  ["title", "Optional enquiry title"],
];

function Code({ children }: { children: string }) {
  return (
    <pre className="max-h-[420px] overflow-auto rounded-lg bg-zinc-950 p-4 font-mono text-[12px] leading-relaxed text-zinc-100">
      <code>{children}</code>
    </pre>
  );
}

export default async function WebsiteFormPage() {
  const { supabase, org, role } = await requireOrg();
  const canRegenerate = role === "owner" || role === "admin";

  const [orgRes, lastRes, weekRes] = await Promise.all([
    supabase.from("organisations").select("slug, public_form_key").eq("id", org.id).single(),
    supabase.from("enquiries").select("id, number, contact_name, received_at").eq("organisation_id", org.id).eq("source", "website")
      .order("received_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("enquiries").select("id", { count: "exact", head: true }).eq("organisation_id", org.id).eq("source", "website")
      .gte("received_at", new Date(Date.now() - 30 * 86400000).toISOString()),
  ]);
  if (orgRes.error) throw new Error(`Could not load form settings: ${orgRes.error.message}`);

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "app.eventureos.com";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;
  const endpoint = `${origin}/api/public/enquiry/${orgRes.data.slug}`;
  const key = orgRes.data.public_form_key as string;

  const html = `<form action="${endpoint}" method="POST">
  <input type="hidden" name="key" value="${key}">

  <label>Your name <input name="name" required></label>
  <label>Email <input name="email" type="email" required></label>
  <label>Phone <input name="phone" type="tel"></label>
  <label>Event type
    <select name="event_type">
      <option>Wedding</option>
      <option>Corporate</option>
      <option>Birthday</option>
      <option>Other</option>
    </select>
  </label>
  <label>Event date <input name="event_date" type="date"></label>
  <label>Number of guests <input name="guests" type="number" min="1"></label>
  <label>Venue or suburb <input name="venue"></label>
  <label>Tell us about your event <textarea name="message"></textarea></label>

  <button type="submit">Send enquiry</button>
</form>`;

  const js = `await fetch("${endpoint}", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    key: "${key}",
    name: "Emma Smith",
    email: "emma@example.com",
    phone: "0400 000 000",
    event_type: "Wedding",
    event_date: "2027-03-14",
    guests: 120,
    venue: "Canberra",
    message: "Hi! We'd love a coffee cart for our wedding.",
  }),
});`;

  return (
    <>
      <Card>
        <CardHeader
          title="Website enquiry form"
          subtitle="Send enquiries from your own website straight into EventureOS. They appear under Enquiries with the source “Website”."
        />
        <div className="space-y-5 border-t border-line px-5 py-5">
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <span className="text-[12.5px] font-medium text-ink">Form endpoint</span>
              <CopyButton text={endpoint} />
            </div>
            <div className="overflow-x-auto rounded-lg border border-line bg-canvas px-3 py-2 font-mono text-[12.5px] text-ink">
              <span className="mr-2 font-semibold text-brand-700">POST</span>{endpoint}
            </div>
          </div>
          <div>
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-3">
              <span className="text-[12.5px] font-medium text-ink">Form key</span>
              <div className="flex items-center gap-2">
                <CopyButton text={key} />
                {canRegenerate && (
                  <ActionButton
                    action={regenerateFormKey}
                    variant="danger"
                    confirm="Regenerate the form key? Your current website form stops working until you paste in the new key."
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Regenerate
                  </ActionButton>
                )}
              </div>
            </div>
            <div className="overflow-x-auto rounded-lg border border-line bg-canvas px-3 py-2 font-mono text-[12.5px] text-ink">{key}</div>
            <p className="mt-1.5 text-[12px] text-ink-muted">
              The key sits in your website’s HTML, so it isn’t a secret — it just stops random sites posting into your account.
              If you start getting spam, regenerate it and update your website.{!canRegenerate && " Only owners and admins can regenerate it."}
            </p>
          </div>
          <div className="rounded-lg bg-zinc-50 px-3 py-2 text-[12.5px] text-ink-muted ring-1 ring-inset ring-line">
            {lastRes.data ? (
              <>Last website enquiry: <Link href={`/enquiries/${lastRes.data.id}`} className="font-medium text-brand-600 hover:text-brand-700">ENQ-{lastRes.data.number}{lastRes.data.contact_name ? ` from ${lastRes.data.contact_name}` : ""}</Link>, {relative(lastRes.data.received_at)} · {weekRes.count ?? 0} in the last 30 days.</>
            ) : (
              <>No website enquiries received yet. Once your form is live, send a test enquiry to check it arrives.</>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Option 1 — paste this HTML form"
          subtitle="Works on any website builder that lets you add custom HTML. Style it to match your site."
          action={<CopyButton text={html} label="Copy HTML" />}
        />
        <div className="border-t border-line px-5 py-5"><Code>{html}</Code></div>
      </Card>

      <Card>
        <CardHeader
          title="Option 2 — send JSON from your own code"
          subtitle="For custom sites and form tools. Send JSON or form-encoded fields."
          action={<CopyButton text={js} label="Copy code" />}
        />
        <div className="border-t border-line px-5 py-5"><Code>{js}</Code></div>
      </Card>

      <Card>
        <CardHeader title="Fields you can send" subtitle="All optional except name or email. Unknown fields are ignored." />
        <div className="overflow-x-auto border-t border-line">
          <table className="w-full min-w-[420px] text-[13px]">
            <tbody className="divide-y divide-line">
              <tr><td className="px-5 py-2 font-mono text-[12.5px] text-ink">key</td><td className="px-3 py-2 text-ink-muted">Your form key (required)</td></tr>
              {FIELDS.map(([f, d]) => (
                <tr key={f}><td className="px-5 py-2 font-mono text-[12.5px] text-ink">{f}</td><td className="px-3 py-2 text-ink-muted">{d}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-5 py-3 text-[12px] text-ink-muted">
          Enquiries are matched to existing customers by email. The <Link href="/settings/automations" className="font-medium text-brand-600 hover:text-brand-700">“New enquiry” automation</Link> can assign them to a team member automatically.
          To stop flooding, each business accepts up to 20 website enquiries every 10 minutes.
        </p>
      </Card>
    </>
  );
}
