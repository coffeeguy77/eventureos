"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOrg, getMembers } from "@/lib/context";
import { actorName, logActivity } from "@/lib/activity";
import { EVENT_STATUS } from "@/lib/status";
import { fmtDate, fmtTime, zonedTimeUTC } from "@/lib/format";
import type { EventStatus } from "@/lib/types";

export type FormState = { error?: string } | undefined;

const str = (v: FormDataEntryValue | null) => String(v ?? "").trim() || null;
const num = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").replace(/[$,\s]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const list = (v: FormDataEntryValue | null) =>
  String(v ?? "").split(/\n|,/).map((x) => x.trim()).filter(Boolean);

export async function createEvent(_prev: FormState, form: FormData): Promise<FormState> {
  const { supabase, org, user, profile } = await requireOrg();
  const customerId = str(form.get("customer_id"));
  const name = str(form.get("name"));
  if (!customerId) return { error: "Choose a customer." };
  if (!name) return { error: "Give the event a name." };

  const { data: contact } = await supabase.from("contacts").select("id").eq("customer_id", customerId)
    .order("is_primary", { ascending: false }).limit(1).maybeSingle();

  const { data, error } = await supabase.from("events").insert({
    organisation_id: org.id,
    name,
    customer_id: customerId,
    primary_contact_id: contact?.id ?? null,
    event_type: str(form.get("event_type")),
    event_date: str(form.get("event_date")),
    start_time: str(form.get("start_time")),
    finish_time: str(form.get("finish_time")),
    venue: str(form.get("venue")),
    guest_count: num(form.get("guest_count")),
    budget: num(form.get("budget")),
    status: "planning",
    assigned_to: str(form.get("assigned_to")) ?? user.id,
    next_action: "Create a quote",
    created_by: user.id,
  }).select("id, number").single();
  if (error) return { error: `Couldn't create the event: ${error.message}` };
  if (contact) {
    await supabase.from("event_contacts").insert({ organisation_id: org.id, event_id: data.id, contact_id: contact.id, role: "Primary contact" });
  }
  await logActivity(supabase, {
    orgId: org.id, actorId: user.id, action: "event.created", entityType: "event", entityId: data.id, eventId: data.id,
    customerId, summary: `${actorName(profile)} created event EV-${data.number}`,
  });
  revalidatePath("/events");
  revalidatePath("/dashboard");
  redirect(`/events/${data.id}`);
}

export async function setEventStatus(id: string, status: EventStatus) {
  const { supabase, org, user, profile } = await requireOrg();
  const { data: before, error: e1 } = await supabase.from("events").select("status, number, customer_id, enquiry_id").eq("id", id).single();
  if (e1) throw new Error(`Event not found: ${e1.message}`);
  if (before.status === status) return;
  const patch: Record<string, unknown> = { status };
  if (status === "completed" || status === "cancelled") { patch.next_action = null; patch.next_action_due = null; }
  const { error } = await supabase.from("events").update(patch).eq("id", id).eq("organisation_id", org.id);
  if (error) throw new Error(`Couldn't change status: ${error.message}`);
  await logActivity(supabase, {
    orgId: org.id, actorId: user.id, action: "event.status_changed", entityType: "event", entityId: id, eventId: id,
    customerId: before.customer_id, enquiryId: before.enquiry_id,
    summary: `${actorName(profile)} marked EV-${before.number} ${EVENT_STATUS[status].label}`,
    changes: { status: [EVENT_STATUS[before.status as EventStatus].label, EVENT_STATUS[status].label] },
  });
  revalidatePath(`/events/${id}`);
  revalidatePath("/events");
  revalidatePath("/dashboard");
}

type Kind = "text" | "num" | "list" | "date" | "time" | "user";
const FIELDS: [col: string, label: string, kind: Kind][] = [
  ["name", "name", "text"], ["event_type", "event type", "text"], ["event_date", "event date", "date"],
  ["start_time", "start time", "time"], ["finish_time", "finish time", "time"], ["venue", "venue", "text"],
  ["address", "address", "text"], ["guest_count", "guest count", "num"], ["budget", "budget", "num"],
  ["assigned_to", "lead", "user"], ["requirements", "requirements", "text"], ["services", "services", "list"],
  ["equipment", "equipment", "list"], ["customer_notes", "customer notes", "text"], ["internal_notes", "internal notes", "text"],
  ["next_action", "next action", "text"],
];

export async function updateEventDetails(id: string, _prev: FormState, form: FormData): Promise<FormState> {
  const { supabase, org, user, profile } = await requireOrg();
  const { data: before, error: e1 } = await supabase.from("events").select("*").eq("id", id).eq("organisation_id", org.id).single();
  if (e1) return { error: `Event not found: ${e1.message}` };
  const members = await getMembers(org.id);
  const who = (uid: unknown) => (uid ? members.find((m) => m.id === uid)?.full_name ?? "Team member" : "Unassigned");

  const patch: Record<string, unknown> = {};
  const changes: Record<string, [unknown, unknown]> = {};
  for (const [col, label, kind] of FIELDS) {
    if (!form.has(col)) continue;
    const raw = form.get(col);
    let next: unknown = kind === "num" ? num(raw) : kind === "list" ? list(raw) : str(raw);
    let prev: unknown = before[col];
    if (kind === "num" && prev != null) prev = Number(prev);
    if (kind === "time") {
      next = next ? String(next).slice(0, 5) : null;
      prev = prev ? String(prev).slice(0, 5) : null;
    }
    const same = kind === "list" ? JSON.stringify(prev ?? []) === JSON.stringify(next) : String(prev ?? "") === String(next ?? "");
    if (same) continue;
    patch[col] = next;
    const show = (v: unknown) =>
      kind === "user" ? who(v) : kind === "date" ? (v ? fmtDate(String(v)) : null) : kind === "time" ? (v ? fmtTime(String(v)) : null)
        : kind === "list" ? ((v as string[] | null) ?? []).join(", ") || null
        : kind === "text" && ["requirements", "customer_notes", "internal_notes"].includes(col) ? (v ? "updated" : null) : v;
    changes[label] = [show(prev), show(next)];
  }
  if (form.has("next_action_due")) {
    const due = str(form.get("next_action_due"));
    const nextDue = due ? new Date(due).toISOString() : null;
    const prevDue = before.next_action_due ? new Date(before.next_action_due).toISOString() : null;
    if (nextDue !== prevDue) patch.next_action_due = nextDue;
  }
  if (Object.keys(patch).length === 0) return undefined;

  const { error } = await supabase.from("events").update(patch).eq("id", id).eq("organisation_id", org.id);
  if (error) return { error: `Couldn't save: ${error.message}` };

  if (Object.keys(changes).length) {
    const summary = Object.entries(changes)
      .map(([k, [a, b]]) => (a === "updated" || b === "updated" ? `updated ${k}` : `changed ${k} ${a ?? "—"} → ${b ?? "—"}`))
      .join(", ");
    await logActivity(supabase, {
      orgId: org.id, actorId: user.id, action: "event.updated", entityType: "event", entityId: id, eventId: id,
      customerId: before.customer_id, enquiryId: before.enquiry_id, summary: `${actorName(profile)} ${summary}`, changes,
    });
    if (changes["event date"] || changes["start time"] || changes["finish time"] || changes["venue"]) {
      // Keep linked calendar entries in step with the event
      const after = { ...before, ...patch } as { event_date: string | null; start_time: string | null; finish_time: string | null; venue: string | null; name: string };
      if (after.event_date) {
        const start = zonedTimeUTC(after.event_date, (after.start_time ?? "09:00").slice(0, 5), org.timezone);
        const endRaw = zonedTimeUTC(after.event_date, (after.finish_time ?? after.start_time ?? "17:00").slice(0, 5), org.timezone);
        const end = endRaw < start ? start : endRaw;
        const { data: moved, error: calErr } = await supabase.from("calendar_events")
          .update({ starts_at: start, ends_at: end, location: after.venue, title: after.name, sync_status: "local" })
          .eq("organisation_id", org.id).eq("event_id", id).eq("kind", "event").select("id");
        if (calErr) return { error: `Saved the event, but couldn't update the calendar: ${calErr.message}` };
        if (moved?.length) {
          await logActivity(supabase, {
            orgId: org.id, actorId: user.id, action: "calendar.updated", entityType: "calendar_event", entityId: moved[0].id,
            eventId: id, customerId: before.customer_id, summary: "Calendar event updated to match new event details",
          });
        }
      }
    }
    if (changes["event date"] || changes["start time"] || changes["finish time"] || changes["guest count"] || changes["venue"]) {
      await supabase.from("notifications").insert({
        organisation_id: org.id, type: "event.changed", title: `Event details changed`,
        body: `${before.name}: ${Object.keys(changes).join(", ")}`, link: `/events/${id}`, entity_type: "event", entity_id: id,
      });
    }
  }
  revalidatePath(`/events/${id}`);
  revalidatePath("/events");
  revalidatePath("/dashboard");
  return undefined;
}
