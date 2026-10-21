import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isClassBentoBooking, parseClassBentoEmail, type ClassBentoBooking } from "./classbento";

/**
 * ClassBento bookings from its "New booking for …" emails in the business's Gmail (ClassBento doesn't send them
 * anywhere else EventureOS can read). Each becomes a booking on the matching class, so seats add up and a full class
 * triggers the office alert. Read-only on Gmail; nothing is sent to customers.
 * Settings: organisations.settings.classbento_import = { enabled, since: "YYYY-MM-DD", skipped: [gmail ids] }.
 * ClassBento cancellations don't arrive by email — cancel those in EventureOS by hand.
 */
export interface ClassBentoImportSettings { enabled: boolean; since: string | null; skipped: string[] }
export function readClassBentoImport(settings: unknown): ClassBentoImportSettings {
  const r = (((settings ?? {}) as Record<string, unknown>).classbento_import ?? {}) as Record<string, unknown>;
  return {
    enabled: r.enabled === true,
    since: typeof r.since === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.since) ? r.since : null,
    skipped: (Array.isArray(r.skipped) ? r.skipped : []).filter((x): x is string => typeof x === "string").slice(-400),
  };
}

export interface ClassBentoImportResult { found: number; created: number; updated: number; problems: number; error?: string }

export async function importClassBentoEmails(db: SupabaseClient, orgId: string, opts: { max?: number } = {}): Promise<ClassBentoImportResult> {
  const res: ClassBentoImportResult = { found: 0, created: 0, updated: 0, problems: 0 };
  const { data: org } = await db.from("organisations").select("settings, timezone").eq("id", orgId).single();
  const cfg = readClassBentoImport(org?.settings);
  if (!cfg.enabled) return res;
  const tz = (org?.timezone as string) || "Australia/Sydney";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
  const back = (iso: string, days: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - days); return d.toISOString().slice(0, 10); };

  const { buildContext } = await import("@/lib/integrations/sync-runner");
  const { listMessages, getMessage, parseMessage, htmlToText } = await import("@/lib/integrations/gmail");
  const ctx = await buildContext(db, "service", orgId, "gmail", null);

  // From a few days before the newest ClassBento booking read from email (else the start date, else 90 days back)
  const { data: last } = await db.from("bookings").select("created_at").eq("organisation_id", orgId).like("external_ref", "classbento:%").order("created_at", { ascending: false }).limit(1).maybeSingle();
  const lastDay = last?.created_at ? String(last.created_at).slice(0, 10) : null;
  const since = lastDay && (!cfg.since || lastDay > cfg.since) ? back(lastDay, 3) : cfg.since ?? back(today, 90);
  const q = `from:classbento.com.au subject:"New booking for" after:${since.replace(/-/g, "/")}`;

  const ids: string[] = [];
  let page: string | undefined;
  do {
    const r = await listMessages(ctx, q, page, 100);
    for (const m of r.messages ?? []) ids.push(m.id);
    page = r.nextPageToken;
  } while (page && ids.length < 500);
  res.found = ids.length;
  const skipped = new Set(cfg.skipped);
  const todo = ids.filter((id) => !skipped.has(id)).reverse().slice(0, opts.max ?? 60); // oldest first
  if (!todo.length) return res;

  const list: (ClassBentoBooking & { sentAt: string })[] = [];
  const newlySkipped: string[] = [];
  for (const id of todo) {
    let pm;
    try { pm = parseMessage(await getMessage(ctx, id)); } catch { continue; }
    if (!/classbento\.com\.au$/i.test(pm.from.email) || !isClassBentoBooking(pm.subject)) { newlySkipped.push(id); continue; }
    const text = pm.html ? htmlToText(pm.html) : pm.text;
    const r = parseClassBentoEmail(pm.subject ?? "", text, pm.sentAt);
    if (!r.booking) {
      newlySkipped.push(id); res.problems++;
      await db.from("notifications").insert({ organisation_id: orgId, type: "booking.import_problem", title: "A ClassBento booking email couldn't be read",
        body: `${pm.subject ?? ""} — ${r.problem}. Add this booking by hand.`.slice(0, 500), link: "/bookings" }).then(() => null, () => null);
      continue;
    }
    if (r.booking.date < today) { newlySkipped.push(id); continue; } // a class already gone: don't invent attendance history
    list.push({ ...r.booking, sentAt: pm.sentAt });
  }

  if (list.length) {
    const refs = list.map((b) => `classbento:${b.order}`);
    const { data: had } = await db.from("bookings").select("external_ref").eq("organisation_id", orgId).in("external_ref", refs);
    const known = new Set((had ?? []).map((x) => x.external_ref as string));
    const { importClassBentoBookings } = await import("./import");
    const r = await importClassBentoBookings(db, orgId, list);
    res.created = r.created; res.updated = r.updated;
    if (r.errors.length) console.error("[classbento import]", r.errors);
    for (const b of list.filter((x) => !known.has(`classbento:${x.order}`))) {
      const { data: bk } = await db.from("bookings").select("id, session_id").eq("organisation_id", orgId).eq("external_ref", `classbento:${b.order}`).maybeSingle();
      if (!bk) continue;
      await db.from("notifications").insert({
        organisation_id: orgId, type: "booking.new", title: `ClassBento booking: ${b.name}${b.guests > 1 ? ` × ${b.guests}` : ""}`.slice(0, 200),
        body: `${b.listing} — ${b.date} ${b.start}${b.bookedBy ? ` (gift from ${b.bookedBy})` : ""}`.slice(0, 500),
        link: `/bookings/sessions/${bk.session_id}`, entity_type: "booking", entity_id: bk.id,
      }).then(() => null, () => null);
    }
  }

  if (newlySkipped.length) {
    const { data: fresh } = await db.from("organisations").select("settings").eq("id", orgId).single();
    const settings = (fresh?.settings ?? {}) as Record<string, unknown>;
    const cur = (settings.classbento_import ?? {}) as Record<string, unknown>;
    const all = [...new Set([...(Array.isArray(cur.skipped) ? (cur.skipped as string[]) : []), ...newlySkipped])].slice(-400);
    await db.from("organisations").update({ settings: { ...settings, classbento_import: { ...cur, skipped: all } } }).eq("id", orgId);
  }
  return res;
}

/** Every business with ClassBento emails switched on (called from the frequent Gmail sync). */
export async function runClassBentoImports(db: SupabaseClient) {
  const { data } = await db.from("organisations").select("id").eq("settings->classbento_import->>enabled", "true");
  const out: Record<string, ClassBentoImportResult> = {};
  for (const o of (data ?? []) as { id: string }[]) {
    try { out[o.id] = await importClassBentoEmails(db, o.id); } catch (e) { out[o.id] = { found: 0, created: 0, updated: 0, problems: 0, error: e instanceof Error ? e.message : String(e) }; }
  }
  return out;
}
