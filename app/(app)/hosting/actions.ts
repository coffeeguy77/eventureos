"use server";

import { revalidatePath } from "next/cache";
import { canManage, requireOrg } from "@/lib/context";
import { createServiceClient } from "@/lib/integrations/runtime";
import { billingReference, normalizeDomain, readHosting, DEFAULT_NOTICES } from "@/lib/hosting/core";
import { checkBilling, logEvent, noticePreview, runHosting, sendNotice, suspendAccount, syncServer, testServer, unsuspendAccount } from "@/lib/hosting/server";

/** Hosting (Web Culture): servers, accounts, notices, suspend/unsuspend and settings. Owners, admins and managers only. */
type R<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
const err = (e: unknown) => {
  const m = e instanceof Error ? e.message : String(e);
  return /hosting_(servers|accounts|events|server_credentials)/.test(m) && /does not exist|could not find/i.test(m) ? "Hosting needs the 0074 database update first." : m;
};
const UUID = /^[0-9a-f-]{36}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^[^\s@<>"',;:()]+@[^\s@<>"',;:()]+\.[^\s@<>"',;:()]{2,}$/;
const t = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) || null : null);

async function hosting() {
  const ctx = await requireOrg();
  if (!canManage(ctx.role)) throw new Error("Only owners, admins and managers can use Hosting.");
  return { ...ctx, db: createServiceClient() };
}
const done = (id?: string) => { revalidatePath("/hosting", "layout"); if (id) revalidatePath(`/hosting/${id}`); };
async function server(db: ReturnType<typeof createServiceClient>, orgId: string, id: string) {
  if (!UUID.test(id)) throw new Error("Refresh and try again.");
  const { data } = await db.from("hosting_servers").select("id, organisation_id, name, kind, host, port, username, verify_tls, active").eq("id", id).eq("organisation_id", orgId).maybeSingle();
  if (!data) throw new Error("That server no longer exists.");
  return data as { id: string; organisation_id: string; name: string; kind: "whm" | "siteground"; host: string | null; port: number; username: string | null; verify_tls: boolean; active: boolean };
}
async function ownAccount(db: ReturnType<typeof createServiceClient>, orgId: string, id: string) {
  if (!UUID.test(id)) throw new Error("Refresh and try again.");
  const { data } = await db.from("hosting_accounts").select("id").eq("id", id).eq("organisation_id", orgId).maybeSingle();
  if (!data) throw new Error("That hosting account no longer exists.");
}

/** Morning check: pull the latest from Xero, sync the servers, recheck who's paid, then the automatic actions. */
export async function checkEverythingNow(): Promise<R<string>> {
  try {
    const { db, org, user } = await hosting();
    const parts: string[] = [];
    try {
      const { buildContext, runProviderSync } = await import("@/lib/integrations/sync-runner");
      const r = await runProviderSync(await buildContext(db, "service", org.id, "xero", user.id));
      parts.push(`Xero: ${r.message ?? "synced"}`);
    } catch (e) { parts.push(`Xero: ${e instanceof Error ? e.message : String(e)}`); }
    const h = await runHosting(db, org.id, user.id);
    parts.push(...h.notes, `${h.billing.accounts} accounts checked against invoices (${h.billing.changed} changed).`, ...h.auto);
    done(); revalidatePath("/accounts"); revalidatePath("/invoices");
    return { ok: true, data: parts.join(" ") };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export async function recheckBilling(): Promise<R<string>> {
  try {
    const { db, org } = await hosting();
    const b = await checkBilling(db, org.id);
    done(); return { ok: true, data: `${b.accounts} accounts checked (${b.changed} changed).` };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export interface ServerInput { name: string; kind: "whm" | "siteground"; host?: string | null; port?: number | null; username?: string | null; token?: string | null; verify_tls?: boolean; active?: boolean }

/** Add or change a server. The API token is written to a table only the server can read; it's never sent back to the browser. */
export async function saveServer(id: string | null, i: ServerInput): Promise<R<string>> {
  try {
    const { db, org, user } = await hosting();
    const kind = i.kind === "siteground" ? "siteground" : "whm";
    const name = t(i.name, 80);
    if (!name) throw new Error("Give the server a name.");
    const host = kind === "whm" ? t(i.host, 253)?.toLowerCase().replace(/^https?:\/\//, "").replace(/[:/].*$/, "") ?? null : null;
    if (kind === "whm" && (!host || !/^[a-z0-9.-]{3,253}$/.test(host))) throw new Error("Add the server's address, e.g. server1.example.com.au");
    const username = kind === "whm" ? t(i.username, 60) ?? "root" : null;
    const port = kind === "whm" ? Math.min(65535, Math.max(1, Math.round(Number(i.port) || 2087))) : 2087;
    const row = { name, kind, host, port, username, verify_tls: i.verify_tls !== false, active: i.active !== false, updated_at: new Date().toISOString() };
    let sid = id;
    if (sid) { await server(db, org.id, sid); const { error } = await db.from("hosting_servers").update(row).eq("id", sid); if (error) throw new Error(error.message); }
    else { const { data, error } = await db.from("hosting_servers").insert({ ...row, organisation_id: org.id }).select("id").single(); if (error) throw new Error(error.message); sid = data.id as string; }
    const token = typeof i.token === "string" ? i.token.trim() : "";
    if (token) {
      if (!/^[A-Za-z0-9]{16,128}$/.test(token)) throw new Error("That doesn't look like a WHM API token (letters and numbers only).");
      const { error } = await db.from("hosting_server_credentials").upsert({ server_id: sid, token, updated_at: new Date().toISOString() });
      if (error) throw new Error(error.message);
    }
    await logEvent(db, { orgId: org.id, serverId: sid, action: "setting", detail: `${id ? "Changed" : "Added"} server ${name}${token ? " (API token updated)" : ""}`, actor: user.id });
    done(); return { ok: true, data: sid! };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export async function testServerConnection(id: string): Promise<R<string>> {
  try {
    const { db, org } = await hosting();
    const v = await testServer(db, await server(db, org.id, id));
    return { ok: true, data: `Connected — WHM ${v}.` };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export async function syncServerNow(id: string): Promise<R<string>> {
  try {
    const { db, org, user } = await hosting();
    const msg = await syncServer(db, await server(db, org.id, id), user.id);
    await checkBilling(db, org.id);
    done(); return { ok: true, data: msg };
  } catch (e) { return { ok: false, error: err(e) }; }
}

/** A SiteGround (or any WordPress) site, added by hand. */
export async function addSite(serverId: string, domainRaw: string): Promise<R<string>> {
  try {
    const { db, org, user } = await hosting();
    const sv = await server(db, org.id, serverId);
    if (sv.kind !== "siteground") throw new Error("Sites are added by hand only on SiteGround servers — WHM accounts come from Sync.");
    const domain = normalizeDomain(domainRaw).replace(/^www\./, "");
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) throw new Error("Type the domain, e.g. example.com.au");
    const { data, error } = await db.from("hosting_accounts").insert({ organisation_id: org.id, server_id: sv.id, domain, billing_reference: billingReference(domain) }).select("id").single();
    if (error) throw new Error(/duplicate/.test(error.message) ? `${domain} is already on ${sv.name}.` : error.message);
    await logEvent(db, { orgId: org.id, accountId: data.id as string, serverId: sv.id, action: "setting", detail: `Added ${domain}`, actor: user.id });
    await checkBilling(db, org.id);
    done(); return { ok: true, data: data.id as string };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export interface AccountInput {
  contact_email?: string | null; cc_emails?: string | null; billing_reference?: string | null; customer_id?: string | null;
  vip?: boolean; disputed?: boolean; manual_override?: boolean; extension_until?: string | null; auto_check?: boolean; auto_unsuspend?: boolean; notes?: string | null;
}

export async function saveAccount(id: string, i: AccountInput): Promise<R> {
  try {
    const { db, org, user } = await hosting();
    await ownAccount(db, org.id, id);
    const contact = t(i.contact_email, 200)?.toLowerCase() ?? null;
    if (contact && !EMAIL.test(contact)) throw new Error("The contact email doesn't look right.");
    const cc = (i.cc_emails ?? "").split(/[,;\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
    const bad = cc.find((x) => !EMAIL.test(x));
    if (bad) throw new Error(`${bad} doesn't look like an email address.`);
    let customer: string | null = null;
    if (i.customer_id) {
      if (!UUID.test(i.customer_id)) throw new Error("Choose the client from the list.");
      const { data } = await db.from("customers").select("id").eq("id", i.customer_id).eq("organisation_id", org.id).maybeSingle();
      if (!data) throw new Error("That client couldn't be found.");
      customer = data.id as string;
    }
    const { error } = await db.from("hosting_accounts").update({
      contact_email: contact, cc_emails: cc.slice(0, 5), billing_reference: t(i.billing_reference, 200), customer_id: customer,
      vip: !!i.vip, disputed: !!i.disputed, manual_override: !!i.manual_override, extension_until: i.extension_until && DATE.test(i.extension_until) ? i.extension_until : null,
      auto_check: i.auto_check !== false, auto_unsuspend: i.auto_unsuspend !== false, notes: t(i.notes, 4000), updated_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) throw new Error(error.message);
    await logEvent(db, { orgId: org.id, accountId: id, action: "setting", detail: "Account details changed", actor: user.id });
    await checkBilling(db, org.id);
    done(id); return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export async function previewNotice(id: string, key: string): Promise<R<{ to: string | null; cc: string[]; subject: string; message: string; payUrl: string | null; dryRun: boolean }>> {
  try {
    const { db, org } = await hosting();
    await ownAccount(db, org.id, id);
    const p = await noticePreview(db, org.id, id, key);
    return { ok: true, data: { to: p.to, cc: p.cc, subject: p.subject, message: p.message, payUrl: p.payUrl, dryRun: p.s.dryRun } };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export async function sendNoticeNow(id: string, key: string, subject: string, message: string): Promise<R<string>> {
  try {
    const { db, org, user } = await hosting();
    await ownAccount(db, org.id, id);
    if (!DEFAULT_NOTICES.some((d) => d.key === key)) throw new Error("Choose a notice.");
    const r = await sendNotice(db, org.id, id, key, user.id, { subject: String(subject ?? "").trim(), message: String(message ?? "").trim() });
    done(id); return { ok: true, data: r.message };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export async function suspendNow(id: string, reason: string, category: "billing_overdue" | "other", notify: boolean): Promise<R<string>> {
  try {
    const { db, org, user } = await hosting();
    await ownAccount(db, org.id, id);
    const r = await suspendAccount(db, org.id, id, { reason: t(reason, 200) ?? "Overdue hosting invoice", category: category === "other" ? "other" : "billing_overdue", actor: user.id, notify });
    done(id); return { ok: true, data: r.message };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export async function unsuspendNow(id: string, notify: boolean): Promise<R<string>> {
  try {
    const { db, org, user } = await hosting();
    await ownAccount(db, org.id, id);
    const r = await unsuspendAccount(db, org.id, id, { actor: user.id, notify });
    done(id); return { ok: true, data: r.message };
  } catch (e) { return { ok: false, error: err(e) }; }
}

export async function saveHostingSettings(input: Record<string, unknown>): Promise<R> {
  try {
    const { supabase, db, org, user } = await hosting();
    const { data, error: e1 } = await supabase.from("organisations").select("settings").eq("id", org.id).single();
    if (e1) throw new Error(e1.message);
    const settings = (data?.settings ?? {}) as Record<string, unknown>;
    const before = readHosting(settings);
    const clean = readHosting({ hosting: input });
    const { error } = await supabase.from("organisations").update({ settings: { ...settings, hosting: clean } }).eq("id", org.id);
    if (error) throw new Error(error.message);
    const flips = (["dryRun", "autoSuspend", "autoUnsuspend"] as const).filter((k) => before[k] !== clean[k]).map((k) => `${k} ${clean[k] ? "on" : "off"}`);
    await logEvent(db, { orgId: org.id, action: "setting", detail: `Hosting settings saved${flips.length ? ` (${flips.join(", ")})` : ""}`, actor: user.id });
    await checkBilling(db, org.id, clean);
    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: err(e) }; }
}
