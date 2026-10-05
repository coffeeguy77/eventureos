"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/context";
import { createServiceClient } from "@/lib/integrations/runtime";
import { changeSubscription, isUuid, normCoupon, shopOrgById } from "@/lib/shop/server";
import { gramsOf, readShop, slugify, type ShopSettings } from "@/lib/shop/core";
import type { SubChange } from "@/app/shop/actions";

export type Result<T = string> = { ok: true; data: T } | { ok: false; error: string };
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
async function manager() {
  const ctx = await requireOrg();
  if (!["owner", "admin", "manager"].includes(ctx.role)) throw new Error("Only owners, admins and managers can do that.");
  return ctx;
}
async function staffer() {
  const ctx = await requireOrg();
  if (ctx.role === "staff" || ctx.role === "customer") throw new Error("Not allowed.");
  return ctx;
}
async function run<T>(fn: () => Promise<T>): Promise<Result<T>> { try { return { ok: true, data: await fn() }; } catch (e) { return { ok: false, error: msg(e) }; } }
const who = async () => { const ctx = await requireOrg(); return ctx.profile?.full_name ?? ctx.user.email ?? "Office"; };

/* ------------------------------------------------------------------ orders */

const STATUSES = ["pending", "paid", "roasting", "packed", "shipped", "completed", "cancelled", "refunded", "failed", "on_hold"];

export async function setOrderStatus(ids: string[], status: string): Promise<Result<number>> {
  return run(async () => {
    const { supabase, org } = await staffer();
    if (!STATUSES.includes(status)) throw new Error("Unknown status");
    const clean = ids.filter(isUuid).slice(0, 500);
    if (!clean.length) return 0;
    const patch: Record<string, unknown> = { status };
    if (status === "shipped") patch.shipped_at = new Date().toISOString();
    const { data, error } = await supabase.from("shop_orders").update(patch).eq("organisation_id", org.id).in("id", clean).neq("source", "woocommerce").select("id");
    if (error) throw new Error(error.message);
    revalidatePath("/store");
    return data?.length ?? 0;
  });
}

export async function saveOrderDetails(id: string, d: { tracking: string; note: string; dispatchOn: string | null }): Promise<Result> {
  return run(async () => {
    const { supabase, org } = await staffer();
    if (!isUuid(id)) throw new Error("Not found");
    const { error } = await supabase.from("shop_orders").update({
      tracking_number: d.tracking.trim().slice(0, 60) || null, office_note: d.note.trim().slice(0, 2000) || null,
      dispatch_on: d.dispatchOn && /^\d{4}-\d{2}-\d{2}$/.test(d.dispatchOn) ? d.dispatchOn : null,
    }).eq("organisation_id", org.id).eq("id", id);
    if (error) throw new Error(error.message);
    revalidatePath("/store");
    return "Saved.";
  });
}

/* ------------------------------------------------------------------ subscriptions */

export async function officeSubAction(subId: string, change: SubChange): Promise<Result> {
  return run(async () => {
    const { org } = await staffer();
    if (!isUuid(subId)) throw new Error("Not found");
    const db = createServiceClient();
    const shop = await shopOrgById(db, org.id);
    const m = await changeSubscription(db, shop, subId, change, { office: await who() });
    revalidatePath("/store/subscriptions");
    return m;
  });
}

export async function saveSubNote(subId: string, notes: string): Promise<Result> {
  return run(async () => {
    const { supabase, org } = await staffer();
    const { error } = await supabase.from("shop_subscriptions").update({ notes: notes.slice(0, 2000) || null }).eq("organisation_id", org.id).eq("id", subId);
    if (error) throw new Error(error.message);
    return "Saved.";
  });
}

/* ------------------------------------------------------------------ products */

export interface ProductInput {
  id?: string | null; name: string; slug?: string; kind: "coffee" | "gift_card" | "other"; category: string; short: string; description: string;
  tasting_notes: string; origin: string; roast: string; best_for: string; image_url: string; grinds: string[]; subscribable: boolean; featured: boolean;
  status: "active" | "draft" | "archived"; position: number;
  variants: { id?: string | null; label: string; price: number; active: boolean }[];
}

export async function saveProduct(p: ProductInput): Promise<Result<string>> {
  return run(async () => {
    const { supabase, org } = await manager();
    const name = p.name.trim().slice(0, 120);
    if (!name) throw new Error("Give the product a name.");
    if (p.image_url && !/^https:\/\//.test(p.image_url)) throw new Error("The image must be an https:// link (or upload one).");
    const row = {
      organisation_id: org.id, name, slug: slugify(p.slug?.trim() || name), kind: p.kind, category: p.category.trim().slice(0, 60) || null,
      short: p.short.trim().slice(0, 400) || null, description: p.description.trim().slice(0, 8000) || null, tasting_notes: p.tasting_notes.trim().slice(0, 200) || null,
      origin: p.origin.trim().slice(0, 120) || null, roast: p.roast.trim().slice(0, 40) || null, best_for: p.best_for.trim().slice(0, 120) || null,
      image_url: p.image_url.trim() || null, grinds: p.grinds.map((g) => g.trim().slice(0, 40)).filter(Boolean).slice(0, 12),
      subscribable: p.kind === "coffee" && p.subscribable, featured: p.featured, status: p.status, position: Math.round(p.position) || 0,
    };
    const variants = p.variants.map((v, i) => ({ ...v, label: v.label.trim().slice(0, 60), price: Math.round(Number(v.price) * 100) / 100, position: i })).filter((v) => v.label);
    if (!variants.length) throw new Error("Add at least one size with a price.");
    if (variants.some((v) => !(v.price >= 0))) throw new Error("Check the prices.");
    let id = p.id && isUuid(p.id) ? p.id : null;
    if (id) {
      const { error } = await supabase.from("shop_products").update(row).eq("organisation_id", org.id).eq("id", id);
      if (error) throw new Error(/duplicate|unique/.test(error.message) ? "Another product already uses that web address." : error.message);
    } else {
      const { data, error } = await supabase.from("shop_products").insert(row).select("id").single();
      if (error) throw new Error(/duplicate|unique/.test(error.message) ? "Another product already uses that web address." : error.message);
      id = data.id as string;
    }
    // Sizes: update the ones kept, add new ones, switch off removed ones (old orders keep pointing at them)
    const { data: existing } = await supabase.from("shop_variants").select("id").eq("product_id", id);
    const keep = new Set(variants.filter((v) => v.id && isUuid(v.id)).map((v) => v.id!));
    for (const v of variants) {
      const vr = { organisation_id: org.id, product_id: id, label: v.label, grams: gramsOf(v.label), price: v.price, active: v.active, position: v.position };
      if (v.id && isUuid(v.id)) await supabase.from("shop_variants").update(vr).eq("id", v.id).eq("product_id", id);
      else await supabase.from("shop_variants").insert(vr);
    }
    for (const e of existing ?? []) if (!keep.has(e.id as string)) await supabase.from("shop_variants").update({ active: false }).eq("id", e.id);
    revalidatePath("/store/products");
    return id;
  });
}

/* ------------------------------------------------------------------ coupons & banners */

export interface CouponInput { id?: string | null; code: string; description: string; kind: "percent" | "fixed" | "free_shipping"; value: number; applies_to: "all" | "one_off" | "subscription"; product_ids: string[]; min_spend: number | null; first_order_only: boolean; subscription_cycles: number | null; max_uses: number | null; per_customer: number | null; starts_on: string | null; ends_on: string | null; active: boolean }

export async function saveCoupon(c: CouponInput): Promise<Result> {
  return run(async () => {
    const { supabase, org } = await manager();
    const code = normCoupon(c.code);
    if (code.length < 2) throw new Error("Enter a code (letters and numbers).");
    if (c.kind === "percent" && (c.value <= 0 || c.value > 100)) throw new Error("Percent off must be between 1 and 100.");
    if (c.kind === "fixed" && c.value <= 0) throw new Error("Enter the dollars off.");
    const date = (d: string | null) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
    const pos = (n: number | null) => (n && n > 0 ? Math.round(n) : null);
    const row = {
      organisation_id: org.id, code, description: c.description.trim().slice(0, 200) || null, kind: c.kind, value: c.kind === "free_shipping" ? 0 : c.value,
      applies_to: c.applies_to, product_ids: c.product_ids.filter(isUuid), min_spend: c.min_spend && c.min_spend > 0 ? c.min_spend : null, first_order_only: c.first_order_only,
      subscription_cycles: pos(c.subscription_cycles), max_uses: pos(c.max_uses), per_customer: pos(c.per_customer), starts_on: date(c.starts_on), ends_on: date(c.ends_on), active: c.active,
    };
    const { error } = c.id && isUuid(c.id) ? await supabase.from("shop_coupons").update(row).eq("organisation_id", org.id).eq("id", c.id) : await supabase.from("shop_coupons").insert(row);
    if (error) throw new Error(/duplicate|unique/.test(error.message) ? "That code already exists." : error.message);
    revalidatePath("/store/coupons");
    return `${code} saved.`;
  });
}

export interface BannerInput { id?: string | null; title: string; body: string; cta_label: string; product_id: string | null; link_url: string; coupon_code: string; image_url: string; tone: "brand" | "dark" | "light"; placement: "shop" | "top" | "course" | "everywhere"; starts_on: string | null; ends_on: string | null; active: boolean; position: number }

export async function saveBanner(b: BannerInput): Promise<Result> {
  return run(async () => {
    const { supabase, org } = await manager();
    if (!b.title.trim()) throw new Error("Give the banner a heading.");
    if (b.link_url && !/^(https:\/\/|\/)/.test(b.link_url)) throw new Error("Links must start with https:// or /");
    if (b.image_url && !/^https:\/\//.test(b.image_url)) throw new Error("The picture must be an https:// link.");
    const date = (d: string | null) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
    const row = {
      organisation_id: org.id, title: b.title.trim().slice(0, 120), body: b.body.trim().slice(0, 300) || null, cta_label: b.cta_label.trim().slice(0, 40) || null,
      product_id: b.product_id && isUuid(b.product_id) ? b.product_id : null, link_url: b.link_url.trim() || null, coupon_code: normCoupon(b.coupon_code) || null,
      image_url: b.image_url.trim() || null, tone: b.tone, placement: b.placement, starts_on: date(b.starts_on), ends_on: date(b.ends_on), active: b.active, position: Math.round(b.position) || 0,
    };
    const { error } = b.id && isUuid(b.id) ? await supabase.from("shop_banners").update(row).eq("organisation_id", org.id).eq("id", b.id) : await supabase.from("shop_banners").insert(row);
    if (error) throw new Error(error.message);
    revalidatePath("/store/banners");
    return "Banner saved.";
  });
}

export async function deleteBanner(id: string): Promise<Result> {
  return run(async () => {
    const { supabase, org } = await manager();
    const { error } = await supabase.from("shop_banners").delete().eq("organisation_id", org.id).eq("id", id);
    if (error) throw new Error(error.message);
    revalidatePath("/store/banners");
    return "Deleted.";
  });
}

/* ------------------------------------------------------------------ settings */

export async function saveShopSettings(patch: Partial<ShopSettings>): Promise<Result> {
  return run(async () => {
    const { supabase, org } = await manager();
    const { data } = await supabase.from("organisations").select("settings").eq("id", org.id).single();
    const settings = (data?.settings ?? {}) as Record<string, unknown>;
    const current = readShop(settings);
    const next = readShop({ shop: { ...current, ...patch } }); // validates everything
    const { error } = await supabase.from("organisations").update({ settings: { ...settings, shop: next } }).eq("id", org.id);
    if (error) throw new Error(error.message);
    revalidatePath("/store");
    return "Saved.";
  });
}

/* ------------------------------------------------------------------ gift cards */

export async function voidShopGift(id: string): Promise<Result> {
  return run(async () => {
    const { supabase, org } = await manager();
    const { error } = await supabase.from("shop_gift_cards").update({ status: "void" }).eq("organisation_id", org.id).eq("id", id);
    if (error) throw new Error(error.message);
    revalidatePath("/store/gift-cards");
    return "Voided.";
  });
}
