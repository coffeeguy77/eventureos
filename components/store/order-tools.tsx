"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Printer } from "lucide-react";
import { saveOrderDetails, setOrderStatus } from "@/app/(app)/store/actions";
import { ORDER_STATUS } from "@/lib/shop/core";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/form";

export function OrderTools({ id, status, tracking, note, dispatchOn, woo }: { id: string; status: string; tracking: string; note: string; dispatchOn: string | null; woo: boolean }) {
  const router = useRouter();
  const [f, setF] = useState({ tracking, note, dispatchOn: dispatchOn ?? "" });
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const flow = ["paid", "roasting", "packed", "shipped", "completed"];
  return (
    <div className="space-y-4">
      {!woo && (
        <div className="flex flex-wrap gap-2">
          {flow.map((s) => <Button key={s} type="button" size="sm" variant={s === status ? "primary" : "secondary"} disabled={pending || s === status} onClick={() => start(async () => { const r = await setOrderStatus([id], s); setMsg(r.ok ? "Updated." : r.error); router.refresh(); })}>{ORDER_STATUS[s]}</Button>)}
          <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => start(async () => { const r = await setOrderStatus([id], "on_hold"); setMsg(r.ok ? "On hold." : r.error); router.refresh(); })}>On hold</Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => window.print()}><Printer className="h-4 w-4" />Packing slip</Button>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label htmlFor="ot-t">Tracking number</Label><Input id="ot-t" value={f.tracking} onChange={(e) => setF({ ...f, tracking: e.target.value })} /></div>
        <div><Label htmlFor="ot-d">Ships on</Label><Input id="ot-d" type="date" value={f.dispatchOn} onChange={(e) => setF({ ...f, dispatchOn: e.target.value })} /></div>
        <div className="sm:col-span-2"><Label htmlFor="ot-n">Office note</Label><Textarea id="ot-n" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
      </div>
      <div className="flex items-center gap-3"><Button type="button" variant="primary" disabled={pending} onClick={() => start(async () => { const r = await saveOrderDetails(id, f); setMsg(r.ok ? r.data : r.error); router.refresh(); })}>Save</Button>{msg && <span className="text-[0.8125rem] text-ink-muted">{msg}</span>}</div>
    </div>
  );
}
