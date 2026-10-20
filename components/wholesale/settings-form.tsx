"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormError, Input, Label, Select } from "@/components/ui/form";
import { saveWholesaleSettings, type WholesaleSettingsInput } from "@/app/(app)/wholesale/actions";
import { WEEKDAYS } from "@/lib/wholesale/rules";

export function WholesaleSettingsForm({ initial, gmail, stripe, canEdit }: { initial: WholesaleSettingsInput; gmail: boolean; stripe: boolean; canEdit: boolean }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const set = <K extends keyof WholesaleSettingsInput>(k: K, val: WholesaleSettingsInput[K]) => { setV((x) => ({ ...x, [k]: val })); setSaved(false); };
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-[0.9375rem] font-semibold text-ink">Delivery run</h2>
        <div className="max-w-xs"><Label htmlFor="ws-day">Usual delivery day</Label>
          <Select id="ws-day" value={v.delivery_weekday} onChange={(e) => set("delivery_weekday", Number(e.target.value))} disabled={!canEdit}>{WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</Select></div>
        <p className="text-[0.75rem] text-ink-faint">No cut-off: anything ordered before the delivery day goes on that week&apos;s run; orders on the day go on the next one. Customers can have their own day.</p>
        <div className="max-w-xs"><Label htmlFor="ws-box" hint="for box labels">Coffee per box (kg)</Label>
          <Input id="ws-box" type="number" min={1} max={100} step="0.5" value={v.box_kg} onChange={(e) => set("box_kg", Number(e.target.value))} disabled={!canEdit} /></div>
        <p className="text-[0.75rem] text-ink-faint">Labels: one per box of coffee (e.g. 30 kg = 3 labels at 10 kg a box), plus one more box when an order has other items.</p>
      </section>
      <section className="space-y-3 border-t border-line pt-5">
        <h2 className="text-[0.9375rem] font-semibold text-ink">Orders from Ordermentum emails</h2>
        <label className="flex items-start gap-2 text-[0.8125rem] text-ink"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-500" checked={v.email_import} onChange={(e) => set("email_import", e.target.checked)} disabled={!canEdit} />
          <span>Read new orders from the order emails in Gmail <span className="text-ink-faint">(checked every 10 minutes)</span>{!gmail && <span className="block text-amber-700">Gmail isn&apos;t connected — connect it in Settings → Integrations.</span>}</span></label>
        {v.email_import && (
          <div className="grid max-w-xl gap-3 sm:grid-cols-2">
            <div><Label htmlFor="ws-from">From</Label><Input id="ws-from" type="email" value={v.import_from} onChange={(e) => set("import_from", e.target.value)} disabled={!canEdit} /></div>
            <div><Label htmlFor="ws-subj" hint="subject starts with">Subject</Label><Input id="ws-subj" value={v.import_subject} onChange={(e) => set("import_subject", e.target.value)} disabled={!canEdit} /></div>
          </div>
        )}
      </section>
      <section className="space-y-3 border-t border-line pt-5">
        <h2 className="text-[0.9375rem] font-semibold text-ink">Ordering online</h2>
        <label className="flex items-start gap-2 text-[0.8125rem] text-ink"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-500" checked={v.ordering} onChange={(e) => set("ordering", e.target.checked)} disabled={!canEdit} />
          <span>Customers can order on their ordering link<span className="block text-ink-faint">Each customer has a private link on their page. Card customers pay through Stripe when they order; account customers pay by invoice.</span>{!stripe && <span className="block text-amber-700">Stripe isn&apos;t connected, so card customers can&apos;t order yet.</span>}</span></label>
        <div className="grid max-w-xl gap-3 sm:grid-cols-2">
          <div><Label htmlFor="ws-freight" hint="ex GST, 0 = free">Freight per order $</Label><Input id="ws-freight" type="number" min={0} step="0.01" value={v.freight} onChange={(e) => set("freight", Number(e.target.value))} disabled={!canEdit} /></div>
          <div><Label htmlFor="ws-free" hint="ex GST, 0 = never">Free freight from $</Label><Input id="ws-free" type="number" min={0} step="0.01" value={v.free_freight_over} onChange={(e) => set("free_freight_over", Number(e.target.value))} disabled={!canEdit} /></div>
        </div>
      </section>
      <FormError message={err} />
      {canEdit && <div className="flex items-center gap-3"><Button variant="primary" disabled={pending} onClick={() => start(async () => { setErr(null); const r = await saveWholesaleSettings(v).catch(() => ({ ok: false as const, error: "Couldn't reach the server." })); if (!r.ok) setErr(r.error); else { setSaved(true); router.refresh(); } })}>{pending ? "Saving…" : "Save"}</Button>{saved && <span className="text-[0.75rem] text-emerald-700">Saved.</span>}</div>}
    </div>
  );
}
