"use server";

import { revalidatePath } from "next/cache";
import { canManage, requireOrg } from "@/lib/context";
import type { ActionState } from "../../forms";

export async function connectTwilio(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { supabase, org, role } = await requireOrg();
    if (!canManage(role)) return { error: "Only owners, admins and managers can set up text messages." };
    const sid = String(form.get("sid") ?? "").trim();
    const token = String(form.get("token") ?? "").trim();
    const sender = String(form.get("sender") ?? "").trim();
    if (!/^AC[0-9a-f]{32}$/i.test(sid)) return { error: "The Account SID starts with AC and is 34 characters — copy it from the Twilio console home page." };
    if (!/^[0-9a-f]{32}$/i.test(token)) return { error: "The Auth token is 32 letters and numbers — click Show next to it in the Twilio console and copy it." };
    const { validSender, twilioAccount } = await import("@/lib/sms/twilio");
    if (!validSender(sender)) return { error: "The sender is your approved name (up to 11 letters or numbers, e.g. BeanCulture — no more than 11 characters including spaces), a Twilio number (+61…), or a Messaging Service SID (MG…)." };
    let name: string;
    try { name = await twilioAccount(sid, token); } catch (e) { return { error: e instanceof Error ? e.message : String(e) }; }
    const { error } = await supabase.rpc("save_integration_connection", {
      p_org: org.id, p_provider: "twilio", p_account_label: `${name} · sends as ${sender}`, p_external_account_id: sid, p_scopes: [],
      p_access_token: token, p_refresh_token: null, p_expires_at: null, p_settings: { sender },
    });
    if (error) return { error: `Couldn't save: ${error.message}` };
    revalidatePath("/settings/integrations");
    revalidatePath("/settings/integrations/twilio");
    return { ok: `Connected to ${name}. Texts go out as ${sender}.` };
  } catch (e) { return { error: e instanceof Error ? e.message : String(e) }; }
}

export async function disconnectTwilio(): Promise<void> {
  const { supabase, org, role } = await requireOrg();
  if (!canManage(role)) throw new Error("Only owners, admins and managers can change this.");
  await supabase.from("integrations").update({ status: "disconnected" }).eq("organisation_id", org.id).eq("provider", "twilio");
  revalidatePath("/settings/integrations");
  revalidatePath("/settings/integrations/twilio");
}
