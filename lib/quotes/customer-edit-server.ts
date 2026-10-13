import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { changeText, cleanChange, customerCanChange, customerCatalogue, servesDescription, type EditLine, type EditService } from "./customer-edit";

/** Everything the quote link needs to let the customer change their quote — or why they can't. */
export interface CustomerEditData {
  quoteId: string; quoteNumber: number; orgId: string; customerId: string; eventId: string | null;
  lines: (EditLine & { description: string | null; editable: boolean; section: string })[];
  catalogue: EditService[];
  perServe: string[];
}

export async function loadCustomerEdit(db: SupabaseClient, token: string): Promise<{ ok: true; data: CustomerEditData } | { ok: false; reason: string }> {
  if (!/^[0-9a-f]{64}$/.test(token)) return { ok: false, reason: "This link isn't valid." };
  const { data: r } = await db.from("email_send_recipients").select("quote_id, role").eq("token", token).maybeSingle();
  if (!r?.quote_id) return { ok: false, reason: "This link isn't valid." };
  if (r.role !== "to") return { ok: false, reason: "This is the sender's copy — only the customer can change the quote from their own link." };
  const { data: q } = await db.from("quotes").select("id, number, status, expiry_date, organisation_id, customer_id, event_id, current_version_id, has_unpublished_changes, organisation:organisations(settings, timezone)")
    .eq("id", r.quote_id).maybeSingle();
  if (!q) return { ok: false, reason: "This quote isn't available." };
  const o = q.organisation as unknown as { settings: Record<string, unknown> | null; timezone: string | null } | null;
  const settings = (o?.settings ?? {}) as Record<string, unknown>;
  if (settings.quote_customer_edit === false) return { ok: false, reason: "off" };
  if (!["sent", "viewed"].includes(q.status as string)) return { ok: false, reason: "This quote can't be changed now." };
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: o?.timezone || "Australia/Sydney" }).format(new Date());
  if (q.expiry_date && q.expiry_date < today) return { ok: false, reason: "This quote has expired." };

  const [{ data: items }, { data: svc }, { data: pkgs }] = await Promise.all([
    db.from("quote_items").select("id, name, description, quantity, unit, unit_price, tax_rate, service_id, details, is_optional, section_id, position, section:quote_sections(title, position), service:services(category)")
      .eq("quote_id", q.id),
    db.from("services").select("id, name, description, unit, unit_price, tax_rate, category").eq("organisation_id", q.organisation_id).eq("active", true).order("category").order("position"),
    db.from("service_packages").select("rules").eq("organisation_id", q.organisation_id).eq("active", true),
  ]);
  const perServe = ((pkgs ?? []) as { rules: { per_serve?: { service_id?: string } | null } | null }[]).map((p) => p.rules?.per_serve?.service_id).filter((x): x is string => !!x);
  const ps = new Set(perServe);
  type Row = { id: string; name: string; description: string | null; quantity: number; unit: string | null; unit_price: number; tax_rate: number; service_id: string | null; details: { kind?: string } | null;
    is_optional: boolean; section_id: string; position: number; section: { title: string; position: number } | null; service: { category: string | null } | null };
  const lines = ((items ?? []) as unknown as Row[])
    .sort((a, b) => (a.section?.position ?? 0) - (b.section?.position ?? 0) || a.position - b.position)
    .map((i) => {
      const l: EditLine = { id: i.id, name: i.name, quantity: Number(i.quantity), unit: i.unit, unit_price: Number(i.unit_price), tax_rate: Number(i.tax_rate), service_id: i.service_id,
        details: i.details, is_optional: i.is_optional, section_id: i.section_id, category: i.service?.category ?? null };
      return { ...l, description: i.description, editable: customerCanChange(l, ps), section: i.section?.title ?? "" };
    });
  const catalogue = customerCatalogue(((svc ?? []) as EditService[]).map((s) => ({ ...s, unit_price: Number(s.unit_price), tax_rate: Number(s.tax_rate) })));
  if (!lines.some((l) => l.editable) && !catalogue.length) return { ok: false, reason: "nothing" };
  return { ok: true, data: { quoteId: q.id, quoteNumber: q.number as number, orgId: q.organisation_id as string, customerId: q.customer_id as string, eventId: q.event_id as string | null,
    lines, catalogue, perServe } };
}

/**
 * Apply the customer's change and publish it as the next version (the same link shows it, ready to accept).
 * Refused while the business has unsent changes of its own on the quote, so nothing half-finished goes out.
 */
export async function applyCustomerChange(db: SupabaseClient, token: string, raw: unknown, who: string) {
  const loaded = await loadCustomerEdit(db, token);
  if (!loaded.ok) throw new Error(loaded.reason === "off" || loaded.reason === "nothing" ? "Changes can't be made online for this quote — please contact us." : loaded.reason);
  const d = loaded.data;
  const { data: q } = await db.from("quotes").select("has_unpublished_changes").eq("id", d.quoteId).single();
  if (q?.has_unpublished_changes) throw new Error("We're updating this quote right now — please contact us, or try again shortly.");
  const change = cleanChange(raw, d.lines, d.catalogue, new Set(d.perServe));
  const byId = new Map(d.lines.map((l) => [l.id, l]));

  for (const s of change.set) {
    const l = byId.get(s.id)!;
    const patch: Record<string, unknown> = { quantity: s.quantity };
    if (l.details?.kind === "serves") {
      const cold = Math.min(s.quantity, Math.max(0, Number((l.details as { cold?: number }).cold ?? 0)));
      patch.details = { kind: "serves", hot: s.quantity - cold, cold };
      patch.description = servesDescription(l.description, s.quantity - cold, cold);
    }
    const { error } = await db.from("quote_items").update(patch).eq("id", s.id).eq("quote_id", d.quoteId);
    if (error) throw new Error(`Couldn't save the change: ${error.message}`);
  }
  if (change.remove.length) {
    const { error } = await db.from("quote_items").delete().eq("quote_id", d.quoteId).in("id", change.remove);
    if (error) throw new Error(`Couldn't save the change: ${error.message}`);
  }
  if (change.add.length) {
    // Into the section that already has the catering, else a new "Catering" section at the end
    let sectionId = d.lines.find((l) => /^catering\b/i.test(l.category ?? "") && !change.remove.includes(l.id))?.section_id ?? null;
    if (!sectionId) {
      const { data: secs } = await db.from("quote_sections").select("id, title, position").eq("quote_id", d.quoteId).order("position", { ascending: false });
      sectionId = ((secs ?? []) as { id: string; title: string }[]).find((x) => /catering/i.test(x.title))?.id ?? null;
      if (!sectionId) {
        const pos = ((secs ?? [])[0]?.position ?? -1) + 1;
        const { data: sec, error } = await db.from("quote_sections").insert({ organisation_id: d.orgId, quote_id: d.quoteId, title: "Catering", position: pos }).select("id").single();
        if (error) throw new Error(`Couldn't save the change: ${error.message}`);
        sectionId = sec.id as string;
      }
    }
    const { data: last } = await db.from("quote_items").select("position").eq("section_id", sectionId).order("position", { ascending: false }).limit(1).maybeSingle();
    let pos = (last?.position ?? -1) + 1;
    const rows = change.add.map((a) => {
      const s = d.catalogue.find((x) => x.id === a.service_id)!;
      return { organisation_id: d.orgId, quote_id: d.quoteId, section_id: sectionId, service_id: s.id, name: s.name, description: s.description, quantity: a.quantity,
        unit: s.unit, unit_price: s.unit_price, tax_rate: s.tax_rate, position: pos++ };
    });
    const { error } = await db.from("quote_items").insert(rows);
    if (error) throw new Error(`Couldn't save the change: ${error.message}`);
  }

  const { data: vid, error: pErr } = await db.rpc("publish_quote", { p_quote_id: d.quoteId });
  if (pErr) throw new Error(`Couldn't update the quote: ${pErr.message}`);
  const { data: v } = await db.from("quote_versions").select("version_number, total").eq("id", vid as string).single();
  const what = changeText(change, d.lines, d.catalogue);
  const total = Number(v?.total ?? 0).toLocaleString("en-AU", { style: "currency", currency: "AUD" });
  const summary = `${who} changed Quote Q-${d.quoteNumber} on their quote link — ${what}. Now version ${v?.version_number} (${total}), waiting for them to accept.`;
  // publish_quote logged "Someone sent …" — say who and what instead
  const { data: log } = await db.from("activity_logs").select("id").eq("entity_id", d.quoteId).eq("action", "quote.sent").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (log) await db.from("activity_logs").update({ action: "quote.customer_changed", actor_type: "customer", actor_label: who, summary: summary.slice(0, 1000) }).eq("id", log.id);
  await db.from("notifications").insert({ organisation_id: d.orgId, type: "quote.customer_changed", title: `${who} changed Q-${d.quoteNumber}`.slice(0, 200),
    body: what.slice(0, 500), link: `/quotes/${d.quoteId}`, entity_type: "quote", entity_id: d.quoteId });
  return { version: v?.version_number as number, total: Number(v?.total ?? 0), what };
}
