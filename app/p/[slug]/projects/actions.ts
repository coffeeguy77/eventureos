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

/* ------------------------------------------------------------------ the client's own team */

export type TeamState = { ok?: boolean; error?: string; message?: string };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Only someone with Accounts access to the project's client can manage its team. */
async function teamCtx(slug: string, projectId: string) {
  if (!isSlug(slug) || !isUuid(projectId)) throw new Error("This page isn't valid — refresh and try again.");
  const ctx = await requirePortal(slug);
  const db = createServiceClient();
  const { data: p } = await db.from("nh_projects").select("id, name, customer_id, portal").eq("id", projectId).eq("organisation_id", ctx.org.id).maybeSingle();
  if (!p || !p.portal || !ctx.billingCustomerIds.includes(p.customer_id as string)) throw new Error("Only your account's main contact can change who has access.");
  return { ctx, db, p: p as { id: string; name: string; customer_id: string } };
}

/** Add one of the client's staff: Team access (the work and requests — no prices or hours), and email them a sign-in link. */
export async function addTeamMember(_prev: TeamState, form: FormData): Promise<TeamState> {
  try {
    const slug = String(form.get("slug") ?? ""), projectId = String(form.get("project") ?? "");
    const { ctx, db, p } = await teamCtx(slug, projectId);
    const first = String(form.get("first_name") ?? "").trim().slice(0, 100);
    const last = String(form.get("last_name") ?? "").trim().slice(0, 100) || null;
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    if (!first) return { error: "Enter their first name." };
    if (!EMAIL.test(email) || email.length > 254) return { error: "Enter a valid email address." };
    const { count } = await db.from("contacts").select("id", { count: "exact", head: true }).eq("customer_id", p.customer_id).eq("portal_role", "team");
    if ((count ?? 0) >= 50) return { error: "You've 50 people with access already — remove someone first." };
    const { data: had } = await db.from("contacts").select("id, portal_role").eq("organisation_id", ctx.org.id).eq("customer_id", p.customer_id).ilike("email", email).maybeSingle();
    if (had && had.portal_role === "accounts") return { error: `${email} already has full access.` };
    if (had) {
      const { error } = await db.from("contacts").update({ portal_role: "team", first_name: first, ...(last ? { last_name: last } : {}) }).eq("id", had.id);
      if (error) return { error: error.message };
    } else {
      const { error } = await db.from("contacts").insert({ organisation_id: ctx.org.id, customer_id: p.customer_id, first_name: first, last_name: last, email, is_primary: false, portal_role: "team" });
      if (error) return { error: /portal_role/.test(error.message) ? "This isn't switched on yet — ask us to finish setting it up." : error.message };
    }
    const by = ctx.contactName ?? ctx.user.email;
    await db.from("activity_logs").insert({ organisation_id: ctx.org.id, actor_id: ctx.user.id, actor_type: "customer", actor_label: by, action: "portal.person_added", entity_type: "customer", entity_id: p.customer_id, customer_id: p.customer_id,
      summary: `${by} gave ${first} (${email}) access to “${p.name}” in the portal` }).then(() => undefined, () => undefined);
    const { data: o } = await db.from("organisations").select("name, slug, brand_colour, logo_url, contact_email").eq("id", ctx.org.id).single();
    const { sendProjectPortalInvite } = await import("@/lib/email/portal-invite");
    const problem = await sendProjectPortalInvite({ org: o as { name: string; slug: string }, project: { id: p.id, name: p.name }, to: email, firstName: first, invitedBy: by, replyTo: ctx.user.email });
    revalidatePath(`/p/${slug}/projects/${p.id}`);
    return { ok: true, message: problem ? `${first} can sign in with ${email}, but the email didn't go (${problem}). Send them the link to this page.` : `${first} has access. We've emailed them a sign-in link.` };
  } catch (e) { return { error: e instanceof Error ? e.message : String(e) }; }
}

/** Take someone's access away (Team people only — never the main contact). They're signed out at once. */
export async function removeTeamMember(slug: string, projectId: string, contactId: string): Promise<TeamState> {
  try {
    const { ctx, db, p } = await teamCtx(slug, projectId);
    if (!isUuid(contactId)) return { error: "Refresh and try again." };
    const { data: c } = await db.from("contacts").select("id, first_name, email, portal_role, portal_user_id").eq("id", contactId).eq("customer_id", p.customer_id).maybeSingle();
    if (!c || c.portal_role !== "team") return { error: "You can only remove people you've given team access to." };
    if (c.portal_user_id === ctx.user.id) return { error: "You can't remove yourself." };
    const { error } = await db.from("contacts").update({ portal_role: "removed", portal_user_id: null }).eq("id", c.id);
    if (error) return { error: /check constraint|removed/.test(error.message) ? "This isn't switched on yet — ask us to finish setting it up." : error.message };
    const by = ctx.contactName ?? ctx.user.email;
    await db.from("activity_logs").insert({ organisation_id: ctx.org.id, actor_id: ctx.user.id, actor_type: "customer", actor_label: by, action: "portal.person_removed", entity_type: "customer", entity_id: p.customer_id, customer_id: p.customer_id,
      summary: `${by} removed ${c.first_name} (${c.email}) from the portal` }).then(() => undefined, () => undefined);
    revalidatePath(`/p/${slug}/projects/${p.id}`);
    return { ok: true };
  } catch (e) { return { error: e instanceof Error ? e.message : String(e) }; }
}
