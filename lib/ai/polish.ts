import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { stripQuoted } from "@/lib/ai/classify";
import { orgAiKey } from "@/lib/ai/key";
import { callClaudeRaw } from "@/lib/ai/reply";

/**
 * "Polish": rewrite what someone has typed, like Gmail's Polish. Uses the cheapest, fastest Claude model
 * (Claude Haiku 5.5: US$0.10 in / US$0.50 out per million tokens), so a rewrite costs a small fraction of a cent.
 * Override with AI_POLISH_MODEL. Nothing is changed until the person presses Replace.
 */
export const DEFAULT_POLISH_MODEL = "claude-haiku-5-5";
const FALLBACK_MODEL = "claude-haiku-4-5-20251001";
export const polishModel = () => process.env.AI_POLISH_MODEL?.trim() || DEFAULT_POLISH_MODEL;

export const POLISH_MODES = {
  polish: "Fix spelling, grammar and flow and make it read clearly and professionally. Keep the length about the same.",
  shorter: "Make it noticeably shorter and more direct, keeping every fact, question and request.",
  friendlier: "Make it warmer and friendlier, still professional.",
  formal: "Make it more formal and polished, suitable for a corporate client.",
} as const;
export type PolishMode = keyof typeof POLISH_MODES;

export async function polishText(db: SupabaseClient, org: { id: string; name: string }, text: string, mode: PolishMode, threadId?: string | null): Promise<string> {
  const draft = text.trim();
  if (!draft) throw new Error("Write something first, then polish it.");
  if (draft.length > 8000) throw new Error("That's too long to polish in one go.");

  // The conversation, so the rewrite answers the same question and keeps the same facts
  let convo = "";
  if (threadId && /^[0-9a-f-]{36}$/i.test(threadId)) {
    const { data } = await db.from("email_messages").select("direction, from_name, from_email, body_text, sent_at")
      .eq("organisation_id", org.id).eq("thread_id", threadId).order("sent_at", { ascending: false }).limit(4);
    convo = ((data ?? []) as { direction: string; from_name: string | null; from_email: string; body_text: string | null }[]).reverse()
      .map((m) => `--- ${m.direction === "inbound" ? `FROM ${m.from_name ?? m.from_email}` : `FROM US`}\n${stripQuoted(m.body_text ?? "").slice(0, 1500)}`).join("\n\n");
  }

  const system = `You rewrite an email draft for ${org.name}, an Australian business. ${POLISH_MODES[mode]}
Rules: Australian English. Keep every fact exactly: names, dates, times, prices, numbers, phone numbers, links and addresses. Do not add new facts, promises, prices or availability. Keep the greeting and sign-off style. Plain text, no markdown, no subject line.
Reply with ONLY the rewritten email text — no preamble, no quotes around it.`;
  const user = `${convo ? `CONVERSATION SO FAR (for context only, do not rewrite it):\n${convo}\n\n` : ""}DRAFT TO REWRITE:\n${draft}`;

  const key = await orgAiKey(org.id);
  let out: string;
  try {
    out = await callClaudeRaw(key, system, user, 3000, 30000, polishModel());
  } catch (e) {
    // The account may not have the newest model yet — fall back to Haiku 4.5
    if (e instanceof Error && /Anthropic API (400|404)/.test(e.message) && /model/i.test(e.message)) out = await callClaudeRaw(key, system, user, 3000, 30000, FALLBACK_MODEL);
    else throw e;
  }
  const clean = out.trim().replace(/^["“]|["”]$/g, "").trim();
  if (!clean) throw new Error("The AI didn't return a rewrite — try again.");
  return clean;
}
