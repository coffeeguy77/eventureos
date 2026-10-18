import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Everything after a quote is accepted (or a held booking approved), once the database has confirmed the job and
 * raised the invoice: send the calendar to Google now, and — when "Email the invoice when a quote is accepted" is on —
 * email the new invoice to the client. Never throws: the acceptance itself has already been recorded.
 */
export async function afterQuoteAccepted(db: SupabaseClient, eventId: string, opts: { emailInvoice?: boolean } = {}) {
  // How many staff the job needs, from the quote's staff lines (when nobody has set it on the job)
  try {
    const { data: j } = await db.from("events").select("crew_needed").eq("id", eventId).maybeSingle();
    if (j && j.crew_needed == null) {
      const { staffNeededForJob } = await import("@/lib/crew/staffing");
      const n = await staffNeededForJob(db, eventId);
      if (n != null) await db.from("events").update({ crew_needed: n }).eq("id", eventId).is("crew_needed", null);
    }
  } catch { /* the job page still lets the office set it */ }
  const { jobCalendarAfterAccept } = await import("@/lib/calendar/job-sync");
  await jobCalendarAfterAccept(db, eventId);
  try {
    const { data: ev } = await db.from("events").select("organisation_id, status, assigned_to, organisation:organisations(settings, name)").eq("id", eventId).maybeSingle();
    const settings = ((ev?.organisation as unknown as { settings: Record<string, unknown> | null } | null)?.settings ?? {}) as Record<string, unknown>;
    if (opts.emailInvoice === false || !ev || ev.status !== "confirmed" || settings.invoice_auto_email !== true) return;
    // The invoice the acceptance just raised (not one already emailed)
    const since = new Date(Date.now() - 15 * 60_000).toISOString();
    const { data: invs } = await db.from("invoices").select("id, number, status, created_by, quote_id").eq("event_id", eventId).neq("status", "void").gte("created_at", since).is("created_by", null).not("quote_id", "is", null).order("created_at", { ascending: false }).limit(1);
    const inv = invs?.[0];
    if (!inv) return;
    const { count } = await db.from("activity_logs").select("id", { count: "exact", head: true }).eq("entity_id", inv.id).eq("action", "invoice.emailed");
    if (count) return;
    const { deliverInvoice, invoiceRecipients, invoiceWords, loadInvoiceForSend } = await import("@/lib/invoices/deliver");
    const { defaultInvoiceMessage, defaultInvoiceSubject } = await import("@/lib/email/invoice-email");
    const full = await loadInvoiceForSend(db, inv.id as string);
    if (!full) return;
    const w = await invoiceWords(db, full, await invoiceRecipients(db, full));
    const { data: lead } = ev.assigned_to ? await db.from("users").select("full_name").eq("id", ev.assigned_to).maybeSingle() : { data: null };
    const { data: stripe } = await db.from("integrations").select("status").eq("organisation_id", ev.organisation_id).eq("provider", "stripe").maybeSingle();
    await deliverInvoice(db, inv.id as string, {
      kind: "invoice", actor: "Automation (quote accepted)",
      subject: defaultInvoiceSubject({ businessName: w.business, invoiceNumber: full.number, eventName: full.event?.name }),
      message: defaultInvoiceMessage({ firstName: w.first_name === "there" ? null : w.first_name, eventName: full.event?.name ?? null, eventDate: full.event?.event_date ? w.event_date : null,
        dueDate: full.due_date ? w.due_date : null, amountDue: w.amount, cardPayments: stripe?.status === "connected", senderFirstName: (lead?.full_name as string | undefined)?.split(" ")[0] ?? w.business }),
    });
  } catch { /* the office can still email it from the invoice */ }
}
