/**
 * Reconcile (pure): read a bank statement export, find the transfers between your own accounts and pair the two
 * sides (money out of one account, the same amount into another, within a few days). Runs in the browser, so the
 * statement never leaves the computer — only the paired transfers are sent on to Xero.
 *
 * Westpac exports (Bank Account, Date, Narrative, Debit Amount, Credit Amount, Balance, Categories, Serial) and the
 * common "Date, Description, Amount" / "Debit, Credit" shapes are understood. Several accounts can be in one file.
 */

export interface BankLine { key: string; account: string; date: string; narrative: string; amount: number; transfer: boolean }
export interface ParsedStatement { lines: BankLine[]; accounts: { number: string; lines: number; from: string; to: string }[]; format: string }

/** A transfer line between your own accounts (Westpac writes "TFR <name>"; other banks "TRANSFER"). */
export const TRANSFER_RE = /\bTFR\b|\bTRANSFER\b|\bXFER\b/i;

/** CSV with quoted fields (commas and doubled quotes inside quotes). */
export function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x.trim() !== "")) out.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== "")) out.push(row);
  return out;
}

const money = (v: string | undefined) => {
  if (!v) return 0;
  const t = v.replace(/[$,\s]/g, "");
  const neg = /^\(.*\)$/.test(t) || t.endsWith("-");
  const n = Number(t.replace(/[()]/g, "").replace(/-$/, ""));
  return Number.isFinite(n) ? (neg ? -Math.abs(n) : n) : 0;
};

/** dd/mm/yyyy (Australian banks), yyyy-mm-dd, or d/m/yy → yyyy-mm-dd. */
export function bankDate(v: string): string | null {
  const t = v.trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (!m) return null;
  const y = m[3].length === 2 ? `20${m[3]}` : m[3];
  const d = Number(m[1]), mo = Number(m[2]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function parseStatement(text: string, fallbackAccount = "Account"): ParsedStatement {
  const rows = parseCsv(text);
  if (!rows.length) throw new Error("That file is empty.");
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => head.findIndex((h) => names.includes(h));
  const iDate = col("date", "transaction date", "posted date");
  const iNarr = col("narrative", "description", "details", "transaction details", "memo");
  const iDebit = col("debit amount", "debit", "withdrawals", "money out");
  const iCredit = col("credit amount", "credit", "deposits", "money in");
  const iAmount = col("amount");
  const iAcc = col("bank account", "account", "account number");
  if (iDate < 0 || iNarr < 0 || (iAmount < 0 && (iDebit < 0 || iCredit < 0))) {
    throw new Error("This doesn't look like a bank statement export — it needs Date, Narrative (or Description) and Debit/Credit (or Amount) columns. In Westpac Live: Accounts → Export → CSV.");
  }
  const seen = new Map<string, number>();
  const lines: BankLine[] = [];
  for (const r of rows.slice(1)) {
    const date = bankDate(r[iDate] ?? "");
    if (!date) continue;
    const narrative = (r[iNarr] ?? "").trim().replace(/\s+/g, " ");
    const amount = r2(iAmount >= 0 ? money(r[iAmount]) : money(r[iCredit]) - Math.abs(money(r[iDebit])));
    if (!amount) continue;
    const account = (iAcc >= 0 ? (r[iAcc] ?? "").trim() : "") || fallbackAccount;
    const base = `${account}|${date}|${amount.toFixed(2)}|${narrative}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    lines.push({ key: `${base}|${n}`, account, date, narrative, amount, transfer: TRANSFER_RE.test(narrative) });
  }
  if (!lines.length) throw new Error("No transactions found in that file.");
  const by = new Map<string, BankLine[]>();
  for (const l of lines) by.set(l.account, [...(by.get(l.account) ?? []), l]);
  const accounts = [...by.entries()].map(([number, ls]) => ({ number, lines: ls.length, from: ls.reduce((a, l) => (l.date < a ? l.date : a), ls[0].date), to: ls.reduce((a, l) => (l.date > a ? l.date : a), ls[0].date) }));
  return { lines, accounts, format: iAcc >= 0 ? "Multi-account export" : "Single-account export" };
}

const dayNo = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);

export interface TransferPair {
  key: string; out: BankLine; in: BankLine; amount: number; gapDays: number;
  /** another account had a line that could equally be the other side — confirm before sending */
  unsure: boolean;
}
export interface Pairing { pairs: TransferPair[]; unpaired: BankLine[]; transferLines: number }

/**
 * Pair transfer lines: money out of one account and the same amount into a different account, the "in" on the same
 * day or up to `maxDays` after (a day either side allowed). Closest dates win; each line is used once. A pair is
 * "unsure" when the out line had same-amount candidates in more than one other account (or the in line from more
 * than one), so which account it went to needs a person to confirm.
 */
export function pairTransfers(lines: BankLine[], opts: { from?: string | null; to?: string | null; maxDays?: number } = {}): Pairing {
  const maxDays = opts.maxDays ?? 4;
  const inRange = (l: BankLine) => (!opts.from || l.date >= opts.from) && (!opts.to || l.date <= opts.to);
  const T = lines.filter((l) => l.transfer && inRange(l));
  const ins = new Map<string, BankLine[]>();
  for (const l of T) if (l.amount > 0) ins.set(l.amount.toFixed(2), [...(ins.get(l.amount.toFixed(2)) ?? []), l]);
  type E = { gap: number; o: BankLine; x: BankLine };
  const edges: E[] = [];
  for (const o of T) {
    if (o.amount >= 0) continue;
    for (const x of ins.get((-o.amount).toFixed(2)) ?? []) {
      if (x.account === o.account) continue;
      const g = dayNo(x.date) - dayNo(o.date);
      if (g < -1 || g > maxDays) continue;
      edges.push({ gap: Math.abs(g), o, x });
    }
  }
  edges.sort((a, b) => a.gap - b.gap || (a.o.date < b.o.date ? -1 : a.o.date > b.o.date ? 1 : 0));
  const used = new Set<string>();
  const pairs: TransferPair[] = [];
  for (const e of edges) {
    if (used.has(e.o.key) || used.has(e.x.key)) continue;
    used.add(e.o.key); used.add(e.x.key);
    pairs.push({ key: `${e.o.key}>${e.x.key}`, out: e.o, in: e.x, amount: -e.o.amount, gapDays: dayNo(e.x.date) - dayNo(e.o.date), unsure: false });
  }
  // Is the choice real? Lines linked by equally-close candidates form a group. The routes are certain when every
  // "out" in the group is from one account (or every "in" lands in one) and the counts balance — any pairing then
  // gives the same transfers. Otherwise which account the money went to (or came from) needs a person.
  const parent = new Map<string, string>();
  const find = (k: string): string => { const p = parent.get(k) ?? k; if (p === k) return k; const r = find(p); parent.set(k, r); return r; };
  const join = (a: string, b: string) => { const x = find(a), y = find(b); if (x !== y) parent.set(x, y); };
  const best = new Map<string, number>();
  for (const e of edges) { best.set(e.o.key, Math.min(best.get(e.o.key) ?? 99, e.gap)); best.set(e.x.key, Math.min(best.get(e.x.key) ?? 99, e.gap)); }
  for (const e of edges) if (e.gap === best.get(e.o.key) || e.gap === best.get(e.x.key)) join(e.o.key, e.x.key);
  const groups = new Map<string, { outs: BankLine[]; ins: BankLine[] }>();
  const lineByKey = new Map(T.map((l) => [l.key, l]));
  for (const k of best.keys()) {
    const g = groups.get(find(k)) ?? { outs: [], ins: [] };
    const l = lineByKey.get(k)!;
    (l.amount < 0 ? g.outs : g.ins).push(l);
    groups.set(find(k), g);
  }
  for (const p of pairs) {
    const g = groups.get(find(p.out.key));
    if (!g) continue;
    const outAcc = new Set(g.outs.map((l) => l.account)), inAcc = new Set(g.ins.map((l) => l.account));
    const balanced = g.outs.length === g.ins.length;
    p.unsure = !((outAcc.size === 1 || inAcc.size === 1) && (balanced || (outAcc.size === 1 && inAcc.size === 1)));
  }
  pairs.sort((a, b) => (a.out.date < b.out.date ? -1 : a.out.date > b.out.date ? 1 : 0));
  return { pairs, unpaired: T.filter((l) => !used.has(l.key)), transferLines: T.length };
}

/** Bank account numbers compared on digits: Xero may hold "032-730 283424" for the export's "032730283424". */
export function sameAccountNumber(a: string | null | undefined, b: string | null | undefined) {
  const x = (a ?? "").replace(/\D/g, ""), y = (b ?? "").replace(/\D/g, "");
  if (x.length < 6 || y.length < 6) return false;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return x === y || long.endsWith(short);
}

export interface XeroTransferLite { id: string; from: string; to: string; amount: number; date: string }

/**
 * Which pairs are already in Xero: a Xero transfer between the same two accounts, same amount, within `days` of the
 * money leaving. Each Xero transfer is used once, so two identical transfers on one day need two in Xero.
 */
export function alreadyInXero(pairs: { key: string; from: string | null; to: string | null; amount: number; date: string }[], xero: XeroTransferLite[], days = 3): Set<string> {
  const pool = [...xero];
  const hit = new Set<string>();
  for (const p of pairs) {
    if (!p.from || !p.to) continue;
    let best = -1, bestGap = Infinity;
    pool.forEach((t, i) => {
      if (t.from !== p.from || t.to !== p.to || Math.abs(t.amount - p.amount) > 0.005) return;
      const g = Math.abs(dayNo(t.date) - dayNo(p.date));
      if (g <= days && g < bestGap) { best = i; bestGap = g; }
    });
    if (best >= 0) { hit.add(p.key); pool.splice(best, 1); }
  }
  return hit;
}

/** Your own note after the bank's wording, e.g. "TFR Westpac Bus SERVER" → "SERVER". */
export function transferNote(narrative: string) {
  const m = narrative.match(/\bTFR\s+Westpac\s+Bus\b\s*(.*)$/i) ?? narrative.match(/\b(?:TFR|TRANSFER|XFER)\b\s*(.*)$/i);
  return (m?.[1] ?? "").trim().slice(0, 60);
}

/**
 * Saved at organisations.settings.reconcile: which Xero bank account each statement account is, the start date, and
 * how Stripe payouts are coded in Xero — the contact, and an account + GST for each kind of payment (shop orders,
 * classes & bookings, everything else) and for Stripe's fees. All chosen by the business.
 */
export interface Coding { account: string | null; tax: string | null }
export interface StripeCoding { contact: string | null; shop: Coding; bookings: Coding; other: Coding; fees: Coding }
export interface ReconcileSettings { accounts: Record<string, string>; from: string | null; stripe: StripeCoding }
const code = (v: unknown) => (typeof v === "string" && /^[\w.-]{1,20}$/.test(v) ? v : null);
const coding = (v: unknown, acc?: unknown, tax?: unknown): Coding => {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return { account: code(o.account ?? acc), tax: code(o.tax ?? tax) };
};
export function readReconcile(settings: unknown): ReconcileSettings {
  const r = ((settings && typeof settings === "object" ? (settings as Record<string, unknown>).reconcile : null) ?? {}) as Record<string, unknown>;
  const acc: Record<string, string> = {};
  if (r.accounts && typeof r.accounts === "object") {
    for (const [k, v] of Object.entries(r.accounts as Record<string, unknown>)) if (/^[\w -]{1,40}$/.test(k) && typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v)) acc[k] = v;
  }
  const from = typeof r.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.from) ? r.from : null;
  const st = (r.stripe && typeof r.stripe === "object" ? r.stripe : {}) as Record<string, unknown>;
  const contact = typeof st.contact === "string" && st.contact.trim() ? st.contact.trim().slice(0, 100) : null;
  // the first version had one income account (income/incomeTax) and fees (fees/feesTax): carried over as "everything else"
  return {
    accounts: acc, from,
    stripe: { contact, shop: coding(st.shop), bookings: coding(st.bookings), other: coding(st.other, st.income, st.incomeTax), fees: coding(typeof st.fees === "object" ? st.fees : null, typeof st.fees === "string" ? st.fees : null, st.feesTax) },
  };
}
