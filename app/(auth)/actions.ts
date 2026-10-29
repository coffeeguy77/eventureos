"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-next";

export type AuthState = { error?: string; message?: string } | undefined;


export async function signIn(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (!error) await supabase.rpc("accept_my_invitations");
  if (error) {
    return {
      error:
        error.message === "Invalid login credentials"
          ? "That email and password combination didn’t work. Check both and try again."
          : error.message === "Email not confirmed"
            ? "Please confirm your email first — check your inbox for the link we sent."
            : error.message,
    };
  }
  redirect(safeNext(form.get("next")));
}

export async function signUp(_prev: AuthState, form: FormData): Promise<AuthState> {
  const fullName = String(form.get("full_name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!fullName || !email) return { error: "Enter your name and email." };
  if (password.length < 8) return { error: "Use a password with at least 8 characters." };

  const h = await headers();
  const origin = h.get("origin") ?? `https://${h.get("host")}`;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName }, emailRedirectTo: `${origin}/auth/callback?next=/onboarding` },
  });
  if (error) return { error: error.message };
  if (data.session) redirect("/onboarding");
  return { message: `Check ${email} for a confirmation link, then come back to finish setting up.` };
}

export type CodeState = { step: "email" | "code"; email?: string; error?: string; message?: string };

/**
 * Forgot your password? Sign in with a one-time code emailed to you (only for people who already have a login),
 * then choose a new password.
 */
export async function loginWithCode(prev: CodeState, form: FormData): Promise<CodeState> {
  const email = String(form.get("email") ?? prev.email ?? "").trim().toLowerCase();
  const intent = String(form.get("intent") ?? "send");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { step: "email", error: "Enter the email address you sign in with." };
  const supabase = await createClient();
  if (intent === "send" || intent === "resend") {
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    // Don't reveal whether an email has a login: same message either way (unless it's a rate limit)
    if (error && /rate|seconds|too many/i.test(error.message)) return { step: intent === "resend" ? "code" : "email", email, error: "Too many codes asked for — wait a minute and try again." };
    return { step: "code", email, message: `If ${email} has a login, a sign-in code is on its way. Check your inbox (and junk).` };
  }
  const token = String(form.get("code") ?? "").replace(/\s+/g, "");
  if (!/^\d{6,10}$/.test(token)) return { step: "code", email, error: "Enter the code from the email (numbers only)." };
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) return { step: "code", email, error: /expired|invalid/i.test(error.message) ? "That code didn't work or has expired — ask for a new one." : error.message };
  await supabase.rpc("accept_my_invitations");
  redirect("/login/new-password");
}

export async function setOwnPassword(_prev: AuthState, form: FormData): Promise<AuthState> {
  const password = String(form.get("password") ?? "");
  const again = String(form.get("again") ?? "");
  if (password.length < 8) return { error: "Use a password with at least 8 characters." };
  if (password !== again) return { error: "The two passwords don't match." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Your sign-in code has expired — start again from Forgot your password?" };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: /same/i.test(error.message) ? "That's your current password — choose a different one." : /weak|pwned|leaked/i.test(error.message) ? "That password is too easy to guess — choose another." : error.message };
  redirect("/dashboard");
}
