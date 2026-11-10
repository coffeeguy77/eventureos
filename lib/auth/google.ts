import "server-only";

/**
 * Is Google sign-in switched on in Supabase (Authentication → Sign In / Providers → Google)? Read from Supabase's
 * public auth settings and cached for 5 minutes, so the "Continue with Google" button appears by itself once it's on.
 */
export async function googleSignInOn(): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return false;
  try {
    const r = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key }, next: { revalidate: 300 }, signal: AbortSignal.timeout(4000) });
    if (!r.ok) return false;
    const s = (await r.json()) as { external?: { google?: boolean } };
    return s.external?.google === true;
  } catch { return false; }
}
