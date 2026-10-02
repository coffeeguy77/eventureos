/**
 * Recode by item: move each Xero invoice line to the revenue account chosen for its item code.
 * Only the line's AccountCode changes — description, quantity, price, discount, tax type and tracking
 * are sent back exactly as Xero returned them (Xero needs each LineItemID to update a paid invoice).
 * Pure — shared by the server runner and tests.
 */
export type RecodeMap = Record<string, string>; // item code → account code

export interface XLine {
  LineItemID?: string; Description?: string; Quantity?: number; UnitAmount?: number; ItemCode?: string; AccountCode?: string;
  TaxType?: string; TaxAmount?: number; LineAmount?: number; DiscountRate?: number; DiscountAmount?: number;
  Tracking?: unknown[];
}

/** Clean a mapping from a form or settings: item codes and account codes as Xero writes them. */
export function cleanRecodeMap(raw: unknown): RecodeMap {
  const out: RecodeMap = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const item = String(k).trim().slice(0, 30), acct = String(v ?? "").trim();
    if (item && /^[A-Za-z0-9.-]{1,10}$/.test(acct)) out[item] = acct;
  }
  return out;
}

/** The account a line should be on, or null if its item isn't mapped or it's already there. */
export function targetAccount(line: { ItemCode?: string | null; AccountCode?: string | null }, map: RecodeMap): string | null {
  const item = line.ItemCode?.trim();
  if (!item || !line.AccountCode) return null; // lines without an account (headings, $0 notes) are left as they are
  const to = map[item];
  return to && to !== (line.AccountCode ?? "") ? to : null;
}

/** Lines to send back to Xero (all of them, unchanged except AccountCode), or null when nothing changes. */
export function recodeLines(lines: XLine[], map: RecodeMap): { lines: XLine[]; changes: { item: string; from: string | null; to: string }[] } | null {
  const changes: { item: string; from: string | null; to: string }[] = [];
  const out = lines.map((l) => {
    const to = targetAccount(l, map);
    if (!to) return keep(l);
    changes.push({ item: l.ItemCode!.trim(), from: l.AccountCode ?? null, to });
    return { ...keep(l), AccountCode: to };
  });
  if (!changes.length) return null;
  if (out.some((l) => !l.LineItemID)) throw new Error("Xero didn't return line IDs for this invoice, so it can't be updated safely.");
  return { lines: out, changes };
}

// Only the fields Xero accepts on update, exactly as returned (computed TaxAmount/LineAmount included so nothing is recalculated)
function keep(l: XLine): XLine {
  const o: XLine = {};
  for (const k of ["LineItemID", "Description", "Quantity", "UnitAmount", "ItemCode", "AccountCode", "TaxType", "TaxAmount", "LineAmount", "DiscountRate", "DiscountAmount", "Tracking"] as const) {
    if (l[k] !== undefined && l[k] !== null) (o as Record<string, unknown>)[k] = l[k];
  }
  return o;
}

/** After the update: everything except the accounts must be identical, or we stop. */
export function sameExceptAccounts(before: { SubTotal?: number; TotalTax?: number; Total?: number; LineItems?: XLine[] }, after: typeof before, map: RecodeMap): string | null {
  const money = (n?: number) => Math.round((n ?? 0) * 100);
  if (money(before.Total) !== money(after.Total) || money(before.TotalTax) !== money(after.TotalTax) || money(before.SubTotal) !== money(after.SubTotal)) {
    return `totals changed (${before.Total} → ${after.Total})`;
  }
  const a = before.LineItems ?? [], b = after.LineItems ?? [];
  if (a.length !== b.length) return `line count changed (${a.length} → ${b.length})`;
  for (const x of a) {
    const y = b.find((l) => l.LineItemID === x.LineItemID);
    if (!y) return "a line went missing";
    if ((x.Description ?? "") !== (y.Description ?? "") || money(x.LineAmount) !== money(y.LineAmount) || money(x.TaxAmount) !== money(y.TaxAmount)
      || (x.TaxType ?? "") !== (y.TaxType ?? "") || (x.ItemCode ?? "") !== (y.ItemCode ?? "")) return `line "${(x.Description ?? "").slice(0, 40)}" changed`;
    const want = targetAccount(x, map) ?? x.AccountCode ?? "";
    if ((y.AccountCode ?? "") !== want) return `line "${(x.Description ?? "").slice(0, 40)}" is on ${y.AccountCode}, expected ${want}`;
  }
  return null;
}
