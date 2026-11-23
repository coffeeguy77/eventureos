"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/integrations/runtime";
import { isSlug, isUuid, requirePortal } from "../portal-data";

/** Client portal — Projects: ask for something on a project (a change, a problem, a question). It becomes a support
 *  ticket tagged to the project, so every reply stays on it. requirePortal() proves who's asking. */
export type ProjectRequestState = { ok?: boolean; error?: string; id?: string };
const KIND: Record<string, string> = { change: "Change request", bug: "Something's not working", question: "Question", task: "New task" };

export async function requestOnProject(_prev: ProjectRequestState, form: FormData): Promise<ProjectRequestState> {
  const slug = String(form.get("slug") ?? ""), projectId = String(form.get("project") ?? "");
  const kind = String(form.get("kind") ?? "change");
  const subject = String(form.get("subject") ?? "").trim().slice(0, 280);
  const body = String(form.get("body") ?? "").trim().slice(0, 20000);
  if (!isSlug(slug) || !isUuid(projectId)) return { error: "This page isn't valid — refresh and try again." };
  if (!subject) return { error: "Give it a short title." };
  const ctx = await requirePortal(slug);
  const db = createServiceClient();
  const { data: p } = await db.from("nh_projects").select("id, name, customer_id, portal").eq("id", projectId).eq("organisation_id", ctx.org.id).maybeSingle();
  if (!p || !p.portal || !ctx.customerIds.includes(p.customer_id as string)) return { error: "You don't have access to that project." };
  const label = KIND[kind] ?? KIND.change;
  const { data, error } = await ctx.supabase.rpc("portal_raise_ticket", { p_customer: p.customer_id, p_subject: `${p.name}: ${subject}`.slice(0, 300), p_body: `${label}\n\n${body || subject}`, p_website: null });
  if (error) return { error: /Not allowed/.test(error.message) ? "You don't have access to ask for work here." : error.message };
  await db.from("support_tickets").update({ project_id: p.id }).eq("id", data as string).eq("organisation_id", ctx.org.id);
  await db.from("nh_projects").update({ updated_at: new Date().toISOString() }).eq("id", p.id);
  revalidatePath(`/p/${slug}/projects/${p.id}`);
  return { ok: true, id: data as string };
}
