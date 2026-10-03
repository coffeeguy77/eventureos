import "server-only";
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LibraryDoc } from "./library-shared";
export * from "./library-shared";

/**
 * The business's own documents for customers: insurance certificate, food licence, artwork templates…
 * Customers see current (not expired) ones in their portal; "public" ones are also on a no-login share page.
 */


const COLS = "id, name, category, description, expires_on, public_share, mime_type, size_bytes, storage_path, created_at";

export async function loadLibrary(db: SupabaseClient, orgId: string, opts: { current?: string; publicOnly?: boolean } = {}): Promise<LibraryDoc[] | null> {
  let q = db.from("documents").select(COLS).eq("organisation_id", orgId).eq("library", true);
  if (opts.publicOnly) q = q.eq("public_share", true);
  if (opts.current) q = q.or(`expires_on.is.null,expires_on.gte.${opts.current}`);
  const { data, error } = await q.order("category").order("name");
  if (error) return null; // before the database update
  return (data ?? []) as LibraryDoc[];
}

/** The organisation's share-page token (made the first time it's needed). */
export async function shareToken(db: SupabaseClient, orgId: string, regenerate = false): Promise<string> {
  const { data } = await db.from("organisations").select("settings").eq("id", orgId).single();
  const settings = (data?.settings as Record<string, unknown> | null) ?? {};
  const have = typeof settings.docs_share_token === "string" ? settings.docs_share_token : null;
  if (have && !regenerate) return have;
  const token = randomBytes(18).toString("base64url");
  const { error } = await db.from("organisations").update({ settings: { ...settings, docs_share_token: token } }).eq("id", orgId);
  if (error) throw new Error(`Couldn't make the share link: ${error.message}`);
  return token;
}


