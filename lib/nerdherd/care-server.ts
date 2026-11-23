import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { incLineFromEx, lineTotals } from "@/lib/invoices/lines";
import { todayISO } from "@/lib/format";
import { readNerd } from "./core";
import { MAX_FILE_BYTES, MAX_FILES, blockBalance, chargedMinutes, packPrice, readCare, readFiles, safeName, type BlockPack, type TicketFile } from "./care";

/**
 * Care Hub (server): latest software versions, a client's prepaid block, buying a block, files on requests, and
 * keeping a request's block charge up to date as time is logged. Portal callers must have run requirePortal() first —
 * every query here is limited to the customer ids it was given.
 */

/* ------------------------------------------------------------------ latest versions (public sources, cached 6 hours) */

export interface LatestVersions {
  wordpress: string | null; woocommerce: string | null; elementor: string | null; yoast: string | null; php: string | null;
  /** the oldest WordPress branch still getting security fixes isn't published reliably, so we only show the latest */
  checkedAt: string;
}
const SIX_HOURS = 6 * 60 * 60;
async function getJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { next: { revalidate: SIX_HOURS }, signal: AbortSignal.timeout(8000) });
    return r.ok ? ((await r.json()) as T) : null;
  } catch { return null; }
}
async function pluginVersion(slug: string) {
  const j = await getJson<{ version?: string }>(`https://api.wordpress.org/plugins/info/1.2/?action=plugin_information&request[slug]=${slug}&request[fields][sections]=0`);
  return typeof j?.version === "string" ? j.version : null;
}
export async function latestVersions(): Promise<LatestVersions> {
  const [core, wc, el, yoast, php] = await Promise.all([
    getJson<{ offers?: { response?: string; current?: string; version?: string }[] }>("https://api.wordpress.org/core/version-check/1.7/"),
    pluginVersion("woocommerce"), pluginVersion("elementor"), pluginVersion("wordpress-seo"),
    getJson<{ version?: string }>("https://www.php.net/releases/?json&version=8"),
  ]);
  const offer = core?.offers?.find((o) => o.response === "upgrade" || o.response === "latest") ?? core?.offers?.[0];
  return {
    wordpress: offer?.current ?? offer?.version ?? null, woocommerce: wc, elementor: el, yoast,
    php: typeof php?.version === "string" ? php.version : null, checkedAt: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ a client's block */

export interface BlockRow { id: string; hours: number; price_ex_gst: number; label: string | null; created_at: string; paid: boolean; status: string; invoice: { number: string | null; pay_token: string; balance: number; status: string } | null }
export interface UsageRow { ticket_id: string; minutes_logged: number; minutes_charged: number; updated_at: string; number: number | null; subject: string | null }

export async function loadBlock(db: SupabaseClient, orgId: string, customerIds: string[]) {
  const [b, u] = await Promise.all([
    db.from("nh_blocks").select("id, hours, price_ex_gst, label, created_at, status, invoices(number, pay_token, balance, status)").eq("organisation_id", orgId).in("customer_id", customerIds).neq("status", "void").order("created_at", { ascending: false }),
    db.from("nh_block_usage").select("ticket_id, minutes_logged, minutes_charged, updated_at, support_tickets(number, subject)").eq("organisation_id", orgId).in("customer_id", customerIds).gt("minutes_charged", 0).order("updated_at", { ascending: false }).limit(100),
  ]);
  if (b.error) return null; // the Care Hub update hasn't been run yet
  type B = { id: string; hours: number; price_ex_gst: number; label: string | null; created_at: string; status: string; invoices: { number: string | null; pay_token: string; balance: number | null; status: string } | null };
  const blocks: BlockRow[] = ((b.data ?? []) as unknown as B[]).map((x) => {
    // a voided invoice (or a draft nobody sent) never adds hours
    const dead = !!x.invoices && (x.invoices.status === "void" || x.invoices.status === "voided" || x.invoices.status === "deleted");
    const paid = !dead && (!x.invoices || x.invoices.status === "paid" || (x.invoices.status !== "draft" && Number(x.invoices.balance ?? 0) <= 0.009));
    return { id: x.id, hours: Number(x.hours), price_ex_gst: Number(x.price_ex_gst), label: x.label, created_at: x.created_at, status: dead ? "void" : x.status, paid,
      invoice: x.invoices ? { number: x.invoices.number, pay_token: x.invoices.pay_token, balance: Number(x.invoices.balance ?? 0), status: x.invoices.status } : null };
  });
  type U = { ticket_id: string; minutes_logged: number; minutes_charged: number; updated_at: string; support_tickets: { number: number; subject: string } | null };
  const usage: UsageRow[] = ((u.data ?? []) as unknown as U[]).map((x) => ({ ticket_id: x.ticket_id, minutes_logged: x.minutes_logged, minutes_charged: x.minutes_charged, updated_at: x.updated_at, number: x.support_tickets?.number ?? null, subject: x.support_tickets?.subject ?? null }));
  const live = blocks.filter((x) => x.status !== "void");
  return { blocks: live, usage, ...blockBalance(live, usage) };
}

/** Raise the invoice for a block and record the block (it counts once the invoice is paid). Returns the pay link token. */
export async function buyBlock(db: SupabaseClient, org: { id: string; currency: string; timezone: string; settings: unknown }, customerId: string, hours: number, actor: { id: string | null; name: string }) {
  const care = readCare(org.settings);
  const nerd = readNerd(org.settings);
  const pack: BlockPack | undefined = care.packs.find((p) => p.hours === hours);
  if (!pack) throw new Error("That block isn't available — refresh and choose again.");
  const price = packPrice(pack, nerd.hourlyRate);
  const label = `Prepaid website care — ${pack.hours} hours${pack.discountPct ? ` (${pack.discountPct}% off)` : ""}`;
  const line = incLineFromEx(`${label}\nUsed for website updates and changes you request. Each request uses at least ${nerd.minHours === 1 ? "1 hour" : `${nerd.minHours} hours`}, then time to the next 15 minutes.`, 1, price.exGst, { account_code: nerd.accountCode });
  const tot = lineTotals([line]);
  const today = todayISO(org.timezone);
  const { data: inv, error } = await db.from("invoices").insert({
    organisation_id: org.id, customer_id: customerId, kind: "full", status: "awaiting_payment", issue_date: today, due_date: today,
    subtotal: tot.subtotal, tax_total: tot.tax, total: tot.total, currency: org.currency, reference: label.slice(0, 200),
    line_items: [{ ...line, line_amount: Math.round(line.quantity * line.unit_amount * 100) / 100 }],
  }).select("id, number, pay_token").single();
  if (error) throw new Error(`Couldn't raise the invoice: ${error.message}`);
  const { error: bErr } = await db.from("nh_blocks").insert({ organisation_id: org.id, customer_id: customerId, hours: pack.hours, price_ex_gst: price.exGst, label, invoice_id: inv.id, created_by: actor.id });
  if (bErr) throw new Error(`The invoice was raised (${inv.number}) but the block wasn't saved: ${bErr.message}`);
  await db.from("notifications").insert({ organisation_id: org.id, type: "care.block", title: `${actor.name} bought a ${pack.hours}-hour care block`, body: `Invoice ${inv.number} — counts once paid`, link: `/invoices/${inv.id}`, entity_type: "invoice", entity_id: inv.id }).then(() => null, () => null);
  return { invoiceId: inv.id as string, number: inv.number as string, payToken: inv.pay_token as string };
}

/** Keep a block request's charge in step with the time logged on it (call after any time is added or removed). */
export async function syncBlockUsage(db: SupabaseClient, ticketId: string) {
  const { data: t } = await db.from("support_tickets").select("id, organisation_id, customer_id, billing, organisations(settings)").eq("id", ticketId).maybeSingle();
  const tk = t as unknown as { id: string; organisation_id: string; customer_id: string | null; billing: string | null; organisations: { settings: unknown } | null } | null;
  if (!tk || !tk.customer_id) return null;
  if (tk.billing !== "block") { await db.from("nh_block_usage").delete().eq("ticket_id", ticketId); return null; }
  const { data: ups } = await db.from("support_ticket_updates").select("minutes, billable").eq("ticket_id", ticketId).gt("minutes", 0);
  const logged = ((ups ?? []) as { minutes: number; billable: boolean }[]).filter((u) => u.billable).reduce((a, u) => a + Number(u.minutes), 0);
  const charged = chargedMinutes(logged, readNerd(tk.organisations?.settings).minHours);
  const { error } = await db.from("nh_block_usage").upsert({ organisation_id: tk.organisation_id, customer_id: tk.customer_id, ticket_id: ticketId, minutes_logged: logged, minutes_charged: charged, updated_at: new Date().toISOString() }, { onConflict: "ticket_id" });
  if (error) throw new Error(`Couldn't update the prepaid hours: ${error.message}`);
  return { logged, charged };
}

/* ------------------------------------------------------------------ files */

/**
 * Files go straight from the browser to storage (Vercel caps a request at ~4.5 MB): the server hands out one-time
 * signed upload links under the organisation's own folder, then accepts back only paths in that folder.
 */
export async function prepareUploads(db: SupabaseClient, orgId: string, list: { name: string; size: number; type: string }[]) {
  const files = (Array.isArray(list) ? list : []).slice(0, MAX_FILES + 1);
  if (files.length > MAX_FILES) throw new Error(`Attach up to ${MAX_FILES} files at a time.`);
  const big = files.find((f) => !(Number(f.size) > 0) || Number(f.size) > MAX_FILE_BYTES);
  if (big) throw new Error(`"${String(big.name).slice(0, 80)}" is ${Number(big.size) > 0 ? "over 10 MB — share a link to it instead" : "empty"}.`);
  const out: { path: string; token: string; name: string; size: number; type: string }[] = [];
  for (const f of files) {
    const path = `${orgId}/u/${randomUUID()}/${safeName(f.name)}`;
    const { data, error } = await db.storage.from("ticket-files").createSignedUploadUrl(path);
    if (error || !data) throw new Error(/bucket|not found/i.test(error?.message ?? "") ? "File uploads are being switched on — try again shortly." : `Couldn't get ready to upload: ${error?.message ?? "no link"}`);
    out.push({ path, token: data.token, name: String(f.name).slice(0, 200), size: Number(f.size), type: String(f.type || "") });
  }
  return out;
}

/** Files the browser says it uploaded: kept only if they're in this organisation's upload folder and really there. */
export async function claimUploads(db: SupabaseClient, orgId: string, raw: string | null): Promise<TicketFile[]> {
  let list: unknown = [];
  try { list = raw ? JSON.parse(raw) : []; } catch { list = []; }
  const files = readFiles(list).filter((f) => f.path.startsWith(`${orgId}/u/`) && !f.path.includes("..")).slice(0, MAX_FILES);
  const kept: TicketFile[] = [];
  for (const f of files) {
    const dir = f.path.slice(0, f.path.lastIndexOf("/"));
    const { data } = await db.storage.from("ticket-files").list(dir, { limit: 2 });
    if (data?.some((o) => `${dir}/${o.name}` === f.path)) kept.push({ ...f, name: f.name.slice(0, 200) });
  }
  return kept;
}

/** Short-lived download links for files on a request's messages (10 minutes). */
export async function signFiles(db: SupabaseClient, raw: unknown): Promise<(TicketFile & { url: string | null })[]> {
  const files = readFiles(raw);
  if (!files.length) return [];
  const { data } = await db.storage.from("ticket-files").createSignedUrls(files.map((f) => f.path), 600);
  return files.map((f) => ({ ...f, url: data?.find((d) => d.path === f.path)?.signedUrl ?? null }));
}
