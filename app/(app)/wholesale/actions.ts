"use server";

import { revalidatePath } from "next/cache";
import { canManage, requireOrg } from "@/lib/context";
import { actorName, logActivity } from "@/lib/activity";

/** The office side of wholesale: order status and notes, customers, products and prices, settings, the email import. */
export type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
const UUID = /^[0-9a-f-]{36}$/i;
const err = (e: unknown) => (e instanceof Error ? e.message : String(e));
const done = () => { revalidatePath("/wholesale", "layout"); };

async function staff() {
  const ctx = await requireOrg();
  if (ctx.role === "staff" || ctx.role === "customer") throw new Error("You don't have access to wholesale.");
  return ctx;
}
async function manager() {
  const ctx = await staff();
  if (!canManage(ctx.role)) throw new Error("Only owners and managers can change this.");
  return ctx;
}

const STATUSES = ["placed", "packed", "delivered", "cancelled"] as const;
export async function setOrderStatus(id: string, status: (typeof STATUSES)[number]): Promise<Result> {
  try {
    const { supabase, org, user, profile } = await staff();
    if (!UUID.test(id) || !STATUSES.includes(status)) throw new Error("Refresh and try again.");
    const { data, error } = await supabase.from("wholesale_orders").update({ status, updated_at: new Date().toISOString() }).eq("id", id).eq("organisation_id", org.id).neq("status", "pending").select("number").single();
    if (error) throw new Error(error.message);
    if (status === "cancelled") await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "wholesale.order_cancelled", entityType: "wholesale_order", entityId: id, summary: `${actorName(profile)} cancelled wholesale order ${data.number}` });
    done(); return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: err(e) }; }
}

/** Mark every open order on a run packed / delivered */
export async function setRunStatus(deliveryDate: string, status: "packed" | "delivered"): Promise<Result<number>> {
  try {
    const { supabase, org } = await staff();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)) throw new Error("Refresh and try again.");
    const from = status === "packed" ? ["placed"] : ["placed", "packed"];
    const { data, error } = await supabase.from("wholesale_orders").update({ status, updated_at: new Date().toISOString() }).eq("organisation_id", org.id).eq("delivery_date", deliveryDate).in("status", from).select("id");
    if (error) throw new Error(error.message);
    done(); return { ok: true, data: data?.length ?? 0 };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export async function saveOrderDetails(id: string, input: { office_note?: string | null; delivery_date?: string | null; payment_status?: "unpaid" | "paid" | "n/a"; clear_check?: boolean }): Promise<Result> {
  try {
    const { supabase, org } = await staff();
    if (!UUID.test(id)) throw new Error("Refresh and try again.");
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.office_note !== undefined) patch.office_note = input.office_note?.trim().slice(0, 2000) || null;
    if (input.delivery_date !== undefined) { if (input.delivery_date && !/^\d{4}-\d{2}-\d{2}$/.test(input.delivery_date)) throw new Error("Choose a delivery date."); patch.delivery_date = input.delivery_date || null; }
    if (input.payment_status) { patch.payment_status = input.payment_status; patch.paid_at = input.payment_status === "paid" ? new Date().toISOString() : null; }
    if (input.clear_check) patch.needs_check = null;
    const { error } = await supabase.from("wholesale_orders").update(patch).eq("id", id).eq("organisation_id", org.id);
    if (error) throw new Error(error.message);
    done(); return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export interface CustomerInput {
  name: string; business_name?: string | null; email?: string | null; billing_email?: string | null; phone?: string | null; contact_name?: string | null;
  address1?: string | null; address2?: string | null; suburb?: string | null; state?: string | null; postcode?: string | null;
  delivery_instructions?: string | null; notes?: string | null; abn?: string | null; price_group?: string | null;
  payment_mode: "card" | "invoice"; payment_terms_days: number; delivery_weekday: number | null; min_order: number; active: boolean;
}
const EMAIL = /^[^\s@<>"',;:()]+@[^\s@<>"',;:()]+\.[^\s@<>"',;:()]{2,}$/;
function cleanCustomer(i: CustomerInput) {
  const t = (v: unknown, n = 200) => (typeof v === "string" ? v.trim().slice(0, n) || null : null);
  const name = t(i.name);
  if (!name) throw new Error("Add the customer's name.");
  for (const e of [i.email, i.billing_email]) if (e && !EMAIL.test(e.trim())) throw new Error(`“${e}” isn't a valid email address.`);
  const terms = Math.round(Number(i.payment_terms_days));
  return {
    name, business_name: t(i.business_name), email: t(i.email)?.toLowerCase() ?? null, billing_email: t(i.billing_email)?.toLowerCase() ?? null, phone: t(i.phone, 40), contact_name: t(i.contact_name),
    address1: t(i.address1), address2: t(i.address2), suburb: t(i.suburb, 80), state: t(i.state, 20), postcode: t(i.postcode, 10),
    delivery_instructions: t(i.delivery_instructions, 1000), notes: t(i.notes, 2000), abn: t(i.abn, 20), price_group: t(i.price_group, 80),
    payment_mode: i.payment_mode === "invoice" ? "invoice" : "card", payment_terms_days: Number.isFinite(terms) ? Math.min(120, Math.max(0, terms)) : 7,
    delivery_weekday: i.delivery_weekday == null || !Number.isInteger(Number(i.delivery_weekday)) ? null : Math.min(6, Math.max(0, Number(i.delivery_weekday))),
    min_order: Math.max(0, Math.round(Number(i.min_order || 0) * 100) / 100), active: !!i.active, updated_at: new Date().toISOString(),
  };
}

export async function saveCustomer(id: string | null, input: CustomerInput): Promise<Result<{ id: string }>> {
  try {
    const { supabase, org, user, profile } = await manager();
    const row = cleanCustomer(input);
    const res = id
      ? await supabase.from("wholesale_customers").update(row).eq("id", id).eq("organisation_id", org.id).select("id").single()
      : await supabase.from("wholesale_customers").insert({ ...row, organisation_id: org.id }).select("id").single();
    if (res.error) throw new Error(res.error.message);
    if (id && input.payment_mode) await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "wholesale.customer_updated", entityType: "wholesale_customer", entityId: res.data.id, summary: `${actorName(profile)} updated wholesale customer ${row.name} (pays ${row.payment_mode === "card" ? "by card" : `on invoice, ${row.payment_terms_days} days`})` });
    done(); return { ok: true, data: { id: res.data.id as string } };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export async function newOrderingLink(id: string): Promise<Result> {
  try {
    const { supabase, org } = await manager();
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
    const { error } = await supabase.from("wholesale_customers").update({ order_token: token }).eq("id", id).eq("organisation_id", org.id);
    if (error) throw new Error(error.message);
    done(); return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export async function emailOrderingLinkAction(id: string): Promise<Result<string>> {
  try {
    const { supabase, org, user, profile } = await manager();
    const { data: c } = await supabase.from("wholesale_customers").select("id, name").eq("id", id).eq("organisation_id", org.id).maybeSingle();
    if (!c) throw new Error("Customer not found.");
    const { emailOrderingLink } = await import("@/lib/wholesale/orders");
    const to = await emailOrderingLink(supabase, id);
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "wholesale.link_emailed", entityType: "wholesale_customer", entityId: id, summary: `${actorName(profile)} emailed ${c.name} their wholesale ordering link (${to})` });
    return { ok: true, data: to };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export interface ProductInput { sku?: string | null; name: string; description?: string | null; category?: string | null; unit_price: number; tax_rate: number; weight_kg?: number | null; min_qty?: number; active: boolean }
export async function saveProduct(id: string | null, input: ProductInput): Promise<Result<{ id: string }>> {
  try {
    const { supabase, org } = await manager();
    const name = input.name?.trim().slice(0, 200);
    if (!name) throw new Error("Add the product name.");
    const price = Math.round(Number(input.unit_price) * 100) / 100;
    if (!Number.isFinite(price) || price < 0) throw new Error("Enter a price.");
    const row = {
      sku: input.sku?.trim().slice(0, 60) || null, name, description: input.description?.trim().slice(0, 2000) || null, category: input.category?.trim().slice(0, 80) || null,
      unit_price: price, tax_rate: Number(input.tax_rate) === 10 ? 10 : 0, weight_kg: input.weight_kg == null || input.weight_kg === ("" as unknown) ? null : Math.max(0, Number(input.weight_kg)),
      min_qty: Math.max(1, Math.round(Number(input.min_qty ?? 1))), active: !!input.active, updated_at: new Date().toISOString(),
    };
    const res = id
      ? await supabase.from("wholesale_products").update(row).eq("id", id).eq("organisation_id", org.id).select("id").single()
      : await supabase.from("wholesale_products").insert({ ...row, organisation_id: org.id, position: 999 }).select("id").single();
    if (res.error) throw new Error(res.error.code === "23505" ? "Another product already has that SKU." : res.error.message);
    done(); return { ok: true, data: { id: res.data.id as string } };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export async function saveGroupPrice(productId: string, group: string, price: number | null): Promise<Result> {
  try {
    const { supabase, org } = await manager();
    const g = group.trim().slice(0, 80);
    if (!UUID.test(productId) || !g) throw new Error("Refresh and try again.");
    if (price == null) await supabase.from("wholesale_group_prices").delete().eq("product_id", productId).eq("price_group", g).eq("organisation_id", org.id);
    else {
      const p = Math.round(Number(price) * 100) / 100;
      if (!Number.isFinite(p) || p < 0) throw new Error("Enter a price.");
      const { error } = await supabase.from("wholesale_group_prices").upsert({ organisation_id: org.id, product_id: productId, price_group: g, unit_price: p }, { onConflict: "product_id,price_group" });
      if (error) throw new Error(error.message);
    }
    done(); return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export interface WholesaleSettingsInput { delivery_weekday: number; email_import: boolean; import_from: string; import_subject: string; ordering: boolean; freight: number; free_freight_over: number; box_kg: number }
export async function saveWholesaleSettings(input: WholesaleSettingsInput): Promise<Result> {
  try {
    const { supabase, org, user, profile } = await manager();
    const { data: o } = await supabase.from("organisations").select("settings").eq("id", org.id).single();
    const settings = (o?.settings ?? {}) as Record<string, unknown>;
    const prev = (settings.wholesale ?? {}) as Record<string, unknown>;
    const from = input.import_from.trim().toLowerCase();
    if (input.email_import && !EMAIL.test(from)) throw new Error("Enter the email address the orders come from.");
    const wholesale = {
      ...prev, delivery_weekday: Math.min(6, Math.max(0, Math.round(Number(input.delivery_weekday)))),
      email_import: { ...((prev.email_import ?? {}) as object), enabled: !!input.email_import, from, subject: input.import_subject.trim().slice(0, 120) || "Invoice -" },
      ordering: !!input.ordering, freight: Math.max(0, Number(input.freight) || 0), free_freight_over: Math.max(0, Number(input.free_freight_over) || 0),
      box_kg: Number(input.box_kg) > 0 && Number(input.box_kg) <= 100 ? Math.round(Number(input.box_kg) * 100) / 100 : 10,
    };
    const { error } = await supabase.from("organisations").update({ settings: { ...settings, wholesale } }).eq("id", org.id);
    if (error) throw new Error(error.message);
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "settings.updated", entityType: "organisation", entityId: org.id, summary: `${actorName(profile)} updated the wholesale settings (online ordering ${wholesale.ordering ? "on" : "off"}, order emails ${wholesale.email_import.enabled ? "read from Gmail" : "not read"})` });
    done(); return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export async function importOrderEmailsNow(): Promise<Result<string>> {
  try {
    const { org } = await staff();
    const { createServiceClient } = await import("@/lib/integrations/runtime");
    const { importOrderEmails } = await import("@/lib/wholesale/email-import");
    const r = await importOrderEmails(createServiceClient(), org.id, { max: 120 });
    done();
    return { ok: true, data: r.imported ? `${r.imported} new order${r.imported === 1 ? "" : "s"} imported${r.flagged ? ` (${r.flagged} to check)` : ""}.` : "No new orders." };
  } catch (e) { return { ok: false, error: err(e) }; }
}

/* ---------------- Products: delete; categories and price groups ---------------- */

const label = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, 80) : "");
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Change the wholesale settings' saved list of categories or price groups. */
async function editList(supabase: Awaited<ReturnType<typeof manager>>["supabase"], orgId: string, key: "categories" | "price_groups", fn: (list: string[]) => string[]) {
  const { data: o } = await supabase.from("organisations").select("settings").eq("id", orgId).single();
  const settings = (o?.settings ?? {}) as Record<string, unknown>;
  const prev = (settings.wholesale ?? {}) as Record<string, unknown>;
  const list = (Array.isArray(prev[key]) ? (prev[key] as unknown[]) : []).filter((x): x is string => typeof x === "string");
  const { error } = await supabase.from("organisations").update({ settings: { ...settings, wholesale: { ...prev, [key]: fn(list) } } }).eq("id", orgId);
  if (error) throw new Error(error.message);
}

/** Delete a product for good. Past orders keep its name and price; its special group prices go with it. */
export async function deleteProduct(id: string): Promise<Result> {
  try {
    const { supabase, org, user, profile } = await manager();
    if (!UUID.test(id)) throw new Error("Refresh and try again.");
    const { data: p } = await supabase.from("wholesale_products").select("name").eq("id", id).eq("organisation_id", org.id).maybeSingle();
    if (!p) throw new Error("That product has already gone.");
    const { error } = await supabase.from("wholesale_products").delete().eq("id", id).eq("organisation_id", org.id);
    if (error) throw new Error(error.message);
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "wholesale.product_deleted", entityType: "organisation", entityId: org.id, summary: `${actorName(profile)} deleted the wholesale product ${p.name}` });
    done(); return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export async function addCategory(name: string): Promise<Result> {
  try {
    const { supabase, org } = await manager();
    const n = label(name);
    if (!n) throw new Error("Type the category name.");
    await editList(supabase, org.id, "categories", (l) => (l.some((x) => same(x, n)) ? l : [...l, n]));
    done(); return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: err(e) }; }
}

/** Rename a category — every product in it moves to the new name. */
export async function renameCategory(from: string, to: string): Promise<Result<number>> {
  try {
    const { supabase, org } = await manager();
    const a = label(from), b = label(to);
    if (!a || !b) throw new Error("Type the new name.");
    const { data, error } = await supabase.from("wholesale_products").update({ category: b, updated_at: new Date().toISOString() }).eq("organisation_id", org.id).ilike("category", a.replace(/[%_\\]/g, "\\$&")).select("id");
    if (error) throw new Error(error.message);
    await editList(supabase, org.id, "categories", (l) => { const out = l.filter((x) => !same(x, a) && !same(x, b)); return [...out, b]; });
    done(); return { ok: true, data: (data ?? []).length };
  } catch (e) { return { ok: false, error: err(e) }; }
}

/** Delete a category. Its products move to `moveTo` (another category), or to no category. */
export async function deleteCategory(name: string, moveTo: string | null): Promise<Result<number>> {
  try {
    const { supabase, org } = await manager();
    const a = label(name), b = moveTo ? label(moveTo) : "";
    if (!a) throw new Error("Refresh and try again.");
    if (b && same(a, b)) throw new Error("Choose a different category to move the products to.");
    const { data, error } = await supabase.from("wholesale_products").update({ category: b || null, updated_at: new Date().toISOString() }).eq("organisation_id", org.id).ilike("category", a.replace(/[%_\\]/g, "\\$&")).select("id");
    if (error) throw new Error(error.message);
    await editList(supabase, org.id, "categories", (l) => l.filter((x) => !same(x, a)));
    done(); return { ok: true, data: (data ?? []).length };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export async function addPriceGroup(name: string): Promise<Result> {
  try {
    const { supabase, org } = await manager();
    const n = label(name);
    if (!n) throw new Error("Type the price group name.");
    await editList(supabase, org.id, "price_groups", (l) => (l.some((x) => same(x, n)) ? l : [...l, n]));
    done(); return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: err(e) }; }
}

/** Rename a price group — its customers and special prices move with it. */
export async function renamePriceGroup(from: string, to: string): Promise<Result> {
  try {
    const { supabase, org, user, profile } = await manager();
    const a = label(from), b = label(to);
    if (!a || !b) throw new Error("Type the new name.");
    if (!same(a, b)) {
      const { data: clash } = await supabase.from("wholesale_group_prices").select("id").eq("organisation_id", org.id).eq("price_group", b).limit(1);
      if ((clash ?? []).length) throw new Error(`There's already a price group called ${b}.`);
    }
    const r1 = await supabase.from("wholesale_group_prices").update({ price_group: b }).eq("organisation_id", org.id).eq("price_group", a);
    if (r1.error) throw new Error(r1.error.message);
    const r2 = await supabase.from("wholesale_customers").update({ price_group: b, updated_at: new Date().toISOString() }).eq("organisation_id", org.id).eq("price_group", a);
    if (r2.error) throw new Error(r2.error.message);
    await editList(supabase, org.id, "price_groups", (l) => [...l.filter((x) => !same(x, a) && !same(x, b)), b]);
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "wholesale.price_group_renamed", entityType: "organisation", entityId: org.id, summary: `${actorName(profile)} renamed the wholesale price group ${a} to ${b}` });
    done(); return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: err(e) }; }
}

/** Delete a price group: its special prices are removed and its customers go back to the standard prices. */
export async function deletePriceGroup(name: string): Promise<Result<number>> {
  try {
    const { supabase, org, user, profile } = await manager();
    const a = label(name);
    if (!a) throw new Error("Refresh and try again.");
    const r1 = await supabase.from("wholesale_group_prices").delete().eq("organisation_id", org.id).eq("price_group", a);
    if (r1.error) throw new Error(r1.error.message);
    const { data, error } = await supabase.from("wholesale_customers").update({ price_group: null, updated_at: new Date().toISOString() }).eq("organisation_id", org.id).eq("price_group", a).select("id");
    if (error) throw new Error(error.message);
    await editList(supabase, org.id, "price_groups", (l) => l.filter((x) => !same(x, a)));
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "wholesale.price_group_deleted", entityType: "organisation", entityId: org.id, summary: `${actorName(profile)} deleted the wholesale price group ${a} (${(data ?? []).length} customer${(data ?? []).length === 1 ? "" : "s"} back on standard prices)` });
    done(); return { ok: true, data: (data ?? []).length };
  } catch (e) { return { ok: false, error: err(e) }; }
}
