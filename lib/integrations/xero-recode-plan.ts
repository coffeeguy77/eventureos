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

/**
 * A special rule, checked before the item → account choices: lines for these items go to `account`
 * when their description contains `contains` (e.g. "caravan"), or they're on one of `invoices`
 * (e.g. a job the calendar shows used the caravan but the invoice says cart).
 */
export interface RecodeRule { account: string; items: string[]; contains?: string; invoices?: string[]; note?: string }
export interface RecodeOpts { rules?: RecodeRule[]; invoice?: string | null }

export function cleanRecodeRules(raw: unknown): RecodeRule[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 50).flatMap((r): RecodeRule[] => {
    const x = (r ?? {}) as Record<string, unknown>;
    const account = String(x.account ?? "").trim();
    const items = (Array.isArray(x.items) ? x.items : []).map((i) => String(i).trim().slice(0, 30)).filter(Boolean).slice(0, 20);
    const contains = String(x.contains ?? "").trim().slice(0, 60);
    const invoices = (Array.isArray(x.invoices) ? x.invoices : []).map((i) => String(i).trim().slice(0, 30)).filter(Boolean).slice(0, 500);
    if (!/^[A-Za-z0-9.-]{1,10}$/.test(account) || !items.length || (!contains && !invoices.length)) return [];
    const note = String(x.note ?? "").trim().slice(0, 200);
    return [{ account, items, ...(contains ? { contains } : {}), ...(invoices.length ? { invoices } : {}), ...(note ? { note } : {}) }];
  });
}

/** The account a line belongs on by the rules and item choices (whether or not it's there already). */
export function intendedAccount(line: { ItemCode?: string | null; Description?: string | null }, map: RecodeMap, opts: RecodeOpts = {}): string | null {
  const item = line.ItemCode?.trim();
  if (!item) return null;
  const desc = (line.Description ?? "").toLowerCase();
  for (const r of opts.rules ?? []) {
    if (!r.items.includes(item)) continue;
    if ((r.contains && desc.includes(r.contains.toLowerCase())) || (opts.invoice && r.invoices?.includes(opts.invoice))) return r.account;
  }
  return map[item] ?? null;
}

/** The account a line should move to, or null if it isn't covered or it's already there. */
export function targetAccount(line: { ItemCode?: string | null; AccountCode?: string | null; Description?: string | null }, map: RecodeMap, opts: RecodeOpts = {}): string | null {
  if (!line.AccountCode) return null; // lines without an account (headings, $0 notes) are left as they are
  const to = intendedAccount(line, map, opts);
  return to && to !== line.AccountCode ? to : null;
}

/** Lines to send back to Xero (all of them, unchanged except AccountCode), or null when nothing changes. */
export function recodeLines(lines: XLine[], map: RecodeMap, opts: RecodeOpts = {}): { lines: XLine[]; changes: { item: string; from: string | null; to: string }[] } | null {
  const changes: { item: string; from: string | null; to: string }[] = [];
  const out = lines.map((l) => {
    const to = targetAccount(l, map, opts);
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
export function sameExceptAccounts(before: { SubTotal?: number; TotalTax?: number; Total?: number; LineItems?: XLine[] }, after: typeof before, map: RecodeMap, opts: RecodeOpts = {}): string | null {
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
    const want = targetAccount(x, map, opts) ?? x.AccountCode ?? "";
    if ((y.AccountCode ?? "") !== want) return `line "${(x.Description ?? "").slice(0, 40)}" is on ${y.AccountCode}, expected ${want}`;
  }
  return null;
}
