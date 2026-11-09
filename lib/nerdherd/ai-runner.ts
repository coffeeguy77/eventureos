import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/integrations/runtime";
import { orgAiKey } from "@/lib/ai/key";
import { callConnector, describeUpdate, storeStatus, syncLog, type ConnectorStatus, type UpdateResult } from "./connector";
import { AI_DEFAULT_MODEL, claudeTurn, costOf, runTool, systemPrompt, updateHours, type Block, type Msg } from "./ai-agent";
import { readNerd } from "./core";
import { splitInc } from "./quotes";

/**
 * Nerd Herd AI maintenance — the job runner.
 *
 * A job moves queued → backing_up → running → finishing → done (or needs_attention / failed). Each call to
 * runAiJobs() claims one job at a time (row lock with an expiry), advances it until its time slice is used, saves
 * where it got to, and lets go. pg_cron wakes /api/cron/nerd-herd-ai every minute while jobs are waiting
 * (migration 0104), and starting a job wakes it straight away — so a job carries on across many runs: a big backup,
 * a long conversation with Claude, a slow update, none of it has to fit in one request.
 *
 * Nothing is changed on a site until its backup has finished.
 */

export type AiJob = {
  id: string; organisation_id: string; number: number; website_id: string; customer_id: string | null; ticket_id: string | null; quote_id: string | null;
  kind: "request" | "update_plugins" | "update_core" | "update_all"; request: string | null; billable: boolean; source: "staff" | "quote";
  status: string; stage_note: string | null; backup_scope: string | null; backup_id: string | null; backup: Record<string, unknown> | null;
  model: string | null; messages: Msg[]; turns: number; changes: Change[];
  report_summary: string | null; report: string | null; notes: string | null; manual_hours: number | null; hours_breakdown: { task: string; hours: number }[] | null;
  invoice_id: string | null; input_tokens: number; output_tokens: number; cost_usd: number; error: string | null; net_errors: number;
  created_by: string | null; created_at: string; started_at: string | null; finished_at: string | null;
};
export type Change = { at: string; summary: string; change_id: string; tool: string; ok: boolean };

export const KIND_LABEL: Record<AiJob["kind"], string> = {
  request: "Changes", update_plugins: "Update plugins", update_core: "Update WordPress", update_all: "Update everything",
};
const MAX_TURNS = 40;
const UPDATE_TYPE = { update_plugins: "plugins", update_core: "core", update_all: "all" } as const;

/** Nerd Herd AI settings (organisations.settings.nerdherd.ai_*). */
export function readAiSettings(settings: unknown) {
  const n = ((settings && typeof settings === "object" ? (settings as Record<string, unknown>).nerdherd : null) ?? {}) as Record<string, unknown>;
  const num = (v: unknown, d: number, min: number, max: number) => { const x = Number(v); return Number.isFinite(x) && x >= min && x <= max ? x : d; };
  return {
    model: typeof n.ai_model === "string" && /^claude-[a-z0-9.-]{3,60}$/.test(n.ai_model) ? n.ai_model : (process.env.NERD_AI_MODEL?.trim() || AI_DEFAULT_MODEL),
    jobCapUsd: num(n.ai_job_cap_usd, 5, 0.5, 100),
    monthlyCapUsd: num(n.ai_monthly_cap_usd, 50, 1, 5000),
    backupHours: num(n.ai_backup_hours, 0.25, 0, 8),
  };
}

type Db = SupabaseClient;

async function save(db: Db, id: string, patch: Record<string, unknown>) {
  const { error } = await db.from("nh_ai_jobs").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(`Couldn't save the job: ${error.message}`);
}

async function connection(db: Db, websiteId: string) {
  const [{ data: conn }, { data: k }, { data: w }] = await Promise.all([
    db.from("website_connectors").select("site_url, connector_version").eq("website_id", websiteId).maybeSingle(),
    db.from("website_connector_keys").select("key").eq("website_id", websiteId).maybeSingle(),
    db.from("websites").select("domain, customer_id, customers(name)").eq("id", websiteId).maybeSingle(),
  ]);
  if (!conn || !k?.key) throw new Error("This site isn't connected to the Web Culture Connector any more.");
  const c = (w as { customers?: { name?: string } | null } | null)?.customers;
  return { url: conn.site_url as string, key: k.key as string, version: (conn.connector_version as string | null) ?? "0", domain: (w?.domain as string) ?? "", customerId: (w?.customer_id as string | null) ?? null, clientName: c?.name ?? null };
}

const vNum = (v: string) => v.split(".").map((x) => Number(x) || 0).reduce((a, b, i) => a + b / 1000 ** i, 0);

/** Claim and advance jobs until the time is used. Returns what was done (for the cron log). */
export async function runAiJobs(opts: { jobId?: string; budgetMs?: number } = {}) {
  const db = createServiceClient();
  const until = Date.now() + (opts.budgetMs ?? 250_000);
  const log: string[] = [];
  for (let n = 0; n < 6 && Date.now() < until - 20_000; n++) {
    const secs = Math.ceil((until - Date.now()) / 1000) + 60;
    const { data, error } = await db.rpc("nh_ai_claim", { p_job: opts.jobId ?? null, p_seconds: secs });
    if (error) throw new Error(error.message);
    const job = (Array.isArray(data) ? data[0] : data) as AiJob | undefined;
    if (!job) break;
    try {
      const r = await advance(db, job, until);
      log.push(`AI-${job.number}: ${r}`);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      log.push(`AI-${job.number}: error ${m}`);
      await fail(db, job, m).catch(() => undefined);
    } finally {
      await db.from("nh_ai_jobs").update({ locked_until: null }).eq("id", job.id);
    }
    if (opts.jobId) break;
  }
  return log;
}

async function fail(db: Db, job: AiJob, message: string) {
  const changed = (job.changes ?? []).length > 0;
  await save(db, job.id, {
    status: changed ? "needs_attention" : "failed", error: message.slice(0, 2000), finished_at: new Date().toISOString(),
    stage_note: changed ? "Stopped part-way — check the changes" : "Failed — nothing was changed",
  });
  await notify(db, job, changed ? `AI-${job.number} stopped part-way — needs checking` : `AI-${job.number} failed`, message);
}

async function notify(db: Db, job: AiJob, title: string, body: string) {
  await db.from("notifications").insert({
    organisation_id: job.organisation_id, type: "nerdherd.ai", title: title.slice(0, 200), body: body.slice(0, 1000),
    link: `/nerd-herd/ai/${job.id}`, entity_type: "nh_ai_job", entity_id: job.id,
  }).then(() => undefined, () => undefined);
}

/** Network hiccups talking to the site: retry on the next run, give up after a few in a row. */
async function netError(db: Db, job: AiJob, e: unknown, what: string) {
  const m = e instanceof Error ? e.message : String(e);
  const n = (job.net_errors ?? 0) + 1;
  if (n >= 8) throw new Error(`${what}: ${m}`);
  await save(db, job.id, { net_errors: n, stage_note: `${what} — retrying (${m.slice(0, 120)})` });
  return `retry ${n}: ${m}`;
}

async function advance(db: Db, job: AiJob, until: number): Promise<string> {
  const site = await connection(db, job.website_id);
  if (vNum(site.version) < vNum("1.4.0")) throw new Error(`The site's Web Culture Connector is ${site.version} — update it to 1.4.0 or later (Websites → the site → Update the Connector).`);
  const left = () => until - Date.now();

  // 1. Backup ------------------------------------------------------------------------------------
  if (job.status === "queued") {
    const scope = job.kind === "request" ? "database" : "code";
    try {
      const r = await callConnector<{ id: string; status: string; error: string | null; backup?: Record<string, unknown> }>(site.url, site.key, "POST", "/backup/start",
        { label: `AI-${job.number}: ${job.kind === "request" ? "before AI changes" : `before ${KIND_LABEL[job.kind].toLowerCase()}`}`, scope, budget: 25 }, 120_000);
      job = { ...job, status: "backing_up", backup_scope: scope, backup_id: r.id, net_errors: 0 };
      await save(db, job.id, { status: "backing_up", backup_scope: scope, backup_id: r.id, started_at: new Date().toISOString(), stage_note: "Backing up the site", net_errors: 0 });
      if (r.status === "failed") throw new Error(`Backup failed — nothing was changed. ${r.error ?? ""}`);
      if (r.status === "done") { job = await backupDone(db, job, r.backup ?? null); }
    } catch (e) {
      if (/Backup failed/.test(String(e))) throw e;
      return netError(db, job, e, "Starting the backup");
    }
  }
  while (job.status === "backing_up" && left() > 45_000) {
    try {
      const r = await callConnector<{ status: string; error: string | null; progress?: { files_done: number; files_total: number; tables_done: number; tables: number }; backup?: Record<string, unknown> }>(
        site.url, site.key, "POST", "/backup/step", { id: job.backup_id, budget: 25 }, 120_000);
      if (r.status === "failed") throw new Error(`Backup failed — nothing was changed. ${r.error ?? ""}`);
      if (r.status === "done") { job = await backupDone(db, job, r.backup ?? null); break; }
      const p = r.progress;
      await save(db, job.id, { net_errors: 0, stage_note: p ? (p.files_total ? `Backing up files ${p.files_done} of ${p.files_total}` : `Backing up the database (${p.tables_done} of ${p.tables} tables)`) : "Backing up" });
      job.net_errors = 0;
    } catch (e) {
      if (/Backup failed|not running/.test(String(e))) throw e;
      return netError(db, job, e, "Backing up");
    }
  }
  if (job.status === "backing_up") return "backup in progress";

  // 2. The work ----------------------------------------------------------------------------------
  if (job.status === "running") {
    if (job.kind !== "request") {
      if (left() < 200_000) return "waiting for a longer slot to run updates";
      return runUpdates(db, job, site);
    }
    const r = await runClaude(db, job, site, until);
    if (r !== "finished") return r;
    job = (await db.from("nh_ai_jobs").select("*").eq("id", job.id).single()).data as AiJob;
  }

  // 3. Report, history, invoice -----------------------------------------------------------------
  if (job.status === "finishing") return finish(db, job, site);
  return job.status;
}

async function backupDone(db: Db, job: AiJob, manifest: Record<string, unknown> | null) {
  const note = job.kind === "request" ? "Backup done — Claude is working" : "Backup done — updating";
  await save(db, job.id, { status: "running", backup: manifest, stage_note: note, net_errors: 0 });
  return { ...job, status: "running", backup: manifest, net_errors: 0 };
}

// ------------------------------------------------------------------------------------------------
// Quick actions: updates
// ------------------------------------------------------------------------------------------------

async function runUpdates(db: Db, job: AiJob, site: Awaited<ReturnType<typeof connection>>) {
  await save(db, job.id, { stage_note: "Running updates" });
  let r: UpdateResult;
  try {
    r = await callConnector<UpdateResult>(site.url, site.key, "POST", "/update", { type: UPDATE_TYPE[job.kind as keyof typeof UPDATE_TYPE], items: [] }, 280_000);
  } catch (e) {
    // the update may have run even though the answer was lost — read the site's log before deciding
    await syncLog(db, job.organisation_id, job.website_id, site.url, site.key).catch(() => undefined);
    throw new Error(`The update request didn't come back (${e instanceof Error ? e.message : e}). Check the site and its maintenance history — a backup was made first.`);
  }
  const now = new Date().toISOString();
  const okPlugins = (r.plugins ?? []).filter((p) => p.ok), okThemes = (r.themes ?? []).filter((t) => t.ok);
  const coreOk = !!r.core?.ok && r.core.from !== r.core.to;
  const failed = [...(r.plugins ?? []).filter((p) => !p.ok).map((p) => `${p.name}: ${p.error ?? "failed"}`), ...(r.themes ?? []).filter((t) => !t.ok).map((t) => `${t.slug}: ${t.error ?? "failed"}`), ...(r.core && !r.core.ok && r.core.error !== "Already up to date." ? [`WordPress: ${r.core.error}`] : [])];
  const changes: Change[] = [
    ...(coreOk ? [{ at: now, summary: `Updated WordPress ${r.core!.from} → ${r.core!.to}`, change_id: "", tool: "update", ok: true }] : []),
    ...okPlugins.map((p) => ({ at: now, summary: `Updated plugin ${p.name} ${p.from ?? ""} → ${p.to ?? ""}`.replace(/\s+/g, " "), change_id: "", tool: "update", ok: true })),
    ...okThemes.map((t) => ({ at: now, summary: `Updated theme ${t.slug} ${t.from} → ${t.to}`, change_id: "", tool: "update", ok: true })),
  ];
  const est = updateHours({ plugins: okPlugins.length, themes: okThemes.length, core: coreOk });
  const healthy = !!r.health_after?.ok;
  const summary = changes.length ? describeUpdate(r, r.summary) : "Everything was already up to date";
  const report = [
    `**${KIND_LABEL[job.kind]}** on ${site.domain}`,
    "",
    changes.length ? changes.map((c) => `- ${c.summary}`).join("\n") : "- Nothing needed updating.",
    failed.length ? `\n**Not updated**\n${failed.map((f) => `- ${f}`).join("\n")}` : "",
    `\nSite check after updating: ${healthy ? "OK" : `problem — ${r.health_after?.message ?? "unknown"}`}`,
  ].join("\n");
  await save(db, job.id, {
    status: "finishing", changes, report_summary: summary, report, manual_hours: changes.length ? est.hours : 0, hours_breakdown: changes.length ? est.breakdown : [],
    notes: [!healthy ? `The homepage check failed after updating (${r.health_after?.message}). Check the site now — restore the backup if it's broken.` : "", failed.length ? `Some items didn't update: ${failed.join("; ")}` : ""].filter(Boolean).join("\n") || null,
    stage_note: "Writing the report",
  });
  try { await syncLog(db, job.organisation_id, job.website_id, site.url, site.key); } catch { /* best effort */ }
  try { await storeStatus(db, job.website_id, await callConnector<ConnectorStatus>(site.url, site.key, "GET", "/status")); } catch { /* best effort */ }
  const fresh = (await db.from("nh_ai_jobs").select("*").eq("id", job.id).single()).data as AiJob;
  return finish(db, { ...fresh, error: healthy && !failed.length ? null : "check" }, site);
}

// ------------------------------------------------------------------------------------------------
// Written requests: Claude
// ------------------------------------------------------------------------------------------------

async function monthSpend(db: Db, orgId: string) {
  const start = new Date(); start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0);
  const { data } = await db.from("nh_ai_jobs").select("cost_usd").eq("organisation_id", orgId).gte("created_at", start.toISOString());
  return (data ?? []).reduce((s, r) => s + Number(r.cost_usd || 0), 0);
}

async function runClaude(db: Db, job: AiJob, site: Awaited<ReturnType<typeof connection>>, until: number): Promise<string> {
  const { data: org } = await db.from("organisations").select("settings").eq("id", job.organisation_id).single();
  const ai = readAiSettings(org?.settings);
  const key = await orgAiKey(job.organisation_id);
  if (!key) throw new Error("No Claude API key — add one in Settings → Integrations → AI.");
  const model = job.model || ai.model;
  const system = systemPrompt({ domain: site.domain, url: site.url, clientName: site.clientName });
  let messages: Msg[] = Array.isArray(job.messages) && job.messages.length ? job.messages : [{ role: "user", content: `Request from the Web Culture team (job AI-${job.number}):\n\n${job.request ?? ""}` }];
  let { turns, cost_usd: cost, input_tokens: inTok, output_tokens: outTok } = job;
  let changes = [...(job.changes ?? [])];
  cost = Number(cost) || 0;

  while (Date.now() < until - 100_000) {
    if (turns >= MAX_TURNS) {
      messages.push({ role: "user", content: "You have reached the step limit. Call finish now with what you have done, and needs_attention=true if anything is incomplete." });
    }
    if (cost >= ai.jobCapUsd) throw new Error(`Stopped: this job reached its AI spending limit (US$${ai.jobCapUsd.toFixed(2)}). Raise it in Nerd Herd → Settings, or finish by hand.`);
    if ((await monthSpend(db, job.organisation_id)) >= ai.monthlyCapUsd) throw new Error(`Stopped: this month's AI maintenance budget (US$${ai.monthlyCapUsd.toFixed(2)}) is used up. Raise it in Nerd Herd → Settings.`);

    await save(db, job.id, { stage_note: turns ? `Claude is working (step ${turns + 1})` : "Claude is reading the site", model });
    let turn;
    try {
      turn = await claudeTurn(key, model, system, messages);
    } catch (e) {
      if ((e as { retry?: boolean }).retry) return netError(db, job, e, "Waiting for Claude");
      throw e;
    }
    turns++;
    cost += costOf(model, turn.usage);
    inTok += (turn.usage.input_tokens ?? 0) + (turn.usage.cache_creation_input_tokens ?? 0) + (turn.usage.cache_read_input_tokens ?? 0);
    outTok += turn.usage.output_tokens ?? 0;
    messages.push({ role: "assistant", content: turn.content });

    const uses = turn.content.filter((b): b is Extract<Block, { type: "tool_use" }> => b.type === "tool_use");
    const finishCall = uses.find((u) => u.name === "finish");
    if (finishCall) {
      const f = finishCall.input as { summary?: string; report?: string; manual_hours?: number; hours_breakdown?: { task: string; hours: number }[]; notes?: string; needs_attention?: boolean };
      const hours = Math.max(0.25, Math.ceil((Number(f.manual_hours) || 0.25) * 4 - 1e-9) / 4);
      await save(db, job.id, {
        status: "finishing", messages, turns, cost_usd: Math.round(cost * 10000) / 10000, input_tokens: inTok, output_tokens: outTok, changes, net_errors: 0,
        report_summary: (f.summary ?? "").slice(0, 500) || "Changes made", report: (f.report ?? "").slice(0, 20000), notes: (f.notes ?? "").slice(0, 5000) || null,
        manual_hours: changes.length ? hours : 0, hours_breakdown: Array.isArray(f.hours_breakdown) ? f.hours_breakdown.slice(0, 30).map((b) => ({ task: String(b.task).slice(0, 200), hours: Math.round(Number(b.hours) * 100) / 100 || 0 })) : [],
        error: f.needs_attention ? "needs_attention" : null, stage_note: "Writing the report",
      });
      return "finished";
    }
    if (!uses.length) {
      // talked without using a tool: nudge it to carry on or finish
      messages.push({ role: "user", content: "Carry on with the tools, or call finish if the work is done." });
    } else {
      const results: Block[] = [];
      for (const u of uses) {
        const out = await runTool(site, u.name, u.input ?? {});
        if (out.change && !out.isError) changes.push({ at: new Date().toISOString(), summary: out.change.summary, change_id: out.change.change_id, tool: out.change.tool, ok: true });
        results.push({ type: "tool_result", tool_use_id: u.id, content: out.content, is_error: out.isError || undefined });
      }
      messages.push({ role: "user", content: results });
    }
    await save(db, job.id, { messages, turns, cost_usd: Math.round(cost * 10000) / 10000, input_tokens: inTok, output_tokens: outTok, changes, net_errors: 0 });
    job = { ...job, turns, changes, net_errors: 0 };
  }
  return `paused after step ${turns}`;
}

// ------------------------------------------------------------------------------------------------
// Finishing: the client's job file, the ticket, the draft invoice
// ------------------------------------------------------------------------------------------------

async function finish(db: Db, job: AiJob, site: Awaited<ReturnType<typeof connection>>): Promise<string> {
  const { data: org } = await db.from("organisations").select("currency, settings").eq("id", job.organisation_id).single();
  const nerd = readNerd(org?.settings), ai = readAiSettings(org?.settings);
  const now = new Date().toISOString();
  const needsAttention = !!job.error;
  const changes = job.changes ?? [];

  // the time-stamped history on the website (what clients see in their portal)
  const { data: already } = await db.from("website_maintenance_runs").select("id").eq("ai_job_id", job.id).limit(1);
  if (!already?.length) {
    const backupLine = job.backup ? `Backup made first (${job.backup_scope === "code" ? "database, themes and plugins" : job.backup_scope === "full" ? "database and all files" : "database"}).` : null;
    await db.from("website_maintenance_runs").insert({
      // client-facing (portal): plain summary + the list of changes; the request and job number stay internal
      organisation_id: job.organisation_id, website_id: job.website_id, action: job.kind === "request" ? "ai" : "update", scope: job.kind, ok: true,
      summary: (job.report_summary ?? KIND_LABEL[job.kind]).slice(0, 2000),
      detail: { report: job.report, changes: changes.map((c) => ({ at: c.at, summary: c.summary })), backup: backupLine, job: job.number },
      actor: job.created_by, public: true, source: "ai", ai_job_id: job.id, created_at: now,
    });
  }

  // draft invoice for billable jobs (not for quotes — the quote's invoice already paid for it)
  let invoiceId = job.invoice_id;
  let invoiceNote = "";
  if (job.billable && !invoiceId && changes.length) {
    if (!job.customer_id) invoiceNote = "No draft invoice: the website isn't linked to a client.";
    else {
      const rateInc = Math.round(nerd.hourlyRate * 1.1 * 100) / 100;
      const workHours = Math.max(0.25, Number(job.manual_hours) || 0.25);
      const lines = [
        { description: `${site.domain} — ${KIND_LABEL[job.kind] === "Changes" ? "website changes" : KIND_LABEL[job.kind].toLowerCase()}: ${job.report_summary ?? ""}`.slice(0, 1000), quantity: workHours, unit_amount: rateInc, tax_rate: 10, item_code: null, account_code: nerd.accountCode, inc: true, line_amount: Math.round(workHours * rateInc * 100) / 100 },
      ];
      if (ai.backupHours > 0) lines.push({ description: `${site.domain} — backup of the site before the work (${job.backup_scope === "code" ? "database, themes and plugins" : job.backup_scope === "full" ? "database and all files" : "database"})`, quantity: ai.backupHours, unit_amount: rateInc, tax_rate: 10, item_code: null, account_code: nerd.accountCode, inc: true, line_amount: Math.round(ai.backupHours * rateInc * 100) / 100 });
      const amt = splitInc(lines.reduce((s, l) => s + l.line_amount, 0));
      const { data: inv, error } = await db.from("invoices").insert({
        organisation_id: job.organisation_id, customer_id: job.customer_id, kind: "full", status: "draft", issue_date: now.slice(0, 10),
        subtotal: amt.subtotal, tax_total: amt.tax, total: amt.total, currency: org?.currency ?? "AUD", reference: `AI-${job.number} ${site.domain}`.slice(0, 200),
        line_items: lines, created_by: job.created_by,
      }).select("id").single();
      if (error) invoiceNote = `The draft invoice couldn't be made: ${error.message}`;
      else invoiceId = inv.id as string;
    }
  }

  // the ticket (jobs from a paid quote, or started from a ticket)
  if (job.ticket_id) {
    await db.from("support_ticket_updates").insert({
      organisation_id: job.organisation_id, ticket_id: job.ticket_id, kind: "system", author_id: null, author_name: "Nerd Herd AI",
      body: `AI-${job.number} ${needsAttention ? "finished — needs checking before telling the client" : "done"}: ${job.report_summary ?? ""}\n\n${changes.map((c) => `• ${c.summary}`).join("\n")}`.slice(0, 8000),
    });
    await db.from("support_tickets").update({ last_activity_at: now, updated_at: now }).eq("id", job.ticket_id);
  }

  const notes = [job.notes, invoiceNote].filter(Boolean).join("\n") || null;
  await save(db, job.id, {
    status: needsAttention ? "needs_attention" : "done", finished_at: now, invoice_id: invoiceId, notes, error: needsAttention && job.error !== "needs_attention" && job.error !== "check" ? job.error : null,
    stage_note: needsAttention ? "Done — please check" : "Done", messages: [], // the working conversation isn't kept once the report is written
  });
  await notify(db, job, needsAttention ? `AI-${job.number} on ${site.domain} needs checking` : `AI-${job.number} on ${site.domain} is done`, `${job.report_summary ?? ""}${invoiceId ? " — draft invoice ready to review." : ""}`);
  return needsAttention ? "needs attention" : "done";
}
