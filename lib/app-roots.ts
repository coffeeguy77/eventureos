/**
 * The business app's own top-level pages. Everything else at /<one-word> is a business's public page or short link,
 * which always shows in the light look. A section missing here loses the user's dark mode when the page is loaded
 * fresh (e.g. a search form), so lib/app-roots.test.ts checks this list against app/(app).
 */
export const APP_ROOTS = new Set(["dashboard", "tasks", "enquiries", "crm", "quotes", "events", "calendar", "kitchen", "bookings", "learn", "store", "wholesale", "offers", "website",
  "clients", "invoices", "payments", "wages", "portal", "reports", "settings", "my-jobs", "my-signature", "history", "xero-quotes", "franchise", "rentals", "login", "signup", "auth",
  "admin", "onboarding", "crew", "suspended", "api", "accounts", "hosting", "nerd-herd", "pricing", "printing", "my-bonuses"]);
