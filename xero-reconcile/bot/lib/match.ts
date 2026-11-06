import { createHash } from "node:crypto";

/** Money in is positive. Money out is negative. Amounts are integer cents. */
export type StatementLine = { date: string; amountCents: number; description: string };

export type OpenDoc = {
  id: string;
  number: string;
  kind: "invoice" | "bill";
  contactName: string;
  date: string | null;
  dueDate: string | null;
  amountDueCents: number;
};

export type Candidate = {
  proposalId: string;
  action: "pay_invoice" | "pay_bill";
  targetId: string;
  label: string;
  score: number;
  reasons: string[];
  partial: boolean;
};

const STOP = new Set([
  "PTY", "LTD", "LIMITED", "THE", "AND", "FROM", "PAYMENT", "TRANSFER", "DEPOSIT",
  "RECEIPT", "INVOICE", "INV", "BILL", "REF", "EFT", "OSKO", "PAY", "TO", "FOR", "BANK",
]);

export function normalizeText(value: string): string {
  return value.replace(/[\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim();
}

export function dollarsToCents(amount: number): number | null {
  if (!Number.isFinite(amount)) return null;
  const cents = Math.round(amount * 100);
  if (Math.abs(amount * 100 - cents) > 0.011) return null;
  return cents;
}

export function isoDate(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10) === value ? value : null;
}

export function proposalId(input: {
  bankAccountId: string;
  date: string;
  amountCents: number;
  description: string;
  action: string;
  targetId: string;
}): string {
  const payload = [
    input.action,
    input.bankAccountId,
    input.date,
    String(input.amountCents),
    normalizeText(input.description).toUpperCase(),
    input.targetId,
  ].join("|");
  return createHash("sha256").update(payload).digest("hex").slice(0, 32);
}

function tokens(value: string): string[] {
  return normalizeText(value).toUpperCase().split(/[^A-Z0-9]+/).filter((word) => word.length >= 4 && !STOP.has(word));
}

function contactHits(description: string, contactName: string): boolean {
  const words = tokens(contactName);
  if (!words.length) return false;
  const haystack = normalizeText(description).toUpperCase();
  const hits = words.filter((word) => haystack.includes(word));
  return hits.length >= 1;
}

function daysApart(a: string, b: string): number | null {
  const left = isoDate(a);
  const right = isoDate(b);
  if (!left || !right) return null;
  const ms = Date.parse(`${left}T00:00:00Z`) - Date.parse(`${right}T00:00:00Z`);
  return Math.abs(Math.round(ms / 86_400_000));
}

function labelFor(doc: OpenDoc): string {
  const amount = (doc.amountDueCents / 100).toFixed(2);
  return `${doc.number} · ${doc.contactName} · ${amount} due`;
}

/** Rank open invoices and bills against one statement line. No Xero calls. */
export function matchLine(line: StatementLine, docs: OpenDoc[], bankAccountId: string): { recommended: Candidate | null; candidates: Candidate[] } {
  const description = normalizeText(line.description).toUpperCase();
  const moneyIn = line.amountCents > 0;
  const candidates: Candidate[] = [];
  for (const doc of docs) {
    if (moneyIn && doc.kind !== "invoice") continue;
    if (!moneyIn && doc.kind !== "bill") continue;
    const payCents = Math.abs(line.amountCents);
    if (payCents <= 0 || payCents > doc.amountDueCents) continue;
    const partial = payCents !== doc.amountDueCents;
    const reasons: string[] = [];
    let score = 0;
    if (!partial) {
      score += 55;
      reasons.push("Amount matches the amount still owing");
    } else {
      score += 20;
      reasons.push("Amount is less than the amount still owing");
    }
    if (doc.number.length >= 4 && description.includes(doc.number.toUpperCase())) {
      score += 30;
      reasons.push("Document number is in the description");
    }
    if (contactHits(line.description, doc.contactName)) {
      score += 25;
      reasons.push("Contact name is in the description");
    }
    const dueGap = doc.dueDate ? daysApart(line.date, doc.dueDate) : null;
    const docGap = doc.date ? daysApart(line.date, doc.date) : null;
    const gap = [dueGap, docGap].filter((value): value is number => value !== null).sort((a, b) => a - b)[0];
    if (gap !== undefined && gap <= 21) {
      score += 15;
      reasons.push("Date is within 21 days of the document");
    }
    if (score < 70) continue;
    const action = doc.kind === "invoice" ? "pay_invoice" : "pay_bill";
    candidates.push({
      proposalId: proposalId({
        bankAccountId,
        date: line.date,
        amountCents: line.amountCents,
        description: line.description,
        action,
        targetId: doc.id,
      }),
      action,
      targetId: doc.id,
      label: labelFor(doc),
      score,
      reasons,
      partial,
    });
  }
  candidates.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  const top = candidates[0] ?? null;
  const second = candidates[1];
  const recommended = top && (!second || top.score - second.score > 15) ? top : null;
  return { recommended, candidates };
}
