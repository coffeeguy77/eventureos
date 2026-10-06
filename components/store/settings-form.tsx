"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { saveShopSettings } from "@/app/(app)/store/actions";
import { frequencyLabel, WEEKDAYS, type IntervalUnit, type ShopSettings } from "@/lib/shop/core";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/form";
import { Card } from "@/components/ui/card";
import { PhotoUpload } from "@/components/bookings/course-tools";

export function ShopSettingsForm({ orgId, initial, shopUrl }: { orgId: string; initial: ShopSettings; shopUrl: string }) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof ShopSettings>(k: K, v: ShopSettings[K]) => setS({ ...s, [k]: v });
  const days = (k: "roastDays" | "dispatchDays") => (
    <div className="flex flex-wrap gap-1.5">{[1, 2, 3, 4, 5, 6, 7].map((d) => { const on = s[k].includes(d); return <button key={d} type="button" onClick={() => set(k, on ? s[k].filter((x) => x !== d) : [...s[k], d].sort())} className={`h-9 rounded-lg px-3 text-[0.8125rem] font-medium ring-1 ${on ? "bg-ink text-white ring-ink" : "bg-surface text-ink-muted ring-line-strong"}`}>{WEEKDAYS[d].slice(0, 3)}</button>; })}</div>
  );
  const [nf, setNf] = useState<{ unit: IntervalUnit; count: number }>({ unit: "week", count: 5 });
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card className="space-y-4 p-5">
        <label className="flex items-center gap-2.5 text-[0.9375rem] font-semibold text-ink"><input type="checkbox" checked={s.enabled} onChange={(e) => set("enabled", e.target.checked)} className="h-5 w-5" />Shop is open</label>
        <p className="-mt-2 text-[0.8125rem] text-ink-muted">Your shop: <a href={shopUrl} target="_blank" rel="noreferrer" className="font-medium text-ink underline">{shopUrl}</a></p>
        <div><Label htmlFor="ss-t">Shop heading</Label><Input id="ss-t" value={s.title} onChange={(e) => set("title", e.target.value)} /></div>
        <div><Label htmlFor="ss-tg">Tagline</Label><Input id="ss-tg" value={s.tagline} onChange={(e) => set("tagline", e.target.value)} /></div>
        <div><Label htmlFor="ss-h">Hero photo</Label><div className="flex gap-2"><Input id="ss-h" value={s.heroImage ?? ""} onChange={(e) => set("heroImage", e.target.value || null)} placeholder="https://…" /><PhotoUpload orgId={orgId} folder="shop" onUploaded={(u) => set("heroImage", u)} /></div></div>
        <div><Label htmlFor="ss-si" hint="subscriptions page and the gift-subscription panel — e.g. your delivery box">Subscriptions photo</Label><div className="flex gap-2"><Input id="ss-si" value={s.subsImage ?? ""} onChange={(e) => set("subsImage", e.target.value || null)} placeholder="https://…" /><PhotoUpload orgId={orgId} folder="shop" onUploaded={(u) => set("subsImage", u)} /></div></div>
        <div><Label htmlFor="ss-ri" hint="shows “Locally roasted in …” — leave blank to hide">Roasted in</Label><Input id="ss-ri" value={s.roastedIn} onChange={(e) => set("roastedIn", e.target.value)} placeholder="e.g. Canberra" /></div>
        <div><Label htmlFor="ss-rn" hint="shown on every page and in emails">Roast & delivery message</Label><Textarea id="ss-rn" value={s.roastNote} onChange={(e) => set("roastNote", e.target.value)} /></div>
        <div><Label>Roast days</Label>{days("roastDays")}</div>
        <div><Label hint="subscriptions are scheduled on these days">Ship days</Label>{days("dispatchDays")}</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label htmlFor="ss-c">Carrier</Label><Input id="ss-c" value={s.carrier} onChange={(e) => set("carrier", e.target.value)} placeholder="e.g. Australia Post" /></div>
          <div><Label htmlFor="ss-l" hint="days after ordering">Earliest ship</Label><Input id="ss-l" type="number" min={0} max={14} value={s.leadDays} onChange={(e) => set("leadDays", Number(e.target.value))} /></div>
        </div>
      </Card>
      <Card className="space-y-4 p-5">
        <h2 className="font-semibold text-ink">Shipping</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label htmlFor="ss-fr">Flat rate per parcel ($)</Label><Input id="ss-fr" type="number" min={0} step="0.01" value={s.flatRate} onChange={(e) => set("flatRate", Number(e.target.value))} /></div>
          <div><Label htmlFor="ss-fo" hint="blank = never free">Free shipping over ($)</Label><Input id="ss-fo" type="number" min={0} value={s.freeOver ?? ""} onChange={(e) => set("freeOver", e.target.value === "" ? null : Number(e.target.value))} /></div>
        </div>
        <label className="flex items-center gap-2 text-[0.8438rem]"><input type="checkbox" checked={s.pickup} onChange={(e) => set("pickup", e.target.checked)} />Offer free pick up</label>
        {s.pickup && <div><Label htmlFor="ss-pn">Pick-up details</Label><Input id="ss-pn" value={s.pickupNote ?? ""} onChange={(e) => set("pickupNote", e.target.value || null)} placeholder="Address and hours" /></div>}
        <label className="flex items-center gap-2 text-[0.8438rem]"><input type="checkbox" checked={s.eventAddon} onChange={(e) => set("eventAddon", e.target.checked)} />Let event / equipment-hire customers add coffee (delivered with their booking)</label>
        <h2 className="pt-2 font-semibold text-ink">Subscriptions</h2>
        <div><Label htmlFor="ss-sd">Subscriber discount (%)</Label><Input id="ss-sd" type="number" min={0} max={90} value={s.subDiscount} onChange={(e) => set("subDiscount", Number(e.target.value))} /></div>
        <div><Label hint="extra % off on top of the subscriber price">Prepaid packages</Label>
          <div className="grid gap-2 sm:grid-cols-3">{([3, 6, 12] as const).map((m) => { const pp = s.prepaid.find((x) => x.months === m); return (
            <div key={m} className="rounded-lg border border-line p-2.5 text-[0.8125rem]"><label className="flex items-center gap-1.5 font-medium"><input type="checkbox" checked={!!pp} onChange={(e) => set("prepaid", e.target.checked ? [...s.prepaid, { months: m, discount: 0 }].sort((a, b) => a.months - b.months) : s.prepaid.filter((x) => x.months !== m))} />{m} months</label>
              {pp && <div className="mt-1.5 flex items-center gap-1">+<Input type="number" min={0} max={50} value={pp.discount} onChange={(e) => set("prepaid", s.prepaid.map((x) => (x.months === m ? { ...x, discount: Number(e.target.value) } : x)))} className="h-8 w-16" />%</div>}</div>
          ); })}</div></div>
        <div><Label hint="customers can still pick any number">Quick frequency choices</Label>
          <div className="flex flex-wrap gap-1.5">{s.frequencies.map((f, i) => <span key={i} className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-[0.8125rem]">{frequencyLabel(f.unit, f.count)}<button type="button" onClick={() => set("frequencies", s.frequencies.filter((_, k) => k !== i))} aria-label="Remove"><Trash2 className="h-3 w-3" /></button></span>)}
            <span className="inline-flex items-center gap-1 text-[0.8125rem]"><Input type="number" min={1} max={26} value={nf.count} onChange={(e) => setNf({ ...nf, count: Number(e.target.value) })} className="h-8 w-14" />
              <select value={nf.unit} onChange={(e) => setNf({ ...nf, unit: e.target.value as IntervalUnit })} className="h-8 rounded-md border border-line-strong bg-surface px-1"><option value="week">weeks</option><option value="month">months</option></select>
              <button type="button" onClick={() => set("frequencies", [...s.frequencies, nf])} className="grid h-8 w-8 place-items-center rounded-md bg-ink text-white" aria-label="Add"><Plus className="h-4 w-4" /></button></span></div></div>
      </Card>
      <Card className="space-y-4 p-5">
        <h2 className="font-semibold text-ink">Coffee gift cards</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label htmlFor="ss-ga" hint="comma separated">Amounts ($)</Label><Input id="ss-ga" defaultValue={s.giftAmounts.join(", ")} onBlur={(e) => set("giftAmounts", e.target.value.split(/[,\s]+/).map(Number).filter((n) => n > 0))} /></div>
          <div><Label htmlFor="ss-ge">Valid for (months)</Label><Input id="ss-ge" type="number" min={1} max={120} value={s.giftExpiryMonths} onChange={(e) => set("giftExpiryMonths", Number(e.target.value))} /></div>
        </div>
        <div><Label htmlFor="ss-gt">Script line on the card</Label><Input id="ss-gt" value={s.giftTagline} onChange={(e) => set("giftTagline", e.target.value)} /></div>
        <div><Label htmlFor="ss-gc" hint="blank artwork — the wording is printed on top">Card artwork</Label><div className="flex gap-2"><Input id="ss-gc" value={s.giftCardArt ?? ""} onChange={(e) => set("giftCardArt", e.target.value || null)} placeholder="https://…" /><PhotoUpload orgId={orgId} folder="shop" onUploaded={(u) => set("giftCardArt", u)} /></div></div>
      </Card>
      <Card className="space-y-3 p-5">
        <h2 className="font-semibold text-ink">Grind guide</h2>
        <div><Label htmlFor="ss-gr">Your grinder</Label><Input id="ss-gr" value={s.grinder} onChange={(e) => set("grinder", e.target.value)} placeholder="e.g. Mahlkönig EK43" /></div>
        <p className="text-[0.8125rem] text-ink-muted">Finest at the top. Set the dial numbers you actually use.</p>
        {s.grindChart.map((g, i) => (
          <div key={i} className="grid grid-cols-[1fr_90px_1.4fr_auto] gap-2">
            <Input aria-label="Grind" value={g.label} onChange={(e) => set("grindChart", s.grindChart.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))} />
            <Input aria-label="Dial" value={g.dial} onChange={(e) => set("grindChart", s.grindChart.map((x, k) => (k === i ? { ...x, dial: e.target.value } : x)))} />
            <Input aria-label="Used for" value={g.use} onChange={(e) => set("grindChart", s.grindChart.map((x, k) => (k === i ? { ...x, use: e.target.value } : x)))} />
            <button type="button" onClick={() => set("grindChart", s.grindChart.filter((_, k) => k !== i))} className="grid h-9 w-9 place-items-center rounded-lg text-ink-faint hover:bg-zinc-100" aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
        <Button type="button" size="sm" variant="secondary" onClick={() => set("grindChart", [...s.grindChart, { label: "", dial: "", use: "" }])}><Plus className="h-4 w-4" />Add row</Button>
      </Card>
      <div className="flex items-center gap-3 xl:col-span-2">
        <Button type="button" variant="primary" disabled={pending} onClick={() => start(async () => { const r = await saveShopSettings(s); setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error }); router.refresh(); })}>Save settings</Button>
        {msg && <span className={msg.ok ? "text-[0.8125rem] text-emerald-700" : "text-[0.8125rem] text-rose-700"}>{msg.text}</span>}
      </div>
    </div>
  );
}
