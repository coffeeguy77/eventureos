/**
 * Short business addresses: eventureos.com.au/<business> opens that business's classes page.
 * Every top-level folder in app/ is a real route and is never treated as a business (a test checks this list).
 */
export const RESERVED = [
  "admin", "api", "auth", "book", "crew", "hire", "jobs", "onboarding", "p", "pay", "q", "shop", "suspended",
  "login", "signup",
  "bookings", "calendar", "clients", "crm", "dashboard", "enquiries", "events", "history", "invoices", "kitchen", "my-jobs", "my-signature", "offers",
  "payments", "portal", "quotes", "reports", "settings", "store", "tasks", "wages", "website", "xero-quotes",
  "robots.txt", "sitemap.xml", "manifest.webmanifest", "favicon.ico", "embed.js", "downloads", "fonts", "media",
];

/** A path like "/beanculture" that could be a business's short address. */
export function isShortLink(path: string) {
  const m = path.match(/^\/([a-z0-9-]{2,80})\/?$/);
  return !!m && !RESERVED.includes(m[1]);
}
