"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ORG_COOKIE, getContext } from "@/lib/context";

export type OnboardingState = { error?: string } | undefined;

function slugify(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

export async function createOrganisation(_prev: OnboardingState, form: FormData): Promise<OnboardingState> {
  const name = String(form.get("name") ?? "").trim();
  const businessType = String(form.get("business_type") ?? "").trim() || null;
  const slug = slugify(String(form.get("slug") ?? "") || name);
  if (name.length < 2) return { error: "Enter your business name." };
  if (slug.length < 2) return { error: "Choose a workspace ID with at least two letters or numbers." };

  const { supabase } = await getContext();
  const { data, error } = await supabase.rpc("create_organisation", {
    org_name: name,
    org_slug: slug,
    org_business_type: businessType,
  });
  if (error) {
    if (error.code === "23505") return { error: `The workspace ID “${slug}” is taken. Try another.` };
    return { error: `Couldn't create the organisation: ${error.message}` };
  }
  (await cookies()).set(ORG_COOKIE, String(data), { path: "/", httpOnly: true, sameSite: "lax", secure: true, maxAge: 60 * 60 * 24 * 365 });
  redirect("/dashboard");
}
