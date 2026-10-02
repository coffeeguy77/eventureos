"use server";

import { revalidatePath } from "next/cache";
import { canManage, requireOrg } from "@/lib/context";
import { actorName, logActivity } from "@/lib/activity";
import { checkRules, type PackageRules } from "@/lib/pricing/engine";

export type Result<T = null> = { ok: true; data: T } | { ok: false; error: string };

export interface ServiceInput {
  id?: string;
  code: string | null;
  name: string;
  description: string | null;
  category: string | null;
  unit: string | null;
  unit_price: number;
  tax_rate: number;
  xero_account_code: string | null;
  active: boolean;
}
export interface PackageInput { id?: string; name: string; summary: string | null; rules: PackageRules; active: boolean }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const t = (v: unknown, max: number) => { const s = String(v ?? "").trim(); return s ? s.slice(0, max) : null; };

async function manager() {
  const ctx = await requireOrg();
  if (!canManage(ctx.role)) throw new Error("Only owners, admins and managers can change prices.");
  return ctx;
}
async function wrap<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try { return { ok: true, data: await fn() }; } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

export async function saveService(input: ServiceInput): Promise<Result<{ id: string }>> {
  return wrap(async () => {
    const { supabase, org, user, profile } = await manager();
    const name = t(input.name, 200);
    if (!name) throw new Error("Give the service a name.");
    const price = Number(input.unit_price), tax = Number(input.tax_rate);
    if (!Number.isFinite(price) || price < 0 || price > 10_000_000) throw new Error("Price must be a number of 0 or more.");
    if (!Number.isFinite(tax) || tax < 0 || tax > 100) throw new Error("Tax rate must be between 0 and 100.");
    const row = {
      code: t(input.code, 60), name, description: t(input.description, 4000), category: t(input.category, 80), unit: t(input.unit, 40),
      unit_price: Math.round(price * 100) / 100, tax_rate: tax, xero_account_code: t(input.xero_account_code, 20), active: !!input.active,
    };
    let id = input.id;
    if (id) {
      if (!UUID.test(id)) throw new Error("That service link isn't valid.");
      const { error } = await supabase.from("services").update(row).eq("id", id).eq("organisation_id", org.id);
      if (error) throw new Error(/services_org_code_key/.test(error.message) ? `Another service already uses the code “${row.code}”.` : error.message);
    } else {
      const { data: last } = await supabase.from("services").select("position").eq("organisation_id", org.id).order("position", { ascending: false }).limit(1).maybeSingle();
      const { data, error } = await supabase.from("services").insert({ ...row, organisation_id: org.id, position: (last?.position ?? 0) + 10 }).select("id").single();
      if (error) throw new Error(/services_org_code_key/.test(error.message) ? `Another service already uses the code “${row.code}”.` : error.message);
      id = data.id as string;
    }
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "pricing.service_saved", entityType: "organisation", entityId: org.id,
      summary: `${actorName(profile)} ${input.id ? "updated" : "added"} ${name} (${row.unit_price.toFixed(2)} + tax${row.unit ? " per " + row.unit : ""})` });
    revalidatePath("/settings/pricing");
    return { id: id! };
  });
}

export async function deleteService(id: string): Promise<Result> {
  return wrap(async () => {
    const { supabase, org } = await manager();
    if (!UUID.test(id)) throw new Error("That service link isn't valid.");
    const { data: pk } = await supabase.from("service_packages").select("name, rules").eq("organisation_id", org.id);
    const using = (pk ?? []).filter((p) => JSON.stringify(p.rules ?? {}).includes(id)).map((p) => p.name);
    if (using.length) throw new Error(`Used by ${using.join(", ")}. Change the package first, or switch the service off instead.`);
    const { error } = await supabase.from("services").delete().eq("id", id).eq("organisation_id", org.id);
    if (error) throw new Error(error.message);
    revalidatePath("/settings/pricing");
    return null;
  });
}

export async function savePackage(input: PackageInput): Promise<Result<{ id: string }>> {
  return wrap(async () => {
    const { supabase, org, user, profile } = await manager();
    const name = t(input.name, 120);
    if (!name) throw new Error("Give the package a name.");
    const { data: svc } = await supabase.from("services").select("id").eq("organisation_id", org.id);
    const problems = checkRules(input.rules ?? {}, new Set((svc ?? []).map((s) => s.id as string)));
    if (problems.length) throw new Error(problems.join(" "));
    const row = { name, summary: t(input.summary, 300), rules: input.rules, active: !!input.active };
    let id = input.id;
    if (id) {
      if (!UUID.test(id)) throw new Error("That package link isn't valid.");
      const { error } = await supabase.from("service_packages").update(row).eq("id", id).eq("organisation_id", org.id);
      if (error) throw new Error(error.message);
    } else {
      const { data: last } = await supabase.from("service_packages").select("position").eq("organisation_id", org.id).order("position", { ascending: false }).limit(1).maybeSingle();
      const { data, error } = await supabase.from("service_packages").insert({ ...row, organisation_id: org.id, position: (last?.position ?? 0) + 10 }).select("id").single();
      if (error) throw new Error(error.message);
      id = data.id as string;
    }
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "pricing.package_saved", entityType: "organisation", entityId: org.id,
      summary: `${actorName(profile)} ${input.id ? "updated" : "added"} the ${name} pricing package` });
    revalidatePath("/settings/pricing");
    return { id: id! };
  });
}

export async function deletePackage(id: string): Promise<Result> {
  return wrap(async () => {
    const { supabase, org } = await manager();
    if (!UUID.test(id)) throw new Error("That package link isn't valid.");
    const { error } = await supabase.from("service_packages").delete().eq("id", id).eq("organisation_id", org.id);
    if (error) throw new Error(error.message);
    revalidatePath("/settings/pricing");
    return null;
  });
}

/** Bring Xero item codes/accounts across; add sold Xero items on the given accounts. */
export async function syncFromXeroItems(accountsCsv: string): Promise<Result<{ updated: string[]; added: string[]; seen: number }>> {
  return wrap(async () => {
    const { supabase, org, user, profile } = await manager();
    const accounts = accountsCsv.split(/[\s,]+/).map((x) => x.trim()).filter((x) => /^[\w-]{1,10}$/.test(x)).slice(0, 30);
    const { buildContext } = await import("@/lib/integrations/sync-runner");
    const { importXeroItems } = await import("@/lib/integrations/xero-items");
    let ctx;
    try { ctx = await buildContext(supabase, "user", org.id, "xero", user.id); }
    catch { throw new Error("Xero isn't connected. Connect it in Settings → Integrations first."); }
    const r = await importXeroItems(ctx, accounts);
    if (r.updated.length || r.added.length) {
      await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "pricing.xero_items", entityType: "organisation", entityId: org.id,
        summary: `${actorName(profile)} updated the price list from Xero items: ${r.updated.length} updated, ${r.added.length} added` });
    }
    revalidatePath("/settings/pricing");
    return r;
  });
}

export interface TemplateInput { id?: string; name: string; summary: string | null; sections: unknown; active: boolean }

/** Create or update a quote template (named set of price-list items + quantities). */
export async function saveQuoteTemplate(input: TemplateInput): Promise<Result<{ id: string }>> {
  return wrap(async () => {
    const { supabase, org, user, profile } = await manager();
    const name = t(input.name, 120);
    if (!name) throw new Error("Give the template a name.");
    const { cleanSections } = await import("@/lib/quotes/templates");
    const sections = cleanSections(input.sections);
    if (!sections.length) throw new Error("Add at least one item to the template.");
    const ids = [...new Set(sections.flatMap((s) => s.items.map((i) => i.service_id).filter((x): x is string => !!x)))];
    if (ids.length) {
      const { data: svc } = await supabase.from("services").select("id").eq("organisation_id", org.id).in("id", ids);
      if ((svc ?? []).length !== ids.length) throw new Error("Some items are no longer on your price list. Refresh and try again.");
    }
    const row = { name, summary: t(input.summary, 300), sections, active: !!input.active };
    let id = input.id;
    if (id) {
      if (!UUID.test(id)) throw new Error("Refresh and try again.");
      const { error } = await supabase.from("quote_templates").update(row).eq("id", id).eq("organisation_id", org.id);
      if (error) throw new Error(error.message);
    } else {
      const { data: last } = await supabase.from("quote_templates").select("position").eq("organisation_id", org.id).order("position", { ascending: false }).limit(1).maybeSingle();
      const { data, error } = await supabase.from("quote_templates").insert({ organisation_id: org.id, ...row, position: (last?.position ?? -1) + 1, created_by: user.id }).select("id").single();
      if (error) throw new Error(error.message.includes("does not exist") ? "Quote templates aren't set up yet — the database update still needs to be run." : error.message);
      id = (data as { id: string }).id;
    }
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: input.id ? "quote_template.updated" : "quote_template.created", entityType: "organisation", entityId: org.id,
      summary: `${actorName(profile)} ${input.id ? "updated" : "created"} the quote template ‘${name}’` });
    revalidatePath("/settings/pricing");
    return { id: id! };
  });
}

export async function deleteQuoteTemplate(id: string): Promise<Result> {
  return wrap(async () => {
    const { supabase, org, user, profile } = await manager();
    if (!UUID.test(id)) throw new Error("Refresh and try again.");
    const { data } = await supabase.from("quote_templates").delete().eq("id", id).eq("organisation_id", org.id).select("name").maybeSingle();
    if (data) await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "quote_template.deleted", entityType: "organisation", entityId: org.id,
      summary: `${actorName(profile)} deleted the quote template ‘${data.name}’` });
    revalidatePath("/settings/pricing");
    return null;
  });
}
