"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/context";
import { actorName, logActivity } from "@/lib/activity";

type Link = { eventId?: string | null; enquiryId?: string | null; customerId?: string | null };

function pathFor(l: Link) {
  if (l.eventId) return `/events/${l.eventId}`;
  if (l.enquiryId) return `/enquiries/${l.enquiryId}`;
  if (l.customerId) return `/clients/${l.customerId}`;
  return "/dashboard";
}

export async function addNote(link: Link, form: FormData) {
  const body = String(form.get("body") ?? "").trim();
  if (!body) return;
  const { supabase, org, user, profile } = await requireOrg();
  const { error } = await supabase.from("notes").insert({
    organisation_id: org.id,
    body,
    event_id: link.eventId ?? null,
    enquiry_id: link.enquiryId ?? null,
    customer_id: link.customerId ?? null,
    created_by: user.id,
  });
  if (error) throw new Error(`Could not save note: ${error.message}`);
  await logActivity(supabase, {
    orgId: org.id, actorId: user.id, action: "note.added", entityType: "note",
    summary: `${actorName(profile)} added a note`, eventId: link.eventId, enquiryId: link.enquiryId, customerId: link.customerId,
  });
  revalidatePath(pathFor(link));
}

export async function createTask(link: Link, form: FormData) {
  const title = String(form.get("title") ?? "").trim();
  if (!title) return;
  const due = String(form.get("due") ?? "");
  const assignee = String(form.get("assigned_to") ?? "") || null;
  const { supabase, org, user, profile } = await requireOrg();
  const { error } = await supabase.from("tasks").insert({
    organisation_id: org.id,
    title,
    due_at: due ? new Date(due).toISOString() : null,
    assigned_to: assignee ?? user.id,
    event_id: link.eventId ?? null,
    enquiry_id: link.enquiryId ?? null,
    customer_id: link.customerId ?? null,
    created_by: user.id,
  });
  if (error) throw new Error(`Could not create task: ${error.message}`);
  await logActivity(supabase, {
    orgId: org.id, actorId: user.id, action: "task.created", entityType: "task",
    summary: `${actorName(profile)} created task “${title}”`, eventId: link.eventId, enquiryId: link.enquiryId, customerId: link.customerId,
  });
  revalidatePath(pathFor(link));
  revalidatePath("/dashboard");
}

export async function setTaskDone(taskId: string, done: boolean) {
  const { supabase, org, user, profile } = await requireOrg();
  const { data, error } = await supabase
    .from("tasks")
    .update({ status: done ? "done" : "open", completed_at: done ? new Date().toISOString() : null })
    .eq("id", taskId)
    .eq("organisation_id", org.id)
    .select("title, event_id, enquiry_id, customer_id")
    .single();
  if (error) throw new Error(`Could not update task: ${error.message}`);
  await logActivity(supabase, {
    orgId: org.id, actorId: user.id, action: done ? "task.completed" : "task.reopened", entityType: "task", entityId: taskId,
    summary: `${actorName(profile)} ${done ? "completed" : "reopened"} task “${data.title}”`,
    eventId: data.event_id, enquiryId: data.enquiry_id, customerId: data.customer_id,
  });
  revalidatePath("/dashboard");
  revalidatePath(pathFor({ eventId: data.event_id, enquiryId: data.enquiry_id, customerId: data.customer_id }));
}
