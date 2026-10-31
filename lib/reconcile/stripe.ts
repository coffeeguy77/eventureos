import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { stripeGet } from "@/lib/payments/stripe";
import { loadStripe } from "@/lib/payments/service";
import type { PayItem, PayKind, Payout } from "./match";

/**
 * Stripe payouts and what's in them.
 *  GET /v1/payouts?arrival_date[gte]=…&status=paid           https://docs.stripe.com/api/payouts/list
 *  GET /v1/balance_transactions?payout=po_…&expand[]=data.source   https://docs.stripe.com/api/balance_transactions/list
 *  GET /v1/charges/ch_…   (only for a refund, to see what was refunded)
 * Each balance transaction has amount (gross), fee and net in cents; the payout's own entry is skipped. What each payment
 * was for comes from the metadata EventureOS puts on every payment (shop checkout, booking, gift, academy, invoice).
 */
type Charge = { id?: string; payment_intent?: string | null; metadata?: Record<string, string> | null; billing_details?: { name?: string | null; email?: string | null } | null; receipt_email?: string | null; description?: string | null; charge?: string | null };
type BT = { id: string; type: string; amount: number; fee: number; net: number; source?: Charge | string | null };
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

/** What a payment was for, from EventureOS's metadata on it. */
export function kindOf(meta: Record<string, string> | null | undefined): { kind: PayKind; what: string | null } {
  const m = meta ?? {};
  if (m.eventureos_shop_checkout || m.eventureos_shop_renewal) return { kind: "shop", what: m.eventureos_shop_renewal ? "subscription" : "shop order" };
  if (m.eventureos_booking_id) return { kind: "bookings", what: m.booking_reference ? `booking ${m.booking_reference}` : "booking" };
  if (m.eventureos_gift_id) return { kind: "bookings", what: "gift voucher" };
  if (m.eventureos_learn_access || m.eventureos_learn_hire || m.eventureos_learn_addon) return { kind: "bookings", what: "academy" };
  if (m.eventureos_invoice_id) return { kind: "other", what: m.invoice_number ? `invoice ${m.invoice_number}` : "invoice" };
  return { kind: "other", what: null };
}
const payer = (c: Charge) => (c.billing_details?.name || c.billing_details?.email || c.receipt_email || c.description || "").trim().slice(0, 60);

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
      const groups: Record<PayKind, number> = { shop: 0, bookings: 0, other: 0 };
      const refs: string[] = [];
      const items: PayItem[] = [];
      for (const b of bts) {
        if (b.type === "payout") continue;
        const src = typeof b.source === "object" && b.source ? b.source : null;
        if (b.type === "charge" || b.type === "payment") {
          gross += b.amount; fees += b.fee; count++;
          const { kind, what } = kindOf(src?.metadata);
          // payments for EventureOS invoices always belong in the Stripe clearing account: EventureOS records them
          // against the invoice there (straight away, or once the invoice reaches Xero) — never as sales here too
          const isRec = (!!src?.payment_intent && recorded.has(src.payment_intent)) || !!src?.metadata?.eventureos_invoice_id;
          if (isRec) { rec += b.amount; refs.push(src?.payment_intent ?? src?.id ?? b.id); } else groups[kind] += b.amount;
          items.push({ name: src ? payer(src) : "", amount: b.amount / 100, kind, recorded: isRec, what });
        } else if (b.type === "refund" || b.type === "payment_refund") {
          refunds += b.amount; fees += b.fee;
          // refunds come off the kind of sale they refund
          let kind: PayKind = "other";
          const chargeId = typeof src?.charge === "string" ? src.charge : null;
          if (chargeId) { try { kind = kindOf((await stripeGet<Charge>(cfg.secretKey, `/charges/${chargeId}`, cfg.account)).metadata).kind; } catch { /* keep "other" */ } }
          groups[kind] += b.amount;
        } else if (b.type === "stripe_fee" || b.type === "tax_fee") fees += -b.net;
        else { other += b.net; groups.other += b.net; }
      }
      const c = (n: number) => n / 100;
      return {
        id: p.id, amount: c(p.amount), arrival: iso(p.arrival_date), groups: { shop: c(groups.shop), bookings: c(groups.bookings), other: c(groups.other) },
        gross: c(gross), fees: c(fees), refunds: c(refunds), other: c(other), recorded: c(rec), recordedRefs: refs, count, items,
      } satisfies Payout;
    }))));
  }
  return res;
}
