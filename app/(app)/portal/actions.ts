"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/context";
import { actorName, logActivity } from "@/lib/activity";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type StaffActionState = { ok?: boolean; error?: string; message?: string } | undefined;

/** Ask a customer to upload a document for an event (shows in their portal under Documents). */
export async function requestDocument(_prev: StaffActionState, form: FormData): Promise<StaffActionState> {
  const eventId = String(form.get("event_id") ?? "");
  const name = String(form.get("name") ?? "").trim().replace(/\s+/g, " ");
  if (!UUID_RE.test(eventId)) return { error: "Choose the event this document is for." };
  if (name.length < 2 || name.length > 200) return { error: "Describe the document (2–200 characters), e.g. “Signed venue contract”." };

  const { supabase, org, user, profile } = await requireOrg();
  const { data: ev, error: evErr } = await supabase
    .from("events").select("id, name, customer_id, customer:customers(name)").eq("id", eventId).eq("organisation_id", org.id).maybeSingle();
  if (evErr) return { error: `Could not load the event: ${evErr.message}` };
  if (!ev) return { error: "That event wasn't found." };
  const customerName = (ev.customer as unknown as { name: string } | null)?.name ?? "the customer";

  const { data: doc, error } = await supabase
    .from("documents")
    .insert({
      organisation_id: org.id,
      name,
      customer_id: ev.customer_id,
      event_id: ev.id,
      visibility: "customer",
      requested_from_customer: true,
    })
    .select("id")
    .single();
  if (error) return { error: `Could not create the request: ${error.message}` };

  await logActivity(supabase, {
    orgId: org.id,
    actorId: user.id,
    action: "document.requested",
    entityType: "document",
    entityId: doc.id,
    eventId: ev.id,
    customerId: ev.customer_id,
    summary: `${actorName(profile)} requested “${name}” from ${customerName} via the portal`,
  });
  revalidatePath("/portal");
  revalidatePath(`/events/${ev.id}`);
  return { ok: true, message: `Requested “${name}” from ${customerName}. It now shows in their portal.` };
}

/** Withdraw an open document request (managers only — enforced by RLS on delete). */
export async function cancelDocumentRequest(form: FormData) {
  const id = String(form.get("id") ?? "");
  if (!UUID_RE.test(id)) throw new Error("That request isn't valid.");
  const { supabase, org, user, profile } = await requireOrg();
  const { data: doc } = await supabase
    .from("documents").select("id, name, event_id, customer_id").eq("id", id).eq("organisation_id", org.id)
    .eq("requested_from_customer", true).is("storage_path", null).maybeSingle();
  if (!doc) throw new Error("That request is no longer open.");
  const { error, count } = await supabase.from("documents").delete({ count: "exact" }).eq("id", id).eq("organisation_id", org.id);
  if (error) throw new Error(`Could not cancel the request: ${error.message}`);
  if (!count) throw new Error("Only owners, admins and managers can cancel document requests.");
  await logActivity(supabase, {
    orgId: org.id, actorId: user.id, action: "document.request_cancelled", entityType: "document", entityId: doc.id,
    eventId: doc.event_id, customerId: doc.customer_id, summary: `${actorName(profile)} cancelled the request for “${doc.name}”`,
  });
  revalidatePath("/portal");
  if (doc.event_id) revalidatePath(`/events/${doc.event_id}`);
}

/** Staff reply in a customer's portal thread for an event. Also marks the customer's messages as read. */
export async function replyToPortalMessage(_prev: StaffActionState, form: FormData): Promise<StaffActionState> {
  const eventId = String(form.get("event_id") ?? "");
  const customerId = String(form.get("customer_id") ?? "");
  const body = String(form.get("body") ?? "").trim();
  if (!UUID_RE.test(eventId) || !UUID_RE.test(customerId)) return { error: "This conversation isn't valid." };
  if (!body) return { error: "Write a reply first." };
  if (body.length > 5000) return { error: "Keep replies under 5,000 characters." };

  const { supabase, org, user, profile } = await requireOrg();
  const { data: ev } = await supabase
    .from("events").select("id, customer_id").eq("id", eventId).eq("organisation_id", org.id).eq("customer_id", customerId).maybeSingle();
  if (!ev) return { error: "That event wasn't found for this customer." };

  const { data: msg, error } = await supabase
    .from("portal_messages")
    .insert({ organisation_id: org.id, customer_id: customerId, event_id: eventId, author_type: "staff", author_id: user.id, body })
    .select("id")
    .single();
  if (error) return { error: `Your reply couldn't be sent: ${error.message}` };

  // Needs migration 0009_portal.sql (staff can't update customer rows directly under RLS). A failure here must not lose the reply.
  await supabase.rpc("staff_mark_portal_messages_read", { p_event_id: eventId, p_customer_id: customerId });

  await logActivity(supabase, {
    orgId: org.id, actorId: user.id, action: "portal.reply", entityType: "portal_message", entityId: msg.id,
    eventId, customerId, summary: `${actorName(profile)} replied in the customer portal`,
  });
  revalidatePath(`/events/${eventId}`);
  revalidatePath("/portal");
  return { ok: true };
}

export async function markPortalThreadRead(form: FormData) {
  const eventId = String(form.get("event_id") ?? "");
  const customerId = String(form.get("customer_id") ?? "");
  if (!UUID_RE.test(eventId) || !UUID_RE.test(customerId)) throw new Error("This conversation isn't valid.");
  const { supabase, org } = await requireOrg();
  const { data: ev } = await supabase.from("events").select("id").eq("id", eventId).eq("organisation_id", org.id).maybeSingle();
  if (!ev) throw new Error("That event wasn't found.");
  const { error } = await supabase.rpc("staff_mark_portal_messages_read", { p_event_id: eventId, p_customer_id: customerId });
  if (error) {
    throw new Error(/staff_mark_portal_messages_read/.test(error.message)
      ? "Marking portal messages as read needs database migration 0009_portal.sql to be applied."
      : `Could not mark messages as read: ${error.message}`);
  }
  revalidatePath(`/events/${eventId}`);
  revalidatePath("/portal");
}
