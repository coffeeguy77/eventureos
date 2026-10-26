"use server";

import { revalidatePath } from "next/cache";
import { isSuperAdmin } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { APPS, PLAN_KEYS, cleanAppList, readPlanApps, type AppKey, type PlanKey } from "@/lib/apps";

/** Platform admin: set up client accounts, choose their apps, and set which apps each plan includes. */
export type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
const UUID = /^[0-9a-f-]{36}$/i;
const err = (e: unknown) => (e instanceof Error ? e.message : String(e));
const missing = (m: string) => /app_access|platform_settings|admin_create_organisation|admin_set_organisation_apps|does not exist|Could not find/i.test(m);
const NEEDS = "Run supabase/migrations/0068_client_accounts.sql in Supabase first.";

async function admin() {
  if (!(await isSuperAdmin())) throw new Error("Not allowed.");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

export interface NewClient {
  name: string; slug: string; business_type?: string | null; plan: PlanKey; timezone: string;
  owner_email: string; owner_name?: string | null; apps: AppKey[]; send_invite: boolean;
}

export async function createClientAccount(input: NewClient): Promise<Result<{ id: string; emailed: boolean; emailError: string | null }>> {
  try {
    const { supabase } = await admin();
    const slug = String(input.slug ?? "").toLowerCase().trim();
    if (!PLAN_KEYS.includes(input.plan)) throw new Error("Choose a plan.");
    const email = String(input.owner_email ?? "").trim().toLowerCase();
    const { data, error } = await supabase.rpc("admin_create_organisation", {
      p_name: String(input.name ?? "").trim().slice(0, 120), p_slug: slug, p_business_type: input.business_type?.trim().slice(0, 80) ?? null,
      p_plan: input.plan, p_timezone: String(input.timezone || "Australia/Sydney").slice(0, 60), p_apps: cleanAppList(input.apps), p_owner_email: email,
    });
    if (error) {
      if (error.code === "23505") throw new Error(`The workspace ID “${slug}” is taken. Try another.`);
      throw new Error(missing(error.message) ? NEEDS : error.message);
    }
    const id = String(data);
    let emailed = false, emailError: string | null = null;
    if (input.send_invite) {
      const r = await sendWelcome(id, input.owner_name ?? null);
      emailed = r.ok; emailError = r.ok ? null : r.error;
    }
    revalidatePath("/admin", "layout");
    return { ok: true, data: { id, emailed, emailError } };
  } catch (e) { return { ok: false, error: err(e) }; }
}

async function sendWelcome(orgId: string, ownerName: string | null): Promise<Result> {
  try {
    const { emailConfigured, sendEmail } = await import("@/lib/email/send");
    if (!emailConfigured()) return { ok: false, error: "email isn't set up (RESEND_API_KEY)" };
    await admin();
    // the invitation belongs to the client's business, so read it with the service key (super admin checked above)
    const { createServiceClient } = await import("@/lib/integrations/runtime");
    const supabase = createServiceClient();
    const [{ data: org }, { data: inv }] = await Promise.all([
      supabase.from("organisations").select("name, app_access").eq("id", orgId).maybeSingle(),
      supabase.from("organisation_invitations").select("id, email, send_count").eq("organisation_id", orgId).eq("role", "owner").is("accepted_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (!org || !inv) return { ok: false, error: "there's no pending owner invitation" };
    const { appBaseUrl } = await import("@/lib/integrations/registry");
    const { clientWelcomeEmail } = await import("@/lib/email/templates");
    const apps = cleanAppList((org as { app_access: unknown }).app_access).map((k) => APPS.find((a) => a.key === k)!.name);
    const url = `${appBaseUrl()}/signup?email=${encodeURIComponent(inv.email as string)}&org=${encodeURIComponent(org.name as string)}`;
    await sendEmail({ to: inv.email as string, ...clientWelcomeEmail({ businessName: org.name as string, ownerName, url, apps }), fromName: "EventureOS" });
    await supabase.from("organisation_invitations").update({ last_sent_at: new Date().toISOString(), send_count: ((inv.send_count as number) ?? 0) + 1 }).eq("id", inv.id);
    return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export async function resendClientWelcome(orgId: string): Promise<Result> {
  if (!UUID.test(orgId)) return { ok: false, error: "Unknown organisation." };
  const r = await sendWelcome(orgId, null);
  return r.ok ? r : { ok: false, error: `Couldn't send: ${r.error}.` };
}

/** Set a client's apps. `null` gives them everything (how businesses set up before app access work). */
export async function setClientApps(orgId: string, apps: AppKey[] | null): Promise<Result> {
  try {
    const { supabase } = await admin();
    if (!UUID.test(orgId)) throw new Error("Unknown organisation.");
    const { error } = await supabase.rpc("admin_set_organisation_apps", { p_org: orgId, p_apps: apps === null ? null : cleanAppList(apps) });
    if (error) throw new Error(missing(error.message) ? NEEDS : error.message);
    revalidatePath("/admin", "layout");
    return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export async function savePlanApps(map: Record<string, unknown>): Promise<Result> {
  try {
    const { supabase, user } = await admin();
    const value = readPlanApps(map);
    const { error } = await supabase.from("platform_settings").upsert({ key: "plan_apps", value, updated_at: new Date().toISOString(), updated_by: user?.id ?? null });
    if (error) throw new Error(missing(error.message) ? NEEDS : error.message);
    revalidatePath("/admin", "layout");
    return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: err(e) }; }
}
