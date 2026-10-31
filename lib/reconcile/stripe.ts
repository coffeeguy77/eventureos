import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { stripeGet } from "@/lib/payments/stripe";
import { loadStripe } from "@/lib/payments/service";
import type { Payout } from "./match";

/**
 * Stripe payouts and what's in them.
 *  GET /v1/payouts?arrival_date[gte]=…&status=paid           https://docs.stripe.com/api/payouts/list
 *  GET /v1/balance_transactions?payout=po_…&expand[]=data.source   https://docs.stripe.com/api/balance_transactions/list
 * Each balance transaction has amount (gross), fee and net in cents; the payout's own entry is skipped.
 */
type BT = { id: string; type: string; amount: number; fee: number; net: number; source?: { id?: string; payment_intent?: string | null } | string | null };
type PO = { id: string; amount: number; arrival_date: number; status: string; currency: string };

const iso = (sec: number) => new Date(sec * 1000).toISOString().slice(0, 10);

async function all<T extends { id: string }>(key: string, account: string | null, path: string, max: number): Promise<T[]> {
  const out: T[] = [];
  let after: string | null = null;
  while (out.length < max) {
    const sep = path.includes("?") ? "&" : "?";
    const r: { data: T[]; has_more: boolean } = await stripeGet(key, `${path}${sep}limit=100${after ? `&starting_after=${after}` : ""}`, account);
    out.push(...r.data);
    if (!r.has_more || !r.data.length) break;
    after = r.data[r.data.length - 1].id;
  }
  return out.slice(0, max);
}

/** Payment intents EventureOS already sent to Xero (into the Stripe clearing account), for these businesses. */
async function recordedIntents(db: SupabaseClient, orgIds: string[]) {
  const { data } = await db.from("payments").select("stripe_payment_intent").in("organisation_id", orgIds).not("stripe_payment_intent", "is", null).not("xero_payment_id", "is", null);
  return new Set(((data ?? []) as { stripe_payment_intent: string }[]).map((r) => r.stripe_payment_intent));
}

export async function stripePayouts(db: SupabaseClient, orgId: string, orgIds: string[], from: string, to?: string | null): Promise<Payout[]> {
  const cfg = await loadStripe(db, orgId);
  if (!cfg) throw new Error("Stripe isn't connected for this business.");
  const gte = Math.floor(Date.parse(`${from}T00:00:00Z`) / 1000) - 86_400;
  const lte = to ? Math.floor(Date.parse(`${to}T23:59:59Z`) / 1000) + 3 * 86_400 : null;
  const payouts = (await all<PO>(cfg.secretKey, cfg.account, `/payouts?status=paid&arrival_date[gte]=${gte}${lte ? `&arrival_date[lte]=${lte}` : ""}`, 400)).filter((p) => p.currency === "aud");
  const recorded = await recordedIntents(db, orgIds);
  const res: Payout[] = [];
  // a few at a time so Stripe's rate limit is never near
  for (let i = 0; i < payouts.length; i += 4) {
    const chunk = payouts.slice(i, i + 4);
    res.push(...(await Promise.all(chunk.map(async (p) => {
      const bts = await all<BT>(cfg.secretKey, cfg.account, `/balance_transactions?payout=${p.id}&expand[]=data.source`, 2000);
      let gross = 0, fees = 0, refunds = 0, other = 0, rec = 0, count = 0;
      const refs: string[] = [];
      for (const b of bts) {
        if (b.type === "payout") continue;
        if (b.type === "charge" || b.type === "payment") {
          gross += b.amount; fees += b.fee; count++;
          const pi = typeof b.source === "object" && b.source ? b.source.payment_intent ?? null : null;
          if (pi && recorded.has(pi)) { rec += b.amount; refs.push(pi); }
        } else if (b.type === "refund" || b.type === "payment_refund") { refunds += b.amount; fees += b.fee; }
        else if (b.type === "stripe_fee" || b.type === "tax_fee") fees += -b.net;
        else other += b.net;
      }
      return { id: p.id, amount: p.amount / 100, arrival: iso(p.arrival_date), gross: gross / 100, fees: fees / 100, refunds: refunds / 100, other: other / 100, recorded: rec / 100, recordedRefs: refs, count } satisfies Payout;
    }))));
  }
  return res;
}
