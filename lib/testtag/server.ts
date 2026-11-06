import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appBaseUrl } from "@/lib/integrations/registry";
import { readProfile, tagStatus, type LabelData, type PrinterProfile } from "./core";

export interface TagSettings { prefix: string; licence: string | null; phone: string | null; soonDays: number; profile: PrinterProfile; defaultInterval: number }

export function readTagSettings(orgSettings: unknown): TagSettings {
  const o = ((orgSettings as Record<string, unknown> | null)?.test_tag ?? {}) as Record<string, unknown>;
  const s = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
  const soon = Number(o.soonDays);
  const iv = Number(o.defaultInterval);
  return {
    prefix: (s(o.prefix, 8) ?? "TT").toUpperCase().replace(/[^A-Z0-9]/g, "") || "TT", licence: s(o.licence, 40), phone: s(o.phone, 40),
    soonDays: Number.isFinite(soon) && soon >= 0 && soon <= 120 ? soon : 30, profile: readProfile(o.profile), defaultInterval: Number.isFinite(iv) && iv >= 1 && iv <= 120 ? iv : 12,
  };
}

export const ASSET_COLS = "id, customer_id, code, name, category, make, model, serial, location, class, interval_months, status, last_tested, last_result, next_due, notes, created_at, customer:customers(id, name)";
export interface TagAsset {
  id: string; customer_id: string | null; code: string; name: string; category: string | null; make: string | null; model: string | null; serial: string | null;
  location: string | null; class: string | null; interval_months: number; status: string; last_tested: string | null; last_result: "pass" | "fail" | null;
  next_due: string | null; notes: string | null; created_at: string; customer: { id: string; name: string } | null;
}
export const TEST_COLS = "id, asset_id, tested_on, result, next_due, tester_name, visual, earth_ohms, insulation_mohms, leakage_ma, polarity, rcd_ms, notes, source, device, printed_at, print_count, created_at";
export interface TagTest {
  id: string; asset_id: string; tested_on: string; result: "pass" | "fail"; next_due: string | null; tester_name: string | null; visual: string | null;
  earth_ohms: string | null; insulation_mohms: string | null; leakage_ma: string | null; polarity: string | null; rcd_ms: string | null; notes: string | null;
  source: string; device: string | null; printed_at: string | null; print_count: number; created_at: string;
}

/** The public record a label's QR code opens. */
export const tagUrl = (orgSlug: string, code: string) => `${appBaseUrl()}/tag/${orgSlug}/${encodeURIComponent(code)}`;

export function labelFor(org: { name: string; slug: string }, s: TagSettings, a: Pick<TagAsset, "code" | "name" | "customer">, t: Pick<TagTest, "result" | "tested_on" | "next_due" | "tester_name">): LabelData {
  return {
    result: t.result, business: org.name, licence: s.licence, phone: s.phone, owner: a.customer?.name ?? null,
    code: a.code, item: a.name, tested: t.tested_on, nextDue: t.next_due, tester: t.tester_name, url: tagUrl(org.slug, a.code),
  };
}

/** Assets that need retagging soon (overdue, due soon) — for alerts. Quietly empty before the 0102 update. */
export async function dueAssets(db: SupabaseClient, orgId: string, today: string, soonDays: number) {
  const until = new Date(Date.parse(`${today}T12:00:00Z`) + soonDays * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await db.from("tag_assets").select(ASSET_COLS).eq("organisation_id", orgId).eq("status", "active").lte("next_due", until).order("next_due").limit(1000);
  if (error) return [];
  return ((data ?? []) as unknown as TagAsset[]).map((a) => ({ ...a, state: tagStatus(a, today, soonDays) }));
}

/** Daily: one notification per business listing what needs retagging (each asset once per due date). */
export async function runTestTagJobs(db: SupabaseClient) {
  const out = { alerts: 0 };
  const { data: orgRows, error } = await db.from("tag_assets").select("organisation_id").eq("status", "active").not("next_due", "is", null).limit(5000);
  if (error) return out;
  const orgIds = [...new Set(((orgRows ?? []) as { organisation_id: string }[]).map((r) => r.organisation_id))];
  for (const orgId of orgIds) {
    const { data: org } = await db.from("organisations").select("timezone, settings").eq("id", orgId).single();
    const tz = (org?.timezone as string) || "Australia/Sydney";
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const s = readTagSettings(org?.settings);
    const until = new Date(Date.parse(`${today}T12:00:00Z`) + s.soonDays * 86_400_000).toISOString().slice(0, 10);
    const { data: due } = await db.from("tag_assets").select("id, next_due, reminded_for, customer:customers(name)").eq("organisation_id", orgId).eq("status", "active").lte("next_due", until).limit(2000);
    const fresh = ((due ?? []) as unknown as { id: string; next_due: string; reminded_for: string | null; customer: { name: string } | null }[]).filter((a) => a.reminded_for !== a.next_due);
    if (!fresh.length) continue;
    const overdue = fresh.filter((a) => a.next_due < today).length;
    const by = new Map<string, number>();
    for (const a of fresh) by.set(a.customer?.name ?? "Our own equipment", (by.get(a.customer?.name ?? "Our own equipment") ?? 0) + 1);
    const body = [...by.entries()].sort((x, y) => y[1] - x[1]).map(([n, c]) => `${n} ${c}`).join(", ");
    await db.from("notifications").insert({
      organisation_id: orgId, type: "testtag.due", title: `${fresh.length} item${fresh.length === 1 ? "" : "s"} to retag${overdue ? ` (${overdue} overdue)` : ""}`.slice(0, 200),
      body: body.slice(0, 140), link: "/test-tag", entity_type: "tag_asset", entity_id: fresh[0].id,
    }).then(() => null, () => null);
    for (const a of fresh) await db.from("tag_assets").update({ reminded_for: a.next_due }).eq("id", a.id);
    out.alerts++;
  }
  return out;
}
