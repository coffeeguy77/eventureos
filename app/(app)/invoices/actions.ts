"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { canManage, requireOrg } from "@/lib/context";
import { actorName, logActivity } from "@/lib/activity";
import { money, todayISO, zonedTimeUTC } from "@/lib/format";

export type InvoiceFormState = { error?: string; ok?: string } | undefined;

const str = (v: FormDataEntryValue | null) => String(v ?? "").trim() || null;
const amount = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").replace(/[$,\s]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};
const UUID = /^[0-9a-f-]{36}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const KINDS = ["deposit", "final", "full", "other"] as const;
const KIND_LABEL: Record<(typeof KINDS)[number], string> = { deposit: "Deposit invoice", final: "Final invoice", full: "Invoice", other: "Invoice" };
const XERO_MSG = "This invoice is managed in Xero — make the change in Xero and it will sync back.";

function revalidateInvoice(id: string, eventId?: string | null, customerId?: string | null) {
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  revalidatePath("/payments");
  revalidatePath("/dashboard");
  if (eventId) revalidatePath(`/events/${eventId}`);
  if (customerId) revalidatePath(`/clients/${customerId}`);
}

type InvoiceRow = { id: string; number: string; status: string; total: number; amount_paid: number; xero_invoice_id: string | null; event_id: string | null; customer_id: string; due_date: string | null };

async function loadInvoice(id: string) {
  const ctx = await requireOrg();
  if (!UUID.test(id)) return { ctx, inv: null };
  const { data } = await ctx.supabase.from("invoices")
    .select("id, number, status, total, amount_paid, xero_invoice_id, event_id, customer_id, due_date")
    .eq("id", id).eq("organisation_id", ctx.org.id).maybeSingle();
  return { ctx, inv: data as InvoiceRow | null };
}

export async function recordPayment(invoiceId: string, _prev: InvoiceFormState, form: FormData): Promise<InvoiceFormState> {
  const { ctx, inv } = await loadInvoice(invoiceId);
  if (!inv) return { error: "Invoice not found." };
  if (!canManage(ctx.role)) return { error: "Only owners, admins and managers can record payments." };
  if (inv.xero_invoice_id) return { error: XERO_MSG };

  const amt = amount(form.get("amount"));
  const date = str(form.get("paid_on"));
  const method = str(form.get("method"));
  const reference = str(form.get("reference"));
  if (amt == null || Number.isNaN(amt) || amt <= 0) return { error: "Enter the amount received." };
  if (Math.abs(amt * 100 - Math.round(amt * 100)) > 1e-6) return { error: "Amounts can have at most two decimal places." };
  if (!date || !DATE.test(date)) return { error: "Choose the date the payment was received." };
  const today = todayISO(ctx.org.timezone);
  if (date > today) return { error: "The payment date can’t be in the future." };
  if (reference && reference.length > 120) return { error: "Keep the reference under 120 characters." };

  // Midday local time keeps the payment on the chosen date in every report, whatever the timezone.
  const paidAt = date === today ? new Date().toISOString() : zonedTimeUTC(date, "12:00", ctx.org.timezone);
  const { error } = await ctx.supabase.rpc("record_payment", {
    p_invoice_id: inv.id, p_amount: Math.round(amt * 100) / 100, p_paid_at: paidAt, p_method: method, p_reference: reference,
  });
  if (error) return { error: error.message };
  revalidateInvoice(inv.id, inv.event_id, inv.customer_id);
  return { ok: `Payment of ${money(amt, ctx.org.currency)} recorded` };
}

export async function markInvoiceSent(invoiceId: string): Promise<InvoiceFormState> {
  const { ctx, inv } = await loadInvoice(invoiceId);
  if (!inv) return { error: "Invoice not found." };
  if (!canManage(ctx.role)) return { error: "Only owners, admins and managers can change invoice status." };
  if (inv.xero_invoice_id) return { error: XERO_MSG };
  if (inv.status !== "draft") return { error: "Only draft invoices can be marked as sent." };
  if (Number(inv.total) <= 0) return { error: "Set an amount before sending the invoice." };

  const { error } = await ctx.supabase.from("invoices").update({ status: "awaiting_payment" })
    .eq("id", inv.id).eq("organisation_id", ctx.org.id).eq("status", "draft");
  if (error) return { error: `Couldn’t update the invoice: ${error.message}` };
  await logActivity(ctx.supabase, {
    orgId: ctx.org.id, actorId: ctx.user.id, action: "invoice.sent", entityType: "invoice", entityId: inv.id,
    eventId: inv.event_id, customerId: inv.customer_id,
    summary: `${actorName(ctx.profile)} marked ${inv.number} as sent — awaiting payment`,
    changes: { status: ["draft", "awaiting_payment"] },
  });
  revalidateInvoice(inv.id, inv.event_id, inv.customer_id);
  return { ok: "Marked as awaiting payment" };
}

export async function voidInvoice(invoiceId: string, _prev: InvoiceFormState, form: FormData): Promise<InvoiceFormState> {
  const { ctx, inv } = await loadInvoice(invoiceId);
  if (!inv) return { error: "Invoice not found." };
  if (!canManage(ctx.role)) return { error: "Only owners, admins and managers can void invoices." };
  if (inv.xero_invoice_id) return { error: XERO_MSG };
  if (inv.status === "void") return { error: "This invoice is already void." };
  if (Number(inv.amount_paid) > 0) return { error: `${money(inv.amount_paid, ctx.org.currency)} has been paid on this invoice. Refund or reallocate the payment before voiding it.` };
  const reason = str(form.get("reason"));
  if (!reason) return { error: "Give a reason for voiding the invoice." };
  if (reason.length > 500) return { error: "Keep the reason under 500 characters." };

  const { error } = await ctx.supabase.from("invoices").update({ status: "void" })
    .eq("id", inv.id).eq("organisation_id", ctx.org.id);
  if (error) return { error: `Couldn’t void the invoice: ${error.message}` };
  await logActivity(ctx.supabase, {
    orgId: ctx.org.id, actorId: ctx.user.id, action: "invoice.voided", entityType: "invoice", entityId: inv.id,
    eventId: inv.event_id, customerId: inv.customer_id,
    summary: `${actorName(ctx.profile)} voided ${inv.number} — ${reason}`,
    changes: { status: [inv.status, "void"] },
    metadata: { reason },
  });
  revalidateInvoice(inv.id, inv.event_id, inv.customer_id);
  return { ok: "Invoice voided" };
}

export async function createInvoice(_prev: InvoiceFormState, form: FormData): Promise<InvoiceFormState> {
  const { supabase, org, user, profile, role } = await requireOrg();
  if (!canManage(role)) return { error: "Only owners, admins and managers can raise invoices." };
  const customerId = str(form.get("customer_id"));
  const eventId = str(form.get("event_id"));
  const quoteId = str(form.get("quote_id"));
  const kind = str(form.get("kind")) as (typeof KINDS)[number] | null;
  const total = amount(form.get("amount"));
  const issueDate = str(form.get("issue_date")) ?? todayISO(org.timezone);
  const dueDate = str(form.get("due_date"));
  const intent = str(form.get("intent")) === "send" ? "awaiting_payment" : "draft";

  if (!customerId || !UUID.test(customerId)) return { error: "Choose a customer." };
  if (!kind || !KINDS.includes(kind)) return { error: "Choose the invoice type." };
  if (total == null || Number.isNaN(total) || total <= 0) return { error: "Enter an amount greater than zero." };
  if (total > 10_000_000) return { error: "That amount looks too large — check it and try again." };
  if (!DATE.test(issueDate)) return { error: "Choose an invoice date." };
  if (!dueDate || !DATE.test(dueDate)) return { error: "Choose a due date." };
  if (dueDate < issueDate) return { error: "The due date can’t be before the invoice date." };

  const { data: customer } = await supabase.from("customers").select("id, name").eq("id", customerId).eq("organisation_id", org.id).maybeSingle();
  if (!customer) return { error: "That customer couldn’t be found." };

  let ev: { id: string; number: number; customer_id: string } | null = null;
  if (eventId) {
    if (!UUID.test(eventId)) return { error: "That event couldn’t be found." };
    const { data } = await supabase.from("events").select("id, number, customer_id").eq("id", eventId).eq("organisation_id", org.id).maybeSingle();
    if (!data) return { error: "That event couldn’t be found." };
    if (data.customer_id !== customerId) return { error: "That event belongs to a different customer." };
    ev = data;
  }
  if (quoteId) {
    if (!UUID.test(quoteId)) return { error: "That quote couldn’t be found." };
    const { data: q } = await supabase.from("quotes").select("id, status, customer_id, event_id").eq("id", quoteId).eq("organisation_id", org.id).maybeSingle();
    if (!q) return { error: "That quote couldn’t be found." };
    if (q.status !== "accepted") return { error: "Only accepted quotes can be invoiced." };
    if (q.customer_id !== customerId) return { error: "That quote belongs to a different customer." };
    if (ev && q.event_id && q.event_id !== ev.id) return { error: "That quote is for a different event." };
    if (!ev && q.event_id) ev = { id: q.event_id, number: 0, customer_id: customerId };
  }

  const cents = Math.round(total * 100);
  const gross = cents / 100;
  const subtotal = Math.round(cents / 1.1) / 100; // prices include 10% GST, matching automated invoices
  const tax = Math.round((gross - subtotal) * 100) / 100;

  const { data: inv, error } = await supabase.from("invoices").insert({
    organisation_id: org.id,
    customer_id: customerId,
    event_id: ev?.id ?? null,
    quote_id: quoteId,
    kind,
    issue_date: issueDate,
    due_date: dueDate,
    subtotal,
    tax_total: tax,
    total: gross,
    status: intent,
    currency: org.currency,
    created_by: user.id,
  }).select("id, number").single();
  if (error) return { error: `Couldn’t create the invoice: ${error.message}` };

  await logActivity(supabase, {
    orgId: org.id, actorId: user.id, action: "invoice.created", entityType: "invoice", entityId: inv.id,
    eventId: ev?.id ?? null, customerId,
    summary: `${actorName(profile)} created ${KIND_LABEL[kind].toLowerCase()} ${inv.number} for ${money(gross, org.currency)}${intent === "draft" ? " (draft)" : ""}`,
    metadata: { kind, total: gross, due_date: dueDate, quote_id: quoteId },
  });
  revalidateInvoice(inv.id, ev?.id, customerId);
  redirect(`/invoices/${inv.id}`);
}
