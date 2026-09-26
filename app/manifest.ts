import type { MetadataRoute } from "next";

/** Lets EventureOS be added to a phone or tablet home screen and open full-screen like an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "EventureOS",
    short_name: "EventureOS",
    description: "The operating system for event businesses.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#F7F7F9",
    theme_color: "#ffffff",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/brand/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
