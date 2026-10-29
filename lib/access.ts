import type { OrgRole } from "@/lib/types";

/**
 * What each role may open in the business app. The database enforces the real limits (row-level security);
 * this keeps the menus and pages consistent with them.
 *  - owner / admin / manager: everything
 *  - sales: enquiries, clients, events, quotes, calendar — no invoices, payments, reports or settings
 *  - staff (field staff): only My jobs
 */
const SALES_BLOCKED = ["/invoices", "/payments", "/reports", "/settings", "/wages", "/website", "/learn", "/franchise", "/pricing", "/accounts", "/printing", "/hosting"];
const STAFF_ALLOWED = ["/my-jobs", "/my-signature"];

const under = (path: string, base: string) => path === base || path.startsWith(base + "/");

export function isFieldStaff(role: OrgRole) { return role === "staff"; }

/**
 * Back-end sections a person can be limited to (Settings → Team). Someone with a list only sees those sections
 * (plus the dashboard and their own profile); no list = everything their role allows.
 */
export const SECTIONS: { key: string; label: string; group: string }[] = [
  { key: "/enquiries", label: "Enquiries", group: "Sales" }, { key: "/crm", label: "CRM", group: "Sales" }, { key: "/quotes", label: "Quotes", group: "Sales" },
  { key: "/clients", label: "Clients", group: "Sales" }, { key: "/tasks", label: "To-do", group: "Sales" },
  { key: "/events", label: "Events", group: "Operations" }, { key: "/calendar", label: "Calendar", group: "Operations" }, { key: "/rentals", label: "Hire", group: "Operations" },
  { key: "/kitchen", label: "Kitchen", group: "Operations" }, { key: "/bookings", label: "Bookings", group: "Operations" }, { key: "/wages", label: "Wages", group: "Operations" }, { key: "/printing", label: "Printing", group: "Operations" },
  { key: "/accounts", label: "Accounts (money owing)", group: "Money" }, { key: "/invoices", label: "Invoices", group: "Money" }, { key: "/payments", label: "Payments", group: "Money" },
  { key: "/nerd-herd", label: "Nerd Herd (tickets & websites)", group: "Operations" },
  { key: "/pricing", label: "Pricing", group: "Money" }, { key: "/hosting", label: "Hosting", group: "Money" }, { key: "/reports", label: "Reports", group: "Money" },
  { key: "/store", label: "Shop", group: "Selling online" }, { key: "/wholesale", label: "Wholesale", group: "Selling online" }, { key: "/offers", label: "Offers", group: "Selling online" },
  { key: "/learn", label: "Learn", group: "Selling online" }, { key: "/website", label: "Website", group: "Selling online" }, { key: "/franchise", label: "Franchise", group: "Selling online" },
  { key: "/portal", label: "Customer Portal", group: "Selling online" }, { key: "/settings", label: "Settings", group: "Admin" },
];
/** Ready-made sets of sections for common jobs. */
export const ACCESS_PRESETS: { key: string; label: string; sections: string[] }[] = [
  { key: "accounts", label: "Accounts", sections: ["/accounts", "/invoices", "/payments", "/clients"] },
  { key: "sales", label: "Sales", sections: ["/enquiries", "/crm", "/quotes", "/clients", "/calendar", "/tasks"] },
  { key: "operations", label: "Operations", sections: ["/events", "/calendar", "/rentals", "/kitchen", "/wages", "/tasks"] },
  { key: "web_designer", label: "Web designer", sections: ["/nerd-herd", "/quotes", "/invoices", "/clients", "/tasks", "/calendar"] },
];
const ALWAYS = ["/dashboard", "/my-signature", "/my-bonuses", "/notifications", "/profile"];
const SECTION_KEYS = new Set(SECTIONS.map((x) => x.key));
export const cleanAccess = (raw: unknown): string[] | null => {
  if (!Array.isArray(raw)) return null;
  const list = [...new Set(raw.filter((x): x is string => typeof x === "string" && SECTION_KEYS.has(x)))];
  return list.length ? list : null;
};

export function canOpen(role: OrgRole, path: string, access?: string[] | null): boolean {
  if (role === "staff") return STAFF_ALLOWED.some((b) => under(path, b));
  if (role === "sales" && SALES_BLOCKED.some((b) => under(path, b))) return false;
  // owners always see everything; anyone else with a section list sees only those sections (and the dashboard)
  if (role !== "owner" && access?.length) return ALWAYS.some((b) => under(path, b)) || access.some((b) => under(path, b));
  return true;
}

export function homeFor(role: OrgRole) {
  return role === "staff" ? "/my-jobs" : "/dashboard";
}

export const ROLE_SUMMARY: Record<Exclude<OrgRole, "customer">, string> = {
  owner: "Everything, including billing and the team.",
  admin: "Everything, including settings and the team.",
  manager: "Everything day to day: enquiries, quotes, events, invoices and payments.",
  sales: "Enquiries, clients, events and quotes. No invoices, payments, reports or settings.",
  staff: "Only the jobs they're rostered on. Never sees prices or invoices.",
};
