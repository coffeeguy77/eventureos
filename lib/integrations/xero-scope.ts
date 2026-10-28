/**
 * Which Xero invoices, quotes and repeating invoices belong to this business — for two businesses that share one
 * Xero file (same ABN, one trading as the other). Set on the Xero connection's settings:
 *
 *   scope: { mode: "include", accounts: ["666"], items: ["RepairShopr", …] }   → only lines on these accounts/items
 *   scope: { mode: "exclude", accounts: ["666"], items: [...] }               → everything except those
 *
 * Accounts match by prefix ("666" covers 6661–6664). A document is "web" when ANY of its lines matches.
 * No scope = everything (the normal case).
 */
export interface XeroScope { mode: "include" | "exclude"; accounts: string[]; items: string[] }

export function readScope(settings: unknown): XeroScope | null {
  const s = (settings && typeof settings === "object" ? (settings as Record<string, unknown>).scope : null) as Partial<XeroScope> | null;
  if (!s || (s.mode !== "include" && s.mode !== "exclude")) return null;
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim()) : []);
  const accounts = list(s.accounts), items = list(s.items);
  if (!accounts.length && !items.length) return null;
  return { mode: s.mode, accounts, items };
}

type AnyLine = { AccountCode?: string | null; ItemCode?: string | null; account_code?: string | null; item_code?: string | null };

/** Do any of these lines fall in the scope's accounts or items? */
export function linesMatch(lines: AnyLine[] | null | undefined, scope: XeroScope): boolean {
  const items = new Set(scope.items.map((x) => x.toLowerCase()));
  return (lines ?? []).some((l) => {
    const acc = String(l.AccountCode ?? l.account_code ?? "").trim();
    const item = String(l.ItemCode ?? l.item_code ?? "").trim().toLowerCase();
    return (!!acc && scope.accounts.some((p) => acc.startsWith(p))) || (!!item && items.has(item));
  });
}

/** Should this business keep a Xero document with these lines? */
export function inScope(lines: AnyLine[] | null | undefined, scope: XeroScope | null): boolean {
  if (!scope) return true;
  const m = linesMatch(lines, scope);
  return scope.mode === "include" ? m : !m;
}

/** Plain-English description for the settings screen. */
export function describeScope(scope: XeroScope | null): string | null {
  if (!scope) return null;
  const what = [scope.accounts.length ? `accounts ${scope.accounts.map((a) => `${a}…`).join(", ")}` : null, scope.items.length ? `${scope.items.length} item code${scope.items.length === 1 ? "" : "s"}` : null].filter(Boolean).join(" and ");
  return scope.mode === "include" ? `Only invoices and quotes on ${what}` : `Everything except invoices and quotes on ${what}`;
}
