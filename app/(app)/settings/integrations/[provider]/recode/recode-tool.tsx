"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { fmtDate, money } from "@/lib/format";
import { runRecodeBatch, saveRecodeMap, saveRecodeRules, type RecodeBatchResult } from "../../recode-actions";
import type { RecodeRule } from "@/lib/integrations/xero-recode-plan";

export interface RecodePreview {
  invoices: number; paid: number; lines: number;
  items: { item: string; from: string | null; to: string; lines: number; invoices: number; amount: number; oldest: string | null }[];
  next: { id: string; number: string; status: string } | null;
}

const sel = "h-9 w-full rounded-md border border-line bg-surface px-2 text-[0.8125rem] text-ink focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 sm:h-8";

export function RecodeTool({ accounts, items, map, rules = [], preview, currency, alreadyTested = false }: {
  accounts: { code: string; name: string }[];
  items: Record<string, { name: string; account: string | null }>;
  map: Record<string, string>;
  rules?: RecodeRule[];
  preview: RecodePreview;
  currency: string;
  /** A recode has already worked for this business — no need to test again */
  alreadyTested?: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Record<string, string>>(map);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const acctName = (c: string | null) => (c ? `${c}${accounts.find((a) => a.code === c) ? ` – ${accounts.find((a) => a.code === c)!.name}` : ""}` : "no account");
  const codes = Object.keys(items).sort((a, b) => Number(!(a in draft)) - Number(!(b in draft)) || a.localeCompare(b));
  const shown = codes.filter((c) => !filter || `${c} ${items[c].name}`.toLowerCase().includes(filter.toLowerCase()));
  const dirty = JSON.stringify(Object.entries(draft).sort()) !== JSON.stringify(Object.entries(map).sort());

  // Running
  const [running, setRunning] = useState<null | "test" | "all">(null);
  const [tested, setTested] = useState(alreadyTested);
  const [done, setDone] = useState<RecodeBatchResult["updated"]>([]);
  const [skipped, setSkipped] = useState<RecodeBatchResult["skipped"]>([]);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [stopped, setStopped] = useState<string | null>(null);
  const stopRef = useRef(false);

  async function run(mode: "test" | "all") {
    setError(null); setStopped(null); stopRef.current = false; setRunning(mode);
    const skip = skipped.map((s) => s.id);
    try {
      for (;;) {
        const t0 = Date.now();
        const r = await runRecodeBatch(mode === "test" ? { only: preview.next?.id } : { limit: 4, skip });
        if (!r.ok) { setError(r.error); break; }
        setDone((d) => [...d, ...r.data.updated]);
        setSkipped((s) => [...s, ...r.data.skipped]);
        skip.push(...r.data.skipped.map((s) => s.id));
        setRemaining(r.data.remaining);
        if (r.data.stopped) { setStopped(r.data.stopped); break; }
        if (mode === "test") { if (r.data.updated.length) setTested(true); break; }
        if (!r.data.remaining || stopRef.current || (!r.data.updated.length && !r.data.skipped.length)) break;
        // Stay well under Xero's limit of 60 requests a minute (each invoice is 2): at most one batch every 15 seconds
        const wait = 15_000 - (Date.now() - t0);
        if (wait > 0) await new Promise((res) => setTimeout(res, wait));
        if (stopRef.current) break;
      }
    } catch { setError("Lost connection to the server — press the button again to carry on from where it stopped."); }
    setRunning(null);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="1. Choose the account for each item" subtitle="Items you leave on “Leave as is” aren't touched. Shows each item's default account in Xero for reference." />
        <div className="px-5 pb-5">
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find an item…" className={cn(sel, "mb-3 max-w-xs")} aria-label="Find an item" />
          <div className="max-h-[420px] divide-y divide-line overflow-y-auto rounded-lg ring-1 ring-inset ring-line">
            {shown.map((c) => (
              <div key={c} className="grid grid-cols-1 items-center gap-2 px-3 py-2 sm:grid-cols-[1fr_260px]">
                <div className="min-w-0">
                  <p className="truncate text-[0.8125rem] font-medium text-ink">{c}{items[c].name !== c && <span className="font-normal text-ink-muted"> · {items[c].name}</span>}</p>
                  <p className="text-[0.7188rem] text-ink-faint">Xero default: {acctName(items[c].account)}</p>
                </div>
                <select value={draft[c] ?? ""} aria-label={`Account for ${c}`} className={cn(sel, draft[c] && "font-medium")}
                  onChange={(e) => setDraft((d) => { const n = { ...d }; if (e.target.value) n[c] = e.target.value; else delete n[c]; return n; })}>
                  <option value="">Leave as is</option>
                  {accounts.map((a) => <option key={a.code} value={a.code}>{a.code} – {a.name}</option>)}
                </select>
              </div>
            ))}
            {!shown.length && <p className="px-3 py-4 text-[0.8125rem] text-ink-muted">No items match.</p>}
          </div>
          <div className="mt-3 flex items-center justify-end gap-3">
            {dirty && <span className="text-[0.75rem] text-amber-700">Unsaved changes</span>}
            <Button variant="primary" size="sm" disabled={!dirty || saving || !!running} onClick={() => startSave(async () => {
              setError(null);
              const r = await saveRecodeMap(draft).catch(() => ({ ok: false as const, error: "Couldn't reach the server." }));
              if (!r.ok) setError(r.error); else router.refresh();
            })}>{saving ? "Saving…" : "Save and preview"}</Button>
          </div>
        </div>
      </Card>

      <RulesCard rules={rules} accounts={accounts} acctName={acctName} disabled={!!running} onError={setError} />

      <Card>
        <CardHeader title="2. Check what will change" subtitle={preview.invoices
          ? `${preview.lines} line${preview.lines === 1 ? "" : "s"} on ${preview.invoices} invoice${preview.invoices === 1 ? "" : "s"} (${preview.paid} paid). Voided invoices are left alone.`
          : "Nothing to change with the saved accounts."} />
        {!!preview.items.length && (
          <div className="overflow-x-auto px-5 pb-5">
            <table className="w-full min-w-[560px] text-[0.7812rem]">
              <thead><tr className="border-b border-line text-left text-[0.6875rem] uppercase tracking-wide text-ink-faint">
                <th className="py-1.5 pr-2 font-medium">Item</th><th className="py-1.5 pr-2 font-medium">From</th><th className="py-1.5 pr-2 font-medium">To</th>
                <th className="py-1.5 pr-2 text-right font-medium">Lines</th><th className="py-1.5 pr-2 text-right font-medium">Amount (ex GST)</th><th className="py-1.5 text-right font-medium">Oldest</th>
              </tr></thead>
              <tbody className="divide-y divide-line">
                {preview.items.map((r) => (
                  <tr key={`${r.item}|${r.from}`}>
                    <td className="py-1.5 pr-2 font-medium text-ink">{r.item}</td>
                    <td className="py-1.5 pr-2 text-ink-muted">{acctName(r.from)}</td>
                    <td className="py-1.5 pr-2 text-ink">{acctName(r.to)}</td>
                    <td className="tabular py-1.5 pr-2 text-right">{r.lines}</td>
                    <td className="tabular py-1.5 pr-2 text-right">{money(r.amount, currency)}</td>
                    <td className="py-1.5 text-right text-ink-muted">{fmtDate(r.oldest)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="3. Recode in Xero" subtitle="Start with one invoice and check it in Xero. Then run the rest — about 4 invoices every 15 seconds (Xero's speed limit), newest first. You can stop at any time." />
        <div className="space-y-3 px-5 pb-5">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={!preview.next || !!running || dirty} onClick={() => run("test")}>
              {running === "test" && <Loader2 className="h-4 w-4 animate-spin" />}Test on {preview.next ? preview.next.number : "one invoice"}
            </Button>
            <Button size="sm" variant="primary" disabled={!tested || !preview.invoices || !!running || dirty} onClick={() => run("all")}>
              {running === "all" && <Loader2 className="h-4 w-4 animate-spin" />}Recode {remaining ?? preview.invoices} invoice{(remaining ?? preview.invoices) === 1 ? "" : "s"}
            </Button>
            {running === "all" && <Button size="sm" variant="ghost" onClick={() => { stopRef.current = true; }}>Stop after this batch</Button>}
          </div>
          {!tested && <p className="text-[0.75rem] text-ink-faint">The full run unlocks after a successful test.</p>}
          {error && <FormError message={error} />}
          {stopped && <p className="rounded-lg bg-amber-50 px-3 py-2 text-[0.7812rem] text-amber-900 ring-1 ring-inset ring-amber-200">{stopped}</p>}
          {!!done.length && (
            <div>
              <p className="flex items-center gap-1.5 text-[0.8125rem] font-medium text-emerald-700"><CheckCircle2 className="h-4 w-4" />Recoded {done.length} invoice{done.length === 1 ? "" : "s"}{remaining != null ? ` · ${remaining} to go` : ""}</p>
              <ul className="mt-1.5 max-h-48 overflow-y-auto text-[0.75rem] text-ink-muted">
                {done.slice(-50).reverse().map((u, i) => <li key={`${u.number}-${i}`}>{u.number}: {u.changes.map((c) => `${c.item} ${c.from ?? "—"} → ${c.to}`).join(", ")}</li>)}
              </ul>
            </div>
          )}
          {!!skipped.length && (
            <div>
              <p className="text-[0.8125rem] font-medium text-ink">Skipped {skipped.length}</p>
              <ul className="mt-1.5 max-h-48 overflow-y-auto text-[0.75rem] text-ink-muted">
                {skipped.map((s) => <li key={s.id}>{s.number}: {s.reason}</li>)}
              </ul>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

/** Special rules: e.g. lines mentioning "caravan" go to the caravan account, or named invoices the calendar shows were caravan jobs. */
function RulesCard({ rules, accounts, acctName, disabled, onError }: {
  rules: RecodeRule[]; accounts: { code: string; name: string }[]; acctName: (c: string | null) => string; disabled: boolean; onError: (m: string | null) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ account: "", items: "", contains: "", invoices: "", note: "" });
  const list = (v: string) => v.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
  const save = (next: RecodeRule[]) => start(async () => {
    onError(null);
    const r = await saveRecodeRules(next).catch(() => ({ ok: false as const, error: "Couldn't reach the server." }));
    if (!r.ok) onError(r.error); else { setAdding(false); setF({ account: "", items: "", contains: "", invoices: "", note: "" }); router.refresh(); }
  });
  return (
    <Card>
      <CardHeader title="Special rules" subtitle="Checked before the item choices above — for jobs where the item doesn't tell the whole story (e.g. caravan hire invoiced as cart or van hire)."
        action={!adding && <Button size="sm" disabled={disabled || pending} onClick={() => setAdding(true)}>Add rule</Button>} />
      <div className="space-y-3 px-5 pb-5">
        {rules.length === 0 && !adding && <p className="text-[0.7812rem] text-ink-muted">No special rules.</p>}
        {rules.map((r, i) => (
          <div key={i} className="flex flex-wrap items-start justify-between gap-2 rounded-lg px-3 py-2 ring-1 ring-inset ring-line">
            <div className="min-w-0 text-[0.7812rem]">
              <p className="font-medium text-ink">{r.items.join(", ")} → {acctName(r.account)}</p>
              <p className="text-ink-muted">
                {r.contains && <>when the description mentions “{r.contains}”</>}
                {r.contains && r.invoices?.length ? " · or " : ""}
                {r.invoices?.length ? <>on {r.invoices.join(", ")}</> : null}
              </p>
              {r.note && <p className="mt-0.5 text-ink-faint">{r.note}</p>}
            </div>
            <button type="button" disabled={disabled || pending} onClick={() => save(rules.filter((_, j) => j !== i))}
              className="text-[0.75rem] text-ink-faint hover:text-rose-700 hover:underline">Remove</button>
          </div>
        ))}
        {adding && (
          <div className="grid gap-2 rounded-lg bg-zinc-50 p-3 ring-1 ring-inset ring-line sm:grid-cols-2">
            <label className="text-[0.75rem] text-ink-muted">Move to account
              <select value={f.account} onChange={(e) => setF({ ...f, account: e.target.value })} className={cn(sel, "mt-1")}>
                <option value="">Choose…</option>{accounts.map((a) => <option key={a.code} value={a.code}>{a.code} – {a.name}</option>)}
              </select></label>
            <label className="text-[0.75rem] text-ink-muted">Items (comma separated)
              <input value={f.items} onChange={(e) => setF({ ...f, items: e.target.value })} placeholder="CartHire, vanhire" className={cn(sel, "mt-1")} /></label>
            <label className="text-[0.75rem] text-ink-muted">When the description mentions
              <input value={f.contains} onChange={(e) => setF({ ...f, contains: e.target.value })} placeholder="caravan" className={cn(sel, "mt-1")} /></label>
            <label className="text-[0.75rem] text-ink-muted">…or on these invoices
              <input value={f.invoices} onChange={(e) => setF({ ...f, invoices: e.target.value })} placeholder="INV-1234, INV-1240" className={cn(sel, "mt-1")} /></label>
            <label className="text-[0.75rem] text-ink-muted sm:col-span-2">Note (optional)
              <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} className={cn(sel, "mt-1")} /></label>
            <div className="flex gap-2 sm:col-span-2">
              <Button size="sm" variant="primary" disabled={pending || !f.account || !list(f.items).length || (!f.contains.trim() && !list(f.invoices).length)}
                onClick={() => save([...rules, { account: f.account, items: list(f.items), contains: f.contains.trim() || undefined, invoices: list(f.invoices), note: f.note.trim() || undefined }])}>
                {pending ? "Saving…" : "Save rule"}</Button>
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
