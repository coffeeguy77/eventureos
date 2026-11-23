"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/context";
import { actorName, logActivity } from "@/lib/activity";
import { cleanHost, readSite } from "@/lib/site/site";
import { describe, missingRecords, type DnsRecord } from "@/lib/domains/dns";
import { addRecord, connectDomain, scanMail, vercelRecords } from "@/lib/domains/server";

/** Settings → Domain & email: the business's own domain on EventureOS, without breaking its email. */
type R<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: e instanceof Error ? e.message : String(e) });

async function admin() {
  const ctx = await requireOrg();
  if (ctx.role !== "owner" && ctx.role !== "admin") throw new Error("Only owners and admins can change the domain — it controls your website and email.");
  return ctx;
}
async function saveSite(orgId: string, patch: Record<string, unknown>) {
  const { createServiceClient } = await import("@/lib/integrations/runtime");
  const db = createServiceClient();
  const { data } = await db.from("organisations").select("settings").eq("id", orgId).single();
  const all = (data?.settings ?? {}) as Record<string, unknown>;
  const site = { ...((all.site as Record<string, unknown>) ?? {}), ...patch };
  const { error } = await db.from("organisations").update({ settings: { ...all, site } }).eq("id", orgId);
  if (error) throw new Error(error.message);
}
const done = () => { revalidatePath("/settings/domain"); revalidatePath("/website"); };

/** Set (or clear) the domain this business's website answers on. */
export async function saveDomain(raw: string): Promise<R> {
  try {
    const { org, user, profile, supabase } = await admin();
    const input = raw.trim();
    const domain = input ? cleanHost(input.replace(/^www\./i, "")) : null;
    if (input && !domain) throw new Error("Enter the domain only, like yourbusiness.com.au.");
    if (domain) {
      const { createServiceClient } = await import("@/lib/integrations/runtime");
      const { data: taken } = await createServiceClient().from("organisations").select("id").neq("id", org.id).or(`settings->site->>domain.eq.${domain},settings->site->>domain.eq.www.${domain}`).limit(1);
      if (taken?.length) throw new Error(`${domain} is already set up for another business on EventureOS.`);
    }
    await saveSite(org.id, domain ? { domain } : { domain: null, live: false });
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "settings.updated", entityType: "organisation", entityId: org.id, summary: `${actorName(profile)} ${domain ? `set the website domain to ${domain}` : "removed the website domain"}` });
    done();
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

/** Connect the domain to EventureOS and copy the records that keep email working. Only adds — never removes. */
export async function connectAndCopy(): Promise<R<{ added: string[]; notes: string[] }>> {
  try {
    const { org, user, profile, supabase } = await admin();
    const domain = readSite(org.settings).domain;
    if (!domain) throw new Error("Save your domain first.");
    const notes = await connectDomain(domain);
    const [{ records: found }, existing] = await Promise.all([scanMail(domain), vercelRecords(domain)]);
    const todo = missingRecords(found, existing);
    const added: string[] = [];
    for (const r of todo) { await addRecord(domain, r, `${describe(r)} (copied by EventureOS)`); added.push(`${r.type} ${r.name || "@"}`); }
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "settings.updated", entityType: "organisation", entityId: org.id, summary: `${actorName(profile)} connected ${domain} to EventureOS${added.length ? ` and copied ${added.length} email record${added.length === 1 ? "" : "s"}` : ""}` });
    done();
    return { ok: true, data: { added, notes } };
  } catch (e) { return fail(e); }
}

/** Add one record by hand (e.g. a Google DKIM key, or a subdomain for another site). */
export async function addDnsRecord(i: { type: string; name: string; value: string; priority?: number | null }): Promise<R> {
  try {
    const { org } = await admin();
    const domain = readSite(org.settings).domain;
    if (!domain) throw new Error("Save your domain first.");
    const type = String(i.type).toUpperCase() as DnsRecord["type"];
    if (!["A", "AAAA", "CNAME", "MX", "TXT"].includes(type)) throw new Error("Choose A, AAAA, CNAME, MX or TXT.");
    const name = String(i.name ?? "").trim().toLowerCase().replace(/\.$/, "").replace(new RegExp(`\\.?${domain.replace(/\./g, "\\.")}$`), "").replace(/^@$/, "");
    if (name && !/^[a-z0-9_*]([a-z0-9_.-]{0,200}[a-z0-9_])?$/.test(name)) throw new Error("The name can only use letters, numbers, dots, dashes and underscores.");
    const value = String(i.value ?? "").trim();
    if (!value || value.length > 2000) throw new Error("Enter the value.");
    if (type === "A" && !/^(\d{1,3}\.){3}\d{1,3}$/.test(value)) throw new Error("An A record's value is an IPv4 address, like 35.213.165.118.");
    if ((type === "CNAME" || type === "MX") && !/^[a-z0-9.-]+\.[a-z]{2,}\.?$/i.test(value)) throw new Error("Enter a host name, like mail.example.com.");
    if (["A", "AAAA", "CNAME"].includes(type) && (name === "" || name === "www")) throw new Error("The main address and www are handled by EventureOS — use a subdomain, like shop.");
    await addRecord(domain, { type, name, value, priority: type === "MX" ? Number(i.priority ?? 10) : null }, "Added in EventureOS settings");
    done();
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

/** Use the domain as the website's main address (Google's canonical) — switch on once the domain points here. */
export async function setLive(on: boolean): Promise<R> {
  try {
    const { org, user, profile, supabase } = await admin();
    const site = readSite(org.settings);
    if (on && !site.domain) throw new Error("Save your domain first.");
    await saveSite(org.id, { live: !!on });
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "settings.updated", entityType: "organisation", entityId: org.id, summary: `${actorName(profile)} ${on ? "made" : "stopped"} ${site.domain} ${on ? "the website's main address" : "being the website's main address"}` });
    done();
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}
