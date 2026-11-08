import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface AfterAccept { late: boolean; payUrl: string | null; phone: string | null }

/**
 * Everything after a quote is accepted (or a held booking approved), once the database has confirmed the job and
 * raised the invoice: send the calendar to Google now, and email the new invoice to the client when "Email the invoice
 * when a quote is accepted" is on.
 *
 * A customer acceptance after the quote's expiry, or inside the last 3 days before the event, is late: the job is
 * marked "availability to be confirmed" (calendar reads "TBC - …", the office is told), and the invoice email always
 * goes, telling them to call to confirm — accepting doesn't guarantee availability. Never throws.
 */
export async function afterQuoteAccepted(db: SupabaseClient, eventId: string, opts: { emailInvoice?: boolean; byCustomer?: boolean } = {}): Promise<AfterAccept> {
  const out: AfterAccept = { late: false, payUrl: null, phone: null };
  // How many staff the job needs, from the quote's staff lines (when nobody has set it on the job)
  try {
    const { data: j } = await db.from("events").select("crew_needed").eq("id", eventId).maybeSingle();
    if (j && j.crew_needed == null) {
      const { staffNeededForJob } = await import("@/lib/crew/staffing");
      const n = await staffNeededForJob(db, eventId);
      if (n != null) await db.from("events").update({ crew_needed: n }).eq("id", eventId).is("crew_needed", null);
    }
  } catch { /* the job page still lets the office set it */ }

  type Ev = { organisation_id: string; status: string; name: string; number: number; event_date: string | null; assigned_to: string | null; organisation: { settings: Record<string, unknown> | null; name: string; timezone: string | null; contact_phone: string | null } | null };
  let ev: Ev | null = null;
  try {
    const { data } = await db.from("events").select("organisation_id, status, name, number, event_date, assigned_to, organisation:organisations(settings, name, timezone, contact_phone)").eq("id", eventId).maybeSingle();
    ev = data as unknown as Ev | null;
  } catch { ev = null; }
  out.phone = ev?.organisation?.contact_phone ?? null;

  // Late acceptance by the customer → availability to be confirmed
  if (ev && opts.byCustomer) {
    try {
      const tz = ev.organisation?.timezone || "Australia/Sydney";
      const { todayISO } = await import("@/lib/format");
      const today = todayISO(tz);
      const { data: q } = await db.from("quotes").select("number, expiry_date").eq("event_id", eventId).eq("status", "accepted").order("created_at", { ascending: false }).limit(1).maybeSingle();
      const { isLateAcceptance } = await import("./late");
      out.late = isLateAcceptance(today, (q?.expiry_date as string | null) ?? null, ev.event_date);
      if (out.late) {
        await db.from("events").update({ availability_tbc: true, next_action: "Confirm availability — the quote was accepted late", next_action_due: new Date().toISOString() }).eq("id", eventId).then(() => null, () => null);
        await db.from("notifications").insert({
          organisation_id: ev.organisation_id, type: "quote.late", title: `Accepted late: ${ev.name}`.slice(0, 200),
          body: `Q-${q?.number ?? ""} was accepted ${q?.expiry_date && today > q.expiry_date ? "after it expired" : "less than 3 days before the event"} — confirm availability with the client.`.slice(0, 140),
          link: `/events/${eventId}`, entity_type: "event", entity_id: eventId,
        }).then(() => null, () => null);
      }
    } catch { /* the acceptance is recorded either way */ }
  }

  const { jobCalendarAfterAccept } = await import("@/lib/calendar/job-sync");
  await jobCalendarAfterAccept(db, eventId);

  try {
    if (!ev) return out;
    // The invoice the acceptance just raised
    const since = new Date(Date.now() - 15 * 60_000).toISOString();
    const { data: invs } = await db.from("invoices").select("id, number, status, created_by, quote_id, pay_token").eq("event_id", eventId).neq("status", "void").gte("created_at", since).is("created_by", null).not("quote_id", "is", null).order("created_at", { ascending: false }).limit(1);
    const inv = invs?.[0];
    if (!inv) return out;
    const { appBaseUrl } = await import("@/lib/integrations/registry");
    out.payUrl = `${appBaseUrl()}/pay/${inv.pay_token as string}`;
    const settings = (ev.organisation?.settings ?? {}) as Record<string, unknown>;
    const wanted = opts.emailInvoice !== false && (settings.invoice_auto_email === true || (out.late && opts.byCustomer));
    if (!wanted || ev.status !== "confirmed") return out;
    const { count } = await db.from("activity_logs").select("id", { count: "exact", head: true }).eq("entity_id", inv.id).eq("action", "invoice.emailed");
    if (count) return out;
    const { deliverInvoice, invoiceRecipients, invoiceWords, loadInvoiceForSend } = await import("@/lib/invoices/deliver");
    const { defaultInvoiceMessage, defaultInvoiceSubject } = await import("@/lib/email/invoice-email");
    const full = await loadInvoiceForSend(db, inv.id as string);
    if (!full) return out;
    const w = await invoiceWords(db, full, await invoiceRecipients(db, full));
    const { data: lead } = ev.assigned_to ? await db.from("users").select("full_name").eq("id", ev.assigned_to).maybeSingle() : { data: null };
    const { data: stripe } = await db.from("integrations").select("status").eq("organisation_id", ev.organisation_id).eq("provider", "stripe").maybeSingle();
    let message = defaultInvoiceMessage({ firstName: w.first_name === "there" ? null : w.first_name, eventName: full.event?.name ?? null, eventDate: full.event?.event_date ? w.event_date : null,
      dueDate: full.due_date ? w.due_date : null, amountDue: w.amount, cardPayments: stripe?.status === "connected", senderFirstName: (lead?.full_name as string | undefined)?.split(" ")[0] ?? w.business });
    if (out.late) message = `${lateNotice(w.business, out.phone)}\n\n${message}`;
    await deliverInvoice(db, inv.id as string, {
      kind: "invoice", actor: out.late ? "Automation (quote accepted late)" : "Automation (quote accepted)",
      subject: `${out.late ? "Please call to confirm — " : ""}${defaultInvoiceSubject({ businessName: w.business, invoiceNumber: full.number, eventName: full.event?.name })}`,
      message,
    });
  } catch { /* the office can still email it from the invoice */ }
  return out;
}

/** What a late acceptance tells the customer. */
export const lateNotice = (business: string, phone: string | null) =>
  `Thanks for accepting. Because this was accepted close to the event (or after the quote's expiry), your booking isn't confirmed yet — please call ${business}${phone ? ` on ${phone}` : ""} to confirm we're available. Accepting the quote doesn't guarantee availability.`;
