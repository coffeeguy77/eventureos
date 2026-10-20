"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/form";
import { saveOrderDetails, setOrderStatus } from "@/app/(app)/wholesale/actions";
import { cn } from "@/lib/cn";

/** Office controls on a wholesale order: status, delivery date, paid, office note, "checked". */
export function OrderEdit({ id, status, delivery, payment, note, needsCheck, direct }: { id: string; status: string; delivery: string | null; payment: string; note: string | null; needsCheck: string | null; direct: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [d, setD] = useState(delivery ?? "");
  const [n, setN] = useState(note ?? "");
  const [cancelAsk, setCancelAsk] = useState(false);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => start(async () => {
    const r = await fn().catch(() => ({ ok: false, error: "Couldn't reach the server." }));
    setMsg(r.ok ? { ok: true, text: ok } : { ok: false, text: r.error ?? "Something went wrong." }); router.refresh();
  });
  const statusBtn = (to: "placed" | "packed" | "delivered", label: string) => (
    <button type="button" disabled={pending || status === to} onClick={() => run(() => setOrderStatus(id, to), `Marked ${label.toLowerCase()}.`)}
      className={cn("h-10 rounded-lg px-3 text-[0.8125rem] font-medium ring-1 ring-inset sm:h-9", status === to ? "bg-ink text-white ring-ink" : "text-ink ring-line hover:bg-zinc-50")}>{label}</button>
  );
  if (status === "pending") return <p className="text-[0.8125rem] text-ink-muted">Waiting for the customer to finish paying by card. Unpaid orders are not on the run sheet.</p>;
  return (
    <div className="space-y-4">
      {status !== "cancelled" && <div className="flex flex-wrap gap-2">{statusBtn("placed", "To pack")}{statusBtn("packed", "Packed")}{statusBtn("delivered", "Delivered")}</div>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-[0.75rem] font-medium text-ink-muted">Delivery run
          <input type="date" value={d} onChange={(e) => setD(e.target.value)} onBlur={() => { if (d !== (delivery ?? "")) run(() => saveOrderDetails(id, { delivery_date: d || null }), "Delivery date saved."); }} className={cn(inputClass, "mt-1")} />
        </label>
        {direct && (
          <label className="block text-[0.75rem] font-medium text-ink-muted">Payment
            <select value={payment} onChange={(e) => run(() => saveOrderDetails(id, { payment_status: e.target.value as "paid" | "unpaid" }), "Payment saved.")} className={cn(inputClass, "mt-1")}>
              <option value="unpaid">Not paid yet</option><option value="paid">Paid</option>
            </select>
          </label>
        )}
      </div>
      <label className="block text-[0.75rem] font-medium text-ink-muted">Office note (only your team sees this)
        <textarea value={n} onChange={(e) => setN(e.target.value)} onBlur={() => { if ((n || null) !== (note || null)) run(() => saveOrderDetails(id, { office_note: n }), "Note saved."); }} rows={2} className={cn(inputClass, "mt-1 h-auto py-2")} />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        {needsCheck && <Button size="sm" disabled={pending} onClick={() => run(() => saveOrderDetails(id, { clear_check: true }), "Marked as checked.")}>Mark as checked</Button>}
        {status !== "cancelled" && (cancelAsk
          ? <><span className="text-[0.8125rem] text-ink">Cancel this order?</span><Button size="sm" disabled={pending} onClick={() => run(() => setOrderStatus(id, "cancelled"), "Order cancelled.")}>Yes, cancel it</Button><Button size="sm" variant="ghost" onClick={() => setCancelAsk(false)}>No</Button></>
          : <button type="button" onClick={() => setCancelAsk(true)} className="text-[0.8125rem] font-medium text-rose-700 hover:underline">Cancel order</button>)}
        {status === "cancelled" && <Button size="sm" disabled={pending} onClick={() => run(() => setOrderStatus(id, "placed"), "Order restored.")}>Restore order</Button>}
      </div>
      {msg && <p className={cn("text-[0.75rem]", msg.ok ? "text-emerald-700" : "text-rose-700")}>{msg.text}</p>}
    </div>
  );
}
