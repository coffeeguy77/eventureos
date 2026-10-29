"use server";

import { canManage, requireOrg } from "@/lib/context";
import { cleanDomain, findings, mailProvider, VERCEL_IPS, type Finding } from "@/lib/diagnostics/core";

export type CheckResult = { domain: string; findings: Finding[]; checkedAt: string };
type R<T> = { ok: true; data: T } | { ok: false; error: string };

async function ctx() {
  const c = await requireOrg();
  if (!canManage(c.role)) throw new Error("Only owners, admins and managers can run site checks.");
  return c;
}

/** Website, email, SSL and domain checks for one domain. */
export async function checkSite(input: string): Promise<R<CheckResult>> {
  try {
    const { supabase, org } = await ctx();
    const domain = cleanDomain(input);
    if (!domain) throw new Error("Enter a domain, like example.com.au.");
    const { lookup, ourServers } = await import("@/lib/diagnostics/server");
    const [ours, raw] = await Promise.all([ourServers(supabase, org.id), lookup(domain)]);
    return { ok: true, data: { domain, findings: findings(raw, ours), checkedAt: new Date().toISOString() } };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

export interface QuickRow { id: string; domain: string; customer: string | null; customerId: string | null; suspended: boolean; web: "ours" | "elsewhere" | "none"; webTo: string; email: string; emailLevel: "ok" | "info" | "bad"; dns: string | null; error: string | null }

/** Quick DNS check of every hosting account: is the site still ours, and is email working? Problems first. */
export async function checkAllSites(): Promise<R<{ rows: QuickRow[]; ours: number }>> {
  try {
    const { supabase, org } = await ctx();
    const { data, error } = await supabase.from("hosting_accounts").select("id, domain, suspended, on_server, customer_id, customers(name)").eq("organisation_id", org.id).eq("on_server", true).order("domain").limit(400);
    if (error) throw new Error(error.message);
    const { lookup, ourServers } = await import("@/lib/diagnostics/server");
    const { dnsHost } = await import("@/lib/diagnostics/core");
    const ours = await ourServers(supabase, org.id);
    const list = (data ?? []) as unknown as { id: string; domain: string; suspended: boolean; customer_id: string | null; customers: { name: string } | null }[];
    const rows: QuickRow[] = [];
    let i = 0;
    const worker = async () => {
      while (i < list.length) {
        const a = list[i++];
        const domain = a.domain.replace(/^www\./, "");
        try {
          const r = await lookup(domain, true);
          const isOurs = (ip: string) => ours.ips.includes(ip) || VERCEL_IPS.includes(ip);
          const mp = mailProvider(r.mx, ours);
          const deadMx = r.mx.length > 0 && r.mx.every((m) => !m.ips.length);
          rows.push({ id: a.id, domain, customer: a.customers?.name ?? null, customerId: a.customer_id, suspended: a.suspended,
            web: !r.a.length ? "none" : r.a.every(isOurs) ? "ours" : "elsewhere", webTo: r.a.join(", "),
            email: !r.mx.length ? "No MX — bouncing" : deadMx ? "MX doesn't exist — bouncing" : mp?.name ?? "Other",
            emailLevel: !r.mx.length || deadMx ? "bad" : mp?.ours ? "ok" : "info", dns: dnsHost(r.ns), error: r.dnsError });
        } catch (e) {
          rows.push({ id: a.id, domain, customer: a.customers?.name ?? null, customerId: a.customer_id, suspended: a.suspended, web: "none", webTo: "", email: "—", emailLevel: "bad", dns: null, error: e instanceof Error ? e.message : String(e) });
        }
      }
    };
    await Promise.all(Array.from({ length: 12 }, worker));
    const score = (r: QuickRow) => (r.emailLevel === "bad" ? 0 : r.web !== "ours" ? 1 : r.emailLevel === "info" ? 2 : 3);
    rows.sort((a, b) => score(a) - score(b) || a.domain.localeCompare(b.domain));
    return { ok: true, data: { rows, ours: ours.ips.length } };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}
