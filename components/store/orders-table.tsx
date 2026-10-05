"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { setOrderStatus } from "@/app/(app)/store/actions";
import { ORDER_STATUS } from "@/lib/shop/core";
import { Badge } from "@/components/ui/badge";

export interface OrderRow { id: string; number: number; created_at: string; name: string | null; email: string | null; status: string; kind: string; source: string; total: number; delivery: string; dispatch_on: string | null; summary: string; place: string; woo: boolean }

const tone = (s: string) => (s === "paid" ? "amber" : s === "roasting" ? "brand" : s === "packed" ? "blue" : s === "shipped" || s === "completed" ? "green" : s === "failed" || s === "cancelled" || s === "refunded" ? "red" : "neutral") as "amber";
const KIND: Record<string, string> = { one_off: "One-off", subscription_first: "New subscription", subscription_renewal: "Subscription", prepaid: "Prepaid", event_addon: "With event", gift_card: "Gift card" };

export function OrdersTable({ rows, currency }: { rows: OrderRow[]; currency: string }) {
  const router = useRouter();
  const [sel, setSel] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const money = (n: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(n);
  const all = rows.filter((r) => !r.woo).map((r) => r.id);
  const bulk = (status: string) => start(async () => {
    const r = await setOrderStatus(sel, status);
    setMsg(r.ok ? `${r.data} order${r.data === 1 ? "" : "s"} marked ${ORDER_STATUS[status].toLowerCase()}.` : r.error);
    if (r.ok) { setSel([]); router.refresh(); }
  });
  return (
    <div>
      <div className="mb-2 flex min-h-10 flex-wrap items-center gap-2 text-[0.8125rem]">
        {sel.length > 0 ? (
          <>
            <span className="font-medium text-ink">{sel.length} selected</span>
            {["roasting", "packed", "shipped", "completed"].map((s) => <button key={s} type="button" disabled={pending} onClick={() => bulk(s)} className="h-8 rounded-lg border border-line-strong bg-surface px-3 font-medium text-ink hover:bg-zinc-50">Mark {ORDER_STATUS[s].toLowerCase()}</button>)}
            {pending && <Loader2 className="h-4 w-4 animate-spin text-ink-faint" />}
          </>
        ) : <span className="text-ink-faint">Tick orders to mark them roasting, packed or shipped together.</span>}
        {msg && <span className="text-ink-muted">{msg}</span>}
      </div>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[880px] text-left text-[0.8125rem]">
          <thead className="border-b border-line bg-zinc-50 text-[0.75rem] text-ink-muted">
            <tr><th className="w-10 px-3 py-2"><input type="checkbox" aria-label="Select all" checked={sel.length > 0 && sel.length === all.length} onChange={(e) => setSel(e.target.checked ? all : [])} /></th>
              <th className="px-3 py-2">Order</th><th className="px-3 py-2">Customer</th><th className="px-3 py-2">Coffee</th><th className="px-3 py-2">Delivery</th><th className="px-3 py-2">Ships</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2">Status</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.id} className="align-top hover:bg-zinc-50/60">
                <td className="px-3 py-2.5">{!r.woo && <input type="checkbox" aria-label={`Select order ${r.number}`} checked={sel.includes(r.id)} onChange={(e) => setSel(e.target.checked ? [...sel, r.id] : sel.filter((x) => x !== r.id))} />}</td>
                <td className="px-3 py-2.5"><Link href={`/store/orders/${r.id}`} className="font-semibold text-ink hover:underline">#{r.number}</Link><p className="text-[0.75rem] text-ink-faint">{new Date(r.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "2-digit" })} · {r.woo ? "WooCommerce" : KIND[r.kind] ?? r.kind}</p></td>
                <td className="px-3 py-2.5"><p className="text-ink">{r.name ?? "—"}</p><p className="text-[0.75rem] text-ink-faint">{r.email}</p></td>
                <td className="max-w-[280px] px-3 py-2.5 text-ink">{r.summary}</td>
                <td className="px-3 py-2.5 text-ink-muted">{r.place}</td>
                <td className="px-3 py-2.5 text-ink-muted">{r.dispatch_on ? new Date(`${r.dispatch_on}T00:00:00`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" }) : "—"}</td>
                <td className="px-3 py-2.5 text-right font-medium text-ink">{money(r.total)}</td>
                <td className="px-3 py-2.5"><Badge tone={tone(r.status)}>{ORDER_STATUS[r.status] ?? r.status}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
