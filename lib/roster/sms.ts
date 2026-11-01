import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/integrations/runtime";
import { appBaseUrl } from "@/lib/integrations/registry";
import { addDaysISO, fmtDate } from "@/lib/format";
import { t12 } from "./notify";

/**
 * Text staff their week through the business's Twilio account: their published shifts and a link to the staff app
 * (which keeps them signed in).
 */
const NOTE_MAX = 70;

/**
 * Deputy-style: one shift per line (day, times, area, unpaid break), Cara's note for the shift on the line under it,
 * then the link. e.g.
 *   Hi Cara, your shifts at Bean Culture from Mon 3 Nov:
 *   Mon 6:30am-3pm Cafe (30m unpaid break)
 *    > Note: Open up, milk delivery
 *   Tue 7am-1pm Kitchen
 *   Roster, swaps & clock on: https://…
 */
export async function rosterText(db: SupabaseClient, orgId: string, memberId: string, monday: string): Promise<{ to: string | null; body: string; name: string }> {
  const [{ data: org }, { data: m }, { data: shifts }] = await Promise.all([
    db.from("organisations").select("name, slug").eq("id", orgId).single(),
    db.from("crew_members").select("name, phone").eq("id", memberId).eq("organisation_id", orgId).single(),
    db.from("staff_shifts").select("shift_date, start_time, finish_time, break_minutes, notes, area:roster_areas(name)").eq("organisation_id", orgId).eq("crew_member_id", memberId).eq("roster", true).not("published_at", "is", null)
      .gte("shift_date", monday).lte("shift_date", addDaysISO(monday, 6)).order("shift_date").order("start_time"),
  ]);
  const { smsNumber } = await import("@/lib/sms/twilio");
  type S = { shift_date: string; start_time: string; finish_time: string; break_minutes: number; notes: string | null; area: { name: string } | null };
  const lines = ((shifts ?? []) as unknown as S[]).flatMap((s) => {
    const day = fmtDate(s.shift_date, "weekday").split(" ")[0].replace(",", "");
    const line = `${day} ${t12(s.start_time)}-${t12(s.finish_time)}${s.area?.name ? ` ${s.area.name}` : ""}${s.break_minutes ? ` (${s.break_minutes}m unpaid break)` : ""}`;
    const note = s.notes?.replace(/\s+/g, " ").trim();
    return note ? [line, ` > Note: ${note.length > NOTE_MAX ? `${note.slice(0, NOTE_MAX - 1).trimEnd()}… (more in the app)` : note}`] : [line];
  });
  const first = String(m?.name ?? "").split(" ")[0];
  const url = `${appBaseUrl()}/crew/${org?.slug}`;
  const body = lines.length
    ? [`Hi ${first}, your shifts at ${org?.name} from ${fmtDate(monday, "weekday")}:`, ...lines, `Roster, swaps & clock on: ${url}`].join("\n")
    : `Hi ${first}, you're not rostered at ${org?.name} the week from ${fmtDate(monday, "weekday")}.\nOpen shifts & your roster: ${url}`;
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
