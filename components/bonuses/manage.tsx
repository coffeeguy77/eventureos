"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/form";
import { payBonuses, saveBonusRates, undoBonusPayment } from "@/app/(app)/my-bonuses/actions";

type Person = { id: string; name: string; build: number; maintenance: number };
type Row = { id: string; who: string; invoice: string; customer: string; kind: string; exGst: number; bonus: number; ready: boolean; paid: boolean; paidOn: string | null; reference: string | null };

const fmt = (n: number, c: string) => new Intl.NumberFormat("en-AU", { style: "currency", currency: c }).format(n);

/** Owners and admins: each person's bonus rates. */
export function BonusRates({ people }: { people: Person[] }) {
  return (
    <Card>
      <CardHeader title="Bonus rates" subtitle="% of the invoice ex GST, paid on top of wages once the customer pays. Leave both at 0 for no bonus." />
      <ul className="divide-y divide-line border-t border-line">{people.map((p) => <RateRow key={p.id} p={p} />)}</ul>
    </Card>
  );
}
function RateRow({ p }: { p: Person }) {
  const router = useRouter();
  const [b, setB] = useState(p.build), [m, setM] = useState(p.maintenance);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = () => start(async () => { const r = await saveBonusRates(p.id, b, m); setMsg(r.ok ? "Saved" : r.error); if (r.ok) router.refresh(); });
  return (
    <li className="flex flex-wrap items-end gap-3 px-5 py-3 text-[0.8125rem]">
      <span className="min-w-[10rem] flex-1 pb-2 font-medium text-ink">{p.name}</span>
      <div className="w-32"><Label htmlFor={`b-${p.id}`}>New builds %</Label><Input id={`b-${p.id}`} type="number" min={0} max={100} step={0.5} value={b} onChange={(e) => setB(Number(e.target.value) || 0)} /></div>
      <div className="w-32"><Label htmlFor={`m-${p.id}`}>Maintenance %</Label><Input id={`m-${p.id}`} type="number" min={0} max={100} step={0.5} value={m} onChange={(e) => setM(Number(e.target.value) || 0)} /></div>
      <Button size="sm" disabled={pending} onClick={save}>{pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}Save</Button>
      {msg && <span className="pb-2 text-[0.75rem] text-ink-muted">{msg}</span>}
    </li>
  );
}

/** Owners and admins: tick the bonuses to pay (customer has paid), add the date and bank description. */
export function PayBonuses({ rows, currency, today }: { rows: Row[]; currency: string; today: string }) {
  const router = useRouter();
  const ready = rows.filter((r) => r.ready && !r.paid);
  const [pick, setPick] = useState<string[]>(ready.map((r) => r.id));
  const [date, setDate] = useState(today);
  const [ref, setRef] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const total = ready.filter((r) => pick.includes(r.id)).reduce((a, r) => a + r.bonus, 0);
  const pay = () => start(async () => { const r = await payBonuses(pick, date, ref); setMsg(r.ok ? { ok: true, text: r.data } : { ok: false, text: r.error }); if (r.ok) { setRef(""); router.refresh(); } });
  const undo = (id: string) => { if (!window.confirm("Undo this bonus payment? It goes back to ready to pay.")) return; start(async () => { const r = await undoBonusPayment(id); if (!r.ok) setMsg({ ok: false, text: r.error }); else router.refresh(); }); };
  const waiting = rows.filter((r) => !r.ready && !r.paid);
  const paid = rows.filter((r) => r.paid).slice(0, 30);
  return (
    <Card>
      <CardHeader title="Pay bonuses" subtitle="Bonuses on invoices the customer has paid. Choose which to pay now, and copy the bank description from your transfer so they can match it." />
      <div className="space-y-3 border-t border-line px-5 py-4 text-[0.8125rem]">
        {!ready.length ? <p className="text-ink-muted">Nothing ready to pay yet.</p> : (
          <>
            <ul className="space-y-1">
              {ready.map((r) => (
                <li key={r.id}><label className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 hover:bg-zinc-50">
                  <input type="checkbox" className="h-4 w-4" checked={pick.includes(r.id)} onChange={() => setPick((p) => (p.includes(r.id) ? p.filter((x) => x !== r.id) : [...p, r.id]))} />
                  <span className="font-medium">{r.who}</span><span className="text-ink-muted">{r.invoice} · {r.customer} · {r.kind} · {fmt(r.exGst, currency)} ex GST</span>
                  <span className="ml-auto font-semibold tabular-nums">{fmt(r.bonus, currency)}</span>
                </label></li>
              ))}
            </ul>
            <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
              <div><Label htmlFor="bp-d">Paid on</Label><Input id="bp-d" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
              <div><Label htmlFor="bp-r" hint="as it shows on their bank statement">Bank description</Label><Input id="bp-r" value={ref} maxLength={140} onChange={(e) => setRef(e.target.value)} placeholder="e.g. BONUS OCT WEB CULTURE" /></div>
            </div>
            <Button variant="primary" disabled={pending || !pick.length || !ref.trim()} onClick={pay}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Mark {fmt(total, currency)} paid</Button>
          </>
        )}
        {msg && <p role="status" className={`font-medium ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}</p>}
        {waiting.length > 0 && <div className="border-t border-line pt-3"><p className="font-medium text-ink">Waiting on the customer</p>{waiting.map((r) => <p key={r.id} className="mt-1 flex justify-between text-ink-muted"><span>{r.who} · {r.invoice} · {r.customer}</span><span className="tabular-nums">{fmt(r.bonus, currency)}</span></p>)}</div>}
        {paid.length > 0 && <div className="border-t border-line pt-3"><p className="font-medium text-ink">Paid</p>{paid.map((r) => <p key={r.id} className="mt-1 flex flex-wrap justify-between gap-2 text-ink-muted"><span>{r.who} · {r.invoice} · {r.paidOn} · “{r.reference}”</span><span className="tabular-nums">{fmt(r.bonus, currency)} <button type="button" onClick={() => undo(r.id)} className="ml-2 text-[0.75rem] underline hover:text-ink">Undo</button></span></p>)}</div>}
      </div>
    </Card>
  );
}
