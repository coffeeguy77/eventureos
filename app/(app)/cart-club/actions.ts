"use server";

import { revalidatePath } from "next/cache";
import { canManage, requireOrg } from "@/lib/context";
import { actorName, logActivity } from "@/lib/activity";
import { createServiceClient } from "@/lib/integrations/runtime";
import { cleanOffers, cleanSlug, cleanStandardOrders, readCodes, readRates } from "@/lib/club/core";
import { ACCOUNT_COLS, clubCtx, syncClubSlugs, toAccount, syncRuns } from "@/lib/club/server";
import { orgById } from "@/lib/bookings/server";

type R<T = null> = { ok: true; data: T } | { ok: false; error: string };
const UUID = /^[0-9a-f-]{36}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const t = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

async function manager() {
  const ctx = await requireOrg();
  if (!canManage(ctx.role)) throw new Error("Only owners, admins and managers can change Cart Club.");
  return { ...ctx, db: createServiceClient() };
}
async function account(db: ReturnType<typeof createServiceClient>, orgId: string, id: string) {
  if (!UUID.test(id)) throw new Error("Refresh and try again.");
  const { data, error } = await db.from("cart_club_accounts").select(ACCOUNT_COLS).eq("id", id).eq("organisation_id", orgId).maybeSingle();
  if (error) throw new Error(/cart_club/.test(error.message) ? "Cart Club needs the 0101 database update first." : error.message);
  if (!data) throw new Error("That client isn't on Cart Club any more.");
  return toAccount(data);
}
const refresh = (id?: string, customerId?: string) => {
  revalidatePath("/cart-club");
  if (id) revalidatePath(`/cart-club/${id}`);
  if (customerId) revalidatePath(`/clients/${customerId}`);
};

/** Put a client on Cart Club (or switch them back on). Their people come from the client's contacts. */
export async function addToClub(customerId: string): Promise<R<string>> {
  try {
    const { db, org, user, profile } = await manager();
    if (!UUID.test(customerId)) throw new Error("Choose a client.");
    const { data: cust } = await db.from("customers").select("id, name, company, email, phone").eq("id", customerId).eq("organisation_id", org.id).maybeSingle();
    if (!cust) throw new Error("That client isn't there any more.");
    const { data: have, error: hErr } = await db.from("cart_club_accounts").select("id").eq("organisation_id", org.id).eq("customer_id", customerId).maybeSingle();
    if (hErr) throw new Error(/cart_club/.test(hErr.message) ? "Cart Club needs the 0101 database update first (Supabase → SQL Editor)." : hErr.message);
    let id = have?.id as string | undefined;
    if (id) await db.from("cart_club_accounts").update({ enabled: true, updated_at: new Date().toISOString() }).eq("id", id);
    else {
      const name = (cust.company as string) || (cust.name as string);
      let slug = cleanSlug(name.replace(/\b(pty|ltd|limited|the|of|australia)\b/gi, "")) ?? cleanSlug(`client-${customerId.slice(0, 6)}`)!;
      const { data: taken } = await db.from("cart_club_accounts").select("slug").eq("organisation_id", org.id).like("slug", `${slug}%`);
      if ((taken ?? []).some((x) => x.slug === slug)) slug = `${slug}-${(taken ?? []).length + 1}`.slice(0, 40);
      const { data, error } = await db.from("cart_club_accounts").insert({ organisation_id: org.id, customer_id: customerId, slug, name: name.slice(0, 160), created_by: user.id }).select("id").single();
      if (error) throw new Error(error.message);
      id = data.id as string;
      // Their people: the client's contacts with an email or phone
      const { data: contacts } = await db.from("contacts").select("id, first_name, last_name, email, phone").eq("customer_id", customerId).limit(50);
      const rows = ((contacts ?? []) as { id: string; first_name: string; last_name: string | null; email: string | null; phone: string | null }[])
        .filter((c) => c.email || c.phone).map((c) => ({ organisation_id: org.id, account_id: id, contact_id: c.id, name: [c.first_name, c.last_name].filter(Boolean).join(" ").slice(0, 160) || "Contact", email: c.email?.toLowerCase() ?? null, phone: c.phone }));
      if (rows.length) await db.from("cart_club_people").insert(rows);
    }
    await syncClubSlugs(db, org.id);
    await logActivity(db, { orgId: org.id, actorId: user.id, action: "club.added", entityType: "customer", entityId: customerId, customerId, summary: `${actorName(profile)} put ${cust.name} on Cart Club` });
    refresh(id, customerId);
    return { ok: true, data: id! };
  } catch (e) { return fail(e); }
}

export async function setClubEnabled(id: string, on: boolean): Promise<R> {
  try {
    const { db, org, user, profile } = await manager();
    const a = await account(db, org.id, id);
    await db.from("cart_club_accounts").update({ enabled: !!on, updated_at: new Date().toISOString() }).eq("id", id);
    await syncClubSlugs(db, org.id);
    await logActivity(db, { orgId: org.id, actorId: user.id, action: on ? "club.enabled" : "club.disabled", entityType: "customer", entityId: a.customer_id, customerId: a.customer_id, summary: `${actorName(profile)} ${on ? "switched on" : "took"} ${a.name} ${on ? "for" : "off"} Cart Club` });
    refresh(id, a.customer_id);
    return { ok: true, data: null };
  } catch (e) { return fail(e); }
}

export interface AccountInput {
  slug: string; name: string; offers: string[]; rates: Record<string, unknown>; billing: string; due_rule: string; due_days: number;
  standard_orders: unknown; wholesale_customer_id: string | null; email_invoices: boolean; follow_up: boolean; notes: string;
}

export async function saveClubAccount(id: string, i: AccountInput): Promise<R> {
  try {
    const { db, org, user, profile } = await manager();
    const a = await account(db, org.id, id);
    const slug = cleanSlug(i.slug);
    if (!slug) throw new Error("The address needs 2–40 letters, numbers or dashes (e.g. hotelrealm).");
    const { RESERVED } = await import("@/lib/short-links");
    if (RESERVED.includes(slug)) throw new Error(`“${slug}” is used by EventureOS — choose another address.`);
    const { readSite } = await import("@/lib/site/site");
    const { data: o } = await db.from("organisations").select("settings").eq("id", org.id).single();
    if (readSite(o?.settings).pages.some((p) => p.slug === slug)) throw new Error(`Your website already has a /${slug} page — choose another address.`);
    const offers = cleanOffers(i.offers);
    if (!offers.length) throw new Error("Choose at least one thing they can book.");
    const days = Math.round(Number(i.due_days));
    if (!(days >= 0 && days <= 90)) throw new Error("Due days must be 0–90.");
    const name = t(i.name, 160);
    if (!name) throw new Error("Give the club a name (usually the business's name).");
    const ws = i.wholesale_customer_id && UUID.test(i.wholesale_customer_id) ? i.wholesale_customer_id : null;
    const { error } = await db.from("cart_club_accounts").update({
      slug, name, offers, rates: readRates(i.rates), billing: i.billing === "monthly" ? "monthly" : "on_booking", due_rule: i.due_rule === "before_event" ? "before_event" : "after_invoice",
      due_days: days, standard_orders: cleanStandardOrders(i.standard_orders), wholesale_customer_id: ws, email_invoices: !!i.email_invoices, follow_up: !!i.follow_up, notes: t(i.notes, 4000), updated_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) throw new Error(/organisation_id_slug|unique/.test(error.message) ? `Another client already uses /${slug}.` : error.message);
    if (slug !== a.slug) await syncClubSlugs(db, org.id);
    await logActivity(db, { orgId: org.id, actorId: user.id, action: "club.updated", entityType: "customer", entityId: a.customer_id, customerId: a.customer_id, summary: `${actorName(profile)} changed ${name}'s Cart Club settings` });
    refresh(id, a.customer_id);
    return { ok: true, data: null };
  } catch (e) { return fail(e); }
}

/** The section's name, invoice item codes and (once the business's own domain points here) its address. */
export async function saveClubSettings(i: { name: string; codes: Record<string, unknown>; base: string }): Promise<R> {
  try {
    const { db, org } = await manager();
    const base = (i.base ?? "").trim().replace(/\/+$/, "");
    if (base && !/^https:\/\/[a-z0-9.-]+$/i.test(base)) throw new Error("The address must look like https://www.example.com.au");
    const { data: o } = await db.from("organisations").select("settings").eq("id", org.id).single();
    const settings = (o?.settings ?? {}) as Record<string, unknown>;
    const cc = (settings.cart_club ?? {}) as Record<string, unknown>;
    await db.from("organisations").update({ settings: { ...settings, cart_club: { ...cc, name: t(i.name, 40) ?? "Cart Club", codes: readCodes(i.codes), base: base || null } } }).eq("id", org.id);
    refresh();
    return { ok: true, data: null };
  } catch (e) { return fail(e); }
}

/* ------------------------------------------------------------------ people */

export interface PersonInput { name: string; email: string; phone: string }
function cleanPerson(i: PersonInput) {
  const name = t(i.name, 160);
  const email = (i.email ?? "").trim().toLowerCase() || null;
  const phone = t(i.phone, 40);
  if (!name) throw new Error("Add their name.");
  if (email && !EMAIL.test(email)) throw new Error("That email doesn't look right.");
  if (!email && !phone) throw new Error("Add their email or mobile (they sign in with it).");
  return { name, email, phone };
}

export async function addClubPerson(accountId: string, i: PersonInput): Promise<R<string>> {
  try {
    const { db, org } = await manager();
    const a = await account(db, org.id, accountId);
    const p = cleanPerson(i);
    // Keep the client's contacts in step: find or add them as a contact
    let contactId: string | null = null;
    if (p.email) {
      const { data: c } = await db.from("contacts").select("id").eq("customer_id", a.customer_id).ilike("email", p.email.replace(/[%_\\]/g, "\\$&")).maybeSingle();
      contactId = (c?.id as string) ?? null;
    }
    if (!contactId) {
      const [first, ...rest] = p.name.split(/\s+/);
      const { data: c } = await db.from("contacts").insert({ organisation_id: org.id, customer_id: a.customer_id, first_name: first, last_name: rest.join(" ") || null, email: p.email, phone: p.phone }).select("id").single();
      contactId = (c?.id as string) ?? null;
    }
    const { data, error } = await db.from("cart_club_people").insert({ organisation_id: org.id, account_id: a.id, contact_id: contactId, ...p }).select("id").single();
    if (error) throw new Error(/email_idx|unique/.test(error.message) ? `${p.email} is already on the list.` : error.message);
    refresh(a.id, a.customer_id);
    return { ok: true, data: data.id as string };
  } catch (e) { return fail(e); }
}

export async function updateClubPerson(personId: string, i: PersonInput & { active: boolean }): Promise<R> {
  try {
    const { db, org } = await manager();
    if (!UUID.test(personId)) throw new Error("Refresh and try again.");
    const p = cleanPerson(i);
    const { data, error } = await db.from("cart_club_people").update({ ...p, active: !!i.active }).eq("id", personId).eq("organisation_id", org.id).select("account_id").single();
    if (error) throw new Error(/email_idx|unique/.test(error.message) ? `${p.email} is already on the list.` : error.message);
    if (!i.active) await db.from("cart_club_sessions").delete().eq("person_id", personId);
    refresh(data.account_id as string);
    return { ok: true, data: null };
  } catch (e) { return fail(e); }
}

export async function removeClubPerson(personId: string): Promise<R> {
  try {
    const { db, org } = await manager();
    if (!UUID.test(personId)) throw new Error("Refresh and try again.");
    const { data, error } = await db.from("cart_club_people").delete().eq("id", personId).eq("organisation_id", org.id).select("account_id").single();
    if (error) throw new Error(error.message);
    refresh(data.account_id as string);
    return { ok: true, data: null };
  } catch (e) { return fail(e); }
}

/** Send the welcome (with a one-time sign-in button) to the chosen people, by email and/or text. */
export async function sendClubWelcomes(accountId: string, personIds: string[], via: { email: boolean; sms: boolean }): Promise<R<{ sent: string[]; errors: string[] }>> {
  try {
    const { db, org, user, profile } = await manager();
    const a = await account(db, org.id, accountId);
    if (!a.enabled) throw new Error("Switch the club on first.");
    if (!via.email && !via.sms) throw new Error("Choose email, text or both.");
    const ids = (Array.isArray(personIds) ? personIds : []).filter((x) => UUID.test(x)).slice(0, 50);
    if (!ids.length) throw new Error("Tick who to send it to.");
    const c = await clubCtx(org.slug, a.slug, db);
    if (!c) throw new Error("The club isn't available.");
    const { sendWelcome } = await import("@/lib/club/auth");
    const out = { sent: [] as string[], errors: [] as string[] };
    for (const id of ids) { const r = await sendWelcome(db, c, id, via); out.sent.push(...r.sent); out.errors.push(...r.errors); }
    if (out.sent.length) await logActivity(db, { orgId: org.id, actorId: user.id, action: "club.welcome", entityType: "customer", entityId: a.customer_id, customerId: a.customer_id, summary: `${actorName(profile)} sent the Cart Club welcome to ${out.sent.join(", ")}` });
    refresh(a.id);
    return { ok: true, data: out };
  } catch (e) { return fail(e); }
}

export interface FoundPerson { name: string; email: string; seen: number; last: string | null; source: string }

/** People at this client from the mailbox: everyone at their email domain(s) in Gmail (and synced emails / contacts), not yet on the list. */
export async function findClubPeople(accountId: string): Promise<R<{ domains: string[]; people: FoundPerson[]; note: string | null }>> {
  try {
    const { db, org } = await manager();
    const a = await account(db, org.id, accountId);
    const FREE = /^(gmail|googlemail|hotmail|outlook|live|yahoo|icloud|me|bigpond|optusnet|internode|iinet|tpg)\./i;
    const [{ data: cust }, { data: contacts }, { data: listed }] = await Promise.all([
      db.from("customers").select("email").eq("id", a.customer_id).maybeSingle(),
      db.from("contacts").select("first_name, last_name, email").eq("customer_id", a.customer_id).limit(100),
      db.from("cart_club_people").select("email").eq("account_id", a.id),
    ]);
    const all = [cust?.email, ...((contacts ?? []) as { email: string | null }[]).map((c) => c.email)].filter((x): x is string => !!x && EMAIL.test(x));
    const domains = [...new Set(all.map((e) => e.split("@")[1].toLowerCase()).filter((d) => !FREE.test(d)))].slice(0, 3);
    if (!domains.length) return { ok: true, data: { domains: [], people: [], note: "This client has no company email domain to search for (only personal addresses)." } };
    const have = new Set(((listed ?? []) as { email: string | null }[]).map((p) => p.email?.toLowerCase()).filter(Boolean));
    const found = new Map<string, FoundPerson>();
    const note = (email: string, name: string | null, when: string | null, source: string) => {
      const e = email.toLowerCase();
      if (have.has(e) || !domains.includes(e.split("@")[1]) || /^(no-?reply|do-?not-?reply|mailer-daemon|postmaster)@/.test(e)) return;
      const cur = found.get(e) ?? { name: "", email: e, seen: 0, last: null, source };
      cur.seen++;
      if (name && name.trim() && !name.includes("@") && name.length > cur.name.length) cur.name = name.replace(/^"|"$/g, "").trim();
      if (when && (!cur.last || when > cur.last)) cur.last = when;
      found.set(e, cur);
    };
    for (const c of (contacts ?? []) as { first_name: string; last_name: string | null; email: string | null }[]) if (c.email) note(c.email, [c.first_name, c.last_name].filter(Boolean).join(" "), null, "contacts");
    let gmailNote: string | null = null;
    try {
      const { buildContext } = await import("@/lib/integrations/sync-runner");
      const { listThreads, getThread, header, parseAddressList } = await import("@/lib/integrations/gmail");
      const ctx = await buildContext(db, "service", org.id, "gmail", null);
      const q = domains.map((d) => `from:@${d} OR to:@${d} OR cc:@${d}`).join(" OR ");
      const threads: { id: string }[] = [];
      let page: string | undefined;
      for (let i = 0; i < 3 && threads.length < 150; i++) {
        const r = await listThreads(ctx, q, page, 50);
        threads.push(...(r.threads ?? []));
        page = r.nextPageToken;
        if (!page) break;
      }
      for (let i = 0; i < threads.length; i += 10) {
        const batch = await Promise.all(threads.slice(i, i + 10).map((th) => getThread(ctx, th.id, "metadata").catch(() => null)));
        for (const th of batch) for (const m of th?.messages ?? []) {
          const date = header(m, "Date");
          const when = date && !Number.isNaN(Date.parse(date)) ? new Date(date).toISOString().slice(0, 10) : null;
          for (const h of ["From", "To", "Cc", "Reply-To"]) for (const ad of parseAddressList(header(m, h))) note(ad.email, ad.name, when, "email");
        }
      }
      gmailNote = `Searched ${threads.length} email conversation${threads.length === 1 ? "" : "s"} with ${domains.map((d) => `@${d}`).join(", ")}.`;
    } catch (e) {
      gmailNote = `Couldn't search Gmail (${e instanceof Error ? e.message : String(e)}) — showing synced emails and contacts only.`;
      const { data: msgs } = await db.from("email_messages").select("from_email, from_name, to_emails, cc_emails, sent_at").eq("organisation_id", org.id).or(domains.map((d) => `from_email.ilike.%@${d}`).join(",")).limit(500);
      for (const m of (msgs ?? []) as { from_email: string; from_name: string | null; to_emails: string[] | null; cc_emails: string[] | null; sent_at: string | null }[]) {
        note(m.from_email, m.from_name, m.sent_at?.slice(0, 10) ?? null, "email");
        for (const e of [...(m.to_emails ?? []), ...(m.cc_emails ?? [])]) note(e, null, m.sent_at?.slice(0, 10) ?? null, "email");
      }
    }
    const people = [...found.values()].map((p) => ({ ...p, name: p.name || p.email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) }))
      .sort((x, y) => (y.last ?? "").localeCompare(x.last ?? "") || y.seen - x.seen).slice(0, 60);
    return { ok: true, data: { domains, people, note: gmailNote } };
  } catch (e) { return fail(e); }
}

/** Put the chosen found people on the list (as contacts too). */
export async function addFoundPeople(accountId: string, people: { name: string; email: string }[]): Promise<R<number>> {
  let n = 0;
  for (const p of (Array.isArray(people) ? people : []).slice(0, 60)) {
    const r = await addClubPerson(accountId, { name: p.name, email: p.email, phone: "" });
    if (r.ok) n++;
  }
  return { ok: true, data: n };
}

/** Re-work the delivery / pickup runs on the calendar (e.g. after changing a booking in the office). */
export async function resyncClubRuns(accountId: string): Promise<R> {
  try {
    const { db, org } = await manager();
    const a = await account(db, org.id, accountId);
    await syncRuns(db, await orgById(db, org.id), a);
    refresh(a.id);
    return { ok: true, data: null };
  } catch (e) { return fail(e); }
}

/** Office: cancel a booked club booking (the job and invoice are left for the office to handle). */
export async function cancelClubBooking(bookingId: string): Promise<R> {
  try {
    const { db, org, user, profile } = await manager();
    if (!UUID.test(bookingId)) throw new Error("Refresh and try again.");
    const { data: b, error } = await db.from("cart_club_bookings").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", bookingId).eq("organisation_id", org.id).neq("status", "cancelled").select("account_id, title, number, event_id").single();
    if (error) throw new Error(error.message);
    const a = await account(db, org.id, b.account_id as string);
    await syncRuns(db, await orgById(db, org.id), a);
    await logActivity(db, { orgId: org.id, actorId: user.id, action: "club.cancelled", entityType: "customer", entityId: a.customer_id, customerId: a.customer_id, eventId: (b.event_id as string) ?? null, summary: `${actorName(profile)} cancelled Cart Club booking #${b.number} ${b.title}` });
    refresh(a.id);
    return { ok: true, data: null };
  } catch (e) { return fail(e); }
}


/** Clients matching a search, for "Add a client". */
export async function searchClubCustomers(q: string): Promise<R<{ id: string; name: string; email: string | null }[]>> {
  try {
    const { db, org } = await manager();
    const s = String(q ?? "").trim().replace(/[%_,()\\]/g, " ").slice(0, 60);
    if (s.length < 2) return { ok: true, data: [] };
    const { data, error } = await db.from("customers").select("id, name, email").eq("organisation_id", org.id).or(`name.ilike.%${s}%,company.ilike.%${s}%,email.ilike.%${s}%`).order("name").limit(12);
    if (error) throw new Error(error.message);
    return { ok: true, data: (data ?? []) as { id: string; name: string; email: string | null }[] };
  } catch (e) { return fail(e); }
}
