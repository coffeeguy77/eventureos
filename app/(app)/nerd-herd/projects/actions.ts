"use server";

import { revalidatePath } from "next/cache";
import { canManage, requireOrg } from "@/lib/context";
import { actorName, logActivity } from "@/lib/activity";
import { todayISO } from "@/lib/format";
import { readNerd } from "@/lib/nerdherd/core";
import { billLines, clientMargin, entryKey, parseImport, readItems, readLinks, readPhases, toEntry, toProject, type ProjectStatus } from "@/lib/nerdherd/projects";

/** Nerd Herd → Projects (office): create a project, keep its record and time log, and bill the time as it goes. */
type R<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const UUID = /^[0-9a-f-]{36}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const NEEDS = "Run update 0118 (Projects) in Supabase first.";
const missing = (m: string) => /nh_project|project_id|does not exist|schema cache/.test(m);
const err = (m: string) => new Error(missing(m) ? NEEDS : m);

async function manager() {
  const ctx = await requireOrg();
  if (!canManage(ctx.role)) throw new Error("Only owners, admins and managers can change projects.");
  return ctx;
}
async function own(supabase: Awaited<ReturnType<typeof requireOrg>>["supabase"], orgId: string, id: string) {
  if (!UUID.test(id)) throw new Error("That project doesn't exist.");
  const { data, error } = await supabase.from("nh_projects").select("*").eq("id", id).eq("organisation_id", orgId).maybeSingle();
  if (error) throw err(error.message);
  if (!data) throw new Error("That project doesn't exist.");
  return toProject(data as Record<string, unknown>);
}
const refresh = (id?: string) => { revalidatePath("/nerd-herd/projects"); if (id) revalidatePath(`/nerd-herd/projects/${id}`); };

export async function createProject(i: { customerId: string; name: string }): Promise<R<string>> {
  try {
    const { supabase, org, user, profile } = await manager();
    if (!UUID.test(i.customerId)) throw new Error("Choose the client.");
    const name = String(i.name ?? "").trim().slice(0, 200);
    if (!name) throw new Error("Give the project a name.");
    const { data: c } = await supabase.from("customers").select("id, name").eq("id", i.customerId).eq("organisation_id", org.id).maybeSingle();
    if (!c) throw new Error("That client doesn't exist.");
    const { data, error } = await supabase.from("nh_projects").insert({ organisation_id: org.id, customer_id: c.id, name, started: todayISO(org.timezone), created_by: user.id }).select("id").single();
    if (error) throw err(error.message);
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "project.created", entityType: "customer", entityId: c.id, customerId: c.id, summary: `${actorName(profile)} started project “${name}” for ${c.name}` });
    refresh();
    return { ok: true, data: data.id as string };
  } catch (e) { return fail(e); }
}

export interface ProjectPatch {
  name: string; status: ProjectStatus; status_note: string; summary: string; delivered_by: string; started: string; rate: string;
  phases: unknown; links: unknown; open_items: unknown; notes: string; staff_notes: string; portal: boolean;
}
export async function saveProject(id: string, p: ProjectPatch): Promise<R> {
  try {
    const { supabase, org } = await manager();
    await own(supabase, org.id, id);
    const name = String(p.name ?? "").trim().slice(0, 200);
    if (!name) throw new Error("Give the project a name.");
    const rate = String(p.rate ?? "").trim() === "" ? null : Number(p.rate);
    if (rate !== null && !(rate >= 0 && rate <= 2000)) throw new Error("The hourly rate should be a number of dollars (ex GST).");
    const t = (v: string, n: number) => String(v ?? "").trim().slice(0, n) || null;
    const { error } = await supabase.from("nh_projects").update({
      name, status: (["active", "on_hold", "complete", "archived"].includes(p.status) ? p.status : "active"), status_note: t(p.status_note, 500), summary: t(p.summary, 4000),
      delivered_by: t(p.delivered_by, 120), started: ISO.test(p.started) ? p.started : null, rate,
      phases: readPhases(p.phases), links: readLinks(p.links), open_items: readItems(p.open_items), notes: t(p.notes, 20000), staff_notes: t(p.staff_notes, 20000), portal: !!p.portal,
      updated_at: new Date().toISOString(),
    }).eq("id", id).eq("organisation_id", org.id);
    if (error) throw err(error.message);
    refresh(id);
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

export async function addTime(id: string, i: { date: string; start: string; end: string; hours: string; work: string; kind: string; billable: boolean; who?: string }): Promise<R> {
  try {
    const { supabase, org, user, profile } = await manager();
    await own(supabase, org.id, id);
    if (!ISO.test(i.date)) throw new Error("Choose the date.");
    const hours = Number(i.hours);
    if (!(hours > 0 && hours <= 24)) throw new Error("Hours should be more than 0 and no more than 24.");
    const work = String(i.work ?? "").trim().slice(0, 2000);
    if (!work) throw new Error("Say what was done.");
    const tm = (v: string) => (/^([01]?\d|2[0-3]):[0-5]\d$/.test(v ?? "") ? v.padStart(5, "0") : null);
    // A meeting is your own time (billed as logged), with who was there and what was discussed
    const meeting = i.kind === "meeting";
    const who = String(i.who ?? "").trim().slice(0, 300);
    if (meeting && !who) throw new Error("Say who was in the meeting.");
    const kind = i.kind === "ai" ? "ai" : "staff";
    const { error } = await supabase.from("nh_project_time").insert({ organisation_id: org.id, project_id: id, work_date: i.date, start_time: tm(i.start), end_time: tm(i.end), hours: Math.round(hours * 100) / 100, work, kind,
      source: meeting ? "meeting" : kind === "ai" ? "AI session" : "timesheet", by_name: meeting ? who : kind === "staff" ? actorName(profile) : null, billable: i.billable !== false, created_by: user.id });
    if (error) throw err(error.message);
    await supabase.from("nh_projects").update({ updated_at: new Date().toISOString() }).eq("id", id);
    refresh(id);
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

export async function deleteTime(id: string, entryId: string): Promise<R> {
  try {
    const { supabase, org } = await manager();
    await own(supabase, org.id, id);
    if (!UUID.test(entryId)) throw new Error("Refresh and try again.");
    const { data: t } = await supabase.from("nh_project_time").select("billed_invoice_id").eq("id", entryId).eq("project_id", id).maybeSingle();
    if (t?.billed_invoice_id) throw new Error("That time is on an invoice — void or delete the invoice first.");
    const { error } = await supabase.from("nh_project_time").delete().eq("id", entryId).eq("project_id", id);
    if (error) throw err(error.message);
    refresh(id);
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

/** Paste a project record's JSON: fills empty details and adds time entries that aren't on the project yet. */
export async function importRecord(id: string, text: string, replace: boolean): Promise<R<{ added: number; skipped: number }>> {
  try {
    const { supabase, org, user } = await manager();
    const p = await own(supabase, org.id, id);
    const r = parseImport(text);
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const take = <T,>(cur: T, next: T | undefined, empty: boolean) => (next !== undefined && next !== null && (replace || empty) ? next : cur);
    patch.name = take(p.name, r.project.name, !p.name);
    patch.summary = take(p.summary, r.project.summary, !p.summary);
    patch.delivered_by = take(p.delivered_by, r.project.delivered_by, !p.delivered_by);
    patch.started = take(p.started, r.project.started, !p.started);
    patch.status_note = take(p.status_note, r.project.status_note, !p.status_note);
    if (r.phases.length && (replace || !p.phases.length)) patch.phases = r.phases;
    if (r.links.length && (replace || !p.links.length)) patch.links = r.links;
    if (r.open_items.length && (replace || !p.open_items.length)) patch.open_items = r.open_items;
    if (r.notes && (replace || !p.notes)) patch.notes = r.notes;
    const { error } = await supabase.from("nh_projects").update(patch).eq("id", id);
    if (error) throw err(error.message);
    const { data: have } = await supabase.from("nh_project_time").select("work_date, start_time, hours").eq("project_id", id);
    const seen = new Set(((have ?? []) as { work_date: string; start_time: string | null; hours: number }[]).map(entryKey));
    const fresh = r.time.filter((t) => !seen.has(entryKey(t)));
    if (fresh.length) {
      const { error: tErr } = await supabase.from("nh_project_time").insert(fresh.map((t) => ({ ...t, organisation_id: org.id, project_id: id, created_by: user.id })));
      if (tErr) throw err(tErr.message);
    }
    refresh(id);
    return { ok: true, data: { added: fresh.length, skipped: r.time.length - fresh.length } };
  } catch (e) { return fail(e); }
}

/** Raise a draft invoice for all unbilled billable time (build time, the margin line, other time). */
export async function billProject(id: string): Promise<R<string>> {
  try {
    const { supabase, org, user, profile } = await manager();
    const p = await own(supabase, org.id, id);
    const { data: rows, error } = await supabase.from("nh_project_time").select("*").eq("project_id", id).eq("billable", true).is("billed_invoice_id", null);
    if (error) throw err(error.message);
    const list = ((rows ?? []) as Record<string, unknown>[]).map(toEntry);
    if (!list.length) throw new Error("There's no unbilled time on this project.");
    const s = readNerd(org.settings);
    const rate = p.rate ?? s.hourlyRate;
    const b = billLines(list, p, clientMargin(org.settings, p.customer_id), rate, s.accountCode);
    const total = Math.round(b.lines.reduce((a, l) => a + l.line_amount, 0) * 100) / 100;
    const subtotal = Math.round((total / 1.1) * 100) / 100;
    const today = todayISO(org.timezone);
    const terms = Number((org.settings as { default_payment_terms_days?: unknown }).default_payment_terms_days) || 14;
    const due = new Date(Date.parse(`${today}T00:00:00Z`) + terms * 86_400_000).toISOString().slice(0, 10);
    const { data: inv, error: iErr } = await supabase.from("invoices").insert({
      organisation_id: org.id, customer_id: p.customer_id, project_id: p.id, kind: "full", status: "draft", issue_date: today, due_date: due,
      subtotal, tax_total: Math.round((total - subtotal) * 100) / 100, total, currency: org.currency, reference: p.name.slice(0, 100),
      line_items: b.lines, created_by: user.id,
    }).select("id, number").single();
    if (iErr) throw err(`Couldn't raise the invoice: ${iErr.message}`);
    await supabase.from("nh_project_time").update({ billed_invoice_id: inv.id }).in("id", list.map((e) => e.id));
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "invoice.created", entityType: "invoice", entityId: inv.id, customerId: p.customer_id, summary: `${actorName(profile)} billed ${b.hours} hrs on project “${p.name}” (draft ${inv.number})` });
    refresh(id);
    revalidatePath("/invoices");
    return { ok: true, data: inv.id as string };
  } catch (e) { return fail(e); }
}

/** The client's margin: AI session time on all their projects (and invoices) is multiplied up by this much. */
export async function setClientMargin(customerId: string, percent: string): Promise<R> {
  try {
    const { supabase, org } = await manager();
    if (!UUID.test(customerId)) throw new Error("That client doesn't exist.");
    const n = String(percent ?? "").trim() === "" ? 0 : Number(percent);
    if (!(n >= 0 && n <= 500)) throw new Error("The margin should be 0 to 500%.");
    const { data: c } = await supabase.from("customers").select("id").eq("id", customerId).eq("organisation_id", org.id).maybeSingle();
    if (!c) throw new Error("That client doesn't exist.");
    const { data: o } = await supabase.from("organisations").select("settings").eq("id", org.id).single();
    const settings = { ...((o?.settings ?? {}) as Record<string, unknown>) };
    const map = { ...((settings.nh_client_margins ?? {}) as Record<string, number>) };
    if (n > 0) map[customerId] = Math.round(n * 100) / 100; else delete map[customerId];
    settings.nh_client_margins = map;
    const { error } = await supabase.from("organisations").update({ settings }).eq("id", org.id);
    if (error) throw new Error(error.message);
    revalidatePath("/nerd-herd/projects", "layout");
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

/** Change a time entry: what was done, the recorded hours, and (optionally) the billed hours set by hand. */
export async function updateTime(id: string, entryId: string, i: { work: string; hours: string; billed: string; billable: boolean; who?: string }): Promise<R> {
  try {
    const { supabase, org } = await manager();
    await own(supabase, org.id, id);
    if (!UUID.test(entryId)) throw new Error("Refresh and try again.");
    const { data: t } = await supabase.from("nh_project_time").select("billed_invoice_id, source").eq("id", entryId).eq("project_id", id).maybeSingle();
    if (!t) throw new Error("That entry doesn't exist.");
    let draft: string | null = null;
    if (t.billed_invoice_id) {
      const { data: inv } = await supabase.from("invoices").select("status").eq("id", t.billed_invoice_id).maybeSingle();
      if (inv?.status !== "draft") throw new Error("That time is on an invoice that's been sent — change the invoice instead.");
      draft = t.billed_invoice_id as string;
    }
    const hours = Number(i.hours);
    if (!(hours > 0 && hours <= 24)) throw new Error("Recorded hours should be more than 0 and no more than 24.");
    const work = String(i.work ?? "").trim().slice(0, 2000);
    if (!work) throw new Error("Say what was done.");
    const billed = String(i.billed ?? "").trim() === "" ? null : Number(i.billed);
    if (billed !== null && !(billed >= 0 && billed <= 500)) throw new Error("Billed hours should be 0 to 500 — or leave it blank to work it out.");
    const patch: Record<string, unknown> = { work, hours: Math.round(hours * 100) / 100, billed_hours: billed === null ? null : Math.round(billed * 100) / 100, billable: i.billable !== false };
    if (t.source === "meeting" && i.who?.trim()) patch.by_name = i.who.trim().slice(0, 300);
    const { error } = await supabase.from("nh_project_time").update(patch).eq("id", entryId).eq("project_id", id);
    if (error) throw new Error(/billed_hours/.test(error.message) ? "Run update 0119 (billed hours) in Supabase first." : error.message);
    if (draft) await rebuildDraft(supabase, org, id, draft);
    refresh(id);
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

/** A draft project invoice follows its time entries: rebuild its lines when one changes. */
async function rebuildDraft(supabase: Awaited<ReturnType<typeof requireOrg>>["supabase"], org: Awaited<ReturnType<typeof requireOrg>>["org"], projectId: string, invoiceId: string) {
  const p = await own(supabase, org.id, projectId);
  const { data: rows } = await supabase.from("nh_project_time").select("*").eq("billed_invoice_id", invoiceId);
  const s = readNerd(org.settings);
  const b = billLines(((rows ?? []) as Record<string, unknown>[]).map(toEntry), p, clientMargin(org.settings, p.customer_id), p.rate ?? s.hourlyRate, s.accountCode);
  if (!b.lines.length) return;
  const total = Math.round(b.lines.reduce((a, l) => a + l.line_amount, 0) * 100) / 100;
  const subtotal = Math.round((total / 1.1) * 100) / 100;
  await supabase.from("invoices").update({ line_items: b.lines, total, subtotal, tax_total: Math.round((total - subtotal) * 100) / 100 }).eq("id", invoiceId).eq("status", "draft");
  revalidatePath(`/invoices/${invoiceId}`);
}
