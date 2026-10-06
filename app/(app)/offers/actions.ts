"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/context";
import { normOffer, type OfferPlace } from "@/lib/offers/core";

export type Result<T = string> = { ok: true; data: T } | { ok: false; error: string };

export interface OfferInput {
  id?: string | null; code: string; headline: string; description: string;
  kind: "percent" | "fixed" | "free_shipping"; value: number;
  works_on: OfferPlace[]; course_ids: string[];
  /** Coffee shop only */ applies_to: "all" | "one_off" | "subscription"; product_ids: string[]; subscription_cycles: number | null;
  min_spend: number | null; first_order_only: boolean; max_uses: number | null; per_customer: number | null;
  starts_on: string | null; ends_on: string | null; active: boolean; ribbon: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NEEDS_UPDATE = "Run the offers database update (0056_offers.sql) first — then codes can work on classes and gift certificates.";

async function manager() {
  const ctx = await requireOrg();
  if (!["owner", "admin", "manager"].includes(ctx.role)) throw new Error("Only owners, admins and managers can change offers.");
  return ctx;
}
const run = async <T,>(fn: () => Promise<T>): Promise<Result<T>> => { try { return { ok: true, data: await fn() }; } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; } };

export async function saveOffer(c: OfferInput): Promise<Result> {
  return run(async () => {
    const { supabase, org } = await manager();
    const code = normOffer(c.code);
    if (code.length < 2) throw new Error("Enter a code (letters and numbers).");
    const where = [...new Set(c.works_on)].filter((w) => w === "shop" || w === "classes" || w === "gifts");
    if (!where.length) throw new Error("Tick where the code works.");
    if (c.kind === "percent" && (c.value <= 0 || c.value > 100)) throw new Error("Percent off must be between 1 and 100.");
    if (c.kind === "fixed" && c.value <= 0) throw new Error("Enter the dollars off.");
    if (c.kind === "free_shipping" && !where.includes("shop")) throw new Error("Free shipping only works in the coffee shop.");
    const date = (d: string | null) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
    if (date(c.starts_on) && date(c.ends_on) && c.ends_on! < c.starts_on!) throw new Error("The end date is before the start date.");
    const pos = (n: number | null) => (n && n > 0 ? Math.round(n) : null);
    const row = {
      organisation_id: org.id, code, description: c.description.trim().slice(0, 200) || null, headline: c.headline.trim().slice(0, 80) || null,
      kind: c.kind, value: c.kind === "free_shipping" ? 0 : Math.round(c.value * 100) / 100,
      works_on: where, course_ids: where.some((w) => w !== "shop") ? c.course_ids.filter((x) => UUID.test(x)) : [],
      applies_to: c.applies_to, product_ids: c.product_ids.filter((x) => UUID.test(x)), subscription_cycles: pos(c.subscription_cycles),
      min_spend: c.min_spend && c.min_spend > 0 ? c.min_spend : null, first_order_only: c.first_order_only,
      max_uses: pos(c.max_uses), per_customer: pos(c.per_customer), starts_on: date(c.starts_on), ends_on: date(c.ends_on), active: c.active, ribbon: c.ribbon,
    };
    const { error } = c.id && UUID.test(c.id)
      ? await supabase.from("shop_coupons").update(row).eq("organisation_id", org.id).eq("id", c.id)
      : await supabase.from("shop_coupons").insert(row);
    if (error) {
      if (/works_on|course_ids|headline|ribbon/.test(error.message)) throw new Error(NEEDS_UPDATE);
      throw new Error(/duplicate|unique/.test(error.message) ? "That code already exists." : error.message);
    }
    revalidatePath("/offers");
    return `${code} saved.`;
  });
}

/** Quick switches on the list: on/off, and the website ribbon. */
export async function toggleOffer(id: string, field: "active" | "ribbon", value: boolean): Promise<Result> {
  return run(async () => {
    const { supabase, org } = await manager();
    if (!UUID.test(id)) throw new Error("Not found.");
    const { error } = await supabase.from("shop_coupons").update({ [field]: value }).eq("organisation_id", org.id).eq("id", id);
    if (error) throw new Error(/ribbon/.test(error.message) ? NEEDS_UPDATE : error.message);
    revalidatePath("/offers");
    return field === "ribbon" ? (value ? "Showing on your website." : "Taken off your website.") : value ? "Turned on." : "Turned off.";
  });
}
