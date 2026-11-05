"use server";

import { mealFor } from "@/lib/roster/breaks";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { checkPass, kioskOrg, managerPass } from "@/lib/roster/kiosk";
import { pinHash } from "@/lib/roster/pin";
import { readRosterSettings } from "@/lib/roster/settings";
import { addDaysISO, fmtDate, todayISO } from "@/lib/format";

/**
 * Manager access on the café iPad: a manager (ticked "sees Today") enters their PIN, then a code texted to their phone
 * (in case someone has seen their PIN). They get a short pass to change the roster from the iPad — no pay shown.
 */
type R<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const codeHash = (orgId: string, memberId: string, code: string) => createHash("sha256").update(`kiosk:${orgId}:${memberId}:${code}`).digest("hex");
const err = (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) });

async function ctx(slug: string, token: string) {
  const k = await kioskOrg(slug, token);
  if (!k) throw new Error("This iPad link has been replaced — ask the office for the new one.");
  return k;
}

/** Managers who can unlock the iPad (for the picker). */
export async function kioskManagers(slug: string, token: string): Promise<R<{ people: { id: string; name: string }[] }>> {
  try {
    const k = await ctx(slug, token);
    const ids = readRosterSettings(k.org.settings).app_managers;
    if (!ids.length) return { ok: true, people: [] };
    const { data } = await k.db.from("crew_members").select("id, name").eq("organisation_id", k.org.id).eq("active", true).in("id", ids).order("name");
    return { ok: true, people: (data ?? []) as { id: string; name: string }[] };
  } catch (e) { return err(e); }
}

/** Step 1: PIN → a 6-digit code texted to the manager. */
export async function kioskManagerStart(slug: string, token: string, memberId: string, pin: string): Promise<R<{ to: string }>> {
  try {
    const k = await ctx(slug, token);
    if (!UUID.test(memberId) || !/^\d{4}$/.test(pin)) throw new Error("Enter your 4-digit PIN.");
    if (!readRosterSettings(k.org.settings).app_managers.includes(memberId)) throw new Error("Only managers can open Manager access.");
    const { data: m } = await k.db.from("crew_members").select("name, phone, kiosk_pin_hash").eq("id", memberId).eq("organisation_id", k.org.id).maybeSingle();
    if (!m?.kiosk_pin_hash || !same(m.kiosk_pin_hash as string, pinHash(k.org.id, memberId, pin))) { await new Promise((r) => setTimeout(r, 800)); throw new Error("That PIN isn't right."); }
    const { loadTwilio, sendSms, smsNumber } = await import("@/lib/sms/twilio");
    const to = m.phone ? smsNumber(m.phone as string) : null;
    const cfg = await loadTwilio(k.db, k.org.id);
    if (!to) throw new Error("Add your mobile number in Settings → Team first.");
    if (!cfg) throw new Error("Texts aren't set up (Twilio), so the code can't be sent.");
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const { error } = await k.db.from("kiosk_manager_codes").upsert({ crew_member_id: memberId, organisation_id: k.org.id, code_hash: codeHash(k.org.id, memberId, code), expires_at: new Date(Date.now() + 5 * 60_000).toISOString(), attempts: 0 });
    if (error) throw new Error(/kiosk_manager_codes/.test(error.message) ? "Run the latest database update (0089) first." : error.message);
    await sendSms(cfg, to, `${code} is your code to open Manager access on the café iPad. If this wasn't you, change your PIN in the staff app.`);
    return { ok: true, to: `…${String(m.phone).replace(/\D/g, "").slice(-3)}` };
  } catch (e) { return err(e); }
}

/** Step 2: the texted code → a 15-minute pass. */
export async function kioskManagerVerify(slug: string, token: string, memberId: string, code: string): Promise<R<{ pass: string; name: string }>> {
  try {
    const k = await ctx(slug, token);
    if (!UUID.test(memberId) || !/^\d{6}$/.test(code)) throw new Error("Enter the 6-digit code from the text.");
    const { data: c } = await k.db.from("kiosk_manager_codes").select("code_hash, expires_at, attempts").eq("crew_member_id", memberId).eq("organisation_id", k.org.id).maybeSingle();
    if (!c || Date.parse(c.expires_at as string) < Date.now()) throw new Error("That code has expired — start again.");
    if ((c.attempts as number) >= 5) throw new Error("Too many tries — start again.");
    if (!same(c.code_hash as string, codeHash(k.org.id, memberId, code))) {
      await k.db.from("kiosk_manager_codes").update({ attempts: (c.attempts as number) + 1 }).eq("crew_member_id", memberId);
      throw new Error("That code isn't right.");
    }
    await k.db.from("kiosk_manager_codes").delete().eq("crew_member_id", memberId);
    const { data: m } = await k.db.from("crew_members").select("name").eq("id", memberId).single();
    return { ok: true, pass: managerPass(k.org.id, memberId), name: String(m?.name ?? "") };
  } catch (e) { return err(e); }
}

export interface MgrShift { id: string; date: string; start: string; finish: string; breakMinutes: number; memberId: string | null; name: string | null; areaId: string | null; area: string | null; notes: string | null }

/** The roster from today for a week (no pay), with the people and areas to choose from. */
export async function kioskManagerWeek(slug: string, token: string, pass: string): Promise<R<{ shifts: MgrShift[]; people: { id: string; name: string; phone: boolean }[]; areas: { id: string; name: string }[]; today: string }>> {
  try {
    const k = await ctx(slug, token);
    if (!checkPass(k.org.id, pass)) throw new Error("Manager access has timed out — unlock it again.");
    const today = todayISO(k.org.timezone);
    const [{ data: sh }, { data: ppl }, { data: ar }] = await Promise.all([
      k.db.from("staff_shifts").select("id, shift_date, start_time, finish_time, break_minutes, crew_member_id, area_id, notes, member:crew_members(name), area:roster_areas(name)")
        .eq("organisation_id", k.org.id).eq("roster", true).gte("shift_date", today).lte("shift_date", addDaysISO(today, 6)).order("shift_date").order("start_time"),
      k.db.from("crew_members").select("id, name, phone").eq("organisation_id", k.org.id).eq("active", true).eq("on_roster", true).order("name"),
      k.db.from("roster_areas").select("id, name").eq("organisation_id", k.org.id).eq("active", true).order("position"),
    ]);
    type S = { id: string; shift_date: string; start_time: string; finish_time: string; break_minutes: number; crew_member_id: string | null; area_id: string | null; notes: string | null; member: { name: string } | null; area: { name: string } | null };
    return {
      ok: true, today,
      shifts: ((sh ?? []) as unknown as S[]).map((x) => ({ id: x.id, date: x.shift_date, start: x.start_time.slice(0, 5), finish: x.finish_time.slice(0, 5), breakMinutes: x.break_minutes, memberId: x.crew_member_id, name: x.member?.name ?? null, areaId: x.area_id, area: x.area?.name ?? null, notes: x.notes })),
      people: ((ppl ?? []) as { id: string; name: string; phone: string | null }[]).map((p) => ({ id: p.id, name: p.name, phone: !!p.phone })),
      areas: (ar ?? []) as { id: string; name: string }[],
    };
  } catch (e) { return err(e); }
}

const t12 = (t: string) => { const [h, m] = t.split(":").map(Number); return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`; };
async function textPerson(db: Awaited<ReturnType<typeof ctx>>["db"], orgId: string, orgName: string, memberId: string | null, body: (first: string) => string) {
  if (!memberId) return "";
  const { loadTwilio, sendSms, smsNumber } = await import("@/lib/sms/twilio");
  const { data: m } = await db.from("crew_members").select("name, phone").eq("id", memberId).maybeSingle();
  const to = m?.phone ? smsNumber(m.phone as string) : null;
  const cfg = await loadTwilio(db, orgId);
  if (!to || !cfg) return ` (${String(m?.name ?? "they").split(" ")[0]} not texted — ${!to ? "no mobile" : "texts aren't set up"})`;
  try { await sendSms(cfg, to, `${orgName}: ${body(String(m?.name ?? "").split(" ")[0])}`); return ` · texted ${String(m?.name ?? "").split(" ")[0]}`; } catch { return " (text didn't send)"; }
}

/** Add or change a shift from the iPad. It goes live straight away (published); optionally text the person. */
export async function kioskManagerSave(slug: string, token: string, pass: string, v: { id: string | null; date: string; start: string; finish: string; memberId: string | null; areaId: string | null; notes: string; text: boolean }): Promise<R<{ message: string }>> {
  try {
    const k = await ctx(slug, token);
    const by = checkPass(k.org.id, pass);
    if (!by) throw new Error("Manager access has timed out — unlock it again.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date) || !/^\d{2}:\d{2}$/.test(v.start) || !/^\d{2}:\d{2}$/.test(v.finish) || v.start === v.finish) throw new Error("Check the date and times.");
    if ((v.memberId && !UUID.test(v.memberId)) || (v.areaId && !UUID.test(v.areaId)) || (v.id && !UUID.test(v.id))) throw new Error("Refresh and try again.");
    const st = readRosterSettings(k.org.settings);
    const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
    let span = mins(v.finish) - mins(v.start); if (span <= 0) span += 1440;
    const meal = mealFor(st.meal, v.memberId, v.date);
    const brk = meal.minutes > 0 && span >= meal.after_hours * 60 ? meal.minutes : 0;
    let title = "Shift";
    if (v.areaId) { const { data: a } = await k.db.from("roster_areas").select("name").eq("id", v.areaId).eq("organisation_id", k.org.id).maybeSingle(); if (!a) throw new Error("That area no longer exists."); title = a.name as string; }
    const row = { crew_member_id: v.memberId, area_id: v.areaId, title, shift_date: v.date, start_time: v.start, finish_time: v.finish, break_minutes: brk, notes: v.notes.trim().slice(0, 2000) || null, published_at: new Date().toISOString(), changed_since_publish: false, updated_at: new Date().toISOString() };
    let before: { crew_member_id: string | null } | null = null;
    if (v.id) {
      const { data: b } = await k.db.from("staff_shifts").select("crew_member_id").eq("id", v.id).eq("organisation_id", k.org.id).eq("roster", true).maybeSingle();
      if (!b) throw new Error("That shift no longer exists.");
      before = b as { crew_member_id: string | null };
      const { error } = await k.db.from("staff_shifts").update(row).eq("id", v.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await k.db.from("staff_shifts").insert({ ...row, organisation_id: k.org.id, roster: true });
      if (error) throw new Error(error.message);
    }
    await k.db.from("activity_logs").insert({ organisation_id: k.org.id, actor_type: "system", actor_label: "Café iPad (manager)", action: v.id ? "roster.shift_changed" : "roster.shift_added", entity_type: "crew_member", entity_id: by, summary: `${v.id ? "Changed" : "Added"} a shift on ${fmtDate(v.date)} ${v.start}–${v.finish} from the café iPad` });
    const when = `${fmtDate(v.date, "weekday")} ${t12(v.start)}-${t12(v.finish)}`;
    let texted = "";
    if (v.text) {
      texted += await textPerson(k.db, k.org.id, (await k.db.from("organisations").select("name").eq("id", k.org.id).single()).data?.name ?? "", v.memberId, (f) => `Hi ${f}, ${v.id && before?.crew_member_id === v.memberId ? "your shift has changed" : "you've got a shift"}: ${when}. Check the staff app.`);
      if (before?.crew_member_id && before.crew_member_id !== v.memberId) texted += await textPerson(k.db, k.org.id, "", before.crew_member_id, (f) => `Hi ${f}, your shift on ${fmtDate(v.date, "weekday")} has been given to someone else. Check the staff app.`);
    }
    return { ok: true, message: `${v.id ? "Shift changed" : "Shift added"} — ${when}${texted}.` };
  } catch (e) { return err(e); }
}

/** Remove a shift, or mark the person sick (the shift stays, open for someone else to take). */
export async function kioskManagerRemove(slug: string, token: string, pass: string, id: string, mode: "delete" | "sick", text: boolean): Promise<R<{ message: string }>> {
  try {
    const k = await ctx(slug, token);
    const by = checkPass(k.org.id, pass);
    if (!by) throw new Error("Manager access has timed out — unlock it again.");
    if (!UUID.test(id)) throw new Error("Refresh and try again.");
    const { data: s } = await k.db.from("staff_shifts").select("crew_member_id, shift_date, start_time, finish_time, member:crew_members(name)").eq("id", id).eq("organisation_id", k.org.id).eq("roster", true).maybeSingle();
    if (!s) throw new Error("That shift no longer exists.");
    const { data: o } = await k.db.from("organisations").select("name").eq("id", k.org.id).single();
    const when = `${fmtDate(s.shift_date as string, "weekday")} ${t12(String(s.start_time).slice(0, 5))}-${t12(String(s.finish_time).slice(0, 5))}`;
    const name = (s as unknown as { member: { name: string } | null }).member?.name ?? "Open shift";
    if (mode === "sick") {
      const { error } = await k.db.from("staff_shifts").update({ crew_member_id: null, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw new Error(error.message);
      if (s.crew_member_id) await k.db.from("staff_unavailability").insert({ organisation_id: k.org.id, crew_member_id: s.crew_member_id, starts_on: s.shift_date, ends_on: s.shift_date, leave_type: "personal", status: "approved", note: "Called in sick (café iPad)" }).then(() => undefined, () => undefined);
    } else {
      const { error } = await k.db.from("staff_shifts").delete().eq("id", id);
      if (error) throw new Error(error.message);
    }
    await k.db.from("activity_logs").insert({ organisation_id: k.org.id, actor_type: "system", actor_label: "Café iPad (manager)", action: mode === "sick" ? "roster.sick" : "roster.shift_removed", entity_type: "crew_member", entity_id: by, summary: `${mode === "sick" ? `${name} called in sick` : `Removed ${name}'s shift`} — ${when} (café iPad)` });
    const texted = text && s.crew_member_id && mode === "delete" ? await textPerson(k.db, k.org.id, o?.name ?? "", s.crew_member_id as string, (f) => `Hi ${f}, your shift ${when} has been cancelled. Check the staff app.`) : "";
    return { ok: true, message: mode === "sick" ? `${name} marked sick — the ${when} shift is now open for others to take in the staff app.` : `Shift removed${texted}.` };
  } catch (e) { return err(e); }
}
