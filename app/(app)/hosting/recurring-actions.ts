"use server";

import { revalidatePath } from "next/cache";
import { canManage, requireOrg } from "@/lib/context";
import { createServiceClient } from "@/lib/integrations/runtime";
import { todayISO } from "@/lib/format";
import { linesTotal, type DueType, type Line, type Unit } from "@/lib/recurring/core";

/** Recurring invoices: import from Xero, edit, switch on/off. */
type R<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
const err = (e: unknown) => {
  const m = e instanceof Error ? e.message : String(e);
  return /recurring_invoices|recurring_id/.test(m) && /does not exist|could not find/i.test(m) ? "Recurring invoices need the 0075 database update first." : m;
};
const UUID = /^[0-9a-f-]{36}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const t = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) || null : null);

async function office() {
  const ctx = await requireOrg();
  if (!canManage(ctx.role)) throw new Error("Only owners, admins and managers can change recurring invoices.");
  return ctx;
}
const done = (id?: string) => { revalidatePath("/hosting/recurring"); if (id) revalidatePath(`/hosting/recurring/${id}`); };

export async function importFromXero(): Promise<R<string>> {
  try {
    const { org, user } = await office();
    const db = createServiceClient();
    const { buildContext } = await import("@/lib/integrations/sync-runner");
    const { importRepeatingFromXero } = await import("@/lib/recurring/server");
    const r = await importRepeatingFromXero(await buildContext(db, "service", org.id, "xero", user.id));
    done();
    const parts = [`${r.found} repeating invoices in Xero`, `${r.imported} imported (paused)`];
    if (r.skipped) parts.push(`${r.skipped} already here`);
    if (r.unmatched.length) parts.push(`${r.unmatched.length} not imported because their Xero contact isn't linked to a client yet: ${r.unmatched.slice(0, 8).join(", ")}${r.unmatched.length > 8 ? "…" : ""}`);
    return { ok: true, data: parts.join(" · ") + "." };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export interface RecurringInput {
  customer_id: string; name: string; category: string; status: "active" | "paused" | "ended";
  every: number; unit: Unit; next_date: string; end_date?: string | null; due_type: DueType; due_days: number;
  send_mode: "draft" | "authorise" | "email"; reference?: string | null; line_items: Line[]; hosting_account_id?: string | null; notes?: string | null;
}

function clean(i: RecurringInput, today: string) {
  if (!UUID.test(i.customer_id ?? "")) throw new Error("Choose the client.");
  const name = t(i.name, 120); if (!name) throw new Error("Give it a name, e.g. Hosting — example.com.au");
  if (!DATE.test(i.next_date ?? "")) throw new Error("Choose the next invoice date.");
  const status = ["active", "paused", "ended"].includes(i.status) ? i.status : "paused";
  if (status === "active" && i.next_date < today) throw new Error(`The next date (${i.next_date}) has passed — set it to today or later before switching this on, so nothing is back-billed by surprise.`);
  const lines = (Array.isArray(i.line_items) ? i.line_items : []).slice(0, 50).map((l, k) => {
    const description = String(l.description ?? "").trim().slice(0, 4000); const quantity = Number(l.quantity), unit = Math.round(Number(l.unit_amount) * 100) / 100;
    if (!description) throw new Error(`Line ${k + 1} needs a description.`);
    if (!(quantity > 0)) throw new Error(`Line ${k + 1}: quantity above zero.`);
    if (!Number.isFinite(unit)) throw new Error(`Line ${k + 1}: enter a price.`);
    return { description, quantity, unit_amount: unit, tax_rate: Number(l.tax_rate) === 0 ? 0 : 10, item_code: t(l.item_code, 30), account_code: t(l.account_code, 10), inc: true } as Line;
  });
  if (!lines.length) throw new Error("Add at least one line.");
  const total = linesTotal(lines);
  if (!(total > 0)) throw new Error("The total must be above zero.");
  const due_type: DueType = ["days_after", "days_after_month_end", "day_of_month", "day_of_next_month"].includes(i.due_type) ? i.due_type : "days_after";
  const unitV: Unit = i.unit === "week" ? "week" : "month";
  return {
    customer_id: i.customer_id, name, category: (t(i.category, 30) ?? "other").toLowerCase(), status,
    every: Math.min(60, Math.max(1, Math.round(Number(i.every) || 1))), unit: unitV, anchor_day: unitV === "month" ? Number(i.next_date.slice(8, 10)) : null,
    next_date: i.next_date, end_date: i.end_date && DATE.test(i.end_date) ? i.end_date : null, due_type, due_days: Math.min(365, Math.max(0, Math.round(Number(i.due_days) || 0))),
    send_mode: ["draft", "authorise", "email"].includes(i.send_mode) ? i.send_mode : "authorise", reference: t(i.reference, 255), line_items: lines, total,
    hosting_account_id: i.hosting_account_id && UUID.test(i.hosting_account_id) ? i.hosting_account_id : null, notes: t(i.notes, 4000), updated_at: new Date().toISOString(),
  };
}

export async function saveRecurring(id: string | null, i: RecurringInput): Promise<R<string>> {
  try {
    const { supabase, org, user } = await office();
    const row = clean(i, todayISO(org.timezone));
    const { data: c } = await supabase.from("customers").select("id").eq("id", row.customer_id).eq("organisation_id", org.id).maybeSingle();
    if (!c) throw new Error("That client couldn't be found.");
    if (id) {
      if (!UUID.test(id)) throw new Error("Refresh and try again.");
      const { error } = await supabase.from("recurring_invoices").update(row).eq("id", id).eq("organisation_id", org.id);
      if (error) throw new Error(error.message);
      done(id); return { ok: true, data: id };
    }
    const { data, error } = await supabase.from("recurring_invoices").insert({ ...row, organisation_id: org.id, source: "manual", created_by: user.id }).select("id").single();
    if (error) throw new Error(error.message);
    done(); return { ok: true, data: data.id as string };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export async function setRecurringStatus(id: string, status: "active" | "paused" | "ended"): Promise<R> {
  try {
    const { supabase, org } = await office();
    if (!UUID.test(id) || !["active", "paused", "ended"].includes(status)) throw new Error("Refresh and try again.");
    const { data: r } = await supabase.from("recurring_invoices").select("next_date").eq("id", id).eq("organisation_id", org.id).maybeSingle();
    if (!r) throw new Error("That recurring invoice no longer exists.");
    if (status === "active" && (r.next_date as string) < todayISO(org.timezone)) throw new Error(`Its next date (${r.next_date}) has passed — open it and set the next date first.`);
    const { error } = await supabase.from("recurring_invoices").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) throw new Error(error.message);
    done(id); return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: err(e) }; }
}
