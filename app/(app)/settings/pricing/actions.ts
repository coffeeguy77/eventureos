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
