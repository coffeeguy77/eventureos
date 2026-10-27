import { NextResponse } from "next/server";
import { canManage, requireOrg } from "@/lib/context";
import { createServiceClient } from "@/lib/integrations/runtime";
import { loadBillingCheck } from "@/lib/hosting/billing-check";

export const dynamic = "force-dynamic";

const LABEL: Record<string, string> = { owing: "Owing", missing: "No invoice found", no_repeat: "Billed, no repeating invoice", confirm: "Client to confirm", unknown: "No client found", billed: "Billed and up to date" };
const cell = (v: unknown) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

/** The billing check as a spreadsheet. */
export async function GET() {
  const { org, role } = await requireOrg();
  if (!canManage(role)) return new NextResponse("Not allowed", { status: 403 });
  const r = await loadBillingCheck(createServiceClient(), org.id);
  const lines = [["Domain", "Server", "cPanel user", "Server email", "Client", "Client confirmed", "Suggested client", "Why", "Repeating invoice", "Repeating amount", "Owing", "Days overdue", "Status", "Check", "Suspended"].join(",")];
  for (const x of r.rows) lines.push([x.domain, x.server, x.username, x.serverEmail, x.customer, x.linked ? "yes" : x.customer ? "will link" : "", x.suggestion && x.group === "confirm" ? x.suggestion.name : "", x.suggestion && x.group === "confirm" ? x.suggestion.reasons.join("; ") : "",
    x.recurring.map((rc) => `${rc.name} (${rc.status})`).join("; "), x.recurring.reduce((a, rc) => a + rc.total, 0) || "", x.owing || "", x.daysOverdue || "", LABEL[x.group], x.billingStatus ?? "", x.suspended ? "yes" : ""].map(cell).join(","));
  for (const o of r.orphanRecurring) lines.push(["", "", "", "", o.customer, "", "", "", `${o.name} (${o.status})`, o.total, "", "", "Repeating, no site", o.reference ?? "", ""].map(cell).join(","));
  return new NextResponse(lines.join("\n"), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="hosting-billing-check.csv"`, "cache-control": "no-store" } });
}
