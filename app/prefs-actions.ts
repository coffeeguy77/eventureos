"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { parsePrefs, PREFS_COOKIE, serializePrefs, type UiPrefs } from "@/lib/theme/prefs";

/** Save display preferences to this browser (cookie) and, when signed in, to the account. */
export async function savePrefs(input: UiPrefs, remember = true): Promise<{ ok: boolean }> {
  const p = parsePrefs(input);
  const jar = await cookies();
  jar.set(PREFS_COOKIE, serializePrefs(p), { path: "/", maxAge: 60 * 60 * 24 * 400, sameSite: "lax", secure: true, httpOnly: false });
  if (remember) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await supabase.from("users").update({ ui_prefs: p }).eq("id", user.id);
  }
  return { ok: true };
}
