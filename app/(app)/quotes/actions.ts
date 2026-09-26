"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireOrg } from "@/lib/context";
import { actorName, logActivity } from "@/lib/activity";
import { addDaysISO, fmtDate, money, todayISO } from "@/lib/format";
import type { QuoteStatus } from "@/lib/types";
import { priceJob, type PackageRules } from "@/lib/pricing/engine";
import type {
  ActionResult, HeaderPatch, ItemPatch, QItem, QSection, QuoteDoc, QuoteSnapshotData, SectionPatch,
} from "@/components/quotes/types";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ITEM_COLS = "id, section_id, name, description, quantity, unit, unit_price, tax_rate, discount_percent, is_optional, is_package, image_url, position";
const SECTION_COLS = "id, title, description, position, is_optional";

class UserError extends Error {}
function fail(msg: string): never { throw new UserError(msg); }

/** Run an action body, turning any failure into a plain-English result the UI can show. */
async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: friendly(msg) };
  }
}

function friendly(msg: string) {
  if (/row-level security|permission denied/i.test(msg)) return "You don't have permission to do that.";
  if (/numeric field overflow/i.test(msg)) return "That number is too large.";
  if (/Failed to fetch|fetch failed|network/i.test(msg)) return "Couldn't reach the server. Check your connection and try again.";
  return msg;
}

function assertId(id: string, what = "record") {
  if (!UUID.test(id)) fail(`That ${what} link isn't valid.`);
}

interface QuoteHead {
  id: string; number: number; title: string; event_id: string; customer_id: string; status: QuoteStatus;
  expiry_date: string | null; notes: string | null; terms: string | null; current_version_id: string | null;
  has_unpublished_changes: boolean;
}

async function loadQuote(supabase: SupabaseClient, orgId: string, quoteId: string): Promise<QuoteHead> {
  assertId(quoteId, "quote");
  const { data, error } = await supabase
    .from("quotes")
    .select("id, number, title, event_id, customer_id, status, expiry_date, notes, terms, current_version_id, has_unpublished_changes")
    .eq("id", quoteId).eq("organisation_id", orgId).maybeSingle();
  if (error) fail(`Couldn't load the quote: ${error.message}`);
  if (!data) fail("That quote no longer exists, or you don't have access to it.");
  return data as QuoteHead;
}

function assertEditable(q: QuoteHead) {
  if (q.status === "accepted") fail(`Quote Q-${q.number} has been accepted and is locked. Duplicate it to make changes.`);
}

function refresh(q: { id: string; event_id: string }) {
  revalidatePath("/quotes");
  revalidatePath(`/quotes/${q.id}`);
  revalidatePath(`/events/${q.event_id}`);
  revalidatePath("/dashboard");
}

const clean = (v: unknown, max: number) => {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, max) : null;
};

function checkNumber(v: unknown, label: string, min: number, max: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) fail(`${label} must be a number.`);
  if (n < min || n > max) fail(`${label} must be between ${min.toLocaleString("en-AU")} and ${max.toLocaleString("en-AU")}.`);
  return Math.round(n * 100) / 100;
}

function checkImageUrl(v: unknown) {
  const s = clean(v, 2000);
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error();
  } catch {
    fail("The image link must be a full web address starting with https://");
  }
  return s;
}

const itemName = (n: string | null | undefined) => (n && n.trim() ? `‘${n.trim()}’` : "a blank line item");

// ---------------------------------------------------------------------------
// create / duplicate
// ---------------------------------------------------------------------------

export async function createQuoteForEvent(eventId: string): Promise<ActionResult<never>> {
  let newId: string | null = null;
  const res = await run(async () => {
    assertId(eventId, "event");
    const { supabase, org, user, profile } = await requireOrg();
    const { data: ev, error } = await supabase.from("events").select("id, number, name, customer_id, status, enquiry_id")
      .eq("id", eventId).eq("organisation_id", org.id).maybeSingle();
    if (error) fail(`Couldn't load the event: ${error.message}`);
    if (!ev) fail("That event no longer exists, or you don't have access to it.");
    if (ev!.status === "cancelled") fail("This event is cancelled. Reopen it before creating a quote.");

    const today = todayISO(org.timezone);
    const { data: q, error: qErr } = await supabase.from("quotes").insert({
      organisation_id: org.id, event_id: ev!.id, customer_id: ev!.customer_id, title: ev!.name,
      status: "draft", issue_date: today, expiry_date: addDaysISO(today, 14), created_by: user.id,
    }).select("id, number, event_id").single();
    if (qErr) fail(`Couldn't create the quote: ${qErr.message}`);

    const { error: sErr } = await supabase.from("quote_sections").insert({
      organisation_id: org.id, quote_id: q!.id, title: "Services", position: 0,
    });
    if (sErr) fail(`The quote was created but its first section couldn't be added: ${sErr.message}`);

    await logActivity(supabase, {
      orgId: org.id, actorId: user.id, action: "quote.created", entityType: "quote", entityId: q!.id,
      eventId: ev!.id, customerId: ev!.customer_id, enquiryId: ev!.enquiry_id,
      summary: `${actorName(profile)} created Quote Q-${q!.number} for EV-${ev!.number}`,
    });
    refresh(q!);
    newId = q!.id;
  });
  if (!res.ok) return res;
  redirect(`/quotes/${newId}`);
}

export async function duplicateQuote(quoteId: string): Promise<ActionResult<never>> {
  let newId: string | null = null;
  const res = await run(async () => {
    const { supabase, org, user, profile } = await requireOrg();
    const q = await loadQuote(supabase, org.id, quoteId);
    const today = todayISO(org.timezone);
    const { data, error } = await supabase.rpc("duplicate_quote", { p_quote_id: q.id, p_expiry: addDaysISO(today, 14) });
    if (error) fail(`Couldn't duplicate the quote: ${error.message}`);
    const { data: nq, error: nErr } = await supabase.from("quotes").select("id, number, event_id").eq("id", data as string).single();
    if (nErr) fail(`The copy was made but couldn't be opened: ${nErr.message}`);
    await logActivity(supabase, {
      orgId: org.id, actorId: user.id, action: "quote.duplicated", entityType: "quote", entityId: nq!.id,
      eventId: q.event_id, customerId: q.customer_id,
      summary: `${actorName(profile)} duplicated Quote Q-${q.number} as Q-${nq!.number}`,
      metadata: { source_quote_id: q.id },
    });
    refresh(q);
    revalidatePath(`/quotes/${nq!.id}`);
    newId = nq!.id;
  });
  if (!res.ok) return res;
  redirect(`/quotes/${newId}`);
}

// ---------------------------------------------------------------------------
// header, notes, terms
// ---------------------------------------------------------------------------

export async function updateQuoteHeader(quoteId: string, patch: HeaderPatch): Promise<ActionResult> {
  return run(async () => {
    const { supabase, org, user, profile } = await requireOrg();
    const q = await loadQuote(supabase, org.id, quoteId);
    assertEditable(q);

    const next: Record<string, unknown> = {};
    const changes: Record<string, [unknown, unknown]> = {};
    if ("title" in patch) {
      const t = clean(patch.title, 200);
      if (!t) fail("Give the quote a title.");
      if (t !== q.title) { next.title = t; changes.title = [q.title, t]; }
    }
    if ("expiry_date" in patch) {
      const d = clean(patch.expiry_date, 10);
      if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) fail("Expiry date isn't a valid date.");
      if (d && d < todayISO(org.timezone)) fail("The expiry date can't be in the past.");
      if (d !== q.expiry_date) { next.expiry_date = d; changes["expiry date"] = [fmtDate(q.expiry_date), fmtDate(d)]; }
    }
    for (const col of ["notes", "terms"] as const) {
      if (col in patch) {
        const v = clean(patch[col], 20000);
        if (v !== q[col]) { next[col] = v; changes[col === "notes" ? "notes" : "terms & conditions"] = [q[col] ? "previous text" : null, v ? "updated" : null]; }
      }
    }
    if (!Object.keys(next).length) return null;

    const { error } = await supabase.from("quotes").update(next).eq("id", q.id).eq("organisation_id", org.id);
    if (error) fail(`Couldn't save the quote: ${error.message}`);
    await logActivity(supabase, {
      orgId: org.id, actorId: user.id, action: "quote.updated", entityType: "quote", entityId: q.id,
      eventId: q.event_id, customerId: q.customer_id,
      summary: `${actorName(profile)} changed ${Object.keys(changes).join(", ")} on Quote Q-${q.number}`,
      changes,
    });
    refresh(q);
    return null;
  });
}

// ---------------------------------------------------------------------------
// sections
// ---------------------------------------------------------------------------

async function loadSection(supabase: SupabaseClient, orgId: string, sectionId: string) {
  assertId(sectionId, "section");
  const { data, error } = await supabase.from("quote_sections").select(`${SECTION_COLS}, quote_id`)
    .eq("id", sectionId).eq("organisation_id", orgId).maybeSingle();
  if (error) fail(`Couldn't load the section: ${error.message}`);
  if (!data) fail("That section no longer exists. Refresh the page.");
  return data as QSection & { quote_id: string };
}

export async function addSection(quoteId: string, title?: string): Promise<ActionResult<QSection>> {
  return run(async () => {
    const { supabase, org, user, profile } = await requireOrg();
    const q = await loadQuote(supabase, org.id, quoteId);
    assertEditable(q);
    const name = clean(title, 120) ?? "New section";
    const { data: last } = await supabase.from("quote_sections").select("position").eq("quote_id", q.id)
      .order("position", { ascending: false }).limit(1).maybeSingle();
    const { data, error } = await supabase.from("quote_sections").insert({
      organisation_id: org.id, quote_id: q.id, title: name, position: (last?.position ?? -1) + 1,
    }).select(SECTION_COLS).single();
    if (error) fail(`Couldn't add the section: ${error.message}`);
    await logActivity(supabase, {
      orgId: org.id, actorId: user.id, action: "quote.section_added", entityType: "quote", entityId: q.id,
      eventId: q.event_id, customerId: q.customer_id,
      summary: `${actorName(profile)} added section ‘${name}’ to Quote Q-${q.number}`,
    });
    refresh(q);
    return data as QSection;
  });
}

export async function updateSection(sectionId: string, patch: SectionPatch): Promise<ActionResult> {
  return run(async () => {
    const { supabase, org, user, profile } = await requireOrg();
    const s = await loadSection(supabase, org.id, sectionId);
    const q = await loadQuote(supabase, org.id, s.quote_id);
    assertEditable(q);
    const next: Record<string, unknown> = {};
    const changes: Record<string, [unknown, unknown]> = {};
    if ("title" in patch) {
      const t = clean(patch.title, 120);
      if (!t) fail("Give the section a name.");
      if (t !== s.title) { next.title = t; changes.name = [s.title, t]; }
    }
    if ("description" in patch) {
      const d = clean(patch.description, 2000);
      if (d !== s.description) { next.description = d; changes.description = [s.description ? "previous text" : null, d ? "updated" : null]; }
    }
    if ("is_optional" in patch && !!patch.is_optional !== s.is_optional) {
      next.is_optional = !!patch.is_optional;
      changes.optional = [s.is_optional ? "Yes" : "No", patch.is_optional ? "Yes" : "No"];
    }
    if (!Object.keys(next).length) return null;
    const { error } = await supabase.from("quote_sections").update(next).eq("id", s.id).eq("organisation_id", org.id);
    if (error) fail(`Couldn't save the section: ${error.message}`);
    const what = "is_optional" in next
      ? next.is_optional ? `marked section ‘${s.title}’ optional` : `made section ‘${s.title}’ required`
      : "title" in next ? `renamed section ‘${s.title}’ to ‘${next.title}’` : `updated section ‘${s.title}’`;
    await logActivity(supabase, {
      orgId: org.id, actorId: user.id, action: "quote.section_updated", entityType: "quote", entityId: q.id,
      eventId: q.event_id, customerId: q.customer_id,
      summary: `${actorName(profile)} ${what} on Quote Q-${q.number}`, changes,
    });
    refresh(q);
    return null;
  });
}

export async function deleteSection(sectionId: string): Promise<ActionResult> {
  return run(async () => {
    const { supabase, org, user, profile } = await requireOrg();
    const s = await loadSection(supabase, org.id, sectionId);
    const q = await loadQuote(supabase, org.id, s.quote_id);
    assertEditable(q);
    const { count } = await supabase.from("quote_sections").select("id", { count: "exact", head: true }).eq("quote_id", q.id);
    if ((count ?? 0) <= 1) fail("A quote needs at least one section. Rename this one instead.");
    const { count: items } = await supabase.from("quote_items").select("id", { count: "exact", head: true }).eq("section_id", s.id);
    const { error } = await supabase.from("quote_sections").delete().eq("id", s.id).eq("organisation_id", org.id);
    if (error) fail(`Couldn't delete the section: ${error.message}`);
    await logActivity(supabase, {
      orgId: org.id, actorId: user.id, action: "quote.section_removed", entityType: "quote", entityId: q.id,
      eventId: q.event_id, customerId: q.customer_id,
      summary: `${actorName(profile)} removed section ‘${s.title}’${items ? ` and its ${items} item${items === 1 ? "" : "s"}` : ""} from Quote Q-${q.number}`,
    });
    refresh(q);
    return null;
  });
}

export async function moveSection(sectionId: string, dir: -1 | 1): Promise<ActionResult<{ id: string; position: number }[]>> {
  return run(async () => {
    const { supabase, org, user, profile } = await requireOrg();
    const s = await loadSection(supabase, org.id, sectionId);
    const q = await loadQuote(supabase, org.id, s.quote_id);
    assertEditable(q);
    const { data, error } = await supabase.from("quote_sections").select("id, title, position").eq("quote_id", q.id)
      .order("position").order("created_at");
    if (error) fail(`Couldn't reorder: ${error.message}`);
    const order = await reorder(supabase, "quote_sections", data ?? [], s.id, dir);
    if (order) {
      await logActivity(supabase, {
        orgId: org.id, actorId: user.id, action: "quote.section_moved", entityType: "quote", entityId: q.id,
        eventId: q.event_id, customerId: q.customer_id,
        summary: `${actorName(profile)} moved section ‘${s.title}’ ${dir < 0 ? "up" : "down"} on Quote Q-${q.number}`,
      });
      refresh(q);
    }
    return order ?? (data ?? []).map((r) => ({ id: r.id, position: r.position }));
  });
}

/** Move one row up/down among its siblings and renumber positions 0..n-1. Returns the new order, or null if unchanged. */
async function reorder(supabase: SupabaseClient, table: "quote_sections" | "quote_items",
  rows: { id: string; position: number }[], id: string, dir: -1 | 1) {
  const ids = rows.map((r) => r.id);
  const i = ids.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return null;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  const current = new Map(rows.map((r) => [r.id, r.position]));
  const updates = ids.map((rid, pos) => ({ id: rid, position: pos })).filter((u) => current.get(u.id) !== u.position);
  const results = await Promise.all(updates.map((u) => supabase.from(table).update({ position: u.position }).eq("id", u.id)));
  const bad = results.find((r) => r.error);
  if (bad?.error) fail(`Couldn't reorder: ${bad.error.message}`);
  return ids.map((rid, pos) => ({ id: rid, position: pos }));
}

// ---------------------------------------------------------------------------
// line items
// ---------------------------------------------------------------------------

function validateItemPatch(patch: ItemPatch) {
  const next: Record<string, unknown> = {};
  if ("name" in patch) next.name = String(patch.name ?? "").trim().slice(0, 200);
  if ("description" in patch) next.description = clean(patch.description, 4000);
  if ("unit" in patch) next.unit = clean(patch.unit, 40);
  if ("quantity" in patch) next.quantity = checkNumber(patch.quantity, "Quantity", 0, 1_000_000);
  if ("unit_price" in patch) next.unit_price = checkNumber(patch.unit_price, "Unit price", -10_000_000, 10_000_000);
  if ("tax_rate" in patch) next.tax_rate = checkNumber(patch.tax_rate, "Tax rate", 0, 100);
  if ("discount_percent" in patch) next.discount_percent = checkNumber(patch.discount_percent, "Discount", 0, 100);
  if ("is_optional" in patch) next.is_optional = !!patch.is_optional;
  if ("is_package" in patch) next.is_package = !!patch.is_package;
  if ("image_url" in patch) next.image_url = checkImageUrl(patch.image_url);
  return next;
}

async function loadItem(supabase: SupabaseClient, orgId: string, itemId: string) {
  assertId(itemId, "line item");
  const { data, error } = await supabase.from("quote_items").select(`${ITEM_COLS}, quote_id`)
    .eq("id", itemId).eq("organisation_id", orgId).maybeSingle();
  if (error) fail(`Couldn't load the line item: ${error.message}`);
  if (!data) fail("That line item no longer exists. Refresh the page.");
  return data as QItem & { quote_id: string };
}

export async function addItem(quoteId: string, sectionId: string, init: ItemPatch = {}, position?: number): Promise<ActionResult<QItem>> {
  return run(async () => {
    const { supabase, org, user, profile } = await requireOrg();
    const q = await loadQuote(supabase, org.id, quoteId);
    assertEditable(q);
    const s = await loadSection(supabase, org.id, sectionId);
    if (s.quote_id !== q.id) fail("That section belongs to a different quote. Refresh the page.");
    const fields = validateItemPatch(init);

    let pos = position;
    if (pos == null) {
      const { data: last } = await supabase.from("quote_items").select("position").eq("section_id", s.id)
        .order("position", { ascending: false }).limit(1).maybeSingle();
      pos = (last?.position ?? -1) + 1;
    }
    const { data, error } = await supabase.from("quote_items").insert({
      organisation_id: org.id, quote_id: q.id, section_id: s.id, name: "", quantity: 1, unit_price: 0, tax_rate: 10,
      ...fields, position: pos,
    }).select(ITEM_COLS).single();
    if (error) fail(`Couldn't add the line item: ${error.message}`);
    const item = data as QItem;
    // A blank row is logged once it is given a name (see updateItem).
    if (item.name) {
      await logActivity(supabase, {
        orgId: org.id, actorId: user.id, action: "quote.item_added", entityType: "quote", entityId: q.id,
        eventId: q.event_id, customerId: q.customer_id,
        summary: `${actorName(profile)} added ‘${item.name}’ to Quote Q-${q.number}`,
        metadata: { item_id: item.id, quantity: item.quantity, unit_price: item.unit_price },
      });
    }
    refresh(q);
    return item;
  });
}

const ITEM_LABELS: Record<string, string> = {
  name: "name", description: "description", quantity: "quantity", unit: "unit", unit_price: "unit price",
  tax_rate: "tax", discount_percent: "discount", is_optional: "optional", is_package: "package", image_url: "image",
};

export async function updateItem(itemId: string, patch: ItemPatch): Promise<ActionResult<QItem>> {
  return run(async () => {
    const { supabase, org, user, profile } = await requireOrg();
    const before = await loadItem(supabase, org.id, itemId);
    const q = await loadQuote(supabase, org.id, before.quote_id);
    assertEditable(q);
    const fields = validateItemPatch(patch);

    const next: Record<string, unknown> = {};
    const changes: Record<string, [unknown, unknown]> = {};
    for (const [k, v] of Object.entries(fields)) {
      const prev = (before as unknown as Record<string, unknown>)[k];
      const same = typeof v === "number" ? Number(prev) === v : (prev ?? null) === (v ?? null);
      if (same) continue;
      next[k] = v;
      const show = (x: unknown) =>
        k === "unit_price" ? money(Number(x ?? 0), org.currency)
          : k === "tax_rate" || k === "discount_percent" ? `${Number(x ?? 0)}%`
            : k === "is_optional" || k === "is_package" ? (x ? "Yes" : "No")
              : k === "description" || k === "image_url" ? (x ? "set" : null)
                : x;
      changes[ITEM_LABELS[k]] = [show(prev), show(v)];
    }
    if (!Object.keys(next).length) return before;

    const { data, error } = await supabase.from("quote_items").update(next).eq("id", before.id).eq("organisation_id", org.id)
      .select(ITEM_COLS).single();
    if (error) fail(`Couldn't save ‘${before.name || "the line item"}’: ${error.message}`);
    const item = data as QItem;

    const who = actorName(profile);
    let summary: string;
    if (!before.name && item.name) summary = `${who} added ‘${item.name}’ to Quote Q-${q.number}`;
    else {
      const parts = Object.entries(changes).filter(([k]) => k !== "name").map(([k, [a, b]]) =>
        a == null || b == null || k === "description" || k === "image" ? `${k} ${b == null ? "removed" : a == null ? "added" : "updated"}` : `${k} ${a} → ${b}`);
      const renamed = changes.name ? ` (renamed from ‘${before.name}’)` : "";
      summary = `${who} updated ${itemName(item.name)} on Quote Q-${q.number}${renamed}${parts.length ? ` — ${parts.join(", ")}` : ""}`;
    }
    await logActivity(supabase, {
      orgId: org.id, actorId: user.id, action: !before.name && item.name ? "quote.item_added" : "quote.item_updated",
      entityType: "quote", entityId: q.id, eventId: q.event_id, customerId: q.customer_id,
      summary, changes, metadata: { item_id: item.id },
    });
    refresh(q);
    return item;
  });
}

export async function deleteItem(itemId: string): Promise<ActionResult> {
  return run(async () => {
    const { supabase, org, user, profile } = await requireOrg();
    const it = await loadItem(supabase, org.id, itemId);
    const q = await loadQuote(supabase, org.id, it.quote_id);
    assertEditable(q);
    const { error } = await supabase.from("quote_items").delete().eq("id", it.id).eq("organisation_id", org.id);
    if (error) fail(`Couldn't remove ${itemName(it.name)}: ${error.message}`);
    await logActivity(supabase, {
      orgId: org.id, actorId: user.id, action: "quote.item_removed", entityType: "quote", entityId: q.id,
      eventId: q.event_id, customerId: q.customer_id,
      summary: `${actorName(profile)} removed ${itemName(it.name)} from Quote Q-${q.number}`,
      metadata: { item: { name: it.name, quantity: it.quantity, unit_price: it.unit_price } },
    });
    refresh(q);
    return null;
  });
}

export async function moveItem(itemId: string, dir: -1 | 1): Promise<ActionResult<{ id: string; position: number }[]>> {
  return run(async () => {
    const { supabase, org, user, profile } = await requireOrg();
    const it = await loadItem(supabase, org.id, itemId);
    const q = await loadQuote(supabase, org.id, it.quote_id);
    assertEditable(q);
    const { data, error } = await supabase.from("quote_items").select("id, position").eq("section_id", it.section_id)
      .order("position").order("created_at");
    if (error) fail(`Couldn't reorder: ${error.message}`);
    const order = await reorder(supabase, "quote_items", data ?? [], it.id, dir);
    if (order) {
      await logActivity(supabase, {
        orgId: org.id, actorId: user.id, action: "quote.item_moved", entityType: "quote", entityId: q.id,
        eventId: q.event_id, customerId: q.customer_id,
        summary: `${actorName(profile)} moved ${itemName(it.name)} ${dir < 0 ? "up" : "down"} on Quote Q-${q.number}`,
      });
      refresh(q);
    }
    return order ?? (data ?? []).map((r) => ({ id: r.id, position: r.position }));
  });
}

// ---------------------------------------------------------------------------
// preview, publish, responses
// ---------------------------------------------------------------------------

export async function previewQuote(quoteId: string): Promise<ActionResult<QuoteSnapshotData>> {
  return run(async () => {
    const { supabase, org } = await requireOrg();
    const q = await loadQuote(supabase, org.id, quoteId);
    const { data, error } = await supabase.rpc("build_quote_snapshot", { qid: q.id });
    if (error) fail(`Couldn't build the preview: ${error.message}`);
    if (!data) fail("Couldn't build the preview.");
    return data as QuoteSnapshotData;
  });
}

export async function publishQuote(quoteId: string): Promise<ActionResult<{ versionNumber: number }>> {
  return run(async () => {
    const { supabase, org } = await requireOrg();
    const q = await loadQuote(supabase, org.id, quoteId);
    assertEditable(q);

    const { data: items, error: iErr } = await supabase.from("quote_items").select("name, section_id").eq("quote_id", q.id);
    if (iErr) fail(`Couldn't check the quote: ${iErr.message}`);
    if (!items?.length) fail("Add at least one line item before sending the quote.");
    const blank = items!.filter((i) => !String(i.name ?? "").trim()).length;
    if (blank) fail(`${blank} line item${blank === 1 ? " has" : "s have"} no name. Name or remove ${blank === 1 ? "it" : "them"} before sending.`);
    if (!q.title.trim()) fail("Give the quote a title before sending.");
    const today = todayISO(org.timezone);
    if (!q.expiry_date) fail("Set an expiry date before sending.");
    if (q.expiry_date! < today) fail(`The expiry date (${fmtDate(q.expiry_date)}) has passed. Choose a new expiry date before sending.`);
    if (q.current_version_id && !q.has_unpublished_changes && (q.status === "sent" || q.status === "viewed")) {
      fail("Nothing has changed since the last version — the customer already has the latest quote.");
    }

    const { data: vid, error } = await supabase.rpc("publish_quote", { p_quote_id: q.id });
    if (error) fail(`Couldn't publish the quote: ${error.message}`);
    // publish_quote writes the audit entry ("… sent Quote Q-… (version N, $…)").
    const { data: v } = await supabase.from("quote_versions").select("version_number").eq("id", vid as string).single();
    refresh(q);
    revalidatePath("/enquiries");
    return { versionNumber: v?.version_number ?? 0 };
  });
}

export async function recordQuoteResponse(
  quoteId: string, versionId: string, decision: "accepted" | "declined", name: string, reason: string
): Promise<ActionResult> {
  return run(async () => {
    const { supabase, org } = await requireOrg();
    const q = await loadQuote(supabase, org.id, quoteId);
    assertId(versionId, "version");
    if (decision !== "accepted" && decision !== "declined") fail("Choose accepted or declined.");
    const who = clean(name, 120);
    if (decision === "accepted" && !who) fail("Enter the name of the person who accepted the quote.");
    if (q.current_version_id !== versionId) fail("A newer version has been published. Record the response against the latest version.");
    const { error } = await supabase.rpc("staff_record_quote_response", {
      p_version_id: versionId, p_decision: decision, p_name: who ?? "", p_reason: clean(reason, 2000) ?? "",
    });
    if (error) fail(`Couldn't record the response: ${error.message}`);
    // staff_record_quote_response writes the audit entry and runs the acceptance automation.
    refresh(q);
    revalidatePath("/invoices");
    revalidatePath("/calendar");
    return null;
  });
}

// ---------------------------------------------------------------------------
// attachments (file is uploaded from the browser straight to Storage)
// ---------------------------------------------------------------------------

export async function attachQuoteDocument(quoteId: string, file: { name: string; path: string; mime: string | null; size: number }): Promise<ActionResult<QuoteDoc>> {
  return run(async () => {
    const { supabase, org, user, profile } = await requireOrg();
    const q = await loadQuote(supabase, org.id, quoteId);
    const prefix = `${org.id}/quotes/${q.id}/`;
    if (!file.path.startsWith(prefix) || file.path.includes("..")) fail("That upload went to the wrong place. Please try again.");
    const name = clean(file.name, 255) ?? "Attachment";
    const { data, error } = await supabase.from("documents").insert({
      organisation_id: org.id, name, storage_path: file.path, mime_type: clean(file.mime, 120),
      size_bytes: Math.max(0, Math.round(Number(file.size) || 0)), quote_id: q.id, event_id: q.event_id,
      customer_id: q.customer_id, visibility: "customer", uploaded_by: user.id,
    }).select("id, name, storage_path, mime_type, size_bytes, created_at").single();
    if (error) {
      await supabase.storage.from("documents").remove([file.path]);
      fail(`Couldn't save the attachment: ${error.message}`);
    }
    await logActivity(supabase, {
      orgId: org.id, actorId: user.id, action: "document.uploaded", entityType: "document", entityId: data!.id,
      eventId: q.event_id, customerId: q.customer_id,
      summary: `${actorName(profile)} attached ‘${name}’ to Quote Q-${q.number}`,
    });
    refresh(q);
    return data as QuoteDoc;
  });
}

export async function removeQuoteDocument(documentId: string): Promise<ActionResult> {
  return run(async () => {
    const { supabase, org, user, profile } = await requireOrg();
    assertId(documentId, "attachment");
    const { data: d, error } = await supabase.from("documents").select("id, name, storage_path, quote_id")
      .eq("id", documentId).eq("organisation_id", org.id).maybeSingle();
    if (error) fail(`Couldn't load the attachment: ${error.message}`);
    if (!d || !d.quote_id) fail("That attachment no longer exists.");
    const q = await loadQuote(supabase, org.id, d!.quote_id as string);
    const { error: dErr } = await supabase.from("documents").delete().eq("id", d!.id).eq("organisation_id", org.id);
    if (dErr) fail(`Couldn't remove the attachment: ${dErr.message}`);
    if (d!.storage_path) await supabase.storage.from("documents").remove([d!.storage_path]);
    await logActivity(supabase, {
      orgId: org.id, actorId: user.id, action: "document.removed", entityType: "document", entityId: d!.id,
      eventId: q.event_id, customerId: q.customer_id,
      summary: `${actorName(profile)} removed attachment ‘${d!.name}’ from Quote Q-${q.number}`,
    });
    refresh(q);
    return null;
  });
}

// ---------------------------------------------------------------------------
// Price a job from a service package (Settings → Services & pricing)
// ---------------------------------------------------------------------------

export interface PriceJobInput {
  packageId: string;
  start: string;          // "HH:MM"
  end: string;            // "HH:MM"
  serves: number;
  staff: number;
  includeDelivery: boolean;
  sectionTitle?: string;
}

const hhmm = (v: string, label: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(v ?? "").trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) fail(`${label} must be a time like 08:00.`);
  return Number(m[1]) * 60 + Number(m[2]);
};

/** Prices the job on the server (from the saved price list, never client prices) and adds it as a new section. */
export async function addPricedSection(quoteId: string, input: PriceJobInput): Promise<ActionResult<{ section: QSection; items: QItem[] }>> {
  return run(async () => {
    const { supabase, org, user, profile } = await requireOrg();
    const q = await loadQuote(supabase, org.id, quoteId);
    assertEditable(q);
    assertId(input.packageId, "package");
    const [{ data: pkg, error: pErr }, { data: svc, error: sErr }] = await Promise.all([
      supabase.from("service_packages").select("id, name, rules").eq("organisation_id", org.id).eq("id", input.packageId).eq("active", true).maybeSingle(),
      supabase.from("services").select("id, code, name, description, unit, unit_price, tax_rate").eq("organisation_id", org.id).eq("active", true),
    ]);
    if (pErr || sErr) fail(`Couldn't load your price list: ${(pErr ?? sErr)!.message}`);
    if (!pkg) fail("That package no longer exists or is switched off.");
    const services = (svc ?? []).map((s) => ({ ...s, unit_price: Number(s.unit_price), tax_rate: Number(s.tax_rate) }));
    const serves = checkNumber(input.serves, "Number of serves", 0, 100_000) as number;
    const staff = checkNumber(input.staff, "Number of staff", 0, 20) as number;
    const result = priceJob((pkg.rules ?? {}) as PackageRules, services, {
      start_minutes: hhmm(input.start, "Start time"), end_minutes: hhmm(input.end, "Finish time"),
      serves, staff_count: staff, include_delivery: !!input.includeDelivery,
    });
    if (!result.lines.length) fail("Nothing to add — check the times, serves and staff.");

    const title = clean(input.sectionTitle, 120) ?? `${pkg.name} — ${input.start}–${input.end}`;
    const { data: last } = await supabase.from("quote_sections").select("position").eq("quote_id", q.id)
      .order("position", { ascending: false }).limit(1).maybeSingle();
    const { data: sec, error: secErr } = await supabase.from("quote_sections").insert({
      organisation_id: org.id, quote_id: q.id, title, position: (last?.position ?? -1) + 1,
    }).select(SECTION_COLS).single();
    if (secErr) fail(`Couldn't add the section: ${secErr.message}`);
    const { data: items, error: iErr } = await supabase.from("quote_items").insert(result.lines.map((l, i) => ({
      organisation_id: org.id, quote_id: q.id, section_id: (sec as QSection).id, name: l.name, description: l.description,
      quantity: l.quantity, unit: l.unit, unit_price: l.unit_price, tax_rate: l.tax_rate, position: i,
    }))).select(ITEM_COLS);
    if (iErr) {
      await supabase.from("quote_sections").delete().eq("id", (sec as QSection).id);
      fail(`Couldn't add the lines: ${iErr.message}`);
    }
    await logActivity(supabase, {
      orgId: org.id, actorId: user.id, action: "quote.priced", entityType: "quote", entityId: q.id,
      eventId: q.event_id, customerId: q.customer_id,
      summary: `${actorName(profile)} priced ‘${pkg.name}’ on Quote Q-${q.number}: ${money(result.subtotal)} + tax`,
      metadata: { package_id: pkg.id, ...input, subtotal: result.subtotal, total: result.total },
    });
    refresh(q);
    const out = ((items ?? []) as QItem[]).map((i) => ({ ...i, quantity: Number(i.quantity), unit_price: Number(i.unit_price), tax_rate: Number(i.tax_rate), discount_percent: Number(i.discount_percent) }))
      .sort((a, b) => a.position - b.position);
    return { section: sec as QSection, items: out };
  });
}
