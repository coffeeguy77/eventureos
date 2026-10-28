import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { readSite, routeFor, withTracking } from "./site";
import { newPages } from "./pages";
import { AGENCY_PAGES } from "./agency/content";

/**
 * A business's own domain (e.g. www.beanculture.com.au) pointed at EventureOS: find the business, then send each
 * address to the right page — or 301 an old address to its new page (SEO Saver). Runs in middleware.
 */
const PLATFORM = /^(localhost|127\.0\.0\.1|\[::1\]|([a-z0-9-]+\.)*eventureos\.com\.au|[a-z0-9-]+\.vercel\.app)$/;
export const isPlatformHost = (host: string) => !host || PLATFORM.test(host);

type Hit = { id: string; slug: string; name: string; settings: Record<string, unknown>; app_access?: string[] | null } | null;
const cache = new Map<string, { at: number; org: Hit }>();

async function lookup(host: string): Promise<Hit> {
  const c = cache.get(host);
  if (c && Date.now() - c.at < 60_000) return c.org;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  const bare = host.replace(/^www\./, "");
  const q = `select=id,slug,name,settings,app_access&status=eq.active&or=(settings->site->>domain.eq.${encodeURIComponent(host)},settings->site->>domain.eq.${encodeURIComponent(bare)},settings->site->>domain.eq.www.${encodeURIComponent(bare)})&limit=1`;
  let org: Hit = null;
  try {
    const r = await fetch(`${url}/rest/v1/organisations?${q}`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" });
    if (r.ok) org = ((await r.json()) as Hit[])[0] ?? null;
  } catch { return c?.org ?? null; }
  cache.set(host, { at: Date.now(), org });
  return org;
}

function logHit(event: NextFetchEvent, orgId: string, path: string, kind: string, target: string | null, referrer: string | null) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return;
  event.waitUntil(fetch(`${url}/rest/v1/rpc/site_url_hit`, {
    method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_org: orgId, p_path: path.slice(0, 400), p_kind: kind, p_target: target, p_referrer: referrer?.slice(0, 400) ?? null }),
  }).then(() => undefined, () => undefined));
}

/** null = not a business domain (carry on as normal). */
export async function customDomain(request: NextRequest, event: NextFetchEvent): Promise<NextResponse | null> {
  const host = (request.headers.get("host") ?? "").toLowerCase().replace(/:\d+$/, "");
  if (isPlatformHost(host)) return null;
  const org = await lookup(host);
  if (!org) return new NextResponse("This website isn't set up yet.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  const site = readSite(org.settings);
  const path = request.nextUrl.pathname;
  // One address only: the bare domain (or www) goes to the address set in settings
  if (site.domain && host !== site.domain) {
    const to = new URL(request.url); to.host = site.domain; to.protocol = "https:"; to.port = "";
    return NextResponse.redirect(to, 301);
  }
  const agency = Array.isArray(org.app_access) && org.app_access.includes("nerdherd") ? { pages: AGENCY_PAGES } : null;
  const r = routeFor(site, org.slug, path, site.fallback ? newPages(org.settings, org.name) : [], agency);
  const ref = request.headers.get("referer");
  const headers = new Headers(request.headers);
  headers.set("x-site-host", host);
  headers.set("x-site-org", org.slug);
  if (r.kind === "pass") { headers.set("x-pathname", path); return NextResponse.next({ request: { headers } }); }
  if (r.kind === "rewrite") {
    const to = new URL(r.to, request.url);
    if (!r.to.includes("?")) to.search = request.nextUrl.search;
    headers.set("x-pathname", to.pathname);
    return NextResponse.rewrite(to, { request: { headers } });
  }
  if (r.kind === "redirect") {
    logHit(event, org.id, path, "redirect", r.to, ref);
    const to = r.to.startsWith("http") ? r.to : withTracking(r.to, request.nextUrl.search);
    return NextResponse.redirect(new URL(to, request.url), r.status);
  }
  if (r.kind === "gone") { logHit(event, org.id, path, "gone", null, ref); return new NextResponse("This page has been removed.", { status: 410, headers: { "content-type": "text/plain; charset=utf-8" } }); }
  logHit(event, org.id, path, "missing", null, ref);
  const to = new URL(`/site/${org.slug}/not-found-page`, request.url);
  return NextResponse.rewrite(to, { request: { headers } });
}
