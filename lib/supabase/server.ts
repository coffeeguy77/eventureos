import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseEnv } from "@/lib/env";

/**
 * Right after sign-in, the database can briefly reject a brand-new token as
 * "issued at future" (a small clock difference between Supabase Auth and the
 * database). Wait and retry instead of crashing the page.
 */
const fetchWithSkewRetry: typeof fetch = async (input, init) => {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(input, init);
    if (res.status !== 401 || attempt >= 3) return res;
    const body = await res.clone().text();
    if (!/issued at future/i.test(body)) return res;
    await new Promise((r) => setTimeout(r, 1000));
  }
};

/** Supabase client for Server Components, Server Actions and Route Handlers.
 *  Runs as the signed-in user, so Row Level Security applies to every query. */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, key } = supabaseEnv();
  return createServerClient(url, key, {
    global: { fetch: fetchWithSkewRetry },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component — middleware refreshes the session instead.
        }
      },
    },
  });
}
