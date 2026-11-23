import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WebHomeData } from "@/components/portal/web-home";
import { planCategory, type TicketStatus } from "./core";
import type { Unit } from "@/lib/recurring/core";
import { cmpVersion, packPrice, readCare, readPrefs } from "./care";
import { latestVersions, loadBlock } from "./care-server";
import { readNerd } from "./core";

/**
 * The portal dashboard for a web agency's client. Uses the service client, so it is ONLY called after requirePortal()
 * has proved who the client is — every query is limited to their own customer ids, and only client-safe columns
 * are read (no internal notes, costs or hosting credentials).
 */
export async function loadWebHome(db: SupabaseClient, o: { slug: string; orgId: string; customerIds: string[]; business: string; name: string; currency: string; tz: string }): Promise<WebHomeData> {
  const ids = o.customerIds;
  const [sites, plans, tickets, invoices, org] = await Promise.all([
    db.from("websites").select("id, domain, status, hosting_account_id, hosting_accounts(suspended)").eq("organisation_id", o.orgId).in("customer_id", ids).neq("status", "archived").order("domain"),
    db.from("recurring_invoices").select("id, name, category, creates_ticket, total, every, unit, next_date, status, website_id, websites(domain)").eq("organisation_id", o.orgId).in("customer_id", ids).neq("status", "ended").order("next_date"),
    db.from("support_tickets").select("id, number, subject, status, kind, last_activity_at, resolved_at, checklist, websites(domain)").eq("organisation_id", o.orgId).in("customer_id", ids).order("last_activity_at", { ascending: false }).limit(100),
    db.from("invoices").select("id, number, issue_date, due_date, total, balance, status, pay_token").eq("organisation_id", o.orgId).in("customer_id", ids).not("status", "in", "(draft,void)").order("issue_date", { ascending: false }).limit(200),
    db.from("organisations").select("settings").eq("id", o.orgId).maybeSingle(),
  ]);
  // Care Hub: prepaid hours, what each site needs updating, the latest versions, the client's own layout
  const siteIds = ((sites.data ?? []) as { id: string }[]).map((x) => x.id);
  const [block, conns, versions, prefRow, ads] = await Promise.all([
    loadBlock(db, o.orgId, ids).catch(() => null),
    siteIds.length ? db.from("website_connectors").select("website_id, wp_version, wp_update, wc_version, php_version, updates_core, updates_plugins, updates_themes, plugins, themes, last_checked_at").in("website_id", siteIds).then((r) => r.data ?? [], () => []) : Promise.resolve([]),
    latestVersions(),
    db.from("customers").select("portal_prefs").eq("id", ids[0]).maybeSingle().then((r) => r.data, () => null),
    db.from("mk_accounts").select("id, name, mk_reports(token, period_start, status)").eq("organisation_id", o.orgId).in("customer_id", ids).then((r) => r.data ?? [], () => []),
  ]);
  const settings = org.data?.settings ?? {};
  const care = readCare(settings);
  const nerd = readNerd(settings);
  type C = { website_id: string; wp_version: string | null; wp_update: string | null; wc_version: string | null; php_version: string | null; updates_core: number; updates_plugins: number; updates_themes: number; plugins: { name: string; version: string; active: boolean; update: string | null }[] | null; themes: { name: string; version: string; active: boolean; update: string | null }[] | null; last_checked_at: string | null };
  const connBySite = new Map(((conns ?? []) as C[]).map((c) => [c.website_id, c]));
  type S = { id: string; domain: string; status: string; hosting_account_id: string | null; hosting_accounts: { suspended: boolean } | null };
  type P = { id: string; name: string; category: string; creates_ticket: boolean; total: number; every: number; unit: Unit; next_date: string; status: string; website_id: string | null; websites: { domain: string } | null };
  type T = { id: string; number: number; subject: string; status: TicketStatus; kind: string; last_activity_at: string; resolved_at: string | null; checklist: unknown; websites: { domain: string } | null };
  const planRows = (plans.data ?? []) as unknown as P[];
  const site = ((org.data?.settings ?? {}) as { site?: { domain?: string | null } }).site;
  return {
    slug: o.slug, business: o.business, name: o.name, currency: o.currency, tz: o.tz,
    quoteHref: site?.domain ? `https://${site.domain}/quote` : `/site/${o.slug}/quote`,
    sites: ((sites.data ?? []) as unknown as S[]).map((s) => ({
      id: s.id, domain: s.domain, status: s.status, hosted: !!s.hosting_account_id, suspended: !!s.hosting_accounts?.suspended,
      plans: [...new Set(planRows.filter((p) => p.website_id === s.id).map((p) => planCategory(p)))],
      care: (() => {
        const c = connBySite.get(s.id);
        if (!c) return null;
        const pending = [
          ...(Array.isArray(c.plugins) ? c.plugins : []).filter((x) => x && x.update).map((x) => ({ name: String(x.name), from: String(x.version ?? ""), to: String(x.update), kind: "plugin" as const })),
          ...(Array.isArray(c.themes) ? c.themes : []).filter((x) => x && x.update).map((x) => ({ name: String(x.name), from: String(x.version ?? ""), to: String(x.update), kind: "theme" as const })),
        ];
        return { wp: c.wp_version, wpUpdate: c.wp_update, wc: c.wc_version, php: c.php_version, checkedAt: c.last_checked_at, pending,
          plugins: Array.isArray(c.plugins) ? c.plugins.length : 0,
          behindWp: !!(c.wp_version && versions.wordpress && cmpVersion(c.wp_version, versions.wordpress) < 0),
          behindWc: !!(c.wc_version && versions.woocommerce && cmpVersion(c.wc_version, versions.woocommerce) < 0) };
      })(),
    })),
    customerId: ids[0],
    customers: ids,
    care: care.enabled ? {
      block: block ? { leftMin: block.leftMin, boughtMin: block.boughtMin, usedMin: block.usedMin, pendingMin: block.pendingMin, unpaid: block.blocks.filter((b) => !b.paid && b.invoice).map((b) => ({ hours: b.hours, number: b.invoice!.number, payToken: b.invoice!.pay_token })), recent: block.usage.slice(0, 5) } : null,
      packs: care.packs.map((p) => ({ ...p, ...packPrice(p, nerd.hourlyRate) })),
      minHours: nerd.minHours,
    } : null,
    versions,
    ads: { feeExGst: care.adsFeeExGst, rate: nerd.hourlyRate, accounts: ((ads ?? []) as unknown as { id: string; name: string; mk_reports: { token: string; period_start: string; status: string }[] | null }[]).map((a) => {
      const last = (a.mk_reports ?? []).filter((r) => r.status === "sent").sort((x, y) => y.period_start.localeCompare(x.period_start))[0];
      return { id: a.id, name: a.name, report: last ? { token: last.token, month: last.period_start } : null };
    }), hasPlan: planRows.some((p) => planCategory(p) === "adwords" && p.status !== "ended") },
    prefs: readPrefs((prefRow as { portal_prefs?: unknown } | null)?.portal_prefs),
    plans: planRows.map((p) => ({ id: p.id, name: p.name, category: planCategory(p), total: Number(p.total), every: p.every, unit: p.unit, next_date: p.next_date, status: p.status, website: p.websites?.domain ?? null })),
    tickets: ((tickets.data ?? []) as unknown as T[]).map((t) => ({ id: t.id, number: t.number, subject: t.subject, status: t.status, kind: t.kind, last_activity_at: t.last_activity_at, resolved_at: t.resolved_at, checklist: t.checklist, website: t.websites?.domain ?? null })),
    invoices: ((invoices.data ?? []) as { id: string; number: string | null; issue_date: string; due_date: string | null; total: number; balance: number | null; status: string; pay_token: string }[])
      .map((i) => ({ ...i, total: Number(i.total), balance: Number(i.balance ?? 0) })),
  };
}
