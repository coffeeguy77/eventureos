import "server-only";
import { xeroGet } from "@/lib/integrations/xero";
import type { SyncContext } from "@/lib/integrations/runtime";

/**
 * Xero Items → EventureOS price list.
 *  GET /Items  https://developer.xero.com/documentation/api/accounting/items
 *  Item: { ItemID, Code, Name, Description, IsSold, SalesDetails: { UnitPrice, AccountCode, TaxType } }
 * Matching is exact: by item code, then by exact name. Prices in EventureOS are never overwritten;
 * only the Xero item code and account are brought across. Sold items on the given accounts that aren't
 * in EventureOS yet are added.
 */
interface XeroItem {
  ItemID: string; Code: string; Name?: string; Description?: string; IsSold?: boolean;
  SalesDetails?: { UnitPrice?: number; AccountCode?: string; TaxType?: string };
}

export async function importXeroItems(ctx: SyncContext, accounts: string[]) {
  const r = await xeroGet<{ Items?: XeroItem[] }>(ctx, "/Items");
  const items = (r.Items ?? []).filter((i) => i.IsSold !== false && i.Code);
  const { data: svc, error } = await ctx.db.from("services").select("id, code, name, xero_account_code").eq("organisation_id", ctx.org.id);
  if (error) throw new Error(error.message);
  const services = svc ?? [];
  const byCode = new Map(services.filter((s) => s.code).map((s) => [String(s.code).toLowerCase(), s]));
  const byName = new Map(services.map((s) => [String(s.name).trim().toLowerCase(), s]));
  const updated: string[] = [], added: string[] = [];
  const { data: last } = await ctx.db.from("services").select("position").eq("organisation_id", ctx.org.id).order("position", { ascending: false }).limit(1).maybeSingle();
  let pos = (last?.position ?? 0) + 10;
  for (const it of items) {
    const acc = it.SalesDetails?.AccountCode ?? null;
    const match = byCode.get(it.Code.toLowerCase()) ?? (it.Name ? byName.get(it.Name.trim().toLowerCase()) : undefined);
    if (match) {
      const patch: Record<string, unknown> = {};
      if (match.code !== it.Code && !byCode.has(it.Code.toLowerCase())) patch.code = it.Code;
      if (acc && match.xero_account_code !== acc) patch.xero_account_code = acc;
      if (Object.keys(patch).length) {
        const { error: uErr } = await ctx.db.from("services").update(patch).eq("id", match.id);
        if (uErr) throw new Error(`${it.Code}: ${uErr.message}`);
        updated.push(`${match.name} → ${[patch.code && `code ${patch.code}`, patch.xero_account_code && `account ${patch.xero_account_code}`].filter(Boolean).join(", ")}`);
      }
      continue;
    }
    if (!acc || !accounts.includes(acc)) continue;
    const exempt = /EXEMPT|FRE/i.test(it.SalesDetails?.TaxType ?? "");
    const { error: iErr } = await ctx.db.from("services").insert({
      organisation_id: ctx.org.id, code: it.Code, name: (it.Name || it.Code).slice(0, 200), description: it.Description?.slice(0, 4000) ?? null,
      category: "From Xero", unit: "each", unit_price: Math.max(0, it.SalesDetails?.UnitPrice ?? 0), tax_rate: exempt ? 0 : 10,
      xero_account_code: acc, position: pos,
    });
    if (iErr) throw new Error(`${it.Code}: ${iErr.message}`);
    pos += 10;
    added.push(`${it.Name || it.Code} (${it.Code})`);
  }
  return { updated, added, seen: items.length };
}
