"use server";

import { revalidatePath } from "next/cache";
import { canManage, requireOrg } from "@/lib/context";
import { cleanRules, type MailRule } from "@/lib/mail/rules-core";
import { todayISO } from "@/lib/format";

/** The second Gmail account: rules (with a preview of what they'd bring in) and running them now. */
type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
const err = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function boxContext() {
  const { org, role, user } = await requireOrg();
  if (!canManage(role)) throw new Error("Only owners, admins and managers can change this.");
  const { createServiceClient } = await import("@/lib/integrations/runtime");
  const { buildContext } = await import("@/lib/integrations/sync-runner");
  return buildContext(createServiceClient(), "service", org.id, "gmail2", user.id).catch(() => { throw new Error("Connect the second Gmail account first."); });
}

export async function previewMailRule(query: string, days = 180): Promise<Result<{ estimate: number; rows: { id: string; from: string; fromEmail: string; subject: string; date: string | null; snippet: string }[] }>> {
  try {
    const ctx = await boxContext();
    const { previewSearch } = await import("@/lib/mail/rules");
    return { ok: true, data: await previewSearch(ctx, query, Math.max(7, Math.min(730, Math.round(days) || 180))) };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export async function saveMailRules(rules: MailRule[]): Promise<Result<MailRule[]>> {
  try {
    const ctx = await boxContext();
    const clean = cleanRules(rules, todayISO(ctx.org.timezone));
    const { saveIntegrationSettings } = await import("@/lib/integrations/runtime");
    await saveIntegrationSettings(ctx, { rules: clean });
    revalidatePath("/settings/integrations/gmail2");
    return { ok: true, data: clean };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export async function runMailRulesNow(): Promise<Result<string>> {
  try {
    const ctx = await boxContext();
    const { runMailboxRules } = await import("@/lib/mail/rules");
    const r = await runMailboxRules(ctx);
    revalidatePath("/enquiries");
    return { ok: true, data: r.message };
  } catch (e) { return { ok: false, error: err(e) }; }
}
