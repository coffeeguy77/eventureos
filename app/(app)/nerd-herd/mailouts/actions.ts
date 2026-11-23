"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { canManage, requireOrg } from "@/lib/context";
import { actorName, logActivity } from "@/lib/activity";
import type { Audience } from "@/lib/nerdherd/mailout";

/** Nerd Herd → Mail-outs: write one email, test it, then send it to a group of clients in steady batches. */
type R<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const UUID = /^[0-9a-f-]{36}$/i;
const NEEDS = "Run update 0116 (Mail-outs) in Supabase first.";
const missing = (m: string) => /nh_mailout|unsubscribed_at|does not exist|schema cache/.test(m);

async function manager() {
  const ctx = await requireOrg();
  if (!canManage(ctx.role)) throw new Error("Only owners, admins and managers can send mail-outs.");
  return ctx;
}
async function svc() { const { createServiceClient } = await import("@/lib/integrations/runtime"); return createServiceClient(); }
const clean = (i: { subject: string; body: string; audience: string }) => {
  const subject = String(i.subject ?? "").trim().slice(0, 200);
  const body = String(i.body ?? "").trim().slice(0, 20000);
  const audience = (["repairshopr", "all", "xero"].includes(i.audience) ? i.audience : "repairshopr") as Audience;
  if (!subject) throw new Error("Add a subject.");
  if (body.length < 20) throw new Error("Write the email first.");
  return { subject, body, audience };
};

/** Save a draft (new or existing). */
export async function saveMailout(id: string | null, i: { subject: string; body: string; audience: string }): Promise<R<string>> {
  try {
    const { supabase, org, user } = await manager();
    const v = clean(i);
    if (id) {
      if (!UUID.test(id)) throw new Error("That mail-out doesn't exist.");
      const { error } = await supabase.from("nh_mailouts").update(v).eq("id", id).eq("organisation_id", org.id).eq("status", "draft");
      if (error) throw new Error(missing(error.message) ? NEEDS : error.message);
      revalidatePath("/nerd-herd/mailouts");
      return { ok: true, data: id };
    }
    const { data, error } = await supabase.from("nh_mailouts").insert({ ...v, organisation_id: org.id, created_by: user.id }).select("id").single();
    if (error) throw new Error(missing(error.message) ? NEEDS : error.message);
    revalidatePath("/nerd-herd/mailouts");
    return { ok: true, data: data.id as string };
  } catch (e) { return fail(e); }
}

/** How many it would go to (unsubscribed and duplicate addresses left out). */
export async function countAudience(audience: string): Promise<R<number>> {
  try {
    const { org } = await manager();
    const { audienceList } = await import("@/lib/nerdherd/mailout-server");
    return { ok: true, data: (await audienceList(await svc(), org.id, (["repairshopr", "all", "xero"].includes(audience) ? audience : "repairshopr") as Audience)).length };
  } catch (e) { return fail(e); }
}

/** Send the email to yourself first, exactly as clients will see it. */
export async function sendTest(i: { subject: string; body: string; audience: string }, to: string | null): Promise<R<string>> {
  try {
    const { org, user, profile } = await manager();
    const v = clean(i);
    const email = (to ?? "").trim() || user.email || "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter an email address for the test.");
    const { sendOne } = await import("@/lib/nerdherd/mailout-server");
    const first = (profile as { full_name?: string | null } | null)?.full_name?.split(/\s+/)[0] ?? null;
    await sendOne(await svc(), org.id, { subject: `[Test] ${v.subject}`, body: v.body }, { email, name: first, token: randomUUID() });
    return { ok: true, data: email };
  } catch (e) { return fail(e); }
}

/** Queue every recipient and start sending (batches every 5 minutes). */
export async function startMailout(id: string, i: { subject: string; body: string; audience: string }): Promise<R<number>> {
  try {
    const { supabase, org, user, profile } = await manager();
    if (!UUID.test(id)) throw new Error("Save the mail-out first.");
    const v = clean(i);
    const db = await svc();
    const { data: m } = await db.from("nh_mailouts").select("id, status").eq("id", id).eq("organisation_id", org.id).maybeSingle();
    if (!m) throw new Error("That mail-out doesn't exist.");
    if (m.status !== "draft") throw new Error("This mail-out has already been started.");
    const { audienceList } = await import("@/lib/nerdherd/mailout-server");
    const list = await audienceList(db, org.id, v.audience);
    if (!list.length) throw new Error("Nobody to send to in that group.");
    await db.from("nh_mailout_sends").delete().eq("mailout_id", id); // a draft has none; clears a half-finished start
    for (let k = 0; k < list.length; k += 500) {
      // addresses are already lower-case and one per person
      const { error } = await db.from("nh_mailout_sends").insert(list.slice(k, k + 500).map((r) => ({ mailout_id: id, organisation_id: org.id, customer_id: r.customer_id, email: r.email, name: r.name })));
      if (error) throw new Error(error.message);
    }
    const { error } = await db.from("nh_mailouts").update({ ...v, status: "sending", total: list.length, started_at: new Date().toISOString() }).eq("id", id);
    if (error) throw new Error(error.message);
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "mailout.started", entityType: "organisation", entityId: org.id, summary: `${actorName(profile)} started a mail-out to ${list.length} clients: “${v.subject}”` });
    // first batch straight away (the 5-minute timer does the rest)
    try { const { runMailouts } = await import("@/lib/nerdherd/mailout-server"); await runMailouts(db, 25_000); } catch { /* the timer picks it up */ }
    revalidatePath("/nerd-herd/mailouts");
    return { ok: true, data: list.length };
  } catch (e) { return fail(e); }
}

export async function setMailoutStatus(id: string, status: "paused" | "sending"): Promise<R> {
  try {
    const { supabase, org } = await manager();
    if (!UUID.test(id)) throw new Error("That mail-out doesn't exist.");
    const { error } = await supabase.from("nh_mailouts").update({ status }).eq("id", id).eq("organisation_id", org.id).in("status", status === "paused" ? ["sending"] : ["paused"]);
    if (error) throw new Error(error.message);
    revalidatePath("/nerd-herd/mailouts");
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

export async function deleteDraft(id: string): Promise<R> {
  try {
    const { supabase, org } = await manager();
    if (!UUID.test(id)) throw new Error("That mail-out doesn't exist.");
    await supabase.from("nh_mailouts").delete().eq("id", id).eq("organisation_id", org.id).eq("status", "draft");
    revalidatePath("/nerd-herd/mailouts");
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}
