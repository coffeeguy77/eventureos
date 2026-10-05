import type { MetadataRoute } from "next";
import { createServiceClient, serviceRoleConfigured } from "@/lib/integrations/runtime";

export const revalidate = 3600;
const BASE = "https://www.eventureos.com.au";

/** The marketing pages, plus every business's public booking page and course pages (so they can be found in search). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const out: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE}/login`, changeFrequency: "yearly", priority: 0.3 },
  ];
  if (!serviceRoleConfigured()) return out;
  try {
    const db = createServiceClient();
    const { data: orgs } = await db.from("organisations").select("id, slug, settings").eq("status", "active");
    const live = ((orgs ?? []) as { id: string; slug: string; settings: Record<string, unknown> | null }[])
      .filter((o) => !!o.settings?.booking && (o.settings.booking as { enabled?: boolean }).enabled !== false);
    if (!live.length) return out;
    const { data: courses } = await db.from("booking_courses").select("organisation_id, slug, updated_at").in("organisation_id", live.map((o) => o.id)).eq("active", true).eq("public", true);
    for (const o of live) {
      const mine = ((courses ?? []) as { organisation_id: string; slug: string; updated_at: string }[]).filter((c) => c.organisation_id === o.id);
      if (!mine.length) continue;
      out.push({ url: `${BASE}/book/${o.slug}`, changeFrequency: "daily", priority: 0.8 });
      for (const c of mine) out.push({ url: `${BASE}/book/${o.slug}/${c.slug}`, lastModified: c.updated_at, changeFrequency: "daily", priority: 0.7 });
    }
  } catch { /* sitemap still works without the booking pages */ }
  return out;
}
