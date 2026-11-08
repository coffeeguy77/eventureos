import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Jobs coming up that aren't paid: a notification (and one email to the office) a week out, and again 2 days out,
 * for each confirmed job with money owing — or nothing invoiced at all. Runs from the sync cron; each job is flagged
 * at most twice.
 */
export async function runUnpaidJobAlerts(db: SupabaseClient) {
  const out = { alerts: 0 };
  const { data: orgs } = await db.from("organisations").select("id, name, timezone, currency, contact_email").limit(500);
  for (const org of (orgs ?? []) as { id: string; name: string; timezone: string | null; currency: string | null; contact_email: string | null }[]) {
    const tz = org.timezone || "Australia/Sydney";
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const week = new Date(Date.parse(`${today}T12:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10);
    const { data: evs } = await db.from("events").select("id, number, name, event_date, customer:customers(name)").eq("organisation_id", org.id).eq("status", "confirmed").gte("event_date", today).lte("event_date", week).limit(300);
    const list = (evs ?? []) as unknown as { id: string; number: number; name: string; event_date: string; customer: { name: string } | null }[];
    if (!list.length) continue;
    const ids = list.map((e) => e.id);
    const [{ data: invs }, { data: prior }] = await Promise.all([
      db.from("invoices").select("event_id, balance, total, status").in("event_id", ids).neq("status", "void"),
      db.from("notifications").select("entity_id").eq("organisation_id", org.id).eq("type", "job.unpaid").in("entity_id", ids),
    ]);
    const owing = new Map<string, { balance: number; any: boolean }>();
    for (const i of (invs ?? []) as { event_id: string; balance: number; status: string }[]) {
      const cur = owing.get(i.event_id) ?? { balance: 0, any: false };
      owing.set(i.event_id, { balance: cur.balance + Math.max(0, Number(i.balance) || 0), any: true });
    }
    const sent = new Map<string, number>();
    for (const p of (prior ?? []) as { entity_id: string }[]) sent.set(p.entity_id, (sent.get(p.entity_id) ?? 0) + 1);
    const lines: string[] = [];
    const money = (n: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: org.currency || "AUD" }).format(n);
    for (const e of list) {
      const o = owing.get(e.id);
      const unpaid = !o?.any || o.balance > 0.009;
      if (!unpaid) continue;
      const days = Math.round((Date.parse(`${e.event_date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
      const n = sent.get(e.id) ?? 0;
      if (!(n === 0 || (n === 1 && days <= 2))) continue;
      const when = days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
      const what = !o?.any ? "nothing invoiced yet" : `${money(o.balance)} owing`;
      await db.from("notifications").insert({
        organisation_id: org.id, type: "job.unpaid", title: `Not paid: ${e.name} (${when})`.slice(0, 200),
        body: `${e.customer?.name ?? ""} — ${what}`.slice(0, 140), link: `/events/${e.id}?tab=invoice`, entity_type: "event", entity_id: e.id,
      }).then(() => null, () => null);
      lines.push(`EV-${e.number} ${e.name} — ${e.customer?.name ?? ""} — ${when} — ${what}`);
      out.alerts++;
    }
    if (lines.length && org.contact_email) {
      try {
        const { emailConfigured, sendEmail } = await import("@/lib/email/send");
        if (emailConfigured()) {
          const { appBaseUrl } = await import("@/lib/integrations/registry");
          const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
          await sendEmail({
            to: org.contact_email, fromName: "EventureOS",
            subject: `${lines.length} upcoming job${lines.length === 1 ? "" : "s"} not paid yet`,
            text: `These jobs are coming up and haven't been paid:\n\n${lines.join("\n")}\n\n${appBaseUrl()}/invoices`,
            html: `<p>These jobs are coming up and haven't been paid:</p><ul>${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul><p><a href="${appBaseUrl()}/invoices">Open invoices</a></p>`,
          });
        }
      } catch (e) { console.error("[unpaid-jobs] email", e); }
    }
  }
  return out;
}
