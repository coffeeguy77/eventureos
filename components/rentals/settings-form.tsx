"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ImagePlus, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/form";
import { saveHireSettings } from "@/app/(app)/rentals/actions";
import type { Brand, HireSettings, RateUnit, ShopLook } from "@/lib/hire/core";
import { uploadPhoto } from "@/components/ui/photo-upload";

/** Hire settings: rate units, turnaround, grace, weekends, bonds, deposits, default times, quote expiry, delivery fee. */
export function HireSettingsForm({ initial, currency, shopUrl, orgId }: { initial: HireSettings; currency: string; shopUrl: string; orgId: string }) {
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
            <Input aria-label="Heading" maxLength={80} value={s.shop.heading ?? ""} onChange={(e) => set("shop", { ...s.shop, heading: e.target.value || null })} placeholder="Heading — Hire for your event" className="mt-2" />
            <textarea aria-label="Intro" rows={2} maxLength={600} value={s.shop.intro ?? ""} onChange={(e) => set("shop", { ...s.shop, intro: e.target.value || null })} placeholder="A line under the heading (optional)" className="mt-2 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-[0.8125rem]" />
            <ShopLookEditor orgId={orgId} look={s.shop} onChange={(shop) => set("shop", shop)} onError={(text) => setMsg({ ok: false, text })} />
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

/** The shop's look: logo size, a photo behind the date picker, and banner slides above it. */
function ShopLookEditor({ orgId, look, onChange, onError }: { orgId: string; look: ShopLook; onChange: (l: ShopLook) => void; onError: (m: string) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const heroRef = useRef<HTMLInputElement>(null);
  const slideRef = useRef<HTMLInputElement>(null);
  const up = async (which: "hero" | "slide", files: FileList | null) => {
    if (!files?.length) return;
    setBusy(which);
    try {
      if (which === "hero") onChange({ ...look, heroImage: await uploadPhoto(orgId, "shop", files[0], 2400) });
      else {
        const urls: string[] = [];
        for (const f of Array.from(files).slice(0, 8 - look.slides.length)) urls.push(await uploadPhoto(orgId, "shop", f, 2400));
        onChange({ ...look, slides: [...look.slides, ...urls.map((image) => ({ image, heading: null, text: null, link: null }))] });
      }
    } catch (e) { onError(e instanceof Error ? e.message : "Couldn't upload that photo."); }
    finally { setBusy(null); if (heroRef.current) heroRef.current.value = ""; if (slideRef.current) slideRef.current.value = ""; }
  };
  const slide = (i: number, patch: Partial<ShopLook["slides"][number]>) => onChange({ ...look, slides: look.slides.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const move = (i: number, d: number) => { const a = [...look.slides]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; onChange({ ...look, slides: a }); };
  return (
    <div className="mt-4 space-y-4 border-t border-line pt-4">
      <div><Label htmlFor="hs-logo">Logo size in the shop</Label>
        <Select id="hs-logo" value={look.logoSize} onChange={(e) => onChange({ ...look, logoSize: e.target.value as ShopLook["logoSize"] })} className="max-w-xs"><option value="md">Standard</option><option value="lg">Large</option><option value="xl">Extra large</option></Select></div>
      <div>
        <p className="text-[0.8125rem] font-medium text-ink">Photo behind the date picker</p>
        <p className="text-[0.75rem] text-ink-muted">Optional. Without one, your brand colour is used. A wide photo works best.</p>
        <input ref={heroRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => up("hero", e.target.files)} />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {look.heroImage && <img src={look.heroImage} alt="" className="h-16 w-28 rounded-md object-cover ring-1 ring-line" />}
          <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => heroRef.current?.click()}>{busy === "hero" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}{look.heroImage ? "Change photo" : "Add a photo"}</Button>
          {look.heroImage && <Button size="sm" variant="ghost" onClick={() => onChange({ ...look, heroImage: null })}><Trash2 className="h-4 w-4" />Remove</Button>}
        </div>
      </div>
      <div>
        <p className="text-[0.8125rem] font-medium text-ink">Scrolling banner</p>
        <p className="text-[0.75rem] text-ink-muted">Optional. Up to 8 slides across the top of the shop, each with a heading, a line and a link (e.g. to an item&apos;s page).</p>
        <input ref={slideRef} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={(e) => up("slide", e.target.files)} />
        <div className="mt-2 space-y-3">
          {look.slides.map((x, i) => (
            <div key={x.image} className="flex flex-col gap-2 rounded-lg bg-surface p-2 ring-1 ring-line sm:flex-row">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={x.image} alt="" className="h-20 w-full shrink-0 rounded-md object-cover sm:w-36" />
              <div className="grid min-w-0 flex-1 gap-2">
                <Input aria-label="Slide heading" maxLength={120} value={x.heading ?? ""} onChange={(e) => slide(i, { heading: e.target.value || null })} placeholder="Heading (optional)" />
                <Input aria-label="Slide text" maxLength={240} value={x.text ?? ""} onChange={(e) => slide(i, { text: e.target.value || null })} placeholder="A line of text (optional)" />
                <Input aria-label="Slide link" maxLength={500} value={x.link ?? ""} onChange={(e) => slide(i, { link: e.target.value || null })} placeholder="Link (optional) — https://… or /hire/…" />
              </div>
              <div className="flex gap-1 sm:flex-col">
                <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="grid h-8 w-8 place-items-center rounded-lg text-ink-faint hover:bg-canvas disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                <button type="button" aria-label="Move down" disabled={i === look.slides.length - 1} onClick={() => move(i, 1)} className="grid h-8 w-8 place-items-center rounded-lg text-ink-faint hover:bg-canvas disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                <button type="button" aria-label="Remove slide" onClick={() => onChange({ ...look, slides: look.slides.filter((_, j) => j !== i) })} className="grid h-8 w-8 place-items-center rounded-lg text-ink-faint hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
          {look.slides.length < 8 && <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => slideRef.current?.click()}>{busy === "slide" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Add slides</Button>}
        </div>
      </div>
      <p className="text-[0.75rem] text-ink-faint">Press Save settings to publish changes.</p>
    </div>
  );
}
