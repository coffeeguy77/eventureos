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
  ["setup_time", "setup time", "time"], ["start_time", "start time", "time"], ["finish_time", "finish time", "time"], ["venue", "venue", "text"],
  ["serves", "serves", "num"],
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
    // The calendar entry's title and description come from the job — re-send it after any change
    await supabase.from("calendar_events").update({ sync_status: "pending" }).eq("organisation_id", org.id).eq("event_id", id).eq("kind", "event").neq("sync_status", "local");
    if (changes["event date"] || changes["setup time"] || changes["start time"] || changes["finish time"] || changes["venue"]) {
      // Keep linked calendar entries in step with the event
      const after = { ...before, ...patch } as { event_date: string | null; start_time: string | null; finish_time: string | null; venue: string | null; name: string };
      if (after.event_date) {
        const start = zonedTimeUTC(after.event_date, ((after as { setup_time?: string | null }).setup_time ?? after.start_time ?? "09:00").slice(0, 5), org.timezone);
        const endRaw = zonedTimeUTC(after.event_date, (after.finish_time ?? after.start_time ?? "17:00").slice(0, 5), org.timezone);
        const end = endRaw < start ? start : endRaw;
        const { data: moved, error: calErr } = await supabase.from("calendar_events")
          .update({ starts_at: start, ends_at: end, location: after.venue, title: after.name })
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

export type DeleteJobResult = { ok: false; error: string } | undefined;

/**
 * Delete a job outright — for tests and mistakes. Takes its quotes, unpaid invoices, the enquiry it came from,
 * its email conversations (EventureOS only — Gmail is untouched), crew, tasks, notes, files and calendar entries
 * (including on Google Calendar). Refused once any money has been received or staff have been paid: a real
 * cancelled job should be set to Cancelled, with the balance credited, so the history stays.
 */
export async function deleteJob(eventId: string, back?: string): Promise<DeleteJobResult> {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let done: string | null = null;
  try {
    const { supabase, org, user, profile, role } = await requireOrg();
    if (!["owner", "admin", "manager"].includes(role)) return { ok: false, error: "Only owners, admins and managers can delete jobs." };
    if (!UUID.test(eventId)) return { ok: false, error: "That job link isn't valid." };
    const { data: ev } = await supabase.from("events").select("id, number, name, customer_id").eq("organisation_id", org.id).eq("id", eventId).maybeSingle();
    if (!ev) return { ok: false, error: "That job no longer exists." };

    // Check first (the database checks again) so nothing is removed from Google unless the delete will go ahead
    const [{ data: quotes }, { data: enqs }, { data: crewPaid }] = await Promise.all([
      supabase.from("quotes").select("id").eq("organisation_id", org.id).eq("event_id", ev.id),
      supabase.from("enquiries").select("id").eq("organisation_id", org.id).eq("event_id", ev.id),
      supabase.from("event_crew").select("id").eq("organisation_id", org.id).eq("event_id", ev.id).not("payment_id", "is", null).limit(1),
    ]);
    const quoteIds = (quotes ?? []).map((q) => q.id as string);
    const enqIds = (enqs ?? []).map((q) => q.id as string);
    const invFilter = [`event_id.eq.${ev.id}`, quoteIds.length ? `quote_id.in.(${quoteIds.join(",")})` : null].filter(Boolean).join(",");
    const { data: invs } = await supabase.from("invoices").select("number, status, amount_paid, xero_invoice_id").eq("organisation_id", org.id).or(invFilter);
    const paidOn = (invs ?? []).filter((i) => Number(i.amount_paid) > 0).map((i) => i.number as string);
    if (paidOn.length) return { ok: false, error: `Money has been received on ${paidOn.join(", ")}, so this job can't be deleted. Set it to Cancelled and use “Credit the balance” on the invoice instead.` };
    const inXero = (invs ?? []).filter((i) => i.xero_invoice_id && i.status !== "void").map((i) => i.number as string);
    if (inXero.length) return { ok: false, error: `${inXero.join(", ")} ${inXero.length === 1 ? "is" : "are"} in Xero — void ${inXero.length === 1 ? "it" : "them"} first (that voids ${inXero.length === 1 ? "it" : "them"} in Xero too), then delete the job.` };
    if (crewPaid?.length) return { ok: false, error: "Staff have been paid for this job, so it can't be deleted. Set it to Cancelled instead." };

    // Files on the job, its quotes and its enquiry
    const docFilter = [`event_id.eq.${ev.id}`, quoteIds.length ? `quote_id.in.(${quoteIds.join(",")})` : null, enqIds.length ? `enquiry_id.in.(${enqIds.join(",")})` : null].filter(Boolean).join(",");
    const { data: docs } = await supabase.from("documents").select("storage_path").eq("organisation_id", org.id).or(docFilter);

    // Take its entries off Google Calendar (the booking itself and any to-do reminders)
    const { data: tasks } = await supabase.from("tasks").select("id").eq("organisation_id", org.id).eq("event_id", ev.id);
    const taskIds = (tasks ?? []).map((t) => t.id as string);
    const calSel = "id, external_event_id, conn:calendar_connections(external_calendar_id)";
    const [calA, calB] = await Promise.all([
      supabase.from("calendar_events").select(calSel).eq("organisation_id", org.id).eq("event_id", ev.id),
      taskIds.length ? supabase.from("calendar_events").select(calSel).eq("organisation_id", org.id).in("task_id", taskIds) : Promise.resolve({ data: [], error: null }),
    ]);
    type Cal = { id: string; external_event_id: string | null; conn: { external_calendar_id: string | null } | null };
    const cal = [...((calA.data ?? []) as unknown as Cal[]), ...((calB.error ? [] : calB.data ?? []) as unknown as Cal[])].filter((c) => c.external_event_id && c.conn?.external_calendar_id);
    let calNote = "";
    if (cal.length) {
      try {
        const { buildContext } = await import("@/lib/integrations/sync-runner");
        const { deleteGoogleEvent } = await import("@/lib/integrations/google-calendar");
        const ctx = await buildContext(supabase, "user", org.id, "google_calendar", user.id);
        for (const c of cal) await deleteGoogleEvent(ctx, c.conn!.external_calendar_id!, c.external_event_id!);
      } catch {
        calNote = " Some Google Calendar entries couldn't be removed — delete them in Google Calendar.";
      }
      if (cal.length) await supabase.from("calendar_events").delete().eq("organisation_id", org.id).in("id", cal.map((c) => c.id));
    }

    const { data, error } = await supabase.rpc("delete_job", { p_org: org.id, p_event_id: ev.id });
    if (error) return { ok: false, error: /delete_job/.test(error.message) ? "Run the 0047 database update in Supabase first." : error.message };
    const r = data as { quotes: number; invoices: number; enquiries: number; threads: number };
    const paths = (docs ?? []).map((d) => d.storage_path as string | null).filter((x): x is string => !!x && x.startsWith(`${org.id}/`));
    if (paths.length) await supabase.storage.from("documents").remove(paths).catch(() => undefined);

    const bits = [r.quotes && `${r.quotes} quote${r.quotes === 1 ? "" : "s"}`, r.invoices && `${r.invoices} unpaid invoice${r.invoices === 1 ? "" : "s"}`,
      r.enquiries && "the enquiry", r.threads && `${r.threads} email conversation${r.threads === 1 ? "" : "s"}`].filter(Boolean);
    await logActivity(supabase, {
      orgId: org.id, actorId: user.id, action: "event.deleted", entityType: "customer", entityId: ev.customer_id, customerId: ev.customer_id,
      summary: `${actorName(profile)} deleted job EV-${ev.number} “${ev.name}”${bits.length ? ` with ${bits.join(", ")}` : ""}.${calNote}`,
    });
    for (const p of ["/events", "/enquiries", "/quotes", "/invoices", "/dashboard", "/calendar", `/clients/${ev.customer_id}`]) revalidatePath(p);
    done = back === "enquiries" ? "/enquiries" : "/events";
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't delete the job." };
  }
  redirect(done);
}
