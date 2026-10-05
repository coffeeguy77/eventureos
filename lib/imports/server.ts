import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * One-off data imports (moving old records into EventureOS). A browser that is signed in to the old system
 * (Google Drive, WordPress) reads the data there and posts it here with a short-lived import key.
 * Only the key's hash is stored; keys expire on their own.
 */
const ALLOWED = ["https://docs.google.com", "https://drive.google.com", "https://drive.usercontent.google.com", "https://www.beanculture.com.au", "https://beanculture.com.au"];

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  if (!ALLOWED.includes(origin)) return {};
  return { "access-control-allow-origin": origin, "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type, x-import-key", "access-control-max-age": "600", vary: "origin" };
}

export async function importOrg(db: SupabaseClient, req: Request, purpose: string): Promise<string | null> {
  const key = req.headers.get("x-import-key") ?? "";
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(key)) return null;
  const hash = createHash("sha256").update(key).digest("hex");
  const { data } = await db.from("import_keys").select("organisation_id, purpose, expires_at").eq("key_hash", hash).maybeSingle();
  if (!data || Date.parse(data.expires_at as string) < Date.now()) return null;
  if (data.purpose !== purpose && data.purpose !== "all") return null;
  return data.organisation_id as string;
}

/** Small CSV reader (quotes, commas and new lines inside quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && s[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}
