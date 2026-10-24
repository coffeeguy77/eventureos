import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/integrations/runtime";
import { appBaseUrl } from "@/lib/integrations/registry";
import { loadStripe } from "@/lib/payments/service";
import { chargeSavedCard, createCheckout, getCheckoutSession, getPaymentIntent, StripeError, toCents, type CheckoutSession } from "@/lib/payments/stripe";
import { emailConfigured, sendEmail } from "@/lib/email/send";
import { shell } from "@/lib/bookings/emails";
import { brandOf, ensureStudent, orgById, publicOrg, type PublicOrg } from "@/lib/bookings/server";
import { cleanEmail } from "@/lib/bookings/core";
import type { Student } from "@/lib/bookings/student-auth";
import { money, todayISO } from "@/lib/format";
import {
  accessWindow, addMonths, boardName, challengeFor, courseOffersAddon, earned, gradeMastery, hireSplit, liveAccess, masteryQuestions, moduleInOneDay, PLAN_LABEL,
  readLearnSettings, readQuiz, readRule, type AccessRow, type LearnerStats, type LearnSettings, type Lesson, type Level, type Module, type Plan,
} from "./core";
import { scoreRoast, evaluateRoast } from "./roast-sim";

export const missingTable = (e: { message?: string; code?: string } | null | undefined) => !!e && (e.code === "42P01" || e.code === "PGRST205" || /relation .* does not exist|Could not find the table/i.test(e.message ?? ""));

/* ------------------------------------------------------------------ organisation */

export interface LearnOrg extends PublicOrg { learn: LearnSettings }
const withLearn = (o: PublicOrg): LearnOrg => ({ ...o, learn: readLearnSettings(o.rawSettings) });
export async function learnOrg(slug: string, db = createServiceClient()) { const o = await publicOrg(slug, db); return o ? withLearn(o) : null; }
export async function learnOrgById(db: SupabaseClient, id: string) { return withLearn(await orgById(db, id)); }
export const academyUrl = (o: Pick<PublicOrg, "slug">, path = "") => `${appBaseUrl()}/academy/${o.slug}${path}`;

/** True once the database update (0063_learn.sql) has been run. */
export async function learnReady(db: SupabaseClient) {
  const { error } = await db.from("learn_levels").select("id", { head: true, count: "exact" }).limit(1);
  return !missingTable(error);
}

/* ------------------------------------------------------------------ curriculum */

const LESSON_LIST = "id, key, module_id, title, duration_minutes, xp_reward, quiz, position, published";
export interface Curriculum { levels: Level[]; modules: Module[]; lessons: Omit<Lesson, "content" | "key_points">[] }

export async function loadCurriculum(db: SupabaseClient, orgId: string, opts: { all?: boolean } = {}): Promise<Curriculum> {
  const only = opts.all ? [true, false] : [true];
  const [lv, md, ls] = await Promise.all([
    db.from("learn_levels").select("id, key, number, title, description, min_xp, xp_reward, position, published, certificate_title").eq("organisation_id", orgId).in("published", only).order("number").order("position"),
    db.from("learn_modules").select("id, key, level_id, title, description, xp_reward, position, published").eq("organisation_id", orgId).in("published", only).order("position"),
    db.from("learn_lessons").select(LESSON_LIST).eq("organisation_id", orgId).in("published", only).order("position").limit(5000),
  ]);
  if (missingTable(lv.error)) return { levels: [], modules: [], lessons: [] };
  for (const r of [lv, md, ls]) if (r.error) throw new Error(r.error.message);
  const levels = (lv.data ?? []) as Level[];
  const levelIds = new Set(levels.map((l) => l.id));
  const modules = ((md.data ?? []) as Module[]).filter((m) => levelIds.has(m.level_id));
  const moduleIds = new Set(modules.map((m) => m.id));
  const lessons = ((ls.data ?? []) as (Omit<Lesson, "content" | "key_points" | "quiz"> & { quiz: unknown })[]).filter((l) => moduleIds.has(l.module_id)).map((l) => ({ ...l, quiz: readQuiz(l.quiz) }));
  return { levels, modules, lessons };
}

export async function loadLesson(db: SupabaseClient, orgId: string, id: string): Promise<Lesson | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await db.from("learn_lessons").select(`${LESSON_LIST}, content, key_points`).eq("organisation_id", orgId).eq("id", id).maybeSingle();
  if (!data) return null;
  const r = data as Record<string, unknown>;
  return { ...(r as unknown as Lesson), quiz: readQuiz(r.quiz), key_points: Array.isArray(r.key_points) ? (r.key_points as unknown[]).filter((x): x is string => typeof x === "string") : [] };
}

/** The free sample: the first module of the first level. */
export function freeModuleId(c: Curriculum) {
  const first = [...c.levels].sort((a, b) => a.number - b.number || a.position - b.position)[0];
  if (!first) return null;
  return c.modules.filter((m) => m.level_id === first.id).sort((a, b) => a.position - b.position)[0]?.id ?? null;
}

/* ------------------------------------------------------------------ the learner */

export interface LearnerRow { id: string; xp: number; streak_days: number; best_streak: number; last_active_on: string | null; display_name: string | null; coach_style: string; on_leaderboard: boolean; best_art: number }
export interface Access extends AccessRow { price: number; currency: string; booking_id: string | null; card_label: string | null; last_error: string | null; cancelled_at: string | null; created_at: string }
const ACCESS_COLS = "id, plan, status, starts_at, ends_at, renews, price, currency, booking_id, card_label, last_error, cancelled_at, created_at";

export interface LearnerState {
  learner: LearnerRow; access: Access[]; live: Access | null;
  /** the owner testing (everything open, no limits) */
  god: boolean;
  done: Map<string, string>; passedModules: Set<string>; badges: Set<string>; challengesDone: number; challengeToday: boolean;
}

export async function learnerState(db: SupabaseClient, org: LearnOrg, studentId: string, opts: { god?: boolean } = {}): Promise<LearnerState> {
  await db.from("learn_learners").upsert({ organisation_id: org.id, student_id: studentId }, { onConflict: "organisation_id,student_id", ignoreDuplicates: true });
  const today = todayISO(org.timezone);
  const [ln, ac, pr, qa, bd, ch, chToday] = await Promise.all([
    db.from("learn_learners").select("id, xp, streak_days, best_streak, last_active_on, display_name, coach_style, on_leaderboard, best_art").eq("organisation_id", org.id).eq("student_id", studentId).single(),
    db.from("learn_access").select(ACCESS_COLS).eq("organisation_id", org.id).eq("student_id", studentId).order("created_at", { ascending: false }),
    db.from("learn_progress").select("lesson_id, completed_at").eq("organisation_id", org.id).eq("student_id", studentId),
    db.from("learn_quiz_attempts").select("module_id").eq("organisation_id", org.id).eq("student_id", studentId).eq("passed", true),
    db.from("learn_badge_awards").select("badge_key").eq("organisation_id", org.id).eq("student_id", studentId),
    db.from("learn_challenge_done").select("id", { count: "exact", head: true }).eq("organisation_id", org.id).eq("student_id", studentId),
    db.from("learn_challenge_done").select("id", { count: "exact", head: true }).eq("organisation_id", org.id).eq("student_id", studentId).eq("done_on", today),
  ]);
  if (ln.error) throw new Error(ln.error.message);
  const learner = ln.data as LearnerRow;
  // A streak that missed yesterday shows as broken (it restarts on the next activity)
  if (learner.last_active_on && learner.last_active_on < todayMinus(today, 1)) learner.streak_days = 0;
  const access = (ac.data ?? []) as Access[];
  const god = !!opts.god;
  const godPass: Access = { id: "test", plan: "comp", status: "active", starts_at: null, ends_at: null, renews: false, price: 0, currency: org.currency, booking_id: null, card_label: null, last_error: null, cancelled_at: null, created_at: new Date().toISOString() };
  return {
    learner, access, live: god ? liveAccess(access) ?? godPass : liveAccess(access), god,
    done: new Map(((pr.data ?? []) as { lesson_id: string; completed_at: string }[]).map((r) => [r.lesson_id, r.completed_at])),
    passedModules: new Set(((qa.data ?? []) as { module_id: string }[]).map((r) => r.module_id)),
    badges: new Set(((bd.data ?? []) as { badge_key: string }[]).map((r) => r.badge_key)),
    challengesDone: ch.count ?? 0, challengeToday: (chToday.count ?? 0) > 0,
  };
}
const todayMinus = (iso: string, d: number) => { const x = new Date(`${iso}T00:00:00Z`); x.setUTCDate(x.getUTCDate() - d); return x.toISOString().slice(0, 10); };

/** May this learner open this lesson? (paid access, or the free sample module) */
export function canOpenLesson(c: Curriculum, s: Pick<LearnerState, "live"> | null, lessonModuleId: string) {
  return !!s?.live || freeModuleId(c) === lessonModuleId;
}

/* ------------------------------------------------------------------ progress, XP, badges */

export interface Outcome { xp: number; badges: string[]; levelDone?: string | null; message?: string }

export async function completeLesson(org: LearnOrg, me: Student, lessonId: string, answer: number | null): Promise<Outcome & { correct: boolean }> {
  const db = createServiceClient();
  const lesson = await loadLesson(db, org.id, lessonId);
  if (!lesson || !lesson.published) throw new Error("That lesson isn't available.");
  const c = await loadCurriculum(db, org.id);
  const state = await learnerState(db, org, me.id, { god: me.god });
  if (!canOpenLesson(c, state, lesson.module_id)) throw new Error("This lesson is part of the full course.");
  const correct = !lesson.quiz || answer === lesson.quiz.correct_index;
  if (!correct) return { xp: 0, badges: [], correct: false };
  const { data: xp, error } = await db.rpc("learn_complete_lesson", { p_org: org.id, p_student: me.id, p_lesson: lesson.id, p_today: todayISO(org.timezone) });
  if (error) throw new Error(error.message);
  const after = await afterProgress(db, org, me.id, c);
  return { xp: Number(xp) || 0, correct: true, ...after };
}

/** Level rewards and badges after any progress. */
async function afterProgress(db: SupabaseClient, org: LearnOrg, studentId: string, c: Curriculum): Promise<{ badges: string[]; levelDone: string | null }> {
  const s = await learnerState(db, org, studentId);
  // A level is done when every lesson in it is complete → its XP reward, once (recorded as badge "level-<key>")
  let levelDone: string | null = null;
  const levelsDone: string[] = [];
  for (const l of c.levels) {
    const mods = c.modules.filter((m) => m.level_id === l.id).map((m) => m.id);
    const ls = c.lessons.filter((x) => mods.includes(x.module_id));
    if (!ls.length || !ls.every((x) => s.done.has(x.id))) continue;
    levelsDone.push(l.key);
    if (!s.badges.has(`level-${l.key}`)) {
      const { error } = await db.from("learn_badge_awards").insert({ organisation_id: org.id, student_id: studentId, badge_key: `level-${l.key}` });
      if (!error) {
        if (l.xp_reward > 0) await db.rpc("learn_add_xp", { p_org: org.id, p_student: studentId, p_xp: l.xp_reward, p_today: todayISO(org.timezone) });
        levelDone = l.title;
        s.badges.add(`level-${l.key}`);
      }
    }
  }
  const { data: roast } = await db.from("learn_roasts").select("score").eq("organisation_id", org.id).eq("student_id", studentId).order("score", { ascending: false }).limit(1).maybeSingle();
  const stats: LearnerStats = {
    lessons: s.done.size, streak: s.learner.streak_days, bestStreak: s.learner.best_streak, levelsDone, bestRoast: Number(roast?.score ?? 0),
    challenges: s.challengesDone, bestArt: s.learner.best_art,
    moduleInADay: moduleInOneDay(c.modules.map((m) => ({ id: m.id, lessonIds: c.lessons.filter((x) => x.module_id === m.id).map((x) => x.id) })), s.done, org.timezone),
  };
  const { data: badges } = await db.from("learn_badges").select("key, name, rule").eq("organisation_id", org.id).eq("active", true);
  const fresh: string[] = [];
  for (const b of (badges ?? []) as { key: string; name: string; rule: unknown }[]) {
    if (s.badges.has(b.key) || !earned(readRule(b.rule), stats)) continue;
    const { error } = await db.from("learn_badge_awards").insert({ organisation_id: org.id, student_id: studentId, badge_key: b.key });
    if (!error) fresh.push(b.name);
  }
  return { badges: fresh, levelDone };
}

export async function submitMastery(org: LearnOrg, me: Student, moduleId: string, answers: (number | null)[]) {
  const db = createServiceClient();
  const c = await loadCurriculum(db, org.id);
  const mod = c.modules.find((m) => m.id === moduleId);
  if (!mod) throw new Error("That module isn't available.");
  const state = await learnerState(db, org, me.id, { god: me.god });
  if (!canOpenLesson(c, state, mod.id)) throw new Error("This quiz is part of the full course.");
  const qs = masteryQuestions(c.lessons.filter((l) => l.module_id === mod.id));
  if (!qs.length) throw new Error("This module has no quiz.");
  const g = gradeMastery(qs, answers);
  const first = g.passed && !state.passedModules.has(mod.id);
  await db.from("learn_quiz_attempts").insert({ organisation_id: org.id, student_id: me.id, module_id: mod.id, score: g.score, out_of: g.outOf, passed: g.passed });
  let xp = 0;
  if (first && mod.xp_reward > 0) { await db.rpc("learn_add_xp", { p_org: org.id, p_student: me.id, p_xp: mod.xp_reward, p_today: todayISO(org.timezone) }); xp = mod.xp_reward; }
  const after = await afterProgress(db, org, me.id, c);
  return { ...g, xp, ...after, review: qs.map((q, i) => ({ question: q.question, chosen: answers[i] ?? null, correct_index: q.correct_index, options: q.options, explanation: q.explanation ?? null })) };
}

export async function doChallenge(org: LearnOrg, me: Student, challengeId: string, note: string): Promise<Outcome> {
  const db = createServiceClient();
  const today = todayISO(org.timezone);
  const { data: list } = await db.from("learn_challenges").select("id, title, xp_reward").eq("organisation_id", org.id).eq("active", true).order("position");
  const ch = challengeFor((list ?? []) as { id: string; title: string; xp_reward: number }[], today);
  if (!ch || ch.id !== challengeId) throw new Error("That's not today's challenge — refresh the page.");
  const state = await learnerState(db, org, me.id, { god: me.god });
  if (!state.live) throw new Error("Daily challenges are part of the full course.");
  const { error } = await db.from("learn_challenge_done").insert({ organisation_id: org.id, student_id: me.id, challenge_id: ch.id, done_on: today, note: note.trim().slice(0, 1000) || null });
  if (error) { if (/duplicate|unique/i.test(error.message)) return { xp: 0, badges: [], message: "Already done today — come back tomorrow." }; throw new Error(error.message); }
  await db.rpc("learn_add_xp", { p_org: org.id, p_student: me.id, p_xp: ch.xp_reward, p_today: today });
  const after = await afterProgress(db, org, me.id, await loadCurriculum(db, org.id));
  return { xp: ch.xp_reward, ...after };
}

/** Save a simulator roast. The score is worked out again here from the curve (the same engine as the browser). */
export async function saveRoast(org: LearnOrg, me: Student, r: { name: string; history: { time: number; bt: number; ror: number }[]; firstCrack: number | null; drop: number | null }): Promise<Outcome & { score: number }> {
  const db = createServiceClient();
  const state = await learnerState(db, org, me.id, { god: me.god });
  if (!state.live) throw new Error("Saving roasts is part of the full course.");
  const history = (Array.isArray(r.history) ? r.history : []).slice(0, 3600).map((p) => ({ time: Math.round(Number(p.time)), bt: Math.round(Number(p.bt) * 10) / 10, ror: Math.round(Number(p.ror) * 10) / 10 }))
    .filter((p) => Number.isFinite(p.time) && Number.isFinite(p.bt) && Number.isFinite(p.ror));
  if (history.length < 30) throw new Error("Roast for at least 30 seconds before saving.");
  const fc = r.firstCrack !== null && Number.isFinite(Number(r.firstCrack)) ? Math.round(Number(r.firstCrack)) : null;
  const drop = r.drop !== null && Number.isFinite(Number(r.drop)) ? Math.round(Number(r.drop)) : history[history.length - 1].time;
  const score = scoreRoast(history, fc, drop);
  const today = todayISO(org.timezone);
  // XP: up to 20 for the first saved roast each day (score × 2)
  const { count } = await db.from("learn_roasts").select("id", { count: "exact", head: true }).eq("organisation_id", org.id).eq("student_id", me.id).gte("created_at", `${today}T00:00:00`);
  const { error } = await db.from("learn_roasts").insert({ organisation_id: org.id, student_id: me.id, name: r.name.trim().slice(0, 120) || null, history, first_crack_s: fc, drop_s: drop, score, issues: evaluateRoast(history, fc, drop) });
  if (error) throw new Error(error.message);
  const xp = (count ?? 0) === 0 ? Math.round(score * 2) : 0;
  if (xp) await db.rpc("learn_add_xp", { p_org: org.id, p_student: me.id, p_xp: xp, p_today: today });
  const after = await afterProgress(db, org, me.id, await loadCurriculum(db, org.id));
  return { xp, score, ...after };
}

export async function recordArtScore(org: LearnOrg, studentId: string, overall: number) {
  const db = createServiceClient();
  const { data } = await db.from("learn_learners").select("best_art").eq("organisation_id", org.id).eq("student_id", studentId).maybeSingle();
  if (data && overall > (data.best_art as number)) await db.from("learn_learners").update({ best_art: Math.min(100, Math.round(overall)) }).eq("organisation_id", org.id).eq("student_id", studentId);
  return afterProgress(db, org, studentId, await loadCurriculum(db, org.id));
}

/** Count an AI use for today; false when the daily limit is reached. */
export async function useAi(org: LearnOrg, studentId: string, kind: "messages" | "photos", god = false) {
  if (god) return true;
  const db = createServiceClient();
  const day = todayISO(org.timezone);
  const limit = kind === "messages" ? org.learn.ai.dailyMessages : org.learn.ai.dailyPhotos;
  const { data } = await db.from("learn_ai_usage").select("messages, photos").eq("student_id", studentId).eq("day", day).maybeSingle();
  const used = Number((data as Record<string, number> | null)?.[kind] ?? 0);
  if (used >= limit) return false;
  await db.from("learn_ai_usage").upsert({ organisation_id: org.id, student_id: studentId, day, messages: Number(data?.messages ?? 0) + (kind === "messages" ? 1 : 0), photos: Number(data?.photos ?? 0) + (kind === "photos" ? 1 : 0) }, { onConflict: "student_id,day" });
  return true;
}

export async function leaderboard(db: SupabaseClient, orgId: string, limit = 20) {
  const { data } = await db.from("learn_learners").select("student_id, xp, streak_days, display_name, student:booking_students(name)").eq("organisation_id", orgId).eq("on_leaderboard", true).gt("xp", 0).order("xp", { ascending: false }).limit(limit);
  return ((data ?? []) as unknown as { student_id: string; xp: number; streak_days: number; display_name: string | null; student: { name: string } | null }[])
    .map((r, i) => ({ rank: i + 1, studentId: r.student_id, name: boardName(r.display_name, r.student?.name ?? "Learner"), xp: r.xp, streak: r.streak_days }));
}

/* ------------------------------------------------------------------ buying access */

export type BuyResult = { ok: true; redirect: string } | { ok: false; error: string };

/** Can this student get the with-a-course price? (a booking for an add-on course that's coming up, or finished within pastStudentDays) */
export async function courseEligible(db: SupabaseClient, org: LearnOrg, studentId: string, email: string | null): Promise<{ bookingId: string } | null> {
  const cols = "id, course_id, status, session:booking_sessions(ends_at)";
  const [a, b] = await Promise.all([
    db.from("bookings").select(cols).eq("organisation_id", org.id).eq("student_id", studentId).eq("is_test", false).in("status", ["confirmed", "attended"]),
    email ? db.from("bookings").select(cols).eq("organisation_id", org.id).eq("contact_email", email).eq("is_test", false).in("status", ["confirmed", "attended"]) : Promise.resolve({ data: [] }),
  ]);
  const rows = [...(a.data ?? []), ...(b.data ?? [])] as unknown as { id: string; course_id: string; session: { ends_at: string } | null }[];
  const cutoff = Date.now() - org.learn.pastStudentDays * 86400e3;
  const ok = rows.filter((r) => courseOffersAddon(org.learn, r.course_id) && r.session && Date.parse(r.session.ends_at) >= cutoff);
  if (!ok.length) return null;
  // Not if this booking already came with the online course
  const { data: used } = await db.from("learn_access").select("booking_id").eq("organisation_id", org.id).in("booking_id", ok.map((r) => r.id)).in("status", ["active", "expired"]);
  const usedIds = new Set(((used ?? []) as { booking_id: string }[]).map((u) => u.booking_id));
  const free = ok.find((r) => !usedIds.has(r.id));
  return free ? { bookingId: free.id } : null;
}

export async function startLearnCheckout(input: { orgSlug: string; plan: Plan; student: Student | null; name?: string; email?: string; marketing?: boolean }): Promise<BuyResult> {
  const db = createServiceClient();
  const org = await learnOrg(input.orgSlug, db);
  if (!org || !org.learn.enabled) return { ok: false, error: "The online course isn't on sale right now." };
  if (!org.learn.plans[input.plan]) return { ok: false, error: "That option isn't available." };
  if (!(await learnReady(db))) return { ok: false, error: "The online course is being set up — please try again soon." };
  let student = input.student;
  if (!student) {
    const email = cleanEmail(input.email ?? "");
    const name = (input.name ?? "").trim().replace(/\s+/g, " ").slice(0, 160);
    if (name.length < 2) return { ok: false, error: "Enter your name." };
    if (!email) return { ok: false, error: "Enter a valid email — it's how you'll sign in." };
    const id = await ensureStudent(db, org.id, { name, email, phone: null, marketing: input.marketing, source: "learn" });
    student = { id, name, email, phone: null, marketing_ok: !!input.marketing, certificate_requested_at: null };
  }
  let bookingId: string | null = null;
  if (input.plan === "with_course") {
    const el = await courseEligible(db, org, student.id, student.email);
    if (!el) return { ok: false, error: "The with-a-course price is for students booked on one of our barista courses. Choose monthly or yearly instead." };
    bookingId = el.bookingId;
  }
  const { data: cur } = await db.from("learn_access").select(ACCESS_COLS).eq("organisation_id", org.id).eq("student_id", student.id);
  const live = liveAccess((cur ?? []) as Access[]);
  if (live?.plan === "monthly" && live.renews) return { ok: false, error: "You're on the monthly plan already. Cancel it on your account page first if you'd like to switch." };
  const price = org.learn.prices[input.plan];
  const { data: row, error } = await db.from("learn_access").insert({ organisation_id: org.id, student_id: student.id, plan: input.plan, status: "pending", price, currency: org.currency, booking_id: bookingId, renews: input.plan === "monthly" })
    .select("id").single();
  if (error) return { ok: false, error: error.message };
  const accessId = row.id as string;
  if (price <= 0) { await activateAccess(db, org, accessId, null); return { ok: true, redirect: academyUrl(org, "?welcome=1") }; }
  const cfg = org.stripeReady ? await loadStripe(db, org.id).catch(() => null) : null;
  if (!cfg) { await db.from("learn_access").update({ status: "cancelled", last_error: "Card payments not set up" }).eq("id", accessId); return { ok: false, error: `${org.name} can't take card payments online right now.` }; }
  try {
    const { data: cust } = await db.from("learn_access").select("stripe_customer_id").eq("organisation_id", org.id).eq("student_id", student.id).not("stripe_customer_id", "is", null).limit(1).maybeSingle();
    const cs = await createCheckout(cfg.secretKey, {
      amountCents: toCents(price), currency: org.currency, name: `${org.learn.name} — ${PLAN_LABEL[input.plan]}`,
      description: input.plan === "monthly" ? `${money(price, org.currency)} a month — cancel any time` : `${org.learn.accessMonths} months of access`,
      email: student.email, successUrl: academyUrl(org, `/joined?a=${accessId}`), cancelUrl: academyUrl(org, "/join?cancelled=1"),
      metadata: { eventureos_learn_access: accessId, eventureos_org_id: org.id }, idempotencyKey: `learn-${accessId}`, account: cfg.account,
      saveCard: input.plan === "monthly" ? { customerId: (cust?.stripe_customer_id as string) ?? null } : null,
    });
    if (!cs.url) throw new Error("Stripe didn't return a payment page");
    await db.from("learn_access").update({ stripe_session_id: cs.id }).eq("id", accessId);
    return { ok: true, redirect: cs.url };
  } catch (e) {
    await db.from("learn_access").update({ status: "cancelled", last_error: "Checkout didn't open" }).eq("id", accessId);
    return { ok: false, error: `Couldn't open the card payment page: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** Switch on a paid (or free) pass. Safe to call twice. */
export async function activateAccess(db: SupabaseClient, org: LearnOrg, accessId: string, s: (CheckoutSession & { id: string }) | null, opts: { paidAmount?: number } = {}) {
  const { data: a } = await db.from("learn_access").select("id, student_id, plan, status, price, currency").eq("id", accessId).eq("organisation_id", org.id).maybeSingle();
  if (!a) return "learn access not found";
  if (a.status === "active") return "already active";
  const { data: others } = await db.from("learn_access").select(ACCESS_COLS).eq("organisation_id", org.id).eq("student_id", a.student_id).neq("id", accessId);
  const live = liveAccess((others ?? []) as Access[]);
  const plan = a.plan as Plan;
  const w = accessWindow(plan, live?.ends_at ?? null, org.learn.accessMonths);
  const patch: Record<string, unknown> = { status: "active", starts_at: w.starts_at, ends_at: w.ends_at, stripe_session_id: s?.id ?? null, stripe_payment_intent: s?.payment_intent ?? null, failed_attempts: 0, last_error: null };
  if (s?.payment_intent) {
    try {
      const cfg = await loadStripe(db, org.id);
      if (cfg) {
        const pi = await getPaymentIntent(cfg.secretKey, s.payment_intent, cfg.account);
        const pm = typeof pi.payment_method === "object" && pi.payment_method ? pi.payment_method : null;
        if (pi.customer) patch.stripe_customer_id = pi.customer;
        if (pm?.id && plan === "monthly") { patch.stripe_payment_method = pm.id; patch.card_label = pm.card?.last4 ? `${(pm.card.brand ?? "Card").replace(/^\w/, (x) => x.toUpperCase())} •••• ${pm.card.last4}` : "Card on file"; }
      }
    } catch (e) { console.error("[learn] card details:", e); }
  }
  const { data: upd } = await db.from("learn_access").update(patch).eq("id", accessId).neq("status", "active").select("id");
  if (!upd?.length) return "already active";
  const amount = opts.paidAmount ?? Number(a.price);
  if (s && amount > 0) await db.from("learn_payments").insert({ organisation_id: org.id, access_id: accessId, amount, currency: a.currency, kind: "first", stripe_payment_intent: s.payment_intent ?? s.id }).then(() => null, () => null);
  const { data: st } = await db.from("booking_students").select("name, email").eq("id", a.student_id).maybeSingle();
  await db.from("activity_logs").insert({ organisation_id: org.id, actor_type: "system", actor_label: "Learn", action: "learn.access_started", entity_type: "booking_student", entity_id: a.student_id,
    summary: `${st?.name ?? "A learner"} started the online course — ${PLAN_LABEL[plan]}${amount > 0 ? ` (${money(amount, org.currency)})` : ""}` }).then(() => null, () => null);
  if (org.learn.welcomeEmail && st?.email && emailConfigured()) {
    const m = shell(brandOf(org), { title: `Welcome to ${org.learn.name}`, heading: `You're in, ${String(st.name).split(/\s+/)[0]}!`,
      intro: [`Your access to ${org.learn.name} is ready${w.ends_at && plan !== "monthly" ? ` until ${new Date(w.ends_at).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: org.timezone })}` : ""}.`, "Sign in with this email address — no password needed."],
      buttons: [{ label: "Start learning", url: academyUrl(org) }] });
    await sendEmail({ to: st.email as string, subject: m.subject, html: m.html, text: m.text, replyTo: org.settings.reply_to ?? org.contact_email, fromName: org.name }).catch(() => undefined);
  }
  return `learn access ${accessId} active (${plan})`;
}

/** Stripe webhook: a standalone purchase. */
export async function settleLearnCheckout(db: SupabaseClient, orgId: string, accessId: string, s: CheckoutSession & { id: string }) {
  return activateAccess(db, await learnOrgById(db, orgId), accessId, s);
}

/** Back from Stripe before the webhook: ask Stripe and settle. */
export async function settleLearnReturn(org: LearnOrg, accessId: string) {
  const db = createServiceClient();
  const { data: a } = await db.from("learn_access").select("id, status, stripe_session_id").eq("organisation_id", org.id).eq("id", accessId).maybeSingle();
  if (!a || a.status !== "pending" || !a.stripe_session_id) return;
  const cfg = await loadStripe(db, org.id).catch(() => null);
  if (!cfg) return;
  const s = await getCheckoutSession(cfg.secretKey, a.stripe_session_id as string, cfg.account).catch(() => null);
  if (s?.payment_status === "paid" && s.metadata?.eventureos_learn_access === accessId) await activateAccess(db, org, accessId, s as CheckoutSession & { id: string });
}

/* ------------------------------------------------------------------ the add-on at barista course checkout */

/** Booking checkout: hold a with-course pass for this booking (paid in the same Stripe payment). */
export async function prepareAddon(db: SupabaseClient, org: PublicOrg, studentId: string, bookingId: string, courseId: string) {
  const s = readLearnSettings(org.rawSettings);
  if (!courseOffersAddon(s, courseId)) return null;
  const { data, error } = await db.from("learn_access").insert({ organisation_id: org.id, student_id: studentId, plan: "with_course", status: "pending", price: s.prices.with_course, currency: org.currency, booking_id: bookingId })
    .select("id").single();
  if (error) { console.error("[learn] add-on:", error.message); return null; }
  return { id: data.id as string, price: s.prices.with_course, name: `${s.name} — ${s.accessMonths} months` };
}

/** The booking was paid: switch on the add-on that came with it. */
export async function settleAddon(db: SupabaseClient, orgId: string, accessId: string, s: CheckoutSession & { id: string }) {
  const org = await learnOrgById(db, orgId);
  const { data: a } = await db.from("learn_access").select("price").eq("id", accessId).eq("organisation_id", orgId).maybeSingle();
  return activateAccess(db, org, accessId, s, { paidAmount: Number(a?.price ?? 0) });
}

/* ------------------------------------------------------------------ learner self-service */

export async function cancelMonthly(org: LearnOrg, me: Student) {
  const db = createServiceClient();
  const { data } = await db.from("learn_access").update({ renews: false, cancelled_at: new Date().toISOString() }).eq("organisation_id", org.id).eq("student_id", me.id).eq("plan", "monthly").eq("renews", true).in("status", ["active", "payment_failed"]).select("id, ends_at");
  if (!data?.length) throw new Error("There's no monthly plan to cancel.");
  await db.from("activity_logs").insert({ organisation_id: org.id, actor_type: "system", actor_label: "Learn", action: "learn.cancelled", entity_type: "booking_student", entity_id: me.id, summary: `${me.name} cancelled their monthly online course (access until ${String(data[0].ends_at ?? "").slice(0, 10)})` }).then(() => null, () => null);
}

export async function saveProfile(org: LearnOrg, me: Student, p: { displayName: string; coachStyle: string; onLeaderboard: boolean }) {
  const db = createServiceClient();
  const style = ["mentor", "strict", "funny"].includes(p.coachStyle) ? p.coachStyle : "mentor";
  await db.from("learn_learners").upsert({ organisation_id: org.id, student_id: me.id, display_name: p.displayName.trim().slice(0, 40) || null, coach_style: style, on_leaderboard: !!p.onLeaderboard }, { onConflict: "organisation_id,student_id" });
}

/* ------------------------------------------------------------------ daily jobs (cron) */

export async function runLearnJobs(db: SupabaseClient) {
  const out = { expired: 0, renewed: 0, failed: 0, cancelled: 0, stale: 0, errors: [] as string[] };
  const now = new Date().toISOString();
  const { error: probe } = await db.from("learn_access").select("id", { head: true, count: "exact" }).limit(1);
  if (missingTable(probe)) return { skipped: "learn not set up" };
  // Unfinished checkouts
  const { data: stale } = await db.from("learn_access").update({ status: "cancelled", last_error: "Checkout not finished" }).eq("status", "pending").lt("created_at", new Date(Date.now() - 86400e3).toISOString()).select("id");
  out.stale = stale?.length ?? 0;
  // Passes that have ended (monthly ones that still renew are handled below)
  const { data: ended } = await db.from("learn_access").update({ status: "expired" }).eq("status", "active").eq("renews", false).lt("ends_at", now).select("id");
  out.expired = ended?.length ?? 0;
  // Monthly renewals due in the next day
  const soon = new Date(Date.now() + 86400e3).toISOString();
  const { data: due } = await db.from("learn_access").select("id, organisation_id, student_id, price, currency, ends_at, stripe_customer_id, stripe_payment_method, failed_attempts, status")
    .eq("plan", "monthly").eq("renews", true).in("status", ["active", "payment_failed"]).lt("ends_at", soon).limit(200);
  const orgs = new Map<string, LearnOrg>();
  for (const a of (due ?? []) as { id: string; organisation_id: string; student_id: string; price: number; currency: string; ends_at: string; stripe_customer_id: string | null; stripe_payment_method: string | null; failed_attempts: number; status: string }[]) {
    try {
      let org = orgs.get(a.organisation_id);
      if (!org) { org = await learnOrgById(db, a.organisation_id); orgs.set(a.organisation_id, org); }
      // Renewals only run while the business has the online course switched on (a week later the pass just ends)
      if (!org.learn.enabled) {
        if (Date.parse(a.ends_at) + 7 * 86400e3 < Date.now()) { await db.from("learn_access").update({ status: "expired", renews: false, last_error: "Online course switched off" }).eq("id", a.id); out.expired++; }
        continue;
      }
      // After 3 failed tries (a week apart at most), stop
      if (a.failed_attempts >= 3) {
        await db.from("learn_access").update({ status: "cancelled", renews: false, cancelled_at: now, last_error: "Payment failed 3 times" }).eq("id", a.id);
        out.cancelled++; continue;
      }
      const cfg = await loadStripe(db, a.organisation_id).catch(() => null);
      const price = org.learn.prices.monthly;
      const fail = async (why: string) => {
        await db.from("learn_access").update({ status: "payment_failed", failed_attempts: a.failed_attempts + 1, last_error: why.slice(0, 300) }).eq("id", a.id);
        out.failed++;
      };
      if (!cfg || !a.stripe_customer_id || !a.stripe_payment_method) { await fail("no card on file"); continue; }
      const { data: st } = await db.from("booking_students").select("email").eq("id", a.student_id).maybeSingle();
      try {
        const pi = await chargeSavedCard(cfg.secretKey, {
          amountCents: toCents(price), currency: org.currency, customer: a.stripe_customer_id, paymentMethod: a.stripe_payment_method, email: (st?.email as string) ?? null,
          description: `${org.learn.name} — monthly`, metadata: { eventureos_learn_renewal: a.id, eventureos_org_id: org.id },
          idempotencyKey: `learn-renew-${a.id}-${a.ends_at.slice(0, 10)}`, account: cfg.account,
        });
        if (pi.status !== "succeeded") { await fail(pi.last_payment_error?.message ?? `payment ${pi.status}`); continue; }
        await db.from("learn_access").update({ status: "active", ends_at: addMonths(a.ends_at, 1), price, failed_attempts: 0, last_error: null }).eq("id", a.id);
        await db.from("learn_payments").insert({ organisation_id: org.id, access_id: a.id, amount: price, currency: org.currency, kind: "renewal", stripe_payment_intent: pi.id }).then(() => null, () => null);
        out.renewed++;
      } catch (e) { await fail(e instanceof StripeError ? e.message : e instanceof Error ? e.message : String(e)); }
    } catch (e) { out.errors.push(`${a.id}: ${e instanceof Error ? e.message : String(e)}`); }
  }
  return out;
}

/* ------------------------------------------------------------------ training-room marketplace */

export interface Venue { id: string; name: string; business_name: string | null; suburb: string | null; state: string | null; postcode: string | null; address: string | null; capacity: number | null; description: string | null; equipment: string | null; image_url: string | null; hourly_rate: number | null; day_rate: number | null }
const VENUE_COLS = "id, name, business_name, suburb, state, postcode, address, capacity, description, equipment, image_url, hourly_rate, day_rate";

export async function listVenues(db: SupabaseClient, orgId: string, state?: string | null): Promise<Venue[]> {
  let q = db.from("learn_venues").select(VENUE_COLS).eq("organisation_id", orgId).eq("status", "approved").order("state").order("suburb");
  if (state) q = q.eq("state", state);
  const { data, error } = await q;
  if (missingTable(error)) return [];
  return (data ?? []) as Venue[];
}

export async function venueById(db: SupabaseClient, orgId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await db.from("learn_venues").select(VENUE_COLS).eq("organisation_id", orgId).eq("id", id).eq("status", "approved").maybeSingle();
  return (data as Venue) ?? null;
}

const clip = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);
const officeAlert = async (org: PublicOrg, heading: string, lines: { label: string; value: string }[], path: string) => {
  const to = org.settings.notify_email ?? org.contact_email;
  if (!to || !emailConfigured()) return;
  const m = shell(brandOf(org), { title: heading, heading, intro: ["From the online course's training-room marketplace."], rows: lines, buttons: [{ label: "Open in EventureOS", url: `${appBaseUrl()}${path}` }], footer: "Sent by EventureOS." });
  await sendEmail({ to, subject: m.subject, html: m.html, text: m.text, fromName: "EventureOS" }).catch(() => undefined);
};

export async function submitVenue(org: LearnOrg, v: Record<string, unknown>) {
  if (!org.learn.marketplace.enabled) throw new Error("Room listings aren't open right now.");
  const name = clip(v.name, 160), email = cleanEmail(String(v.email ?? ""));
  if (!name) throw new Error("Enter the room or venue name.");
  if (!email) throw new Error("Enter a valid email so we can get back to you.");
  const state = typeof v.state === "string" && ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"].includes(v.state) ? v.state : null;
  if (!state) throw new Error("Choose the state.");
  const postcode = typeof v.postcode === "string" && /^\d{4}$/.test(v.postcode.trim()) ? v.postcode.trim() : null;
  const n = (x: unknown) => { const k = Number(x); return Number.isFinite(k) && k > 0 ? Math.round(k * 100) / 100 : null; };
  const db = createServiceClient();
  const { error } = await db.from("learn_venues").insert({
    organisation_id: org.id, name, business_name: clip(v.business_name, 160), contact_name: clip(v.contact_name, 160), email, phone: clip(v.phone, 40),
    address: clip(v.address, 300), suburb: clip(v.suburb, 120), state, postcode, capacity: n(v.capacity) ? Math.min(500, Math.round(n(v.capacity)!)) : null,
    description: clip(v.description, 4000), equipment: clip(v.equipment, 2000), hourly_rate: n(v.hourly_rate), day_rate: n(v.day_rate),
    commission_pct: org.learn.marketplace.commissionPct, status: "pending",
  });
  if (error) throw new Error(error.message);
  await officeAlert(org, `New training room listing: ${name}`, [{ label: "Venue", value: name }, { label: "Where", value: [clip(v.suburb, 120), state].filter(Boolean).join(", ") }, { label: "Contact", value: email }], "/learn?tab=rooms");
}

export async function enquireVenue(org: LearnOrg, venueId: string, v: Record<string, unknown>) {
  if (!org.learn.marketplace.enabled) throw new Error("Room hire isn't open right now.");
  const db = createServiceClient();
  const venue = await venueById(db, org.id, venueId);
  if (!venue) throw new Error("That room isn't available.");
  const name = clip(v.name, 160), email = cleanEmail(String(v.email ?? ""));
  if (!name) throw new Error("Enter your name.");
  if (!email) throw new Error("Enter a valid email.");
  const wanted = typeof v.wanted_on === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.wanted_on) ? v.wanted_on : null;
  const hours = Number(v.hours); const people = Number(v.people);
  const { error } = await db.from("learn_venue_bookings").insert({ organisation_id: org.id, venue_id: venue.id, name, email, phone: clip(v.phone, 40), wanted_on: wanted,
    hours: Number.isFinite(hours) && hours > 0 ? Math.min(999, hours) : null, people: Number.isFinite(people) && people > 0 ? Math.min(500, Math.round(people)) : null, message: clip(v.message, 2000) });
  if (error) throw new Error(error.message);
  await officeAlert(org, `Room hire enquiry: ${venue.name}`, [{ label: "Room", value: venue.name }, { label: "From", value: `${name} (${email})` }, ...(wanted ? [{ label: "Date", value: wanted }] : [])], "/learn?tab=rooms");
}

/** A hirer pays for a confirmed room hire (link sent by the office). */
export async function startHirePayment(token: string): Promise<BuyResult> {
  if (!/^[0-9a-f]{48}$/.test(token)) return { ok: false, error: "That payment link isn't valid." };
  const db = createServiceClient();
  const { data: h } = await db.from("learn_venue_bookings").select("id, organisation_id, status, amount, email, wanted_on, venue:learn_venues(name)").eq("pay_token", token).maybeSingle();
  if (!h) return { ok: false, error: "That payment link isn't valid." };
  if (h.status === "paid") return { ok: false, error: "This room hire is already paid — thank you." };
  if (h.status !== "confirmed" || !(Number(h.amount) > 0)) return { ok: false, error: "This room hire isn't ready to pay yet." };
  const org = await learnOrgById(db, h.organisation_id as string);
  const cfg = org.stripeReady ? await loadStripe(db, org.id).catch(() => null) : null;
  if (!cfg) return { ok: false, error: `${org.name} can't take card payments online right now.` };
  const venue = (h.venue as unknown as { name: string } | null)?.name ?? "Training room";
  const cs = await createCheckout(cfg.secretKey, {
    amountCents: toCents(Number(h.amount)), currency: org.currency, name: `Training room hire — ${venue}`, description: h.wanted_on ? `${h.wanted_on}` : undefined, email: h.email as string,
    successUrl: academyUrl(org, `/rooms/pay/${token}?paid=1`), cancelUrl: academyUrl(org, `/rooms/pay/${token}`),
    metadata: { eventureos_learn_hire: h.id as string, eventureos_org_id: org.id }, idempotencyKey: `hire-${h.id}-${toCents(Number(h.amount))}`, account: cfg.account,
  });
  if (!cs.url) return { ok: false, error: "Stripe didn't return a payment page." };
  await db.from("learn_venue_bookings").update({ stripe_session_id: cs.id }).eq("id", h.id);
  return { ok: true, redirect: cs.url };
}

export async function settleHire(db: SupabaseClient, orgId: string, hireId: string, s: CheckoutSession & { id: string }) {
  const { data } = await db.from("learn_venue_bookings").update({ status: "paid", paid_at: new Date().toISOString(), stripe_payment_intent: s.payment_intent ?? s.id }).eq("id", hireId).eq("organisation_id", orgId).neq("status", "paid").select("id, name, amount");
  if (!data?.length) return "room hire already paid";
  await db.from("activity_logs").insert({ organisation_id: orgId, actor_type: "system", actor_label: "Learn", action: "learn.hire_paid", entity_type: "learn_venue_booking", entity_id: hireId, summary: `Training room hire paid by ${data[0].name} (${money(data[0].amount)})` }).then(() => null, () => null);
  return `room hire ${hireId} paid`;
}

export { hireSplit };
