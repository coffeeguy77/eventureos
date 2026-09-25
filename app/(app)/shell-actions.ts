"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ORG_COOKIE, getContext, requireOrg } from "@/lib/context";

export async function switchOrganisation(orgId: string) {
  const ctx = await getContext();
  if (!ctx.memberships.some((m) => m.organisation.id === orgId)) {
    throw new Error("You don't have access to that organisation.");
  }
  (await cookies()).set(ORG_COOKIE, orgId, { path: "/", httpOnly: true, sameSite: "lax", secure: true, maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function markAllNotificationsRead() {
  const { supabase, org } = await requireOrg();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("organisation_id", org.id)
    .is("read_at", null);
  if (error) throw new Error(`Could not update notifications: ${error.message}`);
  revalidatePath("/", "layout");
}

export async function signOut() {
  const { supabase } = await getContext();
  await supabase.auth.signOut();
  (await cookies()).delete(ORG_COOKIE);
  redirect("/login");
}

export type SearchResult = { kind: string; id: string; title: string; subtitle: string | null; href: string };

export async function globalSearch(q: string): Promise<SearchResult[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const { supabase, org } = await requireOrg();
  const { data, error } = await supabase.rpc("global_search", { org: org.id, q: term, max_results: 24 });
  if (error) throw new Error(`Search failed: ${error.message}`);
  return (data ?? []) as SearchResult[];
}
