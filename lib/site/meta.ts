import type { Metadata } from "next";
import { cleanPath, readSite } from "./site";

/**
 * The address Google should treat as the real one for a public page. Once the business's own domain is live,
 * that's the clean address on its domain (https://www.example.com.au/hire/catering) — wherever the page is opened from,
 * so the EventureOS copy never competes with it in search.
 */
export function canonicalFor(org: { slug: string; rawSettings: Record<string, unknown> }, internalPath: string): string {
  const site = readSite(org.rawSettings);
  if (site.live && site.domain) return `https://${site.domain}${cleanPath(org.slug, internalPath)}`;
  return internalPath;
}

/** Page metadata with the canonical address filled in. */
export function siteMeta(org: { slug: string; rawSettings: Record<string, unknown>; name?: string }, internalPath: string, meta: Metadata): Metadata {
  const url = canonicalFor(org, internalPath);
  // A business's own page carries its own title — never "· EventureOS" on the end (that would compete with its name in search)
  const title = typeof meta.title === "string" ? { absolute: meta.title } : meta.title;
  return { ...meta, ...(title ? { title } : {}), alternates: { ...(meta.alternates ?? {}), canonical: url },
    openGraph: { ...(org.name ? { siteName: org.name } : {}), ...(typeof meta.title === "string" ? { title: meta.title } : {}), ...(meta.openGraph ?? {}), url } };
}
