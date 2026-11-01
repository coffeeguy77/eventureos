import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/integrations/runtime";
import { appBaseUrl } from "@/lib/integrations/registry";
import { addDaysISO, fmtDate } from "@/lib/format";

/**
 * Text staff their week through the business's Twilio account: their published shifts and a link to the staff app
 * (which keeps them signed in). Short on purpose — one or two text messages.
 */
const t12 = (t: string) => { const [h, m] = t.split(":").map(Number); return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`; };

export async function rosterText(db: SupabaseClient, orgId: string, memberId: string, monday: string): Promise<{ to: string | null; body: string; name: string }> {
  const [{ data: org }, { data: m }, { data: shifts }] = await Promise.all([
    db.from("organisations").select("name, slug").eq("id", orgId).single(),
    db.from("crew_members").select("name, phone").eq("id", memberId).eq("organisation_id", orgId).single(),
    db.from("staff_shifts").select("shift_date, start_time, finish_time").eq("organisation_id", orgId).eq("crew_member_id", memberId).eq("roster", true).not("published_at", "is", null)
      .gte("shift_date", monday).lte("shift_date", addDaysISO(monday, 6)).order("shift_date").order("start_time"),
  ]);
  const { smsNumber } = await import("@/lib/sms/twilio");
  const list = ((shifts ?? []) as { shift_date: string; start_time: string; finish_time: string }[])
    .map((s) => `${fmtDate(s.shift_date, "weekday").split(" ")[0]} ${t12(s.start_time.slice(0, 5))}–${t12(s.finish_time.slice(0, 5))}`);
  const first = String(m?.name ?? "").split(" ")[0];
  const url = `${appBaseUrl()}/crew/${org?.slug}`;
  const body = list.length
    ? `Hi ${first}, your ${org?.name} roster for w/c ${fmtDate(monday, "short")}: ${list.join(", ")}. Details, swaps & clock on: ${url}`
    : `Hi ${first}, you're not rostered at ${org?.name} for w/c ${fmtDate(monday, "short")}. Open shifts & your roster: ${url}`;
  return { to: m?.phone ? smsNumber(String(m.phone)) : null, body, name: String(m?.name ?? "") };
}

/** Text these people their week. Returns who got one and who couldn't (no mobile, Twilio refused). */
export async function textRoster(orgId: string, memberIds: string[], monday: string, opts: { to?: string } = {}) {
  const db = createServiceClient();
  const { loadTwilio, sendSms, smsNumber } = await import("@/lib/sms/twilio");
  const cfg = await loadTwilio(db, orgId);
  if (!cfg) throw new Error("Twilio isn't connected (Settings → Integrations → Twilio).");
  const sent: string[] = [], failed: string[] = [];
  for (const id of memberIds) {
    const t = await rosterText(db, orgId, id, monday);
    const to = opts.to ? smsNumber(opts.to) : t.to;
    if (!to) { failed.push(`${t.name} (no mobile number)`); continue; }
    try { await sendSms(cfg, to, t.body); sent.push(t.name); } catch (e) { failed.push(`${t.name} (${e instanceof Error ? e.message : String(e)})`); }
  }
  return { sent, failed };
}
