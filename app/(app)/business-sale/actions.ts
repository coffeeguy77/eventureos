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

export interface StaffInput { role: string; headcount: number | string; pay_type: "annual" | "hourly"; annual?: number | string | null; hourly?: number | string | null; hours_per_shift?: number | string | null; shifts_per_week?: number | string | null; weeks_per_year?: number | string | null; super_pct?: number | string | null; notes?: string | null; source?: "manual" | "xero"; xero_employee_id?: string | null; share_pct?: number | string | null }

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
        ...(s.source === "xero" && txt(s.xero_employee_id, 64) ? { source: "xero", xero_employee_id: txt(s.xero_employee_id, 64), share_pct: s.share_pct === undefined || s.share_pct === null || s.share_pct === "" ? 100 : num(s.share_pct, 100) } : {}),
      };
    });
    // people from Xero Payroll need database update 0113 — check before replacing anything
    if (rows.some((r) => "source" in r)) {
      const { error: colErr } = await supabase.from("sale_staff").select("source, xero_employee_id, share_pct").limit(1);
      if (colErr) throw new Error("Run the database update 0113_sale_payroll_requests.sql first to add people from Xero Payroll.");
      for (const r of rows) if (!("source" in r)) Object.assign(r, { source: "manual", xero_employee_id: null, share_pct: 100 });
    }
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

/** Save the whole 360° walkthrough (rooms, arrows, sound clips) from the tour builder. */
export async function saveTour(listingId: string, spaces: unknown): Promise<R<undefined>> {
  return run(async () => {
    const { supabase, org, listing } = await ownListing(listingId);
    if (!Array.isArray(spaces)) throw new Error("Nothing to save.");
    const url = (v: unknown) => { const s = txt(v, 1000); return /^https:\/\//.test(s) ? s : undefined; };
    const deg = (v: unknown) => (v === undefined || v === null || v === "" || !Number.isFinite(Number(v)) ? undefined : ((Math.round(Number(v)) % 360) + 360) % 360);
    const unit = (v: unknown) => Math.min(1, Math.max(0, Number(v) || 0));
    const list = (spaces as Record<string, unknown>[]).slice(0, 120);
    const ids = new Set(list.map((s) => txt(s.id, 80)));
    let start = false;
    const tour = list.map((s) => {
      const isStart = !start && !!s.isStartScene;
      if (isStart) start = true;
      const pins = (Array.isArray(s.pins) ? (s.pins as Record<string, unknown>[]) : []).slice(0, 80).map((p) => {
        const pos = (p.position ?? {}) as { x?: unknown; y?: unknown };
        const type = p.type === "audio" ? "audio" : "navigation";
        const target = txt(p.targetSpaceId, 80);
        return {
          id: txt(p.id, 80) || `pin-${Math.random().toString(36).slice(2, 10)}`, type, title: txt(p.title, 120), description: txt(p.description, 1000),
          position: { x: unit(pos.x), y: unit(pos.y) },
          ...(type === "navigation" && target && ids.has(target) ? { targetSpaceId: target } : {}),
          ...(type === "navigation" && deg(p.targetYaw) !== undefined ? { targetYaw: deg(p.targetYaw) } : {}),
          ...(type === "audio" && url(p.audioUrl) ? { audioUrl: url(p.audioUrl), audioName: txt(p.audioName, 120) || txt(p.title, 120) } : {}),
          ...(p.heightMetres !== undefined && Number.isFinite(Number(p.heightMetres)) ? { heightMetres: Number(p.heightMetres) } : {}),
          requiresNDA: !!p.requiresNDA,
        };
      });
      return {
        id: txt(s.id, 80), name: txt(s.name, 120) || "Room", panoramaUrl: url(s.panoramaUrl) ?? "", isStartScene: isStart,
        ...(deg(s.defaultYaw) !== undefined ? { defaultYaw: deg(s.defaultYaw) } : {}),
        panoramaStartYaw: deg(s.panoramaStartYaw) ?? 0,
        ...(s.groundPitch !== undefined && Number.isFinite(Number(s.groundPitch)) ? { groundPitch: Number(s.groundPitch) } : {}),
        autoPan: !!s.autoPan, ...(s.enabled === false ? { enabled: false } : {}),
        ...(url(s.audioUrl) ? { audioUrl: url(s.audioUrl), audioName: txt(s.audioName, 120) } : {}),
        pins,
      };
    }).filter((s) => s.id);
    if (!start && tour[0]) tour[0].isStartScene = true;
    const { error } = await supabase.from("sale_listings").update({ tour, updated_at: new Date().toISOString() }).eq("id", listingId).eq("organisation_id", org.id);
    if (error) throw new Error(error.message);
    if (listing.unit_id) revalidatePath(`/business-sale/${listing.unit_id}`);
    return undefined;
  });
}

export interface SectionInput { id?: string; key?: string; title: string; subtitle?: string | null; body?: string | null; bullets?: string[]; visibility: "public" | "buyers" | "hidden" }

/** Save one report section (new when it has no id). */
export async function saveSection(listingId: string, s: SectionInput): Promise<R<{ id: string }>> {
  return run(async () => {
    const { supabase, org, listing } = await ownListing(listingId);
    const title = txt(s.title, 160);
    if (!title) throw new Error("Give the section a title.");
    const row = {
      title, subtitle: txt(s.subtitle, 300) || null, body: txt(s.body, 20000) || null,
      bullets: (Array.isArray(s.bullets) ? s.bullets : []).map((b) => txt(b, 500)).filter(Boolean).slice(0, 60),
      visibility: s.visibility === "public" || s.visibility === "hidden" ? s.visibility : "buyers", updated_at: new Date().toISOString(),
    };
    let id = s.id && UUID.test(s.id) ? s.id : null;
    if (id) {
      const { error } = await supabase.from("sale_report_sections").update(row).eq("id", id).eq("listing_id", listingId).eq("organisation_id", org.id);
      if (error) throw new Error(error.message);
    } else {
      const { data: last } = await supabase.from("sale_report_sections").select("position").eq("listing_id", listingId).order("position", { ascending: false }).limit(1).maybeSingle();
      const key = (txt(s.key, 60) || title.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "section") + "_" + Math.random().toString(36).slice(2, 6);
      const { data, error } = await supabase.from("sale_report_sections").insert({ ...row, organisation_id: org.id, listing_id: listingId, key, position: (Number(last?.position) || 0) + 1 }).select("id").single();
      if (error) throw new Error(/sale_report_sections/.test(error.message) ? "Run the database update 0112_sale_report_buyers.sql first." : error.message);
      id = data.id as string;
    }
    if (listing.unit_id) revalidatePath(`/business-sale/${listing.unit_id}`);
    return { id: id! };
  });
}

export async function deleteSection(listingId: string, id: string): Promise<R<undefined>> {
  return run(async () => {
    const { supabase, org, listing } = await ownListing(listingId);
    if (!UUID.test(id)) throw new Error("That section isn't valid.");
    const { error } = await supabase.from("sale_report_sections").delete().eq("id", id).eq("listing_id", listingId).eq("organisation_id", org.id);
    if (error) throw new Error(error.message);
    if (listing.unit_id) revalidatePath(`/business-sale/${listing.unit_id}`);
    return undefined;
  });
}

/** Move a section up or down. */
export async function moveSection(listingId: string, id: string, dir: -1 | 1): Promise<R<undefined>> {
  return run(async () => {
    const { supabase, org, listing } = await ownListing(listingId);
    const { data } = await supabase.from("sale_report_sections").select("id, position").eq("listing_id", listingId).eq("organisation_id", org.id).order("position");
    const rows = (data ?? []) as { id: string; position: number }[];
    const i = rows.findIndex((r) => r.id === id), j = i + dir;
    if (i < 0 || j < 0 || j >= rows.length) return undefined;
    [rows[i], rows[j]] = [rows[j], rows[i]];
    for (let k = 0; k < rows.length; k++) if (rows[k].position !== k + 1) await supabase.from("sale_report_sections").update({ position: k + 1 }).eq("id", rows[k].id);
    if (listing.unit_id) revalidatePath(`/business-sale/${listing.unit_id}`);
    return undefined;
  });
}

/** The listing's public page: its name, web address, public or private, NDA. */
export async function savePageSettings(listingId: string, i: { title: string; slug: string; is_public: boolean; nda_required: boolean; nda_text: string | null }): Promise<R<undefined>> {
  return run(async () => {
    const { supabase, org, listing } = await ownListing(listingId);
    const title = txt(i.title, 160);
    if (title.length < 2) throw new Error("Give the listing a name.");
    const slug = txt(i.slug, 80).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (slug.length < 3) throw new Error("The web address needs at least 3 letters or numbers, e.g. bean-culture-roastery.");
    const { error } = await supabase.from("sale_listings").update({ title, slug, is_public: !!i.is_public, nda_required: !!i.nda_required, nda_text: txt(i.nda_text, 8000) || null, updated_at: new Date().toISOString() }).eq("id", listingId).eq("organisation_id", org.id);
    if (error) throw new Error(/sale_listings_slug|duplicate/.test(error.message) ? "That web address is taken — try another." : /slug|is_public|nda_/.test(error.message) ? "Run the database update 0112_sale_report_buyers.sql first." : error.message);
    if (listing.unit_id) revalidatePath(`/business-sale/${listing.unit_id}`);
    return undefined;
  });
}

/** Give a buyer access: they get their own private link. */
export async function addBuyer(listingId: string, i: { name: string; email?: string; phone?: string; company?: string; notes?: string }): Promise<R<{ id: string }>> {
  return run(async () => {
    const { supabase, org, listing } = await ownListing(listingId);
    const name = txt(i.name, 120);
    if (name.length < 2) throw new Error("Add the buyer's name.");
    const email = txt(i.email, 200).toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("That email doesn't look right.");
    const { randomBytes } = await import("node:crypto");
    const token = randomBytes(24).toString("base64url");
    const { data, error } = await supabase.from("sale_buyers").insert({ organisation_id: org.id, listing_id: listingId, name, email: email || null, phone: txt(i.phone, 40) || null, company: txt(i.company, 160) || null, notes: txt(i.notes, 1000) || null, token }).select("id").single();
    if (error) throw new Error(/sale_buyers/.test(error.message) ? "Run the database update 0112_sale_report_buyers.sql first." : error.message);
    if (listing.unit_id) revalidatePath(`/business-sale/${listing.unit_id}`);
    return { id: data.id as string };
  });
}

/** Approve, turn off (revoke) or turn back on a buyer's link. */
export async function setBuyerStatus(listingId: string, buyerId: string, status: "approved" | "revoked" | "restore" | "invite"): Promise<R<undefined>> {
  return run(async () => {
    const { supabase, org, listing } = await ownListing(listingId);
    if (!UUID.test(buyerId)) throw new Error("That buyer isn't valid.");
    const { data: b } = await supabase.from("sale_buyers").select("nda_signed_at").eq("id", buyerId).eq("listing_id", listingId).maybeSingle();
    if (!b) throw new Error("That buyer doesn't exist.");
    const next = status === "restore" || status === "invite" ? (b.nda_signed_at ? "nda_signed" : "invited") : status;
    const { error } = await supabase.from("sale_buyers").update({ status: next }).eq("id", buyerId).eq("listing_id", listingId).eq("organisation_id", org.id);
    if (error) throw new Error(error.message);
    if (listing.unit_id) revalidatePath(`/business-sale/${listing.unit_id}`);
    return undefined;
  });
}

/** Start a listing (buyer page, tour, report, buyers) for a business or division that doesn't have one. */
export async function createListing(unitId: string): Promise<R<{ id: string }>> {
  return run(async () => {
    const { supabase, org } = await ownUnit(unitId);
    const { data: u } = await supabase.from("sale_units").select("name").eq("id", unitId).single();
    const title = (u?.name as string) || "Business for sale";
    const base = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "for-sale";
    const { data, error } = await supabase.from("sale_listings").insert({ organisation_id: org.id, unit_id: unitId, title, slug: `${base}-${Math.random().toString(36).slice(2, 6)}`, status: "draft" }).select("id").single();
    if (error) throw new Error(/slug/.test(error.message) ? "Run the database update 0112_sale_report_buyers.sql first." : error.message);
    revalidatePath(`/business-sale/${unitId}`);
    return { id: data.id as string };
  });
}

/** Save how the sales page reads (coffee categories, public numbers, headline, terms of sale, valuation). */
export async function savePageContent(listingId: string, page: unknown): Promise<R<undefined>> {
  return run(async () => {
    const { supabase, org, listing } = await ownListing(listingId);
    const { readPage } = await import("@/lib/sales/page-settings");
    const p = readPage({ page });
    const clean = {
      ...p,
      coffee_categories: p.coffee_categories ? [...new Set(p.coffee_categories.map((c) => txt(c, 120)).filter(Boolean))].slice(0, 100) : null,
      headline: txt(p.headline, 300),
      terms: p.terms.slice(0, 30).map((t) => ({ ...t, id: txt(t.id, 40) || Math.random().toString(36).slice(2, 10), title: txt(t.title, 160), text: txt(t.text, 4000), categories: t.categories.map((c) => txt(c, 120)).filter(Boolean).slice(0, 30) })).filter((t) => t.title || t.text),
      valuation: { ...p.valuation, multiple: Math.min(20, Math.max(0.1, p.valuation.multiple)), addbacks: p.valuation.addbacks.slice(0, 40).map((a) => ({ label: txt(a.label, 160), amount: Math.round(Math.max(-1e9, Math.min(1e9, a.amount))) })) },
    };
    const { data: cur } = await supabase.from("sale_listings").select("details").eq("id", listingId).single();
    const details = { ...((cur?.details as Record<string, unknown>) ?? {}), page: clean };
    const { error } = await supabase.from("sale_listings").update({ details, updated_at: new Date().toISOString() }).eq("id", listingId).eq("organisation_id", org.id);
    if (error) throw new Error(error.message);
    if (listing.unit_id) revalidatePath(`/business-sale/${listing.unit_id}`);
    return undefined;
  });
}

/** Bring in what Xero Payroll paid each person (call again while `partial`). */
export async function syncPayroll(): Promise<R<{ message: string; partial: boolean; done: number; total: number }>> {
  return run(async () => {
    const { supabase, org, user } = await managers();
    const { buildContext } = await import("@/lib/integrations/sync-runner");
    const ctx = await buildContext(supabase, "user", org.id, "xero", user.id);
    const { syncPayrollHistory } = await import("@/lib/sales/payroll-sync");
    const r = await syncPayrollHistory(ctx);
    revalidatePath("/business-sale", "layout");
    return r;
  });
}
