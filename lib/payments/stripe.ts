/**
 * Minimal Stripe REST client (no SDK): Checkout Sessions, account check, webhook signature verification.
 * Each organisation uses its own Stripe account — its secret key and webhook secret are stored in integration_credentials.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const API = "https://api.stripe.com/v1";

export class StripeError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); }
}

/** Stripe's form encoding: nested objects/arrays as a[b][0][c]=… */
export function formEncode(obj: Record<string, unknown>, prefix = "", out: string[] = []): string {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((item, i) => {
      if (item !== null && typeof item === "object") formEncode(item as Record<string, unknown>, `${key}[${i}]`, out);
      else out.push(`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(item))}`);
    });
    else if (typeof v === "object") formEncode(v as Record<string, unknown>, key, out);
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return out.join("&");
}

async function call<T>(secretKey: string, method: "GET" | "POST", path: string, body?: Record<string, unknown>, idempotencyKey?: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      "Stripe-Version": "2024-06-20",
    },
    body: body ? formEncode(body) : undefined,
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: string } } & T;
  if (!res.ok) throw new StripeError(json.error?.message ?? `Stripe returned ${res.status}`, res.status, json.error?.code);
  return json;
}

export interface StripeAccount { id: string; business_profile?: { name?: string | null } | null; settings?: { dashboard?: { display_name?: string | null } } | null; email?: string | null; charges_enabled?: boolean }
export const getAccount = (key: string) => call<StripeAccount>(key, "GET", "/account");

export function keyMode(key: string): "live" | "test" | null {
  if (/^(sk|rk)_live_[A-Za-z0-9]{10,}$/.test(key)) return "live";
  if (/^(sk|rk)_test_[A-Za-z0-9]{10,}$/.test(key)) return "test";
  return null;
}

export interface CheckoutSession { id: string; url: string | null; payment_status: string; amount_total: number | null; currency: string | null;
  payment_intent: string | null; metadata: Record<string, string> | null; customer_details?: { email?: string | null; name?: string | null } | null; created: number }

export function createCheckout(key: string, o: {
  amountCents: number; currency: string; name: string; description?: string; email?: string | null;
  successUrl: string; cancelUrl: string; metadata: Record<string, string>; idempotencyKey: string;
}) {
  return call<CheckoutSession>(key, "POST", "/checkout/sessions", {
    mode: "payment",
    success_url: o.successUrl,
    cancel_url: o.cancelUrl,
    customer_email: o.email || undefined,
    line_items: [{ quantity: 1, price_data: { currency: o.currency.toLowerCase(), unit_amount: o.amountCents, product_data: { name: o.name, description: o.description || undefined } } }],
    metadata: o.metadata,
    payment_intent_data: { metadata: o.metadata, description: o.name },
  }, o.idempotencyKey);
}

/** Verify a Stripe-Signature header (t=…,v1=…) against the raw body. Returns the parsed event or throws. */
export function verifyWebhook<T = unknown>(rawBody: string, header: string | null, secret: string, toleranceSec = 300, now = Math.floor(Date.now() / 1000)): T {
  if (!header) throw new Error("Missing Stripe-Signature header");
  const parts = header.split(",").map((p) => p.split("=") as [string, string]);
  const t = Number(parts.find(([k]) => k === "t")?.[1]);
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!t || !sigs.length) throw new Error("Malformed Stripe-Signature header");
  if (Math.abs(now - t) > toleranceSec) throw new Error("Stripe signature timestamp is too old");
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  const ok = sigs.some((s) => s.length === expected.length && timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
  if (!ok) throw new Error("Stripe signature doesn't match");
  return JSON.parse(rawBody) as T;
}

/** Amount in cents for Stripe, from a dollars value with at most 2 decimals. */
export const toCents = (n: number) => Math.round(Number(n) * 100);
