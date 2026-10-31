"use server";

import { revalidatePath } from "next/cache";
import { canManage, requireOrg } from "@/lib/context";
import { createServiceClient } from "@/lib/integrations/runtime";
import { actorName, logActivity } from "@/lib/activity";
import { readReconcile, type XeroTransferLite } from "@/lib/reconcile/core";
import { sharedOrgIds } from "@/lib/reconcile/shared";
import type { NewTransfer, SentResult } from "@/lib/reconcile/xero";
export type { SentResult };

/** Accounts → Reconcile: save the account matching, check Xero for transfers already there, send new ones. */
type R<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;

async function owner() {
  const ctx = await requireOrg();
  if (!canManage(ctx.role)) throw new Error("Only owners, admins and managers can use Reconcile.");
  return ctx;
}
async function xero(orgId: string, userId: string) {
  const db = createServiceClient();
  const { buildContext } = await import("@/lib/integrations/sync-runner");
  const ctx = await buildContext(db, "service", orgId, "xero", userId);
  const { xeroBankAccounts } = await import("@/lib/reconcile/xero");
  return { db, ctx, banks: await xeroBankAccounts(ctx) };
}

export async function saveReconcileSettings(input: { accounts: Record<string, string>; from: string | null; stripe?: { income: string | null; incomeTax: string | null; fees: string | null; feesTax: string | null } }): Promise<R> {
  try {
    const { supabase, org } = await owner();
    if (input.from && !DATE.test(input.from)) throw new Error("Choose a start date.");
    const { data, error: e1 } = await supabase.from("organisations").select("settings").eq("id", org.id).single();
    if (e1) throw new Error(e1.message);
    const settings = (data?.settings ?? {}) as Record<string, unknown>;
    // the transfers step saves accounts + date only; keep the Stripe coding unless it's being changed
    const clean = readReconcile({ reconcile: { ...input, stripe: input.stripe ?? readReconcile(settings).stripe } });
    const { error } = await supabase.from("organisations").update({ settings: { ...settings, reconcile: clean } }).eq("id", org.id);
    if (error) throw new Error(error.message);
    revalidatePath("/accounts/reconcile");
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

/** Transfers already in Xero since the start date (so nothing is sent twice). */
export async function xeroTransfers(from: string): Promise<R<XeroTransferLite[]>> {
  try {
    if (!DATE.test(from)) throw new Error("Choose a start date.");
    const { org, user } = await owner();
    const { ctx } = await xero(org.id, user.id);
    const { xeroTransfersSince } = await import("@/lib/reconcile/xero");
    return { ok: true, data: await xeroTransfersSince(ctx, from) };
  } catch (e) { return fail(e); }
}

/** Create the chosen transfers in Xero. Each is checked against your Xero bank accounts and the start date. */
export async function sendTransfers(items: NewTransfer[]): Promise<R<SentResult[]>> {
  try {
    const { org, user, role, profile, supabase } = await owner();
    if (role !== "owner" && role !== "admin") throw new Error("Only an owner or admin can send transfers to Xero.");
    if (!Array.isArray(items) || !items.length) throw new Error("Choose the transfers to send.");
    if (items.length > 300) throw new Error("Send at most 300 at a time.");
    const s = readReconcile(org.settings);
    const { ctx, banks } = await xero(org.id, user.id);
    const ids = new Set(banks.map((b) => b.id));
    const clean: NewTransfer[] = [];
    for (const t of items) {
      const amount = Math.round(Number(t.amount) * 100) / 100;
      if (!UUID.test(t.from) || !UUID.test(t.to) || !ids.has(t.from) || !ids.has(t.to) || t.from === t.to) throw new Error("A transfer has a bank account that isn't in your Xero — check the account matching.");
      if (!(amount > 0) || amount > 10_000_000) throw new Error("A transfer has an amount that doesn't look right.");
      if (!DATE.test(t.date) || (s.from && t.date < s.from)) throw new Error("A transfer is before your start date.");
      clean.push({ key: String(t.key).slice(0, 400), from: t.from, to: t.to, amount, date: t.date });
    }
    // never send one Xero already has (the page checks too; this catches a double click or a second tab)
    const { xeroTransfersSince, createXeroTransfers } = await import("@/lib/reconcile/xero");
    const { alreadyInXero } = await import("@/lib/reconcile/core");
    const earliest = clean.reduce((a, t) => (t.date < a ? t.date : a), clean[0].date);
    const there = alreadyInXero(clean, await xeroTransfersSince(ctx, earliest));
    const todo = clean.filter((t) => !there.has(t.key));
    const results: SentResult[] = [...clean.filter((t) => there.has(t.key)).map((t) => ({ key: t.key, ok: true, error: "Already in Xero" }))];
    results.push(...(await createXeroTransfers(ctx, todo)));
    const made = results.filter((r) => r.ok && r.id).length;
    if (made) {
      const total = todo.filter((t) => results.find((r) => r.key === t.key && r.ok && r.id)).reduce((a, t) => a + t.amount, 0);
      await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "xero.transfers", entityType: "organisation", entityId: org.id,
        summary: `${actorName(profile)} sent ${made} bank transfer${made === 1 ? "" : "s"} ($${total.toFixed(2)}) to Xero from Reconcile` });
    }
    return { ok: true, data: results };
  } catch (e) { return fail(e); }
}

// ── Invoices and Stripe payouts ──────────────────────────────────────────────────────────────────

/** Record the chosen deposits as payments on their invoices, into the bank account they landed in. */
export async function sendPayments(items: { key: string; invoice: string; bank: string; amount: number; date: string; reference: string }[]): Promise<R<SentResult[]>> {
  try {
    const { org, user, role, profile, supabase } = await owner();
    if (role !== "owner" && role !== "admin") throw new Error("Only an owner or admin can record payments in Xero.");
    if (!Array.isArray(items) || !items.length) throw new Error("Choose the payments to record.");
    if (items.length > 200) throw new Error("Record at most 200 at a time.");
    const s = readReconcile(org.settings);
    const { db, ctx, banks } = await xero(org.id, user.id);
    const ids = new Set(banks.map((b) => b.id));
    const orgs = await sharedOrgIds(db, org.id);
    const { data: invs } = await db.from("invoices").select("xero_invoice_id").in("organisation_id", orgs).in("xero_invoice_id", items.map((t) => String(t.invoice)));
    const known = new Set(((invs ?? []) as { xero_invoice_id: string }[]).map((r) => r.xero_invoice_id));
    const seen = new Set<string>();
    const clean = items.map((t) => {
      const amount = Math.round(Number(t.amount) * 100) / 100;
      if (!known.has(t.invoice)) throw new Error("A payment is for an invoice that isn't this business's.");
      if (seen.has(t.invoice)) throw new Error("Two deposits are against the same invoice — choose one.");
      seen.add(t.invoice);
      if (!ids.has(t.bank)) throw new Error("A payment has a bank account that isn't in your Xero — check the account matching.");
      if (!(amount > 0) || amount > 10_000_000) throw new Error("A payment amount doesn't look right.");
      if (!DATE.test(t.date) || (s.from && t.date < s.from)) throw new Error("A payment is before your start date.");
      return { key: String(t.key).slice(0, 400), invoice: t.invoice, bank: t.bank, amount, date: t.date, reference: String(t.reference ?? "").slice(0, 200) };
    });
    const { createXeroPayments } = await import("@/lib/reconcile/xero");
    const res = await createXeroPayments(ctx, clean);
    const made = res.filter((r) => r.ok).length;
    if (made) await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "xero.payments", entityType: "organisation", entityId: org.id, summary: `${actorName(profile)} recorded ${made} invoice payment${made === 1 ? "" : "s"} in Xero from bank deposits (Reconcile)` });
    revalidatePath("/invoices");
    return { ok: true, data: res };
  } catch (e) { return fail(e); }
}

/** Stripe payouts since the start date, with what's in each, and which already have a Xero deposit. */
export async function loadPayouts(from: string, to: string | null): Promise<R<{ payouts: import("@/lib/reconcile/match").Payout[]; inXero: string[] }>> {
  try {
    if (!DATE.test(from) || (to && !DATE.test(to))) throw new Error("Choose a start date.");
    const { org, user } = await owner();
    const db = createServiceClient();
    const { stripePayouts } = await import("@/lib/reconcile/stripe");
    const payouts = await stripePayouts(db, org.id, await sharedOrgIds(db, org.id), from, to);
    let inXero: string[] = [];
    if (payouts.length) {
      const { ctx } = await xero(org.id, user.id);
      const { payoutsInXero } = await import("@/lib/reconcile/xero");
      inXero = [...(await payoutsInXero(ctx, payouts.map((p) => p.id)))];
    }
    return { ok: true, data: { payouts, inXero } };
  } catch (e) { return fail(e); }
}

/** One Xero deposit per chosen payout — re-read from Stripe here, coded with your saved accounts, never twice. */
export async function sendPayouts(input: { key: string; payoutId: string; bank: string; date: string }[]): Promise<R<SentResult[]>> {
  let items = Array.isArray(input) ? input : [];
  try {
    const { org, user, role, profile, supabase } = await owner();
    if (role !== "owner" && role !== "admin") throw new Error("Only an owner or admin can send payouts to Xero.");
    if (!Array.isArray(items) || !items.length) throw new Error("Choose the payouts to send.");
    if (items.length > 100) throw new Error("Send at most 100 at a time.");
    const s = readReconcile(org.settings);
    const c = s.stripe;
    if (!c.income || !c.fees) throw new Error("Choose the income and fees accounts for Stripe first (and save).");
    const { db, ctx, banks } = await xero(org.id, user.id);
    const ids = new Set(banks.map((b) => b.id));
    const results: SentResult[] = [];
    // one payout before the start date (or with a bad account) is skipped on its own — the rest still go
    items = items.filter((t) => {
      const bad = !/^po_\w+$/.test(t.payoutId) ? "Refresh and try again." : !ids.has(t.bank) ? "Its bank account isn't in your Xero — check the account matching."
        : !DATE.test(t.date) || (s.from && t.date < s.from) ? "Before your start date — left alone." : null;
      if (bad) results.push({ key: t.key, ok: false, error: bad });
      return !bad;
    });
    if (!items.length) return { ok: true, data: results };
    const dates = items.map((t) => t.date).sort();
    const { stripePayouts } = await import("@/lib/reconcile/stripe");
    const all = await stripePayouts(db, org.id, await sharedOrgIds(db, org.id), addDays(dates[0], -5), addDays(dates[dates.length - 1], 2));
    const { xeroAccountsAll, payoutsInXero, createPayoutDeposits } = await import("@/lib/reconcile/xero");
    const accounts = await xeroAccountsAll(ctx);
    const { data: st } = await db.from("integrations").select("settings").eq("organisation_id", org.id).eq("provider", "stripe").maybeSingle();
    const clearingId = (st?.settings as { xero_account?: string } | null)?.xero_account ?? null;
    const clearing = clearingId ? accounts.find((a) => a.id === clearingId || a.code === clearingId) ?? null : null;
    const there = await payoutsInXero(ctx, items.map((t) => t.payoutId));
    const { payoutLines } = await import("@/lib/reconcile/match");
    const todo: import("@/lib/reconcile/xero").NewDeposit[] = [];
    for (const t of items) {
      const p = all.find((x) => x.id === t.payoutId);
      if (!p) { results.push({ key: t.key, ok: false, error: "Stripe didn't return this payout." }); continue; }
      if (there.has(p.id)) { results.push({ key: t.key, ok: true, error: "Already in Xero" }); continue; }
      if (p.recorded && (!clearing?.code || clearing.type === "BANK")) { results.push({ key: t.key, ok: false, error: "This payout includes payments EventureOS already sent to your Stripe clearing account — reconcile this one in Xero by hand." }); continue; }
      const built = payoutLines(p, { clearing: clearing?.code ?? null, income: c.income, incomeTax: c.incomeTax, fees: c.fees, feesTax: c.feesTax });
      if (!built.balanced || !(built.total > 0)) { results.push({ key: t.key, ok: false, error: `The breakdown ($${built.total.toFixed(2)}) doesn't add up to the payout ($${p.amount.toFixed(2)}) — reconcile this one by hand.` }); continue; }
      todo.push({ key: t.key, payoutId: p.id, bank: t.bank, date: t.date, lines: built.lines });
    }
    results.push(...(await createPayoutDeposits(ctx, todo)));
    const made = results.filter((r) => r.ok && r.id).length;
    if (made) await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "xero.payouts", entityType: "organisation", entityId: org.id, summary: `${actorName(profile)} sent ${made} Stripe payout${made === 1 ? "" : "s"} to Xero (Reconcile)` });
    return { ok: true, data: results };
  } catch (e) { return fail(e); }
}

function addDays(iso: string, n: number) { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
