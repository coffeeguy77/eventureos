import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Pickup passes: the customer's QR opens /order/pickup/<view_token>. Anyone with it sees the verified order (no sign-in);
 * a signed-in team member of that business can also mark it collected.
 */
export const PASS_TOKEN = /^[0-9a-f]{48}$/;

export interface PassOrder {
  id: string; organisation_id: string; number: string; status: string; fulfilment: string; order_date: string; delivery_date: string | null;
  total: number; payment_mode: string | null; payment_status: string; paid_at: string | null; collected_at: string | null; collected_by: string | null;
  customer_note: string | null; view_token: string;
  customer: { name: string; contact_name: string | null; phone: string | null } | null;
  lines: { name: string; quantity: number; position: number }[];
}

export async function passOrder(db: SupabaseClient, token: string): Promise<PassOrder | null> {
  if (!PASS_TOKEN.test(token)) return null;
  const { data, error } = await db.from("wholesale_orders")
    .select("id, organisation_id, number, status, fulfilment, order_date, delivery_date, total, payment_mode, payment_status, paid_at, collected_at, collected_by, customer_note, view_token, customer:wholesale_customers(name, contact_name, phone), lines:wholesale_order_lines(name, quantity, position)")
    .eq("view_token", token).maybeSingle();
  if (error || !data) return null; // includes "pickup isn't set up yet" (migration 0097)
  const o = data as unknown as PassOrder;
  if (o.fulfilment !== "pickup") return null;
  o.lines = [...(o.lines ?? [])].sort((a, b) => a.position - b.position);
  return o;
}

/** The signed-in person, if they're on this business's team (not a portal customer). */
export async function teamViewer(db: SupabaseClient, orgId: string): Promise<{ userId: string; name: string } | null> {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return null;
  const { data: m } = await db.from("organisation_users").select("role, status").eq("organisation_id", orgId).eq("user_id", user.id).maybeSingle();
  if (!m || m.status !== "active" || m.role === "customer") return null;
  const { data: u } = await db.from("users").select("full_name, email").eq("id", user.id).maybeSingle();
  return { userId: user.id, name: ((u?.full_name as string | null) || (u?.email as string | null) || "Staff").slice(0, 120) };
}

/** Is this order good to hand over? */
export function passVerdict(o: Pick<PassOrder, "status" | "payment_mode" | "payment_status" | "collected_at">): { ok: boolean; tone: "green" | "amber" | "red"; title: string } {
  if (o.status === "cancelled") return { ok: false, tone: "red", title: "Cancelled — don't hand over" };
  if (o.collected_at || o.status === "delivered") return { ok: false, tone: "amber", title: "Already collected" };
  if (o.status === "pending" || (o.payment_mode === "card" && o.payment_status !== "paid")) return { ok: false, tone: "red", title: "Not paid — don't hand over" };
  return { ok: true, tone: "green", title: o.payment_status === "paid" ? "Verified order · Paid" : "Verified order · On account" };
}
