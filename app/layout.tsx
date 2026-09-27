import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { cookies } from "next/headers";
import { htmlAttrs, parsePrefs, PREFS_COOKIE } from "@/lib/theme/prefs";
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Display preferences come from a cookie so the first paint is already in the right theme
  const prefs = parsePrefs((await cookies()).get(PREFS_COOKIE)?.value);
  return (
    <html lang="en-AU" className={`${GeistSans.variable} ${GeistMono.variable}`} {...htmlAttrs(prefs)} suppressHydrationWarning>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
