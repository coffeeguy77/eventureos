import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { stateSecret } from "@/lib/integrations/oauth";
import { appBaseUrl } from "@/lib/integrations/registry";
import { OWING } from "./server";
import { readPayIn4 } from "./core";

/**
 * Account statements: one link per customer showing everything they owe (each invoice openable, pay all or some at
 * once) and their account history. The link is signed (no table needed) and lasts 90 days; opening it is recorded
 * on the account so the accounts person can see it was looked at.
 */
const secret = () => stateSecret() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null;
const UUID = /^[0-9a-f-]{36}$/i;
const DAYS = 90;

export function signStatement(orgId: string, customerId: string, emailId: string | null = null) {
  const k = secret();
  if (!k) throw new Error("Statements need APP state secret or the Supabase service key in Vercel.");
  const body = ["s1", orgId, customerId, String(Date.now() + DAYS * 86_400_000), emailId ?? ""].join(".");
  return `${Buffer.from(body).toString("base64url")}.${createHmac("sha256", k).update(body).digest("base64url")}`;
}

export function readStatement(token: string): { orgId: string; customerId: string; emailId: string | null; expired: boolean } | null {
  const k = secret();
  const [b, sig] = String(token || "").split(".");
  if (!k || !b || !sig) return null;
  const body = Buffer.from(b, "base64url").toString();
  const want = createHmac("sha256", k).update(body).digest();
  const got = Buffer.from(sig, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  const [v, orgId, customerId, exp, emailId] = body.split(".");
  if (v !== "s1" || !UUID.test(orgId) || !UUID.test(customerId)) return null;
  return { orgId, customerId, emailId: emailId && UUID.test(emailId) ? emailId : null, expired: Date.now() > Number(exp) };
}

export const statementUrl = (orgId: string, customerId: string, emailId: string | null = null) => `${appBaseUrl()}/pay/statement/${signStatement(orgId, customerId, emailId)}`;

export interface StatementData {
  org: { name: string; logo_url: string | null; brand_colour: string | null; contact_email: string | null; contact_phone: string | null; currency: string; slug: string; timezone: string };
  customer: { name: string; email: string | null };
  owing: { id: string; number: string; issue_date: string | null; due_date: string | null; total: number; balance: number; pay_token: string | null; reference: string | null }[];
  paid: { number: string; issue_date: string | null; total: number; pay_token: string | null }[];
  payments: { amount: number; paid_at: string; number: string | null }[];
  plan: { frequency: string; instalments: { n: number; due_date: string; amount: number; status: string }[] } | null;
  stripe: boolean;
  /** payment plans are available (database updated) */
  plansReady: boolean;
  payIn4: { enabled: boolean; days: number };
}

export async function loadStatement(db: SupabaseClient, orgId: string, customerId: string): Promise<StatementData | null> {
  const since = new Date(Date.now() - 400 * 86_400_000).toISOString().slice(0, 10);
  const [{ data: org }, { data: cust }, { data: inv }, { data: pays }, { data: integ }] = await Promise.all([
    db.from("organisations").select("name, logo_url, brand_colour, contact_email, contact_phone, currency, slug, timezone, status, settings").eq("id", orgId).maybeSingle(),
    db.from("customers").select("name, email").eq("id", customerId).eq("organisation_id", orgId).maybeSingle(),
    db.from("invoices").select("id, number, issue_date, due_date, total, balance, status, pay_token, reference").eq("organisation_id", orgId).eq("customer_id", customerId).neq("status", "void").neq("status", "draft").order("due_date", { ascending: true, nullsFirst: false }).limit(300),
    db.from("payments").select("amount, paid_at, invoice:invoices!inner(number, customer_id)").eq("organisation_id", orgId).eq("invoice.customer_id", customerId).gte("paid_at", since).order("paid_at", { ascending: false }).limit(100),
    db.from("integrations").select("status").eq("organisation_id", orgId).eq("provider", "stripe").maybeSingle(),
  ]);
  if (!org || org.status !== "active" || !cust) return null;
  type Inv = { id: string; number: string; issue_date: string | null; due_date: string | null; total: number; balance: number; status: string; pay_token: string | null; reference: string | null };
  const all = (inv ?? []) as Inv[];
  const owing = all.filter((i) => OWING.includes(i.status) && Number(i.balance) > 0).map((i) => ({ ...i, total: Number(i.total), balance: Number(i.balance) }));
  const paid = all.filter((i) => i.status === "paid" && (i.issue_date ?? "") >= since).sort((a, b) => (b.issue_date ?? "").localeCompare(a.issue_date ?? "")).slice(0, 40)
    .map((i) => ({ number: i.number, issue_date: i.issue_date, total: Number(i.total), pay_token: i.pay_token }));
  let plan: StatementData["plan"] = null;
  const { data: pl, error: plErr } = await db.from("payment_plans").select("id, frequency").eq("organisation_id", orgId).eq("customer_id", customerId).eq("status", "active").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!plErr && pl) {
    const { data: ins } = await db.from("payment_plan_instalments").select("n, due_date, amount, status").eq("plan_id", pl.id).order("n");
    plan = { frequency: pl.frequency as string, instalments: ((ins ?? []) as { n: number; due_date: string; amount: number; status: string }[]).map((x) => ({ ...x, amount: Number(x.amount) })) };
  }
  return {
    org: { name: org.name as string, logo_url: org.logo_url as string | null, brand_colour: org.brand_colour as string | null, contact_email: org.contact_email as string | null, contact_phone: org.contact_phone as string | null, currency: (org.currency as string) || "AUD", slug: org.slug as string, timezone: (org.timezone as string) || "Australia/Sydney" },
    customer: { name: cust.name as string, email: (cust.email as string | null) ?? null },
    owing, paid,
    payments: ((pays ?? []) as unknown as { amount: number; paid_at: string; invoice: { number: string } | null }[]).map((p) => ({ amount: Number(p.amount), paid_at: p.paid_at, number: p.invoice?.number ?? null })),
    plan, stripe: (integ as { status?: string } | null)?.status === "connected",
    plansReady: !plErr, payIn4: readPayIn4(org.settings),
  };
}

/** The statement was opened: mark the email opened and clicked, and note it on the account (at most once an hour). */
export async function recordStatementView(db: SupabaseClient, orgId: string, customerId: string, emailId: string | null) {
  const now = new Date();
  if (emailId) {
    const { data: e } = await db.from("collection_emails").select("id, customer_id, opened_at, open_count, clicked_at, click_count").eq("id", emailId).maybeSingle();
    if (e && e.customer_id === customerId) await db.from("collection_emails").update({
      opened_at: e.opened_at ?? now.toISOString(), open_count: Math.max(1, Number(e.open_count ?? 0)), clicked_at: e.clicked_at ?? now.toISOString(), click_count: Number(e.click_count ?? 0) + 1,
    }).eq("id", emailId);
  }
  const hourAgo = new Date(now.getTime() - 3600_000).toISOString();
  const { data: recent } = await db.from("collection_notes").select("id").eq("organisation_id", orgId).eq("customer_id", customerId).eq("body", "Opened their account statement").gte("created_at", hourAgo).limit(1);
  if (!recent?.length) await db.from("collection_notes").insert({ organisation_id: orgId, customer_id: customerId, kind: "note", body: "Opened their account statement", created_by: null });
}
