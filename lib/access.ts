import type { OrgRole } from "@/lib/types";

/**
 * What each role may open in the business app. The database enforces the real limits (row-level security);
 * this keeps the menus and pages consistent with them.
 *  - owner / admin / manager: everything
 *  - sales: enquiries, clients, events, quotes, calendar — no invoices, payments, reports or settings
 *  - staff (field staff): only My jobs
 */
const SALES_BLOCKED = ["/invoices", "/payments", "/reports", "/settings"];
const STAFF_ALLOWED = ["/my-jobs", "/my-signature"];

const under = (path: string, base: string) => path === base || path.startsWith(base + "/");

export function isFieldStaff(role: OrgRole) { return role === "staff"; }

export function canOpen(role: OrgRole, path: string): boolean {
  if (role === "staff") return STAFF_ALLOWED.some((b) => under(path, b));
  if (role === "sales") return !SALES_BLOCKED.some((b) => under(path, b));
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
