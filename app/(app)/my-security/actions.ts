"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

type R<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: e instanceof Error ? e.message : "Something went wrong." });

/** Start setting up an authenticator app: a QR code to scan (and the key to type in by hand). */
export async function startTwoStep(): Promise<R<{ factorId: string; qr: string; secret: string }>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Sign in again.");
    // clear any half-finished set-up first
    const { data: f } = await supabase.auth.mfa.listFactors();
    for (const x of f?.all ?? []) if (x.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: x.id });
    if ((f?.totp ?? []).length) throw new Error("Two-step sign-in is already on.");
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `EventureOS ${new Date().toISOString().slice(0, 10)}`, issuer: "EventureOS" });
    if (error) throw new Error(/not enabled|disabled/i.test(error.message) ? "Two-step sign-in isn't switched on for this site yet." : error.message);
    return { ok: true, data: { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret } };
  } catch (e) { return fail(e); }
}

/** Finish setting up: the first code from the app proves it's working. */
export async function confirmTwoStep(factorId: string, code: string): Promise<R> {
  try {
    const c = String(code ?? "").replace(/\s+/g, "");
    if (!/^\d{6}$/.test(c)) throw new Error("Enter the 6-digit code from the app.");
    const supabase = await createClient();
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: c });
    if (error) throw new Error(/invalid|expired/i.test(error.message) ? "That code didn't work — check the time on your phone is right and try the newest code." : error.message);
    revalidatePath("/my-security");
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

/** Turn two-step sign-in off (needs a two-step session, which everyone with it on has). */
export async function removeTwoStep(): Promise<R> {
  try {
    const supabase = await createClient();
    const { data: f } = await supabase.auth.mfa.listFactors();
    for (const x of f?.all ?? []) {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: x.id });
      if (error) throw new Error(/aal2|assurance/i.test(error.message) ? "Sign out and back in with your code, then try again." : error.message);
    }
    await supabase.auth.refreshSession();
    revalidatePath("/my-security");
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

/** Link a Google account to this login, so "Continue with Google" signs in here. */
export async function linkGoogle(): Promise<R<string>> {
  try {
    const supabase = await createClient();
    const h = await headers();
    const origin = h.get("origin") ?? `https://${h.get("host")}`;
    const { data, error } = await supabase.auth.linkIdentity({ provider: "google", options: { redirectTo: `${origin}/auth/callback?next=/my-security` } });
    if (error || !data?.url) throw new Error(error?.message && /manual linking|disabled/i.test(error.message) ? "Linking accounts isn't switched on yet — or just use \"Continue with Google\" with the same email address." : error?.message ?? "Couldn't start Google.");
    return { ok: true, data: data.url };
  } catch (e) { return fail(e); }
}
