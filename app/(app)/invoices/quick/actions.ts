"use server";

import { revalidatePath } from "next/cache";
import { canManage, requireOrg } from "@/lib/context";
import { actorName, logActivity } from "@/lib/activity";
import { money, todayISO } from "@/lib/format";
import { cleanLines, incLineFromEx, lineTotals, type InvLine } from "@/lib/invoices/lines";

type R<T = null> = { ok: true; data: T } | { ok: false; error: string };
const UUID = /^[0-9a-f-]{36}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const r2 = (n: number) => Math.round(n * 100) / 100;

async function manager() {
  const ctx = await requireOrg();
  if (!canManage(ctx.role)) throw new Error("Only owners, admins and managers can raise invoices.");
  return ctx;
}

export interface PastInvoice { id: string; number: string; date: string; total: number; summary: string; event: string | null; lines: InvLine[] }

type RawLine = { description?: string | null; quantity?: number | null; unit_amount?: number | null; line_amount?: number | null; item_code?: string | null; account_code?: string | null; tax_rate?: number; inc?: boolean };

/** A past invoice's lines as GST-inclusive lines (Xero invoices are usually ex GST — told apart by their subtotal). */
function asIncLines(raw: RawLine[], subtotal: number, total: number): InvLine[] {
  const amt = (l: RawLine) => Number(l.line_amount ?? Number(l.quantity ?? 0) * Number(l.unit_amount ?? 0));
  const sum = raw.reduce((a, l) => a + amt(l), 0);
  const allInc = raw.every((l) => l.inc === true);
  const exGst = !allInc && Math.abs(sum - subtotal) < Math.abs(sum - total);
  return raw.filter((l) => (l.description ?? "").trim() && Number(l.quantity ?? 0) > 0).map((l) => {
    const qty = Number(l.quantity);
    const each = l.line_amount != null && Math.abs(Number(l.line_amount) - qty * Number(l.unit_amount ?? 0)) > 0.005 ? Number(l.line_amount) / qty : Number(l.unit_amount ?? 0);
    const gst = l.tax_rate === 0 ? 0 : 10;
    const extra = { item_code: l.item_code ?? null, account_code: l.account_code ?? null };
    if (exGst && gst) return incLineFromEx(String(l.description).trim(), qty, Math.round(each * 10000) / 10000, extra);
    return { description: String(l.description).trim(), quantity: qty, unit_amount: r2(each), tax_rate: gst as 0 | 10, ...extra, service_id: null, inc: true as const };
  });
}

/** The customer's recent invoices, to copy one ("same as last time"). */
export async function pastInvoices(customerId: string): Promise<R<PastInvoice[]>> {
  try {
    const { supabase, org } = await manager();
    if (!UUID.test(customerId)) return { ok: true, data: [] };
    const { data, error } = await supabase.from("invoices").select("id, number, issue_date, subtotal, total, line_items, status, event:events(name, event_date)")
      .eq("organisation_id", org.id).eq("customer_id", customerId).neq("status", "void").order("issue_date", { ascending: false }).limit(15);
    if (error) throw new Error(error.message);
    const out: PastInvoice[] = [];
    for (const i of (data ?? []) as unknown as { id: string; number: string; issue_date: string; subtotal: number; total: number; line_items: RawLine[] | null; event: { name: string; event_date: string | null } | null }[]) {
      const lines = asIncLines(i.line_items ?? [], Number(i.subtotal), Number(i.total));
      if (!lines.length) continue;
      out.push({ id: i.id, number: i.number, date: i.event?.event_date ?? i.issue_date, total: Number(i.total), event: i.event?.name ?? null,
        summary: lines.map((l) => `${l.quantity > 1 ? `${l.quantity}× ` : ""}${l.description.split("\n")[0]}`).join(", ").slice(0, 160), lines });
    }
    return { ok: true, data: out };
  } catch (e) { return fail(e); }
}

/** The customer's Cart Club rates, when they have them (to price the job from carts / baristas / coffees). */
export async function clubRatesFor(customerId: string): Promise<R<{ rates: Record<string, number>; offers: string[]; codes: Record<string, string> } | null>> {
  try {
    const { org } = await manager();
    if (!UUID.test(customerId)) return { ok: true, data: null };
    const { createServiceClient } = await import("@/lib/integrations/runtime");
    const { data } = await createServiceClient().from("cart_club_accounts").select("rates, offers").eq("organisation_id", org.id).eq("customer_id", customerId).maybeSingle().then((r) => r, () => ({ data: null }));
    if (!data) return { ok: true, data: null };
    const { readClubSettings } = await import("@/lib/club/server");
    return { ok: true, data: { rates: data.rates as Record<string, number>, offers: (data.offers as string[]) ?? [], codes: readClubSettings(org.settings).codes as unknown as Record<string, string> } };
  } catch (e) { return fail(e); }
}

export interface JobInvoiceInput {
  entryId: string | null; eventId: string | null; customerId: string; jobName: string; date: string; venue: string;
  lines: unknown; issueDate: string; dueDate: string; reference: string; send: boolean;
}

/**
 * Invoice a job straight from the calendar (e.g. booked over the phone, no quote): uses the job if there is one, or
 * adds it (marked done if the date has passed) and puts the calendar entry on it, then raises the invoice — and emails
 * it when asked.
 */
export async function createJobInvoice(i: JobInvoiceInput): Promise<R<{ id: string; number: string; sent: string | null }>> {
  try {
    const { supabase, org, user, profile } = await manager();
    if (!UUID.test(i.customerId)) throw new Error("Choose the customer.");
    if (!DATE.test(i.date)) throw new Error("Choose the job date.");
    if (!DATE.test(i.issueDate) || !DATE.test(i.dueDate)) throw new Error("Choose the invoice and due dates.");
    if (i.dueDate < i.issueDate) throw new Error("The due date can't be before the invoice date.");
    const lines = cleanLines(i.lines);
    const t = lineTotals(lines);
    if (t.total <= 0) throw new Error("The invoice total has to be more than zero.");
    const { data: cust } = await supabase.from("customers").select("id, name").eq("id", i.customerId).eq("organisation_id", org.id).maybeSingle();
    if (!cust) throw new Error("That customer isn't there any more.");
    const name = String(i.jobName ?? "").trim().slice(0, 200) || `${cust.name} — job`;

    // The job: the one given, the calendar entry's, or a new one
    let eventId: string | null = i.eventId && UUID.test(i.eventId) ? i.eventId : null;
    type EntryRow = { id: string; event_id: string | null };
    let entry: EntryRow | null = null;
    if (i.entryId && UUID.test(i.entryId)) {
      const { data } = await supabase.from("calendar_events").select("id, event_id").eq("id", i.entryId).eq("organisation_id", org.id).maybeSingle();
      entry = data as EntryRow | null;
      eventId = eventId ?? entry?.event_id ?? null;
    }
    if (eventId) {
      const { data: ev } = await supabase.from("events").select("id, customer_id").eq("id", eventId).eq("organisation_id", org.id).maybeSingle();
      if (!ev) throw new Error("That job isn't there any more.");
      if (ev.customer_id !== i.customerId) {
        // a calendar job with the wrong (or a placeholder) customer: move it to the customer being billed
        await supabase.from("events").update({ customer_id: i.customerId }).eq("id", eventId).eq("organisation_id", org.id);
      }
    } else {
      const done = i.date < todayISO(org.timezone);
      const { data: ev, error } = await supabase.from("events").insert({
        organisation_id: org.id, customer_id: i.customerId, name, event_date: i.date, venue: String(i.venue ?? "").trim().slice(0, 300) || null,
        status: done ? "completed" : "confirmed", created_by: user.id, internal_notes: `Added from the calendar to invoice (booked without a quote) by ${actorName(profile)}.`,
      }).select("id").single();
      if (error) throw new Error(`Couldn't add the job: ${error.message}`);
      eventId = ev.id as string;
      if (entry) await supabase.from("calendar_events").update({ event_id: eventId, customer_id: i.customerId }).eq("id", entry.id).eq("organisation_id", org.id);
    }

    const { data: inv, error } = await supabase.from("invoices").insert({
      organisation_id: org.id, customer_id: i.customerId, event_id: eventId, kind: "full", issue_date: i.issueDate, due_date: i.dueDate,
      subtotal: t.subtotal, tax_total: t.tax, total: t.total, status: "awaiting_payment", currency: org.currency, created_by: user.id,
      reference: String(i.reference ?? "").trim().slice(0, 200) || name, line_items: lines,
    }).select("id, number").single();
    if (error) throw new Error(`Couldn't create the invoice: ${error.message}`);
    await logActivity(supabase, {
      orgId: org.id, actorId: user.id, action: "invoice.created", entityType: "invoice", entityId: inv.id, eventId, customerId: i.customerId,
      summary: `${actorName(profile)} invoiced ${name} (${inv.number}, ${money(t.total, org.currency)}) from the calendar`, metadata: { total: t.total, due_date: i.dueDate },
    });

    let sent: string | null = null;
    if (i.send) {
      try {
        const { deliverInvoice, invoiceRecipients, invoiceWords, loadInvoiceForSend } = await import("@/lib/invoices/deliver");
        const { defaultInvoiceMessage, defaultInvoiceSubject } = await import("@/lib/email/invoice-email");
        const full = await loadInvoiceForSend(supabase, inv.id as string);
        if (!full) throw new Error("Couldn't load the invoice to send.");
        const to = await invoiceRecipients(supabase, full);
        const w = await invoiceWords(supabase, full, to);
        const r = await deliverInvoice(supabase, inv.id as string, {
          kind: "invoice", actor: actorName(profile),
          subject: defaultInvoiceSubject({ businessName: w.business, invoiceNumber: full.number, eventName: name }),
          message: defaultInvoiceMessage({ firstName: w.first_name === "there" ? null : w.first_name, eventName: name, eventDate: null, dueDate: full.due_date ? w.due_date : null, amountDue: w.amount, cardPayments: true, senderFirstName: (profile?.full_name ?? "").split(/\s+/)[0] || w.business }),
        });
        sent = r.ok ? (to.map((x) => x.email).join(", ") || "the customer") : null;
        if (!r.ok) throw new Error(r.error);
      } catch (e) {
        revalidatePath("/invoices"); revalidatePath("/calendar");
        return { ok: false, error: `Invoice ${inv.number} was created but not emailed: ${e instanceof Error ? e.message : String(e)}. Open it from Invoices to send.` };
      }
    }
    revalidatePath("/invoices"); revalidatePath("/calendar"); revalidatePath(`/events/${eventId}`); revalidatePath(`/clients/${i.customerId}`);
    return { ok: true, data: { id: inv.id as string, number: inv.number as string, sent } };
  } catch (e) { return fail(e); }
}

/** Invoices already on a job (for the calendar). */
export async function invoicesForJob(eventId: string): Promise<R<{ id: string; number: string; total: number; status: string }[]>> {
  try {
    const { supabase, org } = await requireOrg();
    if (!UUID.test(eventId)) return { ok: true, data: [] };
    const { data, error } = await supabase.from("invoices").select("id, number, total, status").eq("organisation_id", org.id).eq("event_id", eventId).neq("status", "void").order("issue_date");
    if (error) throw new Error(error.message);
    return { ok: true, data: ((data ?? []) as { id: string; number: string; total: number; status: string }[]).map((x) => ({ ...x, total: Number(x.total) })) };
  } catch (e) { return fail(e); }
}

/** A new customer from someone invited to the calendar entry (name, email, phone from the notes). */
export async function customerFromInvite(i: { name: string; company: string; email: string; phone: string }): Promise<R<{ id: string; name: string; existed: boolean }>> {
  try {
    const { supabase, org, user, profile } = await manager();
    const t = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
    const person = t(i.name, 160);
    const company = t(i.company, 160);
    const email = t(i.email, 254)?.toLowerCase() ?? null;
    if (!person && !company) throw new Error("Add their name or company.");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error("That email doesn't look right.");
    if (email) {
      const { data: same } = await supabase.from("customers").select("id, name").eq("organisation_id", org.id).ilike("email", email.replace(/[%_\\]/g, "\\$&")).limit(1).maybeSingle();
      if (same) return { ok: true, data: { id: same.id as string, name: same.name as string, existed: true } };
    }
    const name = company ?? person!;
    const { data, error } = await supabase.from("customers").insert({ organisation_id: org.id, kind: company ? "company" : "individual", name, company, email, phone: t(i.phone, 40), created_by: user.id }).select("id").single();
    if (error) throw new Error(error.message);
    if (person) {
      const parts = person.split(/\s+/);
      await supabase.from("contacts").insert({ organisation_id: org.id, customer_id: data.id, first_name: parts[0], last_name: parts.slice(1).join(" ") || null, email, phone: t(i.phone, 40), is_primary: true, created_by: user.id });
    }
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "customer.created", entityType: "customer", entityId: data.id as string, customerId: data.id as string, summary: `${actorName(profile)} added client ${name} (from a calendar invite)` });
    revalidatePath("/clients");
    return { ok: true, data: { id: data.id as string, name, existed: false } };
  } catch (e) { return fail(e); }
}
