import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appBaseUrl } from "@/lib/integrations/registry";
import { chargeSavedCard, createCheckout, getPaymentIntent, StripeError, toCents } from "./stripe";
import { recordCardPayment, type StripeConfig } from "./service";

/**
 * Taking card payments for customers over the phone (Accounts):
 *  - Stripe's secure card page, opened by the team member, for one or several invoices — the card number goes straight
 *    to Stripe, never through EventureOS. With the customer's OK, Stripe keeps the card on file.
 *  - Charging a card on file for chosen invoices (and on the day a customer promised to pay).
 */

const UUID = /^[0-9a-f-]{36}$/i;
type Owing = { id: string; number: string; balance: number };

async function owingInvoices(db: SupabaseClient, orgId: string, customerId: string, invoiceIds: string[]): Promise<Owing[]> {
  const ids = [...new Set(invoiceIds.filter((x) => UUID.test(x)))].slice(0, 12);
  if (!ids.length) throw new Error("Choose at least one invoice.");
  const { data, error } = await db.from("invoices").select("id, number, balance, status, customer_id").eq("organisation_id", orgId).in("id", ids);
  if (error) throw new Error(error.message);
  const list = ((data ?? []) as { id: string; number: string; balance: number; status: string; customer_id: string }[])
    .filter((i) => i.customer_id === customerId && Number(i.balance) > 0 && !["draft", "void", "paid"].includes(i.status))
    .map((i) => ({ id: i.id, number: i.number, balance: Math.round(Number(i.balance) * 100) / 100 }));
  if (!list.length) throw new Error("Those invoices are already paid (or aren't this customer's).");
  return list;
}

export interface CardOnFile { id: string; stripe_customer: string; payment_method: string; brand: string | null; last4: string | null; exp_month: number | null; exp_year: number | null; created_at: string; consent: string | null }

export async function cardOnFile(db: SupabaseClient, orgId: string, customerId: string): Promise<CardOnFile | null> {
  const { data, error } = await db.from("customer_cards").select("id, stripe_customer, payment_method, brand, last4, exp_month, exp_year, created_at, consent")
    .eq("organisation_id", orgId).eq("customer_id", customerId).eq("active", true).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) return null;
  return (data as CardOnFile | null) ?? null;
}

/** Stripe's secure card page for the chosen invoices. Returns its address to open. */
export async function startPhoneCheckout(db: SupabaseClient, orgId: string, cfg: StripeConfig, o: { customerId: string; invoiceIds: string[]; saveCard: boolean; staffId: string; staffName: string; currency: string; email: string | null }) {
  const list = await owingInvoices(db, orgId, o.customerId, o.invoiceIds);
  const existing = o.saveCard ? await cardOnFile(db, orgId, o.customerId) : null;
  const [first, ...rest] = list;
  const base = appBaseUrl();
  const consent = o.saveCard ? `Agreed by phone to keep the card on file for future invoices — taken by ${o.staffName}, ${new Date().toISOString().slice(0, 10)}` : "";
  const session = await createCheckout(cfg.secretKey, {
    amountCents: toCents(first.balance), currency: o.currency, name: `Invoice ${first.number}`,
    extraLines: rest.map((i) => ({ name: `Invoice ${i.number}`, amountCents: toCents(i.balance) })),
    email: o.email,
    successUrl: `${base}/accounts/${o.customerId}?paid=1`, cancelUrl: `${base}/accounts/${o.customerId}`,
    metadata: {
      eventureos_org_id: orgId, eventureos_invoice_ids: list.map((i) => i.id).join(","), eventureos_alloc: list.map((i) => toCents(i.balance)).join(","),
      eventureos_customer: o.customerId, eventureos_phone: "1", eventureos_staff: o.staffId, ...(o.saveCard ? { eventureos_save_card: "1", eventureos_consent: consent.slice(0, 480) } : {}),
      invoice_numbers: list.map((i) => i.number).join(", ").slice(0, 480),
    },
    idempotencyKey: `phone-${o.customerId}-${list.map((i) => `${i.id.slice(0, 8)}${toCents(i.balance)}`).join("")}-${o.saveCard ? 1 : 0}-${Math.floor(Date.now() / 60000)}`,
    account: cfg.account,
    saveCard: o.saveCard ? { customerId: existing?.stripe_customer ?? null } : null,
  });
  if (!session.url) throw new Error("Stripe didn't return a payment page. Please try again.");
  return { url: session.url, total: list.reduce((a, i) => a + i.balance, 0), invoices: list.map((i) => i.number) };
}

/** After a phone payment with "keep the card on file": remember the card (Stripe ids, brand, last 4, expiry). */
export async function saveCardFromPayment(db: SupabaseClient, orgId: string, cfg: StripeConfig, customerId: string, paymentIntent: string, consent: string | null, staffId: string | null) {
  const pi = await getPaymentIntent(cfg.secretKey, paymentIntent, cfg.account);
  const pm = typeof pi.payment_method === "object" && pi.payment_method ? pi.payment_method : null;
  if (!pi.customer || !pm?.id) return;
  await db.from("customer_cards").update({ active: false }).eq("organisation_id", orgId).eq("customer_id", customerId).eq("active", true);
  await db.from("customer_cards").insert({
    organisation_id: orgId, customer_id: customerId, stripe_customer: pi.customer, payment_method: pm.id, brand: pm.card?.brand ?? null, last4: pm.card?.last4 ?? null,
    exp_month: pm.card?.exp_month ?? null, exp_year: pm.card?.exp_year ?? null, consent, added_by: staffId && UUID.test(staffId) ? staffId : null,
  });
}

/** Charge the card on file for the chosen invoices, and record the payment on each (and in Xero). */
export async function chargeCardOnFile(db: SupabaseClient, orgId: string, cfg: StripeConfig, o: { customerId: string; invoiceIds: string[]; currency: string; reason: string; email: string | null }) {
  const card = await cardOnFile(db, orgId, o.customerId);
  if (!card) throw new Error("There's no card on file for this customer.");
  const list = await owingInvoices(db, orgId, o.customerId, o.invoiceIds);
  const total = Math.round(list.reduce((a, i) => a + i.balance, 0) * 100) / 100;
  let pi;
  try {
    pi = await chargeSavedCard(cfg.secretKey, {
      amountCents: toCents(total), currency: o.currency, customer: card.stripe_customer, paymentMethod: card.payment_method,
      description: `Invoice${list.length > 1 ? "s" : ""} ${list.map((i) => i.number).join(", ")}`.slice(0, 300),
      metadata: { eventureos_org_id: orgId, eventureos_customer: o.customerId, eventureos_card_on_file: "1", eventureos_reason: o.reason.slice(0, 200), invoice_numbers: list.map((i) => i.number).join(", ").slice(0, 480) },
      idempotencyKey: `cof-${o.customerId}-${list.map((i) => `${i.id.slice(0, 8)}${toCents(i.balance)}`).join("")}-${Math.floor(Date.now() / 60000)}`,
      account: cfg.account, email: o.email,
    });
  } catch (e) {
    if (e instanceof StripeError) throw new Error(/authentication_required|requires_action/i.test(`${e.code ?? ""} ${e.message}`) ? "The card's bank wants the cardholder to approve this payment — send them the pay link instead, or take the card again over the phone." : `The card was declined: ${e.message}`);
    throw e;
  }
  if (pi.status !== "succeeded") throw new Error(pi.status === "requires_action" ? "The card's bank wants the cardholder to approve this payment — send them the pay link instead." : `The payment didn't go through (${pi.status}).`);
  const now = Math.floor(Date.now() / 1000);
  for (const [k, i] of list.entries()) await recordCardPayment(db, orgId, cfg, { invoiceId: i.id, amount: i.balance, createdSec: now, key: k ? `${pi.id}#${k}` : pi.id, payer: null });
  return { total, invoices: list.map((i) => i.number), card };
}
