import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// /p/* is the customer portal (it handles its own sign-in); /pay/<token> and /q/<token> (quotes) are reached by unguessable links;
// /api/public, /api/cron and /api/stripe (webhook) authenticate by key/secret/signature
const PUBLIC_PATHS = ["/login", "/signup", "/auth", "/p", "/crew", "/pay", "/q", "/api/public", "/api/cron", "/api/stripe", "/api/resend", "/book", "/api/book", "/embed.js", "/downloads", "/fonts", "/media", "/jobs", "/api/jobs", "/shop"];

export async function updateSession(request: NextRequest) {
  // The app layout uses the path to keep each role to the parts of the app it may use
  const forwarded = new Headers(request.headers);
  forwarded.set("x-pathname", request.nextUrl.pathname);
  let response = NextResponse.next({ request: { headers: forwarded } });
  // Public marketing + crawler files: no session work needed (keeps the sales page fast)
  const p0 = request.nextUrl.pathname;
  if (p0 === "/" || p0 === "/robots.txt" || p0 === "/sitemap.xml") return response;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    return new NextResponse(
      "EventureOS is missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Add them in Vercel → Settings → Environment Variables, then redeploy.",
      { status: 500 }
    );
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        forwarded.set("cookie", request.headers.get("cookie") ?? "");
        response = NextResponse.next({ request: { headers: forwarded } });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });

  // Do not put code between createServerClient and getUser — it refreshes the session.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  // "/" is the public sales page; robots/sitemap for search engines
  const isPublic = path === "/" || path === "/robots.txt" || path === "/sitemap.xml" || PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"));

  if (!user && !isPublic) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/login";
    redirect.search = path && path !== "/" ? `?next=${encodeURIComponent(path + request.nextUrl.search)}` : "";
    return NextResponse.redirect(redirect);
  }
  if (user && (path === "/login" || path === "/signup")) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/dashboard";
    redirect.search = "";
    return NextResponse.redirect(redirect);
  }
  return response;
}
