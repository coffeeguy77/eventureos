"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/context";
import { actorName, logActivity } from "@/lib/activity";
import { createServiceClient } from "@/lib/integrations/runtime";
import { emailConfigured, sendEmail } from "@/lib/email/send";
import { brandOf, publicOrg } from "@/lib/bookings/server";
import { readJobSettings, type JobSettings } from "@/lib/jobs/core";
import { jobNoticeEmail } from "@/lib/jobs/emails";
import { jobsOrg, jobsUrl, queueWelcome, welcomeEmailFor } from "@/lib/jobs/server";

export type Result<T = string> = { ok: true; data: T } | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NEEDS_DB = "Run the 0051 database update (barista jobs) in Supabase first.";
const msg = (e: unknown) => { const m = e instanceof Error ? e.message : String(e); return /job_|relation .* does not exist|schema cache/i.test(m) ? NEEDS_DB : m; };

async function manager() {
  const ctx = await requireOrg();
  if (!["owner", "admin", "manager"].includes(ctx.role)) throw new Error("Only owners, admins and managers can do that.");
  return ctx;
}
async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try { return { ok: true, data: await fn() }; } catch (e) { return { ok: false, error: msg(e) }; }
}

export async function setEmployerStatus(id: string, status: "approved" | "blocked" | "pending"): Promise<Result> {
  return run(async () => {
    const { org, user, profile, supabase } = await manager();
    if (!UUID.test(id) || !["approved", "blocked", "pending"].includes(status)) throw new Error("Employer not found.");
    const db = createServiceClient();
    const { data: emp, error } = await db.from("job_employers").update({ status, ...(status === "approved" ? { approved_at: new Date().toISOString(), approved_by: user.id } : {}) })
      .eq("id", id).eq("organisation_id", org.id).select("business_name, contact_name, email").single();
    if (error) throw error;
    if (status === "blocked") await db.from("job_posts").update({ status: "removed" }).eq("employer_id", id).eq("status", "open");
    if (status === "approved" && emailConfigured()) {
      const o = await jobsOrg(org.slug, db);
      if (o) {
        const m = jobNoticeEmail(brandOf(o), { heading: `You're approved on ${o.jobs.name}`, lines: [`Hi ${String(emp.contact_name).split(/\s+/)[0]}, ${emp.business_name} can now search trained baristas and post jobs and shifts.`, "Sign in with your email address — no password needed."],
          button: { label: "Go to your dashboard", url: jobsUrl(o, "/employers") }, footer: o.jobs.name });
        await sendEmail({ to: emp.email as string, subject: m.subject, html: m.html, text: m.text, fromName: o.jobs.name, replyTo: o.settings.reply_to ?? o.contact_email }).catch(() => undefined);
      }
    }
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: `jobs.employer_${status}`, entityType: "job_employer", entityId: id, summary: `${actorName(profile)} ${status === "approved" ? "approved" : status === "blocked" ? "blocked" : "un-approved"} employer ${emp.business_name}` });
    revalidatePath("/bookings/jobs");
    return status === "approved" ? `${emp.business_name} approved — we've emailed them.` : "Updated.";
  });
}

export async function removePost(id: string): Promise<Result> {
  return run(async () => {
    const { org } = await manager();
    if (!UUID.test(id)) throw new Error("Job not found.");
    const { error } = await createServiceClient().from("job_posts").update({ status: "removed" }).eq("id", id).eq("organisation_id", org.id);
    if (error) throw error;
    revalidatePath("/bookings/jobs");
    return "Removed from the board.";
  });
}

export async function saveJobSettings(s: Partial<JobSettings>): Promise<Result<JobSettings>> {
  return run(async () => {
    const { org, supabase } = await manager();
    const { data: o, error: e1 } = await supabase.from("organisations").select("settings").eq("id", org.id).single();
    if (e1) throw e1;
    const current = (o.settings ?? {}) as Record<string, unknown>;
    const merged = readJobSettings({ jobs: { ...((current.jobs as object) ?? {}), ...s } }, org.name);
    const { error } = await supabase.from("organisations").update({ settings: { ...current, jobs: merged } }).eq("id", org.id);
    if (error) throw error;
    revalidatePath("/bookings/jobs");
    return merged;
  });
}

/** A copy of the welcome letter to the signed-in person (its links are examples and don't sign anyone in). */
export async function sendTestWelcome(): Promise<Result> {
  return run(async () => {
    const { org, profile } = await manager();
    if (!emailConfigured()) throw new Error("Email isn't set up.");
    const o = await jobsOrg(org.slug);
    if (!o || !profile.email) throw new Error("No email address on your login.");
    const m = await welcomeEmailFor(o, { name: profile.full_name || "Sam Sample", token: "0".repeat(40) });
    await sendEmail({ to: profile.email, subject: `[Test] ${m.subject}`, html: m.html, text: m.text, fromName: o.jobs.name, replyTo: o.settings.reply_to ?? o.contact_email });
    return `Test sent to ${profile.email}.`;
  });
}

/** Queue the welcome letter to everyone on the list who hasn't had it. It then goes out in small batches in the background. */
export async function queueWelcomeLetter(expected: number): Promise<Result<number>> {
  return run(async () => {
    const { org, user, profile, supabase } = await manager();
    const o = await publicOrg(org.slug);
    if (!o) throw new Error("Organisation not found.");
    const n = await queueWelcome(createServiceClient(), org.id);
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "jobs.welcome_queued", entityType: "organisation", entityId: org.id, summary: `${actorName(profile)} started sending the job board welcome letter to ${n} people (expected ${expected})` });
    revalidatePath("/bookings/jobs");
    return n;
  });
}

/** Stop: anything not yet sent is taken out of the queue. */
export async function cancelQueuedWelcome(): Promise<Result<number>> {
  return run(async () => {
    const { org, user, profile, supabase } = await manager();
    const { data, error } = await createServiceClient().from("job_invites").delete().eq("organisation_id", org.id).eq("status", "queued").select("id");
    if (error) throw error;
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "jobs.welcome_cancelled", entityType: "organisation", entityId: org.id, summary: `${actorName(profile)} stopped the job board welcome letter (${data?.length ?? 0} not sent)` });
    revalidatePath("/bookings/jobs");
    return data?.length ?? 0;
  });
}
