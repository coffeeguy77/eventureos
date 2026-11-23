"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/integrations/runtime";
import { HOME_TILES, readCare, type HomeTile } from "@/lib/nerdherd/care";
import { buyBlock, claimUploads, loadBlock, prepareUploads } from "@/lib/nerdherd/care-server";
import { isSlug, isUuid, requirePortal } from "../portal-data";

/**
 * Client portal — Care Hub: request tasks from prepaid hours, lodge a one-off job, report a problem, buy hours,
 * add Google Ads, and lay out their home page. requirePortal() proves who the client is; every write is limited to
 * their own customer ids. Tickets are raised through the same database function as before (portal_raise_ticket),
 * then the server adds what the portal form knows (paid by, priority, task list, files).
 */
export type CareState = { ok?: boolean; error?: string; id?: string; pay?: string };
const UPDATE_NEEDED = "This part of your portal is being switched on — please try again shortly, or email us.";

async function who(slug: string, customer: string) {
  if (!isSlug(slug) || !isUuid(customer)) throw new Error("This page isn't valid — refresh and try again.");
  const ctx = await requirePortal(slug);
  if (!ctx.customerIds.includes(customer)) throw new Error("You don't have access to that account.");
  return ctx;
}

/** One-time upload links for the files a client is about to attach (they upload straight to storage). */
export async function getUploadLinks(slug: string, list: { name: string; size: number; type: string }[]) {
  try {
    if (!isSlug(slug)) throw new Error("This page isn't valid — refresh and try again.");
    const ctx = await requirePortal(slug);
    return { ok: true as const, data: await prepareUploads(createServiceClient(), ctx.org.id, list) };
  } catch (e) { return { ok: false as const, error: e instanceof Error ? e.message : String(e) }; }
}

export async function submitRequest(_prev: CareState, form: FormData): Promise<CareState> {
  try {
    const slug = String(form.get("slug") ?? "");
    const customer = String(form.get("customer") ?? "");
    const type = String(form.get("type") ?? "job") as "tasks" | "job" | "problem";
    if (!["tasks", "job", "problem"].includes(type)) throw new Error("Choose what kind of request this is.");
    const ctx = await who(slug, customer);
    const site = String(form.get("website") ?? "");
    const subject = String(form.get("subject") ?? "").trim().slice(0, 300);
    const details = String(form.get("details") ?? "").trim().slice(0, 15000);
    const tasks = form.getAll("task").map((x) => String(x).trim().replace(/\s+/g, " ").slice(0, 200)).filter(Boolean).slice(0, 40);
    const urgency = String(form.get("urgency") ?? "");
    const svc0 = createServiceClient();
    const attach = await claimUploads(svc0, ctx.org.id, form.get("uploads") as string | null);
    if (!subject) throw new Error(type === "problem" ? "Say briefly what's wrong, e.g. “Contact form isn't sending”." : "Give your request a short title.");
    if (type === "tasks" && !tasks.length) throw new Error("Add at least one task.");

    const svc = createServiceClient();
    const { data: orgRow } = await svc.from("organisations").select("settings").eq("id", ctx.org.id).single();
    if (type === "tasks") {
      if (!readCare(orgRow?.settings).enabled) throw new Error("Prepaid hours aren't available — lodge it as a job instead.");
      const b = await loadBlock(svc, ctx.org.id, ctx.customerIds);
      if (!b) throw new Error(UPDATE_NEEDED);
      if (b.leftMin <= 0) throw new Error(b.pendingMin > 0 ? "Your new hours start once their invoice is paid — pay it from your home page, then send this." : "You've no prepaid hours left. Buy a block first, or lodge this as a job and we'll quote it.");
    }

    const body = [
      type === "problem" && urgency ? `How bad: ${urgency === "down" ? "The site (or part of it) is down" : urgency === "broken" ? "Something's broken but the site works" : "Not urgent"}` : null,
      tasks.length ? `Tasks:\n${tasks.map((x) => `• ${x}`).join("\n")}` : null,
      details || null,
      attach.length ? `Files: ${attach.map((f) => f.name).join(", ")}` : null,
    ].filter(Boolean).join("\n\n") || subject;
    const supabase = await createClient();
    const { data: id, error } = await supabase.rpc("portal_raise_ticket", { p_customer: customer, p_subject: subject, p_body: body, p_website: isUuid(site) ? site : null });
    if (error) throw new Error(/Not allowed/.test(error.message) ? "You don't have access to raise requests here." : error.message);
    const ticketId = id as string;

    const patch: Record<string, unknown> = {
      kind: type === "job" ? "project" : "support",
      priority: type === "problem" ? (urgency === "down" ? "urgent" : urgency === "broken" ? "high" : "normal") : "normal",
      billing: type === "tasks" ? "block" : type === "job" ? "quote" : null,
      ...(tasks.length ? { checklist: tasks.map((label) => ({ label, done: false })) } : {}),
    };
    let { error: pErr } = await svc.from("support_tickets").update(patch).eq("id", ticketId);
    if (pErr && /billing/.test(pErr.message)) { delete patch.billing; ({ error: pErr } = await svc.from("support_tickets").update(patch).eq("id", ticketId)); }
    if (pErr) console.error("[care] request details", pErr.message);
    if (attach.length) {
      const saved = attach;
      const { data: first } = await svc.from("support_ticket_updates").select("id").eq("ticket_id", ticketId).order("created_at").limit(1).maybeSingle();
      if (first) await svc.from("support_ticket_updates").update({ files: saved }).eq("id", first.id);
    }
    revalidatePath(`/p/${slug}`);
    revalidatePath(`/p/${slug}/support`);
    return { ok: true, id: ticketId };
  } catch (e) { return { error: e instanceof Error ? e.message : String(e) }; }
}

/** Reply on a request, with files. */
export async function replyWithFiles(_prev: CareState, form: FormData): Promise<CareState> {
  try {
    const slug = String(form.get("slug") ?? "");
    const ticket = String(form.get("ticket") ?? "");
    const body = String(form.get("body") ?? "").trim();
    if (!isSlug(slug) || !isUuid(ticket)) throw new Error("This page isn't valid — refresh and try again.");
    const ctx = await requirePortal(slug);
    const svc = createServiceClient();
    const attach = await claimUploads(svc, ctx.org.id, form.get("uploads") as string | null);
    if (!body && !attach.length) throw new Error("Write a message or attach a file.");
    const { data: tk } = await svc.from("support_tickets").select("id, customer_id").eq("id", ticket).eq("organisation_id", ctx.org.id).maybeSingle();
    if (!tk || !ctx.customerIds.includes(tk.customer_id as string)) throw new Error("You don't have access to this request.");
    const supabase = await createClient();
    const text = [body, attach.length ? `Files: ${attach.map((f) => f.name).join(", ")}` : ""].filter(Boolean).join("\n\n");
    const { error } = await supabase.rpc("portal_reply_ticket", { p_ticket: ticket, p_body: text.slice(0, 20000) });
    if (error) throw new Error(/Not allowed/.test(error.message) ? "You don't have access to this request." : error.message);
    if (attach.length) {
      const saved = attach;
      const { data: last } = await svc.from("support_ticket_updates").select("id").eq("ticket_id", ticket).eq("author_id", ctx.user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (last) await svc.from("support_ticket_updates").update({ files: saved }).eq("id", last.id);
    }
    revalidatePath(`/p/${slug}/support/${ticket}`);
    return { ok: true };
  } catch (e) { return { error: e instanceof Error ? e.message : String(e) }; }
}

/** Buy a block of hours: raises the invoice and sends the client to pay it. */
export async function buyHours(_prev: CareState, form: FormData): Promise<CareState> {
  try {
    const slug = String(form.get("slug") ?? "");
    const customer = String(form.get("customer") ?? "");
    const hours = Number(form.get("hours"));
    const ctx = await who(slug, customer);
    const svc = createServiceClient();
    const { data: org } = await svc.from("organisations").select("id, currency, timezone, settings").eq("id", ctx.org.id).single();
    if (!org) throw new Error("Couldn't load your account — refresh and try again.");
    if (!readCare(org.settings).enabled) throw new Error("Prepaid hours aren't available right now.");
    const name = [ctx.contactName].filter(Boolean)[0] ?? ctx.user.email ?? "A client";
    const r = await buyBlock(svc, org as { id: string; currency: string; timezone: string; settings: unknown }, customer, hours, { id: null, name }).catch((e) => {
      throw new Error(/nh_blocks/.test(String(e)) ? UPDATE_NEEDED : e instanceof Error ? e.message : String(e));
    });
    revalidatePath(`/p/${slug}`);
    return { ok: true, pay: r.payToken };
  } catch (e) { return { error: e instanceof Error ? e.message : String(e) }; }
}

/** "Add Google Ads to my package": a request the team picks up (and quotes the setup). */
export async function requestAds(_prev: CareState, form: FormData): Promise<CareState> {
  try {
    const slug = String(form.get("slug") ?? "");
    const customer = String(form.get("customer") ?? "");
    await who(slug, customer);
    const budget = String(form.get("budget") ?? "").trim().slice(0, 60);
    const goal = String(form.get("goal") ?? "").trim().slice(0, 2000);
    const body = [`Please add Google Ads management to my package.`, budget ? `Monthly ad budget I have in mind: ${budget}` : null, goal ? `What I want from it: ${goal}` : null].filter(Boolean).join("\n\n");
    const supabase = await createClient();
    const { data: id, error } = await supabase.rpc("portal_raise_ticket", { p_customer: customer, p_subject: "Add Google Ads to my package", p_body: body, p_website: null });
    if (error) throw new Error(error.message);
    const svc = createServiceClient();
    await svc.from("support_tickets").update({ kind: "project", billing: "quote" }).eq("id", id as string).then((r) => r.error && svc.from("support_tickets").update({ kind: "project" }).eq("id", id as string));
    revalidatePath(`/p/${slug}`);
    return { ok: true, id: id as string };
  } catch (e) { return { error: e instanceof Error ? e.message : String(e) }; }
}

/** Save the client's home layout: the tiles in their order, and the ones they've hidden. */
export async function savePrefs(slug: string, customer: string, order: string[], hidden: string[]): Promise<CareState> {
  try {
    const ctx = await who(slug, customer);
    const isTile = (x: unknown): x is HomeTile => typeof x === "string" && (HOME_TILES as readonly string[]).includes(x);
    const prefs = { order: [...new Set(order.filter(isTile))], hidden: [...new Set(hidden.filter(isTile))] };
    const svc = createServiceClient();
    const { error } = await svc.from("customers").update({ portal_prefs: prefs }).in("id", ctx.customerIds).eq("organisation_id", ctx.org.id);
    if (error) throw new Error(/portal_prefs/.test(error.message) ? UPDATE_NEEDED : error.message);
    revalidatePath(`/p/${slug}`);
    return { ok: true };
  } catch (e) { return { error: e instanceof Error ? e.message : String(e) }; }
}
