import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SyncContext } from "@/lib/integrations/runtime";
import { ensureXeroContact, setXeroInvoiceContact } from "@/lib/integrations/xero-contacts";

/**
 * Move an invoice — or its whole job — to the right customer (e.g. from the person who booked to their company).
 * Invoices already in Xero are re-billed to the new customer's Xero contact first; one Xero refuses stays where it was.
 * With the whole job: the job, its quotes, invoices, enquiry, emails, tasks, notes, files and bookings move too, and the
 * person who booked becomes (or already is) one of the new customer's contacts.
 */
export async function moveToCustomer(db: SupabaseClient, orgId: string, p: { invoiceId: string; to: string; wholeJob: boolean; xero: () => Promise<SyncContext | null> }) {
  const { data: inv } = await db.from("invoices").select("id, number, customer_id, event_id, xero_invoice_id").eq("id", p.invoiceId).eq("organisation_id", orgId).maybeSingle();
  if (!inv) throw new Error("Invoice not found.");
  const from = inv.customer_id as string;
  if (from === p.to) throw new Error("It's already billed to that customer.");
  const { data: target } = await db.from("customers").select("*").eq("id", p.to).eq("organisation_id", orgId).maybeSingle();
  if (!target) throw new Error("Choose a customer.");
  const eventId = p.wholeJob ? (inv.event_id as string | null) : null;

  const { data: invRows } = eventId
    ? await db.from("invoices").select("id, number, xero_invoice_id").eq("organisation_id", orgId).eq("event_id", eventId).eq("customer_id", from)
    : { data: [inv] };
  const invoices = (invRows ?? []) as { id: string; number: string; xero_invoice_id: string | null }[];

  // Xero first: anything it refuses stays with the old customer here too, so the two never disagree
  const refused: string[] = [];
  const inXero = invoices.filter((i) => i.xero_invoice_id);
  if (inXero.length) {
    const ctx = await p.xero();
    if (!ctx) throw new Error("Some of these invoices are in Xero, and Xero isn't connected — reconnect it first.");
    let contact = target.xero_contact_id as string | null;
    if (!contact) {
      contact = await ensureXeroContact(ctx, { name: target.name, company: target.company, email: target.email, phone: target.phone, abn: target.abn ?? null });
      await db.from("customers").update({ xero_contact_id: contact }).eq("id", target.id).eq("organisation_id", orgId);
    }
    for (const i of inXero) {
      try { await setXeroInvoiceContact(ctx, i.xero_invoice_id!, contact); }
      catch (e) { refused.push(`${i.number}: ${e instanceof Error ? e.message : String(e)}`); }
    }
  }
  const refusedNumbers = new Set(refused.map((r) => r.split(":")[0]));
  const moving = invoices.filter((i) => !refusedNumbers.has(i.number)).map((i) => i.id);
  if (moving.length) {
    const { error } = await db.from("invoices").update({ customer_id: p.to }).in("id", moving).eq("organisation_id", orgId);
    if (error) throw new Error(`Couldn't move the invoice: ${error.message}`);
    await db.from("hire_bookings").update({ customer_id: p.to }).in("invoice_id", moving).eq("organisation_id", orgId).eq("customer_id", from);
    for (const t of ["collection_notes", "collection_emails"]) await db.from(t).update({ customer_id: p.to }).in("invoice_id", moving).eq("organisation_id", orgId).eq("customer_id", from);
  }

  let job = false;
  if (eventId && !refused.length) {
    const { data: ev } = await db.from("events").select("primary_contact_id").eq("id", eventId).eq("organisation_id", orgId).maybeSingle();
    // the person who booked: reuse the new customer's contact with the same email, or bring theirs across
    const oldContact = ev?.primary_contact_id as string | null;
    let contact = oldContact;
    if (oldContact) {
      const { data: c } = await db.from("contacts").select("id, customer_id, email").eq("id", oldContact).eq("organisation_id", orgId).maybeSingle();
      if (c && c.customer_id === from) {
        const { data: same } = c.email ? await db.from("contacts").select("id").eq("organisation_id", orgId).eq("customer_id", p.to).ilike("email", String(c.email)).limit(1) : { data: [] };
        if (same?.[0]) contact = same[0].id as string;
        else await db.from("contacts").update({ customer_id: p.to, is_primary: false }).eq("id", oldContact).eq("organisation_id", orgId);
      }
    }
    const { error } = await db.from("events").update({ customer_id: p.to, ...(contact && contact !== oldContact ? { primary_contact_id: contact } : {}) }).eq("id", eventId).eq("organisation_id", orgId);
    if (error) throw new Error(`The invoice moved, but the job didn't: ${error.message}`);
    if (contact && oldContact && contact !== oldContact) {
      await db.from("event_contacts").update({ contact_id: contact }).eq("event_id", eventId).eq("contact_id", oldContact).eq("organisation_id", orgId);
      await db.from("enquiries").update({ contact_id: contact }).eq("event_id", eventId).eq("contact_id", oldContact).eq("organisation_id", orgId);
    }
    for (const t of ["quotes", "enquiries", "email_threads", "tasks", "notes", "documents", "calendar_events", "hire_bookings"]) {
      await db.from(t).update({ customer_id: p.to }).eq("event_id", eventId).eq("organisation_id", orgId).eq("customer_id", from);
    }
    job = true;
  }
  return { moved: invoices.filter((i) => moving.includes(i.id)).map((i) => i.number), refused, job, toName: target.name as string, from };
}
