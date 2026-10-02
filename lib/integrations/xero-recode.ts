import "server-only";
import { ApiError, apiJSON, type SyncContext } from "@/lib/integrations/runtime";
import { XERO_API, compactLines, tenantId } from "@/lib/integrations/xero";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recodeLines, sameExceptAccounts, targetAccount, type RecodeMap, type RecodeRule, type XLine } from "@/lib/integrations/xero-recode-plan";

/**
 * Recode by item — the Xero side.
 *   GET  /Invoices/{id}   the invoice with LineItemIDs
 *   POST /Invoices/{id}   { Invoices: [{ InvoiceID, LineItems }] } — every line sent back, only AccountCode changed
 *   GET  /Accounts        revenue accounts to choose from (accounting.settings.read)
 *   GET  /Items           each item's default sales account (shown as a hint)
 * https://developer.xero.com/documentation/api/accounting/invoices
 */
interface XInvoice { InvoiceID: string; InvoiceNumber?: string; Type: string; Status: string; SubTotal?: number; TotalTax?: number; Total?: number; LineItems?: XLine[] }

const xget = <T,>(ctx: SyncContext, path: string, params: Record<string, string> = {}) => {
  const u = new URL(XERO_API + path);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return apiJSON<T>(ctx, u.toString(), { headers: { "xero-tenant-id": tenantId(ctx) } }, `Xero GET ${path}`);
};

export async function revenueAccounts(ctx: SyncContext) {
  const r = await xget<{ Accounts?: { Code?: string; Name: string; Class?: string; Status?: string }[] }>(ctx, "/Accounts", { where: 'Class=="REVENUE"' });
  return (r.Accounts ?? []).filter((a) => a.Code && a.Status !== "ARCHIVED").map((a) => ({ code: a.Code!, name: a.Name }))
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
}

export async function itemDefaults(ctx: SyncContext) {
  const r = await xget<{ Items?: { Code: string; Name?: string; SalesDetails?: { AccountCode?: string } }[] }>(ctx, "/Items");
  return Object.fromEntries((r.Items ?? []).map((i) => [i.Code, { name: i.Name ?? i.Code, account: i.SalesDetails?.AccountCode ?? null }]));
}

/** Xero's validation message, if the error carries one ("Invoice is before the lock date", …). */
export function xeroReason(e: unknown): string {
  if (e instanceof ApiError) {
    try {
      const j = JSON.parse(e.body) as { Message?: string; Elements?: { ValidationErrors?: { Message?: string }[] }[] };
      const msgs = (j.Elements ?? []).flatMap((x) => x.ValidationErrors ?? []).map((v) => v.Message).filter(Boolean);
      if (msgs.length) return msgs.join("; ");
      if (j.Message) return j.Message;
    } catch { /* not JSON */ }
    return e.message;
  }
  return e instanceof Error ? e.message : String(e);
}

export type RecodeOutcome =
  | { kind: "updated"; number: string; changes: { item: string; from: string | null; to: string }[]; lines: ReturnType<typeof compactLines> }
  | { kind: "nothing"; number: string; lines: ReturnType<typeof compactLines> }
  | { kind: "skipped"; number: string; reason: string }
  | { kind: "mismatch"; number: string; reason: string };

/** Recode one invoice. Never changes anything but line accounts; checks Xero's copy afterwards. */
export async function recodeInvoice(ctx: SyncContext, xeroInvoiceId: string, map: RecodeMap, rules: RecodeRule[] = []): Promise<RecodeOutcome> {
  const got = await xget<{ Invoices?: XInvoice[] }>(ctx, `/Invoices/${encodeURIComponent(xeroInvoiceId)}`);
  const inv = got.Invoices?.[0];
  if (!inv) return { kind: "skipped", number: xeroInvoiceId, reason: "Not found in Xero" };
  const number = inv.InvoiceNumber ?? xeroInvoiceId;
  if (inv.Type !== "ACCREC") return { kind: "skipped", number, reason: "Not a sales invoice" };
  if (inv.Status === "VOIDED" || inv.Status === "DELETED") return { kind: "skipped", number, reason: `Invoice is ${inv.Status.toLowerCase()}` };

  const opts = { rules, invoice: inv.InvoiceNumber ?? null };
  const plan = recodeLines(inv.LineItems ?? [], map, opts);
  if (!plan) return { kind: "nothing", number, lines: compactLines(inv.LineItems) };

  let after: XInvoice | undefined;
  try {
    const r = await apiJSON<{ Invoices?: XInvoice[] }>(ctx, `${XERO_API}/Invoices/${encodeURIComponent(inv.InvoiceID)}`, {
      method: "POST", headers: { "xero-tenant-id": tenantId(ctx), "content-type": "application/json" },
      body: JSON.stringify({ Invoices: [{ InvoiceID: inv.InvoiceID, LineItems: plan.lines }] }),
    }, "Xero update invoice");
    after = r.Invoices?.[0];
  } catch (e) {
    if (e instanceof ApiError && e.status === 400) return { kind: "skipped", number, reason: xeroReason(e) };
    throw e;
  }
  // Check Xero's saved copy (returned by the update) against the original
  const check = after;
  if (!check) return { kind: "mismatch", number, reason: "Xero didn't return the invoice after the update" };
  const diff = sameExceptAccounts(inv, check, map, opts);
  if (diff) return { kind: "mismatch", number, reason: diff };
  return { kind: "updated", number, changes: plan.changes, lines: compactLines(check.LineItems as never) };
}

type LocalLine = { item_code: string | null; account_code: string | null; line_amount: number | null; description?: string | null };
type LocalInvoice = { id: string; number: string; status: string; issue_date: string | null; xero_invoice_id: string; line_items: LocalLine[] | null };

/** Every synced Xero invoice (not voided) for an organisation, newest first — read in pages. */
export async function syncedInvoices(db: SupabaseClient, orgId: string): Promise<LocalInvoice[]> {
  const rows: LocalInvoice[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("invoices").select("id, number, status, issue_date, xero_invoice_id, line_items")
      .eq("organisation_id", orgId).not("xero_invoice_id", "is", null).neq("status", "void")
      .order("issue_date", { ascending: false }).order("id").range(from, from + 999);
    if (error) throw new Error(`Couldn't read invoices: ${error.message}`);
    rows.push(...((data ?? []) as LocalInvoice[]));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

/** Invoices (from EventureOS's copy of Xero) with at least one line not yet on the account it belongs on. */
export async function recodeCandidates(db: SupabaseClient, orgId: string, map: RecodeMap, rules: RecodeRule[] = []) {
  if (!Object.keys(map).length && !rules.length) return [] as (LocalInvoice & { lines: { item: string; from: string | null; to: string; amount: number }[] })[];
  const rows = await syncedInvoices(db, orgId);
  return rows.map((r) => ({
    ...r,
    lines: (r.line_items ?? []).flatMap((l) => {
      const to = targetAccount({ ItemCode: l.item_code, AccountCode: l.account_code, Description: l.description }, map, { rules, invoice: r.number });
      return to ? [{ item: l.item_code!, from: l.account_code, to, amount: Number(l.line_amount ?? 0) }] : [];
    }),
  })).filter((r) => r.lines.length);
}
