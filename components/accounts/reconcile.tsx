"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, FileUp, Loader2, RefreshCw, Save, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { alreadyInXero, pairTransfers, parseStatement, sameAccountNumber, transferNote, type ParsedStatement, type ReconcileSettings, type XeroTransferLite } from "@/lib/reconcile/core";
import type { XeroBank } from "@/lib/reconcile/xero";
import { saveReconcileSettings, sendTransfers, xeroTransfers } from "@/app/(app)/accounts/reconcile-actions";

type Tab = "ready" | "unsure" | "xero" | "sent" | "unpaired";
const money = (n: number) => `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmt = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
const tail = (n: string) => `…${n.replace(/\D/g, "").slice(-4) || n}`;

/**
 * Reconcile: read the bank's export in the browser, pair the transfers between your accounts, check which Xero already
 * has, and send the rest to Xero. The statement itself never leaves this computer.
 */
export function ReconcileTool({ banks, bankError, canTransfer, settings, canSend }: { banks: XeroBank[]; bankError: string | null; canTransfer: boolean; settings: ReconcileSettings; canSend: boolean }) {
  const [file, setFile] = useState<{ name: string; s: ParsedStatement } | null>(null);
  const [map, setMap] = useState<Record<string, string>>(settings.accounts);
  const [from, setFrom] = useState(settings.from ?? "");
  const [existing, setExisting] = useState<{ from: string; list: XeroTransferLite[] } | null>(null);
  const [sent, setSent] = useState<Record<string, { ok: boolean; id?: string; error?: string }>>({});
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [tab, setTab] = useState<Tab>("ready");
  const [limit, setLimit] = useState(200);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const pick = useRef<HTMLInputElement>(null);
  const bankName = (id: string | undefined) => banks.find((b) => b.id === id)?.name;

  const read = async (f: File | undefined) => {
    if (!f) return;
    setMsg(null);
    try {
      const s = parseStatement(await f.text(), f.name.replace(/\.csv$/i, ""));
      setFile({ name: f.name, s });
      setExisting(null); setSent({}); setPicked({}); setTab("ready");
      // match each statement account to a Xero bank account by number (keeping saved choices)
      setMap((m) => {
        const next = { ...m };
        for (const a of s.accounts) if (!next[a.number]) { const hit = banks.find((b) => sameAccountNumber(a.number, b.number)); if (hit) next[a.number] = hit.id; }
        return next;
      });
      if (!from) { const last = s.accounts.reduce((a, x) => (x.to > a ? x.to : a), s.accounts[0].to); setFrom(`${last.slice(0, 8)}01`); }
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't read that file." }); }
  };

  const pairing = useMemo(() => (file ? pairTransfers(file.s.lines, { from: from || null }) : null), [file, from]);
  const rows = useMemo(() => {
    if (!pairing) return [];
    const base = pairing.pairs.map((p) => ({ ...p, fromId: map[p.out.account], toId: map[p.in.account] }));
    const inXero = existing && existing.from <= (from || "0000") ? alreadyInXero(base.map((p) => ({ key: p.key, from: p.fromId ?? null, to: p.toId ?? null, amount: p.amount, date: p.out.date })), existing.list) : new Set<string>();
    return base.map((p) => {
      const r = sent[p.key];
      const state: Tab = r?.ok ? (r.id ? "sent" : "xero") : inXero.has(p.key) ? "xero" : p.unsure ? "unsure" : "ready";
      return { ...p, state, error: r && !r.ok ? r.error : undefined, mapped: !!p.fromId && !!p.toId };
    });
  }, [pairing, map, existing, sent, from]);
  const count = (t: Tab) => (t === "unpaired" ? pairing?.unpaired.length ?? 0 : rows.filter((r) => r.state === t).length);
  const isPicked = (r: (typeof rows)[number]) => picked[r.key] ?? r.state === "ready";
  const toSend = rows.filter((r) => (r.state === "ready" || r.state === "unsure") && r.mapped && isPicked(r));
  const unmapped = file ? file.s.accounts.filter((a) => !map[a.number]) : [];
  const checked = !!existing && existing.from <= (from || "0000");

  const save = () => start(async () => {
    const r = await saveReconcileSettings({ accounts: map, from: from || null });
    setMsg(r.ok ? { ok: true, text: "Saved — EventureOS will remember the matching and start date." } : { ok: false, text: r.error });
  });
  const check = () => start(async () => {
    setMsg(null);
    if (!from) { setMsg({ ok: false, text: "Choose a start date first." }); return; }
    const r = await xeroTransfers(from);
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
    setExisting({ from, list: r.data });
    setMsg({ ok: true, text: `Xero has ${r.data.length} transfer${r.data.length === 1 ? "" : "s"} since ${fmt(from)} — those are marked “Already in Xero”.` });
  });
  const send = () => start(async () => {
    setMsg(null);
    const list = toSend.map((r) => ({ key: r.key, from: r.fromId!, to: r.toId!, amount: r.amount, date: r.out.date }));
    let ok = 0, bad = 0;
    for (let i = 0; i < list.length; i += 100) {
      setProgress(`Sending ${Math.min(i + 100, list.length)} of ${list.length}…`);
      const r = await sendTransfers(list.slice(i, i + 100));
      if (!r.ok) { setMsg({ ok: false, text: r.error }); setProgress(null); return; }
      setSent((s) => { const n = { ...s }; for (const x of r.data) n[x.key] = x; return n; });
      ok += r.data.filter((x) => x.ok).length; bad += r.data.filter((x) => !x.ok).length;
    }
    setProgress(null);
    setMsg({ ok: bad === 0, text: `${ok} sent to Xero${bad ? ` · ${bad} didn't go — see the reasons in the list` : ""}. In Xero → Bank accounts → Reconcile, each side now shows the transfer as a match: click OK.` });
  });

  const shown = tab === "unpaired" ? [] : rows.filter((r) => r.state === tab);

  return (
    <div className="space-y-5">
      {!canTransfer && (
        <Card className="border-amber-200 bg-amber-50 p-5 text-[0.875rem] text-amber-900">
          <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" />Xero needs one more permission</p>
          <p className="mt-1">EventureOS can read your statement and pair the transfers now, but to check and create transfers in Xero it needs permission for bank transactions. Reconnect Xero and approve the new access — choose your Bean Culture Xero organisation on Xero&apos;s screen. Everything else keeps working; EventureOS then does a full catch-up sync with Xero.</p>
          <a href="/api/integrations/xero/connect" className="mt-3 inline-flex h-9 items-center rounded-lg bg-amber-900 px-4 text-[0.8125rem] font-semibold text-white">Reconnect Xero</a>
        </Card>
      )}
      {bankError && <Card className="p-4 text-[0.8125rem] text-rose-700">Couldn&apos;t read your Xero bank accounts: {bankError}</Card>}

      <Card>
        <CardHeader title="1. Your bank's export" subtitle="Westpac Live: Accounts → Export → CSV, with all your accounts ticked. The file is read here in your browser — it isn't uploaded." />
        <div className="space-y-3 border-t border-line px-5 py-4">
          <input ref={pick} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { void read(e.target.files?.[0]); e.target.value = ""; }} />
          <Button variant={file ? "secondary" : "primary"} onClick={() => pick.current?.click()}><FileUp className="h-4 w-4" />{file ? "Choose a different file" : "Choose the CSV file"}</Button>
          {file && <p className="text-[0.8125rem] text-ink-muted">{file.name} · {file.s.lines.length.toLocaleString()} transactions · {file.s.accounts.length} account{file.s.accounts.length === 1 ? "" : "s"}</p>}
        </div>
      </Card>

      {file && (
        <Card>
          <CardHeader title="2. Which Xero account is which" subtitle="Matched by account number where Xero has it. Choose any that aren't." />
          <div className="space-y-3 border-t border-line px-5 py-4">
            {file.s.accounts.map((a) => (
              <div key={a.number} className="grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                <div className="text-[0.875rem]"><span className="font-semibold text-ink">{a.number}</span><span className="block text-[0.75rem] text-ink-muted">{a.lines.toLocaleString()} lines · {fmt(a.from)} – {fmt(a.to)}</span></div>
                <Select aria-label={`Xero account for ${a.number}`} value={map[a.number] ?? ""} onChange={(e) => setMap({ ...map, [a.number]: e.target.value })}>
                  <option value="">Choose the Xero bank account…</option>
                  {banks.map((b) => <option key={b.id} value={b.id}>{b.name}{b.number ? ` (${b.number})` : ""}</option>)}
                </Select>
              </div>
            ))}
            <div className="grid gap-2 border-t border-line pt-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
              <div className="text-[0.875rem]"><Label htmlFor="rc-from">Start from</Label><span className="block text-[0.75rem] text-ink-muted">The day after your Xero bank accounts were last fully reconciled — earlier transfers are left alone.</span></div>
              <Input id="rc-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <Button onClick={save} disabled={pending}><Save className="h-4 w-4" />Save matching &amp; start date</Button>
          </div>
        </Card>
      )}

      {file && pairing && (
        <Card className="overflow-hidden">
          <CardHeader title="3. Transfers found" subtitle={`${pairing.transferLines.toLocaleString()} transfer lines since ${from ? fmt(from) : "the start of the file"} → ${pairing.pairs.length.toLocaleString()} transfers paired (money out of one account, same amount into another, same day or soon after).`} />
          <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
            <Button onClick={check} disabled={pending || !canTransfer || !from}>{pending && !progress ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{checked ? "Check Xero again" : "Check what's already in Xero"}</Button>
            {canSend && <Button variant="primary" onClick={send} disabled={pending || !canTransfer || !checked || !toSend.length || unmapped.length > 0}><Send className="h-4 w-4" />Send {toSend.length.toLocaleString()} to Xero</Button>}
            {!canSend && <span className="text-[0.75rem] text-ink-muted">An owner or admin sends transfers to Xero.</span>}
            {progress && <span className="flex items-center gap-1.5 text-[0.8125rem] text-ink-muted"><Loader2 className="h-4 w-4 animate-spin" />{progress}</span>}
          </div>
          {(unmapped.length > 0 || (!checked && canTransfer)) && (
            <p className="border-t border-line bg-canvas px-5 py-2 text-[0.75rem] text-ink-muted">{unmapped.length > 0 ? `Match ${unmapped.map((a) => tail(a.number)).join(", ")} to a Xero account first. ` : ""}{!checked ? "Check Xero first, so nothing already there is sent twice." : ""}</p>
          )}
          {msg && <p className={cn("border-t border-line px-5 py-2.5 text-[0.8125rem]", msg.ok ? "text-emerald-700" : "text-rose-700")}>{msg.text}</p>}
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto border-t border-line px-5 py-3">
            {([["ready", "Ready to send"], ["unsure", "Needs your OK"], ["xero", "Already in Xero"], ["sent", "Sent"], ["unpaired", "Not paired"]] as [Tab, string][]).map(([k, l]) => (
              <button key={k} type="button" onClick={() => { setTab(k); setLimit(200); }} className={cn("shrink-0 rounded-full px-3 py-1.5 text-[0.7812rem] font-medium", tab === k ? "bg-ink text-surface" : "bg-surface text-ink-muted ring-1 ring-line hover:text-ink")}>{l} · {count(k).toLocaleString()}</button>
            ))}
          </div>
          {tab === "unsure" && count("unsure") > 0 && <p className="border-t border-line bg-amber-50 px-5 py-2 text-[0.75rem] text-amber-900">The same amount moved to (or from) more than one of your accounts that day, so EventureOS can&apos;t be sure which went where. Check these against the bank and tick the ones that are right.</p>}
          {tab === "unpaired" && <p className="border-t border-line bg-canvas px-5 py-2 text-[0.75rem] text-ink-muted">Transfer lines with no matching line in another account in this file — usually money to or from an account that isn&apos;t in the export, or a transfer outside the dates.</p>}
          <div className="divide-y divide-line border-t border-line">
            {tab === "unpaired"
              ? pairing.unpaired.slice(0, limit).map((l) => (
                <div key={l.key} className="flex items-center gap-3 px-5 py-2.5 text-[0.8125rem]">
                  <span className="w-24 shrink-0 text-ink-muted">{fmt(l.date)}</span>
                  <span className="min-w-0 flex-1 truncate">{bankName(map[l.account]) ?? tail(l.account)} · {l.narrative}</span>
                  <span className={cn("tabular-nums", l.amount < 0 ? "text-rose-700" : "text-emerald-700")}>{money(l.amount)}</span>
                </div>
              ))
              : shown.slice(0, limit).map((r) => {
                const note = transferNote(r.out.narrative) || transferNote(r.in.narrative);
                const canTick = r.state === "ready" || r.state === "unsure";
                return (
                  <label key={r.key} className={cn("flex items-center gap-3 px-5 py-2.5 text-[0.8125rem]", canTick && "cursor-pointer hover:bg-canvas")}>
                    {canTick ? <input type="checkbox" className="h-4 w-4 shrink-0" checked={isPicked(r)} onChange={(e) => setPicked({ ...picked, [r.key]: e.target.checked })} /> : <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />}
                    <span className="w-24 shrink-0 text-ink-muted">{fmt(r.out.date)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1 font-medium text-ink">{bankName(r.fromId) ?? tail(r.out.account)}<ArrowRight className="h-3.5 w-3.5 text-ink-faint" />{bankName(r.toId) ?? tail(r.in.account)}</span>
                      <span className="block truncate text-[0.75rem] text-ink-muted">{note || "Transfer"}{r.gapDays ? ` · arrived ${r.gapDays > 0 ? `${r.gapDays} day${r.gapDays === 1 ? "" : "s"} later` : "a day earlier"}` : ""}{!r.mapped ? " · account not matched" : ""}</span>
                      {r.error && <span className="block text-[0.75rem] text-rose-700">{r.error}</span>}
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums text-ink">{money(r.amount)}</span>
                  </label>
                );
              })}
            {(tab === "unpaired" ? pairing.unpaired.length : shown.length) === 0 && <p className="px-5 py-4 text-[0.8125rem] text-ink-muted">Nothing here.</p>}
            {(tab === "unpaired" ? pairing.unpaired.length : shown.length) > limit && <button type="button" onClick={() => setLimit(limit + 500)} className="w-full px-5 py-3 text-[0.8125rem] font-semibold text-brand-700 hover:bg-canvas">Show more</button>}
          </div>
        </Card>
      )}
    </div>
  );
}
