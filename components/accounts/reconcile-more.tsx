"use client";

import { useMemo, useState, useTransition } from "react";
import { CheckCircle2, Loader2, RefreshCw, Save, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Label, Select } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import type { ParsedStatement, ReconcileSettings, StripeCoding } from "@/lib/reconcile/core";
import { matchDeposits, matchPayouts, payoutLines, type OpenInvoice, type Payout } from "@/lib/reconcile/match";
import type { XeroAccountLite, XeroBank, XeroTaxRate } from "@/lib/reconcile/xero";
import { loadPayouts, saveReconcileSettings, sendPayments, sendPayouts } from "@/app/(app)/accounts/reconcile-actions";

const money = (n: number) => `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmt = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
const tail = (n: string) => `…${n.replace(/\D/g, "").slice(-4) || n}`;
type Res = Record<string, { ok: boolean; id?: string; error?: string }>;
const tabs = (list: [string, string, number][], on: string, set: (k: string) => void) => (
  <div className="no-scrollbar flex gap-1.5 overflow-x-auto border-t border-line px-5 py-3">
    {list.map(([k, l, n]) => <button key={k} type="button" onClick={() => set(k)} className={cn("shrink-0 rounded-full px-3 py-1.5 text-[0.7812rem] font-medium", on === k ? "bg-ink text-surface" : "bg-surface text-ink-muted ring-1 ring-line hover:text-ink")}>{l} · {n.toLocaleString()}</button>)}
  </div>
);

/** 4. Customer payments: deposits matched to open invoices, recorded in Xero into the bank they landed in. */
export function InvoiceDeposits({ file, map, from, banks, invoices, canSend }: {
  file: ParsedStatement; map: Record<string, string>; from: string; banks: XeroBank[]; invoices: OpenInvoice[]; canTransfer: boolean; canSend: boolean;
}) {
  const matches = useMemo(() => matchDeposits(file.lines, invoices, { from: from || null }), [file, invoices, from]);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [res, setRes] = useState<Res>({});
  const [tab, setTab] = useState("named");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const bankName = (acc: string) => banks.find((b) => b.id === map[acc])?.name ?? tail(acc);
  const rows = matches.map((m) => {
    const invId = choice[m.key] ?? m.invoice?.id ?? "";
    const inv = m.options.find((o) => o.id === invId) ?? (m.invoice?.id === invId ? m.invoice : null);
    const r = res[m.key];
    const state = r?.ok ? "done" : m.named && !m.unsure ? "named" : m.invoice ? "check" : "choose";
    return { ...m, inv, state, error: r && !r.ok ? r.error : undefined, ticked: picked[m.key] ?? (m.named && !m.unsure) };
  });
  // one invoice can only take one deposit
  const taken = new Map<string, number>();
  for (const r of rows) if (r.inv && r.ticked && r.state !== "done") taken.set(r.inv.id, (taken.get(r.inv.id) ?? 0) + 1);
  const toSend = rows.filter((r) => r.state !== "done" && r.ticked && r.inv && map[r.line.account] && (taken.get(r.inv.id) ?? 0) === 1);
  const n = (s: string) => rows.filter((r) => r.state === s).length;
  const send = () => start(async () => {
    setMsg(null);
    const items = toSend.map((r) => ({ key: r.key, invoice: r.inv!.xeroId, bank: map[r.line.account], amount: r.line.amount, date: r.line.date, reference: r.line.narrative.slice(0, 120) }));
    let ok = 0, bad = 0;
    for (let i = 0; i < items.length; i += 100) {
      const r = await sendPayments(items.slice(i, i + 100));
      if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
      setRes((s) => { const x = { ...s }; for (const y of r.data) x[y.key] = y; return x; });
      ok += r.data.filter((y) => y.ok).length; bad += r.data.filter((y) => !y.ok).length;
    }
    setMsg({ ok: !bad, text: `${ok} payment${ok === 1 ? "" : "s"} recorded in Xero${bad ? ` · ${bad} didn't go — reasons are in the list` : ""}. In Xero, each deposit now shows its invoice payment as the match: click OK.` });
  });
  const shown = rows.filter((r) => r.state === tab);
  return (
    <Card className="overflow-hidden">
      <CardHeader title="4. Customer payments" subtitle={`Deposits that match an open invoice of the same amount (${invoices.length} invoices open in Xero). Ticked: the payer's name or invoice number is in the bank description. Others are only an amount match — check them.`} />
      <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
        {canSend ? <Button variant="primary" onClick={send} disabled={pending || !toSend.length}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Record {toSend.length} payment{toSend.length === 1 ? "" : "s"} in Xero</Button>
          : <span className="text-[0.75rem] text-ink-muted">An owner or admin records payments in Xero.</span>}
        <span className="text-[0.75rem] text-ink-muted">Xero is re-checked first — an invoice already paid there is skipped.</span>
      </div>
      {msg && <p className={cn("border-t border-line px-5 py-2.5 text-[0.8125rem]", msg.ok ? "text-emerald-700" : "text-rose-700")}>{msg.text}</p>}
      {tabs([["named", "Named — ready", n("named")], ["check", "Amount only — check", n("check")], ["choose", "Choose the invoice", n("choose")], ["done", "Recorded", n("done")]], tab, setTab)}
      <div className="divide-y divide-line border-t border-line">
        {shown.slice(0, 300).map((r) => (
          <div key={r.key} className="flex flex-wrap items-center gap-3 px-5 py-2.5 text-[0.8125rem] sm:flex-nowrap">
            {r.state === "done" ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <input type="checkbox" aria-label="Record this payment" className="h-4 w-4 shrink-0" checked={r.ticked} disabled={!r.inv} onChange={(e) => setPicked({ ...picked, [r.key]: e.target.checked })} />}
            <span className="w-24 shrink-0 text-ink-muted">{fmt(r.line.date)}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-ink">{r.line.narrative}</span>
              <span className="block text-[0.75rem] text-ink-muted">into {bankName(r.line.account)}{r.inv && (taken.get(r.inv.id) ?? 0) > 1 ? " · another deposit is ticked for this invoice too" : ""}</span>
              {r.error && <span className="block text-[0.75rem] text-rose-700">{r.error}</span>}
            </span>
            {r.state === "done" ? <span className="text-[0.75rem] text-ink-muted">{r.inv ? `${r.inv.number ?? "Invoice"} · ${r.inv.customer}` : ""}</span> : (
              <Select aria-label="Invoice" className="h-9 w-full sm:w-72" value={r.inv?.id ?? ""} onChange={(e) => { setChoice({ ...choice, [r.key]: e.target.value }); setPicked({ ...picked, [r.key]: !!e.target.value }); }}>
                <option value="">Choose the invoice…</option>
                {r.options.map((o) => <option key={o.id} value={o.id}>{o.number ?? "Invoice"} · {o.customer} · {fmt(o.issueDate)}</option>)}
              </Select>
            )}
            <span className="w-24 shrink-0 text-right font-semibold tabular-nums text-ink">{money(r.line.amount)}</span>
          </div>
        ))}
        {!shown.length && <p className="px-5 py-4 text-[0.8125rem] text-ink-muted">Nothing here.</p>}
        {shown.length > 300 && <p className="px-5 py-3 text-[0.75rem] text-ink-muted">Showing the first 300 — record these, then the rest appear.</p>}
      </div>
    </Card>
  );
}

/** 5. Stripe payouts: one Xero deposit per payout, split into sales, fees (and payments already in Xero). */
export function StripePayouts({ file, map, from, banks, settings, accounts, taxRates, clearing, stripeOn, canTransfer, canSend }: {
  file: ParsedStatement; map: Record<string, string>; from: string; banks: XeroBank[]; settings: ReconcileSettings; accounts: XeroAccountLite[]; taxRates: XeroTaxRate[];
  clearing: { name: string; code: string | null; bank: boolean } | null; stripeOn: boolean; canTransfer: boolean; canSend: boolean;
}) {
  const [c, setC] = useState<StripeCoding>(settings.stripe);
  const [data, setData] = useState<{ payouts: Payout[]; inXero: Set<string> } | null>(null);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [res, setRes] = useState<Res>({});
  const [tab, setTab] = useState("ready");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const income = accounts.filter((a) => a.cls === "REVENUE" && a.code);
  const fees = accounts.filter((a) => a.cls === "EXPENSE" && a.code);
  const coded = !!c.income && !!c.fees;
  const lastDay = useMemo(() => file.accounts.reduce((a, x) => (x.to > a ? x.to : a), file.accounts[0].to), [file]);
  const bankName = (acc: string) => banks.find((b) => b.id === map[acc])?.name ?? tail(acc);
  // only payouts that landed in the bank on or after the start date (Stripe is asked a day either side)
  const matched = useMemo(() => (data ? matchPayouts(file.lines.filter((l) => !from || l.date >= from), data.payouts).filter((m) => !from || (m.line?.date ?? m.payout.arrival) >= from) : []), [data, file, from]);
  const rows = matched.map((m) => {
    const r = res[m.payout.id];
    const preview = payoutLines(m.payout, { clearing: clearing?.code ?? null, income: c.income ?? "income", incomeTax: c.incomeTax, fees: c.fees ?? "fees", feesTax: c.feesTax });
    const manual = m.payout.recorded > 0 && (!clearing?.code || clearing.bank);
    const state = r?.ok || data?.inXero.has(m.payout.id) ? "xero" : !m.line ? "missing" : manual || !preview.balanced ? "manual" : "ready";
    return { ...m, state, preview, error: r && !r.ok ? r.error : undefined, ticked: picked[m.payout.id] ?? state === "ready" };
  });
  const toSend = rows.filter((r) => r.state === "ready" && r.ticked && r.line && map[r.line.account]);
  const n = (s: string) => rows.filter((r) => r.state === s).length;

  const saveCoding = () => start(async () => {
    const r = await saveReconcileSettings({ accounts: map, from: from || null, stripe: c });
    setMsg(r.ok ? { ok: true, text: "Stripe coding saved." } : { ok: false, text: r.error });
  });
  const load = () => start(async () => {
    setMsg(null);
    if (!from) { setMsg({ ok: false, text: "Choose a start date first." }); return; }
    const r = await loadPayouts(from, lastDay);
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
    setData({ payouts: r.data.payouts, inXero: new Set(r.data.inXero) });
    setMsg({ ok: true, text: `${r.data.payouts.length} Stripe payout${r.data.payouts.length === 1 ? "" : "s"} from ${fmt(from)} to ${fmt(lastDay)}.` });
  });
  const send = () => start(async () => {
    setMsg(null);
    const r = await sendPayouts(toSend.map((x) => ({ key: x.payout.id, payoutId: x.payout.id, bank: map[x.line!.account], date: x.line!.date })));
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
    setRes((s) => { const y = { ...s }; for (const z of r.data) y[z.key] = z; return y; });
    const ok = r.data.filter((z) => z.ok).length, bad = r.data.length - ok;
    setMsg({ ok: !bad, text: `${ok} payout${ok === 1 ? "" : "s"} sent to Xero${bad ? ` · ${bad} didn't go — reasons are in the list` : ""}. Each Stripe line in the bank now matches its deposit in Xero: click OK.` });
  });

  if (!stripeOn) return <Card className="p-5 text-[0.8125rem] text-ink-muted">5. Stripe payouts — connect Stripe (Settings → Payments) to match payouts.</Card>;
  const shown = rows.filter((r) => r.state === tab);
  return (
    <Card className="overflow-hidden">
      <CardHeader title="5. Stripe payouts" subtitle="Each payout goes to Xero as one deposit into the bank it landed in — the sales, less refunds, to your income account and Stripe's fees to your fees account — so the Stripe line in the bank is one OK." />
      <div className="grid gap-3 border-t border-line px-5 py-4 sm:grid-cols-2">
        <div><Label htmlFor="st-inc">Stripe sales go to</Label><Select id="st-inc" value={c.income ?? ""} onChange={(e) => setC({ ...c, income: e.target.value || null })}><option value="">Choose an income account…</option>{income.map((a) => <option key={a.id} value={a.code!}>{a.code} · {a.name}</option>)}</Select></div>
        <div><Label htmlFor="st-inct">GST on those sales</Label><Select id="st-inct" value={c.incomeTax ?? ""} onChange={(e) => setC({ ...c, incomeTax: e.target.value || null })}><option value="">The account&apos;s default</option>{taxRates.map((t) => <option key={t.type} value={t.type}>{t.name}</option>)}</Select></div>
        <div><Label htmlFor="st-fee">Stripe fees go to</Label><Select id="st-fee" value={c.fees ?? ""} onChange={(e) => setC({ ...c, fees: e.target.value || null })}><option value="">Choose an expense account…</option>{fees.map((a) => <option key={a.id} value={a.code!}>{a.code} · {a.name}</option>)}</Select></div>
        <div><Label htmlFor="st-feet">GST on the fees</Label><Select id="st-feet" value={c.feesTax ?? ""} onChange={(e) => setC({ ...c, feesTax: e.target.value || null })}><option value="">The account&apos;s default</option>{taxRates.map((t) => <option key={t.type} value={t.type}>{t.name}</option>)}</Select></div>
        <p className="text-[0.75rem] text-ink-muted sm:col-span-2">Payments EventureOS already sent to Xero go to your Stripe clearing account{clearing ? ` (${clearing.name})` : ""}, so nothing is counted twice. Check the GST choices with your bookkeeper.</p>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button onClick={saveCoding} disabled={pending}><Save className="h-4 w-4" />Save Stripe coding</Button>
          <Button onClick={load} disabled={pending || !from}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{data ? "Reload payouts" : "Load Stripe payouts"}</Button>
          {canSend && data && <Button variant="primary" onClick={send} disabled={pending || !canTransfer || !coded || !toSend.length}><Send className="h-4 w-4" />Send {toSend.length} to Xero</Button>}
        </div>
        {data && !coded && <p className="text-[0.75rem] text-amber-800 sm:col-span-2">Choose and save the income and fees accounts before sending.</p>}
      </div>
      {msg && <p className={cn("border-t border-line px-5 py-2.5 text-[0.8125rem]", msg.ok ? "text-emerald-700" : "text-rose-700")}>{msg.text}</p>}
      {data && tabs([["ready", "Ready", n("ready")], ["manual", "Do by hand", n("manual")], ["missing", "Not in this file", n("missing")], ["xero", "In Xero", n("xero")]], tab, setTab)}
      {data && (
        <div className="divide-y divide-line border-t border-line">
          {shown.map((r) => (
            <label key={r.payout.id} className={cn("flex items-start gap-3 px-5 py-2.5 text-[0.8125rem]", r.state === "ready" && "cursor-pointer hover:bg-canvas")}>
              {r.state === "ready" ? <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0" checked={r.ticked} onChange={(e) => setPicked({ ...picked, [r.payout.id]: e.target.checked })} /> : r.state === "xero" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <span className="w-4" />}
              <span className="w-24 shrink-0 text-ink-muted">{fmt(r.line?.date ?? r.payout.arrival)}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-ink">{r.payout.count} payment{r.payout.count === 1 ? "" : "s"} · sales {money(r.payout.gross)}{r.payout.refunds ? ` · refunds ${money(r.payout.refunds)}` : ""} · fees {money(r.payout.fees)}</span>
                <span className="block text-[0.75rem] text-ink-muted">{r.line ? `into ${bankName(r.line.account)}` : "No STRIPE line of this amount in the file"}{r.payout.recorded ? ` · ${money(r.payout.recorded)} already sent to Xero by EventureOS` : ""} · {r.payout.id}</span>
                {r.state === "manual" && <span className="block text-[0.75rem] text-amber-800">{!r.preview.balanced ? "The breakdown doesn't add up to the payout." : "Includes payments already in your clearing account, which can't be coded in one deposit here."}</span>}
                {r.error && <span className="block text-[0.75rem] text-rose-700">{r.error}</span>}
              </span>
              <span className="w-24 shrink-0 text-right font-semibold tabular-nums text-ink">{money(r.payout.amount)}</span>
            </label>
          ))}
          {!shown.length && <p className="px-5 py-4 text-[0.8125rem] text-ink-muted">Nothing here.</p>}
        </div>
      )}
    </Card>
  );
}
