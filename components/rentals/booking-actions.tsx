"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardList, FileText, Loader2, PackageCheck, PackageOpen, RotateCcw, X } from "lucide-react";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/form";
import { money } from "@/lib/format";
import { createHireInvoice, saveCounts, setBondStatus, setBookingStatus } from "@/app/(app)/rentals/actions";
import type { HireStatus } from "@/lib/hire/core";

/** Status buttons for a hire booking (reserve, book, out, returned, cancel), the pick list, invoice and bond. */
export function BookingActions({ id, status, canManage, invoice, bond, bondStatus, currency }: {
  id: string; status: HireStatus; canManage: boolean; invoice: { id: string; number: string; status: string } | null; bond: number; bondStatus: string; currency: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [short, setShort] = useState<HireStatus | null>(null);
  const go = (to: HireStatus, allowShort = false) => start(async () => {
    setMsg(null);
    const r = await setBookingStatus(id, to, { allowShort });
    if (!r.ok) { setMsg({ ok: false, text: r.error }); if (/Not enough stock/.test(r.error)) setShort(to); return; }
    setShort(null); setConfirmCancel(false); setMsg({ ok: true, text: r.data }); router.refresh();
  });
  const btn = (to: HireStatus, label: string, opts: { primary?: boolean; icon?: React.ReactNode } = {}) =>
    <Button key={to + label} size="sm" variant={opts.primary ? "primary" : "secondary"} disabled={pending} onClick={() => go(to)}>{opts.icon}{label}</Button>;
  const flow: Record<HireStatus, React.ReactNode[]> = {
    quote: [btn("booked", "Book it", { primary: true }), btn("reservation", "Reserve")],
    reservation: [btn("booked", "Confirm booking", { primary: true }), btn("quote", "Back to quote")],
    booked: [btn("out", "Mark as out", { primary: true, icon: <PackageOpen className="h-4 w-4" /> }), btn("quote", "Back to quote")],
    out: [btn("returned", "All back", { primary: true, icon: <PackageCheck className="h-4 w-4" /> }), btn("booked", "Not gone yet")],
    returned: [btn("out", "Reopen", { icon: <RotateCcw className="h-4 w-4" /> })],
    cancelled: [btn("quote", "Reopen as quote", { icon: <RotateCcw className="h-4 w-4" /> })],
  };
  return (
    <div className="flex max-w-full flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        {pending && <Loader2 className="h-4 w-4 animate-spin self-center text-ink-faint" />}
        {flow[status]}
        <Link href={`/rentals/bookings/${id}/pick`} target="_blank" className={buttonClass("secondary", "sm")}><ClipboardList className="h-4 w-4" />Pick list</Link>
        {canManage && (invoice
          ? <Link href={`/invoices/${invoice.id}`} className={buttonClass("secondary", "sm")}><FileText className="h-4 w-4" />{invoice.number}</Link>
          : !["quote", "cancelled"].includes(status) && <Button size="sm" disabled={pending} onClick={() => start(async () => { setMsg(null); const r = await createHireInvoice(id); if (!r.ok) setMsg({ ok: false, text: r.error }); else router.push(`/invoices/${r.data}`); })}><FileText className="h-4 w-4" />Create invoice</Button>)}
        {!["cancelled", "returned", "out"].includes(status) && (confirmCancel
          ? <><Button size="sm" variant="danger" disabled={pending} onClick={() => go("cancelled")}>Yes, cancel it</Button><Button size="sm" variant="ghost" onClick={() => setConfirmCancel(false)} aria-label="Keep it"><X className="h-4 w-4" /></Button></>
          : <Button size="sm" variant="ghost" onClick={() => setConfirmCancel(true)}>Cancel</Button>)}
      </div>
      {bond > 0 && (
        <label className="flex items-center gap-2 text-[0.75rem] text-ink-muted">
          Bond {money(bond, currency)}
          <Select aria-label="Bond" value={bondStatus} disabled={pending} onChange={(e) => start(async () => { const r = await setBondStatus(id, e.target.value as "none"); if (!r.ok) setMsg({ ok: false, text: r.error }); else router.refresh(); })} className="!h-7 !w-auto !py-0 text-[0.75rem]">
            <option value="none">Not taken</option><option value="held">Held</option><option value="returned">Refunded</option><option value="kept">Kept (damage)</option>
          </Select>
        </label>
      )}
      {msg && <p className={`max-w-md text-right text-[0.8125rem] ${msg.ok ? "text-emerald-700" : "text-rose-600"}`} role="status">{msg.text}</p>}
      {short && <Button size="sm" variant="danger" disabled={pending} onClick={() => go(short, true)}>Do it anyway (I&apos;ll cross-hire)</Button>}
    </div>
  );
}

type CountLine = { id: string; name: string; quantity: number; out: number; returned: number; damaged: number };

/** Count what went out and what came back. Part returns free the stock straight away; damaged items are noted. */
export function CountsPanel({ id, status, lines }: { id: string; status: HireStatus; lines: CountLine[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(() => lines.map((l) => ({ ...l, out: l.out || (status === "booked" ? l.quantity : l.out || l.quantity) })));
  const [open, setOpen] = useState(status === "out");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const missing = rows.reduce((a, r) => a + Math.max(0, r.out - r.returned - r.damaged), 0);
  const damaged = rows.reduce((a, r) => a + r.damaged, 0);
  const set = (i: number, k: "out" | "returned" | "damaged", v: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: Math.max(0, Math.round(Number(v.replace(/\D/g, "")) || 0)) } : r)));
  const n = "h-8 w-16 rounded-md border border-line-strong bg-surface px-2 text-center text-[0.8125rem] tabular-nums";
  return (
    <Card className="mb-5">
      <CardHeader title={status === "booked" ? "Load out" : status === "out" ? "Check in" : "Return count"}
        subtitle={status === "booked" ? "Count what's going out, if it's not everything." : status === "out" ? (missing ? `${missing} still out${damaged ? `, ${damaged} damaged` : ""}.` : "Everything's counted back in.") : damaged ? `${damaged} came back damaged.` : "All returned."}
        action={<Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>{open ? "Hide" : "Show"}</Button>} />
      {open && (
        <div className="border-t border-line">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-[0.8125rem]">
              <thead><tr className="text-left text-[0.7188rem] uppercase tracking-wide text-ink-faint"><th className="px-5 py-2 font-medium">Item</th><th className="px-2 py-2 text-center font-medium">Booked</th><th className="px-2 py-2 text-center font-medium">Out</th>{status !== "booked" && <><th className="px-2 py-2 text-center font-medium">Back</th><th className="px-2 py-2 text-center font-medium">Damaged</th><th className="px-5 py-2 text-right font-medium">Missing</th></>}</tr></thead>
              <tbody className="divide-y divide-line">
                {rows.map((r, i) => {
                  const miss = Math.max(0, r.out - r.returned - r.damaged);
                  return (
                    <tr key={r.id}>
                      <td className="px-5 py-2 font-medium text-ink">{r.name}</td>
                      <td className="px-2 py-2 text-center tabular-nums text-ink-muted">{r.quantity}</td>
                      <td className="px-2 py-2 text-center"><input aria-label={`${r.name} out`} inputMode="numeric" className={n} value={r.out} onChange={(e) => set(i, "out", e.target.value)} /></td>
                      {status !== "booked" && <>
                        <td className="px-2 py-2 text-center"><div className="flex items-center justify-center gap-1"><input aria-label={`${r.name} back`} inputMode="numeric" className={n} value={r.returned} onChange={(e) => set(i, "returned", e.target.value)} /><button type="button" className="text-[0.7188rem] font-medium text-brand-700 hover:underline" onClick={() => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, returned: Math.max(0, x.out - x.damaged) } : x)))}>all</button></div></td>
                        <td className="px-2 py-2 text-center"><input aria-label={`${r.name} damaged`} inputMode="numeric" className={n} value={r.damaged} onChange={(e) => set(i, "damaged", e.target.value)} /></td>
                        <td className={`px-5 py-2 text-right tabular-nums ${miss ? "font-semibold text-rose-700" : "text-ink-faint"}`}>{miss}</td>
                      </>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line px-5 py-3">
            {msg && <p className={`text-[0.8125rem] ${msg.ok ? "text-emerald-700" : "text-rose-600"}`} role="status">{msg.text}</p>}
            <Button size="sm" variant="primary" disabled={pending} onClick={() => start(async () => {
              setMsg(null);
              const r = await saveCounts(id, rows.map((x) => ({ lineId: x.id, out: x.out, returned: status === "booked" ? 0 : x.returned, damaged: status === "booked" ? 0 : x.damaged })));
              setMsg(r.ok ? { ok: true, text: r.data } : { ok: false, text: r.error });
              if (r.ok) router.refresh();
            })}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Save counts</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
