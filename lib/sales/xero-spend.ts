import "server-only";
import type { SyncContext } from "@/lib/integrations/runtime";
import { xeroDate, xeroGet } from "@/lib/integrations/xero";

/**
 * What each supplier was paid per month, ex GST, from Xero: "spend money" bank transactions plus bills (ACCPAY).
 * Saved to sale_xero_spend so expense lines can use a supplier's actual monthly spend (or a share of it).
 */
interface BankTxn { Type: string; Status: string; Date?: string; DateString?: string; SubTotal?: number; Contact?: { ContactID?: string; Name?: string } }
interface Bill { Type: string; Status: string; Date?: string; DateString?: string; SubTotal?: number; Contact?: { ContactID?: string; Name?: string } }

export async function syncXeroSpend(ctx: SyncContext, months = 13): Promise<{ suppliers: number; months: number }> {
  const from = new Date(); from.setUTCDate(1); from.setUTCMonth(from.getUTCMonth() - (months - 1));
  const y = from.getUTCFullYear(), m = from.getUTCMonth() + 1;
  const since = `DateTime(${y},${m},1)`;
  const acc = new Map<string, { name: string; months: Map<string, number> }>();
  const add = (id: string | undefined, name: string | undefined, date: string | null, amt: number) => {
    if (!id || !date || !amt) return;
    let r = acc.get(id);
    if (!r) { r = { name: (name || "Supplier").slice(0, 200), months: new Map() }; acc.set(id, r); }
    const mk = `${date.slice(0, 7)}-01`;
    r.months.set(mk, (r.months.get(mk) ?? 0) + amt);
  };
  for (let page = 1; page <= 100; page++) {
    const d = await xeroGet<{ BankTransactions?: BankTxn[] }>(ctx, "/BankTransactions", { where: `Type=="SPEND" AND Date>=${since}`, page: String(page) });
    const list = d.BankTransactions ?? [];
    for (const t of list) if (t.Status !== "DELETED" && t.Status !== "VOIDED") add(t.Contact?.ContactID, t.Contact?.Name, xeroDate(t.Date, t.DateString), Number(t.SubTotal ?? 0));
    if (list.length < 100) break;
  }
  for (let page = 1; page <= 100; page++) {
    const d = await xeroGet<{ Invoices?: Bill[] }>(ctx, "/Invoices", { where: `Type=="ACCPAY" AND Date>=${since}`, Statuses: "AUTHORISED,PAID", page: String(page), summaryOnly: "true" });
    const list = d.Invoices ?? [];
    for (const b of list) add(b.Contact?.ContactID, b.Contact?.Name, xeroDate(b.Date, b.DateString), Number(b.SubTotal ?? 0));
    if (list.length < 100) break;
  }
  const rows = [...acc.entries()].flatMap(([id, r]) => [...r.months.entries()].map(([month, amount]) => ({
    organisation_id: ctx.org.id, contact_id: id, contact_name: r.name, month, amount: Math.round(amount * 100) / 100,
  })));
  const fromDay = `${y}-${String(m).padStart(2, "0")}-01`;
  await ctx.db.from("sale_xero_spend").delete().eq("organisation_id", ctx.org.id).gte("month", fromDay);
  for (let i = 0; i < rows.length; i += 1000) {
    const { error } = await ctx.db.from("sale_xero_spend").insert(rows.slice(i, i + 1000));
    if (error) throw new Error(`Couldn't save supplier spend: ${error.message}`);
  }
  return { suppliers: acc.size, months };
}
