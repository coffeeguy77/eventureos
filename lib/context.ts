import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Member, OrgRole, Organisation } from "@/lib/types";

export const ORG_COOKIE = "eos_org";

export interface Membership {
  role: OrgRole;
  title: string | null;
  expires_at?: string | null;
  /** sections this person is limited to (null = everything their role allows) */
  access?: string[] | null;
  organisation: Organisation;
}

/** Signed-in user, their organisations and the currently selected one.
 *  Cached per request. Tenant security itself is enforced by RLS in Postgres. */
export const getContext = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const ORG = "organisation:organisations(id, name, slug, business_type, contact_email, brand_colour, logo_url, timezone, currency, plan, settings)";
  const mine = (cols: string) => supabase.from("organisation_users").select(cols).eq("user_id", user.id).eq("status", "active")
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);
  const [{ data: profile }, first] = await Promise.all([
    supabase.from("users").select("id, email, full_name, ui_prefs").eq("id", user.id).maybeSingle(),
    mine(`role, title, expires_at, access, ${ORG}`),
  ]);
  // before the 0072 database update there's no access column
  let { data: rows, error } = first;
  if (error && /access/.test(error.message)) ({ data: rows, error } = await mine(`role, title, expires_at, ${ORG}`));
  if (error) throw new Error(`Could not load your organisations: ${error.message}`);

  const all = (rows ?? []) as unknown as (Membership & { title: string | null })[];
  const portalOnly = all.filter((m) => m.organisation && m.role === "customer");
  // An active membership whose organisation can't be read means the organisation is suspended.
  const suspended = all.some((m) => !m.organisation && m.role !== "customer");
  const memberships = all
    .filter((m) => m.organisation && m.role !== "customer")
    .sort((a, b) => a.organisation.name.localeCompare(b.organisation.name));

  const chosen = (await cookies()).get(ORG_COOKIE)?.value;
  const current = memberships.find((m) => m.organisation.id === chosen) ?? memberships[0];

  return {
    supabase,
    user,
    profile: (profile ?? { id: user.id, email: user.email ?? "", full_name: null }) as Member,
    memberships,
    portalOrgs: portalOnly.map((m) => m.organisation),
    suspended,
    current,
    isSupportSession: current?.title === "EventureOS Support",
  };
});

/** Like getContext, but guarantees an organisation (sends new users to onboarding). */
export async function requireOrg() {
  const ctx = await getContext();
  if (!ctx.current) {
    // Portal-only customers belong in their portal, not the staff app
    if (ctx.portalOrgs.length) redirect(`/p/${ctx.portalOrgs[0].slug}`);
    if (ctx.suspended) redirect("/suspended");
    // Staff-app people (casual baristas) belong in their staff app
    const crewSlug = await crewAppFor(ctx.user.id);
    if (crewSlug) redirect(`/crew/${crewSlug}?office=1`);
    redirect("/onboarding");
  }
  const org = ctx.current.organisation;
  if (ctx.isSupportSession) {
    // EventureOS support works as the business: emails, sign-offs and reply-to addresses are the business's own,
    // never the support person's. The audit trail still says "EventureOS Support" (see actorName).
    const biz = ((org.settings ?? {}) as { business?: { contact_name?: unknown } }).business;
    const name = typeof biz?.contact_name === "string" && biz.contact_name.trim() ? biz.contact_name.trim() : org.name;
    const profile = { ...ctx.profile, full_name: name, email: org.contact_email || ctx.profile.email, actorLabel: "EventureOS Support" } as Member;
    return { ...ctx, realProfile: ctx.profile, profile, org, role: ctx.current.role, access: null as string[] | null };
  }
  return { ...ctx, realProfile: ctx.profile, org, role: ctx.current.role, access: ctx.current.access ?? null };
}

/** The staff app this login belongs to, if they're on an organisation's staff list (not an office user). */
async function crewAppFor(userId: string): Promise<string | null> {
  try {
    const { createServiceClient } = await import("@/lib/integrations/runtime");
    const { data } = await createServiceClient().from("crew_members").select("org:organisations(slug)").eq("user_id", userId).eq("active", true).limit(1).maybeSingle();
    return (data?.org as unknown as { slug: string } | null)?.slug ?? null;
  } catch { return null; }
}

export const getMembers = cache(async (orgId: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organisation_users")
    .select("role, title, user:users!organisation_users_user_id_fkey(id, full_name, email)")
    .eq("organisation_id", orgId)
    .eq("status", "active")
    .neq("role", "customer");
  if (error) throw new Error(`Could not load team: ${error.message}`);
  return ((data ?? []) as unknown as { role: OrgRole; title: string | null; user: Member }[])
    .filter((m) => m.user)
    .map((m) => ({ ...m.user, role: m.role, title: m.title }));
});

export const isSuperAdmin = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("is_super_admin");
  return data === true;
});

export function canManage(role: OrgRole) {
  return role === "owner" || role === "admin" || role === "manager";
}
