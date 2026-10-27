import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appBaseUrl } from "@/lib/integrations/registry";
import {
  billingReference, billingState, canAutoSuspend, canAutoUnsuspend, codeRules, fillNotice, hasMarker, matchInvoice, normalizeDomain, readHosting, stripMarker, withMarker,
  type HostingSettings, type Inv,
} from "./core";
import { whmAccounts, whmSuspend, whmUnsuspend, whmVersion, type WhmServer } from "./whm";

/**
 * Hosting (server side): sync accounts from WHM, work out who's paid (from the invoices table — Xero-synced or made
 * here), send notices, suspend and unsuspend. Every action is logged in hosting_events. With dry-run on (the default)
 * nothing is changed on a server and no email is sent — it's logged as what would have happened.
 */
export type Account = Record<string, unknown> & {
  id: string; organisation_id: string; server_id: string; domain: string; username: string | null; suspended: boolean; suspend_reason: string | null;
  suspended_by_app: boolean; suspension_category: string | null; customer_id: string | null; contact_email: string | null; cc_emails: string[]; server_email: string | null;
  billing_reference: string | null; vip: boolean; disputed: boolean; manual_override: boolean; extension_until: string | null; auto_check: boolean; auto_unsuspend: boolean;
  billing_status: string | null; match_status: string | null; invoice_id: string | null; amount_due: number | null; due_date: string | null; days_overdue: number | null;
  last_notice_at: string | null; last_notice_type: string | null; owner: string | null; site_key: string;
};
type Server = { id: string; organisation_id: string; name: string; kind: "whm" | "siteground"; host: string | null; port: number; username: string | null; verify_tls: boolean; active: boolean };

export async function logEvent(db: SupabaseClient, e: { orgId: string; accountId?: string | null; serverId?: string | null; action: string; ok?: boolean; dryRun?: boolean; detail?: string | null; actor?: string | null }) {
  await db.from("hosting_events").insert({ organisation_id: e.orgId, account_id: e.accountId ?? null, server_id: e.serverId ?? null, action: e.action, ok: e.ok !== false, dry_run: !!e.dryRun, detail: e.detail?.slice(0, 2000) ?? null, actor: e.actor ?? null }).then(() => undefined, () => undefined);
}

async function settingsFor(db: SupabaseClient, orgId: string) {
  const { data } = await db.from("organisations").select("name, logo_url, brand_colour, contact_email, settings").eq("id", orgId).single();
  return { org: data as { name: string; logo_url: string | null; brand_colour: string | null; contact_email: string | null; settings: unknown }, s: readHosting(data?.settings) };
}

async function whmFor(db: SupabaseClient, server: Server): Promise<WhmServer> {
  if (server.kind !== "whm" || !server.host || !server.username) throw new Error(`${server.name} isn't a WHM server with a login.`);
  const { data } = await db.from("hosting_server_credentials").select("token").eq("server_id", server.id).maybeSingle();
  if (!data?.token) throw new Error(`${server.name} has no API token yet — add it under Servers.`);
  return { host: server.host, port: server.port, username: server.username, token: data.token as string, verify_tls: server.verify_tls };
}

export async function testServer(db: SupabaseClient, server: Server) {
  return whmVersion(await whmFor(db, server));
}

/** Pull the account list from a WHM server and bring hosting_accounts up to date (suspension state included). */
export async function syncServer(db: SupabaseClient, server: Server, actor: string | null = null) {
  try {
    const live = await whmAccounts(await whmFor(db, server));
    const { data: have } = await db.from("hosting_accounts").select("id, username, domain, suspended, suspended_by_app, suspension_category, on_server").eq("server_id", server.id);
    const byUser = new Map(((have ?? []) as { id: string; username: string | null; domain: string; suspended: boolean; suspended_by_app: boolean; suspension_category: string | null; on_server: boolean }[]).map((h) => [h.username ?? `@${h.domain}`, h]));
    const now = new Date().toISOString();
    const fresh = [];
    let changed = 0;
    for (const a of live) {
      const ours = a.suspended && hasMarker(a.suspendReason);
      const row = {
        domain: normalizeDomain(a.domain), plan: a.plan || null, server_email: a.email || null, owner: a.owner || null, disk_used_mb: a.diskUsedMb, disk_limit_mb: a.diskLimitMb, on_server: true,
        suspended: a.suspended, suspend_reason: a.suspendReason,
        // provenance comes from the live marker: an outside unsuspend/resuspend drops it, so it's never treated as ours again
        suspended_by_app: ours, updated_at: now,
      };
      const h = byUser.get(a.username);
      if (h) {
        const category = ours ? h.suspension_category ?? "billing_overdue" : null;
        await db.from("hosting_accounts").update({ ...row, suspension_category: category, ...(a.suspended && !h.suspended ? { suspended_at: now } : {}) }).eq("id", h.id);
        byUser.delete(a.username); changed++;
      } else {
        fresh.push({ ...row, organisation_id: server.organisation_id, server_id: server.id, username: a.username, billing_reference: billingReference(a.domain), suspension_category: ours ? "billing_overdue" : null, suspended_at: a.suspended ? now : null });
      }
    }
    for (let k = 0; k < fresh.length; k += 200) { const { error } = await db.from("hosting_accounts").insert(fresh.slice(k, k + 200)); if (error) throw new Error(error.message); }
    const gone = [...byUser.values()].filter((h) => h.on_server && h.username).map((h) => h.id);
    if (gone.length) await db.from("hosting_accounts").update({ on_server: false, updated_at: now }).in("id", gone);
    await db.from("hosting_servers").update({ last_sync_at: now, last_sync_status: "ok", last_error: null, account_count: live.length, updated_at: now }).eq("id", server.id);
    const msg = `${live.length} accounts on ${server.name}: ${fresh.length} new, ${changed} updated${gone.length ? `, ${gone.length} no longer on the server` : ""}.`;
    await logEvent(db, { orgId: server.organisation_id, serverId: server.id, action: "sync", detail: msg, actor });
    return msg;
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    await db.from("hosting_servers").update({ last_sync_at: new Date().toISOString(), last_sync_status: "error", last_error: m.slice(0, 500) }).eq("id", server.id);
    await logEvent(db, { orgId: server.organisation_id, serverId: server.id, action: "sync", ok: false, detail: m, actor });
    throw new Error(`${server.name}: ${m}`);
  }
}

type InvRow = { id: string; number: string; reference: string | null; status: string; total: number; amount_paid: number | null; due_date: string | null; issue_date: string | null; line_items: { item_code?: string | null }[] | null; customer_id: string | null; pay_token: string | null };
const toInv = (r: InvRow): Inv => ({
  id: r.id, number: r.number, reference: r.reference, status: r.status, total: Number(r.total) || 0, amountPaid: Number(r.amount_paid) || 0, dueDate: r.due_date, issueDate: r.issue_date,
  itemCodes: (Array.isArray(r.line_items) ? r.line_items : []).map((l) => (l?.item_code ?? "").trim()).filter(Boolean), customerId: r.customer_id, payToken: r.pay_token,
  text: `${r.reference ?? ""} ${(Array.isArray(r.line_items) ? r.line_items : []).map((l) => (l as { description?: string | null })?.description ?? "").join(" ")}`.toLowerCase(),
});
const INV_COLS = "id, number, reference, status, total, amount_paid, due_date, issue_date, line_items, customer_id, pay_token";

async function loadInvoices(db: SupabaseClient, orgId: string, customerIds: string[]) {
  const out = new Map<string, Inv>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("invoices").select(INV_COLS).eq("organisation_id", orgId).ilike("reference", "%HOSTING |%").range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as InvRow[]) out.set(r.id, toInv(r));
    if ((data ?? []).length < 1000) break;
  }
  for (let k = 0; k < customerIds.length; k += 100) {
    const { data } = await db.from("invoices").select(INV_COLS).eq("organisation_id", orgId).in("customer_id", customerIds.slice(k, k + 100)).gte("issue_date", new Date(Date.now() - 800 * 86_400_000).toISOString().slice(0, 10)).limit(5000);
    for (const r of (data ?? []) as InvRow[]) out.set(r.id, toInv(r));
  }
  return [...out.values()];
}

/** Recompute every account's billing state from the invoices. Database only — run it as often as you like. */
export async function checkBilling(db: SupabaseClient, orgId: string, s?: HostingSettings) {
  const S = s ?? (await settingsFor(db, orgId)).s;
  const { data } = await db.from("hosting_accounts").select("*").eq("organisation_id", orgId).limit(5000);
  const accounts = (data ?? []) as Account[];
  const invoices = await loadInvoices(db, orgId, [...new Set(accounts.map((a) => a.customer_id).filter(Boolean) as string[])]);
  const rules = codeRules(S);
  const now = new Date();
  let changed = 0;
  for (const a of accounts) {
    const ref = a.billing_reference?.trim() || null;
    const m = matchInvoice(ref, invoices, rules, a.customer_id, a.domain);
    const st = billingState({ hasRef: !!ref, match: m, now, s: S, flags: {
      suspended: a.suspended, byApp: a.suspended_by_app, category: a.suspension_category, manual: a.manual_override, disputed: a.disputed, vip: a.vip,
      lastNoticeAt: a.last_notice_at, lastNoticeType: a.last_notice_type, extensionUntil: a.extension_until,
    } });
    const due = m.invoice ? Math.max(0, Math.round((m.invoice.total - m.invoice.amountPaid) * 100) / 100) : null;
    const next = { billing_status: st.status, match_status: m.status, match_reason: m.reason, invoice_id: m.invoice?.id ?? null, amount_due: due, due_date: m.invoice?.dueDate ?? null, days_overdue: st.daysOverdue };
    const same = Object.entries(next).every(([k, v]) => (a[k] ?? null) == v);
    if (!same) { await db.from("hosting_accounts").update({ ...next, billing_checked_at: now.toISOString(), updated_at: now.toISOString() }).eq("id", a.id); changed++; }
  }
  await db.from("hosting_accounts").update({ billing_checked_at: now.toISOString() }).eq("organisation_id", orgId);
  return { accounts: accounts.length, changed };
}

async function loadAccount(db: SupabaseClient, orgId: string, id: string) {
  const { data } = await db.from("hosting_accounts").select("*, hosting_servers(id, organisation_id, name, kind, host, port, username, verify_tls, active)").eq("id", id).eq("organisation_id", orgId).maybeSingle();
  if (!data) throw new Error("That hosting account no longer exists.");
  const { hosting_servers: server, ...a } = data as Account & { hosting_servers: Server };
  return { a: a as Account, server };
}

/** Suspend: WHM (reason carries the EventureOS marker) or SiteGround (the plugin shows the suspension page). */
export async function suspendAccount(db: SupabaseClient, orgId: string, id: string, o: { reason: string; category: "billing_overdue" | "other"; actor: string | null; auto?: boolean; notify?: boolean }) {
  const { s } = await settingsFor(db, orgId);
  const { a, server } = await loadAccount(db, orgId, id);
  if (a.suspended) return { ok: true, dryRun: false, message: `${a.domain} is already suspended.` };
  const reason = (o.reason || "Overdue hosting invoice").slice(0, 200);
  if (s.dryRun) {
    await logEvent(db, { orgId, accountId: a.id, serverId: server.id, action: o.auto ? "auto_suspend" : "suspend", dryRun: true, detail: `Dry run: would suspend ${a.domain} — ${reason}`, actor: o.actor });
    return { ok: true, dryRun: true, message: `Dry run is on — ${a.domain} was not suspended (logged what would happen).` };
  }
  if (server.kind === "whm") {
    if (!a.username) throw new Error("This account has no cPanel username.");
    const r = await whmSuspend(await whmFor(db, server), a.username, withMarker(reason));
    await logEvent(db, { orgId, accountId: a.id, serverId: server.id, action: o.auto ? "auto_suspend" : "suspend", ok: r.ok, detail: `${r.message} — ${reason}`, actor: o.actor });
    if (!r.ok) throw new Error(`WHM: ${r.message}`);
  } else {
    await logEvent(db, { orgId, accountId: a.id, serverId: server.id, action: o.auto ? "auto_suspend" : "suspend", detail: `Suspension page on — ${reason}`, actor: o.actor });
  }
  const now = new Date().toISOString();
  await db.from("hosting_accounts").update({ suspended: true, suspended_by_app: true, suspension_category: o.category, suspend_reason: withMarker(reason), suspended_at: now, updated_at: now }).eq("id", a.id);
  await checkBilling(db, orgId, s);
  let note = "";
  if (o.notify) { const n = await sendNotice(db, orgId, a.id, "suspension_notice", o.actor); note = ` ${n.message}`; }
  return { ok: true, dryRun: false, message: `${a.domain} suspended.${note}` };
}

export async function unsuspendAccount(db: SupabaseClient, orgId: string, id: string, o: { actor: string | null; auto?: boolean; notify?: boolean }) {
  const { s } = await settingsFor(db, orgId);
  const { a, server } = await loadAccount(db, orgId, id);
  if (!a.suspended) return { ok: true, dryRun: false, message: `${a.domain} isn't suspended.` };
  if (s.dryRun) {
    await logEvent(db, { orgId, accountId: a.id, serverId: server.id, action: o.auto ? "auto_unsuspend" : "unsuspend", dryRun: true, detail: `Dry run: would unsuspend ${a.domain}`, actor: o.actor });
    return { ok: true, dryRun: true, message: `Dry run is on — ${a.domain} was not unsuspended (logged what would happen).` };
  }
  if (server.kind === "whm") {
    if (!a.username) throw new Error("This account has no cPanel username.");
    const r = await whmUnsuspend(await whmFor(db, server), a.username);
    await logEvent(db, { orgId, accountId: a.id, serverId: server.id, action: o.auto ? "auto_unsuspend" : "unsuspend", ok: r.ok, detail: r.message, actor: o.actor });
    if (!r.ok) throw new Error(`WHM: ${r.message}`);
  } else {
    await logEvent(db, { orgId, accountId: a.id, serverId: server.id, action: o.auto ? "auto_unsuspend" : "unsuspend", detail: "Suspension page off", actor: o.actor });
  }
  await db.from("hosting_accounts").update({ suspended: false, suspended_by_app: false, suspension_category: null, suspend_reason: null, updated_at: new Date().toISOString() }).eq("id", a.id);
  await checkBilling(db, orgId, s);
  let note = "";
  if (o.notify) { const n = await sendNotice(db, orgId, a.id, "reactivation_notice", o.actor); note = ` ${n.message}`; }
  return { ok: true, dryRun: false, message: `${a.domain} is back on.${note}` };
}

const money = (n: number | null) => (n == null ? "" : `$${n.toFixed(2)}`);
const ddmmyyyy = (d: string | null) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "");

/** Who a notice goes to: the account's own contact, then the linked client, then the email on the server. */
async function recipient(db: SupabaseClient, a: Account): Promise<{ to: string | null; name: string }> {
  let custEmail: string | null = null, custName: string | null = null;
  if (a.customer_id) {
    const { data } = await db.from("customers").select("name, email").eq("id", a.customer_id).maybeSingle();
    custEmail = (data?.email as string) ?? null; custName = (data?.name as string) ?? null;
  }
  const to = a.contact_email || custEmail || a.server_email || null;
  return { to, name: (custName ?? a.owner ?? "").split(/\s+/)[0] || "there" };
}

export async function noticePreview(db: SupabaseClient, orgId: string, id: string, key: string) {
  const { org, s } = await settingsFor(db, orgId);
  const { a } = await loadAccount(db, orgId, id);
  const t = s.templates.find((x) => x.key === key);
  if (!t) throw new Error("Choose a notice.");
  const { to, name } = await recipient(db, a);
  let inv: { number: string; pay_token: string | null } | null = null;
  if (a.invoice_id) { const { data } = await db.from("invoices").select("number, pay_token").eq("id", a.invoice_id).maybeSingle(); inv = (data as { number: string; pay_token: string | null } | null) ?? null; }
  const payUrl = inv?.pay_token ? `${appBaseUrl()}/pay/${inv.pay_token}` : null;
  const brand = s.brand ?? org.name;
  const words = { domain: a.domain, contact_name: name, invoice: inv?.number ?? "", amount: money(a.amount_due), due_date: ddmmyyyy(a.due_date), days_overdue: String(a.days_overdue ?? 0), pay_link: payUrl ?? "(no online payment link)", brand, reply_to: s.replyTo ?? org.contact_email ?? "" };
  return { to, cc: a.cc_emails ?? [], subject: fillNotice(t.subject, words), message: fillNotice(t.message, words), payUrl, brand, key, s, org, a };
}

/** Send a notice (or, in dry run, just log it). A sent notice starts the notice period before suspension. */
export async function sendNotice(db: SupabaseClient, orgId: string, id: string, key: string, actor: string | null, edited?: { subject: string; message: string }) {
  const p = await noticePreview(db, orgId, id, key);
  if (!p.to) throw new Error(`No email address for ${p.a.domain} — add a contact email or link a client.`);
  const subject = (edited?.subject ?? p.subject).slice(0, 200), message = (edited?.message ?? p.message).slice(0, 6000);
  const now = new Date().toISOString();
  if (p.s.dryRun) {
    await logEvent(db, { orgId, accountId: p.a.id, action: "notice", dryRun: true, detail: `Dry run: "${subject}" to ${p.to} (not sent)`, actor });
  } else {
    const { emailConfigured, sendEmail } = await import("@/lib/email/send");
    if (!emailConfigured()) throw new Error("EventureOS email isn't set up.");
    const { hostingNoticeEmail } = await import("@/lib/email/templates");
    const m = hostingNoticeEmail({ brandName: p.brand, subject, message, payUrl: p.payUrl, brand: p.org.brand_colour, logoUrl: p.s.brand ? null : p.org.logo_url });
    for (const to of [p.to, ...p.cc].filter((x, k, arr) => x && arr.indexOf(x) === k)) await sendEmail({ to, subject, html: m.html, text: m.text, replyTo: p.s.replyTo ?? p.org.contact_email, fromName: p.brand });
    await logEvent(db, { orgId, accountId: p.a.id, action: "notice", detail: `"${subject}" sent to ${[p.to, ...p.cc].join(", ")}`, actor });
  }
  // only a notice that really went counts towards the notice period
  if (!p.s.dryRun) { await db.from("hosting_accounts").update({ last_notice_at: now, last_notice_type: key, updated_at: now }).eq("id", p.a.id); await checkBilling(db, orgId, p.s); }
  return { message: p.s.dryRun ? `Dry run is on — not sent to ${p.to} (logged).` : `Sent to ${p.to}.` };
}

/** Automatic unsuspend (paid) and, if switched on, automatic suspend — with the live WHM marker re-checked first. */
export async function runAutomation(db: SupabaseClient, orgId: string, s: HostingSettings) {
  const { data } = await db.from("hosting_accounts").select("*, hosting_servers(id, organisation_id, name, kind, host, port, username, verify_tls, active)").eq("organisation_id", orgId).eq("on_server", true).limit(5000);
  const rows = (data ?? []) as (Account & { hosting_servers: Server })[];
  const live = new Map<string, Map<string, { suspended: boolean; reason: string | null }> | null>();
  const liveFor = async (server: Server) => {
    if (server.kind !== "whm") return null;
    if (!live.has(server.id)) {
      try { live.set(server.id, new Map((await whmAccounts(await whmFor(db, server))).map((x) => [x.username, { suspended: x.suspended, reason: x.suspendReason }]))); }
      catch { live.set(server.id, null); }
    }
    return live.get(server.id) ?? null;
  };
  const out: string[] = [];
  for (const a of rows) {
    const un = canAutoUnsuspend({ suspended: a.suspended, byApp: a.suspended_by_app, category: a.suspension_category, vip: a.vip, disputed: a.disputed, manual: a.manual_override, autoUnsuspend: a.auto_unsuspend, matchStatus: a.match_status, billingStatus: a.billing_status, amountDue: a.amount_due }, s.autoUnsuspend);
    if (un.ok) {
      if (a.hosting_servers.kind === "whm") {
        const m = await liveFor(a.hosting_servers);
        const l = m?.get(a.username ?? "");
        if (!m || !l) { out.push(`${a.domain}: skipped — couldn't confirm on the server`); continue; }
        if (!(l.suspended && hasMarker(l.reason))) {
          await db.from("hosting_accounts").update({ suspended_by_app: false, suspension_category: null }).eq("id", a.id);
          await logEvent(db, { orgId, accountId: a.id, action: "auto_unsuspend", ok: false, detail: "Skipped: the live suspension on WHM is no longer one EventureOS made" });
          continue;
        }
      }
      try { const r = await unsuspendAccount(db, orgId, a.id, { actor: null, auto: true }); out.push(`${a.domain}: ${r.message}`); } catch (e) { out.push(`${a.domain}: ${e instanceof Error ? e.message : e}`); }
      continue;
    }
    const sus = canAutoSuspend({ suspended: a.suspended, matchStatus: a.match_status, billingStatus: a.billing_status, daysOverdue: a.days_overdue, vip: a.vip, disputed: a.disputed, manual: a.manual_override, autoCheck: a.auto_check }, s);
    if (sus.ok) {
      try { const r = await suspendAccount(db, orgId, a.id, { reason: `Overdue hosting invoice (${a.days_overdue} days)`, category: "billing_overdue", actor: null, auto: true }); out.push(`${a.domain}: ${r.message}`); }
      catch (e) { out.push(`${a.domain}: ${e instanceof Error ? e.message : e}`); }
    }
  }
  return out;
}

/** The whole run: sync every active WHM server, recheck billing, then the automatic actions. (Cron and "Check now".) */
export async function runHosting(db: SupabaseClient, orgId: string, actor: string | null = null) {
  const { s } = await settingsFor(db, orgId);
  const { data: servers } = await db.from("hosting_servers").select("id, organisation_id, name, kind, host, port, username, verify_tls, active").eq("organisation_id", orgId).eq("active", true).eq("kind", "whm");
  const notes: string[] = [];
  for (const sv of (servers ?? []) as Server[]) { try { notes.push(await syncServer(db, sv, actor)); } catch (e) { notes.push(e instanceof Error ? e.message : String(e)); } }
  const b = await checkBilling(db, orgId, s);
  const auto = await runAutomation(db, orgId, s);
  return { notes, billing: b, auto };
}

/** For the SiteGround plugin: is this site switched off? */
export async function siteStatus(db: SupabaseClient, key: string) {
  if (!/^[0-9a-f]{32}$/.test(key)) return null;
  const { data: a } = await db.from("hosting_accounts").select("organisation_id, domain, suspended, invoice_id").eq("site_key", key).maybeSingle();
  if (!a) return null;
  if (!a.suspended) return { suspended: false as const };
  const { org, s } = await settingsFor(db, a.organisation_id as string);
  let payUrl: string | null = null;
  if (a.invoice_id) { const { data: inv } = await db.from("invoices").select("pay_token, status").eq("id", a.invoice_id).maybeSingle(); if (inv?.pay_token && inv.status !== "paid") payUrl = `${appBaseUrl()}/pay/${inv.pay_token}`; }
  return { suspended: true as const, title: s.suspendTitle, message: s.suspendMessage, payUrl, contact: s.replyTo ?? org.contact_email, brand: s.brand ?? org.name };
}

export { stripMarker };
