"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/context";
import { actorName, logActivity } from "@/lib/activity";
import { isKind, isPriority, type Priority, type TicketKind } from "@/lib/nerdherd/core";
import { clientMatches, phoneIn, searchClients, searchTickets, splitName, workDomainOf, type ClientMatch, type Sender, type TicketHit } from "@/lib/nerdherd/from-enquiry";

type R<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const UUID = /^[0-9a-f-]{36}$/i;
const fail = (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) });

async function desk() {
  const ctx = await requireOrg();
  if (ctx.role === "staff" || ctx.role === "customer") throw new Error("Only the office team can work on tickets.");
  return ctx;
}

async function enquiry(supabase: Awaited<ReturnType<typeof desk>>["supabase"], orgId: string, id: string) {
  if (!UUID.test(id)) throw new Error("That enquiry doesn't exist.");
  const { data } = await supabase.from("enquiries").select("id, number, title, message, contact_name, contact_email, contact_phone, company, customer_id, contact_id, status").eq("id", id).eq("organisation_id", orgId).maybeSingle();
  if (!data) throw new Error("That enquiry no longer exists.");
  return data as { id: string; number: number; title: string; message: string | null; contact_name: string | null; contact_email: string | null; contact_phone: string | null; company: string | null; customer_id: string | null; contact_id: string | null; status: string };
}

/** What the ticket form starts with: the sender, likely clients, and their open tickets. */
export async function ticketStart(enquiryId: string): Promise<R<{ sender: Sender; subject: string; body: string; matches: ClientMatch[]; tickets: TicketHit[]; members: { id: string; name: string }[] }>> {
  try {
    const { supabase, org } = await desk();
    const e = await enquiry(supabase, org.id, enquiryId);
    const n = splitName(e.contact_name, e.contact_email);
    const sender: Sender = { firstName: n.first, lastName: n.last, email: e.contact_email, phone: e.contact_phone ?? phoneIn(e.message), company: e.company, domain: workDomainOf(e.contact_email) };
    let matches = await clientMatches(supabase, org.id, { email: e.contact_email, name: [n.first, n.last].join(" ").trim(), company: e.company });
    if (e.customer_id && !matches.some((m) => m.id === e.customer_id)) {
      const { data: c } = await supabase.from("customers").select("id, name").eq("id", e.customer_id).maybeSingle();
      if (c) matches = [{ id: c.id as string, name: c.name as string, why: "already linked to this enquiry", contactId: e.contact_id }, ...matches];
    }
    const tickets = matches.length ? (await searchTickets(supabase, org.id, "", matches.map((m) => m.id))).filter((t) => !["resolved", "closed"].includes(t.status)) : [];
    const { getMembers } = await import("@/lib/context");
    const members = (await getMembers(org.id)).filter((m) => m.role !== "customer").map((m) => ({ id: m.id, name: m.full_name ?? m.email }));
    return { ok: true, sender, subject: e.title, body: (e.message ?? "").trim(), matches, tickets, members };
  } catch (x) { return fail(x); }
}

export async function findClients(q: string): Promise<R<{ list: ClientMatch[] }>> {
  try { const { supabase, org } = await desk(); return { ok: true, list: await searchClients(supabase, org.id, q) }; } catch (x) { return fail(x); }
}
export async function findTickets(q: string): Promise<R<{ list: TicketHit[] }>> {
  try { const { supabase, org } = await desk(); return { ok: true, list: await searchTickets(supabase, org.id, q) }; } catch (x) { return fail(x); }
}

export interface FromEnquiryInput {
  enquiryId: string;
  mode: "new" | "existing";
  ticketId?: string | null;
  customerId: string | null;
  contact: { save: boolean; firstName: string; lastName: string; email: string; phone: string; position: string };
  subject: string; body: string; kind?: TicketKind; priority?: Priority;
  tabs: { name: string; assignedTo: string | null }[];
}

/** Open a ticket from an enquiry (or add it to an existing ticket); save the sender as a contact on the client. */
export async function ticketFromEnquiry(i: FromEnquiryInput): Promise<R<{ id: string; number: number }>> {
  try {
    const { supabase, org, user, profile } = await desk();
    const e = await enquiry(supabase, org.id, i.enquiryId);
    const who = actorName(profile);
    const customerId = i.customerId && UUID.test(i.customerId) ? i.customerId : null;
    if (customerId) { const { data } = await supabase.from("customers").select("id").eq("id", customerId).eq("organisation_id", org.id).maybeSingle(); if (!data) throw new Error("That client no longer exists."); }

    // the person who emailed: a contact on the client (added, or brought up to date)
    let contactId: string | null = null;
    const c = i.contact;
    const email = c.email.trim().toLowerCase().slice(0, 254) || null;
    if (customerId && c.save && (c.firstName.trim() || email)) {
      const row = { first_name: c.firstName.trim().slice(0, 80) || (email ?? "Contact").split("@")[0], last_name: c.lastName.trim().slice(0, 80) || null, email, phone: c.phone.trim().slice(0, 40) || null, position: c.position.trim().slice(0, 80) || null };
      const { data: found } = email ? await supabase.from("contacts").select("id, first_name, last_name, phone, position").eq("organisation_id", org.id).eq("customer_id", customerId).ilike("email", email).maybeSingle() : { data: null };
      if (found) {
        // fill in / update what we were given, never blank out what's there
        const patch = Object.fromEntries(Object.entries(row).filter(([, v]) => v)) as Record<string, string>;
        await supabase.from("contacts").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", found.id);
        contactId = found.id as string;
      } else {
        const { data: made, error } = await supabase.from("contacts").insert({ ...row, organisation_id: org.id, customer_id: customerId, created_by: user.id }).select("id").single();
        if (error) throw new Error(`Couldn't save the contact: ${error.message}`);
        contactId = made.id as string;
      }
    }

    const { data: thread } = await supabase.from("email_threads").select("id").eq("organisation_id", org.id).eq("enquiry_id", e.id).order("last_message_at", { ascending: true }).limit(1).maybeSingle();
    const body = i.body.trim().slice(0, 20000);
    const fromLabel = [c.firstName, c.lastName].filter((x) => x.trim()).join(" ").trim() || email || "Client";
    let ticketId: string, number: number;

    if (i.mode === "existing") {
      if (!i.ticketId || !UUID.test(i.ticketId)) throw new Error("Choose the ticket to add this to.");
      const { data: t } = await supabase.from("support_tickets").select("id, number, status, customer_id").eq("id", i.ticketId).eq("organisation_id", org.id).maybeSingle();
      if (!t) throw new Error("That ticket no longer exists.");
      ticketId = t.id as string; number = t.number as number;
      if (body) await supabase.from("support_ticket_updates").insert({ organisation_id: org.id, ticket_id: ticketId, kind: "email_in", body, public: true, author_id: null, author_name: fromLabel });
      const patch: Record<string, unknown> = { last_activity_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      if (["resolved", "closed"].includes(t.status as string)) { patch.status = "open"; patch.resolved_at = null; }
      if (!t.customer_id && customerId) patch.customer_id = customerId;
      await supabase.from("support_tickets").update(patch).eq("id", ticketId);
    } else {
      const subject = i.subject.trim().slice(0, 300);
      if (!subject) throw new Error("Give the ticket a subject.");
      const base = {
        organisation_id: org.id, subject, kind: isKind(i.kind) ? i.kind : "support", priority: isPriority(i.priority) ? i.priority : "normal",
        status: "new", source: "email", customer_id: customerId, email_thread_id: thread?.id ?? null, created_by: user.id,
      };
      let res = await supabase.from("support_tickets").insert({ ...base, contact_id: contactId, enquiry_id: e.id }).select("id, number").single();
      if (res.error && /contact_id|enquiry_id/.test(res.error.message)) res = await supabase.from("support_tickets").insert(base).select("id, number").single();
      if (res.error) throw new Error(`Couldn't create the ticket: ${res.error.message}`);
      ticketId = res.data.id as string; number = res.data.number as number;
      if (body) await supabase.from("support_ticket_updates").insert({ organisation_id: org.id, ticket_id: ticketId, kind: "email_in", body, public: true, author_id: null, author_name: fromLabel });
    }

    // tabs: one per issue, each with its own person
    const tabs = i.tabs.map((t) => ({ name: t.name.trim().slice(0, 60), assignedTo: t.assignedTo && UUID.test(t.assignedTo) ? t.assignedTo : null })).filter((t) => t.name).slice(0, 12);
    if (tabs.length) {
      const { count } = await supabase.from("support_ticket_tabs").select("id", { count: "exact", head: true }).eq("ticket_id", ticketId);
      const { error } = await supabase.from("support_ticket_tabs").insert(tabs.map((t, k) => ({ organisation_id: org.id, ticket_id: ticketId, name: t.name, assigned_to: t.assignedTo, position: (count ?? 0) + k })));
      if (error) throw new Error(/support_ticket_tabs/.test(error.message) ? "Ticket saved — but tabs need the latest database update (0090)." : error.message);
      if (i.mode === "new" && tabs.length === 1 && tabs[0].assignedTo) await supabase.from("support_tickets").update({ assigned_to: tabs[0].assignedTo }).eq("id", ticketId);
    }

    // the enquiry points at its ticket, and gets the client / contact if it didn't have them
    const ePatch: Record<string, unknown> = { updated_at: new Date().toISOString(), ticket_id: ticketId };
    if (!e.customer_id && customerId) ePatch.customer_id = customerId;
    if (!e.contact_id && contactId) ePatch.contact_id = contactId;
    if (["new", "needs_review"].includes(e.status)) ePatch.status = "contacted";
    let up = await supabase.from("enquiries").update(ePatch).eq("id", e.id);
    if (up.error && /ticket_id/.test(up.error.message)) { delete ePatch.ticket_id; up = await supabase.from("enquiries").update(ePatch).eq("id", e.id); }
    if (thread?.id && i.mode === "existing") await supabase.from("support_tickets").update({ email_thread_id: thread.id }).eq("id", ticketId).is("email_thread_id", null);

    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: i.mode === "new" ? "ticket.created" : "ticket.updated", entityType: "support_ticket", entityId: ticketId, customerId, enquiryId: e.id,
      summary: i.mode === "new" ? `${who} opened ticket #${number} from enquiry ENQ-${e.number}` : `${who} added enquiry ENQ-${e.number} to ticket #${number}` });
    revalidatePath("/nerd-herd", "layout"); revalidatePath(`/enquiries/${e.id}`);
    return { ok: true, id: ticketId, number };
  } catch (x) { return fail(x); }
}
