import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { billingReference, codeRules, hasHostingCode, readHosting } from "./core";
import { matchAccounts, matchRecurring, type AccountMatch, type MRecurring } from "./match";
import { checkBilling, logEvent } from "./server";

/**
 * Billing check for every hosting account: its client, the repeating invoice that bills it, what's owing, and
 * the gaps — sites nobody is billed for, clients to confirm, repeating invoices for sites that aren't on a server.
 */
type Acc = { id: string; domain: string; username: string | null; server_email: string | null; customer_id: string | null; on_server: boolean; suspended: boolean; billing_status: string | null; match_status: string | null; amount_due: number | null; days_overdue: number | null; invoice_id: string | null; server_id: string; hosting_servers: { name: string } | null };
type Rec = { id: string; customer_id: string; name: string; category: string; status: string; reference: string | null; line_items: { description?: string; item_code?: string | null }[] | null; total: number; every: number; unit: string; hosting_account_id: string | null; next_date: string };

async function all<T>(q: (from: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < 50_000; from += 1000) {
    const { data, error } = await q(from);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

export async function loadBillingCheck(db: SupabaseClient, orgId: string) {
  const { data: org } = await db.from("organisations").select("settings").eq("id", orgId).single();
  const rules = codeRules(readHosting(org?.settings));
  const since = new Date(Date.now() - 24 * 31 * 86_400_000).toISOString().slice(0, 10);
  const [accounts, customers, invoices, recurring] = await Promise.all([
    all<Acc>((f) => db.from("hosting_accounts").select("id, domain, username, server_email, customer_id, on_server, suspended, billing_status, match_status, amount_due, days_overdue, invoice_id, server_id, hosting_servers(name)").eq("organisation_id", orgId).order("domain").range(f, f + 999)),
    all<{ id: string; name: string; company: string | null; email: string | null }>((f) => db.from("customers").select("id, name, company, email").eq("organisation_id", orgId).range(f, f + 999)),
    all<{ id: string; customer_id: string | null; reference: string | null; line_items: { description?: string; item_code?: string | null }[] | null; issue_date: string; status: string; total: number; amount_paid: number | null }>((f) => db.from("invoices").select("id, customer_id, reference, line_items, issue_date, status, total, amount_paid").eq("organisation_id", orgId).gte("issue_date", since).range(f, f + 999)),
    all<Rec>((f) => db.from("recurring_invoices").select("id, customer_id, name, category, status, reference, line_items, total, every, unit, hosting_account_id, next_date").eq("organisation_id", orgId).range(f, f + 999)).catch(() => [] as Rec[]),
  ]);
  const text = (ref: string | null, lines: { description?: string }[] | null) => `${ref ?? ""} ${(lines ?? []).map((l) => l?.description ?? "").join(" ")}`.toLowerCase();
  const mrec: MRecurring[] = recurring.map((r) => ({ id: r.id, customer_id: r.customer_id, text: `${r.name} ${text(r.reference, r.line_items)}`, category: r.category, hosting_account_id: r.hosting_account_id, status: r.status }));
  const minv = invoices.map((i) => ({ customer_id: i.customer_id, text: text(i.reference, i.line_items) }));
  const matches = matchAccounts(accounts.map((a) => ({ id: a.id, domain: a.domain, server_email: a.server_email, customer_id: a.customer_id })), customers, minv, mrec);
  const byId = new Map(matches.map((m) => [m.accountId, m]));
  // the client each account would have once strong matches are applied
  const clientOf = (a: Acc) => a.customer_id ?? (byId.get(a.id)?.strong ? byId.get(a.id)!.best!.customerId : null);
  const recMatch = matchRecurring(accounts.map((a) => ({ id: a.id, domain: a.domain, server_email: a.server_email, customer_id: clientOf(a) })), mrec.filter((r) => !r.hosting_account_id));
  const recFor = new Map<string, Rec[]>();
  for (const r of recurring) {
    const acc = r.hosting_account_id ?? recMatch.get(r.id)?.accountId;
    if (acc) recFor.set(acc, [...(recFor.get(acc) ?? []), r]);
  }
  // hosting invoices in the last 13 months, per client
  const yearAgo = new Date(Date.now() - 396 * 86_400_000).toISOString().slice(0, 10);
  const hostedInvoices = new Map<string, number>();
  for (const i of invoices) if (i.customer_id && i.issue_date >= yearAgo && i.status !== "void" && hasHostingCode((i.line_items ?? []).map((l) => (l?.item_code ?? "").trim()).filter(Boolean), rules)) hostedInvoices.set(i.customer_id, (hostedInvoices.get(i.customer_id) ?? 0) + 1);
  const custName = new Map(customers.map((c) => [c.id, c.company || c.name]));

  const rows = accounts.map((a) => {
    const m = byId.get(a.id) as AccountMatch;
    const cid = clientOf(a);
    const recs = recFor.get(a.id) ?? [];
    const activeRec = recs.filter((r) => r.status !== "ended");
    const billedRecently = cid ? (hostedInvoices.get(cid) ?? 0) > 0 : false;
    const group =
      !cid ? (m.best ? "confirm" : "unknown")
      : Number(a.amount_due ?? 0) > 0 && (a.days_overdue ?? 0) > 0 ? "owing"
      : activeRec.length ? "billed"
      : billedRecently ? "no_repeat"
      : "missing";
    return {
      id: a.id, domain: a.domain, username: a.username, server: a.hosting_servers?.name ?? "", serverEmail: a.server_email, onServer: a.on_server, suspended: a.suspended,
      customerId: cid, customer: cid ? custName.get(cid) ?? "Client" : null, linked: !!a.customer_id, strong: m.strong,
      suggestion: !a.customer_id && m.best ? { id: m.best.customerId, name: custName.get(m.best.customerId) ?? "Client", reasons: m.best.reasons, score: m.best.score } : null,
      others: m.others.map((o) => ({ id: o.customerId, name: custName.get(o.customerId) ?? "Client", reasons: o.reasons })),
      recurring: activeRec.map((r) => ({ id: r.id, name: r.name, total: Number(r.total), every: r.every, unit: r.unit, status: r.status })),
      owing: Number(a.amount_due ?? 0), daysOverdue: a.days_overdue ?? 0, billingStatus: a.billing_status, group,
    };
  });
  const orphanRecurring = recurring.filter((r) => r.category === "hosting" && r.status !== "ended" && !r.hosting_account_id && !recMatch.has(r.id))
    .map((r) => ({ id: r.id, name: r.name, customer: custName.get(r.customer_id) ?? "Client", total: Number(r.total), status: r.status, reference: r.reference }));
  return { rows, orphanRecurring, recurringCount: recurring.length, recMatch, matches, accounts };
}

/** Pull Xero's repeating invoices, link the clear matches, tie repeating invoices to their sites, then recheck billing. */
export async function applyBillingMatches(db: SupabaseClient, orgId: string, actor: string | null, importXero: () => Promise<string>) {
  const notes: string[] = [];
  try { notes.push(await importXero()); } catch (e) { notes.push(`Xero repeating invoices: ${e instanceof Error ? e.message : e}`); }
  const r = await loadBillingCheck(db, orgId);
  let linked = 0, tied = 0, refs = 0;
  for (const m of r.matches) {
    const a = r.accounts.find((x) => x.id === m.accountId)!;
    if (a.customer_id || !m.strong || !m.best) continue;
    const { error } = await db.from("hosting_accounts").update({ customer_id: m.best.customerId, updated_at: new Date().toISOString() }).eq("id", a.id).is("customer_id", null);
    if (!error) { linked++; await logEvent(db, { orgId, accountId: a.id, action: "setting", detail: `Linked to a client automatically: ${m.best.reasons.join("; ")}`, actor }); }
  }
  const { data: recs } = await db.from("recurring_invoices").select("id, reference, category, hosting_account_id").eq("organisation_id", orgId);
  const domainOf = new Map(r.accounts.map((a) => [a.id, a.domain]));
  for (const rec of (recs ?? []) as { id: string; reference: string | null; category: string; hosting_account_id: string | null }[]) {
    const hit = rec.hosting_account_id ? null : r.recMatch.get(rec.id);
    const acc = rec.hosting_account_id ?? hit?.accountId ?? null;
    const patch: Record<string, unknown> = {};
    if (hit) patch.hosting_account_id = hit.accountId;
    // so future invoices match the site exactly (only when it has no reference of its own)
    if (acc && rec.category === "hosting" && !rec.reference?.trim()) patch.reference = billingReference(domainOf.get(acc));
    if (Object.keys(patch).length) {
      await db.from("recurring_invoices").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", rec.id);
      if (patch.hosting_account_id) tied++;
      if (patch.reference) refs++;
    }
  }
  const b = await checkBilling(db, orgId);
  notes.push(`${linked} sites linked to their client`, `${tied} repeating invoices tied to their site`, ...(refs ? [`${refs} hosting repeating invoices given the HOSTING | domain reference`] : []), `${b.accounts} sites rechecked`);
  return notes.join(" · ") + ".";
}
