import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appBaseUrl } from "@/lib/integrations/registry";
import { icsFor, isFree, KIND_LABEL, readApptSettings, type ApptKind, type Busy } from "./core";

/**
 * Appointments: who's free, finding or starting the client in the CRM (client, contact, enquiry → their portal),
 * saving the meeting (on the calendar and Google Calendar), and telling the client.
 */
export interface ApptOrg { id: string; name: string; slug: string; timezone: string; settings: unknown; brand_colour?: string | null; logo_url?: string | null; contact_email?: string | null; contact_phone?: string | null }
export const ACTIVE = ["pending", "confirmed", "reschedule_requested"];

export async function loadOrg(db: SupabaseClient, idOrSlug: { id?: string; slug?: string }): Promise<ApptOrg | null> {
  let q = db.from("organisations").select("id, name, slug, timezone, settings, brand_colour, logo_url, contact_email, contact_phone");
  q = idOrSlug.id ? q.eq("id", idOrSlug.id) : q.eq("slug", String(idOrSlug.slug ?? ""));
  const { data } = await q.maybeSingle();
  return (data as ApptOrg | null) ?? null;
}

/** Everything that makes a time unavailable: other appointments (and times clients have asked for) and calendar entries. */
export async function busyBetween(db: SupabaseClient, orgId: string, fromIso: string, toIso: string, exceptAppointment?: string): Promise<Busy[]> {
  const [{ data: ap }, { data: ce }] = await Promise.all([
    db.from("appointments").select("id, starts_at, ends_at, proposed_starts_at, proposed_ends_at").eq("organisation_id", orgId).in("status", ACTIVE).lt("starts_at", toIso).gt("ends_at", fromIso),
    db.from("calendar_events").select("starts_at, ends_at, all_day, kind, appointment_id").eq("organisation_id", orgId).lt("starts_at", toIso).gt("ends_at", fromIso).neq("kind", "task").limit(3000),
  ]);
  const out: Busy[] = [];
  for (const a of (ap ?? []) as { id: string; starts_at: string; ends_at: string; proposed_starts_at: string | null; proposed_ends_at: string | null }[]) {
    if (a.id === exceptAppointment) continue;
    out.push({ start: Date.parse(a.starts_at), end: Date.parse(a.ends_at) });
    if (a.proposed_starts_at && a.proposed_ends_at) out.push({ start: Date.parse(a.proposed_starts_at), end: Date.parse(a.proposed_ends_at) });
  }
  for (const c of (ce ?? []) as { starts_at: string; ends_at: string; all_day: boolean; kind: string; appointment_id?: string | null }[]) {
    if (c.appointment_id) continue; // the appointment itself is counted above
    if (c.all_day && c.kind !== "hold") continue; // all-day notes (birthdays, events elsewhere) don't block meetings
    out.push({ start: Date.parse(c.starts_at), end: Date.parse(c.ends_at) });
  }
  return out;
}

export interface ClientIn { firstName: string; lastName: string; email: string; phone: string; company: string }

/**
 * Find the client by their email (on a contact, or the client itself); otherwise start them in the CRM: a client, their
 * contact (which is what lets them sign in to the portal with that email) and an enquiry so the lead is in the funnel.
 */
export async function ensureClient(db: SupabaseClient, orgId: string, c: ClientIn, o: { topic: string; source: "website" | "manual"; by: string | null; customerId?: string | null; contactId?: string | null; enquiryId?: string | null }): Promise<{ customerId: string; contactId: string; enquiryId: string | null; isNew: boolean }> {
  const email = c.email.trim().toLowerCase();
  const full = [c.firstName, c.lastName].map((x) => x.trim()).filter(Boolean).join(" ");
  let customerId = o.customerId ?? null, contactId: string | null = null, isNew = false;
  if (!customerId) {
    const { data: ct } = await db.from("contacts").select("id, customer_id").eq("organisation_id", orgId).ilike("email", email).limit(1).maybeSingle();
    if (ct) { customerId = ct.customer_id as string; contactId = ct.id as string; }
  }
  if (!customerId) {
    const { data: cu } = await db.from("customers").select("id").eq("organisation_id", orgId).ilike("email", email).limit(1).maybeSingle();
    if (cu) customerId = cu.id as string;
  }
  if (!customerId) {
    const company = c.company.trim();
    const { data: made, error } = await db.from("customers").insert({ organisation_id: orgId, kind: company ? "company" : "individual", name: (company || full || email).slice(0, 200), company: company || null, email, phone: c.phone.trim() || null, source: o.source === "website" ? "website" : "manual", created_by: o.by }).select("id").single();
    if (error) throw new Error(`Couldn't add the client: ${error.message}`);
    customerId = made.id as string; isNew = true;
  }
  if (!contactId && o.contactId && o.customerId) {
    // the office picked a contact who had no email yet — give them this one
    const { data: ct } = await db.from("contacts").select("id, email").eq("id", o.contactId).eq("customer_id", customerId).maybeSingle();
    if (ct && !ct.email) { await db.from("contacts").update({ email, phone: c.phone.trim() || undefined }).eq("id", ct.id); contactId = ct.id as string; }
  }
  if (!contactId) {
    const { data: ct } = await db.from("contacts").select("id").eq("organisation_id", orgId).eq("customer_id", customerId).ilike("email", email).limit(1).maybeSingle();
    if (ct) contactId = ct.id as string;
    else {
      const { count } = await db.from("contacts").select("id", { count: "exact", head: true }).eq("customer_id", customerId);
      const { data: made, error } = await db.from("contacts").insert({ organisation_id: orgId, customer_id: customerId, first_name: (c.firstName.trim() || email.split("@")[0]).slice(0, 80), last_name: c.lastName.trim() || null, email, phone: c.phone.trim() || null, is_primary: !count, created_by: o.by }).select("id").single();
      if (error) throw new Error(`Couldn't add the contact: ${error.message}`);
      contactId = made.id as string;
    }
  } else if (c.phone.trim()) await db.from("contacts").update({ phone: c.phone.trim() }).eq("id", contactId).is("phone", null);
  let enquiryId: string | null = null;
  if (o.enquiryId) {
    // booked from an enquiry: that enquiry is the lead — link the client to it rather than starting another
    await db.from("enquiries").update({ customer_id: customerId, contact_id: contactId }).eq("id", o.enquiryId).eq("organisation_id", orgId).is("customer_id", null);
    enquiryId = o.enquiryId;
  } else if (isNew) {
    const { data: enq } = await db.from("enquiries").insert({
      organisation_id: orgId, customer_id: customerId, contact_id: contactId, title: `Meeting: ${o.topic || full || email}`.slice(0, 200),
      contact_name: full || null, contact_email: email, contact_phone: c.phone.trim() || null, company: c.company.trim() || null,
      message: o.topic || null, source: o.source === "website" ? "website" : "manual", status: "contacted", created_by: o.by,
    }).select("id").single();
    enquiryId = (enq?.id as string | undefined) ?? null;
  }
  return { customerId: customerId!, contactId: contactId!, enquiryId, isNew };
}

const t12 = (iso: string, tz: string) => new Date(iso).toLocaleString("en-AU", { timeZone: tz, weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });
export const whenText = (startIso: string, endIso: string, tz: string) => `${t12(startIso, tz)} – ${new Date(endIso).toLocaleTimeString("en-AU", { timeZone: tz, hour: "numeric", minute: "2-digit" })}`;

/** Put the appointment on the business's calendar (and push to Google Calendar when it's connected). */
export async function syncCalendar(db: SupabaseClient, org: ApptOrg, apptId: string) {
  const { data: a } = await db.from("appointments").select("id, title, starts_at, ends_at, status, kind, location, meeting_url, client_name, calendar_event_id").eq("id", apptId).single();
  if (!a) return;
  const cancelled = ["cancelled", "declined"].includes(a.status as string);
  const title = `${a.status === "pending" ? "(Waiting) " : ""}${a.title}${a.client_name ? ` — ${a.client_name}` : ""}`.slice(0, 200);
  const where = (a.kind === "in_person" ? a.location : a.meeting_url) as string | null;
  let calId = a.calendar_event_id as string | null;
  if (cancelled) {
    if (calId) {
      const { data: ce } = await db.from("calendar_events").select("id, external_event_id, calendar_connection_id, connection:calendar_connections(external_calendar_id)").eq("id", calId).maybeSingle();
      const ext = (ce as unknown as { external_event_id: string | null; connection: { external_calendar_id: string | null } | null } | null);
      if (ext?.external_event_id && ext.connection?.external_calendar_id) {
        try { const { buildContext } = await import("@/lib/integrations/sync-runner"); const { deleteGoogleEvent } = await import("@/lib/integrations/google-calendar"); await deleteGoogleEvent(await buildContext(db, "service", org.id, "google_calendar", null), ext.connection.external_calendar_id, ext.external_event_id); } catch { /* removed here anyway */ }
      }
      await db.from("calendar_events").delete().eq("id", calId);
      await db.from("appointments").update({ calendar_event_id: null }).eq("id", apptId);
    }
    return;
  }
  const fields = { title, starts_at: a.starts_at, ends_at: a.ends_at, all_day: false, location: where, kind: "meeting" };
  if (calId) await db.from("calendar_events").update({ ...fields, sync_status: "pending", updated_at: new Date().toISOString() }).eq("id", calId);
  else {
    const { data: conn } = await db.from("calendar_connections").select("id, provider, sync_enabled").eq("organisation_id", org.id).order("is_default", { ascending: false }).order("created_at").limit(1).maybeSingle();
    if (!conn) return;
    const { data: ce, error } = await db.from("calendar_events").insert({ organisation_id: org.id, calendar_connection_id: conn.id, appointment_id: apptId, ...fields, sync_status: conn.provider === "google" && conn.sync_enabled ? "pending" : "local" }).select("id").single();
    if (error || !ce) return;
    calId = ce.id as string;
    await db.from("appointments").update({ calendar_event_id: calId }).eq("id", apptId);
  }
  try {
    const { buildContext } = await import("@/lib/integrations/sync-runner");
    const { pushCalendarRowsNow } = await import("@/lib/integrations/google-calendar");
    await pushCalendarRowsNow(await buildContext(db, "service", org.id, "google_calendar", null), [calId!]);
  } catch { /* Google Calendar not connected, or the next sync takes it */ }
}

export type Notice = "booked" | "requested" | "confirmed" | "moved" | "reschedule_declined" | "cancelled" | "proposed";

/** Tell the client: with the details, a button (manage the meeting), the portal link, and a calendar file. */
export async function emailClient(db: SupabaseClient, org: ApptOrg, apptId: string, kind: Notice): Promise<string | null> {
  const { emailConfigured, sendEmail } = await import("@/lib/email/send");
  if (!emailConfigured()) return "email isn't set up";
  const { data: a } = await db.from("appointments").select("id, title, kind, starts_at, ends_at, status, location, meeting_url, client_name, client_email, token, proposed_starts_at, proposed_ends_at").eq("id", apptId).single();
  if (!a?.client_email) return "no client email";
  const { appointmentEmail } = await import("@/lib/email/templates");
  const first = String(a.client_name ?? "").split(" ")[0] || "there";
  const when = whenText(a.starts_at as string, a.ends_at as string, org.timezone);
  const how = a.kind === "in_person" ? `In person${a.location ? ` at ${a.location}` : ""}` : a.kind === "phone" ? "Phone call — we'll call you" : `Video call${a.meeting_url ? `: ${a.meeting_url}` : " — we'll send the link"}`;
  const manage = `${appBaseUrl()}/meet/${org.slug}/a/${a.token}`;
  const portal = `${appBaseUrl()}/p/${org.slug}/login`;
  const copy: Record<Notice, { subject: string; heading: string; intro: string }> = {
    booked: { subject: `Booked: ${a.title} — ${when}`, heading: "You're booked in", intro: `Hi ${first}, thanks for booking a time with ${org.name}.` },
    requested: { subject: `Request received: ${a.title}`, heading: "Thanks — we'll confirm shortly", intro: `Hi ${first}, we've got your request for a meeting with ${org.name}. We'll confirm the time soon.` },
    confirmed: { subject: `Confirmed: ${a.title} — ${when}`, heading: "Your meeting is confirmed", intro: `Hi ${first}, ${org.name} has confirmed your meeting.` },
    moved: { subject: `New time: ${a.title} — ${when}`, heading: "Your meeting has a new time", intro: `Hi ${first}, your meeting with ${org.name} has moved.` },
    reschedule_declined: { subject: `${a.title} — staying at ${when}`, heading: "We can't make that new time", intro: `Hi ${first}, sorry — the new time you suggested doesn't suit, so your meeting stays as it was. You can suggest another time below.` },
    cancelled: { subject: `Cancelled: ${a.title}`, heading: "Your meeting is cancelled", intro: `Hi ${first}, your meeting with ${org.name} on ${when} has been cancelled. You're welcome to book another time.` },
    proposed: { subject: `Can you make it? ${a.title} — ${when}`, heading: `${org.name} would like to meet`, intro: `Hi ${first}, ${org.name} has booked a time to meet. Please confirm it works — or suggest another time.` },
  };
  const c = copy[kind];
  const m = appointmentEmail({
    businessName: org.name, heading: c.heading, intro: c.intro, details: kind === "cancelled" ? [] : [`When: ${when} (${org.timezone.replace("_", " ")} time)`, `How: ${how}`],
    button: kind === "cancelled" ? { label: "Book another time", url: `${appBaseUrl()}/meet/${org.slug}` } : { label: kind === "proposed" ? "Confirm or suggest another time" : "Change or cancel", url: manage },
    extra: kind === "cancelled" ? null : `Your client portal — your quotes, invoices and support tickets, all in one place: ${portal}`,
    brand: org.brand_colour, logoUrl: org.logo_url,
  });
  const ics = icsFor({ id: a.id as string, title: `${a.title} — ${org.name}`, start: Date.parse(a.starts_at as string), end: Date.parse(a.ends_at as string), location: (a.kind === "in_person" ? a.location : a.meeting_url) as string | null, description: `${how}\nManage: ${manage}`, organiser: org.name, status: kind === "cancelled" ? "CANCELLED" : a.status === "pending" || kind === "requested" || kind === "proposed" ? "TENTATIVE" : "CONFIRMED" });
  try {
    await sendEmail({ to: a.client_email as string, subject: c.subject, ...m, fromName: org.name, replyTo: org.contact_email ?? null, attachments: [{ filename: "meeting.ics", content: Buffer.from(ics).toString("base64") }] });
    return null;
  } catch (e) { return e instanceof Error ? e.message : String(e); }
}

/** Tell the office (bell). */
export async function tellOffice(db: SupabaseClient, orgId: string, apptId: string, title: string, body?: string) {
  await db.from("notifications").insert({ organisation_id: orgId, type: "appointment", title: title.slice(0, 200), body: body?.slice(0, 500) ?? null, link: `/calendar/appointments?open=${apptId}`, entity_type: "appointment", entity_id: apptId });
}

export interface NewAppt {
  title: string; kind: ApptKind; startIso: string; endIso: string; notes?: string | null; topic?: string | null;
  client: ClientIn; customerId?: string | null; contactId?: string | null; enquiryId?: string | null; assignedTo?: string | null; source: "office" | "website"; status: "pending" | "confirmed"; by: string | null;
  location?: string | null; meetingUrl?: string | null; ignoreHours?: boolean;
}

/** Save an appointment (after checking the time is free), start the client in the CRM if they're new, and put it on the calendar. */
export async function createAppointment(db: SupabaseClient, org: ApptOrg, n: NewAppt): Promise<{ id: string; token: string; isNewClient: boolean; customerId: string }> {
  const s = readApptSettings(org.settings);
  const start = Date.parse(n.startIso), end = Date.parse(n.endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error("Check the time.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(n.client.email.trim())) throw new Error("Enter a valid email address.");
  const busy = await busyBetween(db, org.id, new Date(start - 86_400_000).toISOString(), new Date(end + 86_400_000).toISOString());
  const clash = isFree(s, { tz: org.timezone, now: Date.now(), start, end, busy, ignoreHours: n.ignoreHours });
  if (clash) throw new Error(clash);
  const c = await ensureClient(db, org.id, n.client, { topic: n.topic ?? n.title, source: n.source === "website" ? "website" : "manual", by: n.by, customerId: n.customerId, contactId: n.contactId, enquiryId: n.enquiryId });
  const name = [n.client.firstName, n.client.lastName].map((x) => x.trim()).filter(Boolean).join(" ");
  const { data, error } = await db.from("appointments").insert({
    organisation_id: org.id, customer_id: c.customerId, contact_id: c.contactId, enquiry_id: n.enquiryId ?? c.enquiryId, title: n.title.trim().slice(0, 200) || "Meeting",
    kind: n.kind, location: n.kind === "in_person" ? (n.location ?? s.location) || null : null, meeting_url: n.kind === "video" ? (n.meetingUrl ?? s.meeting_url) || null : null,
    starts_at: new Date(start).toISOString(), ends_at: new Date(end).toISOString(), status: n.status,
    client_name: name || null, client_email: n.client.email.trim().toLowerCase(), client_phone: n.client.phone.trim() || null, client_company: n.client.company.trim() || null,
    client_note: n.topic?.trim().slice(0, 2000) || null, notes: n.notes?.trim().slice(0, 4000) || null, source: n.source, assigned_to: n.assignedTo ?? null, created_by: n.by,
  }).select("id, token").single();
  if (error) throw new Error(/appointments/.test(error.message) ? "Run the latest database update (0091) first." : error.message);
  await syncCalendar(db, org, data.id as string);
  await db.from("activity_logs").insert({ organisation_id: org.id, actor_type: n.by ? "user" : "system", actor_id: n.by, actor_label: n.by ? null : "Website booking", action: "appointment.booked", entity_type: "customer", entity_id: c.customerId, enquiry_id: n.enquiryId ?? c.enquiryId, summary: `${n.source === "website" ? "Booked online" : "Meeting booked"}: ${n.title} — ${whenText(new Date(start).toISOString(), new Date(end).toISOString(), org.timezone)}${name ? ` with ${name}` : ""}` });
  return { id: data.id as string, token: data.token as string, isNewClient: c.isNew, customerId: c.customerId };
}

export { KIND_LABEL };
