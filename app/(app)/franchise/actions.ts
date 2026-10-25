"use server";
import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/context";
import { appBaseUrl } from "@/lib/integrations/registry";
import { emailConfigured, sendEmail } from "@/lib/email/send";
import { franchiseApplicationEmail } from "@/lib/email/templates";
import { FRANCHISE_STATUSES, type FranchiseStatus } from "@/lib/franchise/core";

type R = { ok: true; message: string; link?: string } | { ok: false; error: string };

async function manager(id: string) {
  const ctx = await requireOrg();
  if (!["owner", "admin", "manager"].includes(ctx.role)) throw new Error("Only owners, admins and managers can manage franchise applications.");
  const { data, error } = await ctx.supabase.from("franchise_applications").select("id, name, email, status, token").eq("organisation_id", ctx.org.id).eq("id", id).maybeSingle();
  if (error) throw new Error(/franchise_applications/.test(error.message) ? "Franchise needs its database update (0066_franchise.sql)." : error.message);
  if (!data) throw new Error("That application wasn't found.");
  return { ...ctx, app: data as { id: string; name: string; email: string; status: FranchiseStatus; token: string } };
}
const linkFor = (slug: string, token: string) => `${appBaseUrl()}/site/${slug}/apply/${token}`;
const wrap = async (fn: () => Promise<R>): Promise<R> => { try { return await fn(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." }; } };

/** Email the applicant their private application link (and move them to "Application sent"). */
export async function sendApplicationLink(id: string, note: string): Promise<R> {
  return wrap(async () => {
    const { supabase, org, app } = await manager(id);
    if (!emailConfigured()) throw new Error("Email isn't set up yet — use “Copy link” and send it yourself.");
    const url = linkFor(org.slug, app.token);
    const o = org as unknown as { name: string; brand_colour: string | null; logo_url: string | null; contact_email: string | null };
    const m = franchiseApplicationEmail({ businessName: o.name, firstName: app.name.split(/\s+/)[0] || app.name, url, note: note.trim().slice(0, 800) || null, brand: o.brand_colour, logoUrl: o.logo_url });
    await sendEmail({ to: app.email, subject: m.subject, html: m.html, text: m.text, replyTo: o.contact_email, fromName: o.name });
    const now = new Date().toISOString();
    await supabase.from("franchise_applications").update({ invited_at: now, updated_at: now, ...(app.status === "enquiry" ? { status: "invited" } : {}) }).eq("id", id);
    await supabase.from("activity_logs").insert({ organisation_id: org.id, action: "franchise.invited", entity_type: "franchise_application", entity_id: id, summary: `Franchise application sent to ${app.name}` }).then(() => undefined, () => undefined);
    revalidatePath("/franchise");
    return { ok: true, message: `Application emailed to ${app.email}.` };
  });
}

/** The private link, to send yourself (marks the enquiry as "Application sent"). */
export async function copyApplicationLink(id: string): Promise<R> {
  return wrap(async () => {
    const { supabase, org, app } = await manager(id);
    if (app.status === "enquiry") { const now = new Date().toISOString(); await supabase.from("franchise_applications").update({ status: "invited", invited_at: now, updated_at: now }).eq("id", id); }
    revalidatePath("/franchise");
    return { ok: true, message: "Link copied — paste it into your email or message.", link: linkFor(org.slug, app.token) };
  });
}

export async function setFranchiseStatus(id: string, status: string): Promise<R> {
  return wrap(async () => {
    if (!(FRANCHISE_STATUSES as readonly string[]).includes(status)) throw new Error("Unknown status.");
    const { supabase, org, app, profile } = await manager(id);
    const now = new Date().toISOString();
    const decided = ["approved", "declined", "withdrawn"].includes(status);
    const { error } = await supabase.from("franchise_applications").update({ status, updated_at: now, decided_at: decided ? now : null, decided_by: decided ? (profile as { id: string }).id : null }).eq("id", id);
    if (error) throw new Error(error.message);
    await supabase.from("activity_logs").insert({ organisation_id: org.id, action: `franchise.${status}`, entity_type: "franchise_application", entity_id: id, summary: `Franchise application — ${app.name}: ${status}` }).then(() => undefined, () => undefined);
    revalidatePath("/franchise");
    return { ok: true, message: "Saved." };
  });
}

export async function saveFranchiseNotes(id: string, notes: string): Promise<R> {
  return wrap(async () => {
    const { supabase } = await manager(id);
    const { error } = await supabase.from("franchise_applications").update({ notes: notes.slice(0, 8000) || null, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) throw new Error(error.message);
    revalidatePath("/franchise");
    return { ok: true, message: "Notes saved." };
  });
}

/** Save the application form's questions (Franchise → Application questions). */
export async function saveFranchiseQuestions(input: unknown): Promise<R> {
  return wrap(async () => {
    const ctx = await requireOrg();
    if (!["owner", "admin", "manager"].includes(ctx.role)) throw new Error("Only owners, admins and managers can change the application.");
    const { cleanQuestions } = await import("@/lib/franchise/core");
    const c = cleanQuestions(input);
    if (!c.ok) throw new Error(c.error);
    const { data, error: e1 } = await ctx.supabase.from("organisations").select("settings").eq("id", ctx.org.id).single();
    if (e1) throw new Error(e1.message);
    const settings = (data?.settings ?? {}) as Record<string, unknown>;
    const franchise = (settings.franchise && typeof settings.franchise === "object" ? settings.franchise : {}) as Record<string, unknown>;
    const { error } = await ctx.supabase.from("organisations").update({ settings: { ...settings, franchise: { ...franchise, questions: c.questions } } }).eq("id", ctx.org.id);
    if (error) throw new Error(error.message);
    revalidatePath("/franchise");
    revalidatePath("/site", "layout");
    return { ok: true, message: `Saved — ${c.questions.length} question${c.questions.length === 1 ? "" : "s"}. New applications use them straight away.` };
  });
}

export async function resetFranchiseQuestions(): Promise<R> {
  return wrap(async () => {
    const ctx = await requireOrg();
    if (!["owner", "admin", "manager"].includes(ctx.role)) throw new Error("Only owners, admins and managers can change the application.");
    const { data } = await ctx.supabase.from("organisations").select("settings").eq("id", ctx.org.id).single();
    const settings = (data?.settings ?? {}) as Record<string, unknown>;
    const franchise = { ...((settings.franchise as Record<string, unknown>) ?? {}) };
    delete franchise.questions;
    const { error } = await ctx.supabase.from("organisations").update({ settings: { ...settings, franchise } }).eq("id", ctx.org.id);
    if (error) throw new Error(error.message);
    revalidatePath("/franchise");
    return { ok: true, message: "Back to the built-in questions." };
  });
}
