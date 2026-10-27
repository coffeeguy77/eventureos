"use server";

import { revalidatePath } from "next/cache";
import { canManage, requireOrg } from "@/lib/context";
import { createServiceClient } from "@/lib/integrations/runtime";
import { appBaseUrl } from "@/lib/integrations/registry";
import { addDaysISO, todayISO } from "@/lib/format";
import { actorName, logActivity } from "@/lib/activity";
import { cleanExtras, cleanItems, priceJob, readPrinting, type Extra, type PrintItem } from "@/lib/printing/core";

/** Printing (back end): jobs, quotes, artwork files, invoices and the printing settings. */
type R<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
const err = (e: unknown) => {
  const m = e instanceof Error ? e.message : String(e);
  return /print_jobs|print_files/.test(m) && /does not exist|could not find/i.test(m) ? "Printing needs the 0073 database update first." : m;
};
const UUID = /^[0-9a-f-]{36}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^[^\s@<>"',;:()]+@[^\s@<>"',;:()]+\.[^\s@<>"',;:()]{2,}$/;
const t = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) || null : null);
export type JobStatus = "new" | "quoted" | "approved" | "printing" | "ready" | "done" | "cancelled";
const STATUSES: JobStatus[] = ["new", "quoted", "approved", "printing", "ready", "done", "cancelled"];

async function printing() {
  const ctx = await requireOrg();
  if (!canManage(ctx.role)) throw new Error("Only owners, admins and managers can use Printing.");
  return ctx;
}
async function loadJob(id: string) {
  if (!UUID.test(id)) throw new Error("Refresh and try again.");
  const ctx = await printing();
  const { data: job, error } = await ctx.supabase.from("print_jobs").select("*").eq("id", id).eq("organisation_id", ctx.org.id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!job) throw new Error("That print job no longer exists.");
  return { ctx, job: job as Record<string, unknown> & { id: string; number: string; status: JobStatus } };
}
const done = (id?: string) => { revalidatePath("/printing"); if (id) revalidatePath(`/printing/${id}`); };

export interface JobInput {
  title?: string | null; details?: string | null; status?: JobStatus;
  contact_name?: string | null; contact_email?: string | null; contact_phone?: string | null; company?: string | null; customer_id?: string | null;
  items?: PrintItem[]; setup?: boolean; cut?: boolean; extras?: Extra[]; needed_by?: string | null; internal_notes?: string | null;
}

function rowFrom(i: JobInput, settings: unknown) {
  const items = cleanItems(i.items), extras = cleanExtras(i.extras);
  const email = t(i.contact_email, 200)?.toLowerCase() ?? null;
  if (email && !EMAIL.test(email)) throw new Error("That email address doesn't look right.");
  const price = priceJob({ items, setup: i.setup !== false, cut: !!i.cut, extras }, readPrinting(settings));
  return {
    title: t(i.title, 120) ?? (items[0]?.description || "Print job"), details: t(i.details, 4000),
    contact_name: t(i.contact_name, 120), contact_email: email, contact_phone: t(i.contact_phone, 40), company: t(i.company, 160),
    customer_id: i.customer_id && UUID.test(i.customer_id) ? i.customer_id : null,
    items, extras, setup: i.setup !== false, cut: !!i.cut, needed_by: i.needed_by && DATE.test(i.needed_by) ? i.needed_by : null,
    internal_notes: t(i.internal_notes, 4000), price_ex_gst: price.exGst, gst: price.gst, total: price.total,
  };
}

export async function createPrintJob(i: JobInput): Promise<R<string>> {
  try {
    const { supabase, org, user } = await printing();
    const row = rowFrom(i, org.settings);
    const { data, error } = await supabase.from("print_jobs").insert({ ...row, organisation_id: org.id, source: "manual", created_by: user.id }).select("id").single();
    if (error) throw new Error(error.message);
    done(); return { ok: true, data: data.id as string };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export async function savePrintJob(id: string, i: JobInput): Promise<R> {
  try {
    const { ctx, job } = await loadJob(id);
    const row = rowFrom(i, ctx.org.settings);
    const status = i.status && STATUSES.includes(i.status) ? i.status : job.status;
    const { error } = await ctx.supabase.from("print_jobs").update({ ...row, status, updated_at: new Date().toISOString() }).eq("id", job.id);
    if (error) throw new Error(error.message);
    done(job.id); return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export async function setPrintStatus(id: string, status: JobStatus): Promise<R> {
  try {
    if (!STATUSES.includes(status)) throw new Error("Refresh and try again.");
    const { ctx, job } = await loadJob(id);
    const { error } = await ctx.supabase.from("print_jobs").update({ status, updated_at: new Date().toISOString() }).eq("id", job.id);
    if (error) throw new Error(error.message);
    done(job.id); return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: err(e) }; }
}

const money = (n: number) => `$${n.toFixed(2)}`;

/** Email the quote with a link to the customer's job page (approve, send more artwork). Saves first. */
export async function emailPrintQuote(id: string, note?: string | null): Promise<R<string>> {
  try {
    const { ctx, job } = await loadJob(id);
    const to = String(job.contact_email ?? "");
    if (!EMAIL.test(to)) throw new Error("Add the customer's email address first.");
    const p = readPrinting(ctx.org.settings);
    const price = priceJob({ items: cleanItems(job.items), setup: !!job.setup, cut: !!job.cut, extras: cleanExtras(job.extras) }, p);
    if (!(price.total > 0)) throw new Error("Add the sizes (or an extra charge) so the quote has a price.");
    const { printQuoteEmail } = await import("@/lib/email/templates");
    const { sendAsBusiness } = await import("@/lib/email/business-send");
    const url = `${appBaseUrl()}/hire/${ctx.org.slug}/printing/job/${job.id}?t=${job.upload_token as string}`;
    const m = printQuoteEmail({
      businessName: ctx.org.name, firstName: String(job.contact_name ?? "").split(/\s+/)[0] || "there", number: job.number,
      lines: price.lines.map((l) => ({ description: l.description, amount: money(l.amount) })), exGst: money(price.exGst), gst: money(price.gst), total: money(price.total),
      note: t(note, 1000), url, brand: ctx.org.brand_colour, logoUrl: ctx.org.logo_url,
    });
    const r = await sendAsBusiness(createServiceClient(), ctx.org.id, { to: [to], subject: `Quote for print job ${job.number} — ${money(price.total)} inc GST`, html: m.html, text: m.text });
    await ctx.supabase.from("print_jobs").update({ quote_sent_at: new Date().toISOString(), status: job.status === "new" ? "quoted" : job.status, price_ex_gst: price.exGst, gst: price.gst, total: price.total, updated_at: new Date().toISOString() }).eq("id", job.id);
    done(job.id); return { ok: true, data: `Quote emailed to ${to}${r.via === "gmail" ? " from your Gmail" : ""}.` };
  } catch (e) { return { ok: false, error: err(e) }; }
}

/** A draft invoice with the job's lines (prices ex GST, plus GST). Uses — or adds — the client. */
export async function invoicePrintJob(id: string): Promise<R<string>> {
  try {
    const { ctx, job } = await loadJob(id);
    const { supabase, org, user, profile } = ctx;
    if (job.invoice_id) return { ok: true, data: job.invoice_id as string };
    const p = readPrinting(org.settings);
    const price = priceJob({ items: cleanItems(job.items), setup: !!job.setup, cut: !!job.cut, extras: cleanExtras(job.extras) }, p);
    if (!(price.total > 0)) throw new Error("This job has no price to invoice yet.");
    let customerId = (job.customer_id as string | null) ?? null;
    if (!customerId) {
      const email = (job.contact_email as string | null) ?? null;
      if (email) {
        const { data: same } = await supabase.from("customers").select("id").eq("organisation_id", org.id).ilike("email", email).limit(1).maybeSingle();
        customerId = (same?.id as string) ?? null;
      }
      if (!customerId) {
        const name = String(job.company || job.contact_name || "").trim();
        if (!name) throw new Error("Add the customer's name (or choose a client) first.");
        const { data: c, error } = await supabase.from("customers").insert({ organisation_id: org.id, kind: job.company ? "company" : "individual", name, company: (job.company as string) ?? null, email, phone: (job.contact_phone as string) ?? null, created_by: user.id }).select("id").single();
        if (error) throw new Error(error.message);
        customerId = c.id as string;
      }
      await supabase.from("print_jobs").update({ customer_id: customerId }).eq("id", job.id);
    }
    const lines = price.lines.map((l, k) => ({ description: k === 0 ? `Print job ${job.number}: ${job.title as string}\n${l.description}` : l.description, quantity: 1, unit_amount: l.amount, line_amount: l.amount }));
    const today = todayISO(org.timezone);
    const terms = Math.max(0, Number((org.settings as { default_payment_terms_days?: number }).default_payment_terms_days ?? 14) || 0);
    const { data: inv, error } = await supabase.from("invoices").insert({
      organisation_id: org.id, customer_id: customerId, kind: "full", status: "draft", issue_date: today, due_date: addDaysISO(today, terms),
      subtotal: price.exGst, tax_total: price.gst, total: price.total, currency: org.currency, reference: job.number, line_items: lines, created_by: user.id,
    }).select("id, number").single();
    if (error) throw new Error(error.message);
    await supabase.from("print_jobs").update({ invoice_id: inv.id, updated_at: new Date().toISOString() }).eq("id", job.id);
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "invoice.created", entityType: "invoice", entityId: inv.id as string, customerId,
      summary: `${actorName(profile)} raised draft invoice ${inv.number} for print job ${job.number}` });
    done(job.id); revalidatePath("/invoices");
    return { ok: true, data: inv.id as string };
  } catch (e) { return { ok: false, error: err(e) }; }
}

/** After staff upload artwork straight to storage: record the files that arrived. */
export async function recordStaffFiles(id: string, files: { name: string; path: string; size: number; type?: string }[]): Promise<R<number>> {
  try {
    const { ctx, job } = await loadJob(id);
    const prefix = `${ctx.org.id}/${job.id}/`;
    const rows = (Array.isArray(files) ? files : []).slice(0, 20).filter((f) => typeof f.path === "string" && f.path.startsWith(prefix) && !f.path.slice(prefix.length).includes("/"))
      .map((f) => ({ organisation_id: ctx.org.id, job_id: job.id, name: t(f.name, 200) ?? "artwork", path: f.path, size: Number(f.size) || null, content_type: t(f.type, 120), uploaded_by: "staff" }));
    if (rows.length) { const { error } = await ctx.supabase.from("print_files").insert(rows); if (error) throw new Error(error.message); }
    done(job.id); return { ok: true, data: rows.length };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export async function deletePrintFile(fileId: string): Promise<R> {
  try {
    if (!UUID.test(fileId)) throw new Error("Refresh and try again.");
    const ctx = await printing();
    const { data: f } = await ctx.supabase.from("print_files").select("id, job_id, path").eq("id", fileId).eq("organisation_id", ctx.org.id).maybeSingle();
    if (!f) throw new Error("That file is already gone.");
    await createServiceClient().storage.from("print-artwork").remove([f.path as string]);
    await ctx.supabase.from("print_files").delete().eq("id", f.id);
    done(f.job_id as string); return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export async function savePrintSettings(input: { enabled: boolean; firstMetre: number; perMetre: number; setup: number; cut: number; rollWidth: number; rounding: string; gstPct: number; intro?: string | null }): Promise<R> {
  try {
    const { supabase, org } = await printing();
    const { data, error: e1 } = await supabase.from("organisations").select("settings").eq("id", org.id).single();
    if (e1) throw new Error(e1.message);
    const settings = (data?.settings ?? {}) as Record<string, unknown>;
    const clean = readPrinting({ printing: input });
    const { error } = await supabase.from("organisations").update({ settings: { ...settings, printing: clean } }).eq("id", org.id);
    if (error) throw new Error(error.message);
    revalidatePath("/printing"); revalidatePath(`/hire/${org.slug}`, "layout");
    return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: err(e) }; }
}
