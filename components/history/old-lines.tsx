"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { inputClass } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";
import { copyToNewQuote, saveItemAlias } from "@/app/(app)/history/actions";

export interface OldLine {
  code: string | null; title: string; rest: string | null; quantity: number; unitAmount: number; lineAmount: number; note: boolean;
  item: { id: string; name: string; unit: string | null; unit_price: number | null } | null; via: "code" | "alias" | null;
}
export interface CopyPerson { id: string; name: string; email: string | null; picked: boolean }
export interface PriceOption { id: string; name: string; code: string | null; unit: string | null; unit_price: number; category: string | null }

/**
 * An old quote's or invoice's lines, each checked against today's price list. Lines that match nothing are
 * highlighted, and (for managers) can be matched to a current item — remembered for that old item code everywhere.
 */
export function OldLines({ lines, options, currency, canEdit, source, sourceId, defaultName, total, people = [] }: {
  lines: OldLine[]; options: PriceOption[]; currency: string; canEdit: boolean;
  /** The client's people; `picked` = on the job last time (or the main contact) */
  people?: CopyPerson[];
  source: "xero_quote" | "invoice"; sourceId: string; defaultName: string; total: number;
}) {
  const priced = lines.filter((l) => !l.note);
  const unmatched = priced.filter((l) => !l.item);
  const groups = useMemo(() => {
    const m = new Map<string, PriceOption[]>();
    for (const o of options) { const k = o.category || "Other"; m.set(k, [...(m.get(k) ?? []), o]); }
    return [...m.entries()];
  }, [options]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="What was on it"
          subtitle={priced.length ? `${priced.length - unmatched.length} of ${priced.length} line${priced.length === 1 ? "" : "s"} match today's price list` : "No priced lines"}
          action={<span className="tabular text-[0.8438rem] font-semibold text-ink">{money(total, currency)} <span className="font-normal text-ink-faint">inc GST</span></span>} />
        {unmatched.length > 0 && (
          <div className="mx-5 mb-3 flex gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-[0.7812rem] text-amber-900 ring-1 ring-inset ring-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <span>
              {unmatched.length} line{unmatched.length === 1 ? " isn't" : "s aren't"} on today&apos;s price list.{" "}
              {canEdit ? "Choose the item each one is now — EventureOS remembers it for that old item code on every old quote and invoice." : "Ask an owner or manager to match them to current items."}
              {" "}Unmatched lines still copy across as one-off lines.
            </span>
          </div>
        )}
        <ul className="divide-y divide-line border-t border-line">
          {lines.map((l, i) => <LineRow key={i} l={l} groups={groups} currency={currency} canEdit={canEdit} />)}
        </ul>
      </Card>
      <CopyPanel source={source} sourceId={sourceId} defaultName={defaultName} unmatched={unmatched.length} people={people}
        priceChanges={priced.filter((l) => l.item?.unit_price != null && Math.abs(Number(l.item.unit_price) - l.unitAmount) > 0.004).length} />
    </div>
  );
}

function LineRow({ l, groups, currency, canEdit }: { l: OldLine; groups: [string, PriceOption[]][]; currency: string; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const flag = !l.note && !l.item;
  const nowPrice = l.item?.unit_price;
  const priceChanged = nowPrice != null && Math.abs(Number(nowPrice) - l.unitAmount) > 0.004 && !l.note;

  const save = (serviceId: string | null) => start(async () => {
    setErr(null);
    const r = await saveItemAlias(l.code ?? "", serviceId).catch(() => ({ ok: false as const, error: "Couldn't reach the server." }));
    if (!r.ok) { setErr(r.error); return; }
    setEditing(false);
    router.refresh();
  });

  const picker = (
    <select aria-label={`Today's item for ${l.code ?? l.title}`} disabled={pending} defaultValue={l.via === "alias" ? l.item?.id ?? "" : ""}
      onChange={(e) => e.target.value && save(e.target.value)} className={cn(inputClass, "h-9 bg-surface text-[0.7812rem] sm:h-8")}>
      <option value="">Choose today&apos;s item…</option>
      {groups.map(([cat, opts]) => (
        <optgroup key={cat} label={cat}>
          {opts.map((o) => <option key={o.id} value={o.id}>{o.name}{o.code ? ` (${o.code})` : ""} — {money(o.unit_price, currency)}{o.unit ? `/${o.unit}` : ""}</option>)}
        </optgroup>
      ))}
    </select>
  );

  return (
    <li className={cn("px-5 py-3", flag && "bg-amber-50/60", l.note && "bg-zinc-50/60")}>
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-64">
          <div className="flex flex-wrap items-center gap-2">
            {l.code && <span className={cn("rounded px-1.5 py-0.5 font-mono text-[0.6875rem] ring-1 ring-inset", flag ? "bg-amber-100 text-amber-900 ring-amber-300" : "bg-zinc-100 text-ink-muted ring-line")}>{l.code}</span>}
            <span className="break-words text-[0.8125rem] font-medium text-ink">{l.title}</span>
          </div>
          {l.rest && (
            <button type="button" onClick={() => setOpen((o) => !o)} className="mt-0.5 block w-full text-left">
              <p className={cn("whitespace-pre-line break-words text-[0.75rem] text-ink-muted", !open && "line-clamp-2")}>{l.rest}</p>
            </button>
          )}
          {/* Today's match */}
          <div className="mt-1.5 text-[0.75rem]">
            {l.note ? <span className="text-ink-faint">Note line · no price</span>
              : l.item && !editing ? (
                <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="inline-flex items-center gap-1 font-medium text-emerald-700"><Check className="h-3.5 w-3.5" />Now: {l.item.name}</span>
                  {l.via === "alias" && <span className="text-ink-faint">matched by you</span>}
                  {priceChanged && <span className="text-amber-700">price list {money(Number(nowPrice), currency)}{l.item.unit ? `/${l.item.unit}` : ""}</span>}
                  {canEdit && l.via === "alias" && l.code && <button type="button" onClick={() => setEditing(true)} className="font-medium text-brand-700 hover:underline">Change</button>}
                </span>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {flag && <span className="inline-flex items-center gap-1 font-medium text-amber-800"><AlertTriangle className="h-3.5 w-3.5" />Not on today&apos;s price list</span>}
                  {canEdit && l.code && <div className="w-full max-w-sm sm:w-72">{picker}</div>}
                  {canEdit && !l.code && <span className="text-ink-faint">No item code in Xero — adjust it on the new quote</span>}
                  {editing && <button type="button" onClick={() => save(null)} disabled={pending} className="font-medium text-rose-700 hover:underline">Remove match</button>}
                  {editing && <button type="button" onClick={() => setEditing(false)} className="text-ink-muted hover:underline">Cancel</button>}
                  {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-faint" />}
                </div>
              )}
            {err && <p className="mt-1 text-rose-700">{err}</p>}
          </div>
        </div>
        {!l.note && (
          <div className="ml-auto shrink-0 text-right">
            <p className="tabular text-[0.8125rem] font-medium text-ink">{money(l.lineAmount, currency)}</p>
            <p className="tabular text-[0.7188rem] text-ink-faint">{Number(l.quantity)} × {money(l.unitAmount, currency)}</p>
          </div>
        )}
      </div>
    </li>
  );
}

function CopyPanel({ source, sourceId, defaultName, unmatched, priceChanges, people }: { source: "xero_quote" | "invoice"; sourceId: string; defaultName: string; unmatched: number; priceChanges: number; people: CopyPerson[] }) {
  const [picked, setPicked] = useState<string[]>(people.filter((p) => p.picked).map((p) => p.id));
  const router = useRouter();
  const [name, setName] = useState(defaultName);
  const [prices, setPrices] = useState<"old" | "current">("current");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const go = () => start(async () => {
    setErr(null);
    const r = await copyToNewQuote({ source, id: sourceId, prices, name, contactIds: picked }).catch(() => ({ ok: false as const, error: "Couldn't reach the server." }));
    if (!r.ok) { setErr(r.error); return; }
    router.push(`/quotes/${r.data.quoteId}`);
  });
  const opt = (v: "old" | "current", label: string, hint: string) => (
    <label className={cn("flex flex-1 basis-56 cursor-pointer gap-2 rounded-lg px-3 py-2.5 ring-1 ring-inset", prices === v ? "bg-brand-50/70 ring-brand-300" : "ring-line hover:bg-zinc-50")}>
      <input type="radio" name="prices" value={v} checked={prices === v} onChange={() => setPrices(v)} className="mt-0.5 h-4 w-4 accent-brand-600" />
      <span><span className="block text-[0.8125rem] font-medium text-ink">{label}</span><span className="block text-[0.7188rem] text-ink-muted">{hint}</span></span>
    </label>
  );
  return (
    <Card>
      <CardHeader title="Copy to a new quote" subtitle="Starts a new job (date TBC) with a draft quote holding these lines. Nothing changes on this one or in Xero." />
      <div className="space-y-3 px-5 pb-5">
        <label className="block">
          <span className="mb-1 block text-[0.75rem] font-medium text-ink-muted">Job name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} className={inputClass} />
        </label>
        <div className="flex flex-wrap gap-2">
          {opt("current", "Today's prices", priceChanges ? `${priceChanges} matched line${priceChanges === 1 ? " changes" : "s change"} to the price-list price` : "Matched lines use the price list")}
          {opt("old", "Same prices as last time", "Every line keeps its old price")}
        </div>
        {people.length > 0 && (
          <div>
            <span className="mb-1 block text-[0.75rem] font-medium text-ink-muted">Who this job is with <span className="font-normal text-ink-faint">— only they get the quote emails</span></span>
            <div className="flex flex-wrap gap-1.5">
              {people.map((p) => {
                const on = picked.includes(p.id);
                return (
                  <label key={p.id} className={cn("inline-flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.75rem] ring-1 ring-inset", on ? "bg-brand-50 text-brand-800 ring-brand-300" : "text-ink-muted ring-line hover:ring-brand-200")}>
                    <input type="checkbox" className="h-3.5 w-3.5 accent-brand-600" checked={on} onChange={(e) => setPicked((x) => e.target.checked ? [...x, p.id] : x.filter((y) => y !== p.id))} />
                    {p.name}{p.email ? <span className="text-ink-faint">· {p.email}</span> : <span className="text-amber-700">· no email</span>}
                  </label>
                );
              })}
            </div>
            {picked.length === 0 && <p className="mt-1 text-[0.7188rem] text-ink-faint">Nobody ticked — the client&apos;s main contact will be used.</p>}
          </div>
        )}
        {unmatched > 0 && <p className="text-[0.75rem] text-amber-800">{unmatched} unmatched line{unmatched === 1 ? "" : "s"} will be highlighted on the new quote so you can swap {unmatched === 1 ? "it" : "them"} for a current item.</p>}
        {err && <p className="text-[0.75rem] text-rose-700">{err}</p>}
        <div className="flex justify-end">
          <Button variant="primary" size="sm" className="h-10 sm:h-9" disabled={pending || !name.trim()} onClick={go}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}Copy to new quote
          </Button>
        </div>
      </div>
    </Card>
  );
}
