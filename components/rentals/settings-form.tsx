"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/form";
import { saveHireSettings } from "@/app/(app)/rentals/actions";
import type { Brand, HireSettings, RateUnit } from "@/lib/hire/core";

/** Hire settings: rate units, turnaround, grace, weekends, bonds, deposits, default times, quote expiry, delivery fee. */
export function HireSettingsForm({ initial, currency, shopUrl }: { initial: HireSettings; currency: string; shopUrl: string }) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [units, setUnits] = useState<RateUnit[]>(initial.units);
  const [brands, setBrands] = useState<Brand[]>(initial.brands);
  const [zone, setZone] = useState(initial.deliveryZone ?? { label: "", fee: initial.deliveryFee, states: [] as string[] });
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
        <p className="text-[0.8438rem] font-semibold text-ink">Brands</p>
        <p className="mt-0.5 text-[0.75rem] text-ink-muted">If you trade under more than one name from this account, add them here and choose each item&apos;s brand. The first is your main business.</p>
        <div className="mt-3 space-y-2">
          {brands.map((b, i) => (
            <div key={b.key || i} className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1fr)_auto]">
              <Input aria-label="Brand name" value={b.name} maxLength={120} onChange={(e) => setBrands(brands.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder={i === 0 ? "Main business" : "Brand name"} />
              <Input aria-label="Brand email" value={b.email ?? ""} onChange={(e) => setBrands(brands.map((x, j) => (j === i ? { ...x, email: e.target.value || null } : x)))} placeholder="Email (optional)" />
              <Input aria-label="Brand phone" value={b.phone ?? ""} onChange={(e) => setBrands(brands.map((x, j) => (j === i ? { ...x, phone: e.target.value || null } : x)))} placeholder="Phone (optional)" />
              <button type="button" aria-label={`Remove ${b.name}`} disabled={i === 0 && brands.length > 1} onClick={() => setBrands(brands.filter((_, j) => j !== i))} className="grid h-9 w-9 place-items-center rounded-lg text-ink-faint hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setBrands([...brands, { key: "", name: "", email: null, phone: null }])}><Plus className="h-4 w-4" />Add a brand</Button>
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
          <div className="sm:col-span-2 rounded-lg bg-zinc-50 p-3">
            <p className="text-[0.8125rem] font-medium text-ink">Delivery area for online bookings</p>
            <p className="text-[0.75rem] text-ink-muted">Addresses in these states are charged this delivery fee automatically. Anywhere else, the fee is quoted.</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <Input aria-label="States" placeholder="States, e.g. ACT" value={zone.states.join(", ")} onChange={(e) => setZone({ ...zone, states: e.target.value.toUpperCase().split(/[^A-Z]+/).filter(Boolean).slice(0, 8) })} />
              <Input aria-label="Area name" placeholder="Name, e.g. Canberra" value={zone.label} onChange={(e) => setZone({ ...zone, label: e.target.value })} />
              <Input aria-label="Fee" type="number" min={0} step="0.01" value={zone.fee} onChange={(e) => setZone({ ...zone, fee: Number(e.target.value) })} />
            </div>
          </div>
          <div className="sm:col-span-2 rounded-lg bg-zinc-50 p-3">
            <p className="text-[0.8125rem] font-medium text-ink">Online hire shop</p>
            <p className="text-[0.75rem] text-ink-muted">Customers pick dates, see what&apos;s free and the price, and send a booking. Address: <a href={shopUrl} target="_blank" rel="noreferrer" className="font-medium text-brand-700 underline">{shopUrl}</a></p>
            <label className="mt-2 flex items-center gap-2 text-[0.8125rem] text-ink"><input type="checkbox" checked={s.shop.enabled} onChange={(e) => set("shop", { ...s.shop, enabled: e.target.checked })} />Show the hire shop</label>
            <label className="mt-1 flex items-center gap-2 text-[0.8125rem] text-ink"><input type="checkbox" checked={s.shop.instantBook} onChange={(e) => set("shop", { ...s.shop, instantBook: e.target.checked })} />Let customers book instantly by paying the deposit (when everything&apos;s free and the address is in your delivery area)</label>
            <textarea aria-label="Intro" rows={2} maxLength={600} value={s.shop.intro ?? ""} onChange={(e) => set("shop", { ...s.shop, intro: e.target.value || null })} placeholder="A line at the top of the shop (optional)" className="mt-2 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-[0.8125rem]" />
          </div>
          <label className="flex items-center gap-2 text-[0.8125rem] text-ink sm:col-span-2"><input type="checkbox" checked={s.excludeWeekends} onChange={(e) => set("excludeWeekends", e.target.checked)} />Don&apos;t charge Saturdays and Sundays in the middle of a hire</label>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
          {msg && <p className={`text-[0.8125rem] ${msg.ok ? "text-emerald-700" : "text-rose-600"}`} role="status">{msg.text}</p>}
          <Button variant="primary" disabled={pending} onClick={() => start(async () => {
            setMsg(null);
            const r = await saveHireSettings({ ...s, units, brands: brands.filter((b) => b.name.trim()), deliveryZone: zone.states.length ? zone : null });
            setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error });
            if (r.ok) router.refresh();
          })}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Save settings</Button>
        </div>
      </Card>
    </>
  );
}
