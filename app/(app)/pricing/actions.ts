"use server";

import { revalidatePath } from "next/cache";
import { canManage, requireOrg } from "@/lib/context";
import { cleanSenders } from "@/lib/pricing/core";

/** Pricing: suppliers and their invoice emails, reading invoices from Gmail or uploads. Owners, admins and managers. */
export type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
const err = (e: unknown) => (e instanceof Error ? e.message : String(e));
const UUID = /^[0-9a-f-]{36}$/i;
const t = (v: unknown, n = 200) => (typeof v === "string" ? v.trim().slice(0, n) || null : null);
const money = (v: unknown) => { if (v === "" || v == null) return null; const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null; };

async function manager() {
  const ctx = await requireOrg();
  if (!canManage(ctx.role)) throw new Error("Only owners, admins and managers can see supplier pricing.");
  return ctx;
}
export type Mailbox = "gmail" | "gmail2";
const box = (v: unknown): Mailbox => (v === "gmail2" ? "gmail2" : "gmail");
async function gmailContext(mailbox: Mailbox = "gmail") {
  const { org, user } = await manager();
  const { createServiceClient } = await import("@/lib/integrations/runtime");
  const { buildContext } = await import("@/lib/integrations/sync-runner");
  // the service client reads the Gmail connection's tokens; every query below is scoped to this business
  return buildContext(createServiceClient(), "service", org.id, mailbox, user.id)
    .catch(() => { throw new Error(mailbox === "gmail2" ? "Connect the second Gmail account first (Settings → Integrations)." : "Connect Gmail first (Settings → Integrations)."); });
}

export interface SupplierInput {
  name: string; match_from: string[] | string; match_subject?: string | null; match_exclude?: string[] | string; parser?: string; active?: boolean;
  min_order?: number | string | null; free_delivery_over?: number | string | null; delivery_fee?: number | string | null;
  rep_name?: string | null; rep_email?: string | null; rep_phone?: string | null; notes?: string | null;
  /** which Gmail account their invoices arrive in */ mailbox?: Mailbox;
}

export async function saveSupplier(id: string | null, input: SupplierInput): Promise<Result<string>> {
  try {
    const { supabase, org } = await manager();
    if (id && !UUID.test(id)) throw new Error("Refresh and try again.");
    const name = t(input.name, 120);
    if (!name) throw new Error("Give the supplier a name.");
    const exclude = (Array.isArray(input.match_exclude) ? input.match_exclude : String(input.match_exclude ?? "").split(",")).map((x) => String(x).trim().slice(0, 60)).filter(Boolean).slice(0, 10);
    const row = {
      organisation_id: org.id, name, match_from: cleanSenders(input.match_from), match_subject: t(input.match_subject, 120), match_exclude: exclude,
      parser: ["auto", "ai", "bidfood", "longpark", "fresho", "generic"].includes(String(input.parser)) ? String(input.parser) : "auto",
      active: input.active !== false, min_order: money(input.min_order), free_delivery_over: money(input.free_delivery_over), delivery_fee: money(input.delivery_fee),
      rep_name: t(input.rep_name, 120), rep_email: t(input.rep_email, 200), rep_phone: t(input.rep_phone, 40), notes: t(input.notes, 2000), updated_at: new Date().toISOString(),
    };
    let sid = id;
    const write = async (r: Record<string, unknown>) => {
      if (id) { const { error } = await supabase.from("price_suppliers").update(r).eq("id", id).eq("organisation_id", org.id); return error; }
      const { data, error } = await supabase.from("price_suppliers").insert(r).select("id").single();
      if (!error) sid = data.id as string;
      return error;
    };
    let e = await write({ ...row, mailbox: box(input.mailbox) });
    if (e && /mailbox/.test(e.message)) {
      if (box(input.mailbox) === "gmail2") throw new Error("Choosing the second Gmail account needs the 0071 database update first.");
      e = await write(row);
    }
    if (e) throw new Error(e.message);
    revalidatePath("/pricing", "layout");
    return { ok: true, data: sid! };
  } catch (e) { return { ok: false, error: err(e) }; }
}

/** People who've emailed you PDF invoices in the last year — to pick suppliers from. */
export async function findSenders(mailbox: Mailbox = "gmail"): Promise<Result<{ email: string; name: string | null; domain: string; count: number; subject: string | null; last: string | null }[]>> {
  try {
    const ctx = await gmailContext(box(mailbox));
    const { findInvoiceSenders } = await import("@/lib/pricing/sync");
    const { ownAddresses } = await import("@/lib/integrations/gmail-sync");
    const own = [ctx.integration.account_label ?? "", ...ownAddresses(ctx)].filter((x) => x.includes("@"));
    return { ok: true, data: await findInvoiceSenders(ctx, own) };
  } catch (e) { return { ok: false, error: err(e) }; }
}

/** Read new invoices from Gmail (or everything since a date, for history). Runs ~45 s; call again while `more`. */
export async function syncInvoices(opts: { supplierId?: string; historyFrom?: string; mailbox?: Mailbox } = {}): Promise<Result<{ imported: number; duplicates: number; skipped: number; failed: number; more: boolean; lines: string[] }>> {
  try {
    if (opts.supplierId && !UUID.test(opts.supplierId)) throw new Error("Refresh and try again.");
    if (opts.historyFrom && !/^\d{4}-\d{2}-\d{2}$/.test(opts.historyFrom)) throw new Error("Choose a start date.");
    const ctx = await gmailContext(box(opts.mailbox));
    const { orgAiKey } = await import("@/lib/ai/key");
    const { syncSupplierInvoices } = await import("@/lib/pricing/sync");
    const r = await syncSupplierInvoices(ctx, { supplierId: opts.supplierId, historyFrom: opts.historyFrom, aiKey: await orgAiKey(ctx.org.id) });
    revalidatePath("/pricing", "layout");
    return { ok: true, data: { ...r, lines: r.lines.slice(-40) } };
  } catch (e) { return { ok: false, error: err(e) }; }
}

/** An invoice PDF uploaded from the browser into the supplier-invoices bucket. */
export async function importUploaded(supplierId: string, path: string, filename: string): Promise<Result<string>> {
  try {
    const { org } = await manager();
    if (!UUID.test(supplierId) || !path.startsWith(`${org.id}/`) || path.includes("..")) throw new Error("Refresh and try again.");
    const { createServiceClient } = await import("@/lib/integrations/runtime");
    const db = createServiceClient();
    const { data: sup } = await db.from("price_suppliers").select("id, name, parser, match_from, match_subject, match_exclude, last_synced_at").eq("id", supplierId).eq("organisation_id", org.id).maybeSingle();
    if (!sup) throw new Error("Choose the supplier.");
    const { data: blob, error } = await db.storage.from("supplier-invoices").download(path);
    if (error || !blob) throw new Error("The upload didn't arrive — try again.");
    const { orgAiKey } = await import("@/lib/ai/key");
    const { importInvoice } = await import("@/lib/pricing/import");
    const r = await importInvoice(db, { orgId: org.id, supplier: sup as never, bytes: new Uint8Array(await blob.arrayBuffer()), filename: filename.slice(0, 120), source: "upload", existingPath: path, aiKey: await orgAiKey(org.id) });
    revalidatePath("/pricing", "layout");
    if (r.status === "failed") throw new Error(r.message);
    return { ok: true, data: r.message };
  } catch (e) { return { ok: false, error: err(e) }; }
}

/** Remove an invoice that was read wrongly (its prices go with it). */
export async function deleteInvoice(id: string): Promise<Result> {
  try {
    const { supabase, org } = await manager();
    if (!UUID.test(id)) throw new Error("Refresh and try again.");
    const { error } = await supabase.from("price_invoices").delete().eq("id", id).eq("organisation_id", org.id);
    if (error) throw new Error(error.message);
    revalidatePath("/pricing", "layout");
    return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: err(e) }; }
}

/** A short-lived link to an invoice PDF. */
export async function invoicePdfLink(id: string): Promise<Result<string>> {
  try {
    const { supabase, org } = await manager();
    if (!UUID.test(id)) throw new Error("Refresh and try again.");
    const { data } = await supabase.from("price_invoices").select("storage_path").eq("id", id).eq("organisation_id", org.id).maybeSingle();
    if (!data?.storage_path) throw new Error("No PDF kept for this invoice.");
    const { data: s, error } = await supabase.storage.from("supplier-invoices").createSignedUrl(data.storage_path as string, 300);
    if (error || !s) throw new Error(error?.message ?? "Couldn't open the PDF.");
    return { ok: true, data: s.signedUrl };
  } catch (e) { return { ok: false, error: err(e) }; }
}
