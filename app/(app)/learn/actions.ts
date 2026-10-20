"use server";

import { revalidatePath } from "next/cache";
import { canManage, requireOrg } from "@/lib/context";
import { actorName, logActivity } from "@/lib/activity";
import { addMonths, hireSplit, PLAN_LABEL, readLearnSettings, readQuiz, type LearnSettings } from "@/lib/learn/core";
import { money } from "@/lib/format";
import pack from "@/lib/learn/packs/bean-culture.json";

/** The office side of the online course: settings, content, learners, training rooms. */
export type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
const UUID = /^[0-9a-f-]{36}$/i;
const err = (e: unknown) => (e instanceof Error ? e.message : String(e));
const done = () => revalidatePath("/learn", "layout");
const notReady = (m: string) => /learn_|does not exist|schema cache/i.test(m) ? "Run the database update 0063_learn.sql first (Supabase → SQL editor)." : m;

async function manager() {
  const ctx = await requireOrg();
  if (!canManage(ctx.role)) throw new Error("Only owners and managers can change the online course.");
  return ctx;
}

/* ------------------------------------------------------------------ settings */

export async function saveLearnSettings(input: LearnSettings): Promise<Result> {
  try {
    const { supabase, org, user, profile } = await manager();
    const { data: cur, error: e1 } = await supabase.from("organisations").select("settings").eq("id", org.id).single();
    if (e1) throw new Error(e1.message);
    const before = (cur.settings ?? {}) as Record<string, unknown>;
    // Clean through the reader so only valid values are stored
    const next = readLearnSettings({ learn: input });
    if (next.enabled) {
      const { error } = await supabase.from("learn_lessons").select("id", { head: true, count: "exact" }).eq("organisation_id", org.id);
      if (error) throw new Error(notReady(error.message));
    }
    const was = readLearnSettings(before);
    const { error } = await supabase.from("organisations").update({ settings: { ...before, learn: next } }).eq("id", org.id);
    if (error) throw new Error(error.message);
    const bits: string[] = [];
    if (was.enabled !== next.enabled) bits.push(next.enabled ? "switched selling ON" : "switched selling off");
    for (const p of ["with_course", "monthly", "yearly"] as const) if (was.prices[p] !== next.prices[p]) bits.push(`${PLAN_LABEL[p].toLowerCase()} ${money(was.prices[p])} → ${money(next.prices[p])}`);
    if (was.marketplace.enabled !== next.marketplace.enabled) bits.push(next.marketplace.enabled ? "opened the training-room marketplace" : "closed the training-room marketplace");
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "learn.settings", entityType: "organisation", entityId: org.id, summary: `${actorName(profile)} updated the online course settings${bits.length ? `: ${bits.join(", ")}` : ""}` });
    done(); return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: err(e) }; }
}

/* ------------------------------------------------------------------ importing the course from the Replit app */

type Pack = typeof pack;

export async function importPack(): Promise<Result<string>> {
  try {
    const { supabase, org, user, profile } = await manager();
    const p = pack as Pack;
    const { count, error: e0 } = await supabase.from("learn_lessons").select("id", { head: true, count: "exact" }).eq("organisation_id", org.id);
    if (e0) throw new Error(notReady(e0.message));
    if ((count ?? 0) > 0) throw new Error("The course is already imported — edit it on the Lessons tab.");
    // Levels → modules → lessons (keys link them); upsert so a half-finished import can be run again
    const { data: lv, error: e1 } = await supabase.from("learn_levels").upsert(p.levels.map((l) => ({ organisation_id: org.id, ...l })), { onConflict: "organisation_id,key" }).select("id, key");
    if (e1) throw new Error(e1.message);
    const levelId = new Map((lv ?? []).map((r) => [r.key as string, r.id as string]));
    const { data: md, error: e2 } = await supabase.from("learn_modules").upsert(p.modules.map(({ level_key, ...m }) => ({ organisation_id: org.id, level_id: levelId.get(level_key)!, ...m })), { onConflict: "organisation_id,key" }).select("id, key");
    if (e2) throw new Error(e2.message);
    const moduleId = new Map((md ?? []).map((r) => [r.key as string, r.id as string]));
    const rows = p.lessons.map(({ module_key, ...l }) => ({ organisation_id: org.id, module_id: moduleId.get(module_key)!, ...l }));
    for (let i = 0; i < rows.length; i += 40) {
      const { error } = await supabase.from("learn_lessons").upsert(rows.slice(i, i + 40), { onConflict: "organisation_id,key" });
      if (error) throw new Error(error.message);
    }
    const { error: e3 } = await supabase.from("learn_badges").upsert(p.badges.map((b) => ({ organisation_id: org.id, ...b })), { onConflict: "organisation_id,key" });
    if (e3) throw new Error(e3.message);
    const { error: e4 } = await supabase.from("learn_challenges").upsert(p.challenges.map((c) => ({ organisation_id: org.id, ...c })), { onConflict: "organisation_id,key" });
    if (e4) throw new Error(e4.message);
    const trainer = p.trainer.map((t) => ({ organisation_id: org.id, kind: t.kind, key: t.key, parent_key: (t as { parent_key?: string }).parent_key ?? null, position: t.position, data: t.data }));
    for (let i = 0; i < trainer.length; i += 50) {
      const { error } = await supabase.from("learn_trainer_items").upsert(trainer.slice(i, i + 50), { onConflict: "organisation_id,kind,key" });
      if (error) throw new Error(error.message);
    }
    const summary = `${p.levels.length} levels, ${p.modules.length} modules, ${p.lessons.length} lessons, ${p.badges.length} badges, ${p.challenges.length} daily challenges and the trainer manual`;
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "learn.imported", entityType: "organisation", entityId: org.id, summary: `${actorName(profile)} imported the online course from the Replit app — ${summary}` });
    done(); return { ok: true, data: summary };
  } catch (e) { return { ok: false, error: err(e) }; }
}

/* ------------------------------------------------------------------ content */

export interface LessonInput { title: string; duration_minutes: number; xp_reward: number; content: string; key_points: string[]; quiz: { question: string; options: string[]; correct_index: number; explanation: string } | null; published: boolean }

export async function saveLesson(id: string, v: LessonInput): Promise<Result> {
  try {
    const { supabase, org, user, profile } = await manager();
    if (!UUID.test(id)) throw new Error("Refresh and try again.");
    const title = v.title.trim().slice(0, 200);
    if (!title) throw new Error("Give the lesson a title.");
    const quiz = v.quiz && v.quiz.question.trim() ? readQuiz({ ...v.quiz, options: v.quiz.options.map((o) => o.trim()).filter(Boolean) }) : null;
    if (v.quiz && v.quiz.question.trim() && !quiz) throw new Error("The question needs at least two answers and the right one ticked.");
    const { data, error } = await supabase.from("learn_lessons").update({
      title, duration_minutes: Math.max(1, Math.min(600, Math.round(v.duration_minutes) || 5)), xp_reward: Math.max(0, Math.min(1000, Math.round(v.xp_reward) || 0)),
      content: v.content.slice(0, 60000), key_points: v.key_points.map((k) => k.trim()).filter(Boolean).slice(0, 12), quiz, published: !!v.published, updated_at: new Date().toISOString(),
    }).eq("id", id).eq("organisation_id", org.id).select("title").single();
    if (error) throw new Error(error.message);
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "learn.lesson_edited", entityType: "learn_lesson", entityId: id, summary: `${actorName(profile)} edited the lesson “${data.title}”` });
    done(); return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export async function addLesson(moduleId: string, title: string): Promise<Result<string>> {
  try {
    const { supabase, org } = await manager();
    if (!UUID.test(moduleId)) throw new Error("Refresh and try again.");
    const t = title.trim().slice(0, 200);
    if (!t) throw new Error("Give the lesson a title.");
    const { count } = await supabase.from("learn_lessons").select("id", { head: true, count: "exact" }).eq("module_id", moduleId);
    const { data, error } = await supabase.from("learn_lessons").insert({ organisation_id: org.id, module_id: moduleId, key: `x${Date.now().toString(36)}`, title: t, content: `## ${t}\n\n`, position: count ?? 0, published: false }).select("id").single();
    if (error) throw new Error(error.message);
    done(); return { ok: true, data: data.id as string };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export async function saveModule(id: string, v: { title: string; description: string; xp_reward: number; published: boolean }): Promise<Result> {
  try {
    const { supabase, org } = await manager();
    if (!UUID.test(id) || !v.title.trim()) throw new Error("Give the module a title.");
    const { error } = await supabase.from("learn_modules").update({ title: v.title.trim().slice(0, 200), description: v.description.trim().slice(0, 2000) || null, xp_reward: Math.max(0, Math.round(v.xp_reward) || 0), published: !!v.published }).eq("id", id).eq("organisation_id", org.id);
    if (error) throw new Error(error.message);
    done(); return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export async function saveLevel(id: string, v: { title: string; description: string; min_xp: number; xp_reward: number; certificate_title: string; published: boolean }): Promise<Result> {
  try {
    const { supabase, org } = await manager();
    if (!UUID.test(id) || !v.title.trim()) throw new Error("Give the level a title.");
    const { error } = await supabase.from("learn_levels").update({ title: v.title.trim().slice(0, 200), description: v.description.trim().slice(0, 2000) || null, min_xp: Math.max(0, Math.round(v.min_xp) || 0), xp_reward: Math.max(0, Math.round(v.xp_reward) || 0), certificate_title: v.certificate_title.trim().slice(0, 200) || null, published: !!v.published }).eq("id", id).eq("organisation_id", org.id);
    if (error) throw new Error(error.message);
    done(); return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export async function setActive(table: "learn_badges" | "learn_challenges", id: string, active: boolean): Promise<Result> {
  try {
    const { supabase, org } = await manager();
    if (!["learn_badges", "learn_challenges"].includes(table) || !UUID.test(id)) throw new Error("Refresh and try again.");
    const { error } = await supabase.from(table).update({ active }).eq("id", id).eq("organisation_id", org.id);
    if (error) throw new Error(error.message);
    done(); return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export async function saveChallenge(id: string | null, v: { title: string; description: string; xp_reward: number }): Promise<Result> {
  try {
    const { supabase, org } = await manager();
    const row = { title: v.title.trim().slice(0, 200), description: v.description.trim().slice(0, 1000) || null, xp_reward: Math.max(0, Math.min(1000, Math.round(v.xp_reward) || 0)) };
    if (!row.title) throw new Error("Give the challenge a title.");
    const { error } = id && UUID.test(id) ? await supabase.from("learn_challenges").update(row).eq("id", id).eq("organisation_id", org.id)
      : await supabase.from("learn_challenges").insert({ organisation_id: org.id, key: `c${Date.now().toString(36)}`, position: 99, ...row });
    if (error) throw new Error(error.message);
    done(); return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: err(e) }; }
}

/* ------------------------------------------------------------------ learners */

/** Give someone free access (staff, a prize, a make-good). */
export async function giveAccess(studentId: string, months: number, note: string): Promise<Result> {
  try {
    const { supabase, org, user, profile } = await manager();
    if (!UUID.test(studentId)) throw new Error("Choose a learner.");
    const m = Math.max(1, Math.min(36, Math.round(months) || 12));
    const { data: st } = await supabase.from("booking_students").select("name").eq("id", studentId).eq("organisation_id", org.id).maybeSingle();
    if (!st) throw new Error("Learner not found.");
    const now = new Date().toISOString();
    const { error } = await supabase.from("learn_access").insert({ organisation_id: org.id, student_id: studentId, plan: "comp", status: "active", price: 0, starts_at: now, ends_at: addMonths(now, m), note: note.trim().slice(0, 1000) || null });
    if (error) throw new Error(notReady(error.message));
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "learn.access_given", entityType: "booking_student", entityId: studentId, summary: `${actorName(profile)} gave ${st.name} ${m} months of free access to the online course` });
    done(); return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: err(e) }; }
}

/** Find a student (or make one) by email to give access to. */
export async function giveAccessByEmail(name: string, email: string, months: number, note: string): Promise<Result> {
  try {
    const { supabase, org } = await manager();
    const e = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new Error("Enter a valid email.");
    let { data: st } = await supabase.from("booking_students").select("id").eq("organisation_id", org.id).ilike("email", e.replace(/[%_\\]/g, "\\$&")).maybeSingle();
    if (!st) {
      if (name.trim().length < 2) throw new Error("No student with that email — add their name to create them.");
      const { data, error } = await supabase.from("booking_students").insert({ organisation_id: org.id, name: name.trim().slice(0, 160), email: e, source: "learn" }).select("id").single();
      if (error) throw new Error(error.message);
      st = data;
    }
    return giveAccess(st!.id as string, months, note);
  } catch (e) { return { ok: false, error: err(e) }; }
}

export async function endAccess(accessId: string): Promise<Result> {
  try {
    const { supabase, org, user, profile } = await manager();
    if (!UUID.test(accessId)) throw new Error("Refresh and try again.");
    const now = new Date().toISOString();
    const { data, error } = await supabase.from("learn_access").update({ status: "cancelled", renews: false, ends_at: now, cancelled_at: now }).eq("id", accessId).eq("organisation_id", org.id).select("student_id, plan").single();
    if (error) throw new Error(error.message);
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "learn.access_ended", entityType: "booking_student", entityId: data.student_id as string, summary: `${actorName(profile)} ended a ${PLAN_LABEL[data.plan as keyof typeof PLAN_LABEL].toLowerCase()} online course pass (no refund is made here — refund in Stripe if needed)` });
    done(); return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: err(e) }; }
}

/* ------------------------------------------------------------------ training rooms */

export async function saveVenue(id: string, v: { status: "pending" | "approved" | "hidden"; commission_pct: number; image_url: string; office_note: string; hourly_rate: number | null; day_rate: number | null }): Promise<Result> {
  try {
    const { supabase, org, user, profile } = await manager();
    if (!UUID.test(id) || !["pending", "approved", "hidden"].includes(v.status)) throw new Error("Refresh and try again.");
    const img = v.image_url.trim();
    if (img && !/^https:\/\//.test(img)) throw new Error("The photo link must start with https://");
    const { data, error } = await supabase.from("learn_venues").update({ status: v.status, commission_pct: Math.max(0, Math.min(100, Number(v.commission_pct) || 0)), image_url: img || null, office_note: v.office_note.trim().slice(0, 2000) || null,
      hourly_rate: v.hourly_rate && v.hourly_rate > 0 ? v.hourly_rate : null, day_rate: v.day_rate && v.day_rate > 0 ? v.day_rate : null }).eq("id", id).eq("organisation_id", org.id).select("name").single();
    if (error) throw new Error(error.message);
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "learn.venue_saved", entityType: "learn_venue", entityId: id, summary: `${actorName(profile)} set the training room “${data.name}” to ${v.status}` });
    done(); return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: err(e) }; }
}

/** Confirm a room hire with its price — works out the commission and gives a payment link to send the hirer. */
export async function confirmHire(id: string, amount: number): Promise<Result<string>> {
  try {
    const { supabase, org, user, profile } = await manager();
    if (!UUID.test(id)) throw new Error("Refresh and try again.");
    const { data: h, error: e1 } = await supabase.from("learn_venue_bookings").select("id, name, status, pay_token, venue:learn_venues(name, commission_pct)").eq("id", id).eq("organisation_id", org.id).single();
    if (e1) throw new Error(e1.message);
    if (h.status === "paid") throw new Error("This hire is already paid.");
    const v = h.venue as unknown as { name: string; commission_pct: number };
    const split = hireSplit(amount, Number(v.commission_pct));
    if (split.amount <= 0) throw new Error("Enter the price for the hire.");
    const { error } = await supabase.from("learn_venue_bookings").update({ status: "confirmed", amount: split.amount, commission: split.commission }).eq("id", id);
    if (error) throw new Error(error.message);
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "learn.hire_confirmed", entityType: "learn_venue_booking", entityId: id, summary: `${actorName(profile)} confirmed ${h.name}'s hire of ${v.name} at ${money(split.amount)} (commission ${money(split.commission)})` });
    done(); return { ok: true, data: `/academy/${(org as { slug: string }).slug}/rooms/pay/${h.pay_token}` };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export async function setHireStatus(id: string, status: "cancelled" | "venue_paid"): Promise<Result> {
  try {
    const { supabase, org } = await manager();
    if (!UUID.test(id)) throw new Error("Refresh and try again.");
    const patch = status === "cancelled" ? { status: "cancelled" } : { venue_paid_at: new Date().toISOString() };
    const { error } = await supabase.from("learn_venue_bookings").update(patch).eq("id", id).eq("organisation_id", org.id);
    if (error) throw new Error(error.message);
    done(); return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: err(e) }; }
}
