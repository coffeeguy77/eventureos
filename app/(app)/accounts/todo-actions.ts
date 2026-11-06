"use server";

import { revalidatePath } from "next/cache";
import { canManage, requireOrg } from "@/lib/context";
import { actorName, logActivity } from "@/lib/activity";
import { zonedTimeUTC } from "@/lib/format";
import { nerdJob, nerdJobTicket } from "@/lib/accounts/nerd-jobs";

type R<T = string> = { ok: true; data: T } | { ok: false; error: string };
const UUID = /^[0-9a-f-]{36}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: e instanceof Error ? e.message : String(e) });

async function accounts() {
  const ctx = await requireOrg();
  if (!canManage(ctx.role)) throw new Error("Only owners, admins and managers can use Accounts.");
  return ctx;
}
const refresh = (customerId?: string | null) => {
  revalidatePath("/accounts/todo");
  revalidatePath("/tasks");
  if (customerId) revalidatePath(`/accounts/${customerId}`);
};

/** A to-do for me on this customer (e.g. "Ring Donald back Friday"). Shows on Accounts → To-do and in Tasks. */
export async function addAccountTodo(customerId: string | null, title: string, due: string | null): Promise<R> {
  try {
    const { supabase, org, user, profile } = await accounts();
    const text = String(title ?? "").trim().slice(0, 300);
    if (!text) throw new Error("What needs doing?");
    const cid = customerId && UUID.test(customerId) ? customerId : null;
    const dueAt = due && DATE.test(due) ? zonedTimeUTC(due, "09:00", org.timezone) : null;
    const { data, error } = await supabase.from("tasks").insert({
      organisation_id: org.id, title: text, assigned_to: user.id, created_by: user.id, customer_id: cid, due_at: dueAt, priority: "normal",
    }).select("id").single();
    if (error) throw new Error(`Couldn't add it: ${error.message}`);
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "task.created", entityType: "task", entityId: data.id, customerId: cid, summary: `${actorName(profile)} added to-do “${text}”` });
    refresh(cid);
    return { ok: true, data: data.id as string };
  } catch (e) { return fail(e); }
}

export async function setAccountTodo(id: string, done: boolean): Promise<R> {
  try {
    const { supabase, org, user, profile } = await accounts();
    if (!UUID.test(id)) throw new Error("Refresh and try again.");
    const { data, error } = await supabase.from("tasks").update({ status: done ? "done" : "open", completed_at: done ? new Date().toISOString() : null })
      .eq("id", id).eq("organisation_id", org.id).select("title, customer_id").single();
    if (error) throw new Error(error.message);
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: done ? "task.completed" : "task.reopened", entityType: "task", entityId: id, customerId: data.customer_id, summary: `${actorName(profile)} ${done ? "completed" : "reopened"} “${data.title}”` });
    refresh(data.customer_id as string | null);
    return { ok: true, data: "ok" };
  } catch (e) { return fail(e); }
}

export interface NerdJobInput { job: string; site: string; reason: string; note: string; title: string; due?: string | null }

/** Hand a job to Nerd Herd (delete / suspend a website, or anything else) — opens a ticket on this customer and tells the team. */
export async function raiseNerdJob(customerId: string, i: NerdJobInput): Promise<R<{ id: string; number: number }>> {
  try {
    const { supabase, org, user, profile } = await accounts();
    if (!UUID.test(customerId)) throw new Error("Refresh and try again.");
    const j = nerdJob(i.job);
    if (!j) throw new Error("Choose what Nerd Herd needs to do.");
    const { data: cust } = await supabase.from("customers").select("id, name").eq("id", customerId).eq("organisation_id", org.id).maybeSingle();
    if (!cust) throw new Error("This customer isn't there any more.");
    if (j.site && !String(i.site ?? "").trim()) throw new Error("Which website? Pick it or type it in.");
    if (j.key === "other" && !String(i.title ?? "").trim()) throw new Error("Say what needs doing.");
    if (j.reasons.length && !String(i.reason ?? "").trim()) throw new Error("Choose a reason.");
    const by = actorName(profile);
    const t = nerdJobTicket({ job: j.key, site: String(i.site ?? ""), reason: String(i.reason ?? "").slice(0, 200), note: String(i.note ?? "").slice(0, 4000), title: String(i.title ?? ""), by, customer: cust.name as string });
    // Link the website record when it's one of theirs
    let websiteId: string | null = null;
    if (t.site) {
      const { data: w } = await supabase.from("websites").select("id, domain").eq("organisation_id", org.id).eq("customer_id", customerId).limit(50);
      websiteId = ((w ?? []) as { id: string; domain: string }[]).find((x) => x.domain.replace(/^www\./, "").toLowerCase() === t.site)?.id ?? null;
    }
    const { readNerd } = await import("@/lib/nerdherd/core");
    const { data: tk, error } = await supabase.from("support_tickets").insert({
      organisation_id: org.id, subject: t.subject, kind: j.kind, priority: "normal", status: "new", source: "manual",
      assigned_to: readNerd(org.settings).defaultAssignee, // jobs from Accounts go to the default tech (Nerd Herd settings)
      customer_id: customerId, website_id: websiteId, due_date: i.due && DATE.test(i.due) ? i.due : null, created_by: user.id,
    }).select("id, number").single();
    if (error) throw new Error(`Couldn't create the job: ${error.message}`);
    await supabase.from("support_ticket_updates").insert({ organisation_id: org.id, ticket_id: tk.id, kind: "note", body: t.note, author_id: user.id, author_name: by });
    await supabase.from("notifications").insert({
      organisation_id: org.id, type: "ticket.new", title: `Nerd Herd job #${tk.number} from ${by}`.slice(0, 200), body: t.subject.slice(0, 140),
      link: `/nerd-herd/tickets/${tk.id}`, entity_type: "support_ticket", entity_id: tk.id,
    }).then(() => null, () => null);
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "ticket.created", entityType: "support_ticket", entityId: tk.id, customerId, summary: `${by} sent Nerd Herd job #${tk.number}: ${t.subject}` });
    try {
      const { createServiceClient } = await import("@/lib/integrations/runtime");
      const { alertStaff } = await import("@/lib/nerdherd/mail");
      await alertStaff(createServiceClient(), org.id, tk.id as string, `New job from ${by} (Accounts) — assigned to you`, t.note.split("\n"), { except: user.id });
    } catch (e) { console.error("[accounts] nerd herd alert:", e); }
    refresh(customerId);
    revalidatePath("/nerd-herd", "layout");
    return { ok: true, data: { id: tk.id as string, number: Number(tk.number) } };
  } catch (e) { return fail(e); }
}
