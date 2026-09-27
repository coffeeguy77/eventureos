import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/integrations/runtime";
import { buildContext } from "@/lib/integrations/sync-runner";
import { xeroPut } from "@/lib/integrations/xero";
import { appBaseUrl } from "@/lib/integrations/registry";
import { createCheckout, toCents, verifyWebhook, type CheckoutSession } from "./stripe";

export interface StripeSettings { mode?: "live" | "test"; account_name?: string; xero_account?: string | null }
export interface StripeConfig { integrationId: string; secretKey: string; webhookSecret: string | null; settings: StripeSettings }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The organisation's Stripe keys (service role only). Null when Stripe isn't connected. */
export async function loadStripe(db: SupabaseClient, orgId: string): Promise<StripeConfig | null> {
  const { data: integ } = await db.from("integrations").select("id, status, settings").eq("organisation_id", orgId).eq("provider", "stripe").maybeSingle();
  if (!integ || integ.status !== "connected") return null;
  const { data: tok, error } = await db.rpc("service_get_integration_tokens", { p_integration_id: integ.id });
  if (error) throw new Error(`Couldn't read the Stripe keys: ${error.message}`);
  const row = (Array.isArray(tok) ? tok[0] : tok) as { access_token: string | null; refresh_token: string | null } | undefined;
  if (!row?.access_token) return null;
  return { integrationId: integ.id as string, secretKey: row.access_token, webhookSecret: row.refresh_token, settings: (integ.settings ?? {}) as StripeSettings };
}

export interface PayInvoice {
  id: string; number: string | null; kind: string; total: number; amount_paid: number; balance: number; status: string; due_date: string | null; issue_date: string | null;
  currency: string; xero_invoice_id: string | null; organisation_id: string; customer: { name: string; email: string | null } | null;
  event: { name: string; event_date: string | null } | null;
  org: { name: string; slug: string; logo_url: string | null; brand_colour: string | null; contact_email: string | null; contact_phone: string | null };
}

/** Look up an invoice by its pay link token. Only what the payer needs to see. */
export async function invoiceByToken(token: string): Promise<{ inv: PayInvoice; stripeReady: boolean } | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const db = createServiceClient();
  const { data } = await db.from("invoices")
    .select("id, number, kind, total, amount_paid, balance, status, due_date, issue_date, currency, xero_invoice_id, organisation_id, customer:customers(name, email), event:events(name, event_date), org:organisations(name, slug, logo_url, brand_colour, contact_email, contact_phone)")
    .eq("pay_token", token).maybeSingle();
  if (!data) return null;
  const inv = data as unknown as PayInvoice;
  const { data: integ } = await db.from("integrations").select("status").eq("organisation_id", inv.organisation_id).eq("provider", "stripe").maybeSingle();
  return { inv, stripeReady: integ?.status === "connected" };
}

export const payable = (inv: Pick<PayInvoice, "status" | "balance">) => !["draft", "void", "paid"].includes(inv.status) && Number(inv.balance) > 0;

/** Create a Stripe Checkout for the invoice's balance and return its URL. */
export async function startCheckout(token: string): Promise<string> {
  const found = await invoiceByToken(token);
  if (!found) throw new Error("This payment link isn't valid.");
  const { inv } = found;
  if (!payable(inv)) throw new Error(inv.status === "paid" ? "This invoice is already paid — thank you." : "This invoice can't be paid online.");
  const db = createServiceClient();
  const cfg = await loadStripe(db, inv.organisation_id);
  if (!cfg) throw new Error(`${inv.org.name} hasn't set up card payments yet. Please contact them to pay.`);
  const amount = Number(inv.balance);
  const base = appBaseUrl();
  const name = `${inv.org.name} — invoice ${inv.number ?? ""}`.trim();
  const session = await createCheckout(cfg.secretKey, {
    amountCents: toCents(amount), currency: inv.currency || "AUD", name,
    description: inv.event ? `${inv.event.name}${inv.event.event_date ? ` · ${inv.event.event_date}` : ""}` : undefined,
    email: inv.customer?.email ?? null,
    successUrl: `${base}/pay/${token}?paid=1`, cancelUrl: `${base}/pay/${token}`,
    metadata: { eventureos_invoice_id: inv.id, eventureos_org_id: inv.organisation_id, invoice_number: inv.number ?? "" },
    // Same invoice + same amount within a minute reuses one session (double-clicks)
    idempotencyKey: `inv-${inv.id}-${toCents(amount)}-${Math.floor(Date.now() / 60000)}`,
  });
  if (!session.url) throw new Error("Stripe didn't return a payment page. Please try again.");
  return session.url;
}

/** Send a card payment to Xero against the organisation's Stripe clearing account. Returns the Xero PaymentID. */
async function pushToXero(db: SupabaseClient, orgId: string, xeroInvoiceId: string, amount: number, date: string, reference: string, account: string) {
  const ctx = await buildContext(db, "service", orgId, "xero", null);
  const acct = UUID.test(account) ? { AccountID: account } : { Code: account };
  const res = await xeroPut<{ Payments?: { PaymentID: string }[] }>(ctx, "/Payments", {
    Payments: [{ Invoice: { InvoiceID: xeroInvoiceId }, Account: acct, Date: date, Amount: amount, Reference: reference }],
  });
  const id = res.Payments?.[0]?.PaymentID;
  if (!id) throw new Error("Xero didn't return a payment id");
  return id;
}

/** Handle a Stripe webhook for one organisation. Returns a short description for the response/logs. */
export async function handleStripeWebhook(orgId: string, rawBody: string, signature: string | null): Promise<string> {
  if (!UUID.test(orgId)) throw new Error("Unknown organisation");
  const db = createServiceClient();
  const cfg = await loadStripe(db, orgId);
  if (!cfg?.webhookSecret) throw new Error("Stripe isn't connected for this organisation (or the webhook secret is missing)");
  const event = verifyWebhook<{ type: string; data: { object: CheckoutSession } }>(rawBody, signature, cfg.webhookSecret);
  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") return `ignored ${event.type}`;
  const s = event.data.object;
  if (s.payment_status !== "paid") return "not paid yet";
  const invoiceId = s.metadata?.eventureos_invoice_id;
  if (!invoiceId || s.metadata?.eventureos_org_id !== orgId) return "not an EventureOS payment";
  const pi = s.payment_intent ?? s.id;

  const { data: dupe } = await db.from("payments").select("id").eq("organisation_id", orgId).eq("stripe_payment_intent", pi).maybeSingle();
  if (dupe) return "already recorded";
  const { data: inv } = await db.from("invoices").select("id, number, xero_invoice_id, organisation_id").eq("id", invoiceId).eq("organisation_id", orgId).maybeSingle();
  if (!inv) throw new Error("Invoice not found");

  const amount = (s.amount_total ?? 0) / 100;
  const { data: org } = await db.from("organisations").select("timezone").eq("id", orgId).single();
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: (org?.timezone as string) || "Australia/Sydney" }).format(new Date(s.created * 1000));
  let xeroId: string | null = null, xeroErr: string | null = null;
  if (inv.xero_invoice_id && cfg.settings.mode === "test") {
    xeroErr = "Stripe is in test mode, so this test payment was not sent to Xero";
  } else if (inv.xero_invoice_id) {
    const account = cfg.settings.xero_account?.trim();
    if (!account) xeroErr = "no Xero account chosen for Stripe payments";
    else {
      try { xeroId = await pushToXero(db, orgId, inv.xero_invoice_id as string, amount, date, `Stripe ${pi}`, account); }
      catch (e) { xeroErr = e instanceof Error ? e.message : String(e); }
    }
  }
  const { error } = await db.rpc("record_stripe_payment", {
    p_invoice_id: inv.id, p_amount: amount, p_paid_at: new Date(s.created * 1000).toISOString(), p_payment_intent: pi,
    p_payer: s.customer_details?.name ?? null, p_xero_payment_id: xeroId, p_xero_error: xeroErr,
  });
  if (error) throw new Error(`Couldn't record the payment: ${error.message}`);
  return `recorded ${amount} on ${inv.number ?? inv.id}${xeroId ? " (Xero)" : xeroErr ? ` (Xero failed: ${xeroErr})` : ""}`;
}

/** Retry Stripe payments that didn't reach Xero (called from the Xero sync). */
export async function retryStripePaymentsToXero(db: SupabaseClient, orgId: string): Promise<number> {
  const cfg = await loadStripe(db, orgId).catch(() => null);
  const account = cfg?.settings.xero_account?.trim();
  if (!cfg || !account || cfg.settings.mode === "test") return 0;
  const { data } = await db.from("payments").select("id, amount, paid_at, stripe_payment_intent, invoice:invoices!inner(xero_invoice_id)")
    .eq("organisation_id", orgId).not("stripe_payment_intent", "is", null).is("xero_payment_id", null).not("invoice.xero_invoice_id", "is", null)
    .or("xero_push_error.is.null,xero_push_error.not.ilike.Stripe is in test mode%").limit(20);
  const { data: org } = await db.from("organisations").select("timezone").eq("id", orgId).single();
  let n = 0;
  for (const p of (data ?? []) as unknown as { id: string; amount: number; paid_at: string; stripe_payment_intent: string; invoice: { xero_invoice_id: string } }[]) {
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: (org?.timezone as string) || "Australia/Sydney" }).format(new Date(p.paid_at));
    try {
      const id = await pushToXero(db, orgId, p.invoice.xero_invoice_id, Number(p.amount), date, `Stripe ${p.stripe_payment_intent}`, account);
      await db.from("payments").update({ xero_payment_id: id, xero_push_error: null }).eq("id", p.id);
      n++;
    } catch (e) {
      await db.from("payments").update({ xero_push_error: (e instanceof Error ? e.message : String(e)).slice(0, 300) }).eq("id", p.id);
    }
  }
  return n;
}
