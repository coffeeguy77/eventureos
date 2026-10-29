import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { cookies, headers } from "next/headers";
import { DEFAULT_PREFS, htmlAttrs, parsePrefs, PREFS_COOKIE } from "@/lib/theme/prefs";
import { APP_ROOTS } from "@/lib/app-roots";
import "./theme.css";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL?.trim() || "https://www.eventureos.com.au"),
  title: { default: "EventureOS", template: "%s · EventureOS" },
  description: "The operating system for event businesses.",
  applicationName: "EventureOS",
  appleWebApp: { capable: true, title: "EventureOS", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  openGraph: {
    siteName: "EventureOS",
    title: "EventureOS",
    description: "The operating system for event businesses.",
    images: [{ url: "/brand/og.png", width: 1200, height: 630, alt: "EventureOS — The operating system for event businesses." }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#ffffff" }, { media: "(prefers-color-scheme: dark)", color: "#17171D" }],
};

const CUSTOMER_PAGES = ["/p/", "/pay/", "/q/", "/order/", "/hire/", "/shop/", "/cafe/", "/jobs/", "/print/", "/academy/", "/book/", "/site/"];
function isPublicPath(path: string) {
  if (path === "/" || CUSTOMER_PAGES.some((p) => path.startsWith(p))) return true;
  const first = path.split("/")[1] ?? "";
  return !!first && !APP_ROOTS.has(first) && /^[a-z0-9-]+$/.test(first);
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Display preferences come from a cookie so the first paint is already in the right theme
  let prefs = parsePrefs((await cookies()).get(PREFS_COOKIE)?.value);
  const path = (await headers()).get("x-pathname") ?? "";
  // Public pages (the website, booking, shop, café, events, jobs, academy, quote and ordering links) always look the same
  // for everyone: light, standard contrast and the standard text size — your own app display settings never change them,
  // so menus and text are the same size on every page.
  if (isPublicPath(path)) prefs = { ...prefs, scheme: "light", contrast: "normal", text: DEFAULT_PREFS.text };
  return (
    <html lang="en-AU" className={`${GeistSans.variable} ${GeistMono.variable}`} {...htmlAttrs(prefs)} suppressHydrationWarning>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
