import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/p/", "/pay/", "/admin", "/dashboard", "/settings", "/auth/"] }],
    sitemap: "https://www.eventureos.com.au/sitemap.xml",
    host: "https://www.eventureos.com.au",
  };
}
