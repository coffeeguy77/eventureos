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
  return { ctx, ticket: data as Record<string, unknown> & { id: string; number: number; subject: string; status: TicketStatus; customer_id: string | null; checklist: unknown } };
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
    const { data, error } = await supabase.from("support_tickets").insert({
      // details typed by the team are an internal note (below), never on the ticket the client can see
      organisation_id: org.id, subject, kind,
      priority: isPriority(i.priority) ? i.priority : "normal",
      status: isTicketStatus(i.status) ? i.status : "new", source: "manual",
      customer_id: i.customer_id && UUID.test(i.customer_id) ? i.customer_id : null,
      website_id: i.website_id && UUID.test(i.website_id) ? i.website_id : null,
      assigned_to: i.assigned_to && UUID.test(i.assigned_to) ? i.assigned_to : null,
      due_date: i.due_date && DATE.test(i.due_date) ? i.due_date : null,
      checklist: kind === "maintenance" ? await defaultChecklist(supabase) : [],
      created_by: user.id,
    }).select("id, number, customer_id").single();
    if (error) throw new Error(`Couldn't create the ticket: ${error.message}`);
    if (t(i.description, 20000)) {
      await supabase.from("support_ticket_updates").insert({ organisation_id: org.id, ticket_id: data.id, kind: "note", body: t(i.description, 20000), author_id: user.id, author_name: actorName(profile) });
    }
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "ticket.created", entityType: "support_ticket", entityId: data.id, customerId: data.customer_id, summary: `${actorName(profile)} opened ticket #${data.number}: ${subject}` });
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
    refresh(id);
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

export interface UpdateInput { kind: "comment" | "note" | "time"; body?: string | null; minutes?: number | null; billable?: boolean; public?: boolean; status?: TicketStatus | null }

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
    const { error } = await supabase.from("support_ticket_updates").insert({
      organisation_id: org.id, ticket_id: id, kind, body, minutes, billable: i.billable !== false,
      public: kind === "comment" && i.public !== false, author_id: user.id, author_name: actorName(profile),
    });
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

export async function saveNerdSettings(i: { hourly_rate: number; account_code: string; email_tickets: boolean; support_email: string }): Promise<R> {
  try {
    const { supabase, org, role, user, profile } = await desk();
    if (!canManage(role)) throw new Error("Only owners, admins and managers can change settings.");
    const rate = Math.round(Number(i.hourly_rate) * 100) / 100;
    if (!(rate > 0 && rate < 10000)) throw new Error("Enter the hourly rate (ex GST).");
    const email = (i.support_email ?? "").trim().toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error("That support email address doesn't look right.");
    const nerdherd = { hourly_rate: rate, account_code: t(i.account_code, 10) ?? "6664", email_tickets: !!i.email_tickets, support_email: email || null };
    const settings = { ...(org.settings as Record<string, unknown>), nerdherd };
    const { error } = await supabase.from("organisations").update({ settings }).eq("id", org.id);
    if (error) throw new Error(error.message);
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "settings.updated", entityType: "organisation", entityId: org.id, summary: `${actorName(profile)} updated Nerd Herd settings` });
    refresh();
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}
