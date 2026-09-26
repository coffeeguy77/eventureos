"use server";

import { revalidatePath } from "next/cache";
import { canManage, requireOrg } from "@/lib/context";
import { actorName, logActivity } from "@/lib/activity";
import { CLASSIFICATIONS, type Classification } from "@/lib/ai/classify";
import { importGmailHistory } from "@/lib/integrations/gmail-import";
import { gmailSettings } from "@/lib/integrations/gmail-sync";
import { evaluateFilter, resolveFilter, type EmailFilterSettings } from "@/lib/integrations/email-filter";
import { revokeGoogleToken } from "@/lib/integrations/oauth";
import { getProvider, isLiveProvider, type LiveProviderId } from "@/lib/integrations/registry";
import { XERO_CONNECTIONS } from "@/lib/integrations/xero";
import { errMessage, likeExact, saveIntegrationSettings } from "@/lib/integrations/runtime";
import { buildContext, runProviderSync } from "@/lib/integrations/sync-runner";
import { importHistoryForContact, selectTenant } from "@/lib/integrations/xero-sync";

export type ActionState = { error?: string; ok?: string; more?: boolean } | undefined;

const BASE = "/settings/integrations";
const str = (v: FormDataEntryValue | null) => String(v ?? "").trim() || null;
const num = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").replace(/[$,\s]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

async function manager() {
  const ctx = await requireOrg();
  if (!canManage(ctx.role)) throw new Error("Only owners, admins and managers can change integrations.");
  return ctx;
}

function revalidateAll(provider?: string) {
  revalidatePath(BASE);
  revalidatePath(`${BASE}/review`);
  if (provider) revalidatePath(`${BASE}/${provider}`);
}

// ------------------------------------------------------------------------------------------------
// Connection lifecycle
// ------------------------------------------------------------------------------------------------

export async function syncNow(provider: string, _prev: ActionState, form?: FormData): Promise<ActionState> {
  try {
    if (!isLiveProvider(provider)) return { error: "Unknown integration." };
    const { supabase, org, user } = await manager();
    const ctx = await buildContext(supabase, "user", org.id, provider, user.id);
    const r = await runProviderSync(ctx, { full: form?.get("full") === "1" });
    revalidateAll(provider);
    return r.ok ? { ok: r.message, more: /more will be fetched/i.test(r.message) && !/slow down/i.test(r.message) } : { error: r.message };
  } catch (e) {
    return { error: errMessage(e) };
  }
}

export async function disconnect(provider: string): Promise<ActionState> {
  try {
    if (!isLiveProvider(provider)) return { error: "Unknown integration." };
    const { supabase, org, user } = await manager();
    const { data: integ } = await supabase.from("integrations").select("id, settings").eq("organisation_id", org.id).eq("provider", provider).maybeSingle();
    if (!integ) return { error: "Not connected." };
    // Best effort: revoke at the provider too, so EventureOS disappears from the account's connected apps.
    try {
      const { data: tok } = await supabase.rpc("get_integration_tokens", { p_integration_id: integ.id });
      const t = (Array.isArray(tok) ? tok[0] : tok) as { access_token: string | null; refresh_token: string | null } | undefined;
      if (provider !== "xero" && (t?.refresh_token || t?.access_token)) await revokeGoogleToken((t.refresh_token ?? t.access_token)!);
      if (provider === "xero" && t?.access_token) {
        const tenants = ((integ.settings as { tenants?: { connectionId?: string }[] })?.tenants ?? []);
        for (const x of tenants) if (x.connectionId) {
          // DELETE https://api.xero.com/connections/{id} — https://github.com/XeroAPI/Xero-OpenAPI/blob/master/xero-identity.yaml
          await fetch(`${XERO_CONNECTIONS}/${x.connectionId}`, { method: "DELETE", headers: { authorization: `Bearer ${t.access_token}` } }).catch(() => undefined);
        }
      }
    } catch { /* tokens already gone or provider unreachable — still disconnect locally */ }
    const { error } = await supabase.rpc("disconnect_integration", { p_integration_id: integ.id });
    if (error) return { error: `Couldn't disconnect: ${error.message}` };
    if (provider === "google_calendar") {
      await supabase.from("calendar_connections").update({ sync_enabled: false }).eq("organisation_id", org.id).eq("provider", "google");
    }
    void user;
    revalidateAll(provider);
    return { ok: `${getProvider(provider)!.name} disconnected. Synced records stay in EventureOS.` };
  } catch (e) {
    return { error: errMessage(e) };
  }
}

// ------------------------------------------------------------------------------------------------
// Provider settings
// ------------------------------------------------------------------------------------------------

async function withIntegration(provider: LiveProviderId) {
  const c = await manager();
  const ctx = await buildContext(c.supabase, "user", c.org.id, provider, c.user.id);
  return { ...c, sctx: ctx };
}

const SENDER_RE = /^(@?[a-z0-9.-]+\.[a-z]{2,}|[^\s@]+@[^\s@]+\.[^\s@]+)$/i;

export async function saveGmailSettings(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { sctx } = await withIntegration("gmail");
    const lines = (k: string, max = 60) => String(form.get(k) ?? "").split(/\n+/).map((s) => s.trim()).filter(Boolean).slice(0, max);
    const senders = lines("website_form_senders").map((s) => s.toLowerCase());
    const bad = senders.find((s) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
    if (bad) return { error: `“${bad}” isn't an email address.` };
    const allow = lines("filter_allow_senders").map((s) => s.toLowerCase());
    const block = lines("filter_block_senders").map((s) => s.toLowerCase());
    const badList = [...allow, ...block].find((s) => !SENDER_RE.test(s));
    if (badList) return { error: `“${badList}” isn't an email address or domain (e.g. jane@example.com or @example.com).` };
    const keywords = lines("filter_keywords", 80);
    const mode = form.get("filter_mode") === "all" ? "all" : "matching";
    if (mode === "matching" && !keywords.length && !lines("website_subject_patterns").length) {
      return { error: "Add at least one keyword or web-form subject line — otherwise no new emails would be imported." };
    }
    const days = Math.max(1, Math.min(60, Number(form.get("initial_days") ?? 14) || 14));
    await saveIntegrationSettings(sctx, {
      filter_mode: mode,
      filter_keywords: keywords,
      website_subject_patterns: lines("website_subject_patterns"),
      website_form_senders: senders,
      filter_allow_senders: allow,
      filter_block_senders: block,
      ai_enabled: form.get("ai_enabled") === "on",
      initial_days: days,
    });
    revalidateAll("gmail");
    return { ok: "Email filters saved. They apply to every new email from now on — use “Check imported email” below to tidy up what's already here." };
  } catch (e) {
    return { error: errMessage(e) };
  }
}

export type CleanupState = { error?: string; ok?: string; preview?: { threads: number; enquiries: number; messages: number }; } | undefined;

/** Threads (not linked to an event or customer) whose first email fails the current filters. */
async function threadsFailingFilter(supabase: Awaited<ReturnType<typeof requireOrg>>["supabase"], orgId: string, settings: EmailFilterSettings) {
  const filter = resolveFilter(settings);
  const failing: string[] = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data: threads, error } = await supabase.from("email_threads").select("id")
      .eq("organisation_id", orgId).is("event_id", null).is("customer_id", null).order("created_at").range(from, from + pageSize - 1);
    if (error) throw new Error(`Could not read imported email: ${error.message}`);
    if (!threads?.length) break;
    const ids = threads.map((t) => t.id as string);
    const { data: msgs, error: mErr } = await supabase.from("email_messages").select("thread_id, direction, from_email, subject, body_text, sent_at")
      .eq("organisation_id", orgId).in("thread_id", ids).order("sent_at");
    if (mErr) throw new Error(`Could not read imported email: ${mErr.message}`);
    // judge each conversation by its first email from outside the business (or its first email at all)
    type Msg = { thread_id: string; direction: string; from_email: string; subject: string | null; body_text: string | null };
    const first = new Map<string, Msg>();
    for (const m of (msgs ?? []) as Msg[]) {
      const cur = first.get(m.thread_id);
      if (!cur || (cur.direction !== "inbound" && m.direction === "inbound")) first.set(m.thread_id, m);
    }
    for (const id of ids) {
      const m = first.get(id);
      if (!m) { failing.push(id); continue; }
      const d = evaluateFilter(filter, { subject: m.subject, from_email: m.from_email, body: m.body_text });
      if (!d.import) failing.push(id);
    }
    if (threads.length < pageSize) break;
  }
  return failing;
}

export async function emailCleanup(_prev: CleanupState, form: FormData): Promise<CleanupState> {
  try {
    const { supabase, org, sctx } = await withIntegration("gmail");
    const ids = await threadsFailingFilter(supabase, org.id, gmailSettings(sctx));
    const run = form.get("step") === "run";
    if (!ids.length) return { ok: "Everything already imported matches your filters — nothing to remove." };
    const { data, error } = await supabase.rpc("cleanup_filtered_emails", { p_org: org.id, p_thread_ids: ids, p_dry_run: !run });
    if (error) return { error: `Couldn't check imported email: ${error.message}` };
    const r = data as { threads: number; enquiries: number; messages: number };
    if (!run) {
      if (!r.threads) return { ok: "Everything already imported matches your filters (or is linked to a customer or event) — nothing to remove." };
      return { preview: r };
    }
    revalidatePath("/enquiries"); revalidatePath("/dashboard"); revalidateAll("gmail");
    return { ok: `Removed ${r.threads} email conversation${r.threads === 1 ? "" : "s"} and ${r.enquiries} enquir${r.enquiries === 1 ? "y" : "ies"} that didn't match your filters. Nothing was deleted from Gmail.` };
  } catch (e) {
    return { error: errMessage(e) };
  }
}

export async function runGmailImport(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { sctx } = await withIntegration("gmail");
    const months = Number(form.get("months") ?? 12) || 12;
    const r = await importGmailHistory(sctx, { months, restart: form.get("restart") === "1" });
    revalidateAll("gmail");
    return { ok: r.message };
  } catch (e) {
    return { error: errMessage(e) };
  }
}

export async function saveCalendarSettings(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { supabase, org, user, profile, sctx } = await withIntegration("google_calendar");
    const kinds = ["event", "site_visit", "setup", "hold"].filter((k) => form.get(`kind_${k}`) === "on");
    await saveIntegrationSettings(sctx, { sync_kinds: kinds, pull_busy: form.get("pull_busy") === "on" });
    const cals = new Set(((sctx.integration.settings.calendars ?? []) as { id: string }[]).map((c) => c.id));
    const { data: conns } = await supabase.from("calendar_connections").select("id, name, external_calendar_id, sync_enabled, provider").eq("organisation_id", org.id);
    const changes: string[] = [];
    for (const c of conns ?? []) {
      const target = str(form.get(`cal_${c.id}`));
      if (target && !cals.has(target)) return { error: `Pick a calendar from the list for “${c.name}”.` };
      const enabled = !!target && form.get(`sync_${c.id}`) === "on";
      const patch = target
        ? { provider: "google", external_calendar_id: target, sync_enabled: enabled, integration_id: sctx.integration.id }
        : { provider: "local", external_calendar_id: null, sync_enabled: false, integration_id: null };
      if (c.external_calendar_id !== patch.external_calendar_id || c.sync_enabled !== patch.sync_enabled) {
        const { error } = await supabase.from("calendar_connections").update(patch).eq("id", c.id).eq("organisation_id", org.id);
        if (error) return { error: `Couldn't save “${c.name}”: ${error.message}` };
        // a new target calendar means entries must be pushed again
        if (c.external_calendar_id !== patch.external_calendar_id) {
          // busy times imported from the old Google calendar no longer apply
          await supabase.from("calendar_events").delete().eq("calendar_connection_id", c.id).eq("kind", "other").is("event_id", null).not("external_event_id", "is", null).is("created_by", null);
          await supabase.from("calendar_events").update({ sync_status: "pending", external_event_id: null }).eq("calendar_connection_id", c.id);
        }
        changes.push(`${c.name}: ${target ? `${enabled ? "syncs to" : "mapped (paused) to"} ${target}` : "not synced"}`);
      }
    }
    if (changes.length) {
      await logActivity(supabase, {
        orgId: org.id, actorId: user.id, action: "integration.settings_changed", entityType: "integration", entityId: sctx.integration.id,
        summary: `${actorName(profile)} changed Google Calendar sync — ${changes.join("; ")}`,
      });
    }
    revalidateAll("google_calendar");
    revalidatePath("/calendar");
    return { ok: "Calendar sync settings saved." + (changes.length ? " Press Sync now to push entries." : "") };
  } catch (e) {
    return { error: errMessage(e) };
  }
}

export async function saveXeroSettings(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { supabase, org, user, profile, sctx } = await withIntegration("xero");
    const push = String(form.get("push_invoices") ?? "off");
    if (!["off", "draft", "authorised"].includes(push)) return { error: "Choose how invoices are sent to Xero." };
    const code = str(form.get("sales_account_code")) ?? "200";
    if (!/^[A-Za-z0-9.-]{1,10}$/.test(code)) return { error: "The sales account code should be a Xero account code like 200." };
    const tax = str(form.get("tax_type")) ?? "OUTPUT";
    if (!/^[A-Z0-9_]{2,30}$/.test(tax)) return { error: "The tax type should be a Xero tax type code like OUTPUT." };
    const tenant = str(form.get("tenant_id"));
    if (tenant && tenant !== (sctx.integration.settings.tenant_id as string | undefined)) await selectTenant(sctx, tenant);
    await saveIntegrationSettings(sctx, { push_invoices: push, sales_account_code: code, tax_type: tax });

    // Quote acceptance → invoice behaviour lives on the organisation (used by the database automation)
    const action = str(form.get("quote_acceptance_action"));
    const pct = num(form.get("deposit_percent"));
    if (action && ["deposit_invoice", "full_invoice", "manual"].includes(action)) {
      const { data: o } = await supabase.from("organisations").select("settings").eq("id", org.id).single();
      const before = (o?.settings ?? {}) as Record<string, unknown>;
      const next = { ...before, quote_acceptance_action: action, ...(pct != null && pct > 0 && pct <= 100 ? { deposit_percent: pct } : {}) };
      if (JSON.stringify(before) !== JSON.stringify(next)) {
        const { error } = await supabase.from("organisations").update({ settings: next }).eq("id", org.id);
        if (error) return { error: `Couldn't save quote acceptance setting: ${error.message}` };
        await logActivity(supabase, {
          orgId: org.id, actorId: user.id, action: "organisation.settings_changed", entityType: "organisation", entityId: org.id,
          summary: `${actorName(profile)} set quote acceptance to “${action.replace("_", " ")}”${next.deposit_percent ? ` (${next.deposit_percent}% deposit)` : ""}`,
          changes: { quote_acceptance_action: [before.quote_acceptance_action ?? null, action] },
        });
      }
    }
    revalidateAll("xero");
    return { ok: "Xero settings saved." };
  } catch (e) {
    return { error: errMessage(e) };
  }
}

// ------------------------------------------------------------------------------------------------
// IMPORT REVIEW / MATCH REVIEW — nothing merges without a person pressing a button
// ------------------------------------------------------------------------------------------------

interface CandidateRow {
  id: string; source: "gmail" | "xero"; kind: "contact" | "enquiry" | "event" | "invoice"; external_id: string;
  payload: Record<string, unknown>; suggested_customer_id: string | null; score: number | null; status: string;
}

function splitName(name: string | null | undefined, email?: string | null) {
  const n = (name ?? "").trim() || (email ? email.split("@")[0].replace(/[._-]+/g, " ") : "Unknown");
  const parts = n.split(/\s+/);
  return { first: parts[0], last: parts.length > 1 ? parts.slice(1).join(" ") : null, full: n };
}

export async function resolveCandidate(id: string, decision: "merge" | "keep_separate" | "ignore", _prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { supabase, org, user, profile, role } = await requireOrg();
    if (!canManage(role)) return { error: "Only owners, admins and managers can resolve import matches." };
    const { data, error } = await supabase.from("import_candidates").select("id, source, kind, external_id, payload, suggested_customer_id, score, status")
      .eq("id", id).eq("organisation_id", org.id).maybeSingle();
    if (error || !data) return { error: "That item is no longer available." };
    const c = data as CandidateRow;
    if (c.status !== "pending") return { error: "Someone already resolved this item." };
    const who = actorName(profile);
    const done = async (status: string, customerId: string | null, summary: string, extra?: string) => {
      const { error: uErr } = await supabase.from("import_candidates").update({ status, result_customer_id: customerId, resolved_by: user.id, resolved_at: new Date().toISOString() }).eq("id", c.id).eq("status", "pending");
      if (uErr) throw new Error(uErr.message);
      await logActivity(supabase, { orgId: org.id, actorId: user.id, action: `import.${status}`, entityType: "import_candidate", entityId: c.id, customerId, summary: `${who} ${summary}` });
      revalidateAll(c.source === "xero" ? "xero" : "gmail");
      if (customerId) revalidatePath(`/clients/${customerId}`);
      return { ok: summary.charAt(0).toUpperCase() + summary.slice(1) + (extra ? ` ${extra}` : "") };
    };

    if (decision === "ignore") return await done("ignored", null, `ignored ${c.source === "xero" ? "Xero" : "Gmail"} ${c.kind} “${String(c.payload.name ?? c.payload.email ?? c.payload.subject ?? c.external_id)}”`);

    const targetId = decision === "merge" ? (str(form.get("customer_id")) ?? c.suggested_customer_id) : null;
    if (decision === "merge" && !targetId) return { error: "Choose the customer to merge with." };
    let target: { id: string; name: string; email: string | null; phone: string | null; company: string | null; xero_contact_id: string | null } | null = null;
    if (targetId) {
      const { data: t } = await supabase.from("customers").select("id, name, email, phone, company, xero_contact_id").eq("id", targetId).eq("organisation_id", org.id).maybeSingle();
      if (!t) return { error: "That customer couldn't be found." };
      target = t;
    }
    const p = c.payload;

    // ---------------- Xero contact ----------------
    if (c.source === "xero" && c.kind === "contact") {
      const xeroId = c.external_id;
      const { data: taken } = await supabase.from("customers").select("id, name").eq("organisation_id", org.id).eq("xero_contact_id", xeroId).maybeSingle();
      if (taken) return { error: `This Xero contact is already linked to ${taken.name}.` };
      let customerId: string;
      let summary: string;
      if (target) {
        if (target.xero_contact_id && target.xero_contact_id !== xeroId) return { error: `${target.name} is already linked to a different Xero contact.` };
        const fill: Record<string, unknown> = { xero_contact_id: xeroId };
        const changes: Record<string, [unknown, unknown]> = { xero_contact_id: [null, xeroId] };
        if (!target.email && p.email) { fill.email = String(p.email).toLowerCase(); changes.email = [null, fill.email]; }
        if (!target.phone && p.phone) { fill.phone = p.phone; changes.phone = [null, p.phone]; }
        if (!target.company && p.person && p.name) { fill.company = p.name; changes.company = [null, p.name]; }
        const { error: e2 } = await supabase.from("customers").update(fill).eq("id", target.id).eq("organisation_id", org.id);
        if (e2) return { error: `Couldn't link: ${e2.message}` };
        await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "customer.linked_xero", entityType: "customer", entityId: target.id, customerId: target.id, summary: `${who} linked ${target.name} to Xero contact “${String(p.name)}”`, changes });
        customerId = target.id;
        summary = `merged Xero contact “${String(p.name)}” into ${target.name}`;
      } else {
        const person = (p.person as string | null) ?? null;
        const isCompany = !!person && person !== p.name;
        const { data: cust, error: e3 } = await supabase.from("customers").insert({
          organisation_id: org.id, kind: isCompany ? "company" : "individual", name: String(p.name), company: isCompany ? String(p.name) : null,
          email: (p.email as string | null)?.toLowerCase() ?? null, phone: (p.phone as string | null) ?? null, source: "other", xero_contact_id: xeroId, created_by: user.id,
        }).select("id").single();
        if (e3) return { error: `Couldn't create the customer: ${e3.message}` };
        if (person || p.email) {
          const n = splitName(person ?? String(p.name), p.email as string | null);
          await supabase.from("contacts").insert({ organisation_id: org.id, customer_id: cust.id, first_name: n.first, last_name: n.last, email: (p.email as string | null)?.toLowerCase() ?? null, phone: (p.phone as string | null) ?? null, is_primary: true, created_by: user.id });
        }
        await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "customer.created", entityType: "customer", entityId: cust.id, customerId: cust.id, summary: `${who} created customer ${String(p.name)} from Xero` });
        customerId = cust.id;
        summary = `kept Xero contact “${String(p.name)}” separate and created a new customer`;
      }
      // Bring in this contact's invoice history now (Xero stays authoritative)
      let extra = "";
      try {
        const sctx = await buildContext(supabase, "user", org.id, "xero", user.id);
        const h = await importHistoryForContact(sctx, xeroId, customerId);
        extra = `Imported ${h.invoices} invoice${h.invoices === 1 ? "" : "s"} from Xero.`;
      } catch (e) {
        extra = `Invoice history will come in on the next Xero sync (${errMessage(e)}).`;
      }
      return await done(target ? "merged" : "kept_separate", customerId, summary, extra);
    }

    // ---------------- Gmail contact ----------------
    if (c.source === "gmail" && c.kind === "contact") {
      const email = String(p.email ?? "").toLowerCase();
      const n = splitName(p.name as string | null, email);
      if (target) {
        const { data: exists } = await supabase.from("contacts").select("id").eq("organisation_id", org.id).eq("customer_id", target.id).ilike("email", likeExact(email)).maybeSingle();
        if (!exists) {
          const { error: e4 } = await supabase.from("contacts").insert({ organisation_id: org.id, customer_id: target.id, first_name: n.first, last_name: n.last, email, phone: (p.phone as string | null) ?? null, created_by: user.id });
          if (e4) return { error: `Couldn't add the contact: ${e4.message}` };
        }
        await linkThreadsByEmail(org.id, supabase, email, target.id);
        return await done("merged", target.id, `added ${n.full} <${email}> as a contact of ${target.name}`);
      }
      const { data: cust, error: e5 } = await supabase.from("customers").insert({
        organisation_id: org.id, kind: p.company ? "company" : "individual", name: p.company ? String(p.company) : n.full, company: (p.company as string | null) ?? null,
        email, phone: (p.phone as string | null) ?? null, source: "email", created_by: user.id,
      }).select("id").single();
      if (e5) return { error: `Couldn't create the customer: ${e5.message}` };
      await supabase.from("contacts").insert({ organisation_id: org.id, customer_id: cust.id, first_name: n.first, last_name: n.last, email, phone: (p.phone as string | null) ?? null, is_primary: true, created_by: user.id });
      await linkThreadsByEmail(org.id, supabase, email, cust.id);
      return await done(c.suggested_customer_id ? "kept_separate" : "created", cust.id, `created customer ${p.company ? String(p.company) : n.full} from Gmail history`);
    }

    // ---------------- Gmail enquiry conversation ----------------
    if (c.source === "gmail" && c.kind === "enquiry") {
      const x = (p.extracted ?? {}) as Record<string, unknown>;
      const person = (p.person ?? {}) as { name?: string | null; email?: string | null; phone?: string | null; company?: string | null };
      const lastAt = String(p.last_at ?? p.first_at ?? new Date().toISOString());
      const recent = Date.now() - Date.parse(lastAt) < 30 * 86400000;
      const cls = String(p.classification ?? "event_enquiry");
      const status = !recent ? "archived" : cls === "quote_discussion" ? "quote_sent" : p.we_replied ? "contacted" : "new";
      const customerId = target?.id ?? null;
      const { data: enq, error: e6 } = await supabase.from("enquiries").insert({
        organisation_id: org.id, title: String(p.subject ?? "Email enquiry").slice(0, 200), customer_id: customerId,
        contact_name: person.name ?? null, contact_email: person.email ?? null, contact_phone: person.phone ?? null, company: person.company ?? null,
        event_type: (x.event_type as string | null) ?? null, event_date: (x.event_date as string | null) ?? null,
        guest_count: (x.guest_count as number | null) ?? null, budget: (x.budget as number | null) ?? null, venue: (x.venue as string | null) ?? null,
        message: String(((p.messages as { body?: string }[] | undefined) ?? [])[0]?.body ?? "").slice(0, 5000) || null,
        source: p.website_form ? "website" : "email", status,
        classification: CLASSIFICATIONS.includes(cls as Classification) ? cls : "event_enquiry",
        classification_confidence: Number(p.confidence ?? 0) || null,
        received_at: String(p.first_at ?? lastAt), last_contact_at: p.we_replied ? lastAt : null, created_by: user.id,
      }).select("id, number").single();
      if (e6) return { error: `Couldn't create the enquiry: ${e6.message}` };
      await attachImportedThread(org.id, supabase, c, enq.id, customerId);
      await logActivity(supabase, { orgId: org.id, actorId: user.id, action: "enquiry.created", entityType: "enquiry", entityId: enq.id, enquiryId: enq.id, customerId, summary: `${who} imported ENQ-${enq.number} from Gmail history${target ? ` (linked to ${target.name})` : ""}` });
      revalidatePath("/enquiries");
      return await done(target ? "merged" : "created", customerId, `imported the conversation “${String(p.subject ?? "")}” as ENQ-${enq.number}${target ? ` for ${target.name}` : ""}`);
    }
    return { error: "This kind of item can't be resolved here yet." };
  } catch (e) {
    return { error: errMessage(e) };
  }
}

async function linkThreadsByEmail(orgId: string, supabase: Awaited<ReturnType<typeof requireOrg>>["supabase"], email: string, customerId: string) {
  await supabase.from("email_threads").update({ customer_id: customerId }).eq("organisation_id", orgId).is("customer_id", null).contains("participants", [email]);
}

async function attachImportedThread(orgId: string, supabase: Awaited<ReturnType<typeof requireOrg>>["supabase"], c: CandidateRow, enquiryId: string, customerId: string | null) {
  const p = c.payload;
  const msgs = ((p.messages ?? []) as { gmail_id: string; rfc_message_id: string | null; direction: "inbound" | "outbound"; from_email: string; from_name: string | null; to: string[]; subject: string | null; sent_at: string; body: string }[]);
  const { data: existing } = await supabase.from("email_threads").select("id").eq("organisation_id", orgId).eq("gmail_thread_id", c.external_id).maybeSingle();
  let threadId = existing?.id as string | undefined;
  if (threadId) {
    await supabase.from("email_threads").update({ enquiry_id: enquiryId, ...(customerId ? { customer_id: customerId } : {}) }).eq("id", threadId);
  } else {
    const last = msgs[msgs.length - 1];
    const lastIn = [...msgs].reverse().find((m) => m.direction === "inbound");
    const { data: t, error } = await supabase.from("email_threads").insert({
      organisation_id: orgId, gmail_thread_id: c.external_id, subject: (p.subject as string | null) ?? null, customer_id: customerId, enquiry_id: enquiryId,
      classification: CLASSIFICATIONS.includes(p.classification as Classification) ? p.classification : "event_enquiry",
      classification_confidence: Number(p.confidence ?? 0) || null, classified_by: "user",
      classification_reasons: ((p.reasons as string[] | undefined) ?? []).slice(0, 8), extracted: p.extracted ?? null,
      state: last?.direction === "inbound" && Date.now() - Date.parse(last.sent_at) < 30 * 86400000 ? "needs_reply" : "closed",
      participants: [...new Set(msgs.flatMap((m) => [m.from_email, ...m.to]))].slice(0, 20),
      message_count: msgs.length, last_message_at: last?.sent_at ?? null, last_inbound_at: lastIn?.sent_at ?? null,
    }).select("id").single();
    if (error) throw new Error(`Couldn't attach the email conversation: ${error.message}`);
    threadId = t.id;
  }
  if (msgs.length) {
    await supabase.from("email_messages").upsert(msgs.map((m) => ({
      organisation_id: orgId, thread_id: threadId, gmail_message_id: m.gmail_id, rfc_message_id: m.rfc_message_id, direction: m.direction,
      from_email: m.from_email, from_name: m.from_name, to_emails: m.to, subject: m.subject, snippet: m.body.replace(/\s+/g, " ").slice(0, 280),
      body_text: m.body, sent_at: m.sent_at, is_read: true,
    })), { onConflict: "organisation_id,gmail_message_id", ignoreDuplicates: true });
  }
}

// ------------------------------------------------------------------------------------------------
// Suggestions (Phase 4): create enquiry from an email / re-file an email
// ------------------------------------------------------------------------------------------------

export async function createEnquiryFromThread(threadId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { supabase, org, user, profile } = await requireOrg();
    const { data: t } = await supabase.from("email_threads").select("id, subject, customer_id, enquiry_id, classification, classification_confidence, last_inbound_at, created_at")
      .eq("id", threadId).eq("organisation_id", org.id).maybeSingle();
    if (!t) return { error: "That email couldn't be found." };
    if (t.enquiry_id) return { error: "An enquiry already exists for this email." };
    const title = str(form.get("title"));
    if (!title) return { error: "Give the enquiry a title." };
    const email = str(form.get("contact_email"))?.toLowerCase() ?? null;
    let customerId = t.customer_id as string | null;
    let contactId: string | null = null;
    if (!customerId && email) {
      const { data: m } = await supabase.from("contacts").select("id, customer_id").eq("organisation_id", org.id).ilike("email", likeExact(email)).limit(1).maybeSingle();
      if (m) { customerId = m.customer_id; contactId = m.id; }
    }
    const { data: first } = await supabase.from("email_messages").select("body_text").eq("thread_id", t.id).eq("direction", "inbound").order("sent_at").limit(1).maybeSingle();
    const { data: enq, error } = await supabase.from("enquiries").insert({
      organisation_id: org.id, title, customer_id: customerId, contact_id: contactId,
      contact_name: str(form.get("contact_name")), contact_email: email, contact_phone: str(form.get("contact_phone")), company: str(form.get("company")),
      event_type: str(form.get("event_type")), event_date: str(form.get("event_date")), guest_count: num(form.get("guest_count")), budget: num(form.get("budget")),
      venue: str(form.get("venue")), message: (first?.body_text as string | null)?.slice(0, 5000) ?? null,
      source: str(form.get("source")) === "website" ? "website" : "email", status: "new",
      classification: "event_enquiry", classification_confidence: t.classification_confidence,
      received_at: t.last_inbound_at ?? t.created_at, next_action: "Reply to the enquiry", created_by: user.id,
    }).select("id, number").single();
    if (error) return { error: `Couldn't create the enquiry: ${error.message}` };
    await supabase.from("email_threads").update({ enquiry_id: enq.id, classification: "event_enquiry", classified_by: "user", customer_id: customerId }).eq("id", t.id);
    await logActivity(supabase, {
      orgId: org.id, actorId: user.id, action: "enquiry.created", entityType: "enquiry", entityId: enq.id, enquiryId: enq.id, customerId,
      summary: `${actorName(profile)} created ENQ-${enq.number} from the email “${String(t.subject ?? "").slice(0, 80)}”`,
    });
    revalidatePath(`${BASE}/review`);
    revalidatePath("/enquiries");
    revalidatePath("/dashboard");
    return { ok: `Created ENQ-${enq.number}.` };
  } catch (e) {
    return { error: errMessage(e) };
  }
}

export async function refileThread(threadId: string, classification: string): Promise<ActionState> {
  try {
    if (!CLASSIFICATIONS.includes(classification as Classification) && classification !== "dismiss") return { error: "Unknown category." };
    const { supabase, org, user, profile } = await requireOrg();
    const { data: t } = await supabase.from("email_threads").select("id, subject, classification, customer_id, event_id, enquiry_id").eq("id", threadId).eq("organisation_id", org.id).maybeSingle();
    if (!t) return { error: "That email couldn't be found." };
    const patch: Record<string, unknown> = classification === "dismiss"
      ? { suggestion_dismissed_at: new Date().toISOString() }
      : { classification, classified_by: "user", classification_confidence: 1, suggestion_dismissed_at: new Date().toISOString(), ...(classification === "spam" ? { state: "closed" } : {}) };
    const { error } = await supabase.from("email_threads").update(patch).eq("id", t.id);
    if (error) return { error: error.message };
    await logActivity(supabase, {
      orgId: org.id, actorId: user.id, action: "email.reclassified", entityType: "email_thread", entityId: t.id,
      customerId: t.customer_id, eventId: t.event_id, enquiryId: t.enquiry_id,
      summary: classification === "dismiss" ? `${actorName(profile)} dismissed the enquiry suggestion for “${String(t.subject ?? "").slice(0, 80)}”`
        : `${actorName(profile)} filed “${String(t.subject ?? "").slice(0, 80)}” as ${classification.replace("_", " ")}`,
      changes: classification === "dismiss" ? null : { classification: [t.classification, classification] },
    });
    revalidatePath(`${BASE}/review`);
    return { ok: "Saved." };
  } catch (e) {
    return { error: errMessage(e) };
  }
}
