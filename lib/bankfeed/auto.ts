import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { alreadyInXero, pairTransfers, readReconcile, transferNote } from "@/lib/reconcile/core";
import { matchDeposits, matchPayouts, payoutLines, payoutReference, type OpenInvoice } from "@/lib/reconcile/match";
import { batchOf, matchOrdermentum } from "@/lib/reconcile/ordermentum";
import { sharedOrgIds } from "@/lib/reconcile/shared";
import { feedAccounts, feedStatement, redbarkKey, REDBARK_PROVIDER, type FeedRun, type FeedSettings } from "./redbark";

/**
 * The bank feed's daily run (and "Sync & send now"): read the last few weeks of settled transactions from Redbark,
 * match them the same way Reconcile does, and send to Xero only what's certain —
 *   · transfers between your own accounts where there's only one way to pair them
 *   · deposits that name the customer or invoice number and match an open invoice to the cent
 *   · Stripe payouts whose breakdown adds up, coded with your saved accounts
 *   · Ordermentum payouts whose Gmail remittance adds up and whose invoices are all open
 * Everything already in Xero is skipped (Xero is checked each time), so running twice never doubles anything.
 * Only accounts matched to a Xero bank account, and only from the Reconcile start date. Anything unsure is counted
 * for a person to look at on the Reconcile page.
 */
const LOOKBACK_DAYS = 40;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const money = (n: number) => `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const benign = (e?: string) => !!e && /already (paid|in xero|reconciled)/i.test(e);

export async function runBankFeed(db: SupabaseClient, orgId: string, opts: { actorId?: string | null; send?: boolean } = {}): Promise<FeedRun> {
  const run: FeedRun = { at: new Date().toISOString(), ok: true, error: null, lines: 0, sent: { transfers: 0, payments: 0, payouts: 0, ordermentum: 0 }, check: { transfers: 0, deposits: 0, payouts: 0, ordermentum: 0 }, problems: [], items: [] };
  const conn = await redbarkKey(db, orgId);
  if (!conn) return { ...run, ok: false, error: "Redbark isn't connected." };
  let settings: FeedSettings = conn.settings;
  try {
    const { data: org } = await db.from("organisations").select("id, name, timezone, settings").eq("id", orgId).single();
    const rec = readReconcile(org?.settings);
    const tz = (org?.timezone as string) || "Australia/Sydney";
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

    // the accounts Redbark has (refreshed each run so new ones show up to be matched)
    const accounts = await feedAccounts(conn.key);
    settings = { ...settings, accounts };
    const mapped = accounts.filter((a) => rec.accounts[a.id] && a.status !== "unavailable");
    if (!rec.from || !DATE.test(rec.from)) throw new Error("Set the Reconcile start date first (Accounts → Reconcile → Bank feed), so nothing you've already reconciled is sent again.");
    if (!mapped.length) throw new Error("Match your Redbark accounts to Xero bank accounts first (Accounts → Reconcile → Bank feed).");
    const from = rec.from > addDays(today, -LOOKBACK_DAYS) ? rec.from : addDays(today, -LOOKBACK_DAYS);
    const s = await feedStatement(conn.key, mapped, from, today);
    run.lines = s.lines.length;
    const lines = s.lines.filter((l) => l.date >= rec.from!);
    const bank = (acc: string) => rec.accounts[acc];

    const doSend = opts.send ?? settings.auto;
    if (!doSend || !lines.length) { await save(db, conn.integrationId, settings, run); return run; }

    // Xero
    const { data: xi } = await db.from("integrations").select("status, scopes, settings").eq("organisation_id", orgId).eq("provider", "xero").maybeSingle();
    if (!xi || !["connected", "syncing", "error"].includes(xi.status as string)) throw new Error("Xero isn't connected.");
    const { buildContext } = await import("@/lib/integrations/sync-runner");
    const x = await import("@/lib/reconcile/xero");
    const ctx = await buildContext(db, "service", orgId, "xero", opts.actorId ?? null);
    const banks = await x.xeroBankAccounts(ctx);
    const bankIds = new Set(banks.map((b) => b.id));
    const bankName = (id: string) => banks.find((b) => b.id === id)?.name ?? "bank";
    let scopes = (xi.scopes ?? []) as string[];
    const lender = (xi.settings as { shared_from?: string } | null)?.shared_from;
    if (lender) scopes = (((await db.from("integrations").select("scopes").eq("id", lender).maybeSingle()).data?.scopes ?? []) as string[]);

    // 1. Transfers between your own accounts
    const pairing = pairTransfers(lines, { from: rec.from });
    const sure = pairing.pairs.filter((p) => !p.unsure && bankIds.has(bank(p.out.account)) && bankIds.has(bank(p.in.account)) && bank(p.out.account) !== bank(p.in.account));
    run.check.transfers = pairing.pairs.filter((p) => p.unsure).length;
    if (sure.length && x.canTransfer(scopes)) {
      const items = sure.map((p) => ({ key: p.key, from: bank(p.out.account), to: bank(p.in.account), amount: Math.round(p.amount * 100) / 100, date: p.out.date }));
      const earliest = items.reduce((a, t) => (t.date < a ? t.date : a), items[0].date);
      const there = alreadyInXero(items, await x.xeroTransfersSince(ctx, earliest));
      const todo = items.filter((t) => !there.has(t.key));
      for (let i = 0; i < todo.length; i += 100) {
        const res = await x.createXeroTransfers(ctx, todo.slice(i, i + 100));
        for (const r of res) {
          const t = todo.find((y) => y.key === r.key)!;
          const p = sure.find((y) => y.key === r.key)!;
          if (r.ok && r.id) { run.sent.transfers++; run.items.push({ kind: "transfer", date: t.date, amount: t.amount, text: `${bankName(t.from)} → ${bankName(t.to)}${transferNote(p.out.narrative) ? ` · ${transferNote(p.out.narrative)}` : ""}` }); }
          else if (!r.ok && !benign(r.error)) run.problems.push(`Transfer ${money(t.amount)} on ${t.date}: ${r.error}`);
        }
      }
    } else if (sure.length) run.problems.push("Xero needs the bank-transactions permission for transfers — reconnect Xero from Accounts → Reconcile.");

    // open invoices in this Xero file (this business and any sharing it)
    const orgIds = await sharedOrgIds(db, orgId);
    const { data: inv } = await db.from("invoices").select("id, xero_invoice_id, number, balance, issue_date, due_date, organisation_id, customer:customers(name, company)")
      .in("organisation_id", orgIds).in("status", ["awaiting_payment", "overdue", "part_paid"]).gt("balance", 0).not("xero_invoice_id", "is", null).limit(3000);
    const invoices: OpenInvoice[] = ((inv ?? []) as unknown as { id: string; xero_invoice_id: string; number: string | null; balance: number; issue_date: string | null; due_date: string | null; organisation_id: string; customer: { name: string; company: string | null } | null }[])
      .filter((i) => i.issue_date).map((i) => ({ id: i.id, xeroId: i.xero_invoice_id, number: i.number, customer: i.customer?.name ?? "Customer", company: i.customer?.company ?? null, balance: Number(i.balance), issueDate: i.issue_date!, dueDate: i.due_date, org: i.organisation_id }));

    // 2. Customer deposits that name the customer or invoice
    const deps = matchDeposits(lines, invoices, { from: rec.from });
    const sureDeps = deps.filter((m) => m.invoice && m.named && !m.unsure && bankIds.has(bank(m.line.account)));
    run.check.deposits = deps.filter((m) => !(m.invoice && m.named && !m.unsure)).length;
    const once = new Map<string, number>();
    for (const m of sureDeps) once.set(m.invoice!.id, (once.get(m.invoice!.id) ?? 0) + 1);
    const pay = sureDeps.filter((m) => once.get(m.invoice!.id) === 1).map((m) => ({ key: m.key, invoice: m.invoice!.xeroId, bank: bank(m.line.account), amount: m.line.amount, date: m.line.date, reference: m.line.narrative.slice(0, 120) }));
    if (pay.length) {
      const res = await x.createXeroPayments(ctx, pay);
      for (const r of res) {
        const m = sureDeps.find((y) => y.key === r.key)!;
        if (r.ok) { run.sent.payments++; run.items.push({ kind: "payment", date: m.line.date, amount: m.line.amount, text: `${m.invoice!.customer}${m.invoice!.number ? ` · ${m.invoice!.number}` : ""}` }); }
        else if (!benign(r.error)) run.problems.push(`Payment ${money(m.line.amount)} from ${m.invoice!.customer}: ${r.error}`);
      }
      if (run.sent.payments) { const { revalidatePath } = await import("next/cache"); try { revalidatePath("/invoices"); } catch { /* outside a request */ } }
    }

    // 3. Stripe payouts
    const { data: st } = await db.from("integrations").select("status, settings").eq("organisation_id", orgId).eq("provider", "stripe").maybeSingle();
    const c = rec.stripe;
    if (st?.status === "connected" && lines.some((l) => l.amount > 0 && /\bSTRIPE\b/i.test(l.narrative))) {
      if (!c.other.account || !c.fees.account) run.problems.push("Stripe payouts are waiting: choose the Stripe accounts on the Reconcile page (step 5) once, and they'll go automatically.");
      else {
        const { stripePayouts } = await import("@/lib/reconcile/stripe");
        const payouts = await stripePayouts(db, orgId, orgIds, addDays(rec.from, -1), addDays(today, 1));
        const matched = matchPayouts(lines, payouts).filter((m) => m.line && m.line.date >= rec.from! && bankIds.has(bank(m.line.account)));
        if (matched.length) {
          const accounts = await x.xeroAccountsAll(ctx);
          const clearingId = (st.settings as { xero_account?: string } | null)?.xero_account ?? null;
          const clearing = clearingId ? accounts.find((a) => a.id === clearingId || a.code === clearingId) ?? null : null;
          const there = await x.payoutsInXero(ctx, matched.map((m) => m.payout.id));
          const todo: import("@/lib/reconcile/xero").NewDeposit[] = [];
          for (const m of matched) {
            if (there.has(m.payout.id)) continue;
            const p = m.payout;
            if (p.recorded && (!clearing?.code || clearing.type === "BANK")) { run.check.payouts++; continue; }
            const built = payoutLines(p, { clearing: clearing?.code ?? null, shop: c.shop, bookings: c.bookings, other: c.other, fees: c.fees });
            if (!built.balanced || !built.coded || !(built.total > 0)) { run.check.payouts++; continue; }
            todo.push({ key: m.key, payoutId: p.id, bank: bank(m.line!.account), date: m.line!.date, reference: payoutReference(p), lines: built.lines });
          }
          if (todo.length) {
            const res = await x.createPayoutDeposits(ctx, todo, c.contact ?? "Stripe");
            for (const r of res) {
              const t = todo.find((y) => y.key === r.key)!;
              const amt = t.lines.reduce((a, l) => a + l.amount, 0);
              if (r.ok && r.id) { run.sent.payouts++; run.items.push({ kind: "payout", date: t.date, amount: Math.round(amt * 100) / 100, text: `Stripe payout ${t.payoutId}` }); }
              else if (!r.ok && !benign(r.error)) run.problems.push(`Stripe payout ${t.payoutId}: ${r.error}`);
            }
          }
        }
      }
    }

    // 4. Ordermentum payouts (remittances from Gmail)
    const om = lines.filter((l) => l.amount > 0 && /ORDERMENTUM/i.test(l.narrative));
    if (om.length) {
      const batches = [...new Set(om.map((l) => batchOf(l.narrative)).filter((b): b is string => !!b))];
      const there = batches.length ? await x.batchesInXero(ctx, batches) : new Map();
      const want = batches.filter((b) => !there.has(b));
      if (want.length) {
        let rows: import("@/lib/reconcile/ordermentum").RemitRow[] = [];
        try {
          const g = await buildContext(db, "service", orgId, "gmail", opts.actorId ?? null);
          const { ordermentumRemittances } = await import("@/lib/reconcile/ordermentum-gmail");
          rows = (await ordermentumRemittances(g, want)).rows;
        } catch { run.problems.push("Ordermentum payouts need Gmail connected to find their remittances."); }
        const matches = matchOrdermentum(om, rows, invoices, { from: rec.from }).filter((m) => m.batch && want.includes(m.batch) && bankIds.has(bank(m.line.account)));
        const ready = matches.filter((m) => m.state === "ready");
        run.check.ordermentum = matches.length - ready.length;
        if (ready.length) {
          const todo = ready.map((m) => {
            const payments = m.rows.map((i) => ({ invoice: i.open!.xeroId, amount: Math.round(i.amount * 100) / 100 }));
            return { key: m.key, batch: m.batch!, bank: bank(m.line.account), date: m.line.date, payments,
              reference: x.batchReference(m.batch!, m.rows.map((i) => ({ invoice: i.invoice.slice(0, 30), retailer: i.retailer.replace(/[^\p{L}\p{N} &'.-]/gu, "").slice(0, 40), amount: i.amount }))) };
          });
          const res = await x.createBatchPayments(ctx, todo);
          for (const r of res) {
            const m = ready.find((y) => y.key === r.key)!;
            if (r.ok && r.id) { run.sent.ordermentum++; run.items.push({ kind: "ordermentum", date: m.line.date, amount: m.line.amount, text: `Ordermentum ${m.batch} · ${m.rows.length} invoice${m.rows.length === 1 ? "" : "s"}` }); }
            else if (!r.ok && !benign(r.error)) run.problems.push(`Ordermentum ${m.batch}: ${r.error}`);
          }
        }
      }
    }

    const total = run.sent.transfers + run.sent.payments + run.sent.payouts + run.sent.ordermentum;
    if (total) {
      const parts = [[run.sent.transfers, "transfer"], [run.sent.payments, "invoice payment"], [run.sent.payouts, "Stripe payout"], [run.sent.ordermentum, "Ordermentum payout"]]
        .filter(([n]) => n).map(([n, w]) => `${n} ${w}${n === 1 ? "" : "s"}`).join(", ");
      await db.from("activity_logs").insert({ organisation_id: orgId, actor_id: opts.actorId ?? null, action: "bankfeed.sent", entity_type: "organisation", entity_id: orgId,
        summary: `Bank feed sent ${parts} to Xero automatically` }).then(() => null, () => null);
    }
    if (run.problems.length) {
      await db.from("notifications").insert({ organisation_id: orgId, type: "bankfeed.problem", title: "Bank feed: some items need you",
        body: run.problems[0].slice(0, 140), link: "/accounts/reconcile", entity_type: "organisation", entity_id: orgId }).then(() => null, () => null);
    }
  } catch (e) {
    run.ok = false;
    run.error = e instanceof Error ? e.message.slice(0, 300) : String(e);
  }
  await save(db, conn.integrationId, settings, run);
  return run;
}

async function save(db: SupabaseClient, integrationId: string, settings: FeedSettings, run: FeedRun) {
  const items = run.items.slice(-60);
  await db.from("integrations").update({
    settings: { ...settings, last_run: { ...run, items, problems: run.problems.slice(0, 20) } },
    last_sync_at: run.at, last_error: run.ok ? null : run.error,
  }).eq("id", integrationId).then(() => null, () => null);
}

/** Every business with a Redbark key (the morning cron). */
export async function runBankFeeds(db: SupabaseClient) {
  const { data } = await db.from("integrations").select("organisation_id").eq("provider", REDBARK_PROVIDER).eq("status", "connected").limit(200);
  const out: { org: string; ok: boolean; sent: number; error: string | null }[] = [];
  for (const r of (data ?? []) as { organisation_id: string }[]) {
    const run = await runBankFeed(db, r.organisation_id);
    out.push({ org: r.organisation_id, ok: run.ok, sent: run.sent.transfers + run.sent.payments + run.sent.payouts + run.sent.ordermentum, error: run.error });
  }
  return out;
}
