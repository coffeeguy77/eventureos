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

  const [{ data: profile }, { data: rows, error }] = await Promise.all([
    supabase.from("users").select("id, email, full_name").eq("id", user.id).maybeSingle(),
    supabase
      .from("organisation_users")
      .select(
        "role, title, expires_at, organisation:organisations(id, name, slug, business_type, contact_email, brand_colour, logo_url, timezone, currency, plan, settings)"
      )
      .eq("user_id", user.id)
      .eq("status", "active")
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`),
  ]);
  if (error) throw new Error(`Could not load your organisations: ${error.message}`);

  const all = (rows ?? []) as unknown as (Membership & { title: string | null })[];
  const portalOnly = all.filter((m) => m.organisation && m.role === "customer");
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
    redirect("/onboarding");
  }
  return { ...ctx, org: ctx.current.organisation, role: ctx.current.role };
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
