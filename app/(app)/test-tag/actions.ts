"use server";

import { revalidatePath } from "next/cache";
import { canManage, requireOrg } from "@/lib/context";
import { actorName, logActivity } from "@/lib/activity";
import { todayISO } from "@/lib/format";
import { addMonths, cleanCode, cleanPrefix, isDate, labelZpl, nextCode, readDate, readProfile, readResult, testZpl, type ImportKey } from "@/lib/testtag/core";
import { ASSET_COLS, labelFor, readTagSettings, type TagAsset } from "@/lib/testtag/server";

type R<T = null> = { ok: true; data: T } | { ok: false; error: string };
const UUID = /^[0-9a-f-]{36}$/i;
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const t = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const missing = (m: string) => (/tag_assets|tag_tests/.test(m) ? "Test & Tag needs the 0102 database update first (Supabase → SQL Editor)." : m);

async function staff() {
  const ctx = await requireOrg();
  return ctx;
}
const refresh = (assetId?: string) => { revalidatePath("/test-tag"); revalidatePath("/test-tag/assets"); if (assetId) revalidatePath(`/test-tag/assets/${assetId}`); };

export interface AssetInput {
  code: string; name: string; customer_id: string | null; category: string; make: string; model: string; serial: string; location: string;
  class: string; interval_months: number; notes: string;
}
function cleanAsset(i: AssetInput) {
  const name = t(i.name, 160);
  if (!name) throw new Error("What is it? (e.g. Coffee grinder, Extension lead 10 m)");
  const months = Math.round(Number(i.interval_months));
  if (!(months >= 1 && months <= 120)) throw new Error("Choose how often it's retested.");
  return {
    name, customer_id: i.customer_id && UUID.test(i.customer_id) ? i.customer_id : null, category: t(i.category, 80), make: t(i.make, 80), model: t(i.model, 80),
    serial: t(i.serial, 80), location: t(i.location, 160), class: ["I", "II", "cord", "rcd", "other"].includes(i.class) ? i.class : null, interval_months: months, notes: t(i.notes, 4000),
  };
}

async function newCode(supabase: Awaited<ReturnType<typeof staff>>["supabase"], orgId: string, prefix: string) {
  const p = cleanPrefix(prefix);
  const { data } = await supabase.from("tag_assets").select("code").eq("organisation_id", orgId).ilike("code", `${p}-%`).order("code", { ascending: false }).limit(50);
  return nextCode(p, ((data ?? []) as { code: string }[]).map((x) => x.code));
}

/** The next free asset code (for a new tag). */
export async function suggestCode(): Promise<R<string>> {
  try { const { supabase, org } = await staff(); return { ok: true, data: await newCode(supabase, org.id, readTagSettings(org.settings).prefix) }; }
  catch (e) { return fail(e); }
}

/** Find an asset by its tag code (typed or scanned). */
export async function findAsset(code: string): Promise<R<TagAsset | null>> {
  try {
    const { supabase, org } = await staff();
    const c = cleanCode(code);
    if (!c) return { ok: true, data: null };
    const { data, error } = await supabase.from("tag_assets").select(ASSET_COLS).eq("organisation_id", org.id).ilike("code", c).maybeSingle();
    if (error) throw new Error(missing(error.message));
    return { ok: true, data: (data as unknown as TagAsset) ?? null };
  } catch (e) { return fail(e); }
}

export async function saveAsset(id: string | null, i: AssetInput): Promise<R<string>> {
  try {
    const { supabase, org, user, profile } = await staff();
    const row = cleanAsset(i);
    if (id) {
      if (!UUID.test(id)) throw new Error("Refresh and try again.");
      const code = cleanCode(i.code);
      if (!code) throw new Error("The asset needs its tag code.");
      const { data: cur } = await supabase.from("tag_assets").select("last_tested, interval_months").eq("id", id).eq("organisation_id", org.id).maybeSingle();
      if (!cur) throw new Error("That asset isn't there any more.");
      const next_due = cur.last_tested && cur.interval_months !== row.interval_months ? addMonths(cur.last_tested as string, row.interval_months) : undefined;
      const { error } = await supabase.from("tag_assets").update({ ...row, code, ...(next_due ? { next_due } : {}), updated_at: new Date().toISOString() }).eq("id", id).eq("organisation_id", org.id);
      if (error) throw new Error(/unique|duplicate/.test(error.message) ? `Another asset already has tag ${code}.` : missing(error.message));
      refresh(id);
      return { ok: true, data: id };
    }
    const code = cleanCode(i.code) || await newCode(supabase, org.id, readTagSettings(org.settings).prefix);
    const { data, error } = await supabase.from("tag_assets").insert({ organisation_id: org.id, ...row, code, created_by: user.id }).select("id").single();
    if (error) throw new Error(/unique|duplicate/.test(error.message) ? `Another asset already has tag ${code}.` : missing(error.message));
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "tag.asset", entityType: "tag_asset", entityId: data.id as string, customerId: row.customer_id, summary: `${actorName(profile)} added ${row.name} (${code}) to Test & Tag` });
    refresh(data.id as string);
    return { ok: true, data: data.id as string };
  } catch (e) { return fail(e); }
}

export async function setAssetRetired(id: string, retired: boolean): Promise<R> {
  try {
    const { supabase, org } = await staff();
    if (!UUID.test(id)) throw new Error("Refresh and try again.");
    const { error } = await supabase.from("tag_assets").update({ status: retired ? "retired" : "active", updated_at: new Date().toISOString() }).eq("id", id).eq("organisation_id", org.id);
    if (error) throw new Error(error.message);
    refresh(id);
    return { ok: true, data: null };
  } catch (e) { return fail(e); }
}

export interface TestInput {
  assetId: string | null; asset?: AssetInput; tested_on: string; result: string; visual: string; earth_ohms: string; insulation_mohms: string;
  leakage_ma: string; polarity: string; rcd_ms: string; notes: string; tester_name: string;
}

/** Keep the asset's last result and next due date in step with its latest test. */
async function syncAsset(supabase: Awaited<ReturnType<typeof staff>>["supabase"], assetId: string) {
  const { data: last } = await supabase.from("tag_tests").select("tested_on, result, next_due").eq("asset_id", assetId).order("tested_on", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle();
  await supabase.from("tag_assets").update({ last_tested: last?.tested_on ?? null, last_result: last?.result ?? null, next_due: last?.result === "pass" ? last.next_due : last ? last.tested_on : null, updated_at: new Date().toISOString() }).eq("id", assetId);
}

/** Record a test (adding the asset first if it's new). Returns the label to print. */
export async function saveTest(i: TestInput): Promise<R<{ testId: string; assetId: string; zpl: string; code: string }>> {
  try {
    const { supabase, org, user, profile } = await staff();
    const s = readTagSettings(org.settings);
    const result = i.result === "fail" ? "fail" : i.result === "pass" ? "pass" : null;
    if (!result) throw new Error("Pass or fail?");
    const tested = isDate(i.tested_on) ? i.tested_on : todayISO(org.timezone);
    let assetId = i.assetId && UUID.test(i.assetId) ? i.assetId : null;
    if (!assetId) {
      if (!i.asset) throw new Error("Choose the asset or add it.");
      const r = await saveAsset(null, i.asset);
      if (!r.ok) return r;
      assetId = r.data;
    }
    const { data: a } = await supabase.from("tag_assets").select(ASSET_COLS).eq("id", assetId).eq("organisation_id", org.id).maybeSingle();
    if (!a) throw new Error("That asset isn't there any more.");
    const asset = a as unknown as TagAsset;
    const next_due = result === "pass" ? addMonths(tested, asset.interval_months) : null;
    const tester = t(i.tester_name, 120) ?? actorName(profile);
    const { data: test, error } = await supabase.from("tag_tests").insert({
      organisation_id: org.id, asset_id: assetId, tested_on: tested, result, next_due, tester_name: tester, tested_by: user.id,
      visual: i.visual === "fail" ? "fail" : i.visual === "pass" ? "pass" : null, earth_ohms: t(i.earth_ohms, 40), insulation_mohms: t(i.insulation_mohms, 40),
      leakage_ma: t(i.leakage_ma, 40), polarity: t(i.polarity, 40), rcd_ms: t(i.rcd_ms, 40), notes: t(i.notes, 4000), source: "manual",
    }).select("id").single();
    if (error) throw new Error(missing(error.message));
    await syncAsset(supabase, assetId);
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "tag.test", entityType: "tag_asset", entityId: assetId, customerId: asset.customer_id, summary: `${actorName(profile)} tested ${asset.name} (${asset.code}): ${result.toUpperCase()}` });
    refresh(assetId);
    const zpl = labelZpl(labelFor(org, s, asset, { result, tested_on: tested, next_due, tester_name: tester }), s.profile);
    return { ok: true, data: { testId: test.id as string, assetId, zpl, code: asset.code } };
  } catch (e) { return fail(e); }
}

/** The label for a test (to print again). */
export async function testLabel(testId: string): Promise<R<{ zpl: string; code: string }>> {
  try {
    const { supabase, org } = await staff();
    if (!UUID.test(testId)) throw new Error("Refresh and try again.");
    const { data: tt } = await supabase.from("tag_tests").select("result, tested_on, next_due, tester_name, asset:tag_assets(code, name, customer:customers(id, name))").eq("id", testId).eq("organisation_id", org.id).maybeSingle();
    if (!tt) throw new Error("That test isn't there any more.");
    const x = tt as unknown as { result: "pass" | "fail"; tested_on: string; next_due: string | null; tester_name: string | null; asset: Pick<TagAsset, "code" | "name" | "customer"> };
    const s = readTagSettings(org.settings);
    return { ok: true, data: { zpl: labelZpl(labelFor(org, s, x.asset, x), s.profile), code: x.asset.code } };
  } catch (e) { return fail(e); }
}

export async function markPrinted(testId: string): Promise<R> {
  try {
    const { supabase, org } = await staff();
    if (!UUID.test(testId)) return { ok: true, data: null };
    const { data } = await supabase.from("tag_tests").select("print_count").eq("id", testId).eq("organisation_id", org.id).maybeSingle();
    if (data) await supabase.from("tag_tests").update({ printed_at: new Date().toISOString(), print_count: Number(data.print_count ?? 0) + 1 }).eq("id", testId);
    return { ok: true, data: null };
  } catch (e) { return fail(e); }
}

export async function deleteTest(testId: string): Promise<R> {
  try {
    const { supabase, org, role } = await staff();
    if (!canManage(role)) throw new Error("Only owners, admins and managers can delete tests.");
    if (!UUID.test(testId)) throw new Error("Refresh and try again.");
    const { data, error } = await supabase.from("tag_tests").delete().eq("id", testId).eq("organisation_id", org.id).select("asset_id").single();
    if (error) throw new Error(error.message);
    await syncAsset(supabase, data.asset_id as string);
    refresh(data.asset_id as string);
    return { ok: true, data: null };
  } catch (e) { return fail(e); }
}

/* ------------------------------------------------------------------ import from the tester (Metrel ES Manager / PATLink export, any CSV/XLSX) */

export interface ImportOptions { customerId: string | null; createMissing: boolean; interval: number; device: string; tester: string }
export type ImportRow = Partial<Record<ImportKey, string>>;

export async function importTests(rows: ImportRow[], o: ImportOptions): Promise<R<{ imported: number; added: number; duplicates: number; skipped: { row: number; why: string }[] }>> {
  try {
    const { supabase, org, user, profile } = await staff();
    const list = (Array.isArray(rows) ? rows : []).slice(0, 5000);
    if (!list.length) throw new Error("Nothing to import.");
    const months = Math.round(Number(o.interval)) || readTagSettings(org.settings).defaultInterval;
    const cust = o.customerId && UUID.test(o.customerId) ? o.customerId : null;
    const out = { imported: 0, added: 0, duplicates: 0, skipped: [] as { row: number; why: string }[] };
    const codes = [...new Set(list.map((r) => cleanCode(r.code ?? "")).filter(Boolean))];
    const known = new Map<string, { id: string; interval_months: number }>();
    for (let i = 0; i < codes.length; i += 200) {
      const { data, error } = await supabase.from("tag_assets").select("id, code, interval_months").eq("organisation_id", org.id).in("code", codes.slice(i, i + 200));
      if (error) throw new Error(missing(error.message));
      for (const a of (data ?? []) as { id: string; code: string; interval_months: number }[]) known.set(a.code.toUpperCase(), a);
    }
    const touched = new Set<string>();
    for (const [n, r] of list.entries()) {
      const code = cleanCode(r.code ?? "");
      const date = readDate(r.date);
      const result = readResult(r.result);
      if (!code) { out.skipped.push({ row: n + 2, why: "no asset ID" }); continue; }
      if (!date) { out.skipped.push({ row: n + 2, why: `${code}: no test date` }); continue; }
      if (!result) { out.skipped.push({ row: n + 2, why: `${code}: result “${r.result ?? ""}” isn't pass or fail` }); continue; }
      let a = known.get(code);
      if (!a) {
        if (!o.createMissing) { out.skipped.push({ row: n + 2, why: `${code}: not in your assets` }); continue; }
        const { data, error } = await supabase.from("tag_assets").insert({ organisation_id: org.id, customer_id: cust, code, name: t(r.name, 160) ?? code, location: t(r.location, 160), interval_months: months, created_by: user.id }).select("id, interval_months").single();
        if (error) { out.skipped.push({ row: n + 2, why: `${code}: ${error.message}` }); continue; }
        a = { id: data.id as string, interval_months: Number(data.interval_months) };
        known.set(code, a); out.added++;
      }
      const { error } = await supabase.from("tag_tests").insert({
        organisation_id: org.id, asset_id: a.id, tested_on: date, result, next_due: result === "pass" ? addMonths(date, a.interval_months) : null,
        tester_name: t(r.tester, 120) ?? t(o.tester, 120) ?? actorName(profile), tested_by: user.id, earth_ohms: t(r.earth, 40), insulation_mohms: t(r.insulation, 40),
        leakage_ma: t(r.leakage, 40), polarity: t(r.polarity, 40), rcd_ms: t(r.rcd, 40), notes: t(r.notes, 4000), source: "import", device: t(o.device, 80), raw: r,
      });
      if (error) { if (/tag_tests_import_idx|duplicate/.test(error.message)) out.duplicates++; else out.skipped.push({ row: n + 2, why: `${code}: ${error.message}` }); continue; }
      out.imported++; touched.add(a.id);
    }
    for (const id of touched) await syncAsset(supabase, id);
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "tag.import", entityType: "tag_asset", entityId: null, customerId: cust, summary: `${actorName(profile)} imported ${out.imported} test${out.imported === 1 ? "" : "s"} from ${o.device || "a tester file"}${out.added ? ` (${out.added} new assets)` : ""}` });
    refresh();
    return { ok: true, data: out };
  } catch (e) { return fail(e); }
}

/* ------------------------------------------------------------------ settings */

export async function saveTagSettings(i: { prefix: string; licence: string; phone: string; soonDays: number; defaultInterval: number; profile: unknown }): Promise<R<{ testZpl: string }>> {
  try {
    const { supabase, org, role } = await staff();
    if (!canManage(role)) throw new Error("Only owners, admins and managers can change Test & Tag settings.");
    const { data: o } = await supabase.from("organisations").select("settings").eq("id", org.id).single();
    const settings = (o?.settings ?? {}) as Record<string, unknown>;
    const profile = readProfile(i.profile);
    const next = { prefix: cleanPrefix(i.prefix), licence: t(i.licence, 40), phone: t(i.phone, 40), soonDays: Math.max(0, Math.min(120, Math.round(Number(i.soonDays) || 30))), defaultInterval: Math.max(1, Math.min(120, Math.round(Number(i.defaultInterval) || 12))), profile };
    const { error } = await supabase.from("organisations").update({ settings: { ...settings, test_tag: next } }).eq("id", org.id);
    if (error) throw new Error(error.message);
    revalidatePath("/test-tag", "layout");
    return { ok: true, data: { testZpl: testZpl(profile, org.name) } };
  } catch (e) { return fail(e); }
}

/** Customers for the owner picker. */
export async function searchTagCustomers(q: string): Promise<R<{ id: string; name: string }[]>> {
  try {
    const { supabase, org } = await staff();
    const s = String(q ?? "").trim().replace(/[%_,()\\]/g, " ").slice(0, 60);
    if (s.length < 2) return { ok: true, data: [] };
    const { data } = await supabase.from("customers").select("id, name").eq("organisation_id", org.id).or(`name.ilike.%${s}%,company.ilike.%${s}%,email.ilike.%${s}%`).order("name").limit(12);
    return { ok: true, data: (data ?? []) as { id: string; name: string }[] };
  } catch (e) { return fail(e); }
}

/** Every label not printed yet (optionally for one owner), as one file — print a whole job in one go. */
export async function unprintedLabels(ownerId: string | null): Promise<R<{ zpl: string; count: number; ids: string[] }>> {
  try {
    const { supabase, org } = await staff();
    const s = readTagSettings(org.settings);
    let q = supabase.from("tag_tests").select("id, result, tested_on, next_due, tester_name, asset:tag_assets!inner(code, name, customer_id, customer:customers(id, name))")
      .eq("organisation_id", org.id).is("printed_at", null).order("created_at").limit(300);
    if (ownerId === "own") q = q.is("asset.customer_id", null);
    else if (ownerId && UUID.test(ownerId)) q = q.eq("asset.customer_id", ownerId);
    const { data, error } = await q;
    if (error) throw new Error(missing(error.message));
    const rows = (data ?? []) as unknown as { id: string; result: "pass" | "fail"; tested_on: string; next_due: string | null; tester_name: string | null; asset: Pick<TagAsset, "code" | "name" | "customer"> }[];
    return { ok: true, data: { zpl: rows.map((x) => labelZpl(labelFor(org, s, x.asset, x), s.profile)).join("\n"), count: rows.length, ids: rows.map((x) => x.id) } };
  } catch (e) { return fail(e); }
}

/** Mark a batch of labels as printed (after the file is downloaded / sent). */
export async function markManyPrinted(ids: string[]): Promise<R> {
  try {
    const { supabase, org } = await staff();
    const list = (Array.isArray(ids) ? ids : []).filter((x) => UUID.test(x)).slice(0, 300);
    if (list.length) await supabase.from("tag_tests").update({ printed_at: new Date().toISOString(), print_count: 1 }).eq("organisation_id", org.id).in("id", list).is("printed_at", null);
    refresh();
    return { ok: true, data: null };
  } catch (e) { return fail(e); }
}
