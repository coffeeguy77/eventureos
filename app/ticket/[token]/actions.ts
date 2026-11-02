"use server";

import { createServiceClient } from "@/lib/integrations/runtime";
import { appBaseUrl } from "@/lib/integrations/registry";
import { readNerd } from "@/lib/nerdherd/core";
import { splitInc } from "@/lib/nerdherd/quotes";

/**
 * The client's ticket page (private link, no login): accept and pay a quote, decline it, or reply.
 * Uses the service role — every query is limited to the ticket the link belongs to, and never reads internal columns.
 */
type R<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) });
const TOKEN = /^[0-9a-f]{40,80}$/i;
const UUID = /^[0-9a-f-]{36}$/i;
const hits = new Map<string, number[]>();
function limit(key: string, n = 12, ms = 10 * 60_000) {
  const now = Date.now(), list = (hits.get(key) ?? []).filter((t) => now - t < ms);
  if (list.length >= n) throw new Error("Too many tries — please wait a few minutes.");
  hits.set(key, [...list, now]);
}

async function link(token: string) {
  if (!TOKEN.test(token)) throw new Error("This link isn't valid.");
  const db = createServiceClient();
  const { data: l } = await db.from("support_ticket_links").select("token, organisation_id, ticket_id, email, name, contact_id").eq("token", token).maybeSingle();
  if (!l) throw new Error("This link isn't valid any more.");
  return { db, l: l as { token: string; organisation_id: string; ticket_id: string; email: string; name: string | null; contact_id: string | null } };
}

/** Accept a quote: raises the invoice (one line, the title — no hours) and goes straight to paying it. */
export async function acceptQuote(token: string, quoteId: string, name: string): Promise<R<{ payUrl: string }>> {
  try {
    limit(`a:${token}`);
    const who = name.trim().slice(0, 120);
    if (who.length < 2) throw new Error("Type your name to accept.");
    if (!UUID.test(quoteId)) throw new Error("That quote isn't valid.");
    const { db, l } = await link(token);
    const { data: q } = await db.from("support_ticket_quotes").select("id, seq, kind, title, amount, status, invoice_id, ticket_id").eq("id", quoteId).eq("ticket_id", l.ticket_id).maybeSingle();
    if (!q) throw new Error("That quote isn't on this ticket.");
    const { data: t } = await db.from("support_tickets").select("id, number, customer_id, status").eq("id", l.ticket_id).single();
    if (!t?.customer_id) throw new Error("This ticket isn't ready to accept yet — please reply and we'll sort it out.");
    // already accepted: back to paying
    if (q.invoice_id && ["accepted", "sent"].includes(q.status as string)) {
      const { data: inv } = await db.from("invoices").select("pay_token, status").eq("id", q.invoice_id).maybeSingle();
      if (inv && inv.status !== "void") return { ok: true, payUrl: `${appBaseUrl()}/pay/${inv.pay_token}` };
    }
    if (q.status !== "sent") throw new Error(q.status === "paid" || q.status === "completed" ? "This quote is already paid — thank you!" : "This quote can't be accepted any more.");
    const { data: org } = await db.from("organisations").select("id, currency, settings").eq("id", l.organisation_id).single();
    const nerd = readNerd(org?.settings);
    const amt = splitInc(Number(q.amount));
    const today = new Date().toISOString().slice(0, 10);
    const desc = `Ticket #${t.number} — ${q.kind === "variation" ? `Variation ${q.seq}: ` : ""}${q.title}`.slice(0, 500);
    const { data: inv, error } = await db.from("invoices").insert({
      organisation_id: l.organisation_id, customer_id: t.customer_id, kind: "full", status: "awaiting_payment", issue_date: today, due_date: today,
      subtotal: amt.subtotal, tax_total: amt.tax, total: amt.total, currency: org?.currency ?? "AUD", reference: `Ticket #${t.number}${q.kind === "variation" ? ` V${q.seq}` : ""}`,
      line_items: [{ description: desc, quantity: 1, unit_amount: amt.total, tax_rate: 10, item_code: null, account_code: nerd.accountCode, inc: true, line_amount: amt.total }],
    }).select("id, number, pay_token").single();
    if (error) throw new Error(`Couldn't raise the invoice — please try again. (${error.message})`);
    const now = new Date().toISOString();
    await db.from("support_ticket_quotes").update({ status: "accepted", accepted_at: now, accepted_by: `${who} (${l.email})`, invoice_id: inv.id, updated_at: now }).eq("id", q.id);
    await db.from("support_tickets").update({ status: "awaiting_payment", last_activity_at: now, updated_at: now }).eq("id", t.id).in("status", ["new", "open", "waiting_customer", "awaiting_payment"]);
    await db.from("support_ticket_updates").insert({ organisation_id: l.organisation_id, ticket_id: t.id, kind: "system", body: `${who} accepted ${q.kind === "variation" ? "variation" : "quote"} ${q.seq} — invoice ${inv.number ?? ""} raised, waiting for payment.`, author_id: null, author_name: who });
    await db.from("notifications").insert({ organisation_id: l.organisation_id, type: "ticket.accepted", title: `Quote accepted on #${t.number} by ${who}`.slice(0, 200), body: `${q.title} — waiting for payment`, link: `/nerd-herd/tickets/${t.id}`, entity_type: "support_ticket", entity_id: t.id });
    const { alertStaff } = await import("@/lib/nerdherd/mail");
    await alertStaff(db, l.organisation_id, t.id as string, `${who} accepted the quote`, [`${q.title}`, `Invoice ${inv.number ?? ""} raised — the light turns green when it's paid.`]);
    return { ok: true, payUrl: `${appBaseUrl()}/pay/${inv.pay_token}` };
  } catch (e) { return fail(e); }
}

export async function declineQuote(token: string, quoteId: string, reason: string): Promise<R> {
  try {
    limit(`d:${token}`);
    if (!UUID.test(quoteId)) throw new Error("That quote isn't valid.");
    const { db, l } = await link(token);
    const { data: q } = await db.from("support_ticket_quotes").select("id, seq, kind, title, status").eq("id", quoteId).eq("ticket_id", l.ticket_id).maybeSingle();
    if (!q || q.status !== "sent") throw new Error("This quote can't be declined any more.");
    const now = new Date().toISOString();
    const why = reason.trim().slice(0, 2000);
    await db.from("support_ticket_quotes").update({ status: "declined", declined_at: now, decline_reason: why || null, updated_at: now }).eq("id", q.id);
    await db.from("support_ticket_updates").insert({ organisation_id: l.organisation_id, ticket_id: l.ticket_id, kind: "comment", public: true, body: `Declined ${q.kind === "variation" ? "variation" : "quote"} ${q.seq} (${q.title})${why ? `: ${why}` : ""}`, author_id: null, author_name: l.name ?? l.email });
    await db.from("support_tickets").update({ status: "open", last_activity_at: now }).eq("id", l.ticket_id).eq("status", "awaiting_payment");
    const { alertStaff } = await import("@/lib/nerdherd/mail");
    await alertStaff(db, l.organisation_id, l.ticket_id, `${l.name ?? l.email} declined the quote`, [q.title as string, why || "No reason given."]);
    return { ok: true };
  } catch (e) { return fail(e); }
}

/** The client writes back from the ticket page. */
export async function clientTicketReply(token: string, body: string): Promise<R> {
  try {
    limit(`r:${token}`, 10);
    const text = body.trim().slice(0, 10000);
    if (text.length < 2) throw new Error("Write your message first.");
    const { db, l } = await link(token);
    const now = new Date().toISOString();
    const { error } = await db.from("support_ticket_updates").insert({ organisation_id: l.organisation_id, ticket_id: l.ticket_id, kind: "comment", public: true, body: text, author_id: null, author_name: l.name ?? l.email });
    if (error) throw new Error("Couldn't send — please try again.");
    await db.from("support_tickets").update({ last_activity_at: now, updated_at: now }).eq("id", l.ticket_id);
    await db.from("support_tickets").update({ status: "open", resolved_at: null }).eq("id", l.ticket_id).in("status", ["resolved", "closed", "waiting_customer"]);
    const { data: t } = await db.from("support_tickets").select("number").eq("id", l.ticket_id).single();
    await db.from("notifications").insert({ organisation_id: l.organisation_id, type: "ticket.reply", title: `Reply on #${t?.number} from ${l.name ?? l.email}`.slice(0, 200), body: text.slice(0, 140), link: `/nerd-herd/tickets/${l.ticket_id}`, entity_type: "support_ticket", entity_id: l.ticket_id });
    const { alertStaff } = await import("@/lib/nerdherd/mail");
    await alertStaff(db, l.organisation_id, l.ticket_id, `${l.name ?? l.email} replied on the ticket page`, [text.slice(0, 800)]);
    return { ok: true };
  } catch (e) { return fail(e); }
}
