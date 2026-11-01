"use server";

import { revalidatePath } from "next/cache";
import { canManage, requireOrg } from "@/lib/context";
import type { ActionState } from "../../forms";

export async function connectSquare(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { supabase, org, role } = await requireOrg();
    if (!canManage(role)) return { error: "Only owners, admins and managers can set this up." };
    const token = String(form.get("token") ?? "").trim();
    const location = String(form.get("location") ?? "").trim();
    if (!/^EAAA[A-Za-z0-9_-]{20,}$/.test(token)) return { error: "The production access token starts with EAAA — copy it from your app in the Square Developer dashboard (Credentials → Production)." };
    const { squareLocations } = await import("@/lib/square/server");
    let locs: { id: string; name: string }[];
    try { locs = await squareLocations(token); } catch (e) { return { error: e instanceof Error ? e.message : String(e) }; }
    if (!locs.length) return { error: "Square didn't return any active locations for that token." };
    const loc = locs.find((l) => l.id === location) ?? (locs.length === 1 ? locs[0] : null);
    if (!loc) return { error: `Choose the location — this account has ${locs.length}: ${locs.map((l) => `${l.name} (${l.id})`).join(", ")}. Paste its ID in Location.` };
    const { error } = await supabase.rpc("save_integration_connection", {
      p_org: org.id, p_provider: "square", p_account_label: `Square · ${loc.name}`, p_external_account_id: loc.id, p_scopes: [],
      p_access_token: token, p_refresh_token: null, p_expires_at: null, p_settings: { location_id: loc.id, location_name: loc.name },
    });
    if (error) return { error: `Couldn't save: ${error.message}` };
    revalidatePath("/settings/integrations");
    revalidatePath("/settings/integrations/square");
    return { ok: `Connected to ${loc.name}. Today's sales show next to wages on the roster.` };
  } catch (e) { return { error: e instanceof Error ? e.message : String(e) }; }
}

export async function disconnectSquare(): Promise<void> {
  const { supabase, org, role } = await requireOrg();
  if (!canManage(role)) throw new Error("Only owners, admins and managers can change this.");
  await supabase.from("integrations").update({ status: "disconnected" }).eq("organisation_id", org.id).eq("provider", "square");
  revalidatePath("/settings/integrations");
  revalidatePath("/settings/integrations/square");
}
