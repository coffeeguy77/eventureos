"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/context";
import { actorName, logActivity } from "@/lib/activity";
import { addDaysISO, todayISO, zonedTimeUTC } from "@/lib/format";
import { syncTaskReminder } from "@/lib/tasks/reminders";

export type TaskResult = { ok: true; message?: string } | { ok: false; error: string };
const UUID = /^[0-9a-f-]{36}$/i;
const PRIORITIES = ["low", "normal", "high", "urgent"] as const;

function refresh(link?: { event_id?: string | null; enquiry_id?: string | null; customer_id?: string | null }) {
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  revalidatePath("/calendar");
  if (link?.event_id) revalidatePath(`/events/${link.event_id}`);
  if (link?.enquiry_id) revalidatePath(`/enquiries/${link.enquiry_id}`);
  if (link?.customer_id) revalidatePath(`/clients/${link.customer_id}`);
}

/** Next working day (Mon–Fri) at 9am in the business's timezone */
function nextWorkingMorning(tz: string) {
  let d = addDaysISO(todayISO(tz), 1);
  while ([0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay())) d = addDaysISO(d, 1);
  return zonedTimeUTC(d, "09:00", tz);
}

export async function addTask(input: {
  title: string; notes?: string | null; dueIso?: string | null; assignee?: string | null; remind?: boolean; priority?: string;
  enquiryId?: string | null; eventId?: string | null; customerId?: string | null; source?: "manual" | "auto"; autoKey?: string | null;
}): Promise<TaskResult> {
  try {
    const title = String(input.title ?? "").trim().slice(0, 300);
    if (!title) return { ok: false, error: "What needs doing?" };
    const { supabase, org, user, profile } = await requireOrg();
    const due = input.dueIso ? new Date(input.dueIso) : null;
    if (due && Number.isNaN(due.getTime())) return { ok: false, error: "That due date isn't valid." };
    const priority = PRIORITIES.includes(input.priority as (typeof PRIORITIES)[number]) ? input.priority : "normal";
    const ids = (v?: string | null) => (v && UUID.test(v) ? v : null);
    const row: Record<string, unknown> = {
      organisation_id: org.id, title, description: String(input.notes ?? "").trim().slice(0, 4000) || null,
      due_at: due?.toISOString() ?? null, priority, assigned_to: ids(input.assignee) ?? user.id,
      enquiry_id: ids(input.enquiryId), event_id: ids(input.eventId), customer_id: ids(input.customerId), created_by: user.id,
    };
    if (input.source === "auto") Object.assign(row, { source: "auto", auto_key: String(input.autoKey ?? "").slice(0, 200) || null });
    let { data, error } = await supabase.from("tasks").insert(row).select("id").single();
    if (error && /source|auto_key/.test(error.message)) {
      // Before the database update: save it as an ordinary task
      delete row.source; delete row.auto_key;
      ({ data, error } = await supabase.from("tasks").insert(row).select("id").single());
    }
    if (error?.code === "23505") return { ok: true, message: "That's already on the to-do list." };
    if (error || !data) return { ok: false, error: `Couldn't add the task: ${error?.message}` };
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "task.created", entityType: "task", entityId: data.id,
      enquiryId: row.enquiry_id as string | null, eventId: row.event_id as string | null, customerId: row.customer_id as string | null,
      summary: `${actorName(profile)} added to-do “${title}”${due ? "" : " (no due date)"}` });
    const r = input.remind && due ? await syncTaskReminder(supabase, org.id, user.id, data.id, { remind: true }) : { calendar: false };
    refresh({ event_id: row.event_id as string | null, enquiry_id: row.enquiry_id as string | null, customer_id: row.customer_id as string | null });
    return { ok: true, message: r.message ?? (r.calendar ? "Added, with a reminder in the calendar." : "Added.") };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Couldn't add the task." }; }
}

/** Turn an automatic follow-up into a task with a calendar reminder (next working morning unless a time is given). */
export async function followUpToTask(input: { key: string; title: string; dueIso?: string | null; enquiryId?: string | null; eventId?: string | null; customerId?: string | null }): Promise<TaskResult> {
  const { org } = await requireOrg();
  return addTask({ ...input, source: "auto", autoKey: input.key, remind: true, dueIso: input.dueIso ?? nextWorkingMorning(org.timezone) });
}

async function loadTask(id: string) {
  const ctx = await requireOrg();
  if (!UUID.test(id)) throw new Error("That task link isn't valid.");
  const { data } = await ctx.supabase.from("tasks").select("id, title, status, due_at, event_id, enquiry_id, customer_id").eq("organisation_id", ctx.org.id).eq("id", id).maybeSingle();
  if (!data) throw new Error("That task couldn't be found.");
  return { ...ctx, task: data };
}

export async function setTaskStatus(id: string, done: boolean): Promise<TaskResult> {
  try {
    const { supabase, org, user, profile, task } = await loadTask(id);
    const { error } = await supabase.from("tasks").update({ status: done ? "done" : "open", completed_at: done ? new Date().toISOString() : null }).eq("id", id);
    if (error) return { ok: false, error: error.message };
    const r = await syncTaskReminder(supabase, org.id, user.id, id);
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: done ? "task.completed" : "task.reopened", entityType: "task", entityId: id,
      eventId: task.event_id, enquiryId: task.enquiry_id, customerId: task.customer_id, summary: `${actorName(profile)} ${done ? "completed" : "reopened"} “${task.title}”` });
    refresh(task);
    return { ok: true, message: r.message };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Couldn't update the task." }; }
}

/** Move the due time (keeps or adds the calendar reminder). `when`: "tomorrow" | "next_week" | an ISO time. */
export async function rescheduleTask(id: string, when: string, remind?: boolean): Promise<TaskResult> {
  try {
    const { supabase, org, user, profile, task } = await loadTask(id);
    const tz = org.timezone;
    const at = when === "tomorrow" ? zonedTimeUTC(addDaysISO(todayISO(tz), 1), "09:00", tz)
      : when === "next_week" ? zonedTimeUTC(addDaysISO(todayISO(tz), 7), "09:00", tz)
      : new Date(when).toISOString();
    if (Number.isNaN(Date.parse(at))) return { ok: false, error: "That date isn't valid." };
    const { error } = await supabase.from("tasks").update({ due_at: at, status: task.status === "done" ? "open" : task.status, completed_at: null }).eq("id", id);
    if (error) return { ok: false, error: error.message };
    const r = await syncTaskReminder(supabase, org.id, user.id, id, remind === undefined ? {} : { remind });
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "task.rescheduled", entityType: "task", entityId: id,
      eventId: task.event_id, enquiryId: task.enquiry_id, customerId: task.customer_id, summary: `${actorName(profile)} moved “${task.title}”` });
    refresh(task);
    return { ok: true, message: r.message };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Couldn't move the task." }; }
}

export async function setTaskReminder(id: string, on: boolean): Promise<TaskResult> {
  try {
    const { supabase, org, user, task } = await loadTask(id);
    if (on && !task.due_at) return { ok: false, error: "Give it a due date first." };
    const r = await syncTaskReminder(supabase, org.id, user.id, id, { remind: on });
    refresh(task);
    return r.message && !r.calendar && on ? { ok: false, error: r.message } : { ok: true, message: r.message };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Couldn't change the reminder." }; }
}

export async function deleteTask(id: string): Promise<TaskResult> {
  try {
    const { supabase, org, user, profile, task } = await loadTask(id);
    await supabase.from("tasks").update({ status: "done" }).eq("id", id); // removes the reminder first
    await syncTaskReminder(supabase, org.id, user.id, id);
    const { error } = await supabase.from("tasks").delete().eq("id", id).eq("organisation_id", org.id);
    if (error) return { ok: false, error: error.message };
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "task.deleted", entityType: "task", entityId: id,
      eventId: task.event_id, enquiryId: task.enquiry_id, customerId: task.customer_id, summary: `${actorName(profile)} deleted to-do “${task.title}”` });
    refresh(task);
    return { ok: true };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Couldn't delete the task." }; }
}
