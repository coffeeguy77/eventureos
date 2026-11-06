"use server";

import { revalidatePath } from "next/cache";
import { canManage, requireOrg } from "@/lib/context";
import { actorName, logActivity } from "@/lib/activity";
import { todayISO } from "@/lib/format";
import { linesTotal } from "@/lib/recurring/core";
import {
  TICKET_STATUS, cleanDomain, fmtMinutes, isKind, isPriority, isTicketStatus, looksLikeDomain, readChecklist, readNerd, timeLine,
  type ChecklistItem, type Priority, type TicketKind, type TicketStatus,
} from "@/lib/nerdherd/core";

/** Nerd Herd: tickets, their updates and checklists, websites, maintenance plans and billing time. */
type R<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const UUID = /^[0-9a-f-]{36}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const t = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) || null : null);

async function desk() {
  const ctx = await requireOrg();
  if (ctx.role === "staff" || ctx.role === "customer") throw new Error("Only the office team can work on tickets.");
  return ctx;
}
const refresh = (id?: string) => {
  revalidatePath("/nerd-herd", "layout");
  if (id) revalidatePath(`/nerd-herd/tickets/${id}`);
};

async function loadTicket(id: string) {
  if (!UUID.test(id)) throw new Error("That ticket doesn't exist.");
  const ctx = await desk();
  const { data, error } = await ctx.supabase.from("support_tickets").select("*").eq("id", id).eq("organisation_id", ctx.org.id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("That ticket no longer exists.");
  return { ctx, ticket: data as Record<string, unknown> & { id: string; number: number; subject: string; status: TicketStatus; customer_id: string | null; assigned_to: string | null; checklist: unknown } };
}

// ------------------------------------------------------------------------------------------------
// Tickets
// ------------------------------------------------------------------------------------------------

export interface TicketInput {
  customer_id?: string | null; website_id?: string | null; subject: string; description?: string | null;
  kind?: TicketKind; priority?: Priority; assigned_to?: string | null; due_date?: string | null; status?: TicketStatus;
}

export async function createTicket(i: TicketInput): Promise<R<string>> {
  try {
    const { supabase, org, user, profile } = await desk();
    const subject = t(i.subject, 300);
    if (!subject) throw new Error("Give the ticket a subject, e.g. “Contact form not sending”.");
    const kind = isKind(i.kind) ? i.kind : "support";
    // nobody assigned: it's the maker's — unless they never get ticket emails (e.g. accounts), then the default tech's
    const nerd = readNerd(org.settings);
    let assignee = i.assigned_to && UUID.test(i.assigned_to) ? i.assigned_to : null;
    if (!assignee && nerd.quietUsers.includes(user.id)) assignee = nerd.defaultAssignee;
    const { data, error } = await supabase.from("support_tickets").insert({
      // details typed by the team are an internal note (below), never on the ticket the client can see
      organisation_id: org.id, subject, kind,
      priority: isPriority(i.priority) ? i.priority : "normal",
      status: isTicketStatus(i.status) ? i.status : "new", source: "manual",
      customer_id: i.customer_id && UUID.test(i.customer_id) ? i.customer_id : null,
      website_id: i.website_id && UUID.test(i.website_id) ? i.website_id : null,
      assigned_to: assignee,
      due_date: i.due_date && DATE.test(i.due_date) ? i.due_date : null,
      checklist: kind === "maintenance" ? await defaultChecklist(supabase) : [],
      created_by: user.id,
    }).select("id, number, customer_id").single();
    if (error) throw new Error(`Couldn't create the ticket: ${error.message}`);
    if (t(i.description, 20000)) {
      await supabase.from("support_ticket_updates").insert({ organisation_id: org.id, ticket_id: data.id, kind: "note", body: t(i.description, 20000), author_id: user.id, author_name: actorName(profile) });
    }
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "ticket.created", entityType: "support_ticket", entityId: data.id, customerId: data.customer_id, summary: `${actorName(profile)} opened ticket #${data.number}: ${subject}` });
    if (assignee && assignee !== user.id) await tellAssignee(org.id, data.id as string, assignee, user.id, `${actorName(profile)} gave you a new ticket`, [t(i.description, 600) ?? ""]);
    refresh();
    return { ok: true, data: data.id as string };
  } catch (e) { return fail(e); }
}

async function defaultChecklist(supabase: Awaited<ReturnType<typeof requireOrg>>["supabase"]): Promise<ChecklistItem[]> {
  const { data } = await supabase.rpc("nh_default_checklist");
  return readChecklist(data);
}

export interface TicketPatch {
  status?: TicketStatus; priority?: Priority; kind?: TicketKind; assigned_to?: string | null; customer_id?: string | null;
  website_id?: string | null; due_date?: string | null; subject?: string;
}

export async function updateTicket(id: string, p: TicketPatch): Promise<R> {
  try {
    const { ctx, ticket } = await loadTicket(id);
    const { supabase, org, user, profile } = ctx;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), last_activity_at: new Date().toISOString() };
    const said: string[] = [];
    if (p.status !== undefined) {
      if (!isTicketStatus(p.status)) throw new Error("Choose a status.");
      if (p.status !== ticket.status) {
        patch.status = p.status;
        patch.resolved_at = p.status === "resolved" || p.status === "closed" ? new Date().toISOString() : null;
        said.push(`status ${TICKET_STATUS[ticket.status].label} → ${TICKET_STATUS[p.status].label}`);
      }
    }
    if (p.priority !== undefined) { if (!isPriority(p.priority)) throw new Error("Choose a priority."); patch.priority = p.priority; }
    if (p.kind !== undefined) { if (!isKind(p.kind)) throw new Error("Choose a type."); patch.kind = p.kind; }
    if (p.assigned_to !== undefined) patch.assigned_to = p.assigned_to && UUID.test(p.assigned_to) ? p.assigned_to : null;
    const newAssignee = p.assigned_to !== undefined && patch.assigned_to && patch.assigned_to !== ticket.assigned_to ? patch.assigned_to as string : null;
    if (p.customer_id !== undefined) patch.customer_id = p.customer_id && UUID.test(p.customer_id) ? p.customer_id : null;
    if (p.website_id !== undefined) patch.website_id = p.website_id && UUID.test(p.website_id) ? p.website_id : null;
    if (p.due_date !== undefined) patch.due_date = p.due_date && DATE.test(p.due_date) ? p.due_date : null;
    if (p.subject !== undefined) { const s = t(p.subject, 300); if (!s) throw new Error("The subject can't be empty."); patch.subject = s; }
    const { error } = await supabase.from("support_tickets").update(patch).eq("id", id).eq("organisation_id", org.id);
    if (error) throw new Error(`Couldn't save: ${error.message}`);
    if (said.length) {
      await supabase.from("support_ticket_updates").insert({ organisation_id: org.id, ticket_id: id, kind: "status", body: `${actorName(profile)} changed ${said.join(", ")}`, author_id: user.id, author_name: actorName(profile) });
    }
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "ticket.updated", entityType: "support_ticket", entityId: id, customerId: (patch.customer_id as string | undefined) ?? ticket.customer_id, summary: `${actorName(profile)} updated ticket #${ticket.number}${said.length ? ` (${said.join(", ")})` : ""}` });
    if (newAssignee && newAssignee !== user.id) await tellAssignee(org.id, id, newAssignee, user.id, `${actorName(profile)} assigned this ticket to you`, []);
    refresh(id);
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

/** Email just the person a ticket (or part of one) has been given to — not the person who gave it, not anyone on the quiet list. */
async function tellAssignee(orgId: string, ticketId: string, to: string, actor: string, heading: string, lines: string[]) {
  try {
    const { createServiceClient } = await import("@/lib/integrations/runtime");
    const { alertStaff } = await import("@/lib/nerdherd/mail");
    await alertStaff(createServiceClient(), orgId, ticketId, heading, lines.filter(Boolean), { only: to, except: actor });
  } catch { /* an email never stops the ticket saving */ }
}

export interface UpdateInput { kind: "comment" | "note" | "time"; body?: string | null; minutes?: number | null; billable?: boolean; public?: boolean; status?: TicketStatus | null; tabId?: string | null }

/** Add to a ticket's conversation: a reply the client sees in their portal, an internal note, or time worked. */
export async function addUpdate(id: string, i: UpdateInput): Promise<R> {
  try {
    const { ctx, ticket } = await loadTicket(id);
    const { supabase, org, user, profile } = ctx;
    const body = t(i.body, 20000);
    const minutes = i.minutes == null || i.minutes === 0 ? null : Math.round(Number(i.minutes));
    if (minutes !== null && !(minutes > 0 && minutes <= 6000)) throw new Error("Enter the minutes worked (1 to 6000).");
    if (!body && !minutes) throw new Error(i.kind === "time" ? "Enter the time worked." : "Write something first.");
    const kind = minutes && !body ? "time" : i.kind === "time" ? "time" : i.kind === "comment" ? "comment" : "note";
    const row: Record<string, unknown> = {
      organisation_id: org.id, ticket_id: id, kind, body, minutes, billable: i.billable !== false,
      public: kind === "comment" && i.public !== false, author_id: user.id, author_name: actorName(profile),
    };
    let { error } = await supabase.from("support_ticket_updates").insert(i.tabId && UUID.test(i.tabId) ? { ...row, tab_id: i.tabId } : row);
    if (error && /tab_id/.test(error.message)) ({ error } = await supabase.from("support_ticket_updates").insert(row));
    if (error) throw new Error(`Couldn't save: ${error.message}`);
    const patch: Record<string, unknown> = { last_activity_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    if (i.status && isTicketStatus(i.status) && i.status !== ticket.status) {
      patch.status = i.status;
      patch.resolved_at = i.status === "resolved" || i.status === "closed" ? new Date().toISOString() : null;
    } else if (ticket.status === "new") patch.status = "in_progress";
    await supabase.from("support_tickets").update(patch).eq("id", id);
    await logActivity(supabase, {
      orgId: org.id, actorId: user.id, action: kind === "time" ? "ticket.time" : "ticket.comment", entityType: "support_ticket", entityId: id, customerId: ticket.customer_id,
      summary: kind === "time" ? `${actorName(profile)} logged ${fmtMinutes(minutes ?? 0)} on ticket #${ticket.number}` : `${actorName(profile)} ${kind === "comment" ? "replied on" : "added a note to"} ticket #${ticket.number}`,
    });
    refresh(id);
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

export async function setChecklist(id: string, items: ChecklistItem[]): Promise<R> {
  try {
    const { ctx, ticket } = await loadTicket(id);
    const { supabase, org, profile } = ctx;
    const before = readChecklist(ticket.checklist);
    const now = new Date().toISOString();
    const next = readChecklist(items).slice(0, 40).map((x) => {
      const old = before.find((b) => b.label === x.label);
      return x.done ? { ...x, at: old?.done ? old.at : now, by: old?.done ? old.by : actorName(profile) } : { label: x.label, done: false, at: null, by: null };
    });
    const { error } = await supabase.from("support_tickets").update({ checklist: next, last_activity_at: now, updated_at: now, ...(ticket.status === "open" || ticket.status === "new" ? { status: "in_progress" } : {}) }).eq("id", id).eq("organisation_id", org.id);
    if (error) throw new Error(error.message);
    refresh(id);
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

/** Raise a draft invoice for the ticket's unbilled time (hourly rate from Nerd Herd settings), ready to check and send. */
export async function billTime(id: string): Promise<R<string>> {
  try {
    const { ctx, ticket } = await loadTicket(id);
    const { supabase, org, user, profile } = ctx;
    if (!canManage(ctx.role)) throw new Error("Only owners, admins and managers can raise invoices.");
    if (!ticket.customer_id) throw new Error("Choose the client for this ticket first.");
    const { data: rows, error } = await supabase.from("support_ticket_updates").select("id, minutes, body, created_at").eq("ticket_id", id).eq("billable", true).is("billed_invoice_id", null).gt("minutes", 0);
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as { id: string; minutes: number; body: string | null; created_at: string }[];
    const minutes = list.reduce((a, r) => a + Number(r.minutes), 0);
    if (!minutes) throw new Error("There's no unbilled time on this ticket.");
    const s = readNerd(org.settings);
    const line = timeLine(minutes, s.hourlyRate, `#${ticket.number} ${ticket.subject} (${fmtMinutes(minutes)})`, s.accountCode);
    const total = linesTotal([line]);
    const subtotal = Math.round((total / 1.1) * 100) / 100;
    const today = todayISO(org.timezone);
    const terms = Number((org.settings as { default_payment_terms_days?: unknown }).default_payment_terms_days) || 14;
    const due = new Date(Date.parse(`${today}T00:00:00Z`) + terms * 86_400_000).toISOString().slice(0, 10);
    const { data: inv, error: iErr } = await supabase.from("invoices").insert({
      organisation_id: org.id, customer_id: ticket.customer_id, kind: "full", status: "draft", issue_date: today, due_date: due,
      subtotal, tax_total: Math.round((total - subtotal) * 100) / 100, total, currency: org.currency, reference: `Ticket #${ticket.number}`,
      line_items: [{ ...line, line_amount: total }], created_by: user.id,
    }).select("id, number").single();
    if (iErr) throw new Error(`Couldn't raise the invoice: ${iErr.message}`);
    await supabase.from("support_ticket_updates").update({ billed_invoice_id: inv.id }).in("id", list.map((r) => r.id));
    await supabase.from("support_ticket_updates").insert({ organisation_id: org.id, ticket_id: id, kind: "system", body: `${fmtMinutes(minutes)} billed on draft invoice ${inv.number}`, author_id: user.id, author_name: actorName(profile) });
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "invoice.created", entityType: "invoice", entityId: inv.id, customerId: ticket.customer_id, summary: `${actorName(profile)} billed ${fmtMinutes(minutes)} from ticket #${ticket.number} (draft ${inv.number})` });
    refresh(id);
    revalidatePath("/invoices");
    return { ok: true, data: inv.id as string };
  } catch (e) { return fail(e); }
}

export async function deleteTicket(id: string): Promise<R> {
  try {
    const { ctx, ticket } = await loadTicket(id);
    if (!canManage(ctx.role)) throw new Error("Only owners, admins and managers can delete tickets.");
    const { error } = await ctx.supabase.from("support_tickets").delete().eq("id", id).eq("organisation_id", ctx.org.id);
    if (error) throw new Error(error.message);
    await logActivity(ctx.supabase, { orgId: ctx.org.id, actorId: ctx.user.id, action: "ticket.deleted", entityType: "support_ticket", entityId: id, customerId: ticket.customer_id, summary: `${actorName(ctx.profile)} deleted ticket #${ticket.number}: ${ticket.subject}` });
    refresh();
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

// ------------------------------------------------------------------------------------------------
// Websites
// ------------------------------------------------------------------------------------------------

export interface WebsiteInput { domain: string; name?: string | null; customer_id?: string | null; platform?: string; status?: string; admin_url?: string | null; launched_on?: string | null; notes?: string | null; hosting_account_id?: string | null }

function cleanSite(i: WebsiteInput) {
  const domain = cleanDomain(i.domain ?? "");
  if (!looksLikeDomain(domain)) throw new Error("Enter the website's domain, e.g. example.com.au");
  return {
    domain, name: t(i.name, 120), customer_id: i.customer_id && UUID.test(i.customer_id) ? i.customer_id : null,
    platform: t(i.platform, 30) ?? "wordpress", status: ["live", "building", "paused", "archived"].includes(i.status ?? "") ? i.status : "live",
    admin_url: t(i.admin_url, 500), launched_on: i.launched_on && DATE.test(i.launched_on) ? i.launched_on : null, notes: t(i.notes, 4000),
    hosting_account_id: i.hosting_account_id && UUID.test(i.hosting_account_id) ? i.hosting_account_id : null,
  };
}

export async function saveWebsite(id: string | null, i: WebsiteInput): Promise<R<string>> {
  try {
    const { supabase, org, user, profile } = await desk();
    const v = cleanSite(i);
    const q = id
      ? supabase.from("websites").update({ ...v, updated_at: new Date().toISOString() }).eq("id", id).eq("organisation_id", org.id).select("id").single()
      : supabase.from("websites").insert({ ...v, organisation_id: org.id, created_by: user.id }).select("id").single();
    const { data, error } = await q;
    if (error) throw new Error(/websites_domain/.test(error.message) ? `${v.domain} is already on your list.` : error.message);
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: id ? "website.updated" : "website.created", entityType: "website", entityId: data.id, customerId: v.customer_id, summary: `${actorName(profile)} ${id ? "updated" : "added"} website ${v.domain}` });
    refresh();
    revalidatePath(`/nerd-herd/websites/${data.id}`);
    return { ok: true, data: data.id as string };
  } catch (e) { return fail(e); }
}

// ------------------------------------------------------------------------------------------------
// Plans (recurring invoices) and settings
// ------------------------------------------------------------------------------------------------

export async function setPlanOptions(id: string, o: { creates_ticket?: boolean; work_after_payment?: boolean; website_id?: string | null; category?: string }): Promise<R> {
  try {
    const { supabase, org, role, user, profile } = await desk();
    if (!canManage(role)) throw new Error("Only owners, admins and managers can change plans.");
    if (!UUID.test(id)) throw new Error("That plan doesn't exist.");
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (o.creates_ticket !== undefined) patch.creates_ticket = !!o.creates_ticket;
    if (o.work_after_payment !== undefined) patch.work_after_payment = !!o.work_after_payment;
    if (o.website_id !== undefined) patch.website_id = o.website_id && UUID.test(o.website_id) ? o.website_id : null;
    if (o.category !== undefined) patch.category = t(o.category, 30) ?? "other";
    if (o.creates_ticket) patch.category = "maintenance";
    const { data, error } = await supabase.from("recurring_invoices").update(patch).eq("id", id).eq("organisation_id", org.id).select("name, customer_id").single();
    if (error) throw new Error(error.message);
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "recurring.updated", entityType: "recurring_invoice", entityId: id, customerId: data.customer_id, summary: `${actorName(profile)} changed plan “${data.name}”${o.creates_ticket !== undefined ? (o.creates_ticket ? " — opens a maintenance job each time" : " — no longer opens jobs") : ""}` });
    refresh();
    revalidatePath("/hosting/recurring");
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

export async function saveNerdSettings(i: { hourly_rate: number; account_code: string; email_tickets: boolean; support_email: string; staff_alerts?: boolean; default_assignee?: string | null; quiet_users?: string[] }): Promise<R> {
  try {
    const { supabase, org, role, user, profile } = await desk();
    if (!canManage(role)) throw new Error("Only owners, admins and managers can change settings.");
    const rate = Math.round(Number(i.hourly_rate) * 100) / 100;
    if (!(rate > 0 && rate < 10000)) throw new Error("Enter the hourly rate (ex GST).");
    const email = (i.support_email ?? "").trim().toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error("That support email address doesn't look right.");
    const nerdherd = { hourly_rate: rate, account_code: t(i.account_code, 10) ?? "6664", email_tickets: !!i.email_tickets, support_email: email || null, staff_alerts: i.staff_alerts !== false,
      default_assignee: i.default_assignee && UUID.test(i.default_assignee) ? i.default_assignee : null,
      quiet_users: (Array.isArray(i.quiet_users) ? i.quiet_users : []).filter((x) => UUID.test(x)).slice(0, 50) };
    // managers may change these (checked above); the organisations table only lets owners/admins write, so save with the service role
    const { createServiceClient } = await import("@/lib/integrations/runtime");
    const db = createServiceClient();
    const { data: cur } = await db.from("organisations").select("settings").eq("id", org.id).single();
    const settings = { ...((cur?.settings as Record<string, unknown>) ?? {}), nerdherd };
    const { data: done, error } = await db.from("organisations").update({ settings }).eq("id", org.id).select("id");
    if (error) throw new Error(error.message);
    if (!done?.length) throw new Error("Couldn't save — please try again.");
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "settings.updated", entityType: "organisation", entityId: org.id, summary: `${actorName(profile)} updated Nerd Herd settings` });
    refresh();
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

// ------------------------------------------------------------------------------------------------
// Tabs: split a ticket into issues (Domain, Hosting, Updates…), each with its own person
// ------------------------------------------------------------------------------------------------

async function logLine(ctx: Awaited<ReturnType<typeof desk>>, ticketId: string, body: string, tabId: string | null = null) {
  const row: Record<string, unknown> = { organisation_id: ctx.org.id, ticket_id: ticketId, kind: "status", body, author_id: ctx.user.id, author_name: actorName(ctx.profile) };
  const r = await ctx.supabase.from("support_ticket_updates").insert(tabId ? { ...row, tab_id: tabId } : row);
  if (r.error && tabId) await ctx.supabase.from("support_ticket_updates").insert(row);
  await ctx.supabase.from("support_tickets").update({ last_activity_at: new Date().toISOString() }).eq("id", ticketId);
}
const memberName = async (ctx: Awaited<ReturnType<typeof desk>>, id: string | null) => {
  if (!id) return "nobody";
  const { data } = await ctx.supabase.from("users").select("full_name, email").eq("id", id).maybeSingle();
  return (data?.full_name as string | null) ?? (data?.email as string | null) ?? "someone";
};

export async function addTicketTab(ticketId: string, name: string, assignedTo: string | null): Promise<R<string>> {
  try {
    const { ctx, ticket } = await loadTicket(ticketId);
    const n = t(name, 60);
    if (!n) throw new Error("Name the tab, e.g. Domain.");
    const { count } = await ctx.supabase.from("support_ticket_tabs").select("id", { count: "exact", head: true }).eq("ticket_id", ticketId);
    const { data, error } = await ctx.supabase.from("support_ticket_tabs").insert({ organisation_id: ctx.org.id, ticket_id: ticketId, name: n, assigned_to: assignedTo && UUID.test(assignedTo) ? assignedTo : null, position: count ?? 0 }).select("id").single();
    if (error) throw new Error(/support_ticket_tabs/.test(error.message) ? "Run the latest database update (0090) first." : error.message);
    await logLine(ctx, ticketId, `${actorName(ctx.profile)} added the ${n} tab${assignedTo ? ` for ${await memberName(ctx, assignedTo)}` : ""}`, data.id as string);
    if (!ticket.assigned_to && assignedTo) await ctx.supabase.from("support_tickets").update({ assigned_to: assignedTo }).eq("id", ticketId);
    refresh(ticketId);
    return { ok: true, data: data.id as string };
  } catch (e) { return fail(e); }
}

export async function updateTicketTab(tabId: string, p: { assigned_to?: string | null; done?: boolean; name?: string }): Promise<R> {
  try {
    const ctx = await desk();
    if (!UUID.test(tabId)) throw new Error("Refresh and try again.");
    const { data: tab } = await ctx.supabase.from("support_ticket_tabs").select("id, ticket_id, name, assigned_to, done").eq("id", tabId).eq("organisation_id", ctx.org.id).maybeSingle();
    if (!tab) throw new Error("That tab no longer exists.");
    const patch: Record<string, unknown> = {};
    const said: string[] = [];
    let tabGivenTo: string | null = null;
    if (p.assigned_to !== undefined) { const a = p.assigned_to && UUID.test(p.assigned_to) ? p.assigned_to : null; if (a !== tab.assigned_to) { patch.assigned_to = a; said.push(`gave ${tab.name} to ${await memberName(ctx, a)}`); if (a && a !== ctx.user.id) tabGivenTo = a; } }
    if (p.done !== undefined && p.done !== tab.done) { patch.done = p.done; patch.done_at = p.done ? new Date().toISOString() : null; said.push(p.done ? `marked ${tab.name} done` : `reopened ${tab.name}`); }
    if (p.name !== undefined) { const n = t(p.name, 60); if (!n) throw new Error("The tab needs a name."); if (n !== tab.name) { patch.name = n; said.push(`renamed ${tab.name} to ${n}`); } }
    if (!Object.keys(patch).length) return { ok: true, data: undefined };
    const { error } = await ctx.supabase.from("support_ticket_tabs").update(patch).eq("id", tabId);
    if (error) throw new Error(error.message);
    await logLine(ctx, tab.ticket_id as string, `${actorName(ctx.profile)} ${said.join(", ")}`, tabId);
    if (tabGivenTo) await tellAssignee(ctx.org.id, tab.ticket_id as string, tabGivenTo, ctx.user.id, `${actorName(ctx.profile)} gave you the ${tab.name} part of this ticket`, []);
    refresh(tab.ticket_id as string);
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

export async function deleteTicketTab(tabId: string): Promise<R> {
  try {
    const ctx = await desk();
    if (!UUID.test(tabId)) throw new Error("Refresh and try again.");
    const { data: tab } = await ctx.supabase.from("support_ticket_tabs").select("ticket_id, name").eq("id", tabId).eq("organisation_id", ctx.org.id).maybeSingle();
    if (!tab) return { ok: true, data: undefined };
    await ctx.supabase.from("support_ticket_tabs").delete().eq("id", tabId);
    await logLine(ctx, tab.ticket_id as string, `${actorName(ctx.profile)} removed the ${tab.name} tab`);
    refresh(tab.ticket_id as string);
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}
