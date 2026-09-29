"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/context";
import { actorName, logActivity } from "@/lib/activity";
import { emailConfigured, sendEmail } from "@/lib/email/send";
import { imageUrl, normaliseDesign, renderSignature, textToHtml, webUrl, type Variant } from "@/lib/signatures/render";
import { createServiceClient } from "@/lib/integrations/runtime";
import { loadOrgBranding, loadSignatureSetup, loadTeamPeople, PERSON_FIELDS } from "@/lib/signatures/server";

type Result = { ok: true; message?: string; at?: string } | { ok: false; error: string };
const fail = (e: unknown): Result => ({ ok: false, error: e instanceof Error ? e.message : "Something went wrong" });

async function ownerOrAdmin() {
  const ctx = await requireOrg();
  if (ctx.role !== "owner" && ctx.role !== "admin") throw new Error("Only owners and admins can change the company signature.");
  return ctx;
}

const revalidate = () => { revalidatePath("/settings/signatures"); revalidatePath("/my-signature"); };

/** Autosave the master design draft. */
export async function saveSignatureDraft(raw: unknown): Promise<Result> {
  try {
    const { supabase, org, user } = await ownerOrAdmin();
    const design = normaliseDesign(raw, await loadOrgBranding(supabase, org.id));
    const at = new Date().toISOString();
    const { error } = await supabase.from("email_signatures").upsert(
      { organisation_id: org.id, draft: design, draft_updated_at: at, draft_updated_by: user.id },
      { onConflict: "organisation_id" },
    );
    if (error) throw new Error(`Couldn't save the draft: ${error.message}`);
    return { ok: true, at };
  } catch (e) { return fail(e); }
}

/** Publish the current draft as the next immutable version. */
export async function publishSignature(raw: unknown, note: string): Promise<Result> {
  try {
    const { supabase, org, user, profile } = await ownerOrAdmin();
    const design = normaliseDesign(raw, await loadOrgBranding(supabase, org.id));
    const { data: last } = await supabase.from("email_signature_versions").select("version")
      .eq("organisation_id", org.id).order("version", { ascending: false }).limit(1).maybeSingle();
    const version = (last?.version ?? 0) + 1;
    const at = new Date().toISOString();
    const cleanNote = note.replace(/\s+/g, " ").trim().slice(0, 200) || null;
    const { error: vErr } = await supabase.from("email_signature_versions").insert({
      organisation_id: org.id, version, design, note: cleanNote, published_at: at, published_by: user.id,
    });
    if (vErr) throw new Error(`Couldn't publish: ${vErr.message}`);
    const { error } = await supabase.from("email_signatures").upsert(
      { organisation_id: org.id, draft: design, draft_updated_at: at, draft_updated_by: user.id, published_version: version, published_at: at },
      { onConflict: "organisation_id" },
    );
    if (error) throw new Error(`Published version ${version}, but couldn't mark it live: ${error.message}`);
    await logActivity(supabase, {
      orgId: org.id, actorId: user.id, action: "signature.published", entityType: "email_signature", entityId: null,
      summary: `${actorName(profile)} published email signature v${version}${cleanNote ? ` — “${cleanNote}”` : ""}`,
      metadata: { version },
    });
    revalidate();
    return { ok: true, message: `Version ${version} is live`, at };
  } catch (e) { return fail(e); }
}

/** Load a previous version into the draft (nothing goes live until it's published again). */
export async function restoreSignatureVersion(version: number): Promise<Result & { design?: unknown }> {
  try {
    const { supabase, org, user } = await ownerOrAdmin();
    const { data: v, error } = await supabase.from("email_signature_versions").select("design")
      .eq("organisation_id", org.id).eq("version", version).maybeSingle();
    if (error || !v) throw new Error("That version couldn't be found.");
    const design = normaliseDesign(v.design, await loadOrgBranding(supabase, org.id));
    const at = new Date().toISOString();
    const { error: uErr } = await supabase.from("email_signatures").upsert(
      { organisation_id: org.id, draft: design, draft_updated_at: at, draft_updated_by: user.id }, { onConflict: "organisation_id" },
    );
    if (uErr) throw new Error(`Couldn't restore: ${uErr.message}`);
    return { ok: true, at, design, message: `Version ${version} loaded into your draft — publish to make it live.` };
  } catch (e) { return fail(e); }
}

const LIMITS: Record<(typeof PERSON_FIELDS)[number], number> = {
  display_name: 80, pronouns: 30, title: 80, phone: 40, mobile: 40, email: 200, photo_url: 500, extra_line: 120, booking_url: 300,
};

/**
 * Save someone's personal signature details. Anyone can save their own (except fields the company has locked);
 * owners and admins can save anyone's, including locked fields.
 */
export async function saveSignatureProfile(userId: string, fields: Partial<Record<(typeof PERSON_FIELDS)[number], string | null>>): Promise<Result> {
  try {
    const { supabase, org, user, role, profile } = await requireOrg();
    const admin = role === "owner" || role === "admin";
    if (userId !== user.id && !admin) throw new Error("You can only change your own signature details.");
    const [target] = await loadTeamPeople(supabase, org.id, userId);
    if (!target) throw new Error("That person isn't on your team.");
    const setup = await loadSignatureSetup(supabase, org.id);
    const locked = (setup.published?.design ?? setup.draft).locked;

    const patch: Record<string, string | null> = {};
    for (const f of PERSON_FIELDS) {
      if (!(f in fields)) continue;
      if (!admin && locked[f as keyof typeof locked]) continue; // locked fields are silently kept as the admin set them
      let v = (fields[f] ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, LIMITS[f]) || null;
      if (v && f === "email" && !/^[^\s@<>"',;:()]+@[^\s@<>"',;:()]+\.[^\s@<>"',;:()]+$/.test(v)) throw new Error("That email address doesn't look right.");
      if (v && f === "booking_url") { const u = webUrl(v); if (!u) throw new Error("The booking link needs to be a web address, like calendly.com/you."); v = u; }
      if (v && f === "photo_url" && !imageUrl(v)) throw new Error("The photo must be an uploaded image.");
      if (v && (f === "phone" || f === "mobile") && v.replace(/\D/g, "").length < 6) throw new Error(`That ${f === "phone" ? "phone" : "mobile"} number looks too short.`);
      patch[f] = v;
    }
    // Empty fields fall back to the person's account (name, email) and team title
    const { error } = await supabase.from("signature_profiles").upsert(
      { organisation_id: org.id, user_id: userId, ...patch, updated_at: new Date().toISOString(), updated_by: user.id },
      { onConflict: "organisation_id,user_id" },
    );
    if (error) throw new Error(`Couldn't save: ${error.message}`);
    if (userId !== user.id) {
      await logActivity(supabase, {
        orgId: org.id, actorId: user.id, action: "signature.profile_updated", entityType: "user", entityId: userId,
        summary: `${actorName(profile)} updated ${target.person.display_name ?? target.accountEmail}'s signature details`,
      });
    }
    revalidate();
    return { ok: true, message: "Saved" };
  } catch (e) { return fail(e); }
}

/**
 * Email a test of the signature to yourself. Uses the draft design when `useDraft` (owners/admins previewing),
 * otherwise the published one. Limited to 5 tests per person per 10 minutes.
 */
export async function sendSignatureTest(opts: { useDraft: boolean; draft?: unknown; asUserId?: string; variant: Variant }): Promise<Result> {
  try {
    const { supabase, org, user, role, profile } = await requireOrg();
    if (!emailConfigured()) throw new Error("Email sending isn't set up (RESEND_API_KEY).");
    const admin = role === "owner" || role === "admin";
    const since = new Date(Date.now() - 10 * 60_000).toISOString();
    // Field staff can't read or write the audit log under RLS, so the limit and the log entry use the service client
    const svc = createServiceClient();
    const { count } = await svc.from("activity_logs").select("id", { count: "exact", head: true })
      .eq("organisation_id", org.id).eq("actor_id", user.id).eq("action", "signature.test_sent").gte("created_at", since);
    if ((count ?? 0) >= 5) throw new Error("That's 5 tests in 10 minutes — give it a few minutes.");

    const setup = await loadSignatureSetup(supabase, org.id);
    const design = opts.useDraft && admin ? normaliseDesign(opts.draft ?? setup.draft, setup.branding) : setup.published?.design;
    if (!design) throw new Error("There's no published signature yet.");
    const who = opts.asUserId && admin ? opts.asUserId : user.id;
    const [person] = await loadTeamPeople(supabase, org.id, who);
    if (!person) throw new Error("That person isn't on your team.");
    const sig = renderSignature(design, person.person, opts.variant === "compact" ? "compact" : "full");
    const intro = `Hi ${profile.full_name?.split(" ")[0] ?? "there"},\n\nThis is a test of ${who === user.id ? "your" : `${person.person.display_name ?? "their"}'s`} ${org.name} email signature (${opts.variant === "compact" ? "reply version" : "full version"}${opts.useDraft && admin ? ", unpublished draft" : ""}). Check it on your phone too, and try turning images off.\n\nThanks`;
    await sendEmail({
      to: profile.email,
      subject: `Signature test — ${org.name}`,
      html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1f2937;">${textToHtml(intro)}<br>${sig.html}</div>`,
      text: `${intro}\n\n-- \n${sig.text}`,
      fromName: org.name,
    });
    await logActivity(svc, {
      orgId: org.id, actorId: user.id, action: "signature.test_sent", entityType: "email_signature", entityId: null,
      summary: `${actorName(profile)} sent a signature test to ${profile.email}`,
    });
    return { ok: true, message: `Sent to ${profile.email}` };
  } catch (e) { return fail(e); }
}

