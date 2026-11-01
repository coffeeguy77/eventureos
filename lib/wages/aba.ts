/**
 * ABA (Cemtex / Direct Entry) bank file — the format Australian banks take for bulk payments. Pure; tested.
 * Fixed 120-character lines, CRLF: one descriptive record (0), a detail record (1) per payment, a file total (7).
 * No balancing debit line (most business banking adds it from the account you upload from).
 */
export interface AbaHeader { bank: string; userName: string; userId: string; description: string; date: string /* YYYY-MM-DD */; bsb: string; account: string; remitter: string }
export interface AbaPayment { bsb: string; account: string; name: string; cents: number; reference: string }

const L = (s: string, n: number) => s.replace(/[^\x20-\x7E]/g, "").slice(0, n).padEnd(n, " ");
const R = (s: string, n: number, pad = " ") => s.slice(-n).padStart(n, pad);
const bsb = (b: string) => { const d = b.replace(/\D/g, ""); if (d.length !== 6) throw new Error(`BSB ${b} isn't 6 digits`); return `${d.slice(0, 3)}-${d.slice(3)}`; };
const acct = (a: string) => { const d = a.replace(/\D/g, ""); if (d.length < 4 || d.length > 9) throw new Error(`Account ${a} isn't 4–9 digits`); return R(d, 9); };

export function abaFile(h: AbaHeader, payments: AbaPayment[]): string {
  if (!payments.length) throw new Error("No payments for the bank file.");
  const [y, m, d] = h.date.split("-");
  const lines: string[] = [];
  lines.push("0" + " ".repeat(17) + "01" + L(h.bank.toUpperCase(), 3) + " ".repeat(7) + L(h.userName, 26) + R(h.userId.replace(/\D/g, ""), 6, "0") + L(h.description, 12) + `${d}${m}${y.slice(2)}` + " ".repeat(40));
  let total = 0;
  for (const p of payments) {
    if (!Number.isInteger(p.cents) || p.cents <= 0) throw new Error(`${p.name}: the amount must be more than $0`);
    total += p.cents;
    lines.push("1" + bsb(p.bsb) + acct(p.account) + " " + "53" + R(String(p.cents), 10, "0") + L(p.name, 32) + L(p.reference, 18) + bsb(h.bsb) + acct(h.account) + L(h.remitter, 16) + "00000000");
  }
  lines.push("7" + "999-999" + " ".repeat(12) + R(String(total), 10, "0") + R(String(total), 10, "0") + "0".repeat(10) + " ".repeat(24) + R(String(payments.length), 6, "0") + " ".repeat(40));
  for (const l of lines) if (l.length !== 120) throw new Error("Bank file line isn't 120 characters");
  return lines.join("\r\n") + "\r\n";
}
