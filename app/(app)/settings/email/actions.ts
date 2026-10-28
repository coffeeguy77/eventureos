"use server";

import { revalidatePath } from "next/cache";
import { canManage, requireOrg } from "@/lib/context";
import { actorName, logActivity } from "@/lib/activity";
import { PROVIDER, newForwardingAddress } from "@/lib/email/inbound";
import { cleanLocal, cleanSendingDomain, readEmailDomain, refreshDomain, registerDomain, type EmailDomain } from "@/lib/email/domains";

/** Settings → Email: the business's forwarding address and its own sending domain. */
type R<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: e instanceof Error ? e.message : String(e) });

async function manager() {
  const ctx = await requireOrg();
  if (!canManage(ctx.role)) throw new Error("Only owners, admins and managers can change email settings.");
  return ctx;
}
const done = () => revalidatePath("/settings/email");

export async function createForwarding(): Promise<R<string>> {
  try {
    const { supabase, org, user, profile } = await manager();
    const { data: have } = await supabase.from("integrations").select("id, account_label, status").eq("organisation_id", org.id).eq("provider", PROVIDER).maybeSingle();
    if (have?.account_label) {
      if (have.status !== "connected") await supabase.from("integrations").update({ status: "connected" }).eq("id", have.id);
      done();
      return { ok: true, data: have.account_label as string };
    }
    const address = newForwardingAddress(org.slug);
    const { error } = await supabase.from("integrations").insert({
      organisation_id: org.id, provider: PROVIDER, status: "connected", account_label: address, external_account_id: null,
      settings: { recent: [], confirmations: [], sources: [] }, connected_at: new Date().toISOString(), connected_by: user.id,
    });
    if (error) throw new Error(`Couldn't create the forwarding address: ${error.message}`);
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "email.forwarding_created", entityType: "organisation", entityId: org.id, summary: `${actorName(profile)} created the forwarding address ${address}` });
    done();
    return { ok: true, data: address };
  } catch (e) { return fail(e); }
}

export async function setForwarding(on: boolean): Promise<R> {
  try {
    const { supabase, org, user, profile } = await manager();
    const { error } = await supabase.from("integrations").update({ status: on ? "connected" : "disconnected" }).eq("organisation_id", org.id).eq("provider", PROVIDER);
    if (error) throw new Error(error.message);
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "email.forwarding", entityType: "organisation", entityId: org.id, summary: `${actorName(profile)} switched forwarded email ${on ? "on" : "off"}` });
    done();
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

/** A new address (the old one stops working) — e.g. if it has been leaked and attracts junk. */
export async function newAddress(): Promise<R<string>> {
  try {
    const { supabase, org, user, profile } = await manager();
    const address = newForwardingAddress(org.slug);
    const { error } = await supabase.from("integrations").update({ account_label: address }).eq("organisation_id", org.id).eq("provider", PROVIDER);
    if (error) throw new Error(error.message);
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "email.forwarding_changed", entityType: "organisation", entityId: org.id, summary: `${actorName(profile)} changed the forwarding address to ${address}` });
    done();
    return { ok: true, data: address };
  } catch (e) { return fail(e); }
}

async function saveDomain(supabase: Awaited<ReturnType<typeof requireOrg>>["supabase"], orgId: string, d: EmailDomain | null) {
  const { data: o, error: e1 } = await supabase.from("organisations").select("settings").eq("id", orgId).single();
  if (e1) throw new Error(e1.message);
  const settings = { ...((o.settings ?? {}) as Record<string, unknown>) };
  if (d) settings.email_domain = d; else delete settings.email_domain;
  const { error } = await supabase.from("organisations").update({ settings }).eq("id", orgId);
  if (error) throw new Error(`Couldn't save: ${error.message}`);
}

export async function startDomain(input: { domain: string; from_local: string; from_name: string }): Promise<R> {
  try {
    const { supabase, org, user, profile } = await manager();
    const domain = cleanSendingDomain(input.domain);
    const from_local = cleanLocal(input.from_local);
    const r = await registerDomain(domain);
    const d: EmailDomain = { domain, resend_id: r.id, status: r.status, records: r.records, from_local, from_name: input.from_name?.trim().slice(0, 70) || null, use: true, verified_at: r.status === "verified" ? new Date().toISOString() : null, checked_at: new Date().toISOString(), error: null };
    await saveDomain(supabase, org.id, d);
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "email.domain_added", entityType: "organisation", entityId: org.id, summary: `${actorName(profile)} started verifying ${domain} for sending email` });
    done();
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

export async function checkDomain(): Promise<R<string>> {
  try {
    const { supabase, org } = await manager();
    const { data: o } = await supabase.from("organisations").select("settings").eq("id", org.id).single();
    const d = readEmailDomain(o?.settings);
    if (!d) throw new Error("No domain to check yet.");
    const next = await refreshDomain(d);
    await saveDomain(supabase, org.id, next);
    done();
    return { ok: true, data: next.status === "verified" ? "Verified — emails now come from your domain." : next.error ?? "Not verified yet. DNS changes can take a few minutes (sometimes a few hours) — check again shortly." };
  } catch (e) { return fail(e); }
}

export async function updateSender(input: { from_local: string; from_name: string; use: boolean }): Promise<R> {
  try {
    const { supabase, org } = await manager();
    const { data: o } = await supabase.from("organisations").select("settings").eq("id", org.id).single();
    const d = readEmailDomain(o?.settings);
    if (!d) throw new Error("Add your domain first.");
    await saveDomain(supabase, org.id, { ...d, from_local: cleanLocal(input.from_local), from_name: input.from_name?.trim().slice(0, 70) || null, use: !!input.use });
    done();
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

export async function removeDomain(): Promise<R> {
  try {
    const { supabase, org, user, profile } = await manager();
    await saveDomain(supabase, org.id, null);
    await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "email.domain_removed", entityType: "organisation", entityId: org.id, summary: `${actorName(profile)} stopped sending from their own domain` });
    done();
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

export async function saveReplyTo(email: string): Promise<R> {
  try {
    const { supabase, org } = await manager();
    const v = email.trim().toLowerCase();
    if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) throw new Error("That email address doesn't look right.");
    const { data: o } = await supabase.from("organisations").select("settings").eq("id", org.id).single();
    const settings = { ...((o?.settings ?? {}) as Record<string, unknown>) };
    if (v) settings.reply_to = v; else delete settings.reply_to;
    const { error } = await supabase.from("organisations").update({ settings }).eq("id", org.id);
    if (error) throw new Error(error.message);
    done();
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}
