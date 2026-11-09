"use server";

import { revalidatePath } from "next/cache";
import { canManage, requireOrg } from "@/lib/context";
import { createServiceClient } from "@/lib/integrations/runtime";
import { logActivity } from "@/lib/activity";
import { callConnector } from "@/lib/nerdherd/connector";
import { KIND_LABEL, type AiJob } from "@/lib/nerdherd/ai-runner";

/**
 * Nerd Herd → AI maintenance: start a job on a connected site (a written request, or a quick update), follow it,
 * cancel, retry, make the draft invoice by hand, undo one change, get a backup download link, restore the database.
 * Owners, admins and managers only. The site's connection key never leaves the server.
 */
type R<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
const UUID = /^[0-9a-f-]{36}$/i;
const fail = (e: unknown): { ok: false; error: string } => {
  const m = e instanceof Error ? e.message : String(e);
  return { ok: false, error: /nh_ai_jobs/.test(m) && /does not exist|could not find/i.test(m) ? "AI maintenance needs the 0104 database update first." : m };
};

async function ctx() {
  const c = await requireOrg();
  if (!canManage(c.role)) throw new Error("Only owners, admins and managers can run AI maintenance.");
  return { ...c, db: createServiceClient() };
}

async function jobFor(id: string) {
  if (!UUID.test(id)) throw new Error("Refresh and try again.");
  const c = await ctx();
  const { data } = await c.db.from("nh_ai_jobs").select("*").eq("id", id).eq("organisation_id", c.org.id).maybeSingle();
  if (!data) throw new Error("That job no longer exists.");
  return { c, job: data as AiJob };
}

async function siteConn(db: ReturnType<typeof createServiceClient>, websiteId: string) {
  const [{ data: conn }, { data: k }] = await Promise.all([
    db.from("website_connectors").select("site_url").eq("website_id", websiteId).maybeSingle(),
    db.from("website_connector_keys").select("key").eq("website_id", websiteId).maybeSingle(),
  ]);
  if (!conn || !k?.key) throw new Error("This site isn't connected.");
  return { url: conn.site_url as string, key: k.key as string };
}

/** Wake the runner now (the database makes the call, the same way the every-minute check does). */
async function kick(db: ReturnType<typeof createServiceClient>) {
  await db.rpc("nh_ai_kick").then(() => undefined, () => undefined);
}

const refresh = (id?: string, websiteId?: string) => {
  revalidatePath("/nerd-herd/ai");
  if (id) revalidatePath(`/nerd-herd/ai/${id}`);
  if (websiteId) revalidatePath(`/nerd-herd/websites/${websiteId}`);
};

export async function startAiJob(i: { websiteId: string; kind: AiJob["kind"]; request?: string; billable: boolean; ticketId?: string | null }): Promise<R<{ id: string; number: number }>> {
  try {
    const { db, org, user, supabase } = await ctx();
    if (!UUID.test(i.websiteId)) throw new Error("Choose a website.");
    if (!["request", "update_plugins", "update_core", "update_all"].includes(i.kind)) throw new Error("Choose what to do.");
    const request = (i.request ?? "").trim().slice(0, 12000);
    if (i.kind === "request" && request.length < 8) throw new Error("Write the changes you want made.");
    const { data: site } = await db.from("websites").select("id, domain, customer_id").eq("id", i.websiteId).eq("organisation_id", org.id).maybeSingle();
    if (!site) throw new Error("That website no longer exists.");
    const { data: conn } = await db.from("website_connectors").select("connector_version").eq("website_id", site.id).maybeSingle();
    if (!conn) throw new Error(`${site.domain} isn't connected to the Web Culture Connector.`);
    const busy = await db.from("nh_ai_jobs").select("number").eq("website_id", site.id).in("status", ["queued", "backing_up", "running", "finishing"]).limit(1).maybeSingle();
    if (busy.data) throw new Error(`AI-${busy.data.number} is still running on ${site.domain} — wait for it to finish (one job per site at a time).`);
    let ticketId: string | null = null;
    if (i.ticketId && UUID.test(i.ticketId)) {
      const { data: t } = await db.from("support_tickets").select("id").eq("id", i.ticketId).eq("organisation_id", org.id).maybeSingle();
      ticketId = (t?.id as string | undefined) ?? null;
    }
    const { data, error } = await db.from("nh_ai_jobs").insert({
      organisation_id: org.id, website_id: site.id, customer_id: site.customer_id, ticket_id: ticketId, kind: i.kind,
      request: i.kind === "request" ? request : KIND_LABEL[i.kind], billable: !!i.billable, source: "staff", status: "queued", stage_note: "Queued", created_by: user.id,
    }).select("id, number").single();
    if (error) throw new Error(error.message);
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "website.ai_job", entityType: "website", entityId: site.id, customerId: site.customer_id, summary: `Started AI-${data.number} on ${site.domain}: ${i.kind === "request" ? request.slice(0, 120) : KIND_LABEL[i.kind]}` }).catch(() => undefined);
    await kick(db);
    refresh(data.id as string, site.id as string);
    return { ok: true, data: { id: data.id as string, number: data.number as number } };
  } catch (e) { return fail(e); }
}

export async function cancelAiJob(id: string): Promise<R<string>> {
  try {
    const { c, job } = await jobFor(id);
    if (!["queued", "backing_up"].includes(job.status)) throw new Error(job.status === "running" ? "Claude is already making changes — let it finish, then undo what you don't want." : "This job has finished.");
    await c.db.from("nh_ai_jobs").update({ status: "cancelled", stage_note: "Cancelled", finished_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id);
    refresh(id, job.website_id);
    return { ok: true, data: "Cancelled — nothing was changed on the site." };
  } catch (e) { return fail(e); }
}

/** Try a failed/stuck job again from where it stopped (the backup is kept). */
export async function retryAiJob(id: string): Promise<R<string>> {
  try {
    const { c, job } = await jobFor(id);
    if (!["failed", "needs_attention", "backing_up", "running", "finishing"].includes(job.status)) throw new Error("This job can't be retried.");
    const status = job.backup && job.status !== "backing_up" ? (job.report ? "finishing" : "running") : job.backup_id && job.status === "backing_up" ? "backing_up" : "queued";
    await c.db.from("nh_ai_jobs").update({ status, error: null, net_errors: 0, locked_until: null, finished_at: null, stage_note: "Retrying", updated_at: new Date().toISOString() }).eq("id", id);
    await kick(c.db);
    refresh(id, job.website_id);
    return { ok: true, data: "Started again." };
  } catch (e) { return fail(e); }
}

/** Make the draft invoice for a job that was started as "don't invoice" (or redo one that was voided). */
export async function invoiceAiJob(id: string): Promise<R<string>> {
  try {
    const { c, job } = await jobFor(id);
    if (!["done", "needs_attention"].includes(job.status)) throw new Error("Wait for the job to finish.");
    if (job.source === "quote") throw new Error("This job was paid for by its quote.");
    if (job.invoice_id) {
      const { data: inv } = await c.db.from("invoices").select("status").eq("id", job.invoice_id).maybeSingle();
      if (inv && inv.status !== "void") throw new Error("This job already has an invoice.");
    }
    await c.db.from("nh_ai_jobs").update({ billable: true, invoice_id: null, status: "finishing", locked_until: null, updated_at: new Date().toISOString() }).eq("id", id);
    // finishing again only adds what's missing (the history entry is already there)
    const { runAiJobs } = await import("@/lib/nerdherd/ai-runner");
    await runAiJobs({ jobId: id, budgetMs: 60_000 });
    const { data: after } = await c.db.from("nh_ai_jobs").select("invoice_id, notes").eq("id", id).single();
    refresh(id, job.website_id);
    revalidatePath("/invoices");
    return after?.invoice_id ? { ok: true, data: "Draft invoice made — review it and send it." } : { ok: false, error: after?.notes ?? "The invoice couldn't be made." };
  } catch (e) { return fail(e); }
}

/** Reverse one change Claude made (newest first). */
export async function undoAiChange(id: string, changeId: string): Promise<R<string>> {
  try {
    const { c, job } = await jobFor(id);
    if (!/^c\d+[a-z0-9]+$/.test(changeId)) throw new Error("That change can't be undone here.");
    const site = await siteConn(c.db, job.website_id);
    await callConnector(site.url, site.key, "POST", "/undo", { change_id: changeId });
    const changes = (job.changes ?? []).map((x) => (x.change_id === changeId ? { ...x, ok: false, summary: `${x.summary} (undone ${new Date().toLocaleString("en-AU", { timeZone: c.org.timezone ?? "Australia/Sydney" })})` } : x));
    await c.db.from("nh_ai_jobs").update({ changes, updated_at: new Date().toISOString() }).eq("id", id);
    await c.db.from("website_maintenance_runs").insert({ organisation_id: c.org.id, website_id: job.website_id, action: "content", ok: true, summary: `Undid a change from AI-${job.number}: ${(job.changes ?? []).find((x) => x.change_id === changeId)?.summary ?? changeId}`.slice(0, 2000), actor: c.user.id, public: false, ai_job_id: job.id });
    refresh(id, job.website_id);
    return { ok: true, data: "Undone." };
  } catch (e) { return fail(e); }
}

/** A 10-minute, single-use link to download the backup's database file (or a files part). */
export async function backupDownload(id: string, part = "database.sql.gz"): Promise<R<string>> {
  try {
    const { c, job } = await jobFor(id);
    if (!job.backup_id) throw new Error("This job has no backup.");
    const site = await siteConn(c.db, job.website_id);
    const r = await callConnector<{ url: string }>(site.url, site.key, "POST", "/backup/download-link", { id: job.backup_id, part });
    return { ok: true, data: r.url };
  } catch (e) { return fail(e); }
}

/** Put the site's database back to the backup made before this job (undoes every content change since). */
export async function restoreAiBackup(id: string): Promise<R<string>> {
  try {
    const { c, job } = await jobFor(id);
    if (!job.backup_id) throw new Error("This job has no backup.");
    const site = await siteConn(c.db, job.website_id);
    let r: { status: string; error?: string | null; statements?: number } = { status: "running" };
    const until = Date.now() + 240_000;
    while (r.status === "running" && Date.now() < until) {
      r = await callConnector(site.url, site.key, "POST", "/backup/restore", { id: job.backup_id, budget: 25 }, 120_000);
    }
    if (r.status !== "done") throw new Error(r.error ? `Restore failed: ${r.error}` : "The restore is taking a while — press Restore again to carry on.");
    await c.db.from("website_maintenance_runs").insert({ organisation_id: c.org.id, website_id: job.website_id, action: "restore", ok: true, summary: `Database restored from the backup made before AI-${job.number}`, actor: c.user.id, public: true, ai_job_id: job.id });
    await c.db.from("nh_ai_jobs").update({ changes: (job.changes ?? []).map((x) => ({ ...x, ok: false })), notes: `${job.notes ? `${job.notes}\n` : ""}Database restored from the backup — all changes from this job were reversed.`, updated_at: new Date().toISOString() }).eq("id", id);
    refresh(id, job.website_id);
    return { ok: true, data: "The database is back to how it was before this job." };
  } catch (e) { return fail(e); }
}

/** Live status for the job list / report (polled every few seconds while a job is running). */
export async function aiJobStatus(ids: string[]): Promise<R<{ id: string; status: string; stage_note: string | null; changes: number; report_summary: string | null }[]>> {
  try {
    const { supabase, org } = await requireOrg();
    const clean = (ids ?? []).filter((x) => UUID.test(x)).slice(0, 50);
    if (!clean.length) return { ok: true, data: [] };
    const { data } = await supabase.from("nh_ai_jobs").select("id, status, stage_note, changes, report_summary").eq("organisation_id", org.id).in("id", clean);
    return { ok: true, data: (data ?? []).map((j) => ({ id: j.id as string, status: j.status as string, stage_note: j.stage_note as string | null, changes: Array.isArray(j.changes) ? j.changes.length : 0, report_summary: j.report_summary as string | null })) };
  } catch (e) { return fail(e); }
}
