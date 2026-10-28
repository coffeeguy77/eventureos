"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isSlug, isUuid } from "../portal-data";

/** Client portal: raise a support ticket, or reply on one. The database checks it's the client's own. */
export type SupportState = { ok?: boolean; error?: string; id?: string };

export async function raiseTicket(_prev: SupportState, form: FormData): Promise<SupportState> {
  const slug = String(form.get("slug") ?? "");
  const customer = String(form.get("customer") ?? "");
  const site = String(form.get("website") ?? "");
  const subject = String(form.get("subject") ?? "").trim();
  const body = String(form.get("body") ?? "").trim();
  if (!isSlug(slug) || !isUuid(customer)) return { error: "This page isn't valid — refresh and try again." };
  if (!subject) return { error: "Tell us briefly what you need help with." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("portal_raise_ticket", { p_customer: customer, p_subject: subject.slice(0, 300), p_body: body.slice(0, 20000) || subject, p_website: isUuid(site) ? site : null });
  if (error) return { error: /Not allowed/.test(error.message) ? "You don't have access to raise tickets here." : error.message };
  revalidatePath(`/p/${slug}/support`);
  return { ok: true, id: data as string };
}

export async function replyTicket(_prev: SupportState, form: FormData): Promise<SupportState> {
  const slug = String(form.get("slug") ?? "");
  const id = String(form.get("ticket") ?? "");
  const body = String(form.get("body") ?? "").trim();
  if (!isSlug(slug) || !isUuid(id)) return { error: "This page isn't valid — refresh and try again." };
  if (!body) return { error: "Write a message first." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("portal_reply_ticket", { p_ticket: id, p_body: body.slice(0, 20000) });
  if (error) return { error: /Not allowed/.test(error.message) ? "You don't have access to this ticket." : error.message };
  revalidatePath(`/p/${slug}/support/${id}`);
  return { ok: true };
}
