"use server";

import { redirect } from "next/navigation";
import { consumeLogin, currentStudent, requestLogin, setSessionCookie, signOut, type LoginResult } from "@/lib/bookings/student-auth";
import {
  cancelMonthly, completeLesson, doChallenge, enquireVenue, learnOrg, learnerState, recordArtScore, saveProfile, saveRoast, startHirePayment, startLearnCheckout,
  submitMastery, submitVenue, useAi, type BuyResult,
} from "@/lib/learn/server";
import { analysePhoto, coachReply, MEDIA_TYPES, type ChatTurn, type MediaType, type PhotoResult } from "@/lib/learn/ai";
import { orgAiKey } from "@/lib/ai/key";
import type { Plan } from "@/lib/learn/core";
import { createServiceClient } from "@/lib/integrations/runtime";
import { academyStudent } from "@/lib/learn/god";

type R<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const msg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong — please try again.");

async function signedIn(slug: string) {
  const org = await learnOrg(slug);
  if (!org) throw new Error("Not found.");
  const me = await academyStudent(org);
  if (!me) throw new Error("Please sign in again.");
  return { org, me };
}

/* ------------------------------------------------------------------ sign in */

export async function learnLoginAction(slug: string, email: string, name: string): Promise<LoginResult> {
  try { return await requestLogin(slug, email, { target: "learn", signupName: name.trim() || null }); } catch { return { ok: false, error: "Something went wrong — please try again." }; }
}

export async function learnSignInAction(slug: string, token: string): Promise<{ ok: false; error: string } | void> {
  const org = await learnOrg(slug);
  if (!org) return { ok: false, error: "Not found." };
  const r = await consumeLogin(org, token);
  if (!r.ok) return r;
  await setSessionCookie(org, r.session);
  redirect(`/academy/${org.slug}`);
}

export async function learnSignOutAction(slug: string) {
  const org = await learnOrg(slug);
  if (org) await signOut(org);
  redirect(`/academy/${slug}`);
}

/* ------------------------------------------------------------------ buying */

export async function buyAction(slug: string, plan: Plan, who: { name?: string; email?: string; marketing?: boolean }): Promise<BuyResult> {
  try {
    const org = await learnOrg(slug);
    if (!org) return { ok: false, error: "Not found." };
    const me = await currentStudent(org).catch(() => null);
    return await startLearnCheckout({ orgSlug: slug, plan, student: me, ...who });
  } catch (e) { return { ok: false, error: msg(e) }; }
}

export async function cancelMonthlyAction(slug: string): Promise<R> {
  try { const { org, me } = await signedIn(slug); await cancelMonthly(org, me); return { ok: true }; } catch (e) { return { ok: false, error: msg(e) }; }
}

export async function saveProfileAction(slug: string, p: { displayName: string; coachStyle: string; onLeaderboard: boolean }): Promise<R> {
  try { const { org, me } = await signedIn(slug); await saveProfile(org, me, p); return { ok: true }; } catch (e) { return { ok: false, error: msg(e) }; }
}

/* ------------------------------------------------------------------ learning */

export async function completeLessonAction(slug: string, lessonId: string, answer: number | null): Promise<R<{ correct: boolean; xp: number; badges: string[]; levelDone: string | null }>> {
  try { const { org, me } = await signedIn(slug); const r = await completeLesson(org, me, lessonId, answer); return { ok: true, correct: r.correct, xp: r.xp, badges: r.badges, levelDone: r.levelDone ?? null }; }
  catch (e) { return { ok: false, error: msg(e) }; }
}

export async function masteryAction(slug: string, moduleId: string, answers: (number | null)[]) {
  try { const { org, me } = await signedIn(slug); const r = await submitMastery(org, me, moduleId, answers.slice(0, 100)); return { ok: true as const, ...r, levelDone: r.levelDone ?? null }; }
  catch (e) { return { ok: false as const, error: msg(e) }; }
}

export async function challengeAction(slug: string, challengeId: string, note: string): Promise<R<{ xp: number; badges: string[]; message: string | null }>> {
  try { const { org, me } = await signedIn(slug); const r = await doChallenge(org, me, challengeId, note); return { ok: true, xp: r.xp, badges: r.badges, message: r.message ?? null }; }
  catch (e) { return { ok: false, error: msg(e) }; }
}

export async function saveRoastAction(slug: string, r: { name: string; history: { time: number; bt: number; ror: number }[]; firstCrack: number | null; drop: number | null }): Promise<R<{ xp: number; score: number; badges: string[] }>> {
  try { const { org, me } = await signedIn(slug); const o = await saveRoast(org, me, r); return { ok: true, xp: o.xp, score: o.score, badges: o.badges }; }
  catch (e) { return { ok: false, error: msg(e) }; }
}

/* ------------------------------------------------------------------ AI coach */

async function coachGate(slug: string, kind: "messages" | "photos") {
  const { org, me } = await signedIn(slug);
  if (!org.learn.ai.enabled) throw new Error("The AI coach is switched off.");
  const key = await orgAiKey(org.id);
  if (!key) throw new Error("The AI coach isn't set up yet.");
  const s = await learnerState(createServiceClient(), org, me.id, { god: me.god });
  if (!s.live) throw new Error("The AI coach is part of the full course.");
  if (!(await useAi(org, me.id, kind, me.god))) throw new Error(kind === "photos" ? "That's today's photo limit — try again tomorrow." : "That's today's limit for the coach — try again tomorrow.");
  return { org, me, style: s.learner.coach_style, key };
}

const cleanImage = (img: { data: string; mediaType: string } | null | undefined): { data: string; mediaType: MediaType } | null => {
  if (!img) return null;
  if (!MEDIA_TYPES.includes(img.mediaType as MediaType)) throw new Error("Use a JPG, PNG or WebP photo.");
  const data = img.data.replace(/^data:[^,]+,/, "");
  if (!/^[A-Za-z0-9+/=]+$/.test(data)) throw new Error("That photo couldn't be read.");
  if (data.length > 950_000) throw new Error("That photo is too big — try a smaller one.");
  return { data, mediaType: img.mediaType as MediaType };
};

export async function coachAction(slug: string, mode: string, turns: ChatTurn[], image: { data: string; mediaType: string } | null): Promise<R<{ reply: string }>> {
  try {
    const { org, style, key } = await coachGate(slug, "messages");
    const reply = await coachReply({ key, mode, style, business: org.name, turns: (turns ?? []).map((t) => ({ role: t.role === "assistant" ? "assistant" : "user", content: String(t.content ?? "") })), image: cleanImage(image) });
    return { ok: true, reply };
  } catch (e) { return { ok: false, error: msg(e) }; }
}

export async function photoAction(slug: string, kind: "latte_art" | "espresso", image: { data: string; mediaType: string }): Promise<R<{ result: PhotoResult; badges: string[] }>> {
  try {
    const { org, me, key } = await coachGate(slug, "photos");
    const img = cleanImage(image);
    if (!img) throw new Error("Add a photo first.");
    const result = await analysePhoto({ key, kind: kind === "espresso" ? "espresso" : "latte_art", ...img });
    const after = kind === "latte_art" ? await recordArtScore(org, me.id, result.overall) : { badges: [] };
    return { ok: true, result, badges: after.badges };
  } catch (e) { return { ok: false, error: msg(e) }; }
}

/* ------------------------------------------------------------------ training rooms */

export async function listRoomAction(slug: string, v: Record<string, unknown>): Promise<R> {
  try { const org = await learnOrg(slug); if (!org) throw new Error("Not found."); await submitVenue(org, v); return { ok: true }; } catch (e) { return { ok: false, error: msg(e) }; }
}

export async function enquireRoomAction(slug: string, venueId: string, v: Record<string, unknown>): Promise<R> {
  try { const org = await learnOrg(slug); if (!org) throw new Error("Not found."); await enquireVenue(org, venueId, v); return { ok: true }; } catch (e) { return { ok: false, error: msg(e) }; }
}

export async function payHireAction(token: string): Promise<BuyResult> {
  try { return await startHirePayment(token); } catch (e) { return { ok: false, error: msg(e) }; }
}
