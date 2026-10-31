"use server";

import { revalidatePath } from "next/cache";
import { canManage, requireOrg } from "@/lib/context";
import { createServiceClient } from "@/lib/integrations/runtime";
import { actorName, logActivity } from "@/lib/activity";
import { readReconcile, type XeroTransferLite } from "@/lib/reconcile/core";
import type { NewTransfer, SentResult } from "@/lib/reconcile/xero";

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

export async function saveReconcileSettings(input: { accounts: Record<string, string>; from: string | null }): Promise<R> {
  try {
    const { supabase, org } = await owner();
    if (input.from && !DATE.test(input.from)) throw new Error("Choose a start date.");
    const { data, error: e1 } = await supabase.from("organisations").select("settings").eq("id", org.id).single();
    if (e1) throw new Error(e1.message);
    const settings = (data?.settings ?? {}) as Record<string, unknown>;
    const clean = readReconcile({ reconcile: input });
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
