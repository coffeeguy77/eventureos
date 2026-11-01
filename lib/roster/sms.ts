import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/integrations/runtime";
import { appBaseUrl } from "@/lib/integrations/registry";
import { addDaysISO, fmtDate, todayISO } from "@/lib/format";
import { t12 } from "./notify";

/**
 * Text staff their week through the business's Twilio account: their published shifts and a link to the staff app
 * (which keeps them signed in).
 */
const NOTE_MAX = 70;

/**
 * Short and the same every week, so staff get used to opening the app:
 *   Hi Cara, your shifts at Bean Culture this week are:
 *   Tue 6:30am-3pm
 *   Fri 5am-10am Catering
 *   note: Tech One due 10am
 *   view roster: https://…/crew/…
 * One shift per line; the area only when it's not at the usual workplace (Setup → Areas); a shift's note on the line under it.
 */
export async function rosterText(db: SupabaseClient, orgId: string, memberId: string, monday: string): Promise<{ to: string | null; body: string; name: string }> {
  const [{ data: org }, { data: m }, { data: shifts }] = await Promise.all([
    db.from("organisations").select("name, slug, timezone, settings").eq("id", orgId).single(),
    db.from("crew_members").select("name, phone").eq("id", memberId).eq("organisation_id", orgId).single(),
    db.from("staff_shifts").select("shift_date, start_time, finish_time, notes, area_id, area:roster_areas(name)").eq("organisation_id", orgId).eq("crew_member_id", memberId).eq("roster", true).not("published_at", "is", null)
      .gte("shift_date", monday).lte("shift_date", addDaysISO(monday, 6)).order("shift_date").order("start_time"),
  ]);
  const { smsNumber } = await import("@/lib/sms/twilio");
  const { readRosterSettings } = await import("./settings");
  const { weekOf } = await import("./award");
  const home = new Set(readRosterSettings(org?.settings).home_areas);
  type S = { shift_date: string; start_time: string; finish_time: string; notes: string | null; area_id: string | null; area: { name: string } | null };
  const lines = ((shifts ?? []) as unknown as S[]).flatMap((s) => {
    const day = fmtDate(s.shift_date, "weekday").split(" ")[0].replace(",", "");
    const where = s.area?.name && !(s.area_id && home.has(s.area_id)) ? ` ${s.area.name}` : "";
    const line = `${day} ${t12(s.start_time)}-${t12(s.finish_time)}${where}`;
    const note = s.notes?.replace(/\s+/g, " ").trim();
    return note ? [line, `note: ${note.length > NOTE_MAX ? `${note.slice(0, NOTE_MAX - 1).trimEnd()}… (more in the app)` : note}`] : [line];
  });
  const thisWeek = weekOf(todayISO(String(org?.timezone ?? "Australia/Sydney")));
  const when = monday === thisWeek ? "this week" : monday === addDaysISO(thisWeek, 7) ? "next week" : `the week of ${fmtDate(monday, "short")}`;
  const first = String(m?.name ?? "").split(" ")[0];
  const url = `${appBaseUrl()}/crew/${org?.slug}`;
  const body = lines.length
    ? [`Hi ${first}, your shifts at ${org?.name} ${when} are:`, ...lines, `view roster: ${url}`].join("\n")
    : `Hi ${first}, you're not rostered at ${org?.name} ${when}.\nview roster: ${url}`;
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
