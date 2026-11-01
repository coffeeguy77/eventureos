import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDaysISO, fmtDate, todayISO } from "@/lib/format";
import { readRosterSettings } from "./settings";
import { shiftSpan, toLocal, fromLocal } from "./time";
import { t12 } from "./notify";

/**
 * Café roster background jobs (every few minutes from the sync cron, and each minute while the café iPad is open):
 *   • "Running late?" texts — a published shift has started (plus the set minutes) and they haven't clocked on
 *   • shift reminder texts — the evening before, and/or a set number of hours before
 * Each is claimed in the database before it's sent, so two runs never text twice.
 */
type Org = { id: string; name: string; slug: string; timezone: string; settings: unknown; contact_phone: string | null };
type Sh = { id: string; crew_member_id: string; shift_date: string; start_time: string; finish_time: string; reminder_sent_at?: string | null; area: { name: string } | null; member: { name: string; phone: string | null } | null };

export function lateText(org: { name: string; contact_phone: string | null }, name: string, start: string) {
  return `Hi ${name.split(" ")[0]}, you're rostered at ${org.name} from ${t12(start)} and haven't clocked on yet. Running late? Please let us know${org.contact_phone ? ` — ${org.contact_phone}` : ""}.`;
}

/** Send a "running late?" text and record it. by = "auto" or the manager's name. */
export async function sendLateAlert(db: SupabaseClient, org: Org, sh: Sh, by: string): Promise<{ ok: boolean; error?: string; skipped?: boolean }> {
  const { loadTwilio, sendSms, smsNumber } = await import("@/lib/sms/twilio");
  const cfg = await loadTwilio(db, org.id);
  const to = sh.member?.phone ? smsNumber(sh.member.phone) : null;
  const { data: claim, error: ce } = await db.from("staff_late_alerts").insert({ organisation_id: org.id, staff_shift_id: sh.id, crew_member_id: sh.crew_member_id, sent_by: by, ok: false }).select("id").single();
  if (ce) return { ok: false, skipped: true, error: ce.message }; // already sent automatically (or before database update 0087)
  let error: string | null = !cfg ? "Twilio isn't connected" : !to ? "no mobile number" : null;
  if (!error) { try { await sendSms(cfg!, to!, lateText(org, sh.member?.name ?? "", sh.start_time)); } catch (e) { error = e instanceof Error ? e.message : String(e); } }
  await db.from("staff_late_alerts").update({ ok: !error, error }).eq("id", claim.id);
  return error ? { ok: false, error } : { ok: true };
}

async function lateAlerts(db: SupabaseClient, org: Org) {
  const st = readRosterSettings(org.settings);
  if (!st.late.auto) return 0;
  const today = todayISO(org.timezone), nowL = toLocal(new Date(), org.timezone);
  const { data } = await db.from("staff_shifts").select("id, crew_member_id, shift_date, start_time, finish_time, area:roster_areas(name), member:crew_members(name, phone)")
    .eq("organisation_id", org.id).eq("roster", true).not("published_at", "is", null).not("crew_member_id", "is", null).in("shift_date", [addDaysISO(today, -1), today]);
  const due = ((data ?? []) as unknown as Sh[]).filter((s) => {
    const span = shiftSpan(s.shift_date, s.start_time, s.finish_time);
    const late = new Date(Date.parse(`${span.start}:00Z`) + st.late.after * 60_000).toISOString().slice(0, 16);
    return nowL >= late && nowL < span.finish && nowL < new Date(Date.parse(`${span.start}:00Z`) + 3 * 3_600_000).toISOString().slice(0, 16);
  });
  if (!due.length) return 0;
  const { data: sent } = await db.from("staff_late_alerts").select("staff_shift_id").in("staff_shift_id", due.map((s) => s.id)).eq("sent_by", "auto");
  const done = new Set(((sent ?? []) as { staff_shift_id: string }[]).map((r) => r.staff_shift_id));
  let n = 0;
  for (const s of due.filter((x) => !done.has(x.id))) {
    // clocked on for it (or within 2 hours before it started)?
    const from = fromLocal(new Date(Date.parse(`${shiftSpan(s.shift_date, s.start_time, s.finish_time).start}:00Z`) - 2 * 3_600_000).toISOString().slice(0, 16), org.timezone);
    const { data: e } = await db.from("staff_time_entries").select("id").eq("crew_member_id", s.crew_member_id).gte("clock_in", from).limit(1);
    if (e?.length) continue;
    const r = await sendLateAlert(db, org, s, "auto");
    if (r.skipped) continue;
    n++;
    await db.from("notifications").insert({ organisation_id: org.id, type: "roster.late", title: `${s.member?.name ?? "Someone"} hasn't clocked on for ${t12(s.start_time)}`.slice(0, 200),
      body: r.ok ? "We've texted them." : `Couldn't text them: ${r.error}`, link: "/roster", entity_type: "crew_member", entity_id: s.crew_member_id });
  }
  return n;
}

async function reminders(db: SupabaseClient, org: Org) {
  const st = readRosterSettings(org.settings);
  if (!st.reminders.night_before && !st.reminders.hours_before && !Object.values(st.member_reminders).some((m) => m.night)) return 0;
  const today = todayISO(org.timezone), nowL = toLocal(new Date(), org.timezone);
  const { data } = await db.from("staff_shifts").select("id, crew_member_id, area_id, shift_date, start_time, finish_time, reminder_sent_at, area:roster_areas(name), member:crew_members(name, phone)")
    .eq("organisation_id", org.id).eq("roster", true).not("published_at", "is", null).not("crew_member_id", "is", null).is("reminder_sent_at", null).in("shift_date", [today, addDaysISO(today, 1)]);
  const home = new Set(st.home_areas);
  const list = ((data ?? []) as unknown as (Sh & { area_id?: string })[]).filter((s) => {
    const start = shiftSpan(s.shift_date, s.start_time, s.finish_time).start;
    if (start <= nowL) return false;
    const evening = (st.reminders.night_before || st.member_reminders[s.crew_member_id]?.night) && s.shift_date === addDaysISO(today, 1) && nowL.slice(11, 16) >= st.reminders.at && nowL.slice(11, 16) < "22:00";
    const soon = st.reminders.hours_before > 0 && Date.parse(`${start}:00Z`) - Date.parse(`${nowL}:00Z`) <= st.reminders.hours_before * 3_600_000;
    return evening || soon;
  });
  if (!list.length) return 0;
  const { loadTwilio, sendSms, smsNumber } = await import("@/lib/sms/twilio");
  const cfg = await loadTwilio(db, org.id);
  if (!cfg) return 0;
  const { appBaseUrl } = await import("@/lib/integrations/registry");
  let n = 0;
  for (const s of list) {
    const to = s.member?.phone ? smsNumber(s.member.phone) : null;
    if (!to) continue;
    const { data: claim } = await db.from("staff_shifts").update({ reminder_sent_at: new Date().toISOString() }).eq("id", s.id).is("reminder_sent_at", null).select("id");
    if (!claim?.length) continue;
    const when = s.shift_date === today ? "today" : "tomorrow";
    const where = s.area?.name && !home.has((s as { area_id?: string }).area_id ?? "") ? ` (${s.area.name})` : "";
    try { await sendSms(cfg, to, `Reminder: you're working at ${org.name} ${when} ${t12(s.start_time)}-${t12(s.finish_time)}${where}.\nview roster: ${appBaseUrl()}/crew/${org.slug}`); n++; } catch { /* next time won't resend; the office can see it in Twilio */ }
  }
  return n;
}

/** Wake-up texts: per person, a set number of minutes before each shift (Setup → Team → Staff details). */
async function wakeTexts(db: SupabaseClient, org: Org) {
  const st = readRosterSettings(org.settings);
  const who = Object.entries(st.member_reminders).filter(([, v]) => v.minutes > 0);
  if (!who.length) return 0;
  const today = todayISO(org.timezone), nowL = toLocal(new Date(), org.timezone);
  const { data, error } = await db.from("staff_shifts").select("id, crew_member_id, shift_date, start_time, finish_time, area:roster_areas(name), member:crew_members(name, phone)")
    .eq("organisation_id", org.id).eq("roster", true).not("published_at", "is", null).in("crew_member_id", who.map(([id]) => id)).is("wake_sent_at", null).in("shift_date", [today, addDaysISO(today, 1)]);
  if (error) return 0; // before database update 0089
  const due = ((data ?? []) as unknown as Sh[]).filter((s) => {
    const start = shiftSpan(s.shift_date, s.start_time, s.finish_time).start;
    const mins = (Date.parse(`${start}:00Z`) - Date.parse(`${nowL}:00Z`)) / 60_000;
    return mins > 0 && mins <= (st.member_reminders[s.crew_member_id]?.minutes ?? 0);
  });
  if (!due.length) return 0;
  const { loadTwilio, sendSms, smsNumber } = await import("@/lib/sms/twilio");
  const cfg = await loadTwilio(db, org.id);
  if (!cfg) return 0;
  let n = 0;
  for (const s of due) {
    const to = s.member?.phone ? smsNumber(s.member.phone) : null;
    if (!to) continue;
    const { data: claim } = await db.from("staff_shifts").update({ wake_sent_at: new Date().toISOString() }).eq("id", s.id).is("wake_sent_at", null).select("id");
    if (!claim?.length) continue;
    try { await sendSms(cfg, to, `Hi ${s.member?.name?.split(" ")[0] ?? ""}, your shift at ${org.name} starts at ${t12(s.start_time)}. See you soon!`); n++; } catch { /* not resent */ }
  }
  return n;
}

/** Run the roster jobs for every business with a café roster today (or one business). */
export async function runRosterJobs(db: SupabaseClient, onlyOrg?: string) {
  let q = db.from("staff_shifts").select("organisation_id").eq("roster", true).not("published_at", "is", null).gte("shift_date", addDaysISO(new Date().toISOString().slice(0, 10), -1)).lte("shift_date", addDaysISO(new Date().toISOString().slice(0, 10), 2)).limit(2000);
  if (onlyOrg) q = q.eq("organisation_id", onlyOrg);
  const { data } = await q;
  const ids = [...new Set(((data ?? []) as { organisation_id: string }[]).map((r) => r.organisation_id))];
  const out: Record<string, { late: number; reminders: number } | { error: string }> = {};
  for (const id of ids) {
    try {
      const { data: org } = await db.from("organisations").select("id, name, slug, timezone, settings, contact_phone").eq("id", id).single();
      if (!org) continue;
      out[id] = { late: await lateAlerts(db, org as Org), reminders: (await reminders(db, org as Org)) + (await wakeTexts(db, org as Org)) };
    } catch (e) { out[id] = { error: e instanceof Error ? e.message : String(e) }; }
  }
  return out;
}

/** At most once a minute per server (the café iPad refreshes every minute). */
let last = 0;
export async function runRosterJobsSoon(db: SupabaseClient, orgId: string) {
  if (Date.now() - last < 55_000) return;
  last = Date.now();
  await runRosterJobs(db, orgId).catch(() => undefined);
}

export const fmtSent = (iso: string, tz: string) => `${fmtDate(toLocal(iso, tz).slice(0, 10), "weekday")} ${t12(toLocal(iso, tz).slice(11, 16))}`;

/** A manager sends (or re-sends) the "running late?" text — not within the cooldown after the last one. */
export async function manualLateAlert(db: SupabaseClient, orgId: string, shiftId: string, byName: string): Promise<string> {
  const { data: org } = await db.from("organisations").select("id, name, slug, timezone, settings, contact_phone").eq("id", orgId).single();
  if (!org) throw new Error("Refresh and try again.");
  const { data: sh } = await db.from("staff_shifts").select("id, crew_member_id, shift_date, start_time, finish_time, area:roster_areas(name), member:crew_members(name, phone)").eq("id", shiftId).eq("organisation_id", orgId).maybeSingle();
  if (!sh?.crew_member_id) throw new Error("That shift no longer exists.");
  const st = readRosterSettings((org as Org).settings);
  const { data: last } = await db.from("staff_late_alerts").select("sent_at").eq("staff_shift_id", shiftId).order("sent_at", { ascending: false }).limit(1);
  const at = (last?.[0] as { sent_at: string } | undefined)?.sent_at;
  if (at) {
    const wait = Date.parse(at) + st.late.cooldown * 60_000 - Date.now();
    if (wait > 0) throw new Error(`A text went ${Math.round((Date.now() - Date.parse(at)) / 60_000)} min ago — you can send another in ${Math.ceil(wait / 60_000)} min.`);
  }
  const r = await sendLateAlert(db, org as Org, sh as unknown as Sh, byName.slice(0, 60) || "Manager");
  if (!r.ok) throw new Error(r.error ?? "Not sent.");
  return `Texted ${(sh as unknown as Sh).member?.name?.split(" ")[0] ?? "them"}.`;
}
