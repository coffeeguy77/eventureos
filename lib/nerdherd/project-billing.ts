import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { todayISO } from "@/lib/format";
import { readNerd } from "./core";
import { loadMargins } from "./margins";
import { billLines, toEntry, toProject, type Project } from "./projects";

/**
 * Billing a project's time (Nerd Herd → Projects), shared by the office and the dev-chat API. Time goes onto the
 * project's draft invoice — one is started when there isn't one — and a draft's lines are rebuilt from its time.
 */
type Org = { id: string; currency: string; timezone: string; settings: unknown };
const r2 = (n: number) => Math.round(n * 100) / 100;

async function project(db: SupabaseClient, orgId: string, id: string): Promise<Project> {
  const { data, error } = await db.from("nh_projects").select("*").eq("id", id).eq("organisation_id", orgId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("That project doesn't exist.");
  return toProject(data as Record<string, unknown>);
}

/** Rebuild a draft project invoice's lines and totals from the time on it. */
export async function rebuildDraft(db: SupabaseClient, org: Org, projectId: string, invoiceId: string) {
  const p = await project(db, org.id, projectId);
  const { data: rows } = await db.from("nh_project_time").select("*").eq("billed_invoice_id", invoiceId);
  const s = readNerd(org.settings);
  const mg = await loadMargins(db, org.id, p.customer_id, org.settings);
  const b = billLines(((rows ?? []) as Record<string, unknown>[]).map(toEntry), p, mg.invoices.get(invoiceId) ?? mg.client, p.rate ?? s.hourlyRate, s.accountCode);
  if (!b.lines.length) return;
  const total = r2(b.lines.reduce((a, l) => a + l.line_amount, 0));
  const subtotal = r2(total / 1.1);
  await db.from("invoices").update({ line_items: b.lines, total, subtotal, tax_total: r2(total - subtotal) }).eq("id", invoiceId).eq("status", "draft");
}

/** Put every unbilled billable entry on the project's draft invoice (starting one if needed). null = nothing to bill. */
export async function billToDraft(db: SupabaseClient, org: Org, projectId: string, userId: string | null): Promise<{ id: string; number: string; created: boolean; entries: number; hours: number } | null> {
  const p = await project(db, org.id, projectId);
  const { data: rows, error } = await db.from("nh_project_time").select("*").eq("project_id", projectId).eq("billable", true).is("billed_invoice_id", null);
  if (error) throw new Error(error.message);
  const list = ((rows ?? []) as Record<string, unknown>[]).map(toEntry);
  if (!list.length) return null;
  const { data: open } = await db.from("invoices").select("id, number").eq("project_id", projectId).eq("organisation_id", org.id).eq("status", "draft").order("created_at", { ascending: false }).limit(1).maybeSingle();
  const s = readNerd(org.settings);
  const mg = await loadMargins(db, org.id, p.customer_id, org.settings);
  if (open) {
    await db.from("nh_project_time").update({ billed_invoice_id: open.id }).in("id", list.map((e) => e.id));
    await rebuildDraft(db, org, projectId, open.id as string);
    const b = billLines(list, p, mg.invoices.get(open.id as string) ?? mg.client, p.rate ?? s.hourlyRate, s.accountCode);
    return { id: open.id as string, number: open.number as string, created: false, entries: list.length, hours: b.hours };
  }
  const b = billLines(list, p, mg.client, p.rate ?? s.hourlyRate, s.accountCode);
  const total = r2(b.lines.reduce((a, l) => a + l.line_amount, 0));
  const subtotal = r2(total / 1.1);
  const today = todayISO(org.timezone);
  const terms = Number(((org.settings ?? {}) as { default_payment_terms_days?: unknown }).default_payment_terms_days) || 14;
  const due = new Date(Date.parse(`${today}T00:00:00Z`) + terms * 86_400_000).toISOString().slice(0, 10);
  const { data: inv, error: iErr } = await db.from("invoices").insert({
    organisation_id: org.id, customer_id: p.customer_id, project_id: p.id, kind: "full", status: "draft", issue_date: today, due_date: due,
    subtotal, tax_total: r2(total - subtotal), total, currency: org.currency, reference: p.name.slice(0, 100), line_items: b.lines, created_by: userId,
  }).select("id, number").single();
  if (iErr) throw new Error(`Couldn't raise the invoice: ${iErr.message}`);
  await db.from("nh_project_time").update({ billed_invoice_id: inv.id }).in("id", list.map((e) => e.id));
  return { id: inv.id as string, number: inv.number as string, created: true, entries: list.length, hours: b.hours };
}
