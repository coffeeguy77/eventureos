/**
 * Phone numbers to call a customer on (pure): every number we have — the client record, their contacts, and each
 * number in Xero (mobile, office, direct line) — once each, and which one was tried last, so the accounts person can
 * try a different number when calls are being screened.
 */
import type { XeroPhone } from "@/lib/integrations/xero-format";
import { fromXeroParts } from "@/lib/phone-format";

export interface PhoneOption { number: string; label: string; source: "client" | "contact" | "xero" }

export const digits = (s: string) => { const d = s.replace(/[^\d]/g, ""); return /^61\d{9}$/.test(d) ? `0${d.slice(2)}` : d; };

const XERO_LABEL: Record<string, string> = { MOBILE: "Mobile", DEFAULT: "Office", DDI: "Direct line", OFFICE: "Office", FAX: "Fax" };
export function xeroNumbers(phones: XeroPhone[] | undefined): PhoneOption[] {
  return (phones ?? []).filter((p) => p.PhoneNumber?.trim() && p.PhoneType !== "FAX").map((p) => ({
    number: fromXeroParts(p) ?? (p.PhoneNumber ?? "").trim(),
    label: `${XERO_LABEL[p.PhoneType ?? ""] ?? "Phone"} (Xero)`, source: "xero" as const,
  }));
}

/** One entry per number (the first label wins), numbers too short to dial left out. */
export function mergePhones(...lists: PhoneOption[][]): PhoneOption[] {
  const seen = new Set<string>();
  const out: PhoneOption[] = [];
  for (const p of lists.flat()) {
    const d = digits(p.number);
    if (d.length < 6 || seen.has(d)) continue;
    seen.add(d);
    out.push(p);
  }
  return out;
}

/** Call attempt buttons. Each records what was tried, on which number. */
export const ATTEMPT_CODES = ["CW Out", "CW1", "CW2", "CW3", "PC OUT", "PC1", "PC2", "FD OUT", "BC"];

/** "CW1 · 0412 345 678" — how an attempt is written into the account's history (so it can be read back). */
export const attemptText = (code: string, number: string | null, extra?: string | null) =>
  [`${code}${number ? ` · ${number}` : ""}`, extra?.trim() || null].filter(Boolean).join("\n");

/** The last attempts written by attemptText (newest first in, newest first out). */
export function lastAttempts(notes: { body: string | null; kind: string; created_at: string }[], codes = ATTEMPT_CODES) {
  const out: { code: string; number: string | null; at: string }[] = [];
  for (const n of notes) {
    if ((n.kind !== "call" && n.kind !== "sms") || !n.body) continue;
    const m = /^([^\n·]+?)(?: · ([+\d][\d\s()+-]{5,}))?(?:\n|$)/.exec(n.body);
    if (!m || ![...codes, "SMS"].includes(m[1].trim())) continue;
    out.push({ code: m[1].trim(), number: m[2]?.trim() ?? null, at: n.created_at });
  }
  return out;
}

/** The number to try next: one that wasn't used on the last attempt, if there is one. */
export function nextNumber(options: PhoneOption[], lastNumber: string | null): string | null {
  if (!options.length) return null;
  if (!lastNumber) return options[0].number;
  return options.find((o) => digits(o.number) !== digits(lastNumber))?.number ?? options[0].number;
}

/** Numbers the team removed for a customer (settings.collections.hidden_numbers[customerId] = digits). */
export function hiddenNumbers(settings: unknown, customerId: string): string[] {
  const c = (settings && typeof settings === "object" ? (settings as Record<string, unknown>).collections : null) as Record<string, unknown> | null;
  const h = (c?.hidden_numbers && typeof c.hidden_numbers === "object" ? c.hidden_numbers : {}) as Record<string, unknown>;
  const list = h[customerId];
  return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string" && /^\d{6,15}$/.test(x)) : [];
}
