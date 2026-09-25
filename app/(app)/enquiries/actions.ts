"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOrg, getMembers } from "@/lib/context";
import { actorName, logActivity } from "@/lib/activity";
import { ENQUIRY_STATUS } from "@/lib/status";
import type { EnquirySource, EnquiryStatus } from "@/lib/types";

export type FormState = { error?: string } | undefined;

const num = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").replace(/[$,\s]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const str = (v: FormDataEntryValue | null) => String(v ?? "").trim() || null;
/** Escape LIKE wildcards so an email with "_" matches exactly (case-insensitively). */
const likeExact = (s: string) => s.replace(/[\\%_]/g, (c) => "\\" + c);

export async function createEnquiry(_prev: FormState, form: FormData): Promise<FormState> {
  const { supabase, org, user, profile } = await requireOrg();
  const title = str(form.get("title"));
  const contactName = str(form.get("contact_name"));
  const email = str(form.get("contact_email"))?.toLowerCase() ?? null;
  if (!title) return { error: "Give the enquiry a short title, e.g. “Wedding coffee cart”." };
  if (!contactName && !email) return { error: "Add at least a contact name or email." };

  // Match an existing customer by email so we don't create duplicates
  let customerId: string | null = null;
  let contactId: string | null = null;
  if (email) {
    const { data: match } = await supabase
      .from("contacts").select("id, customer_id")
      .eq("organisation_id", org.id).ilike("email", likeExact(email)).limit(1).maybeSingle();
    if (match) { customerId = match.customer_id; contactId = match.id; }
    else {
      const { data: cust } = await supabase.from("customers").select("id")
        .eq("organisation_id", org.id).ilike("email", likeExact(email)).limit(1).maybeSingle();
      if (cust) customerId = cust.id;
    }
  }

  const source = (str(form.get("source")) ?? "manual") as EnquirySource;
  const { data, error } = await supabase.from("enquiries").insert({
    organisation_id: org.id,
    title,
    customer_id: customerId,
    contact_id: contactId,
    contact_name: contactName,
    contact_email: email,
    contact_phone: str(form.get("contact_phone")),
    company: str(form.get("company")),
    event_type: str(form.get("event_type")),
    event_date: str(form.get("event_date")),
    guest_count: num(form.get("guest_count")),
    budget: num(form.get("budget")),
    venue: str(form.get("venue")),
    message: str(form.get("message")),
    source,
    status: "new",
    assigned_to: str(form.get("assigned_to")),
    received_at: new Date().toISOString(),
    created_by: user.id,
  }).select("id, number").single();
  if (error) return { error: `Couldn't save the enquiry: ${error.message}` };

  await logActivity(supabase, {
    orgId: org.id, actorId: user.id, action: "enquiry.created", entityType: "enquiry", entityId: data.id,
    enquiryId: data.id, customerId,
    summary: `${actorName(profile)} logged enquiry ENQ-${data.number}${customerId ? " (matched to existing customer)" : ""}`,
  });
  revalidatePath("/enquiries");
  revalidatePath("/dashboard");
  redirect(`/enquiries/${data.id}`);
}

export async function setEnquiryStatus(id: string, status: EnquiryStatus) {
  const { supabase, org, user, profile } = await requireOrg();
  const { data: before, error: e1 } = await supabase.from("enquiries").select("status, number, customer_id, event_id").eq("id", id).eq("organisation_id", org.id).single();
  if (e1) throw new Error(`Enquiry not found: ${e1.message}`);
  if (before.status === status) return;
  const { error } = await supabase.from("enquiries").update({ status }).eq("id", id).eq("organisation_id", org.id);
  if (error) throw new Error(`Couldn't change status: ${error.message}`);
  await logActivity(supabase, {
    orgId: org.id, actorId: user.id, action: "enquiry.status_changed", entityType: "enquiry", entityId: id,
    enquiryId: id, customerId: before.customer_id, eventId: before.event_id,
    summary: `${actorName(profile)} marked ENQ-${before.number} ${ENQUIRY_STATUS[status].label}`,
    changes: { status: [ENQUIRY_STATUS[before.status as EnquiryStatus].label, ENQUIRY_STATUS[status].label] },
  });
  revalidatePath(`/enquiries/${id}`);
  revalidatePath("/enquiries");
  revalidatePath("/dashboard");
}

export async function assignEnquiry(id: string, assignee: string | null) {
  const { supabase, org, user, profile } = await requireOrg();
  const members = await getMembers(org.id);
  if (assignee && !members.some((m) => m.id === assignee)) throw new Error("That person isn't an active member of your team.");
  const { data: before, error: e1 } = await supabase.from("enquiries").select("assigned_to, number, customer_id").eq("id", id).eq("organisation_id", org.id).single();
  if (e1) throw new Error(`Enquiry not found: ${e1.message}`);
  const { error } = await supabase.from("enquiries").update({ assigned_to: assignee }).eq("id", id).eq("organisation_id", org.id);
  if (error) throw new Error(`Couldn't assign: ${error.message}`);
  const name = (uid: string | null) => (uid ? members.find((m) => m.id === uid)?.full_name ?? "Team member" : "Unassigned");
  await logActivity(supabase, {
    orgId: org.id, actorId: user.id, action: "enquiry.assigned", entityType: "enquiry", entityId: id, enquiryId: id,
    customerId: before.customer_id, summary: `${actorName(profile)} assigned ENQ-${before.number} to ${name(assignee)}`,
    changes: { assigned_to: [name(before.assigned_to), name(assignee)] },
  });
  revalidatePath(`/enquiries/${id}`);
  revalidatePath("/enquiries");
}

const DETAIL_FIELDS = [
  ["title", "title", str], ["event_type", "event type", str], ["event_date", "event date", str],
  ["guest_count", "guest count", num], ["budget", "budget", num], ["venue", "venue", str],
  ["next_action", "next action", str], ["contact_phone", "phone", str],
] as const;

export async function updateEnquiryDetails(id: string, _prev: FormState, form: FormData): Promise<FormState> {
  const { supabase, org, user, profile } = await requireOrg();
  const { data: before, error: e1 } = await supabase.from("enquiries").select("*").eq("id", id).eq("organisation_id", org.id).single();
  if (e1) return { error: `Enquiry not found: ${e1.message}` };

  const patch: Record<string, unknown> = {};
  const changes: Record<string, [unknown, unknown]> = {};
  for (const [col, label, parse] of DETAIL_FIELDS) {
    if (!form.has(col)) continue;
    const next = parse(form.get(col));
    const prev = before[col] == null ? null : col === "guest_count" || col === "budget" ? Number(before[col]) : before[col];
    if (String(prev ?? "") !== String(next ?? "")) { patch[col] = next; changes[label] = [prev, next]; }
  }
  const due = form.get("next_action_due");
  if (form.has("next_action_due")) {
    const nextDue = due ? new Date(String(due)).toISOString() : null;
    if ((before.next_action_due ?? null) !== nextDue && !(before.next_action_due && nextDue && Date.parse(before.next_action_due) === Date.parse(nextDue))) {
      patch.next_action_due = nextDue;
    }
  }
  if (Object.keys(patch).length === 0) return undefined;

  const { error } = await supabase.from("enquiries").update(patch).eq("id", id).eq("organisation_id", org.id);
  if (error) return { error: `Couldn't save: ${error.message}` };
  if (Object.keys(changes).length) {
    const parts = Object.entries(changes).map(([k, [a, b]]) => `${k} ${a ?? "—"} → ${b ?? "—"}`);
    await logActivity(supabase, {
      orgId: org.id, actorId: user.id, action: "enquiry.updated", entityType: "enquiry", entityId: id, enquiryId: id,
      customerId: before.customer_id, eventId: before.event_id,
      summary: `${actorName(profile)} changed ${parts.join(", ")}`, changes,
    });
  }
  revalidatePath(`/enquiries/${id}`);
  revalidatePath("/enquiries");
  return undefined;
}

export async function convertToEvent(id: string, form: FormData) {
  const { supabase } = await requireOrg();
  const name = str(form.get("event_name"));
  const { data, error } = await supabase.rpc("convert_enquiry_to_event", { p_enquiry_id: id, p_event_name: name });
  if (error) throw new Error(`Couldn't convert the enquiry: ${error.message}`);
  revalidatePath("/enquiries");
  revalidatePath("/dashboard");
  redirect(`/events/${data}`);
}
