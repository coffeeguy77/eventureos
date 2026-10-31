"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, Loader2, User } from "lucide-react";
import { changeInvoiceCustomer, searchCustomersToBill } from "@/app/(app)/invoices/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";

/** On the invoice page: bill this invoice (or its whole job) to a different customer — e.g. the company, not the person. */
export function ChangeInvoiceCustomer({ invoiceId, hasJob, inXero, suggestion }: { invoiceId: string; hasJob: boolean; inXero: boolean; suggestion: { id: string; name: string; why: string } | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ id: string; name: string; detail: string | null; company: boolean }[]>([]);
  const [pick, setPick] = useState<{ id: string; name: string } | null>(null);
  const [whole, setWhole] = useState(hasJob);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open || q.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(() => { searchCustomersToBill(q).then(setHits).catch(() => setHits([])); }, 250);
    return () => clearTimeout(t);
  }, [q, open]);

  const move = (to: { id: string; name: string }) => start(async () => {
    setMsg(null);
    const r: { error?: string; ok?: string } | undefined = await changeInvoiceCustomer(invoiceId, to.id, whole).catch(() => ({ error: "Couldn't reach the server." }));
    setMsg(r?.error ? { ok: false, text: r.error } : { ok: true, text: r?.ok ?? "Moved." });
    if (!r?.error) { setOpen(false); setPick(null); setQ(""); }
    router.refresh();
  });

  return (
    <div className="border-t border-line px-5 py-4">
      {suggestion && !open && (
        <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-[0.7812rem] text-amber-900 ring-1 ring-inset ring-amber-100">
          This looks like <b>{suggestion.name}</b>&rsquo;s booking ({suggestion.why}).
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="primary" disabled={pending} onClick={() => move(suggestion)}>{pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}Bill {suggestion.name}</Button>
            {hasJob && <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={whole} onChange={(e) => setWhole(e.target.checked)} />and move the job</label>}
          </div>
        </div>
      )}
      {!open ? (
        <button onClick={() => setOpen(true)} className="text-[0.7812rem] font-medium text-brand-600 hover:text-brand-700">Change customer…</button>
      ) : (
        <div className="space-y-2">
          <label className="block text-[0.75rem] font-medium text-ink">Bill to</label>
          <Input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setPick(null); }} placeholder="Search customers by name, company or email" />
          {!pick && hits.length > 0 && (
            <ul className="max-h-56 overflow-auto rounded-lg border border-line text-[0.8125rem]">
              {hits.map((h) => (
                <li key={h.id}>
                  <button type="button" onClick={() => setPick(h)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-canvas">
                    {h.company ? <Building2 className="h-4 w-4 shrink-0 text-ink-faint" /> : <User className="h-4 w-4 shrink-0 text-ink-faint" />}
                    <span className="min-w-0 flex-1 truncate"><span className="font-medium text-ink">{h.name}</span>{h.detail && <span className="text-ink-muted"> · {h.detail}</span>}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {pick && <p className="text-[0.8125rem] text-ink">Bill to <b>{pick.name}</b></p>}
          {hasJob && <label className="flex items-start gap-2 text-[0.7812rem] text-ink"><input type="checkbox" className="mt-0.5" checked={whole} onChange={(e) => setWhole(e.target.checked)} />Move the whole job too — its quotes, other invoices, emails and the person who booked (as a contact)</label>}
          {inXero && <p className="text-[0.75rem] text-ink-muted">It&rsquo;s in Xero, so Xero&rsquo;s copy is moved to that customer too. If Xero won&rsquo;t allow it, nothing changes here.</p>}
          <div className="flex gap-2">
            <Button size="sm" variant="primary" disabled={!pick || pending} onClick={() => pick && move(pick)}>{pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}Move</Button>
            <Button size="sm" variant="ghost" onClick={() => { setOpen(false); setPick(null); setQ(""); }}>Cancel</Button>
          </div>
          <p className="text-[0.75rem] text-ink-muted">Not a customer yet? Open the person&rsquo;s record and make them a company instead.</p>
        </div>
      )}
      {msg && <p className={msg.ok ? "mt-2 text-[0.75rem] text-emerald-700" : "mt-2 text-[0.75rem] text-rose-700"}>{msg.text}</p>}
    </div>
  );
}
