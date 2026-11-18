"use server";

import { revalidatePath } from "next/cache";
import { canManage, requireOrg } from "@/lib/context";

type R<T> = { ok: true; data: T } | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const run = async <T,>(fn: () => Promise<T>): Promise<R<T>> => {
  try { return { ok: true, data: await fn() }; } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." }; }
};
const num = (v: unknown, max = 1e9) => { const n = Number(String(v ?? "").replace(/[^\d.-]/g, "")); return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0; };
const numOrNull = (v: unknown, max = 1e9) => (v === null || v === undefined || String(v).trim() === "" ? null : num(v, max));
const txt = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

async function managers() {
  const ctx = await requireOrg();
  if (!canManage(ctx.role)) throw new Error("Only owners, admins and managers can work on Business Sales.");
  return ctx;
}
async function ownUnit(id: string) {
  const ctx = await managers();
  if (!UUID.test(id)) throw new Error("That link isn't valid.");
  const { data, error } = await ctx.supabase.from("sale_units").select("id, name").eq("id", id).eq("organisation_id", ctx.org.id).maybeSingle();
  if (error) throw new Error(/sale_units/.test(error.message) ? "Run the database update 0110_business_sales.sql first." : error.message);
  if (!data) throw new Error("That business doesn't exist, or you can't see it.");
  return ctx;
}

export async function createUnit(i: { name: string; kind: "business" | "division"; parent_id?: string | null }): Promise<R<{ id: string }>> {
  return run(async () => {
    const { supabase, org } = await managers();
    const name = txt(i.name, 120);
    if (name.length < 2) throw new Error("Give it a name, e.g. \"Tulip Tops café\".");
    const { data: locs } = await supabase.from("sale_square_locations").select("location_id").eq("organisation_id", org.id);
    const { data, error } = await supabase.from("sale_units").insert({
      organisation_id: org.id, name, kind: i.kind === "division" ? "division" : "business",
      parent_id: i.parent_id && UUID.test(i.parent_id) ? i.parent_id : null,
      // a whole business starts with every Square location; a division chooses its own
      square_location_ids: i.kind === "division" ? [] : (locs ?? []).map((l) => l.location_id as string),
    }).select("id").single();
    if (error) throw new Error(error.message);
    revalidatePath("/business-sale");
    return { id: data.id as string };
  });
}

export async function updateUnit(id: string, i: { name?: string; kind?: "business" | "division"; square_location_ids?: string[]; exclude_categories?: string[]; super_pct?: number; months?: number; notes?: string | null }): Promise<R<undefined>> {
  return run(async () => {
    const { supabase, org } = await ownUnit(id);
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (i.name !== undefined) { const n = txt(i.name, 120); if (n.length < 2) throw new Error("Give it a name."); patch.name = n; }
    if (i.kind) patch.kind = i.kind === "division" ? "division" : "business";
    if (Array.isArray(i.square_location_ids)) patch.square_location_ids = i.square_location_ids.map((x) => txt(x, 64)).filter(Boolean).slice(0, 50);
    if (Array.isArray(i.exclude_categories)) patch.exclude_categories = [...new Set(i.exclude_categories.map((x) => txt(x, 120)).filter(Boolean))].slice(0, 200);
    if (i.super_pct !== undefined) patch.super_pct = num(i.super_pct, 50);
    if (i.months !== undefined) patch.months = Math.min(36, Math.max(1, Math.round(num(i.months, 36)) || 12));
    if (i.notes !== undefined) patch.notes = txt(i.notes, 4000) || null;
    const { error } = await supabase.from("sale_units").update(patch).eq("id", id).eq("organisation_id", org.id);
    if (error) throw new Error(error.message);
    revalidatePath(`/business-sale/${id}`);
    return undefined;
  });
}

export async function deleteUnit(id: string): Promise<R<undefined>> {
  return run(async () => {
    const { supabase, org } = await ownUnit(id);
    const { error } = await supabase.from("sale_units").delete().eq("id", id).eq("organisation_id", org.id);
    if (error) throw new Error(error.message);
    revalidatePath("/business-sale");
    return undefined;
  });
}

export interface StaffInput { role: string; headcount: number | string; pay_type: "annual" | "hourly"; annual?: number | string | null; hourly?: number | string | null; hours_per_shift?: number | string | null; shifts_per_week?: number | string | null; weeks_per_year?: number | string | null; super_pct?: number | string | null; notes?: string | null }

/** Replace the unit's standard crew with this list. */
export async function saveStaff(unitId: string, list: StaffInput[]): Promise<R<undefined>> {
  return run(async () => {
    const { supabase, org } = await ownUnit(unitId);
    const rows = (Array.isArray(list) ? list : []).slice(0, 60).map((s, position) => {
      const role = txt(s.role, 80);
      if (!role) throw new Error("Every crew line needs a role, e.g. Chef or Barista.");
      const hourly = s.pay_type !== "annual";
      return {
        organisation_id: org.id, unit_id: unitId, role, position,
        headcount: num(s.headcount, 500) || 1, pay_type: hourly ? "hourly" : "annual",
        annual: hourly ? null : numOrNull(s.annual, 10_000_000), hourly: hourly ? numOrNull(s.hourly, 1000) : null,
        hours_per_shift: hourly ? numOrNull(s.hours_per_shift, 24) : null, shifts_per_week: hourly ? numOrNull(s.shifts_per_week, 21) : null,
        weeks_per_year: hourly ? (numOrNull(s.weeks_per_year, 53) ?? 52) : 52, super_pct: numOrNull(s.super_pct, 50), notes: txt(s.notes, 300) || null,
      };
    });
    const { error: dErr } = await supabase.from("sale_staff").delete().eq("unit_id", unitId).eq("organisation_id", org.id);
    if (dErr) throw new Error(dErr.message);
    if (rows.length) { const { error } = await supabase.from("sale_staff").insert(rows); if (error) throw new Error(error.message); }
    revalidatePath(`/business-sale/${unitId}`);
    return undefined;
  });
}

export interface ExpenseInput { kind: "cogs" | "overhead"; source: "xero" | "manual"; xero_contact_id?: string | null; name: string; share_pct?: number | string; annual?: number | string | null; notes?: string | null }

/** Replace the unit's expense lines with this list. */
export async function saveExpenses(unitId: string, list: ExpenseInput[]): Promise<R<undefined>> {
  return run(async () => {
    const { supabase, org } = await ownUnit(unitId);
    const rows = (Array.isArray(list) ? list : []).slice(0, 300).map((e, position) => {
      const name = txt(e.name, 160);
      if (!name) throw new Error("Every expense needs a name.");
      const xero = e.source === "xero" && !!txt(e.xero_contact_id, 64);
      return {
        organisation_id: org.id, unit_id: unitId, position, name, kind: e.kind === "cogs" ? "cogs" : "overhead",
        source: xero ? "xero" : "manual", xero_contact_id: xero ? txt(e.xero_contact_id, 64) : null,
        share_pct: e.share_pct === undefined || e.share_pct === "" ? 100 : num(e.share_pct, 100),
        annual: xero ? null : numOrNull(e.annual, 100_000_000), notes: txt(e.notes, 300) || null,
      };
    });
    const { error: dErr } = await supabase.from("sale_expenses").delete().eq("unit_id", unitId).eq("organisation_id", org.id);
    if (dErr) throw new Error(dErr.message);
    if (rows.length) { const { error } = await supabase.from("sale_expenses").insert(rows); if (error) throw new Error(error.message); }
    revalidatePath(`/business-sale/${unitId}`);
    return undefined;
  });
}

/** Bring in Square sales (carries on from where the last run stopped; call again while `partial`). */
export async function syncSquare(full = false): Promise<R<{ message: string; partial: boolean; done: number; total: number }>> {
  return run(async () => {
    const { supabase, org, user } = await managers();
    const { buildContext } = await import("@/lib/integrations/sync-runner");
    const ctx = await buildContext(supabase, "user", org.id, "square", user.id);
    const { syncSquareSales } = await import("@/lib/sales/square-sync");
    const r = await syncSquareSales(ctx, { full });
    await supabase.from("integrations").update({ status: "connected", last_sync_at: new Date().toISOString(), last_sync_status: r.partial ? "partial" : "success", last_error: null }).eq("id", ctx.integration.id);
    revalidatePath("/business-sale", "layout");
    return { message: r.message, partial: !!r.partial, done: r.done ?? 0, total: r.total ?? 0 };
  });
}

/** Refresh what each Xero supplier was paid per month. */
export async function syncSupplierSpend(): Promise<R<{ message: string }>> {
  return run(async () => {
    const { supabase, org, user } = await managers();
    const { buildContext } = await import("@/lib/integrations/sync-runner");
    const ctx = await buildContext(supabase, "user", org.id, "xero", user.id);
    const { syncXeroSpend } = await import("@/lib/sales/xero-spend");
    const r = await syncXeroSpend(ctx);
    revalidatePath("/business-sale", "layout");
    return { message: `Supplier spend updated: ${r.suppliers} suppliers over the last ${r.months} months.` };
  });
}

async function ownListing(id: string) {
  const ctx = await managers();
  if (!UUID.test(id)) throw new Error("That link isn't valid.");
  const { data, error } = await ctx.supabase.from("sale_listings").select("id, unit_id, tour").eq("id", id).eq("organisation_id", ctx.org.id).maybeSingle();
  if (error) throw new Error(/sale_listings/.test(error.message) ? "Run the database update 0111_sale_listing_tour.sql first." : error.message);
  if (!data) throw new Error("That listing doesn't exist, or you can't see it.");
  return { ...ctx, listing: data as { id: string; unit_id: string | null; tour: { id: string; enabled?: boolean }[] } };
}

/** Show or hide rooms of the 360° walkthrough (hidden rooms stay, buyers just don't see them). */
export async function saveTourScenesShown(listingId: string, shown: Record<string, boolean>): Promise<R<undefined>> {
  return run(async () => {
    const { supabase, org, listing } = await ownListing(listingId);
    const tour = (Array.isArray(listing.tour) ? listing.tour : []).map((s) => (s.id in shown ? { ...s, enabled: !!shown[s.id] } : s));
    const { error } = await supabase.from("sale_listings").update({ tour, updated_at: new Date().toISOString() }).eq("id", listingId).eq("organisation_id", org.id);
    if (error) throw new Error(error.message);
    if (listing.unit_id) revalidatePath(`/business-sale/${listing.unit_id}`);
    return undefined;
  });
}

/** Which equipment is included in the sale. */
export async function saveEquipmentIncluded(listingId: string, included: Record<string, boolean>): Promise<R<undefined>> {
  return run(async () => {
    const { supabase, org, listing } = await ownListing(listingId);
    const ids = Object.keys(included).filter((k) => UUID.test(k)).slice(0, 2000);
    const on = ids.filter((k) => included[k]), off = ids.filter((k) => !included[k]);
    for (const [list, v] of [[on, true], [off, false]] as const) {
      if (!list.length) continue;
      const { error } = await supabase.from("sale_equipment").update({ included: v }).eq("listing_id", listingId).eq("organisation_id", org.id).in("id", list);
      if (error) throw new Error(error.message);
    }
    if (listing.unit_id) revalidatePath(`/business-sale/${listing.unit_id}`);
    return undefined;
  });
}
