"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, RefreshCw, UserPlus, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FormError } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { addXeroCustomers, importChosenRepeating, runXeroCheckAction } from "@/app/(app)/hosting/xero-check-actions";

type Result = Extract<Awaited<ReturnType<typeof runXeroCheckAction>>, { ok: true }>["data"];
const money = (n: number) => `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—");

export function XeroCheckView() {
  const [r, setR] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [selRep, setSelRep] = useState<Set<string>>(new Set());
  const [selCust, setSelCust] = useState<Set<string>>(new Set());
  const run = () => start(async () => { setErr(null); const x = await runXeroCheckAction(); if (!x.ok) setErr(x.error); else { setR(x.data); setSelRep(new Set(x.data.repeatingMissing.filter((m) => m.looksHosting).map((m) => m.id))); setSelCust(new Set()); } });
  const tog = (s: Set<string>, id: string) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-[0.8125rem] text-ink-muted">Reads Xero live — every customer and every repeating invoice — and checks each one against both businesses here. Nothing changes until you press a button below.</p>
        <Button variant="primary" disabled={pending} onClick={run}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{r ? "Check again" : "Run the Xero check"}</Button>
      </div>
      <FormError message={err} />
      {msg && <p className="rounded-xl bg-emerald-50 p-3 text-[0.8125rem] text-emerald-800 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30">{msg}</p>}
      {pending && !r && <p className="text-[0.8125rem] text-ink-muted">Reading Xero — this takes up to a minute.</p>}
      {r && (<>
        <div className="grid gap-2.5 min-[420px]:grid-cols-2 lg:grid-cols-4">
          {([["Xero customers", r.xero.customers, `${r.customersMissing.length} in neither business`], ["Xero repeating invoices", r.xero.repeating, `${r.repeatingHere} in ${r.here} · ${r.repeatingOther} in ${r.other?.name ?? "the other business"}`], ["Repeating not brought in", r.repeatingMissing.length, `${r.repeatingMissing.filter((m) => m.looksHosting).length} look like hosting / web`], ["Hosting with no repeating invoice", r.hostingWithoutRepeating.length, `${r.duplicateHosting.length} domains listed twice`]] as [string, number, string][]).map(([l, v, s]) => (
            <div key={l} className="rounded-2xl bg-surface p-3.5 ring-1 ring-line"><p className="text-[0.75rem] text-ink-muted">{l}</p><p className="mt-1 text-[1.25rem] font-semibold tabular-nums text-ink">{v}</p><p className="text-[0.75rem] text-ink-faint">{s}</p></div>
          ))}
        </div>

        <section className="space-y-2">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div><h2 className="text-[0.9375rem] font-semibold text-ink">Repeating invoices in Xero that aren&apos;t here</h2><p className="text-[0.75rem] text-ink-muted">Ticked: ones that look like hosting or web work. They come in paused, with their client — Xero keeps raising them until you switch them over.</p></div>
            {r.repeatingMissing.length > 0 && <Button disabled={pending || !selRep.size} onClick={() => start(async () => { setErr(null); setMsg(null); const x = await importChosenRepeating(r.repeatingMissing.filter((m) => selRep.has(m.id)).map((m) => ({ id: m.id, contactId: m.contactId }))); if (!x.ok) setErr(x.error); else { setMsg(x.data); const y = await runXeroCheckAction(); if (y.ok) { setR(y.data); setSelRep(new Set()); } } })}><Download className="h-4 w-4" />Bring {selRep.size} into {r.here}</Button>}
          </div>
          {r.repeatingMissing.length === 0 ? <p className="text-[0.8125rem] text-ink-muted">Every repeating invoice in Xero is in one of the businesses.</p> : (
            <div className="overflow-x-auto rounded-2xl bg-surface ring-1 ring-line">
              <table className="w-full min-w-[46rem] text-[0.8125rem]">
                <thead><tr className="text-left text-ink-muted"><th className="w-10 px-3 py-2"></th><th className="px-3 py-2 font-medium">Client</th><th className="px-3 py-2 font-medium">What</th><th className="px-3 py-2 text-right font-medium">Each time</th><th className="px-3 py-2 font-medium">Every</th><th className="px-3 py-2 font-medium">Next</th></tr></thead>
                <tbody>{r.repeatingMissing.map((m) => (
                  <tr key={m.id} className="border-t border-line align-top">
                    <td className="px-3 py-2"><input type="checkbox" className="h-4 w-4" checked={selRep.has(m.id)} onChange={() => setSelRep(tog(selRep, m.id))} aria-label={`Bring in ${m.contact}`} /></td>
                    <td className="px-3 py-2 text-ink">{m.contact}{!m.customerHere && <span className="block text-[0.6875rem] text-ink-faint">not a client here yet</span>}</td>
                    <td className="px-3 py-2 text-ink-muted"><span className="line-clamp-2">{m.reference ? `${m.reference} — ` : ""}{m.description}</span><span className="mt-0.5 flex flex-wrap gap-1">{m.looksHosting && <Badge tone="blue">hosting / web</Badge>}{m.status !== "AUTHORISED" && <Badge tone="neutral">{m.status.toLowerCase()} in Xero</Badge>}</span></td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink">{money(m.total)}</td>
                    <td className="px-3 py-2 text-ink">{m.every}</td>
                    <td className="px-3 py-2 tabular-nums text-ink">{day(m.next)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </section>

        <section className="space-y-2">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div><h2 className="text-[0.9375rem] font-semibold text-ink">Xero customers in neither business</h2><p className="text-[0.75rem] text-ink-muted">Contacts Xero has invoiced that aren&apos;t a client in {r.here}{r.other ? ` or ${r.other.name}` : ""}. Choose them, then add them to the right business. Ones with the same email as a client are linked, not duplicated.</p></div>
            {r.customersMissing.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <Button disabled={pending || !selCust.size} onClick={() => start(async () => { setErr(null); setMsg(null); const x = await addXeroCustomers([...selCust], "here"); if (!x.ok) setErr(x.error); else { setMsg(x.data); const y = await runXeroCheckAction(); if (y.ok) { setR(y.data); setSelCust(new Set()); } } })}><UserPlus className="h-4 w-4" />Add {selCust.size} to {r.here}</Button>
                {r.other && <Button disabled={pending || !selCust.size} onClick={() => start(async () => { setErr(null); setMsg(null); const x = await addXeroCustomers([...selCust], "other"); if (!x.ok) setErr(x.error); else { setMsg(x.data); const y = await runXeroCheckAction(); if (y.ok) { setR(y.data); setSelCust(new Set()); } } })}><UserPlus className="h-4 w-4" />Add {selCust.size} to {r.other.name}</Button>}
              </div>
            )}
          </div>
          {r.customersMissing.length === 0 ? <p className="text-[0.8125rem] text-ink-muted">Every Xero customer is a client in one of the businesses.</p> : (
            <div className="rounded-2xl bg-surface ring-1 ring-line">
              <div className="flex items-center justify-between border-b border-line px-3 py-2 text-[0.75rem] text-ink-muted"><span>{r.customersMissing.length} customers</span><button type="button" className="font-medium text-brand-700" onClick={() => setSelCust(selCust.size === r.customersMissing.length ? new Set() : new Set(r.customersMissing.map((c) => c.id)))}>{selCust.size === r.customersMissing.length ? "Clear" : "Select all"}</button></div>
              <ul className="max-h-[28rem] divide-y divide-line overflow-y-auto">
                {r.customersMissing.map((c) => (
                  <li key={c.id}><label className="flex cursor-pointer items-start gap-3 px-3 py-2 text-[0.8125rem]">
                    <input type="checkbox" className="mt-0.5 h-4 w-4" checked={selCust.has(c.id)} onChange={() => setSelCust(tog(selCust, c.id))} />
                    <span className="min-w-0"><span className="block text-ink">{c.name}</span><span className="block text-[0.75rem] text-ink-faint">{c.email ?? "no email in Xero"}{c.nameMatch ? ` · a client called “${c.nameMatch.name}” is here but not linked to Xero` : ""}</span></span>
                  </label></li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="text-[0.9375rem] font-semibold text-ink">Hosting accounts with no repeating invoice</h2>
          <p className="text-[0.75rem] text-ink-muted">On a server, but no repeating invoice for the account or its client — they may not be getting billed.</p>
          {r.hostingWithoutRepeating.length === 0 ? <p className="text-[0.8125rem] text-ink-muted">Every hosting account has a repeating invoice.</p> : (
            <ul className="grid gap-1.5 sm:grid-cols-2">{r.hostingWithoutRepeating.map((h) => <li key={h.id}><a href={`/hosting/${h.id}`} className="flex items-center justify-between gap-2 rounded-xl bg-surface px-3 py-2 text-[0.8125rem] ring-1 ring-line hover:ring-brand-300"><span className="min-w-0 truncate text-ink">{h.domain}<span className="block truncate text-[0.75rem] text-ink-faint">{h.customer ?? "no client"}</span></span>{h.billing && <span className="shrink-0 text-[0.75rem] text-ink-muted">{h.billing}</span>}</a></li>)}</ul>
          )}
        </section>

        {r.duplicateHosting.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-[0.9375rem] font-semibold text-ink">Domains listed twice</h2>
            <p className="text-[0.75rem] text-ink-muted">The same domain is on more than one hosting account. Open them and delete the extra one.</p>
            <ul className="flex flex-wrap gap-2">{r.duplicateHosting.map((d) => <li key={d.domain}><a href={`/hosting/${d.ids[1]}`} className={cn("inline-flex h-9 items-center rounded-full px-3 text-[0.8125rem] text-ink ring-1 ring-inset ring-line hover:ring-brand-300")}>{d.domain} ×{d.count}</a></li>)}</ul>
          </section>
        )}

        {r.linkedGone.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-[0.9375rem] font-semibold text-ink">Clients linked to a Xero contact that&apos;s archived or gone</h2>
            <ul className="flex flex-wrap gap-2">{r.linkedGone.map((c) => <li key={c.id}><a href={`/clients/${c.id}`} className="inline-flex h-9 items-center rounded-full px-3 text-[0.8125rem] text-ink ring-1 ring-inset ring-line">{c.name}</a></li>)}</ul>
          </section>
        )}
        <p className="flex items-center gap-1.5 text-[0.75rem] text-ink-faint"><Check className="h-3.5 w-3.5" />Checked {new Date(r.checkedAt).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</p>
      </>)}
    </div>
  );
}
