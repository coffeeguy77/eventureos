"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ORG_COOKIE, isSuperAdmin } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";

export type AdminState = { error?: string; ok?: string } | undefined;

const PLANS = ["trial", "starter", "growth", "scale"];
const STATUSES = ["active", "suspended", "cancelled"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function admin() {
  if (!(await isSuperAdmin())) throw new Error("Not allowed.");
  return createClient();
}

export async function setOrganisationPlanStatus(_prev: AdminState, form: FormData): Promise<AdminState> {
  try {
    const supabase = await admin();
    const org = String(form.get("org_id") ?? "");
    const plan = String(form.get("plan") ?? "");
    const status = String(form.get("status") ?? "");
    if (!UUID_RE.test(org)) return { error: "Unknown organisation." };
    if (!PLANS.includes(plan)) return { error: "Choose a plan." };
    if (!STATUSES.includes(status)) return { error: "Choose a status." };
    const { error } = await supabase.rpc("admin_set_organisation_status", { p_org: org, p_status: status, p_plan: plan });
    if (error) return { error: `Couldn't update the organisation: ${error.message}` };
    revalidatePath("/admin", "layout");
    return { ok: "Saved." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't update the organisation." };
  }
}

/** Start an audited, time-limited support session and open the organisation. */
export async function startSupportSession(_prev: AdminState, form: FormData): Promise<AdminState> {
  const org = String(form.get("org_id") ?? "");
  const reason = String(form.get("reason") ?? "").trim();
  const minutes = Number(form.get("minutes") ?? 60);
  try {
    const supabase = await admin();
    if (!UUID_RE.test(org)) return { error: "Unknown organisation." };
    if (reason.length < 5) return { error: "Give a reason (it's recorded in the organisation's audit log)." };
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 240) return { error: "Choose a duration between 5 minutes and 4 hours." };
    const { error } = await supabase.rpc("admin_start_support_session", { p_org: org, p_reason: reason.slice(0, 500), p_minutes: minutes });
    if (error) return { error: `Couldn't start support session: ${error.message}` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't start support session." };
  }
  (await cookies()).set(ORG_COOKIE, org, { path: "/", httpOnly: true, sameSite: "lax", secure: true, maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

/** End a support session (used by the admin console and the in-app support banner). */
export async function endSupportSession(orgId: string) {
  const supabase = await admin();
  if (!UUID_RE.test(orgId)) throw new Error("Unknown organisation.");
  const { error } = await supabase.rpc("admin_end_support_session", { p_org: orgId });
  if (error) throw new Error(`Couldn't end support session: ${error.message}`);
  const jar = await cookies();
  if (jar.get(ORG_COOKIE)?.value === orgId) jar.delete(ORG_COOKIE);
  revalidatePath("/", "layout");
  redirect("/admin");
}

/** Re-open an organisation while a support session is still active. */
export async function openSupportSession(orgId: string) {
  const supabase = await admin();
  if (!UUID_RE.test(orgId)) throw new Error("Unknown organisation.");
  const { data: { user } } = await supabase.auth.getUser();
  const { data } = await supabase
    .from("organisation_users")
    .select("id")
    .eq("organisation_id", orgId)
    .eq("user_id", user?.id ?? "")
    .eq("title", "EventureOS Support")
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (!data) throw new Error("That support session has ended. Start a new one.");
  (await cookies()).set(ORG_COOKIE, orgId, { path: "/", httpOnly: true, sameSite: "lax", secure: true, maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
  redirect("/dashboard");
}
