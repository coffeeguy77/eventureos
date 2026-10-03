"use server";

import { revalidatePath } from "next/cache";
import { canManage, requireOrg } from "@/lib/context";
import { actorName, logActivity } from "@/lib/activity";
import { addDaysISO, todayISO } from "@/lib/format";
import { errMessage, saveIntegrationSettings } from "@/lib/integrations/runtime";
import { buildContext } from "@/lib/integrations/sync-runner";
import { loadMatchContext } from "@/lib/quotes/history";
import { cleanAliases, xeroLinesToQuoteLines, type XeroLine } from "@/lib/quotes/xero-import";

/**
 * Old quotes and invoices (from Xero) → today's system:
 *   saveItemAlias  — remember that an old Xero item code is now one of today's price-list items
 *   copyToNewQuote — start a new job + draft quote from an old quote or invoice
 */
type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function saveItemAlias(code: string, serviceId: string | null): Promise<Result> {
  try {
    const { supabase, org, user, profile, role } = await requireOrg();
    if (!canManage(role)) return { ok: false, error: "Only owners, admins and managers can change item matches." };
    const key = String(code ?? "").trim().toLowerCase().slice(0, 100);
    if (!key) return { ok: false, error: "That line has no Xero item code to match." };
    if (serviceId && !UUID.test(serviceId)) return { ok: false, error: "Choose an item from the price list." };
    const { priceList } = await loadMatchContext(org.id);
    const item = serviceId ? priceList.find((p) => p.id === serviceId) : null;
    if (serviceId && !item) return { ok: false, error: "That item isn't on the price list any more." };
    if (item?.code && item.code.toLowerCase() === key) return { ok: true, data: undefined }; // already the same code

    const sctx = await buildContext(supabase, "user", org.id, "xero", user.id);
    const aliases = cleanAliases(sctx.integration.settings?.item_aliases);
    if (item) aliases[key] = item.id; else delete aliases[key];
    await saveIntegrationSettings(sctx, { item_aliases: aliases });
    await logActivity(supabase, {
      orgId: org.id, actorId: user.id, action: "integration.settings_changed", entityType: "integration", entityId: sctx.integration.id,
      summary: item ? `${actorName(profile)} matched old Xero item ‘${code}’ to ‘${item.name}’` : `${actorName(profile)} cleared the match for old Xero item ‘${code}’`,
    });
    revalidatePath("/xero-quotes", "layout");
    revalidatePath("/invoices", "layout");
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, error: errMessage(e) };
  }
}

export async function copyToNewQuote(input: { source: "xero_quote" | "invoice"; id: string; prices: "old" | "current"; name?: string }): Promise<Result<{ quoteId: string; number: number }>> {
  try {
    const { supabase, org, user, profile } = await requireOrg();
    if (!UUID.test(input.id)) return { ok: false, error: "That record link isn't valid." };
    const prices = input.prices === "current" ? "current" : "old";

    // The old record
    let src: { customer_id: string; number: string; label: string | null; lines: XeroLine[] };
    if (input.source === "xero_quote") {
      const { data, error } = await supabase.from("xero_quotes").select("customer_id, number, reference, title, line_items").eq("id", input.id).eq("organisation_id", org.id).maybeSingle();
      if (error) return { ok: false, error: `Couldn't load the quote: ${error.message}` };
      if (!data) return { ok: false, error: "That quote isn't in EventureOS any more." };
      src = { customer_id: data.customer_id, number: data.number ?? "Xero quote", label: data.reference || data.title, lines: (data.line_items ?? []) as XeroLine[] };
    } else {
      const { data, error } = await supabase.from("invoices").select("customer_id, number, reference, line_items, event:events(name)").eq("id", input.id).eq("organisation_id", org.id).maybeSingle();
      if (error) return { ok: false, error: `Couldn't load the invoice: ${error.message}` };
      if (!data) return { ok: false, error: "That invoice couldn't be found." };
      const ev = data.event as unknown as { name: string } | null;
      src = { customer_id: data.customer_id, number: data.number, label: data.reference || ev?.name || null, lines: (data.line_items ?? []) as XeroLine[] };
    }

    const { priceList, aliases } = await loadMatchContext(org.id);
    const lines = xeroLinesToQuoteLines(src.lines, priceList, { aliases, prices });
    if (!lines.length) return { ok: false, error: `${src.number} has no lines to copy.` };

    const { data: customer } = await supabase.from("customers").select("id, name").eq("id", src.customer_id).eq("organisation_id", org.id).maybeSingle();
    if (!customer) return { ok: false, error: "The client for that record couldn't be found." };
    const name = (input.name?.trim() || src.label?.trim() || customer.name).slice(0, 200);

    // A new job (date TBC) …
    const { data: contact } = await supabase.from("contacts").select("id").eq("customer_id", customer.id).order("is_primary", { ascending: false }).limit(1).maybeSingle();
    const { data: ev, error: evErr } = await supabase.from("events").insert({
      organisation_id: org.id, name, customer_id: customer.id, primary_contact_id: contact?.id ?? null,
      status: "planning", assigned_to: user.id, next_action: "Check the copied quote and send it", created_by: user.id,
    }).select("id, number").single();
    if (evErr) return { ok: false, error: `Couldn't create the job: ${evErr.message}` };
    if (contact) await supabase.from("event_contacts").insert({ organisation_id: org.id, event_id: ev.id, contact_id: contact.id, role: "Primary contact" });

    // … with a draft quote holding the copied lines
    const today = todayISO(org.timezone);
    const { data: q, error: qErr } = await supabase.from("quotes").insert({
      organisation_id: org.id, event_id: ev.id, customer_id: customer.id, title: name,
      status: "draft", issue_date: today, expiry_date: addDaysISO(today, 14), created_by: user.id,
    }).select("id, number").single();
    if (qErr) return { ok: false, error: `The job was created but the quote couldn't be: ${qErr.message}` };
    const { data: sec, error: sErr } = await supabase.from("quote_sections").insert({ organisation_id: org.id, quote_id: q.id, title: "Services", position: 0 }).select("id").single();
    if (sErr) return { ok: false, error: `The quote was created but its section couldn't be: ${sErr.message}` };
    const { error: iErr } = await supabase.from("quote_items").insert(lines.map((l, i) => ({
      organisation_id: org.id, quote_id: q.id, section_id: sec.id, position: i,
      name: l.name, description: l.description, quantity: l.quantity, unit: l.unit, unit_price: l.unit_price, tax_rate: l.tax_rate, service_id: l.service_id,
    })));
    if (iErr) return { ok: false, error: `The quote was created but the lines couldn't be copied: ${iErr.message}` };

    await logActivity(supabase, {
      orgId: org.id, actorId: user.id, action: "quote.created", entityType: "quote", entityId: q.id, eventId: ev.id, customerId: customer.id,
      summary: `${actorName(profile)} created Quote Q-${q.number} (EV-${ev.number}) by copying ${src.number}${prices === "current" ? " at today's prices" : ""}`,
      metadata: { copied_from: { source: input.source, id: input.id, number: src.number }, lines: lines.length, unmatched: lines.filter((l) => !l.service_id && l.unit_price).length },
    });
    revalidatePath("/quotes");
    revalidatePath("/events");
    revalidatePath(`/clients/${customer.id}`);
    return { ok: true, data: { quoteId: q.id, number: q.number } };
  } catch (e) {
    return { ok: false, error: errMessage(e) };
  }
}
