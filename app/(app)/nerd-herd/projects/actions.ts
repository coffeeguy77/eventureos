"use server";

import { revalidatePath } from "next/cache";
import { canManage, requireOrg } from "@/lib/context";
import { actorName, logActivity } from "@/lib/activity";
import { todayISO } from "@/lib/format";
import { missing0120, NEEDS_0120 } from "@/lib/nerdherd/margins";
import { billToDraft, rebuildDraft as rebuildDraftCore } from "@/lib/nerdherd/project-billing";
import { RESERVED_SHORT, SHORT, entryKey, splitParts, parseImport, readItems, readLinks, readPhases, toEntry, toProject, type ProjectStatus } from "@/lib/nerdherd/projects";

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
  short_slug?: string; docs_url?: string; docs?: unknown;
}
const NEEDS_0122 = "Run update 0122 (short links, documents and the dev chat key) in Supabase first.";
export async function saveProject(id: string, p: ProjectPatch): Promise<R> {
  try {
    const { supabase, org } = await manager();
    await own(supabase, org.id, id);
    const name = String(p.name ?? "").trim().slice(0, 200);
    if (!name) throw new Error("Give the project a name.");
    const rate = String(p.rate ?? "").trim() === "" ? null : Number(p.rate);
    if (rate !== null && !(rate >= 0 && rate <= 2000)) throw new Error("The hourly rate should be a number of dollars (ex GST).");
    const t = (v: string, n: number) => String(v ?? "").trim().slice(0, n) || null;
    const short = String(p.short_slug ?? "").trim().toLowerCase().replace(/^\/+|\/+$/g, "");
    if (short && (!SHORT.test(short) || RESERVED_SHORT.has(short))) throw new Error(RESERVED_SHORT.has(short) ? `“${short}” is already a page on your site — pick another short link.` : "The short link can only use lower-case letters, numbers and dashes (2 to 40 long).");
    const docsUrl = String(p.docs_url ?? "").trim();
    if (docsUrl && !/^https:\/\/\S+$/.test(docsUrl)) throw new Error("The documents folder should be a full link starting with https://");
    const base = {
      name, status: (["active", "on_hold", "complete", "archived"].includes(p.status) ? p.status : "active"), status_note: t(p.status_note, 500), summary: t(p.summary, 4000),
      delivered_by: t(p.delivered_by, 120), started: ISO.test(p.started) ? p.started : null, rate,
      phases: readPhases(p.phases), links: readLinks(p.links), open_items: readItems(p.open_items), notes: t(p.notes, 20000), staff_notes: t(p.staff_notes, 20000), portal: !!p.portal,
      updated_at: new Date().toISOString(),
    };
    const extra = { short_slug: short || null, docs_url: docsUrl.slice(0, 500) || null, docs: readLinks(p.docs) };
    let { error } = await supabase.from("nh_projects").update({ ...base, ...extra }).eq("id", id).eq("organisation_id", org.id);
    if (error && /short_slug|docs/.test(error.message) && !/duplicate|unique/.test(error.message)) {
      if (extra.short_slug || extra.docs_url || extra.docs.length) throw new Error(NEEDS_0122);
      ({ error } = await supabase.from("nh_projects").update(base).eq("id", id).eq("organisation_id", org.id));
    }
    if (error && /duplicate|unique/.test(error.message)) throw new Error(`Another project already uses the short link “${short}”.`);
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

/** Put all unbilled billable time on the project's draft invoice — starting one if there isn't one. */
export async function billProject(id: string): Promise<R<string>> {
  try {
    const { supabase, org, user, profile } = await manager();
    const p = await own(supabase, org.id, id);
    const r = await billToDraft(supabase, org, id, user.id).catch((e) => { throw err(e instanceof Error ? e.message : String(e)); });
    if (!r) throw new Error("There's no unbilled time on this project.");
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: r.created ? "invoice.created" : "invoice.updated", entityType: "invoice", entityId: r.id, customerId: p.customer_id,
      summary: r.created ? `${actorName(profile)} billed ${r.hours} hrs on project “${p.name}” (draft ${r.number})` : `${actorName(profile)} added ${r.entries} time ${r.entries === 1 ? "entry" : "entries"} on “${p.name}” to draft ${r.number}` });
    refresh(id);
    revalidatePath("/invoices");
    return { ok: true, data: r.id };
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
    const del = await supabase.from("nh_margins").delete().eq("organisation_id", org.id).eq("customer_id", customerId);
    if (del.error) throw new Error(missing0120(del.error.message) ? NEEDS_0120 : del.error.message);
    if (n > 0) {
      const { error } = await supabase.from("nh_margins").insert({ organisation_id: org.id, customer_id: customerId, margin_percent: Math.round(n * 100) / 100 });
      if (error) throw new Error(error.message);
    }
    // Draft project invoices without their own margin follow the client's
    const { data: drafts } = await supabase.from("invoices").select("id, project_id").eq("organisation_id", org.id).eq("customer_id", customerId).eq("status", "draft").not("project_id", "is", null);
    for (const d of (drafts ?? []) as { id: string; project_id: string }[]) await rebuildDraft(supabase, org, d.project_id, d.id);
    revalidatePath("/nerd-herd/projects", "layout");
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

/** Override the margin on one draft project invoice (blank = use the client's margin). Only the office sees it. */
export async function setInvoiceMargin(id: string, invoiceId: string, percent: string): Promise<R> {
  try {
    const { supabase, org } = await manager();
    await own(supabase, org.id, id);
    if (!UUID.test(invoiceId)) throw new Error("Refresh and try again.");
    const { data: inv } = await supabase.from("invoices").select("id, status").eq("id", invoiceId).eq("project_id", id).eq("organisation_id", org.id).maybeSingle();
    if (!inv) throw new Error("That invoice isn't on this project.");
    if (inv.status !== "draft") throw new Error("That invoice has been sent — its margin can't change now.");
    const blank = String(percent ?? "").trim() === "";
    const n = blank ? 0 : Number(percent);
    if (!blank && !(n >= 0 && n <= 500)) throw new Error("The margin should be 0 to 500% — or leave it blank to use the client's.");
    const del = await supabase.from("nh_margins").delete().eq("organisation_id", org.id).eq("invoice_id", invoiceId);
    if (del.error) throw new Error(missing0120(del.error.message) ? NEEDS_0120 : del.error.message);
    if (!blank) {
      const { error } = await supabase.from("nh_margins").insert({ organisation_id: org.id, invoice_id: invoiceId, margin_percent: Math.round(n * 100) / 100 });
      if (error) throw new Error(error.message);
    }
    await rebuildDraft(supabase, org, id, invoiceId);
    refresh(id);
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

/* ------------------------------------------------------------------ portal people */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export type PortalRole = "accounts" | "team" | "removed";
const role = (v: unknown): PortalRole => (v === "team" ? "team" : v === "removed" ? "removed" : "accounts");

/** Add someone at the client who can sign in to the portal: Accounts see hours and money, Team see the work only. */
export async function addPortalPerson(id: string, i: { first: string; last: string; email: string; role: string }): Promise<R> {
  try {
    const { supabase, org, user, profile } = await manager();
    const p = await own(supabase, org.id, id);
    const first = String(i.first ?? "").trim().slice(0, 100);
    const email = String(i.email ?? "").trim().toLowerCase();
    if (!first) throw new Error("Enter their first name.");
    if (!EMAIL.test(email) || email.length > 254) throw new Error("Enter a valid email address.");
    const r = role(i.role) === "accounts" ? "accounts" : "team";
    const { data: had } = await supabase.from("contacts").select("id").eq("organisation_id", org.id).eq("customer_id", p.customer_id).ilike("email", email).maybeSingle();
    if (had) {
      const { error } = await supabase.from("contacts").update({ portal_role: r }).eq("id", had.id);
      if (error) throw new Error(missing0120(error.message) ? NEEDS_0120 : error.message);
    } else {
      const { error } = await supabase.from("contacts").insert({ organisation_id: org.id, customer_id: p.customer_id, first_name: first,
        last_name: String(i.last ?? "").trim().slice(0, 100) || null, email, is_primary: false, portal_role: r, created_by: user.id });
      if (error) throw new Error(missing0120(error.message) ? NEEDS_0120 : `Couldn't add them: ${error.message}`);
    }
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "contact.created", entityType: "customer", entityId: p.customer_id, customerId: p.customer_id,
      summary: `${actorName(profile)} gave ${first} (${email}) ${r === "accounts" ? "Accounts" : "Team"} access to the portal` });
    refresh(id);
    revalidatePath(`/clients/${p.customer_id}`);
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

/** Change what a client contact sees in the portal. */
export async function setPortalRole(id: string, contactId: string, r: string): Promise<R> {
  try {
    const { supabase, org } = await manager();
    const p = await own(supabase, org.id, id);
    if (!UUID.test(contactId)) throw new Error("Refresh and try again.");
    const next = role(r);
    const { error, data } = await supabase.from("contacts").update({ portal_role: next, ...(next === "removed" ? { portal_user_id: null } : {}) }).eq("id", contactId).eq("organisation_id", org.id).eq("customer_id", p.customer_id).select("id");
    if (error) throw new Error(missing0120(error.message) ? NEEDS_0120 : /check constraint/.test(error.message) ? NEEDS_0122 : error.message);
    if (!data?.length) throw new Error("That person isn't a contact for this client.");
    refresh(id);
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

/** Email one client contact a link to sign in and open this project. Only when you press the button. */
export async function sendProjectInvite(id: string, contactId: string): Promise<R> {
  try {
    const { supabase, org, user, profile } = await manager();
    const p = await own(supabase, org.id, id);
    if (!p.portal) throw new Error("This project is hidden from the client's portal — show it first.");
    const { data: c } = await supabase.from("contacts").select("first_name, email").eq("id", contactId).eq("organisation_id", org.id).eq("customer_id", p.customer_id).maybeSingle();
    if (!c?.email) throw new Error("They need an email address first.");
    const { data: o } = await supabase.from("organisations").select("name, slug, brand_colour, logo_url, contact_email").eq("id", org.id).single();
    const { sendProjectPortalInvite } = await import("@/lib/email/portal-invite");
    const problem = await sendProjectPortalInvite({ org: o as { name: string; slug: string }, project: { id: p.id, name: p.name }, to: c.email as string, firstName: c.first_name as string,
      invitedBy: profile.full_name ? `${profile.full_name} from ${o?.name ?? org.name}` : (o?.name ?? org.name), replyTo: profile.email });
    if (problem) throw new Error(`The invite wasn't sent: ${problem}.`);
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "portal.invite", entityType: "customer", entityId: p.customer_id, customerId: p.customer_id,
      summary: `${actorName(profile)} emailed ${c.first_name} a portal invite for “${p.name}”` });
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

/** Change a time entry: what was done, the recorded hours, and (optionally) the billed hours set by hand. */
export async function updateTime(id: string, entryId: string, i: { work: string; hours: string; billed: string; billable: boolean; who?: string; date?: string; dateTo?: string }): Promise<R> {
  try {
    const { supabase, org } = await manager();
    await own(supabase, org.id, id);
    if (!UUID.test(entryId)) throw new Error("Refresh and try again.");
    const { data: t0 } = await supabase.from("nh_project_time").select("*").eq("id", entryId).eq("project_id", id).maybeSingle();
    if (!t0) throw new Error("That entry doesn't exist.");
    const t = { ...(t0 as { billed_invoice_id: string | null; source: string | null }), has_range: "work_date_to" in (t0 as object) };
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
    if (i.date !== undefined) {
      if (!ISO.test(i.date)) throw new Error("Pick the day the work was done.");
      patch.work_date = i.date;
      const to = String(i.dateTo ?? "").trim();
      if (to && !ISO.test(to)) throw new Error("The 'to' date isn't a date.");
      if (to && to < i.date) throw new Error("The 'to' date can't be before the first day.");
      if (to && to > i.date) patch.work_date_to = to; else if (t.has_range) patch.work_date_to = null;
    }
    const { error } = await supabase.from("nh_project_time").update(patch).eq("id", entryId).eq("project_id", id);
    if (error) throw new Error(/billed_hours/.test(error.message) ? "Run update 0119 (billed hours) in Supabase first." : /work_date_to/.test(error.message) ? "Run update 0121 (date ranges) in Supabase first." : error.message);
    if (draft) await rebuildDraft(supabase, org, id, draft);
    refresh(id);
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

/** Split one task over several days (each part is its own line). Its billed hours are shared as you set them. */
export async function splitTime(id: string, entryId: string, parts: { date: string; billed: string }[]): Promise<R> {
  try {
    const { supabase, org, user } = await manager();
    await own(supabase, org.id, id);
    if (!UUID.test(entryId)) throw new Error("Refresh and try again.");
    const { data: row } = await supabase.from("nh_project_time").select("*").eq("id", entryId).eq("project_id", id).maybeSingle();
    if (!row) throw new Error("That entry doesn't exist.");
    const e = toEntry(row as Record<string, unknown>);
    if (e.billed_invoice_id) {
      const { data: inv } = await supabase.from("invoices").select("status").eq("id", e.billed_invoice_id).maybeSingle();
      if (inv?.status !== "draft") throw new Error("That time is on an invoice that's been sent — it can't be split now.");
    }
    const list = splitParts(e, parts.slice(0, 14).map((p) => ({ date: String(p.date ?? ""), billed: Number(p.billed) })));
    const [first, ...rest] = list;
    const base = row as Record<string, unknown>;
    const { error } = await supabase.from("nh_project_time").update({ work_date: first.date, hours: first.hours, billed_hours: first.billed, ...("work_date_to" in base ? { work_date_to: null } : {}) }).eq("id", entryId);
    if (error) throw new Error(error.message);
    const copy = (p: (typeof list)[number]) => {
      const { id: _i, created_at: _c, updated_at: _u, work_date_to: _t, ...r } = base;
      return { ...r, work_date: p.date, hours: p.hours, billed_hours: p.billed, created_by: user.id };
    };
    const { error: iErr } = await supabase.from("nh_project_time").insert(rest.map(copy));
    if (iErr) throw new Error(`Couldn't add the other days: ${iErr.message}`);
    if (e.billed_invoice_id) await rebuildDraft(supabase, org, id, e.billed_invoice_id);
    refresh(id);
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

/** A draft project invoice follows its time entries: rebuild its lines when one changes. */
async function rebuildDraft(supabase: Awaited<ReturnType<typeof requireOrg>>["supabase"], org: Awaited<ReturnType<typeof requireOrg>>["org"], projectId: string, invoiceId: string) {
  await rebuildDraftCore(supabase, org, projectId, invoiceId);
  revalidatePath(`/invoices/${invoiceId}`);
}

/* ------------------------------------------------------------------ dev chat key */

/** A new key for the dev chat (Claude Code, Cursor) to log work on this project. Shown once; only its hash is kept. */
export async function createProjectKey(id: string): Promise<R<string>> {
  try {
    const { supabase, org, user, profile } = await manager();
    const p = await own(supabase, org.id, id);
    const { randomBytes, createHash } = await import("node:crypto");
    const token = `nhp_${randomBytes(32).toString("base64url")}`;
    const hash = createHash("sha256").update(token).digest("hex");
    await supabase.from("nh_project_keys").delete().eq("project_id", id);
    const { error } = await supabase.from("nh_project_keys").insert({ project_id: id, organisation_id: org.id, token_hash: hash });
    if (error) throw new Error(/nh_project_keys|does not exist|schema cache/.test(error.message) ? NEEDS_0122 : error.message);
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "project.key", entityType: "customer", entityId: p.customer_id, customerId: p.customer_id, summary: `${actorName(profile)} made a new dev chat key for “${p.name}”` });
    refresh(id);
    return { ok: true, data: token };
  } catch (e) { return fail(e); }
}

/** Stop the dev chat key working. */
export async function revokeProjectKey(id: string): Promise<R> {
  try {
    const { supabase, org } = await manager();
    await own(supabase, org.id, id);
    const { error } = await supabase.from("nh_project_keys").delete().eq("project_id", id).eq("organisation_id", org.id);
    if (error) throw new Error(error.message);
    refresh(id);
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}
