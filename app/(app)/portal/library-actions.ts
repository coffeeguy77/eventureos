"use server";

import { revalidatePath } from "next/cache";
import { canManage, requireOrg } from "@/lib/context";
import { actorName, logActivity } from "@/lib/activity";
import { errMessage } from "@/lib/integrations/runtime";
import { LIBRARY_CATEGORIES, shareToken } from "@/lib/documents/library";

export type LibResult<T = undefined> = { ok: true; data: T; message?: string } | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

async function office() {
  const ctx = await requireOrg();
  if (!canManage(ctx.role)) throw new Error("Only owners, admins and managers can change the documents customers see.");
  return ctx;
}
async function wrap<T>(fn: () => Promise<T>, message?: string): Promise<LibResult<T>> {
  try { const data = await fn(); revalidatePath("/portal"); return { ok: true, data, message }; }
  catch (e) { return { ok: false, error: errMessage(e) }; }
}
const cat = (c: unknown) => (LIBRARY_CATEGORIES as readonly string[]).includes(String(c)) ? String(c) : "Other";

export interface LibraryUpload { name: string; path: string; mime: string | null; size: number; category: string; description: string | null; expires_on: string | null; public_share: boolean }

/** Save a document the browser has just uploaded to Storage (under <org>/library/). */
export async function addLibraryDocument(f: LibraryUpload) {
  return wrap(async () => {
    const { supabase, org, user, profile } = await office();
    if (!f.path.startsWith(`${org.id}/library/`) || f.path.includes("..")) throw new Error("That upload went to the wrong place. Please try again.");
    if (f.expires_on && !DATE.test(f.expires_on)) throw new Error("Check the expiry date.");
    const name = String(f.name ?? "").trim().slice(0, 255) || "Document";
    const { data, error } = await supabase.from("documents").insert({
      organisation_id: org.id, name, storage_path: f.path, mime_type: f.mime?.slice(0, 120) ?? null, size_bytes: Math.max(0, Math.round(Number(f.size) || 0)),
      library: true, visibility: "customer", category: cat(f.category), description: f.description?.trim().slice(0, 500) || null,
      expires_on: f.expires_on || null, public_share: !!f.public_share, uploaded_by: user.id,
    }).select("id").single();
    if (error) {
      await supabase.storage.from("documents").remove([f.path]);
      throw new Error(/library|category/.test(error.message) ? "Run the documents database update (0045) first." : `Couldn't save the document: ${error.message}`);
    }
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "document.uploaded", entityType: "document", entityId: data.id,
      summary: `${actorName(profile)} added ‘${name}’ to the documents customers can see (${cat(f.category)})` });
    return data.id as string;
  });
}

export async function updateLibraryDocument(id: string, patch: { category?: string; description?: string | null; expires_on?: string | null; public_share?: boolean; name?: string }) {
  return wrap(async () => {
    const { supabase, org } = await office();
    if (!UUID.test(id)) throw new Error("Refresh and try again.");
    if (patch.expires_on && !DATE.test(patch.expires_on)) throw new Error("Check the expiry date.");
    const next: Record<string, unknown> = {};
    if (patch.category !== undefined) next.category = cat(patch.category);
    if (patch.description !== undefined) next.description = patch.description?.trim().slice(0, 500) || null;
    if (patch.expires_on !== undefined) next.expires_on = patch.expires_on || null;
    if (patch.public_share !== undefined) next.public_share = !!patch.public_share;
    if (patch.name !== undefined) { const n = patch.name.trim().slice(0, 255); if (!n) throw new Error("Give it a name."); next.name = n; }
    const { error } = await supabase.from("documents").update(next).eq("id", id).eq("organisation_id", org.id).eq("library", true);
    if (error) throw new Error(error.message);
  }, "Saved.");
}

export async function removeLibraryDocument(id: string) {
  return wrap(async () => {
    const { supabase, org, user, profile } = await office();
    if (!UUID.test(id)) throw new Error("Refresh and try again.");
    const { data: d } = await supabase.from("documents").select("id, name, storage_path").eq("id", id).eq("organisation_id", org.id).eq("library", true).maybeSingle();
    if (!d) return;
    const { error } = await supabase.from("documents").delete().eq("id", id);
    if (error) throw new Error(error.message);
    if (d.storage_path) await supabase.storage.from("documents").remove([d.storage_path]);
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "document.removed", entityType: "document", entityId: id,
      summary: `${actorName(profile)} removed ‘${d.name}’ from the documents customers can see` });
  }, "Removed.");
}

/** The no-login page with the documents marked "public" — to paste into emails. */
export async function libraryShareLink(regenerate = false) {
  return wrap(async () => {
    const { supabase, org } = await office();
    const token = await shareToken(supabase, org.id, regenerate);
    const { appBaseUrl } = await import("@/lib/integrations/registry");
    return `${appBaseUrl()}/p/${org.slug}/docs/${token}`;
  }, regenerate ? "New link made — the old one no longer works." : undefined);
}
