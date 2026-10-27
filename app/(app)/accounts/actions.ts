"use server";

import { revalidatePath } from "next/cache";
import { canManage, requireOrg } from "@/lib/context";
import { readTemplates, type Template } from "@/lib/accounts/core";

/** Accounts: notes, calls, promises and next steps for customers who owe money; chasing emails; templates. */
type R<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
const err = (e: unknown) => {
  const m = e instanceof Error ? e.message : String(e);
  return /collection_notes|collection_emails/.test(m) && /does not exist|could not find/i.test(m) ? "Accounts needs the 0072 database update first." : m;
};
const UUID = /^[0-9a-f-]{36}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const t = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) || null : null);

async function accounts() {
  const ctx = await requireOrg();
  if (!canManage(ctx.role)) throw new Error("Only owners, admins and managers can use Accounts.");
  return ctx;
}

export interface NoteInput {
  kind: "note" | "call" | "email" | "sms" | "promise" | "dispute" | "plan";
  body?: string | null; invoiceId?: string | null;
  promiseDate?: string | null; promiseAmount?: number | string | null; remind?: boolean;
  nextStep?: string | null; nextStepDue?: string | null;
}

export async function addCollectionNote(customerId: string, n: NoteInput): Promise<R> {
  try {
    const { supabase, org, user } = await accounts();
    if (!UUID.test(customerId)) throw new Error("Refresh and try again.");
    const kind = ["note", "call", "email", "sms", "promise", "dispute", "plan"].includes(n.kind) ? n.kind : "note";
    const promiseDate = n.promiseDate && DATE.test(n.promiseDate) ? n.promiseDate : null;
    if (kind === "promise" && !promiseDate) throw new Error("Choose the day they said they'd pay.");
    const amount = n.promiseAmount === "" || n.promiseAmount == null ? null : Math.round(Number(n.promiseAmount) * 100) / 100;
    const row = {
      organisation_id: org.id, customer_id: customerId, invoice_id: n.invoiceId && UUID.test(n.invoiceId) ? n.invoiceId : null, kind, body: t(n.body, 4000),
      promise_date: promiseDate, promise_amount: amount != null && Number.isFinite(amount) && amount > 0 ? amount : null, remind: kind === "promise" && n.remind !== false,
      next_step: t(n.nextStep, 300), next_step_due: n.nextStepDue && DATE.test(n.nextStepDue) ? n.nextStepDue : null, created_by: user.id,
    };
    if (!row.body && !row.next_step && kind !== "promise") throw new Error("Write what happened or the next step.");
    // a new next step replaces the open one
    if (row.next_step) await supabase.from("collection_notes").update({ done_at: new Date().toISOString() }).eq("organisation_id", org.id).eq("customer_id", customerId).not("next_step", "is", null).is("done_at", null);
    const { error } = await supabase.from("collection_notes").insert(row);
    if (error) throw new Error(error.message);
    revalidatePath("/accounts", "layout");
    return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export async function completeStep(noteId: string): Promise<R> {
  try {
    const { supabase, org } = await accounts();
    if (!UUID.test(noteId)) throw new Error("Refresh and try again.");
    const { error } = await supabase.from("collection_notes").update({ done_at: new Date().toISOString() }).eq("id", noteId).eq("organisation_id", org.id);
    if (error) throw new Error(error.message);
    revalidatePath("/accounts", "layout");
    return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export async function cancelPromiseReminder(noteId: string): Promise<R> {
  try {
    const { supabase, org } = await accounts();
    if (!UUID.test(noteId)) throw new Error("Refresh and try again.");
    const { error } = await supabase.from("collection_notes").update({ remind: false }).eq("id", noteId).eq("organisation_id", org.id).is("reminded_at", null);
    if (error) throw new Error(error.message);
    revalidatePath("/accounts", "layout");
    return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: err(e) }; }
}

/** The template filled in for an invoice, to check before sending. */
export async function draftChase(invoiceId: string, template: string): Promise<R<{ to: string[]; subject: string; message: string }>> {
  try {
    const { supabase, org } = await accounts();
    if (!UUID.test(invoiceId)) throw new Error("Choose an invoice.");
    const { draftFor } = await import("@/lib/accounts/server");
    const d = await draftFor(supabase, org.id, invoiceId, template);
    return { ok: true, data: { to: d.to, subject: d.subject, message: d.message } };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export async function sendChaseEmail(invoiceId: string, template: string, subject: string, message: string): Promise<R<string>> {
  try {
    const { supabase, org, user } = await accounts();
    if (!UUID.test(invoiceId)) throw new Error("Choose an invoice.");
    const s = t(subject, 200), m = t(message, 6000);
    if (!s || !m) throw new Error("Add a subject and a message.");
    const { sendChase } = await import("@/lib/accounts/server");
    const r = await sendChase(supabase, { orgId: org.id, invoiceId, template: /^[a-z0-9_-]{2,30}$/.test(template) ? template : "custom", subject: s, message: m, kind: "manual", sentBy: user.id });
    revalidatePath("/accounts", "layout");
    return { ok: true, data: `Sent to ${r.to.join(", ")}${r.via === "gmail" ? " from your Gmail" : ""}.` };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export async function saveTemplates(list: Template[]): Promise<R> {
  try {
    const { supabase, org } = await accounts();
    const clean = readTemplates({ collections: { templates: list } });
    const { data, error: e1 } = await supabase.from("organisations").select("settings").eq("id", org.id).single();
    if (e1) throw new Error(e1.message);
    const settings = (data?.settings ?? {}) as Record<string, unknown>;
    const col = (settings.collections && typeof settings.collections === "object" ? settings.collections : {}) as Record<string, unknown>;
    const { error } = await supabase.from("organisations").update({ settings: { ...settings, collections: { ...col, templates: clean } } }).eq("id", org.id);
    if (error) throw new Error(error.message);
    revalidatePath("/accounts", "layout");
    return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: err(e) }; }
}
