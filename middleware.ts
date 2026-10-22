import { type NextFetchEvent, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { customDomain } from "@/lib/site/host";

export async function middleware(request: NextRequest, event: NextFetchEvent) {
  // A business's own domain (www.example.com.au) → its pages and the SEO Saver's redirects
  const site = await customDomain(request, event);
  if (site) return site;
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
