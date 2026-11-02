"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/context";
import { actorName, logActivity } from "@/lib/activity";
import { createServiceClient } from "@/lib/integrations/runtime";
import { readNerd } from "@/lib/nerdherd/core";
import { cleanTasks, priceFor, quoteMessage, sumHours } from "@/lib/nerdherd/quotes";
import type { QuoteDraft } from "@/lib/nerdherd/quote-ai";

/** Nerd Herd ticket quotes: write (with Claude), send / nudge, people on the ticket, tick off the work, tell the client it's done. */
type R<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const UUID = /^[0-9a-f-]{36}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NEEDS = "Run database update 0092 (ticket quotes) first.";
const dbErr = (m: string) => (/support_ticket_(quotes|quote_tasks|contacts|links|views)|gmail_thread_id/.test(m) ? NEEDS : m);

async function desk() {
  const ctx = await requireOrg();
  if (ctx.role === "staff" || ctx.role === "customer") throw new Error("Only the office team can work on tickets.");
  return ctx;
}
async function ticketFor(id: string) {
  if (!UUID.test(id)) throw new Error("That ticket doesn't exist.");
  const ctx = await desk();
  const { data, error } = await ctx.supabase.from("support_tickets").select("id, number, subject, status, customer_id, contact_id, email_thread_id, gmail_thread_id, assigned_to").eq("id", id).eq("organisation_id", ctx.org.id).maybeSingle();
  if (error) throw new Error(dbErr(error.message));
  if (!data) throw new Error("That ticket no longer exists.");
  return { ctx, ticket: data as { id: string; number: number; subject: string; status: string; customer_id: string | null; contact_id: string | null; email_thread_id: string | null; gmail_thread_id: string | null; assigned_to: string | null } };
}
async function quoteFor(id: string) {
  if (!UUID.test(id)) throw new Error("That quote doesn't exist.");
  const ctx = await desk();
  const { data, error } = await ctx.supabase.from("support_ticket_quotes").select("*").eq("id", id).eq("organisation_id", ctx.org.id).maybeSingle();
  if (error) throw new Error(dbErr(error.message));
  if (!data) throw new Error("That quote no longer exists.");
  return { ctx, quote: data as { id: string; ticket_id: string; seq: number; kind: "quote" | "variation"; title: string; description: string | null; hours: number; rate: number; amount: number; status: string; invoice_id: string | null; send_count: number } };
}
const refresh = (ticketId: string) => { revalidatePath(`/nerd-herd/tickets/${ticketId}`); revalidatePath("/nerd-herd", "layout"); revalidatePath("/dashboard"); };
const orgMail = async (orgId: string) => {
  const { data } = await createServiceClient().from("organisations").select("id, name, brand_colour, logo_url, settings, contact_email").eq("id", orgId).single();
  return data as { id: string; name: string; brand_colour: string | null; logo_url: string | null; settings: unknown; contact_email: string | null };
};

// ------------------------------------------------------------------------------------------------
// People on the ticket
// ------------------------------------------------------------------------------------------------

export interface Person { contactId: string | null; name: string; email: string | null; phone: string | null; position: string | null; onTicket: boolean; asked: boolean }

/** Everyone who could get the quote: the person who asked, people added to the ticket, and the client's other contacts. */
export async function ticketPeople(ticketId: string): Promise<R<{ people: Person[]; sender: { via: "gmail" | "resend"; address: string | null }; first: string | null }>> {
  try {
    const { ctx, ticket } = await ticketFor(ticketId);
    const { supabase, org } = ctx;
    const [{ data: on }, { data: all }, { data: cust }] = await Promise.all([
      supabase.from("support_ticket_contacts").select("contact_id").eq("ticket_id", ticketId),
      ticket.customer_id ? supabase.from("contacts").select("id, first_name, last_name, email, phone, position, is_primary").eq("customer_id", ticket.customer_id).eq("organisation_id", org.id).order("is_primary", { ascending: false }).limit(50) : Promise.resolve({ data: [] }),
      ticket.customer_id ? supabase.from("customers").select("name, email, phone").eq("id", ticket.customer_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const onIds = new Set(((on ?? []) as { contact_id: string }[]).map((x) => x.contact_id));
    const people: Person[] = ((all ?? []) as { id: string; first_name: string; last_name: string | null; email: string | null; phone: string | null; position: string | null }[]).map((c) => ({
      contactId: c.id, name: `${c.first_name} ${c.last_name ?? ""}`.trim(), email: c.email, phone: c.phone, position: c.position, onTicket: onIds.has(c.id) || c.id === ticket.contact_id, asked: c.id === ticket.contact_id,
    }));
    const cu = cust as { name: string; email: string | null; phone: string | null } | null;
    if (cu?.email && !people.some((p) => p.email?.toLowerCase() === cu.email!.toLowerCase())) people.push({ contactId: null, name: cu.name, email: cu.email, phone: cu.phone, position: "Main email", onTicket: !people.some((p) => p.onTicket), asked: false });
    people.sort((a, b) => Number(b.asked) - Number(a.asked) || Number(b.onTicket) - Number(a.onTicket));
    const { ticketSender } = await import("@/lib/nerdherd/mail");
    const sender = await ticketSender(createServiceClient(), org.id);
    return { ok: true, data: { people, sender, first: people.find((p) => p.asked || p.onTicket)?.name.split(" ")[0] ?? null } };
  } catch (e) { return fail(e); }
}

/** Put someone on the ticket — an existing contact, or a new person (saved to the client's contacts too). */
export async function addTicketPerson(ticketId: string, p: { contactId?: string | null; firstName?: string; lastName?: string; email?: string; phone?: string; position?: string }): Promise<R<{ contactId: string }>> {
  try {
    const { ctx, ticket } = await ticketFor(ticketId);
    const { supabase, org, user, profile } = ctx;
    if (!ticket.customer_id) throw new Error("Choose the client for this ticket first.");
    let contactId = p.contactId && UUID.test(p.contactId) ? p.contactId : null;
    if (!contactId) {
      const email = (p.email ?? "").trim().toLowerCase();
      if (!(p.firstName ?? "").trim()) throw new Error("Enter their first name.");
      if (!EMAIL.test(email)) throw new Error("Enter a valid email address.");
      const { data: have } = await supabase.from("contacts").select("id").eq("customer_id", ticket.customer_id).ilike("email", email).maybeSingle();
      if (have) contactId = have.id as string;
      else {
        const { data, error } = await supabase.from("contacts").insert({ organisation_id: org.id, customer_id: ticket.customer_id, first_name: p.firstName!.trim().slice(0, 80), last_name: p.lastName?.trim().slice(0, 80) || null, email, phone: p.phone?.trim().slice(0, 40) || null, position: p.position?.trim().slice(0, 80) || null, is_primary: false, created_by: user.id }).select("id").single();
        if (error) throw new Error(`Couldn't add the contact: ${error.message}`);
        contactId = data.id as string;
        await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "contact.created", entityType: "customer", entityId: ticket.customer_id, customerId: ticket.customer_id, summary: `${actorName(profile)} added ${p.firstName} ${p.lastName ?? ""} (${email}) from ticket #${ticket.number}` });
      }
    }
    const { error } = await supabase.from("support_ticket_contacts").upsert({ ticket_id: ticketId, contact_id: contactId, organisation_id: org.id, added_by: user.id }, { onConflict: "ticket_id,contact_id" });
    if (error) throw new Error(dbErr(error.message));
    refresh(ticketId);
    return { ok: true, data: { contactId: contactId! } };
  } catch (e) { return fail(e); }
}

export async function removeTicketPerson(ticketId: string, contactId: string): Promise<R> {
  try {
    const { ctx } = await ticketFor(ticketId);
    if (!UUID.test(contactId)) throw new Error("Choose a person.");
    const { error } = await ctx.supabase.from("support_ticket_contacts").delete().eq("ticket_id", ticketId).eq("contact_id", contactId);
    if (error) throw new Error(dbErr(error.message));
    refresh(ticketId);
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

// ------------------------------------------------------------------------------------------------
// Writing the quote
// ------------------------------------------------------------------------------------------------

/** Claude drafts the description, steps and hours from the conversation (the staff see the hours; the client never does). */
export async function draftQuoteWithAI(ticketId: string, o: { variation: boolean; brief?: string | null }): Promise<R<QuoteDraft>> {
  try {
    const { ctx } = await ticketFor(ticketId);
    const { draftTicketQuote } = await import("@/lib/nerdherd/quote-ai");
    return { ok: true, data: await draftTicketQuote(ctx.supabase, ctx.org, ticketId, { variation: o.variation, brief: o.brief, senderName: actorName(ctx.profile) }) };
  } catch (e) { return fail(e); }
}

export interface QuoteInput {
  title: string; description: string; tasks: { label: string; hours: number }[]; rate: number;
  /** a fixed price inc GST instead of hours × rate (optional) */
  priceOverride?: number | null;
  ai?: { description: string; hours: number; notes: string } | null;
}

/** Save a draft quote (new, or changes to one that hasn't been accepted). A ticket's first quote is the quote; later ones are variations. */
export async function saveTicketQuote(ticketId: string, quoteId: string | null, i: QuoteInput): Promise<R<{ id: string }>> {
  try {
    const { ctx, ticket } = await ticketFor(ticketId);
    const { supabase, org, user, profile } = ctx;
    if (!ticket.customer_id) throw new Error("Choose the client for this ticket first — the quote is for them.");
    const title = (i.title ?? "").trim().slice(0, 200);
    if (!title) throw new Error("Give the quote a title.");
    const description = (i.description ?? "").trim().slice(0, 8000);
    if (!description) throw new Error("Write what the client is getting (or let Claude draft it).");
    const tasks = cleanTasks(i.tasks);
    if (!tasks.length) throw new Error("Add at least one step of the work.");
    const rate = Math.round((Number(i.rate) || readNerd(org.settings).hourlyRate) * 100) / 100;
    if (!(rate > 0 && rate < 10000)) throw new Error("Enter the hourly rate (ex GST).");
    const hours = sumHours(tasks);
    const price = i.priceOverride != null && Number(i.priceOverride) > 0 ? Math.round(Number(i.priceOverride) * 100) / 100 : priceFor(hours, rate).incGst;
    if (!(price > 0)) throw new Error("The price is $0 — add hours to the steps.");
    const now = new Date().toISOString();
    const base: Record<string, unknown> = { title, description, hours, rate, amount: price, updated_at: now };
    if (i.ai) { base.ai_description = i.ai.description.slice(0, 8000); base.ai_hours = Math.round(Number(i.ai.hours) * 100) / 100 || null; base.ai_notes = i.ai.notes.slice(0, 3000); }
    let id = quoteId;
    if (id) {
      const { quote } = await quoteFor(id);
      if (quote.ticket_id !== ticketId) throw new Error("That quote isn't on this ticket.");
      if (!["draft", "sent"].includes(quote.status)) throw new Error("This quote has been accepted — add a variation for extra work instead.");
      const { error } = await supabase.from("support_ticket_quotes").update(base).eq("id", id);
      if (error) throw new Error(dbErr(error.message));
      await supabase.from("support_ticket_quote_tasks").delete().eq("quote_id", id);
    } else {
      const { data: last } = await supabase.from("support_ticket_quotes").select("seq").eq("ticket_id", ticketId).order("seq", { ascending: false }).limit(1).maybeSingle();
      const seq = (Number(last?.seq) || 0) + 1;
      const { data, error } = await supabase.from("support_ticket_quotes").insert({ ...base, organisation_id: org.id, ticket_id: ticketId, seq, kind: seq === 1 ? "quote" : "variation", status: "draft", created_by: user.id }).select("id").single();
      if (error) throw new Error(dbErr(error.message));
      id = data.id as string;
    }
    const { error: tErr } = await supabase.from("support_ticket_quote_tasks").insert(tasks.map((x, n) => ({ organisation_id: org.id, quote_id: id, ticket_id: ticketId, position: n, label: x.label, hours: x.hours })));
    if (tErr) throw new Error(dbErr(tErr.message));
    if (!quoteId) await supabase.from("support_ticket_updates").insert({ organisation_id: org.id, ticket_id: ticketId, kind: "system", body: `${actorName(profile)} drafted a quote: ${title} (${hours} h)`, author_id: user.id, author_name: actorName(profile) });
    refresh(ticketId);
    return { ok: true, data: { id: id! } };
  } catch (e) { return fail(e); }
}

/** Remove a draft, or cancel a sent quote the client hasn't accepted. */
export async function cancelTicketQuote(quoteId: string): Promise<R> {
  try {
    const { ctx, quote } = await quoteFor(quoteId);
    const { supabase, org, user, profile } = ctx;
    if (quote.status === "draft") {
      const { error } = await supabase.from("support_ticket_quotes").delete().eq("id", quoteId);
      if (error) throw new Error(error.message);
    } else if (quote.status === "sent") {
      const { error } = await supabase.from("support_ticket_quotes").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", quoteId);
      if (error) throw new Error(error.message);
      await supabase.from("support_ticket_updates").insert({ organisation_id: org.id, ticket_id: quote.ticket_id, kind: "system", body: `${actorName(profile)} cancelled ${quote.kind === "variation" ? "variation" : "quote"} ${quote.seq}: ${quote.title}`, author_id: user.id, author_name: actorName(profile) });
    } else throw new Error("This quote has been accepted — it can't be cancelled here. Void its invoice first if the job isn't going ahead.");
    refresh(quote.ticket_id);
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

// ------------------------------------------------------------------------------------------------
// Sending (and nudging)
// ------------------------------------------------------------------------------------------------

/** The suggested message for sending (or nudging) a quote — the staff edit it in the dialog. */
export async function quoteSendDraft(quoteId: string): Promise<R<{ subject: string; message: string; nudge: boolean }>> {
  try {
    const { ctx, quote } = await quoteFor(quoteId);
    const { data: t } = await ctx.supabase.from("support_tickets").select("number, subject, contact_id").eq("id", quote.ticket_id).single();
    let first: string | null = null;
    if (t?.contact_id) { const { data: c } = await ctx.supabase.from("contacts").select("first_name").eq("id", t.contact_id).maybeSingle(); first = (c?.first_name as string | undefined) ?? null; }
    const nudge = quote.send_count > 0;
    const sender = ctx.profile.full_name?.split(" ")[0] ?? ctx.org.name;
    return { ok: true, data: { subject: `${nudge ? "Reminder: " : ""}${quote.kind === "variation" ? "Variation" : "Quote"} for ticket #${t?.number}: ${quote.title}`.slice(0, 200), message: quoteMessage({ first, kind: quote.kind, seq: quote.seq, title: quote.title, number: Number(t?.number), nudge, sender }), nudge } };
  } catch (e) { return fail(e); }
}

export interface Recipient { email: string; name: string | null; contactId: string | null }

/** Email the quote to the chosen people — each gets their own link (so we know who opened it). Also used to nudge. */
export async function sendTicketQuote(quoteId: string, i: { recipients: Recipient[]; subject: string; message: string }): Promise<R<{ sent: string[]; failed: { email: string; error: string }[]; via: string; from: string | null }>> {
  try {
    const { ctx, quote } = await quoteFor(quoteId);
    const { supabase, org, user, profile } = ctx;
    if (!["draft", "sent", "accepted"].includes(quote.status)) throw new Error(quote.status === "paid" ? "This quote is already paid." : "This quote can't be sent.");
    const people = (i.recipients ?? []).filter((r) => EMAIL.test(r.email?.trim() ?? "")).slice(0, 15);
    if (!people.length) throw new Error("Choose who to send it to.");
    const message = (i.message ?? "").trim().slice(0, 6000);
    if (!message) throw new Error("Write a message to go with it.");
    const { data: t } = await supabase.from("support_tickets").select("id, number, subject, email_thread_id, gmail_thread_id").eq("id", quote.ticket_id).single();
    if (!t) throw new Error("That ticket no longer exists.");
    const db = createServiceClient();
    const { ticketLink, sendTicketMail } = await import("@/lib/nerdherd/mail");
    const mails = [];
    for (const p of people) {
      const url = await ticketLink(db, org.id, quote.ticket_id, { email: p.email, name: p.name, contactId: p.contactId });
      mails.push({ to: p.email, name: p.name, message, button: { label: quote.status === "accepted" ? "Pay now" : "View, accept and pay", url } });
      // anyone it's sent to is on the ticket from now on
      if (p.contactId && UUID.test(p.contactId)) await supabase.from("support_ticket_contacts").upsert({ ticket_id: quote.ticket_id, contact_id: p.contactId, organisation_id: org.id, added_by: user.id }, { onConflict: "ticket_id,contact_id" });
    }
    const nudge = quote.send_count > 0;
    const r = await sendTicketMail(db, await orgMail(org.id), t as { id: string; number: number; subject: string; email_thread_id: string | null; gmail_thread_id: string | null }, {
      mails, subject: i.subject, byUserId: user.id, byName: actorName(profile), logAs: `${nudge ? "Reminder sent" : "Sent"}: ${quote.kind === "variation" ? "variation" : "quote"} ${quote.seq} — ${quote.title}`,
    });
    if (!r.sent.length) throw new Error(`Nothing was sent: ${r.failed.map((f) => `${f.email} — ${f.error}`).join("; ")}`);
    const now = new Date().toISOString();
    await supabase.from("support_ticket_quotes").update({ status: quote.status === "draft" ? "sent" : quote.status, sent_at: now, send_count: quote.send_count + 1, updated_at: now }).eq("id", quoteId);
    await supabase.from("support_tickets").update({ status: "awaiting_payment", updated_at: now }).eq("id", quote.ticket_id).in("status", ["new", "open", "waiting_customer"]);
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: nudge ? "ticket.quote_nudged" : "ticket.quote_sent", entityType: "support_ticket", entityId: quote.ticket_id, summary: `${actorName(profile)} ${nudge ? "re-sent" : "sent"} ${quote.kind} ${quote.seq} on ticket #${t.number} to ${r.sent.join(", ")}` });
    refresh(quote.ticket_id);
    return { ok: true, data: r };
  } catch (e) { return fail(e); }
}

/** Email the client(s) about the ticket from the conversation box (a reply they'll also see on their ticket page). */
export async function emailTicketReply(ticketId: string, i: { recipients: Recipient[]; message: string }): Promise<R<{ sent: string[]; failed: { email: string; error: string }[] }>> {
  try {
    const { ctx, ticket } = await ticketFor(ticketId);
    const { org, user, profile } = ctx;
    const people = (i.recipients ?? []).filter((r) => EMAIL.test(r.email?.trim() ?? "")).slice(0, 15);
    if (!people.length) throw new Error("Choose who to email.");
    const message = (i.message ?? "").trim().slice(0, 20000);
    if (!message) throw new Error("Write something first.");
    const db = createServiceClient();
    const { ticketLink, sendTicketMail } = await import("@/lib/nerdherd/mail");
    const mails = [];
    for (const p of people) mails.push({ to: p.email, name: p.name, message, button: { label: `View ticket #${ticket.number}`, url: await ticketLink(db, org.id, ticketId, { email: p.email, name: p.name, contactId: p.contactId }) } });
    const r = await sendTicketMail(db, await orgMail(org.id), ticket, { mails, byUserId: user.id, byName: actorName(profile) });
    if (!r.sent.length) throw new Error(`Nothing was sent: ${r.failed.map((f) => `${f.email} — ${f.error}`).join("; ")}`);
    if (ticket.status === "new") await ctx.supabase.from("support_tickets").update({ status: "in_progress" }).eq("id", ticketId);
    refresh(ticketId);
    return { ok: true, data: { sent: r.sent, failed: r.failed } };
  } catch (e) { return fail(e); }
}

// ------------------------------------------------------------------------------------------------
// Doing the work
// ------------------------------------------------------------------------------------------------

/** Tick a step off (only once the quote is paid). Returns whether every step is now done. */
export async function tickQuoteTask(taskId: string, done: boolean): Promise<R<{ allDone: boolean; quoteId: string }>> {
  try {
    if (!UUID.test(taskId)) throw new Error("That step doesn't exist.");
    const ctx = await desk();
    const { supabase, org, user, profile } = ctx;
    const { data: task, error } = await supabase.from("support_ticket_quote_tasks").select("id, quote_id, ticket_id, label, support_ticket_quotes(status, title, seq, kind)").eq("id", taskId).eq("organisation_id", org.id).maybeSingle();
    if (error) throw new Error(dbErr(error.message));
    if (!task) throw new Error("That step no longer exists.");
    const q = task.support_ticket_quotes as unknown as { status: string; title: string; seq: number; kind: string };
    if (!["paid", "completed"].includes(q.status)) throw new Error("Not paid yet — the work starts once the client has paid (red light).");
    const now = new Date().toISOString();
    await supabase.from("support_ticket_quote_tasks").update(done ? { done_at: now, done_by: actorName(profile) } : { done_at: null, done_by: null }).eq("id", taskId);
    const { data: all } = await supabase.from("support_ticket_quote_tasks").select("done_at").eq("quote_id", task.quote_id);
    const allDone = ((all ?? []) as { done_at: string | null }[]).every((x) => x.done_at);
    if (allDone && q.status === "paid") await supabase.from("support_ticket_quotes").update({ status: "completed", completed_at: now, updated_at: now }).eq("id", task.quote_id);
    if (!allDone && q.status === "completed") await supabase.from("support_ticket_quotes").update({ status: "paid", completed_at: null, updated_at: now }).eq("id", task.quote_id);
    await supabase.from("support_tickets").update({ last_activity_at: now, updated_at: now }).eq("id", task.ticket_id).in("status", ["open", "new", "scheduled", "awaiting_payment", "in_progress"]);
    if (done) await supabase.from("support_tickets").update({ status: "in_progress" }).eq("id", task.ticket_id).in("status", ["open", "new", "scheduled"]);
    await supabase.from("support_ticket_updates").insert({ organisation_id: org.id, ticket_id: task.ticket_id, kind: "status", body: `${actorName(profile)} ${done ? "completed" : "reopened"}: ${task.label}${allDone && done ? ` — all of ${q.kind} ${q.seq} done` : ""}`, author_id: user.id, author_name: actorName(profile) });
    refresh(task.ticket_id as string);
    return { ok: true, data: { allDone, quoteId: task.quote_id as string } };
  } catch (e) { return fail(e); }
}

/** Tell the client the work is finished (the message pops up so the staff can change it and choose who). */
export async function notifyQuoteDone(quoteId: string, i: { recipients: Recipient[]; message: string; resolveTicket: boolean }): Promise<R<{ sent: string[] }>> {
  try {
    const { ctx, quote } = await quoteFor(quoteId);
    const { supabase, org, user, profile } = ctx;
    if (quote.status !== "completed") throw new Error("Tick off every step first.");
    const people = (i.recipients ?? []).filter((r) => EMAIL.test(r.email?.trim() ?? "")).slice(0, 15);
    const db = createServiceClient();
    const { data: t } = await supabase.from("support_tickets").select("id, number, subject, email_thread_id, gmail_thread_id").eq("id", quote.ticket_id).single();
    let sent: string[] = [];
    if (people.length && t) {
      const { ticketLink, sendTicketMail } = await import("@/lib/nerdherd/mail");
      const mails = [];
      for (const p of people) mails.push({ to: p.email, name: p.name, message: i.message.trim().slice(0, 6000), button: { label: `See ticket #${t.number}`, url: await ticketLink(db, org.id, quote.ticket_id, { email: p.email, name: p.name, contactId: p.contactId }) } });
      const r = await sendTicketMail(db, await orgMail(org.id), t as { id: string; number: number; subject: string; email_thread_id: string | null; gmail_thread_id: string | null }, { mails, byUserId: user.id, byName: actorName(profile), logAs: `Work completed: ${quote.title}` });
      if (!r.sent.length) throw new Error(`Nothing was sent: ${r.failed.map((f) => `${f.email} — ${f.error}`).join("; ")}`);
      sent = r.sent;
    }
    const now = new Date().toISOString();
    await supabase.from("support_ticket_quotes").update({ client_notified_at: people.length ? now : null, updated_at: now }).eq("id", quoteId);
    if (i.resolveTicket) {
      const { data: open } = await supabase.from("support_ticket_quotes").select("id").eq("ticket_id", quote.ticket_id).in("status", ["sent", "accepted", "paid"]);
      if (!(open ?? []).length) await supabase.from("support_tickets").update({ status: "resolved", resolved_at: now, updated_at: now }).eq("id", quote.ticket_id);
    }
    refresh(quote.ticket_id);
    return { ok: true, data: { sent } };
  } catch (e) { return fail(e); }
}
