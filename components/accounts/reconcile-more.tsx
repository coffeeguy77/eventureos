"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { CheckCircle2, Loader2, RefreshCw, Save, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import type { ParsedStatement, ReconcileSettings, StripeCoding } from "@/lib/reconcile/core";
import { matchDeposits, matchPayouts, payoutLines, type OpenInvoice, type Payout } from "@/lib/reconcile/match";
import type { XeroAccountLite, XeroBank, XeroTaxRate } from "@/lib/reconcile/xero";
import { loadPayouts, ordermentumFromGmail, ordermentumInXero, removePayouts, saveReconcileSettings, sendOrdermentum, sendPayments, sendPayouts } from "@/app/(app)/accounts/reconcile-actions";
import { isOrdermentum, matchOrdermentum, parseRemittance, type RemitRow } from "@/lib/reconcile/ordermentum";

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
  const [data, setData] = useState<{ payouts: Payout[]; inXero: Map<string, boolean> } | null>(null);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [res, setRes] = useState<Res>({});
  const [tab, setTab] = useState("ready");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const income = accounts.filter((a) => (a.cls === "REVENUE" || a.cls === "LIABILITY") && a.code);
  const fees = accounts.filter((a) => a.cls === "EXPENSE" && a.code);
  const coded = !!c.other.account && !!c.fees.account;
  const lastDay = useMemo(() => file.accounts.reduce((a, x) => (x.to > a ? x.to : a), file.accounts[0].to), [file]);
  const bankName = (acc: string) => banks.find((b) => b.id === map[acc])?.name ?? tail(acc);
  // only payouts that landed in the bank on or after the start date (Stripe is asked a day either side)
  const matched = useMemo(() => (data ? matchPayouts(file.lines.filter((l) => !from || l.date >= from), data.payouts).filter((m) => !from || (m.line?.date ?? m.payout.arrival) >= from) : []), [data, file, from]);
  const rows = matched.map((m) => {
    const r = res[m.payout.id];
    const preview = payoutLines(m.payout, { clearing: clearing?.code ?? null, shop: c.shop, bookings: c.bookings, other: c.other, fees: c.fees });
    const manual = m.payout.recorded > 0 && (!clearing?.code || clearing.bank);
    const removed = r?.ok && r.error === "removed";
    const inXero = !removed && ((r?.ok && !!r.id) || r?.error === "Already in Xero" || (!r && data?.inXero.has(m.payout.id)));
    const state = inXero ? "xero" : !m.line ? "missing" : manual || !preview.balanced ? "manual" : "ready";
    const reconciled = !!data?.inXero.get(m.payout.id);
    return { ...m, state, preview, reconciled, error: r && !r.ok ? r.error : undefined, ticked: picked[m.payout.id] ?? state === "ready" };
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
    setData({ payouts: r.data.payouts, inXero: new Map(r.data.inXero.map((x) => [x.ref, x.reconciled])) });
    setRes({});
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

  const remove = (ids: string[]) => start(async () => {
    setMsg(null);
    const r = await removePayouts(ids);
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
    setRes((s) => { const y = { ...s }; for (const z of r.data) y[z.key] = z.ok && z.id ? { ok: true, error: "removed" } : z; return y; });
    setData((d) => (d ? { ...d, inXero: new Map([...d.inXero].filter(([k]) => !r.data.some((z) => z.key === k && z.ok && z.id))) } : d));
    const n = r.data.filter((z) => z.ok && z.id).length, bad = r.data.filter((z) => !z.ok).length;
    setMsg({ ok: !bad, text: `${n} removed from Xero${bad ? ` · ${bad} couldn't be (reasons in the list)` : ""}. They're back under Ready — change the coding, save, and send again.` });
  });
  const removable = rows.filter((r) => r.state === "xero" && !r.reconciled);

  if (!stripeOn) return <Card className="p-5 text-[0.8125rem] text-ink-muted">5. Stripe payouts — connect Stripe (Settings → Payments) to match payouts.</Card>;
  const shown = rows.filter((r) => r.state === tab);
  return (
    <Card className="overflow-hidden">
      <CardHeader title="5. Stripe payouts" subtitle="Stripe payments made through EventureOS (your shop, classes, gift vouchers). Each payout goes to Xero as one deposit into the bank it landed in, split by what was sold — naming who paid — with Stripe's fees on their own line, so the Stripe line in the bank is one OK. Invoices paid through Xero's own Stripe button are already handled by Xero." />
      <div className="grid gap-3 border-t border-line px-5 py-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><Label htmlFor="st-contact" hint="Who the deposits are from in Xero, e.g. VIP">Xero contact</Label><Input id="st-contact" value={c.contact ?? ""} placeholder="Stripe" onChange={(e) => setC({ ...c, contact: e.target.value || null })} /></div>
        {([["shop", "Shop orders (coffee)"], ["bookings", "Classes, bookings & gift vouchers"], ["other", "Everything else"], ["fees", "Stripe fees"]] as [keyof Omit<StripeCoding, "contact">, string][]).map(([k, label]) => (
          <div key={k} className="grid gap-2 sm:col-span-2 sm:grid-cols-2">
            <div><Label htmlFor={`st-${k}`}>{label} go to</Label><Select id={`st-${k}`} value={c[k].account ?? ""} onChange={(e) => setC({ ...c, [k]: { ...c[k], account: e.target.value || null } })}>
              <option value="">{k === "shop" || k === "bookings" ? "Same as everything else" : k === "fees" ? "Choose an expense account…" : "Choose an income account…"}</option>
              {(k === "fees" ? fees : income).map((a) => <option key={a.id} value={a.code!}>{a.code} · {a.name}</option>)}</Select></div>
            <div><Label htmlFor={`st-${k}-tax`}>GST</Label><Select id={`st-${k}-tax`} value={c[k].tax ?? ""} onChange={(e) => setC({ ...c, [k]: { ...c[k], tax: e.target.value || null } })}><option value="">The account&apos;s default</option>{taxRates.map((t) => <option key={t.type} value={t.type}>{t.name}</option>)}</Select></div>
          </div>
        ))}
        <p className="text-[0.75rem] text-ink-muted sm:col-span-2">Payments for EventureOS invoices go to your Stripe clearing account (EventureOS records them against the invoice there){clearing ? ` (${clearing.name})` : ""}, so nothing is counted twice. Check the GST choices with your bookkeeper.</p>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button onClick={saveCoding} disabled={pending}><Save className="h-4 w-4" />Save Stripe coding</Button>
          <Button onClick={load} disabled={pending || !from}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{data ? "Reload payouts" : "Load Stripe payouts"}</Button>
          {canSend && data && <Button variant="primary" onClick={send} disabled={pending || !canTransfer || !coded || !toSend.length}><Send className="h-4 w-4" />Send {toSend.length} to Xero</Button>}
          {canSend && tab === "xero" && removable.length > 0 && <Button variant="danger" onClick={() => remove(removable.map((r) => r.payout.id))} disabled={pending}>Remove {removable.length} from Xero</Button>}
        </div>
        {data && !coded && <p className="text-[0.75rem] text-amber-800 sm:col-span-2">Choose and save the “everything else” and fees accounts before sending.</p>}
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
                <span className="block font-medium text-ink">{r.payout.count} payment{r.payout.count === 1 ? "" : "s"}{r.payout.groups.shop ? ` · shop ${money(r.payout.groups.shop)}` : ""}{r.payout.groups.bookings ? ` · classes ${money(r.payout.groups.bookings)}` : ""}{r.payout.groups.other ? ` · other ${money(r.payout.groups.other)}` : ""}{r.payout.refunds ? ` (after refunds ${money(r.payout.refunds)})` : ""} · fees {money(r.payout.fees)}</span>
                <span className="block truncate text-[0.75rem] text-ink-muted">{r.payout.items.map((i) => `${i.name || "Customer"} ${money(i.amount)}${i.what ? ` · ${i.what}` : ""}`).join(" — ")}</span>
                <span className="block text-[0.75rem] text-ink-muted">{r.line ? `into ${bankName(r.line.account)}` : "No STRIPE line of this amount in the file"}{r.payout.recorded ? ` · ${money(r.payout.recorded)} for EventureOS invoices → Stripe clearing` : ""} · {r.payout.id}</span>
                {r.state === "xero" && r.reconciled && <span className="block text-[0.75rem] text-ink-muted">Reconciled in Xero</span>}
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

/** 6. Ordermentum: each payout matched to its remittance (from Gmail or a CSV) and sent as one Xero batch payment. */
export function OrdermentumPayouts({ file, map, from, banks, invoices, canSend }: { file: ParsedStatement; map: Record<string, string>; from: string; banks: XeroBank[]; invoices: OpenInvoice[]; canSend: boolean }) {
  const [remits, setRemits] = useState<RemitRow[]>([]);
  const [res, setRes] = useState<Res>({});
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [inXero, setInXero] = useState<Map<string, { listed: boolean; reconciled: boolean }>>(new Map());
  const [auto, setAuto] = useState(false);
  const matches = useMemo(() => matchOrdermentum(file.lines, remits, invoices, { from: from || null }), [file, remits, invoices, from]);
  const batchList = useMemo(() => [...new Set(matches.map((m) => m.batch).filter((b): b is string => !!b))], [matches]);
  // find the remittances in Gmail and check Xero as soon as the file is in — no button needed
  useEffect(() => {
    if (auto || !batchList.length) return;
    setAuto(true);
    start(async () => {
      const [g, x] = await Promise.all([ordermentumFromGmail(batchList), ordermentumInXero(batchList)]);
      if (g.ok) setRemits((r) => [...r, ...g.data.rows]);
      if (x.ok) setInXero(new Map(x.data.map((b) => [b.batch, { listed: b.listed, reconciled: b.reconciled }])));
      setMsg(g.ok ? { ok: true, text: `Found ${g.data.emails} remittance${g.data.emails === 1 ? "" : "s"} in Gmail.` } : { ok: false, text: g.error });
    });
  }, [auto, batchList]);
  if (!file.lines.some(isOrdermentum)) return null;
  const bankName = (acc: string) => banks.find((b) => b.id === map[acc])?.name ?? tail(acc);
  const rows = matches.map((m) => {
    const r = res[m.key];
    const x = m.batch ? inXero.get(m.batch) : undefined;
    const done = !!r?.ok || (!!x && x.listed);
    return { ...m, done, x, error: r && !r.ok ? r.error : undefined, note: r?.ok && !r.id ? r.error : undefined, ticked: picked[m.key] ?? m.state === "ready" };
  });
  const toSend = rows.filter((r) => !r.done && !r.x && r.state === "ready" && r.ticked && map[r.line.account]);
  const toUpdate = rows.filter((r) => !r.done && r.x && !r.x.listed && !r.x.reconciled && r.state === "ready" && map[r.line.account]);
  const missing = [...new Set(rows.filter((r) => r.state === "no-remittance" && r.batch).map((r) => r.batch!))];
  const gmail = () => start(async () => {
    setMsg(null);
    const r = await ordermentumFromGmail(missing);
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
    setRemits((x) => [...x, ...r.data.rows]);
    setMsg({ ok: true, text: `Found ${r.data.emails} remittance${r.data.emails === 1 ? "" : "s"} in Gmail (${r.data.rows.length} invoices).` });
  });
  const addFiles = async (list: FileList | null) => {
    if (!list) return;
    setMsg(null);
    const add: RemitRow[] = [];
    for (const f of Array.from(list)) { try { add.push(...parseRemittance(await f.text())); } catch (e) { setMsg({ ok: false, text: `${f.name}: ${e instanceof Error ? e.message : "couldn't read it"}` }); } }
    setRemits((x) => [...x, ...add]);
  };
  const send = (list: typeof rows, replace: boolean) => start(async () => {
    setMsg(null);
    const r = await sendOrdermentum(list.map((x) => ({ key: x.key, batch: x.batch!, bank: map[x.line.account], date: x.line.date, amount: x.line.amount, payments: x.rows.map((i) => ({ invoice: i.open!.xeroId, amount: i.amount, number: i.invoice, retailer: i.retailer })) })), replace);
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
    setRes((s) => { const y = { ...s }; for (const z of r.data) y[z.key] = z; return y; });
    const ok = r.data.filter((z) => z.ok).length, bad = r.data.length - ok;
    setMsg({ ok: !bad, text: `${ok} Ordermentum payout${ok === 1 ? "" : "s"} recorded as batch payments${bad ? ` · ${bad} didn't go — reasons are in the list` : ""}. Each Ordermentum line in the bank now matches one batch payment in Xero: click OK.` });
  });
  return (
    <Card className="overflow-hidden">
      <CardHeader title="6. Ordermentum payouts" subtitle="Ordermentum pays several invoices in one deposit and emails a remittance listing them — EventureOS finds it in your Gmail by the batch number (OM…). Each deposit goes to Xero as one batch payment against those invoices, with the invoice list in its reference so you can see it on Xero's reconcile screen." />
      <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
        <Button onClick={gmail} disabled={pending || !missing.length}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Find {missing.length} remittance{missing.length === 1 ? "" : "s"} in Gmail</Button>
        <label className="inline-flex h-10 cursor-pointer items-center rounded-lg px-3 text-[0.8125rem] font-semibold text-brand-700 ring-1 ring-line hover:bg-canvas">Add remittance CSVs<input type="file" accept=".csv,text/csv" multiple className="hidden" onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }} /></label>
        {canSend && <Button variant="primary" onClick={() => send(toSend, false)} disabled={pending || !toSend.length}><Send className="h-4 w-4" />Send {toSend.length} to Xero</Button>}
        {canSend && toUpdate.length > 0 && <Button onClick={() => send(toUpdate, true)} disabled={pending}>Add the invoice list to {toUpdate.length} already in Xero</Button>}
      </div>
      {msg && <p className={cn("border-t border-line px-5 py-2.5 text-[0.8125rem]", msg.ok ? "text-emerald-700" : "text-rose-700")}>{msg.text}</p>}
      <div className="divide-y divide-line border-t border-line">
        {rows.map((r) => (
          <div key={r.key} className="px-5 py-3 text-[0.8125rem]">
            <label className="flex items-center gap-3">
              {r.done ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <input type="checkbox" className="h-4 w-4 shrink-0" disabled={r.state !== "ready"} checked={r.state === "ready" && r.ticked} onChange={(e) => setPicked({ ...picked, [r.key]: e.target.checked })} />}
              <span className="w-24 shrink-0 text-ink-muted">{fmt(r.line.date)}</span>
              <span className="min-w-0 flex-1"><span className="font-medium text-ink">{r.batch ?? "Ordermentum"}</span><span className="text-ink-muted"> · into {bankName(r.line.account)}{r.rows.length ? ` · ${r.rows.length} invoice${r.rows.length === 1 ? "" : "s"}` : ""}</span>
                {r.x && <span className={cn("ml-2 rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold", r.x.reconciled ? "bg-emerald-50 text-emerald-700" : r.x.listed ? "bg-sky-50 text-sky-700" : "bg-amber-50 text-amber-800")}>{r.x.reconciled ? "Reconciled in Xero" : r.x.listed ? "In Xero with the list" : "In Xero — no invoice list yet"}</span>}</span>
              <span className="w-24 shrink-0 text-right font-semibold tabular-nums text-ink">{money(r.line.amount)}</span>
            </label>
            {(r.problem || r.error || r.note) && <p className={cn("ml-7 mt-1 text-[0.75rem]", r.error || r.state === "problem" ? "text-rose-700" : "text-ink-muted")}>{r.error ?? r.note ?? r.problem}</p>}
            {r.rows.length > 0 && (
              <ul className="ml-7 mt-1.5 space-y-0.5 text-[0.75rem] text-ink-muted">
                {r.rows.map((i) => <li key={i.invoice} className="flex justify-between gap-3"><span className={i.problem ? "text-rose-700" : ""}>{i.invoice} · {i.retailer}{i.problem ? ` — ${i.problem}` : ""}</span><span className="tabular-nums">{money(i.amount)}</span></li>)}
              </ul>
            )}
          </div>
        ))}
        {!rows.length && <p className="px-5 py-4 text-[0.8125rem] text-ink-muted">No Ordermentum deposits since the start date.</p>}
      </div>
    </Card>
  );
}
