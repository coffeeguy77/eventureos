import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TRANSFER_RE, type BankLine, type ParsedStatement } from "@/lib/reconcile/core";

/**
 * Bank feeds through Redbark (redbark.com, API v2): the business connects its banks inside Redbark (bank consent has to
 * happen on Redbark's own page), pastes a Redbark API key into Settings → Integrations, and EventureOS reads the
 * settled transactions to reconcile. Transactions are read on demand and never stored — only what's sent to Xero is.
 *
 * Docs: https://redbark.com/docs/api-reference/v2/banking.md — amounts are signed integer cents (money out negative),
 * lists are newest first with `next_page_url`, pending transactions are left out unless asked for.
 */
export const REDBARK_PROVIDER = "redbark";
const BASE = "https://api.redbark.com";
const VERSION = "2026-10-01.wattle";

export interface FeedAccount { id: string; name: string; last4: string | null; institution: string | null; status: string | null; connection: string | null }
export interface FeedSettings {
  /** send what matches to Xero by itself every morning */
  auto: boolean;
  accounts: FeedAccount[];
  last_run: FeedRun | null;
}
export interface FeedRun {
  at: string; ok: boolean; error: string | null; lines: number;
  sent: { transfers: number; payments: number; payouts: number; ordermentum: number };
  /** waiting on a person: transfers that could be either account, deposits without a sure invoice, etc. */
  check: { transfers: number; deposits: number; payouts: number; ordermentum: number };
  problems: string[];
  /** what was sent this run, for the Reconcile page */
  items: { kind: "transfer" | "payment" | "payout" | "ordermentum"; date: string; amount: number; text: string }[];
}

export function readFeedSettings(v: unknown): FeedSettings {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const accounts = Array.isArray(o.accounts) ? (o.accounts as FeedAccount[]).filter((a) => a && typeof a.id === "string") : [];
  return { auto: o.auto !== false, accounts, last_run: (o.last_run && typeof o.last_run === "object" ? o.last_run : null) as FeedRun | null };
}

export class RedbarkError extends Error { constructor(message: string, public status: number) { super(message); } }

async function call<T>(key: string, path: string): Promise<T> {
  const url = path.startsWith("http") ? path : `${BASE}${path.startsWith("/v2") ? "" : "/v2"}${path}`;
  if (!url.startsWith(`${BASE}/`)) throw new RedbarkError("Redbark sent an unexpected link.", 0);
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${key}`, "Redbark-Version": VERSION, Accept: "application/json" },
      cache: "no-store", signal: AbortSignal.timeout(25000),
    });
    if (res.status === 429 && attempt < 2) {
      const wait = Math.min(20, Number(res.headers.get("retry-after")) || 5);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    const body = await res.json().catch(() => null) as { error?: { message?: string; code?: string } } & Record<string, unknown> | null;
    if (!res.ok) {
      const msg = body?.error?.message ?? (body as { message?: string } | null)?.message ?? `Redbark said ${res.status}`;
      throw new RedbarkError(res.status === 401 ? "Redbark didn't accept the API key — create a new one in Redbark → Settings → API & MCP and paste it again."
        : res.status === 403 ? `Redbark refused: ${msg} (API access needs Redbark's Developer or Professional plan).` : String(msg).slice(0, 240), res.status);
    }
    return body as T;
  }
}

async function all<T>(key: string, first: string, max = 60): Promise<T[]> {
  const out: T[] = [];
  let next: string | null = first;
  for (let i = 0; next && i < max; i++) {
    const page: { data?: T[]; next_page_url?: string | null } = await call(key, next);
    out.push(...(page.data ?? []));
    next = page.next_page_url ?? null;
  }
  return out;
}

/** Check a key before saving it. */
export async function testRedbarkKey(key: string): Promise<{ ok: true; plan: string | null } | { ok: false; error: string }> {
  try {
    const me = await call<{ plan?: string | null }>(key, "/me");
    return { ok: true, plan: me.plan ?? null };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Couldn't reach Redbark." }; }
}

/** The business's Redbark key (kept in integration_credentials, read by the server only). */
export async function redbarkKey(db: SupabaseClient, orgId: string): Promise<{ key: string; integrationId: string; settings: FeedSettings } | null> {
  const { data: row } = await db.from("integrations").select("id, status, settings").eq("organisation_id", orgId).eq("provider", REDBARK_PROVIDER).maybeSingle();
  if (!row || row.status !== "connected") return null;
  const { data } = await db.rpc("service_get_integration_tokens", { p_integration_id: row.id });
  const t = (Array.isArray(data) ? data[0] : data) as { access_token?: string | null } | undefined;
  const key = t?.access_token?.trim();
  return key ? { key, integrationId: row.id as string, settings: readFeedSettings(row.settings) } : null;
}

interface RbAccount { id: string; name?: string | null; account_number?: string | null; provider?: string | null; category?: string | null; type?: string | null; status?: string | null; connection?: string | null; institution?: { name?: string | null } | null }

/** Bank accounts (brokerage accounts left out). */
export async function feedAccounts(key: string): Promise<FeedAccount[]> {
  const list = await all<RbAccount>(key, "/accounts?limit=100", 10);
  return list
    .filter((a) => a.provider !== "snaptrade" && !/brokerage|investment/i.test(`${a.category ?? ""} ${a.type ?? ""}`))
    .map((a) => ({
      id: a.id, name: (a.name ?? "Account").slice(0, 80),
      last4: (a.account_number ?? "").replace(/\D/g, "").slice(-4) || null,
      institution: a.institution?.name ?? null, status: a.status ?? null, connection: a.connection ?? null,
    }));
}

interface RbTxn { id: string; date: string; description?: string | null; reference?: string | null; extended_description?: string | null; amount?: { amount?: number; currency?: string } | null; status?: string | null }

/** Settled transactions for one account between two dates (inclusive), as statement lines. */
export async function feedLines(key: string, account: string, from: string, to: string): Promise<BankLine[]> {
  const q = new URLSearchParams({ account, from, to, limit: "100" });
  const list = await all<RbTxn>(key, `/transactions?${q.toString()}`, 60);
  const out: BankLine[] = [];
  for (const t of list) {
    if (t.status && /pending/i.test(t.status)) continue;
    const cents = Number(t.amount?.amount);
    if (!Number.isFinite(cents) || !cents || !/^\d{4}-\d{2}-\d{2}$/.test(t.date)) continue;
    // the bank's description first (that's what the transfer and payout matching reads), then the payer details
    const parts: string[] = [];
    for (const p of [t.description, t.extended_description, t.reference]) {
      const s = (p ?? "").trim().replace(/\s+/g, " ");
      if (s && !parts.some((x) => x.toUpperCase().includes(s.toUpperCase()))) parts.push(s);
    }
    const narrative = parts.join(" · ").slice(0, 400);
    out.push({ key: `${account}|${t.id}`, account, date: t.date, narrative, amount: Math.round(cents) / 100, transfer: TRANSFER_RE.test(t.description ?? "") });
  }
  return out;
}

/** Every linked account's lines, as one statement (the same shape as a CSV export). */
export async function feedStatement(key: string, accounts: FeedAccount[], from: string, to: string): Promise<ParsedStatement> {
  const lines: BankLine[] = [];
  // a few at a time — Redbark allows 4 transaction reads in flight per key
  for (let i = 0; i < accounts.length; i += 3) {
    const got = await Promise.all(accounts.slice(i, i + 3).map((a) => feedLines(key, a.id, from, to)));
    for (const g of got) lines.push(...g);
  }
  lines.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const by = new Map<string, BankLine[]>();
  for (const l of lines) by.set(l.account, [...(by.get(l.account) ?? []), l]);
  return {
    lines, format: "Bank feed (Redbark)",
    accounts: accounts.filter((a) => by.has(a.id)).map((a) => {
      const ls = by.get(a.id)!;
      return { number: a.id, label: `${a.name}${a.last4 ? ` ••${a.last4}` : ""}`, lines: ls.length, from: ls[0].date, to: ls[ls.length - 1].date };
    }),
  };
}
