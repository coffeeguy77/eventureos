import "server-only";
/**
 * Emails kitchen staff (Settings → Team, ticked "Kitchen") when a confirmed catering job is new, changes or is cancelled.
 * Runs with the background sync. Only for businesses with kitchen staff who have an email; sends 6am–9pm their time
 * (anything later waits until the morning). A job is only marked as told once an email has gone out.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { todayISO, addDaysISO } from "@/lib/format";
import { emailConfigured, sendEmail } from "@/lib/email/send";
import { kitchenJobsEmail } from "@/lib/email/templates";
import { appBaseUrl } from "@/lib/integrations/registry";
import { loadCateringJobs } from "./jobs";
import { byJob, changeLines, changeSubject, diff, readSent, signature } from "./changes";

const AHEAD_DAYS = 60;

export async function runKitchenNotices(db: SupabaseClient) {
  if (!emailConfigured()) return { skipped: "email not set up" };
  const { data: chefs, error } = await db.from("crew_members").select("id, name, email, organisation_id").eq("active", true).contains("skills", ["kitchen"]).not("email", "is", null);
  if (error) return { skipped: "before the database update" };
  const byOrg = new Map<string, { id: string; name: string; email: string }[]>();
  for (const c of (chefs ?? []) as { id: string; name: string; email: string; organisation_id: string }[]) (byOrg.get(c.organisation_id) ?? byOrg.set(c.organisation_id, []).get(c.organisation_id)!).push(c);
  const out: Record<string, unknown> = {};
  for (const [orgId, list] of byOrg) {
    try { out[orgId] = await notifyOrg(db, orgId, list); } catch (e) { out[orgId] = { error: e instanceof Error ? e.message : String(e) }; }
  }
  return out;
}

async function notifyOrg(db: SupabaseClient, orgId: string, chefs: { id: string; name: string; email: string }[]) {
  const { data: org } = await db.from("organisations").select("name, slug, timezone, brand_colour, logo_url, contact_email, status").eq("id", orgId).maybeSingle();
  if (!org || org.status !== "active") return { skipped: "organisation not active" };
  const tz = (org.timezone as string) || "Australia/Sydney";
  const hour = Number(new Intl.DateTimeFormat("en-AU", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(new Date()));
  if (hour < 6 || hour >= 21) return { skipped: "outside 6am–9pm" };

  const today = todayISO(tz);
  // Load from a month back so a multi-day job that's part-way through keeps the same fingerprint, and finished jobs aren't "cancelled"
  const { deliveries } = await loadCateringJobs(db, orgId, { from: addDaysISO(today, -31), to: addDaysISO(today, 365), statuses: ["confirmed", "completed"] });
  const groups = byJob(deliveries);
  const horizon = addDaysISO(today, AHEAD_DAYS);
  const current = new Map([...groups].filter(([, list]) => list[0].status === "confirmed" && list.some((d) => d.date >= today) && list[0].date <= horizon));
  // Finished, or moved further out than we look ahead: neither new nor cancelled
  const finished = new Set([...groups.keys()].filter((id) => !current.has(id)));

  // Jobs the kitchen has already been told about
  const { data: told, error } = await db.from("events").select("id, name, status, catering_sent, customer:customers(name)").eq("organisation_id", orgId).not("catering_sent", "is", null).gte("event_date", addDaysISO(today, -31));
  if (error) return { skipped: "before the database update (0061)" };
  const toldRows = (told ?? []) as unknown as { id: string; name: string; status: string; catering_sent: unknown; customer: { name: string } | null }[];
  const sentList = toldRows.filter((t) => !finished.has(t.id)).map((t) => ({ id: t.id, title: t.customer?.name ?? t.name, status: t.status, sent: readSent(t.catering_sent) }));
  const changes = diff(current, sentList);
  if (!changes.length) return { changes: 0 };

  const subject = changeSubject(changes);
  const url = `${appBaseUrl()}/crew/${org.slug}/kitchen`;
  let sent = 0;
  const errors: string[] = [];
  for (const c of chefs) {
    const m = kitchenJobsEmail({ businessName: org.name as string, firstName: c.name.split(" ")[0], subject, blocks: changes.map(changeLines), url, brand: org.brand_colour as string | null, logoUrl: org.logo_url as string | null });
    try { await sendEmail({ to: c.email, ...m, fromName: org.name as string, replyTo: (org.contact_email as string | null) ?? null }); sent++; }
    catch (e) { errors.push(e instanceof Error ? e.message : String(e)); }
  }
  if (!sent) return { changes: changes.length, sent: 0, errors };

  const now = new Date().toISOString();
  for (const c of changes) {
    const value = c.kind === "cancelled" ? null : { sig: signature(c.deliveries), sent_at: now, changed_at: c.kind === "changed" ? now : null };
    await db.from("events").update({ catering_sent: value }).eq("id", c.eventId).eq("organisation_id", orgId);
  }
  return { changes: changes.length, sent, errors };
}
