"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/context";
import { newIntakeKey } from "@/lib/intake/keys";

export type KeyState = { error?: string; key?: string; label?: string } | undefined;
const PATH = "/settings/integrations/quote-intake";

async function ownerOrAdmin() {
  const ctx = await requireOrg();
  if (ctx.role !== "owner" && ctx.role !== "admin") throw new Error("Only owners and admins can manage quote intake connections.");
  return ctx;
}

/** Makes a connection and returns its key — the only time the full key is shown. */
export async function createIntakeConnection(_prev: KeyState, form: FormData): Promise<KeyState> {
  try {
    const { supabase, org, user } = await ownerOrAdmin();
    const label = String(form.get("label") ?? "").trim().replace(/\s+/g, " ").slice(0, 80) || "LeadPages quote form";
    const provider = form.get("provider") === "custom" ? "custom" : "leadpages";
    const { count } = await supabase.from("inbound_connections").select("id", { count: "exact", head: true }).eq("organisation_id", org.id).is("revoked_at", null);
    if ((count ?? 0) >= 10) return { error: "You already have 10 active connections. Revoke one you no longer use first." };
    const k = newIntakeKey();
    const { error } = await supabase.from("inbound_connections").insert({
      organisation_id: org.id, provider, label, key_prefix: k.prefix, key_hash: k.hash, created_by: user.id,
    });
    if (error) return { error: `Couldn't create the connection: ${error.message}` };
    revalidatePath(PATH);
    return { key: k.key, label };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't create the connection" };
  }
}

export async function revokeIntakeConnection(id: string): Promise<{ error?: string }> {
  try {
    const { supabase, org } = await ownerOrAdmin();
    const { error } = await supabase.from("inbound_connections").update({ active: false, revoked_at: new Date().toISOString() })
      .eq("id", id).eq("organisation_id", org.id).is("revoked_at", null);
    if (error) return { error: error.message };
    revalidatePath(PATH);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't revoke the connection" };
  }
}
