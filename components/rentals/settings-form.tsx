"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/form";
import { saveHireSettings } from "@/app/(app)/rentals/actions";
import type { HireSettings, RateUnit } from "@/lib/hire/core";

/** Hire settings: rate units, turnaround, grace, weekends, bonds, deposits, default times, quote expiry, delivery fee. */
export function HireSettingsForm({ initial, currency }: { initial: HireSettings; currency: string }) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [units, setUnits] = useState<RateUnit[]>(initial.units);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof HireSettings>(k: K, v: HireSettings[K]) => setS((o) => ({ ...o, [k]: v }));
  return (
    <>
      <Card className="p-5">
        <p className="text-[0.8438rem] font-semibold text-ink">Rate units</p>
        <p className="mt-0.5 text-[0.75rem] text-ink-muted">The prices each item can have. Hours of 0 means a flat price per hire. Bookings are charged the cheapest mix of an item&apos;s rates.</p>
        <div className="mt-3 space-y-2">
          {units.map((u, i) => (
            <div key={u.key || i} className="flex items-center gap-2">
              <Input aria-label="Name" value={u.label} maxLength={40} onChange={(e) => setUnits(units.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} className="flex-1" />
              <Input aria-label="Hours" type="number" min={0} step="0.5" value={u.hours} onChange={(e) => setUnits(units.map((x, j) => (j === i ? { ...x, hours: Number(e.target.value) } : x)))} className="w-24" />
              <span className="w-10 text-[0.75rem] text-ink-faint">hours</span>
              <button type="button" aria-label={`Remove ${u.label}`} onClick={() => setUnits(units.filter((_, j) => j !== i))} className="grid h-8 w-8 place-items-center rounded-lg text-ink-faint hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setUnits([...units, { key: "", label: "", hours: 24 }])}><Plus className="h-4 w-4" />Add a unit</Button>
          <p className="text-[0.75rem] text-ink-faint">Removing a unit removes that rate from items next time they&apos;re saved.</p>
        </div>
      </Card>
      <Card className="p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label htmlFor="hs-buf" hint="between hires">Turnaround (hours)</Label><Input id="hs-buf" type="number" min={0} step="0.5" value={s.bufferHours} onChange={(e) => set("bufferHours", Number(e.target.value))} /></div>
          <div><Label htmlFor="hs-grace" hint="free late return">Grace (hours)</Label><Input id="hs-grace" type="number" min={0} step="0.5" value={s.graceHours} onChange={(e) => set("graceHours", Number(e.target.value))} /></div>
          <div><Label htmlFor="hs-start">Default start time</Label><Input id="hs-start" type="time" value={s.defaultStart} onChange={(e) => set("defaultStart", e.target.value)} /></div>
          <div><Label htmlFor="hs-end">Default end time</Label><Input id="hs-end" type="time" value={s.defaultEnd} onChange={(e) => set("defaultEnd", e.target.value)} /></div>
          <div><Label htmlFor="hs-bond">Bond on a booking</Label><Select id="hs-bond" value={s.bondMode} onChange={(e) => set("bondMode", e.target.value === "max" ? "max" : "sum")}><option value="sum">Add up every item&apos;s bond</option><option value="max">The largest single bond</option></Select></div>
          <div><Label htmlFor="hs-dep" hint="0 = none">Deposit to book (%)</Label><Input id="hs-dep" type="number" min={0} max={100} value={s.depositPct} onChange={(e) => set("depositPct", Number(e.target.value))} /></div>
          <div><Label htmlFor="hs-qd">Quotes valid for (days)</Label><Input id="hs-qd" type="number" min={1} max={365} value={s.quoteDays} onChange={(e) => set("quoteDays", Number(e.target.value))} /></div>
          <div><Label htmlFor="hs-del" hint={currency}>Default delivery fee</Label><Input id="hs-del" type="number" min={0} step="0.01" value={s.deliveryFee} onChange={(e) => set("deliveryFee", Number(e.target.value))} /></div>
          <label className="flex items-center gap-2 text-[0.8125rem] text-ink sm:col-span-2"><input type="checkbox" checked={s.excludeWeekends} onChange={(e) => set("excludeWeekends", e.target.checked)} />Don&apos;t charge Saturdays and Sundays in the middle of a hire</label>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
          {msg && <p className={`text-[0.8125rem] ${msg.ok ? "text-emerald-700" : "text-rose-600"}`} role="status">{msg.text}</p>}
          <Button variant="primary" disabled={pending} onClick={() => start(async () => {
            setMsg(null);
            const r = await saveHireSettings({ ...s, units });
            setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error });
            if (r.ok) router.refresh();
          })}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Save settings</Button>
        </div>
      </Card>
    </>
  );
}
