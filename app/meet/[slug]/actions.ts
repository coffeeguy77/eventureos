"use server";

import { createServiceClient } from "@/lib/integrations/runtime";
import { freeSlots, readApptSettings, zonedMs, type ApptKind, type DaySlots } from "@/lib/appointments/core";
import { busyBetween, createAppointment, emailClient, loadOrg, syncCalendar, tellOffice, whenText } from "@/lib/appointments/server";

/** The public booking page and the client's private "manage my meeting" link. */
const todayIn = (tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const hits = new Map<string, number[]>();
const slow = (key: string, max = 8) => { const now = Date.now(); const list = (hits.get(key) ?? []).filter((t) => now - t < 3_600_000); list.push(now); hits.set(key, list); return list.length > max; };

export async function freeTimes(slug: string, duration: number, exceptToken?: string | null): Promise<{ ok: true; days: DaySlots[] } | { ok: false; error: string }> {
  const db = createServiceClient();
  const org = await loadOrg(db, { slug });
  if (!org) return { ok: false, error: "This booking page isn't available." };
  const s = readApptSettings(org.settings);
  if (!s.enabled && !exceptToken) return { ok: false, error: "Online booking is switched off right now." };
  const d = s.durations.includes(duration) ? duration : s.durations[0];
  const today = todayIn(org.timezone);
  let except: string | undefined;
  if (exceptToken) { const { data } = await db.from("appointments").select("id").eq("token", exceptToken).eq("organisation_id", org.id).maybeSingle(); except = (data?.id as string | undefined) ?? undefined; }
  const busy = await busyBetween(db, org.id, new Date().toISOString(), new Date(Date.now() + (s.horizon_days + 2) * 86_400_000).toISOString(), except);
  return { ok: true, days: freeSlots(s, { today, tz: org.timezone, now: Date.now(), duration: d, busy }) };
}

export interface BookInput { kind: ApptKind; duration: number; date: string; time: string; firstName: string; lastName: string; email: string; phone: string; company: string; topic: string; website?: string }

/** A client books from the website: they're added to the CRM if new (client, contact, enquiry) and their portal opens. */
export async function bookMeeting(slug: string, i: BookInput): Promise<{ ok: true; token: string; when: string; status: "pending" | "confirmed"; portal: string } | { ok: false; error: string }> {
  try {
    if (i.website) return { ok: false, error: "Something went wrong — please try again." }; // honeypot
    const db = createServiceClient();
    const org = await loadOrg(db, { slug });
    if (!org) throw new Error("This booking page isn't available.");
    const s = readApptSettings(org.settings);
    if (!s.enabled) throw new Error("Online booking is switched off right now.");
    if (slow(`${org.id}:${i.email.trim().toLowerCase()}`, 5)) throw new Error("You've made a few bookings already — please call or email us.");
    if (!s.kinds.includes(i.kind)) throw new Error("Choose how you'd like to meet.");
    if (!s.durations.includes(i.duration)) throw new Error("Choose how long.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(i.date) || !/^\d{2}:\d{2}$/.test(i.time)) throw new Error("Choose a time.");
    if (!i.firstName.trim()) throw new Error("Add your name.");
    if (i.kind === "phone" && !i.phone.trim()) throw new Error("Add your phone number so we can call you.");
    const start = zonedMs(i.date, i.time, org.timezone), end = start + i.duration * 60_000;
    // the time must still be one we offer
    const day = (await freeTimes(slug, i.duration)) as { ok: true; days: DaySlots[] };
    if (!day.ok || !day.days.find((d) => d.date === i.date)?.times.includes(i.time)) throw new Error("That time has just been taken — please choose another.");
    const status = s.auto_confirm ? "confirmed" : "pending";
    const topic = i.topic.trim().slice(0, 2000);
    const a = await createAppointment(db, org, {
      title: topic ? topic.split(/\n/)[0].slice(0, 80) : s.title, kind: i.kind, startIso: new Date(start).toISOString(), endIso: new Date(end).toISOString(), topic,
      client: { firstName: i.firstName.slice(0, 80), lastName: i.lastName.slice(0, 80), email: i.email.slice(0, 254), phone: i.phone.slice(0, 40), company: i.company.slice(0, 120) },
      source: "website", status, by: null,
    });
    await emailClient(db, org, a.id, status === "confirmed" ? "booked" : "requested");
    const when = whenText(new Date(start).toISOString(), new Date(end).toISOString(), org.timezone);
    const who = [i.firstName, i.lastName].join(" ").trim();
    await tellOffice(db, org.id, a.id, `${status === "pending" ? "Meeting request" : "New booking"}: ${who}${i.company ? ` (${i.company})` : ""} — ${when}`, `${a.isNewClient ? "New client — added to your CRM. " : ""}${topic}`);
    const { appBaseUrl } = await import("@/lib/integrations/registry");
    return { ok: true, token: a.token, when, status, portal: `${appBaseUrl()}/p/${org.slug}/login` };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

/** The client confirms, suggests another time, or cancels — from their private link. */
export async function clientRespond(slug: string, token: string, what: "confirm" | "suggest" | "cancel", v?: { date: string; time: string; note: string }): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  try {
    const db = createServiceClient();
    const org = await loadOrg(db, { slug });
    if (!org || !/^[0-9a-f]{40,80}$/i.test(token)) throw new Error("This link isn't valid.");
    const { data: a } = await db.from("appointments").select("id, status, starts_at, ends_at, client_name, title").eq("token", token).eq("organisation_id", org.id).maybeSingle();
    if (!a) throw new Error("This link isn't valid.");
    if (["cancelled", "declined", "completed"].includes(a.status as string)) throw new Error("This meeting can't be changed any more.");
    const who = String(a.client_name ?? "The client");
    if (what === "confirm") {
      await db.from("appointments").update({ status: "confirmed", updated_at: new Date().toISOString() }).eq("id", a.id);
      await syncCalendar(db, org, a.id as string);
      await tellOffice(db, org.id, a.id as string, `${who} confirmed: ${whenText(a.starts_at as string, a.ends_at as string, org.timezone)}`);
      return { ok: true, message: "Confirmed — see you then." };
    }
    if (what === "cancel") {
      await db.from("appointments").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", a.id);
      await syncCalendar(db, org, a.id as string);
      await tellOffice(db, org.id, a.id as string, `${who} cancelled: ${whenText(a.starts_at as string, a.ends_at as string, org.timezone)}`, v?.note);
      await emailClient(db, org, a.id as string, "cancelled");
      return { ok: true, message: "Cancelled. You're welcome to book another time." };
    }
    // suggest another time: it waits for the business to approve
    if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v.date) || !/^\d{2}:\d{2}$/.test(v.time)) throw new Error("Choose the new time.");
    const length = Date.parse(a.ends_at as string) - Date.parse(a.starts_at as string);
    const free = await freeTimes(slug, Math.round(length / 60_000), token);
    if (!free.ok || !free.days.find((d) => d.date === v.date)?.times.includes(v.time)) throw new Error("That time isn't free — please choose another.");
    const start = zonedMs(v.date, v.time, org.timezone);
    await db.from("appointments").update({ status: "reschedule_requested", proposed_starts_at: new Date(start).toISOString(), proposed_ends_at: new Date(start + length).toISOString(), client_note: v.note?.trim().slice(0, 2000) || null, updated_at: new Date().toISOString() }).eq("id", a.id);
    await tellOffice(db, org.id, a.id as string, `${who} asked to move their meeting to ${whenText(new Date(start).toISOString(), new Date(start + length).toISOString(), org.timezone)} — approve it?`, v.note);
    return { ok: true, message: `Thanks — we'll confirm ${whenText(new Date(start).toISOString(), new Date(start + length).toISOString(), org.timezone)} shortly. Until then your meeting stays as it is.` };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}
