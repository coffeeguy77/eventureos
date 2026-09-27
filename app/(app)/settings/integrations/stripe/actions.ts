"use server";

import { revalidatePath } from "next/cache";
import { requireOrg, canManage } from "@/lib/context";
import { actorName, logActivity } from "@/lib/activity";
import { getAccount, keyMode, StripeError } from "@/lib/payments/stripe";
import type { ActionState } from "../../forms";

async function manager() {
  const ctx = await requireOrg();
  if (!canManage(ctx.role)) throw new Error("Only owners, admins and managers can set up payments.");
  return ctx;
}

export async function connectStripe(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { supabase, org } = await manager();
    const key = String(form.get("secret_key") ?? "").trim();
    const whsec = String(form.get("webhook_secret") ?? "").trim();
    const mode = keyMode(key);
    if (!mode) return { error: "That isn't a Stripe secret key. It starts with sk_live_ (or rk_live_ for a restricted key). The pk_ key is the wrong one." };
    if (!/^whsec_[A-Za-z0-9]{10,}$/.test(whsec)) return { error: "The webhook signing secret starts with whsec_ — copy it from the webhook you added in Stripe." };
    let acct;
    try { acct = await getAccount(key); }
    catch (e) { return { error: e instanceof StripeError && e.status === 401 ? "Stripe rejected that key. Copy it again from Stripe → Developers → API keys." : `Couldn't reach Stripe: ${e instanceof Error ? e.message : String(e)}` }; }
    const name = acct.settings?.dashboard?.display_name || acct.business_profile?.name || acct.email || acct.id;
    const { data: cur } = await supabase.from("integrations").select("settings").eq("organisation_id", org.id).eq("provider", "stripe").maybeSingle();
    const { error } = await supabase.rpc("save_integration_connection", {
      p_org: org.id, p_provider: "stripe", p_account_label: `${name}${mode === "test" ? " (test mode)" : ""}`, p_external_account_id: acct.id, p_scopes: [],
      p_access_token: key, p_refresh_token: whsec, p_expires_at: null,
      p_settings: { ...((cur?.settings as Record<string, unknown>) ?? {}), mode, account_name: name },
    });
    if (error) return { error: `Couldn't save: ${error.message}` };
    revalidatePath("/settings/integrations");
    revalidatePath("/settings/integrations/stripe");
    return { ok: `Connected to ${name}${mode === "test" ? " in TEST mode — no real money will move" : ""}.${acct.charges_enabled === false ? " Stripe says this account can't take charges yet — finish setting it up in Stripe." : ""}` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function saveStripeXeroAccount(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { supabase, org, user, profile } = await manager();
    const account = String(form.get("xero_account") ?? "").trim();
    if (account && !/^[A-Za-z0-9-]{1,40}$/.test(account)) return { error: "Choose the Xero account (or type its code)." };
    const { data: integ } = await supabase.from("integrations").select("id, settings").eq("organisation_id", org.id).eq("provider", "stripe").maybeSingle();
    if (!integ) return { error: "Connect Stripe first." };
    const { error } = await supabase.from("integrations").update({ settings: { ...((integ.settings as Record<string, unknown>) ?? {}), xero_account: account || null } }).eq("id", integ.id);
    if (error) return { error: error.message };
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "integration.settings_changed", entityType: "integration", entityId: integ.id as string,
      summary: `${actorName(profile)} set the Xero account for Stripe payments to ${account || "none"}` });
    revalidatePath("/settings/integrations/stripe");
    return { ok: account ? "Saved. Card payments on Xero invoices will be added to Xero against this account." : "Cleared — card payments won't be sent to Xero." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function disconnectStripe(_prev: ActionState): Promise<ActionState> {
  try {
    const { supabase, org } = await manager();
    const { data: integ } = await supabase.from("integrations").select("id").eq("organisation_id", org.id).eq("provider", "stripe").maybeSingle();
    if (!integ) return { ok: "Not connected." };
    const { error } = await supabase.rpc("disconnect_integration", { p_integration_id: integ.id });
    if (error) return { error: error.message };
    revalidatePath("/settings/integrations");
    revalidatePath("/settings/integrations/stripe");
    return { ok: "Stripe disconnected. Payment links will say card payment isn't available." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
