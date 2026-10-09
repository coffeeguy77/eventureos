"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { applyEdits } from "@/lib/site/copy";

async function managerOf(slug: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("organisation_users").select("role, organisation:organisations(id, slug)").eq("user_id", user.id).eq("status", "active");
  const row = ((data ?? []) as unknown as { role: string; organisation: { id: string; slug: string } | null }[])
    .find((r) => r.organisation?.slug === slug && ["owner", "admin", "manager"].includes(r.role));
  return row ? { supabase, orgId: row.organisation!.id } : null;
}

/** Can the signed-in person edit this business's website? (Owners, admins and managers.) */
export async function pageEditAccess(slug: string): Promise<{ orgId: string } | null> {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  const m = await managerOf(slug).catch(() => null);
  return m ? { orgId: m.orgId } : null;
}

/** Save words and photos changed on a public page. */
export async function savePageEdits(slug: string, edits: { path: string; value: string }[]): Promise<{ ok: true; saved: number } | { ok: false; error: string }> {
  try {
    if (!Array.isArray(edits) || !edits.length) return { ok: true, saved: 0 };
    if (edits.length > 200) return { ok: false, error: "Too many changes at once — save in smaller batches." };
    const m = await managerOf(String(slug));
    if (!m) return { ok: false, error: "Only owners, admins and managers can edit the website. Sign in again and retry." };
    const { data, error } = await m.supabase.from("organisations").select("settings").eq("id", m.orgId).single();
    if (error) throw new Error(error.message);
    const next = applyEdits((data?.settings ?? {}) as Record<string, unknown>, edits);
    const { error: e2 } = await m.supabase.from("organisations").update({ settings: next }).eq("id", m.orgId);
    if (e2) throw new Error(e2.message);
    revalidatePath("/", "layout");
    await m.supabase.from("activity_logs").insert({ organisation_id: m.orgId, action: "website.edited", entity_type: "organisation", entity_id: m.orgId, summary: `Website edited on the page — ${edits.length} change${edits.length === 1 ? "" : "s"}` }).then(() => undefined, () => undefined);
    return { ok: true, saved: edits.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't save the changes." };
  }
}
