"use server";

import { revalidatePath } from "next/cache";
import { requireOrg, canManage } from "@/lib/context";
import { logActivity, actorName } from "@/lib/activity";

type R = { ok: true } | { ok: false; error: string };

const PROPERTY_RE = /^\d{6,15}$/;

function clean(v: FormDataEntryValue | null, max: number) {
  return (typeof v === "string" ? v : "").trim().slice(0, max);
}

/** Add a client's GA4 property to report on. Managers/owners/admins only (RLS enforces it too). */
export async function addConnection(form: FormData): Promise<R> {
  const { supabase, org, role, profile } = await requireOrg();
  if (!canManage(role)) return { ok: false, error: "Only an owner, admin or manager can add a client." };

  const label = clean(form.get("label"), 120);
  const property = clean(form.get("property"), 40).replace(/^properties\//, "");
  if (!label) return { ok: false, error: "Give the client a name." };
  if (!PROPERTY_RE.test(property)) return { ok: false, error: "The GA4 Property ID should be just the number (6–15 digits), e.g. 393878887. You'll find it in GA4 → Admin → Property details." };

  const { error } = await supabase.from("marketing_connections").insert({
    organisation_id: org.id,
    label,
    provider: "ga4",
    ga4_property_id: property,
    created_by: profile.id,
  });
  if (error) {
    if (/duplicate key|unique/i.test(error.message)) return { ok: false, error: "That GA4 property is already on your list." };
    if (/marketing_connections/.test(error.message) && /does not exist/i.test(error.message)) return { ok: false, error: "Marketing needs its database update first: run migration 0103_marketing.sql in Supabase." };
    return { ok: false, error: error.message };
  }
  await logActivity(supabase, { orgId: org.id, actorId: profile.id, action: "marketing.client_added", entityType: "marketing_connection", summary: `${actorName(profile)} added marketing client ${label}` });
  revalidatePath("/marketing");
  return { ok: true };
}

/** Remove a client from the reporting list (does not touch their Google Analytics). */
export async function removeConnection(id: string): Promise<R> {
  const { supabase, org, role, profile } = await requireOrg();
  if (!canManage(role)) return { ok: false, error: "Only an owner, admin or manager can remove a client." };
  const { data: row } = await supabase.from("marketing_connections").select("label").eq("organisation_id", org.id).eq("id", id).maybeSingle();
  const { error } = await supabase.from("marketing_connections").delete().eq("organisation_id", org.id).eq("id", id);
  if (error) return { ok: false, error: error.message };
  await logActivity(supabase, { orgId: org.id, actorId: profile.id, action: "marketing.client_removed", entityType: "marketing_connection", entityId: id, summary: `${actorName(profile)} removed marketing client ${(row as { label?: string } | null)?.label ?? ""}`.trim() });
  revalidatePath("/marketing");
  return { ok: true };
}
