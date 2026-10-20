"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { inputClass } from "@/components/ui/form";
import { saveTrackingNumbers } from "@/app/(app)/store/actions";
import { mypostRow, orderProblems, PACKAGING, readTrackingPaste, toCsv, trackingUrl, type AusPostSettings, type PackagingId, type ShipLine, type ShipOrder } from "@/lib/shop/auspost";
import { cn } from "@/lib/cn";

interface Row { order: ShipOrder; weightKg: number | null; status: string; tracking: string | null }

export function ShipBoard({ orders, settings, ready }: { orders: Row[]; settings: AusPostSettings; ready: boolean }) {
  const router = useRouter();
  const [lines, setLines] = useState<Record<string, ShipLine>>(() => Object.fromEntries(orders.map((r) => [r.order.id, {
    packaging: r.weightKg != null && r.weightKg > (PACKAGING.find((p) => p.id === settings.packaging)?.maxKg ?? 22) ? "OWN_PACKAGING" : settings.packaging,
    service: settings.service, weightKg: r.weightKg ?? 0, length: settings.length, width: settings.width, height: settings.height,
  }])));
  const [paste, setPaste] = useState("");
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const problems = useMemo(() => Object.fromEntries(orders.map((r) => [r.order.id, orderProblems(r.order, lines[r.order.id])])), [orders, lines]);
  const good = orders.filter((r) => !problems[r.order.id].length);
  const set = (id: string, patch: Partial<ShipLine>) => setLines({ ...lines, [id]: { ...lines[id], ...patch } });

  const download = () => {
    const csv = toCsv(good.map((r) => mypostRow(r.order, lines[r.order.id], settings)));
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `mypost-orders-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const fromPaste = readTrackingPaste(paste, orders.map((r) => r.order.number));
  const save = () => start(async () => {
    const pairs = [
      ...fromPaste.map((p) => ({ id: orders.find((r) => r.order.number === p.number)!.order.id, tracking: p.tracking })),
      ...Object.entries(typed).filter(([, t]) => t.trim()).map(([id, tracking]) => ({ id, tracking: tracking.trim() })),
    ];
    if (!pairs.length) { setMsg({ ok: false, text: "No tracking numbers to save." }); return; }
    const r = await saveTrackingNumbers(pairs).catch(() => ({ ok: false as const, error: "Couldn't reach the server." }));
    setMsg(r.ok ? { ok: true, text: `${r.data} order${r.data === 1 ? "" : "s"} marked shipped with tracking.` } : { ok: false, text: r.error });
    if (r.ok) { setPaste(""); setTyped({}); router.refresh(); }
  });
  const field = cn(inputClass, "h-8 py-0.5 text-[0.8125rem]");

  return (
    <div className="space-y-5">
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-[0.8125rem]">
          <thead className="border-b border-line bg-zinc-50 text-[0.75rem] text-ink-muted">
            <tr><th className="px-3 py-2">Order</th><th className="px-3 py-2">Deliver to</th><th className="px-3 py-2">Packaging</th><th className="px-3 py-2">Service</th><th className="px-3 py-2">Weight (kg)</th><th className="px-3 py-2">Tracking</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {orders.map((r) => {
              const l = lines[r.order.id]; const a = r.order.address as Record<string, string | undefined>; const p = problems[r.order.id];
              return (
                <tr key={r.order.id} className="align-top">
                  <td className="px-3 py-2.5"><p className="font-semibold text-ink">#{r.order.number}</p><p className="text-[0.75rem] text-ink-faint">{r.order.items.map((i) => `${i.qty}× ${i.name.split("|")[0].trim()} ${i.variant}`).join(", ")}</p></td>
                  <td className="px-3 py-2.5"><p className="text-ink">{a.name || r.order.name}</p><p className="text-[0.75rem] text-ink-muted">{[a.company, a.line1, a.line2, `${a.suburb ?? ""} ${a.state ?? ""} ${a.postcode ?? ""}`].filter(Boolean).join(", ")}</p>
                    {p.length > 0 && <p className="mt-1 text-[0.75rem] font-medium text-rose-700">Left out: {p.join("; ")}</p>}</td>
                  <td className="px-3 py-2.5"><select aria-label={`Packaging for order ${r.order.number}`} value={l.packaging} onChange={(e) => set(r.order.id, { packaging: e.target.value as PackagingId })} className={field}>{PACKAGING.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
                    {l.packaging === "OWN_PACKAGING" && <div className="mt-1 flex gap-1">{(["length", "width", "height"] as const).map((k) => <input key={k} aria-label={`${k} cm`} placeholder={k[0].toUpperCase()} inputMode="decimal" value={l[k] ?? ""} onChange={(e) => set(r.order.id, { [k]: e.target.value ? Number(e.target.value) : null })} className={cn(field, "w-14")} />)}</div>}</td>
                  <td className="px-3 py-2.5"><select aria-label={`Service for order ${r.order.number}`} value={l.service} onChange={(e) => set(r.order.id, { service: e.target.value as "PP" | "EXP" })} className={field}><option value="PP">Parcel Post</option><option value="EXP">Express</option></select></td>
                  <td className="px-3 py-2.5"><input aria-label={`Weight for order ${r.order.number}`} inputMode="decimal" value={l.weightKg || ""} onChange={(e) => set(r.order.id, { weightKg: Number(e.target.value) || 0 })} className={cn(field, "w-20 text-right")} />{r.weightKg == null && <p className="mt-1 text-[0.7188rem] text-amber-700">Bag size unknown — enter it</p>}</td>
                  <td className="px-3 py-2.5">{r.tracking ? <a href={trackingUrl(r.tracking)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline">{r.tracking}<ExternalLink className="h-3 w-3" /></a>
                    : <input aria-label={`Tracking number for order ${r.order.number}`} value={typed[r.order.id] ?? ""} onChange={(e) => setTyped({ ...typed, [r.order.id]: e.target.value })} placeholder="Tracking number" className={cn(field, "w-40")} />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Card className="p-5">
        <h2 className="text-[0.9375rem] font-semibold text-ink">1. Make the MyPost Business file</h2>
        <p className="mt-1 text-[0.8125rem] text-ink-muted">{good.length} of {orders.length} order{orders.length === 1 ? "" : "s"} ready. In MyPost Business choose Import CSV, pick this file, then pay for and print the labels there. Each label shows the order number.</p>
        <Button className="mt-3" variant="primary" disabled={!ready || !good.length} onClick={download}><Download className="h-4 w-4" />Download file ({good.length})</Button>
      </Card>

      <Card className="p-5">
        <h2 className="text-[0.9375rem] font-semibold text-ink">2. Add the tracking numbers</h2>
        <p className="mt-1 text-[0.8125rem] text-ink-muted">Type them in the table above, or paste lines that each have the order number and its tracking number (e.g. copied or exported from MyPost Business). Saving marks the orders shipped and shows the tracking on the customer&apos;s order page.</p>
        <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={4} placeholder={"54715  33ABC1234567\n54718, 33XYZ7654321"} aria-label="Paste tracking numbers" className={cn(inputClass, "mt-3 font-mono text-[0.8125rem]")} />
        {paste.trim() && <p className="mt-1 text-[0.75rem] text-ink-muted">Found {fromPaste.length}: {fromPaste.map((p) => `#${p.number} → ${p.tracking}`).join(", ") || "none — each line needs an order number from this list and a tracking number"}</p>}
        <div className="mt-3 flex items-center gap-3">
          <Button variant="primary" disabled={pending} onClick={save}>{pending ? "Saving…" : "Save tracking & mark shipped"}</Button>
          {msg && <span className={msg.ok ? "text-[0.8125rem] text-emerald-700" : "text-[0.8125rem] text-rose-700"}>{msg.text}</span>}
        </div>
      </Card>
    </div>
  );
}
