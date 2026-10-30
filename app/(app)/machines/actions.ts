"use server";

import { revalidatePath } from "next/cache";
import { canManage, requireOrg } from "@/lib/context";
import { addDaysISO, todayISO } from "@/lib/format";
import { actorName, logActivity } from "@/lib/activity";
import { cleanJobItems, cleanModel, jobTotal, JOB_STATUSES, readMachines, type JobItem, type MachineJobKind, type MachineJobStatus, type MachineModel } from "@/lib/machines/core";

/** Coffee machines (back end): service/repair jobs, quick sales, customers and settings. */
type R<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
const err = (e: unknown) => {
  const m = e instanceof Error ? e.message : String(e);
  return /machine_jobs/.test(m) && /does not exist|could not find/i.test(m) ? "Coffee machines needs the 0082 database update first." : m;
};
const UUID = /^[0-9a-f-]{36}$/i;
const EMAIL = /^[^\s@<>"',;:()]+@[^\s@<>"',;:()]+\.[^\s@<>"',;:()]{2,}$/;
const t = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) || null : null);
const KINDS: MachineJobKind[] = ["repair", "service", "install", "sale"];
const r2 = (n: number) => Math.round(n * 100) / 100;

async function machines() {
  const ctx = await requireOrg();
  if (!canManage(ctx.role)) throw new Error("Only owners, admins and managers can use Coffee machines.");
  return ctx;
}
const done = (id?: string) => { revalidatePath("/machines"); if (id) revalidatePath(`/machines/${id}`); };

export interface MachineJobInput {
  kind?: MachineJobKind; status?: MachineJobStatus; customer_id?: string | null;
  contact_name?: string | null; contact_email?: string | null; contact_phone?: string | null; company?: string | null; site_address?: string | null;
  brand?: string | null; model?: string | null; serial?: string | null; issue?: string | null; preferred?: string | null;
  booked_for?: string | null; callout?: boolean; hours?: number; items?: JobItem[]; internal_notes?: string | null;
}

function rowFrom(i: MachineJobInput, settings: unknown) {
  const email = t(i.contact_email, 200)?.toLowerCase() ?? null;
  if (email && !EMAIL.test(email)) throw new Error("That email address doesn't look right.");
  const kind = i.kind && KINDS.includes(i.kind) ? i.kind : "repair";
  const items = cleanJobItems(i.items);
  const hours = r2(Math.min(999, Math.max(0, Number(i.hours) || 0)));
  const callout = i.callout !== false;
  const booked = i.booked_for && !Number.isNaN(Date.parse(i.booked_for)) ? new Date(i.booked_for).toISOString() : null;
  const total = jobTotal({ kind, hours, callout, items }, readMachines(settings)).total;
  return {
    kind, customer_id: i.customer_id && UUID.test(i.customer_id) ? i.customer_id : null,
    contact_name: t(i.contact_name, 120), contact_email: email, contact_phone: t(i.contact_phone, 40), company: t(i.company, 160), site_address: t(i.site_address, 300),
    brand: t(i.brand, 80), model: t(i.model, 120), serial: t(i.serial, 80), issue: t(i.issue, 4000), preferred: t(i.preferred, 300),
    booked_for: booked, callout, hours, items, internal_notes: t(i.internal_notes, 4000), price_inc_gst: total,
  };
}

export async function createMachineJob(i: MachineJobInput): Promise<R<string>> {
  try {
    const { supabase, org, user } = await machines();
    const row = rowFrom(i, org.settings);
    const status = i.status && JOB_STATUSES.includes(i.status) ? i.status : row.booked_for ? "booked" : "new";
    const { data, error } = await supabase.from("machine_jobs").insert({ ...row, status, organisation_id: org.id, source: "manual", created_by: user.id }).select("id").single();
    if (error) throw new Error(error.message);
    done(); return { ok: true, data: data.id as string };
  } catch (e) { return { ok: false, error: err(e) }; }
}

async function loadJob(id: string) {
  if (!UUID.test(id)) throw new Error("Refresh and try again.");
  const ctx = await machines();
  const { data: job, error } = await ctx.supabase.from("machine_jobs").select("*").eq("id", id).eq("organisation_id", ctx.org.id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!job) throw new Error("That job no longer exists.");
  return { ctx, job: job as Record<string, unknown> & { id: string; number: string; status: MachineJobStatus; kind: MachineJobKind } };
}

export async function saveMachineJob(id: string, i: MachineJobInput): Promise<R> {
  try {
    const { ctx, job } = await loadJob(id);
    const row = rowFrom(i, ctx.org.settings);
    const status = i.status && JOB_STATUSES.includes(i.status) ? i.status : job.status;
    const { error } = await ctx.supabase.from("machine_jobs").update({ ...row, status, updated_at: new Date().toISOString() }).eq("id", job.id);
    if (error) throw new Error(error.message);
    done(job.id); return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export async function setMachineJobStatus(id: string, status: MachineJobStatus): Promise<R> {
  try {
    if (!JOB_STATUSES.includes(status)) throw new Error("Refresh and try again.");
    const { ctx, job } = await loadJob(id);
    const { error } = await ctx.supabase.from("machine_jobs").update({ status, updated_at: new Date().toISOString() }).eq("id", job.id);
    if (error) throw new Error(error.message);
    done(job.id); return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: err(e) }; }
}

/** A new client from the job or quick-sale screen (or the one already there with that email). */
export async function quickMachineCustomer(c: { name: string; company?: string | null; email?: string | null; phone?: string | null; address?: string | null }): Promise<R<{ id: string; name: string; company: string | null; email: string | null; phone: string | null; address: string | null }>> {
  try {
    const { supabase, org, user } = await machines();
    const name = t(c.name, 160);
    if (!name) throw new Error("Add the customer's name.");
    const email = t(c.email, 200)?.toLowerCase() ?? null;
    if (email && !EMAIL.test(email)) throw new Error("That email address doesn't look right.");
    if (email) {
      const { data: same } = await supabase.from("customers").select("id, name, company, email, phone, address").eq("organisation_id", org.id).ilike("email", email.replace(/[%_]/g, "")).limit(1).maybeSingle();
      if (same) return { ok: true, data: same as never };
    }
    const company = t(c.company, 160);
    const { data, error } = await supabase.from("customers").insert({ organisation_id: org.id, kind: company ? "company" : "individual", name, company, email, phone: t(c.phone, 40), address: t(c.address, 300), created_by: user.id })
      .select("id, name, company, email, phone, address").single();
    if (error) throw new Error(error.message);
    revalidatePath("/clients");
    return { ok: true, data: data as never };
  } catch (e) { return { ok: false, error: err(e) }; }
}

type Ctx = Awaited<ReturnType<typeof machines>>;

/** A draft invoice (GST-inclusive lines, the way EventureOS writes them so Xero gets them line by line). */
async function raiseInvoice(ctx: Ctx, customerId: string, lines: (JobItem & { amount: number })[], reference: string | null, summary: string) {
  const { supabase, org, user, profile } = ctx;
  if (!lines.length) throw new Error("Add something to invoice first.");
  const invLines = lines.map((l) => ({
    description: l.description, quantity: l.qty, unit_amount: l.unit_inc, line_amount: l.amount, tax_rate: l.tax_rate, inc: true as const,
    ...(l.code ? { item_code: l.code } : {}), ...(l.account ? { account_code: l.account } : {}), ...(l.service_id ? { service_id: l.service_id } : {}),
  }));
  let total = 0, subtotal = 0;
  for (const l of invLines) { total += l.line_amount; subtotal += l.tax_rate ? r2(l.line_amount / (1 + l.tax_rate / 100)) : l.line_amount; }
  total = r2(total); subtotal = r2(subtotal);
  if (!(total > 0)) throw new Error("The invoice total needs to be more than $0.");
  const today = todayISO(org.timezone);
  const { data: cust } = await supabase.from("customers").select("payment_terms_days").eq("id", customerId).eq("organisation_id", org.id).maybeSingle();
  if (!cust) throw new Error("That client couldn't be found — choose them again.");
  const terms = Math.max(0, Number(cust.payment_terms_days ?? (org.settings as { default_payment_terms_days?: number }).default_payment_terms_days ?? 14) || 0);
  const { data: inv, error } = await supabase.from("invoices").insert({
    organisation_id: org.id, customer_id: customerId, kind: "full", status: "draft", issue_date: today, due_date: addDaysISO(today, terms),
    subtotal, tax_total: r2(total - subtotal), total, currency: org.currency, reference, line_items: invLines, created_by: user.id,
  }).select("id, number").single();
  if (error) throw new Error(error.message);
  await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "invoice.created", entityType: "invoice", entityId: inv.id as string, customerId,
    summary: `${actorName(profile)} raised draft invoice ${inv.number} ${summary}` });
  revalidatePath("/invoices");
  return inv as { id: string; number: string };
}

/** The job's labour and items as a draft invoice. Uses — or adds — the client. */
export async function invoiceMachineJob(id: string): Promise<R<string>> {
  try {
    const { ctx, job } = await loadJob(id);
    if (job.invoice_id) return { ok: true, data: job.invoice_id as string };
    const s = readMachines(ctx.org.settings);
    const tot = jobTotal({ kind: job.kind, hours: Number(job.hours), callout: !!job.callout, items: cleanJobItems(job.items) }, s);
    let customerId = (job.customer_id as string | null) ?? null;
    if (!customerId) {
      const name = String(job.company || job.contact_name || "").trim();
      if (!name) throw new Error("Choose a client (or add the customer's name) first.");
      const c = await quickMachineCustomer({ name: String(job.contact_name || name), company: (job.company as string) ?? null, email: (job.contact_email as string) ?? null, phone: (job.contact_phone as string) ?? null, address: (job.site_address as string) ?? null });
      if (!c.ok) throw new Error(c.error);
      customerId = c.data.id;
      await ctx.supabase.from("machine_jobs").update({ customer_id: customerId }).eq("id", job.id);
    }
    const machine = [job.brand, job.model].filter(Boolean).join(" ");
    const lines = tot.lines.map((l, k) => (k === 0 ? { ...l, description: `${job.number}${machine ? ` · ${machine}` : ""}${job.serial ? ` (SN ${job.serial})` : ""}\n${l.description}` } : l));
    const inv = await raiseInvoice(ctx, customerId, lines, job.number, `for coffee machine job ${job.number}`);
    await ctx.supabase.from("machine_jobs").update({ invoice_id: inv.id, price_inc_gst: tot.total, updated_at: new Date().toISOString() }).eq("id", job.id);
    done(job.id);
    return { ok: true, data: inv.id };
  } catch (e) { return { ok: false, error: err(e) }; }
}

/** Quick sale: pick or add the client, pick items, get a draft invoice. */
export async function quickSaleInvoice(input: { customer_id: string; items: JobItem[]; reference?: string | null }): Promise<R<string>> {
  try {
    const ctx = await machines();
    if (!UUID.test(input.customer_id ?? "")) throw new Error("Choose a client, or add a new one.");
    const items = cleanJobItems(input.items);
    const tot = jobTotal({ kind: "sale", hours: 0, callout: false, items }, readMachines(ctx.org.settings));
    const inv = await raiseInvoice(ctx, input.customer_id, tot.lines, t(input.reference, 60), "from a quick sale");
    return { ok: true, data: inv.id };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export interface MachineSettingsInput {
  enabled: boolean; serviceEnabled: boolean; calloutFirstHour: number; hourly: number; incrementMin: number; gstPct: number; ratesIncGst: boolean;
  notServiced: string[]; agentOf: string | null; area: string | null; intro: string | null; serviceIntro: string | null; shopCategory: string; priceCategories: string[];
}

export async function saveMachineSettings(input: MachineSettingsInput): Promise<R> {
  try {
    const { supabase, org } = await machines();
    const { data, error: e1 } = await supabase.from("organisations").select("settings").eq("id", org.id).single();
    if (e1) throw new Error(e1.message);
    const settings = (data?.settings ?? {}) as Record<string, unknown>;
    const before = readMachines(settings);
    // the machine specs for the chooser are kept as they are (edited per machine)
    const clean = readMachines({ machines: { ...input, models: before.models } });
    const { error } = await supabase.from("organisations").update({ settings: { ...settings, machines: clean } }).eq("id", org.id);
    if (error) throw new Error(error.message);
    revalidatePath("/machines", "layout"); revalidatePath(`/hire/${org.slug}`, "layout");
    return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: err(e) }; }
}

/** The chooser's facts for one machine (cups a day, milk, water, size…), keyed by its shop product. */
export async function saveMachineModel(model: MachineModel, remove = false): Promise<R> {
  try {
    const { supabase, org } = await machines();
    const m = cleanModel(model);
    if (!m) throw new Error("Choose the shop product first.");
    const { data, error: e1 } = await supabase.from("organisations").select("settings").eq("id", org.id).single();
    if (e1) throw new Error(e1.message);
    const settings = (data?.settings ?? {}) as Record<string, unknown>;
    const s = readMachines(settings);
    const models = remove ? s.models.filter((x) => x.slug !== m.slug) : s.models.some((x) => x.slug === m.slug) ? s.models.map((x) => (x.slug === m.slug ? m : x)) : [...s.models, m];
    const { error } = await supabase.from("organisations").update({ settings: { ...settings, machines: { ...s, models } } }).eq("id", org.id);
    if (error) throw new Error(error.message);
    revalidatePath("/machines", "layout"); revalidatePath(`/hire/${org.slug}`, "layout");
    return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: err(e) }; }
}
