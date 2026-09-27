"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/context";
import { actorName, logActivity } from "@/lib/activity";
import { blockedBy } from "@/lib/integrations/gmail-sync";

export type SpamResult = { ok: true; message: string } | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[a-z0-9.-]+\.[a-z]{2,}$/;
const DOMAIN = /^@?[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;
const FREEMAIL = new Set(["gmail.com", "googlemail.com", "hotmail.com", "outlook.com", "live.com", "yahoo.com", "yahoo.com.au", "icloud.com", "me.com", "bigpond.com", "bigpond.net.au", "optusnet.com.au", "proton.me", "protonmail.com"]);

async function office() {
  const ctx = await requireOrg();
  if (ctx.role === "staff" || ctx.role === "customer") throw new Error("Only the office team can manage spam.");
  return ctx;
}
async function wrap(fn: () => Promise<string>): Promise<SpamResult> {
  try { return { ok: true, message: await fn() }; } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}
const ids = (xs: string[]) => [...new Set(xs.filter((x) => UUID.test(x)))].slice(0, 500);
const pl = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
function refresh(enquiryIds: string[] = []) {
  revalidatePath("/enquiries");
  for (const id of enquiryIds.slice(0, 20)) revalidatePath(`/enquiries/${id}`);
}

/** Normalise what someone typed into a blocklist value: an address, or "@domain". */
export async function normaliseBlockValue(raw: string): Promise<string | null> {
  const v = raw.trim().toLowerCase().replace(/^mailto:/, "");
  if (EMAIL.test(v)) return v;
  if (DOMAIN.test(v)) return v.startsWith("@") ? v : `@${v}`;
  return null;
}

export async function markSpam(enquiryIds: string[]): Promise<SpamResult> {
  return wrap(async () => {
    const { supabase, org, user, profile } = await office();
    const list = ids(enquiryIds);
    if (!list.length) throw new Error("Choose at least one enquiry.");
    const { data, error } = await supabase.from("enquiries").update({ status: "spam", spam_reason: `Marked as spam by ${actorName(profile)}`, next_action: null, next_action_due: null })
      .eq("organisation_id", org.id).in("id", list).is("event_id", null).select("id");
    if (error) throw new Error(error.message);
    const done = (data ?? []).map((r) => r.id as string);
    if (done.length) await supabase.from("email_threads").update({ classification: "spam", state: "closed" }).eq("organisation_id", org.id).in("enquiry_id", done);
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "enquiry.spam", entityType: "enquiry", entityId: done.length === 1 ? done[0] : null, enquiryId: done.length === 1 ? done[0] : null,
      summary: `${actorName(profile)} moved ${pl(done.length, "enquiry", "enquiries")} to Spam` });
    refresh(done);
    const skipped = list.length - done.length;
    return `${pl(done.length, "enquiry", "enquiries")} moved to Spam${skipped ? ` (${skipped} already turned into events were left alone)` : ""}.`;
  });
}

export async function notSpam(enquiryIds: string[]): Promise<SpamResult> {
  return wrap(async () => {
    const { supabase, org, user, profile } = await office();
    const list = ids(enquiryIds);
    if (!list.length) throw new Error("Choose at least one email.");
    const { data, error } = await supabase.from("enquiries").update({ status: "needs_review", spam_reason: null, next_action: "Check this email and confirm it's an enquiry", next_action_due: new Date().toISOString() })
      .eq("organisation_id", org.id).in("id", list).eq("status", "spam").select("id");
    if (error) throw new Error(error.message);
    const done = (data ?? []).map((r) => r.id as string);
    if (done.length) await supabase.from("email_threads").update({ classification: "needs_review", state: "needs_reply" }).eq("organisation_id", org.id).in("enquiry_id", done);
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "enquiry.not_spam", entityType: "enquiry", entityId: done.length === 1 ? done[0] : null, enquiryId: done.length === 1 ? done[0] : null,
      summary: `${actorName(profile)} moved ${pl(done.length, "email", "emails")} out of Spam into Enquiries` });
    refresh(done);
    return `${pl(done.length, "email", "emails")} moved back to Enquiries.`;
  });
}

export async function deleteSpam(enquiryIds: string[]): Promise<SpamResult> {
  return wrap(async () => {
    const { supabase, org, user, profile } = await office();
    const list = ids(enquiryIds);
    if (!list.length) throw new Error("Choose at least one email.");
    const { data, error } = await supabase.rpc("delete_spam", { p_org: org.id, p_enquiry_ids: list });
    if (error) throw new Error(error.message);
    const n = (data as { enquiries: number }).enquiries;
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "enquiry.spam_deleted", entityType: "enquiry",
      summary: `${actorName(profile)} deleted ${pl(n, "email", "emails")} from Spam (still in Gmail)` });
    refresh();
    return `${pl(n, "email", "emails")} deleted from EventureOS. They're still in Gmail.`;
  });
}

/** Block the senders of these enquiries and remove their unworked emails. Business-wide domains block the domain; free-mail blocks the address. */
export async function blockSenders(enquiryIds: string[], wholeDomain = false): Promise<SpamResult> {
  return wrap(async () => {
    const ctx = await office();
    const { supabase, org } = ctx;
    const list = ids(enquiryIds);
    if (!list.length) throw new Error("Choose at least one email.");
    const { data: rows, error } = await supabase.from("enquiries").select("id, contact_email").eq("organisation_id", org.id).in("id", list);
    if (error) throw new Error(error.message);
    const values = new Set<string>();
    for (const r of rows ?? []) {
      const e = (r.contact_email as string | null)?.trim().toLowerCase();
      if (!e || !EMAIL.test(e)) continue;
      const d = e.split("@")[1];
      values.add(wholeDomain && !FREEMAIL.has(d) ? `@${d}` : e);
    }
    if (!values.size) throw new Error("Those emails have no sender address to block.");
    return await addBlocks([...values], "Blocked from Spam", ctx);
  });
}

export async function addBlock(raw: string, reason?: string): Promise<SpamResult> {
  return wrap(async () => {
    const v = await normaliseBlockValue(raw);
    if (!v) throw new Error("Enter an email address (name@example.com) or a domain (example.com).");
    return await addBlocks([v], reason?.trim() || "Added by hand", await office());
  });
}

async function addBlocks(values: string[], reason: string, ctx: Awaited<ReturnType<typeof office>>) {
  const { supabase, org, user, profile } = ctx;
  const { data: team } = await supabase.from("organisation_users").select("user:users!organisation_users_user_id_fkey(email)").eq("organisation_id", org.id).neq("role", "customer");
  const own = new Set(((team ?? []) as unknown as { user: { email: string } | null }[]).map((t) => t.user?.email?.toLowerCase()).filter(Boolean) as string[]);
  const clean = values.filter((v) => !own.has(v));
  if (!clean.length) throw new Error("You can't block your own team — their emails are already never imported.");
  const { error } = await supabase.from("email_blocklist").upsert(clean.map((value) => ({ organisation_id: org.id, value, reason: reason.slice(0, 200), created_by: user.id })),
    { onConflict: "organisation_id,value", ignoreDuplicates: true });
  if (error) throw new Error(error.message);

  // Remove what's already here from them: unworked inbox enquiries and anything in Spam (Gmail keeps its copy)
  const { data: cand } = await supabase.from("enquiries").select("id, contact_email, status")
    .eq("organisation_id", org.id).is("event_id", null).in("status", ["new", "needs_review", "spam"]).not("contact_email", "is", null).limit(5000);
  const entries = clean.map((value, i) => ({ id: String(i), value }));
  const hit = (cand ?? []).filter((r) => blockedBy(entries, r.contact_email as string)).map((r) => r.id as string);
  let removed = 0;
  if (hit.length) {
    await supabase.from("enquiries").update({ status: "spam", spam_reason: "Sender blocked" }).eq("organisation_id", org.id).in("id", hit).neq("status", "spam");
    const { data } = await supabase.rpc("delete_spam", { p_org: org.id, p_enquiry_ids: hit });
    removed = (data as { enquiries: number } | null)?.enquiries ?? 0;
  }
  await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "email.blocked", entityType: "integration",
    summary: `${actorName(profile)} blocked ${clean.join(", ")}${removed ? ` and removed ${pl(removed, "email", "emails")} from them` : ""}` });
  refresh();
  return `Blocked ${clean.length === 1 ? clean[0] : pl(clean.length, "sender", "senders")}${removed ? ` and removed ${pl(removed, "email", "emails")} from them (still in Gmail)` : ""}. They won't be imported again.`;
}

export async function removeBlock(id: string): Promise<SpamResult> {
  return wrap(async () => {
    const { supabase, org, user, profile } = await office();
    if (!UUID.test(id)) throw new Error("Refresh the page and try again.");
    const { data, error } = await supabase.from("email_blocklist").delete().eq("id", id).eq("organisation_id", org.id).select("value").maybeSingle();
    if (error) throw new Error(error.message);
    if (data) await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "email.unblocked", entityType: "integration",
      summary: `${actorName(profile)} unblocked ${data.value}` });
    refresh();
    return data ? `${data.value} can email you again. New emails from them will be imported from the next sync.` : "Already removed.";
  });
}

export async function saveSpamRules(auto: boolean, phrasesText: string): Promise<SpamResult> {
  return wrap(async () => {
    const { supabase, org, user, profile, role } = await office();
    if (!["owner", "admin", "manager"].includes(role)) throw new Error("Only owners, admins and managers can change spam rules.");
    const phrases = [...new Set(phrasesText.split(/[\n,]/).map((p) => p.trim().toLowerCase()).filter((p) => p.length >= 3 && p.length <= 80))].slice(0, 200);
    const { data: integ } = await supabase.from("integrations").select("id, settings").eq("organisation_id", org.id).eq("provider", "gmail").maybeSingle();
    if (!integ) throw new Error("Connect Gmail first — spam rules apply to imported email.");
    const settings = { ...(integ.settings as Record<string, unknown> ?? {}), spam_auto: !!auto, spam_phrases: phrases };
    const { error } = await supabase.from("integrations").update({ settings }).eq("id", integ.id);
    if (error) throw new Error(error.message);
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "integration.settings_changed", entityType: "integration", entityId: integ.id as string,
      summary: `${actorName(profile)} updated spam rules (${auto ? "auto-spam on" : "auto-spam off"}, ${pl(phrases.length, "custom phrase", "custom phrases")})` });
    refresh();
    return "Spam rules saved. They apply to new emails from the next sync.";
  });
}
