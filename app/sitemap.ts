import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: "https://www.eventureos.com.au/", changeFrequency: "weekly", priority: 1 },
    { url: "https://www.eventureos.com.au/login", changeFrequency: "yearly", priority: 0.3 },
  ];
}
