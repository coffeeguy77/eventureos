// Fail loudly if the Supabase environment variables are missing.
export function supabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "EventureOS is missing its Supabase settings. Add NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to your environment variables (Vercel → Project → Settings → Environment Variables)."
    );
  }
  return { url, key };
}
