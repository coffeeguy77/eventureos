"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/form";
import { labourLines, type MachineModel, type MachineSettings } from "@/lib/machines/core";
import { saveMachineModel, saveMachineSettings } from "@/app/(app)/machines/actions";

const lines = (v: string) => v.split(/\n|,/).map((x) => x.trim()).filter(Boolean);
const money = (n: number) => `$${n.toFixed(2)}`;

export function MachineSettingsForm({ initial, slug }: { initial: MachineSettings; slug: string }) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [ns, setNs] = useState(initial.notServiced.join(", "));
  const [cats, setCats] = useState(initial.priceCategories.join("\n"));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = (p: Partial<MachineSettings>) => setS((o) => ({ ...o, ...p }));
  const n = (k: "calloutFirstHour" | "hourly" | "gstPct", label: string) => (
    <div><Label htmlFor={`ms-${k}`}>{label}</Label><Input id={`ms-${k}`} type="number" min={0} step="0.01" value={s[k]} onChange={(e) => set({ [k]: Number(e.target.value) } as Partial<MachineSettings>)} /></div>
  );
  const ex = (h: number) => labourLines(h, true, s).reduce((a, l) => a + l.qty * l.unit_inc, 0);
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Your website" subtitle="Two pages on your events website, with their own tabs." />
        <div className="space-y-3 border-t border-line px-5 py-4 text-[0.875rem]">
          <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4" checked={s.enabled} onChange={(e) => set({ enabled: e.target.checked })} />Coffee machines page (machines for sale and the machine chooser) — <a className="text-brand-700 underline" href={`/hire/${slug}/machines`} target="_blank" rel="noreferrer">view</a></label>
          <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4" checked={s.serviceEnabled} onChange={(e) => set({ serviceEnabled: e.target.checked })} />Repairs &amp; servicing page (with the enquiry form) — <a className="text-brand-700 underline" href={`/hire/${slug}/repairs`} target="_blank" rel="noreferrer">view</a></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor="ms-agent" hint="e.g. Dr Coffee">Authorised agent for</Label><Input id="ms-agent" value={s.agentOf ?? ""} onChange={(e) => set({ agentOf: e.target.value || null })} /></div>
            <div><Label htmlFor="ms-area" hint="Where you sell and service">Area</Label><Input id="ms-area" value={s.area ?? ""} onChange={(e) => set({ area: e.target.value || null })} placeholder="e.g. Canberra & Queanbeyan" /></div>
            <div className="sm:col-span-2"><Label htmlFor="ms-intro">Machines page intro</Label><Textarea id="ms-intro" rows={2} value={s.intro ?? ""} onChange={(e) => set({ intro: e.target.value || null })} /></div>
            <div className="sm:col-span-2"><Label htmlFor="ms-sintro">Repairs page intro</Label><Textarea id="ms-sintro" rows={2} value={s.serviceIntro ?? ""} onChange={(e) => set({ serviceIntro: e.target.value || null })} /></div>
            <div className="sm:col-span-2"><Label htmlFor="ms-ns" hint="Comma between brands. Shown loudly on the page, and the form won't send for them.">Brands you DON'T service</Label><Input id="ms-ns" value={ns} onChange={(e) => setNs(e.target.value)} placeholder="e.g. Breville" /></div>
          </div>
        </div>
      </Card>
      <Card>
        <CardHeader title="Service rates" subtitle={`Examples: 30 min callout ${money(ex(0.5))} · 2 hours ${money(ex(2))} (inc GST)`} />
        <div className="grid gap-3 border-t border-line px-5 py-4 sm:grid-cols-3">
          {n("calloutFirstHour", "Callout incl. first hour ($)")}
          {n("hourly", "Each hour after ($)")}
          <div><Label htmlFor="ms-inc">Billed in steps of</Label><Select id="ms-inc" value={s.incrementMin} onChange={(e) => set({ incrementMin: Number(e.target.value) })}>{[5, 6, 10, 15, 30, 60].map((m) => <option key={m} value={m}>{m} minutes</option>)}</Select></div>
          {n("gstPct", "GST %")}
          <label className="flex items-center gap-2 text-[0.875rem] sm:col-span-2 sm:mt-6"><input type="checkbox" className="h-4 w-4" checked={s.ratesIncGst} onChange={(e) => set({ ratesIncGst: e.target.checked })} />These rates already include GST</label>
        </div>
      </Card>
      <Card>
        <CardHeader title="Shop and price list" />
        <div className="grid gap-3 border-t border-line px-5 py-4 sm:grid-cols-2">
          <div><Label htmlFor="ms-cat" hint="Products in this shop category show 'Enquire' instead of 'Add to cart'">Shop category for machines</Label><Input id="ms-cat" value={s.shopCategory} onChange={(e) => set({ shopCategory: e.target.value })} /></div>
          <div><Label htmlFor="ms-pc" hint="One per line — shown on the Price list tab and first when adding items">Price list categories</Label><Textarea id="ms-pc" rows={5} value={cats} onChange={(e) => setCats(e.target.value)} /></div>
        </div>
      </Card>
      <div className="flex items-center gap-3">
        <Button variant="primary" disabled={pending} onClick={() => start(async () => {
          setMsg(null);
          const r = await saveMachineSettings({ ...s, notServiced: lines(ns), priceCategories: cats.split("\n").map((x) => x.trim()).filter(Boolean) });
          setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error });
          if (r.ok) router.refresh();
        })}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Save settings</Button>
        {msg && <span className={`text-[0.8125rem] ${msg.ok ? "text-emerald-700" : "text-rose-600"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}

const blankModel = (slug: string): MachineModel => ({ slug, cups: 50, milk: "fresh", water: "tank", steamWand: false, twoMilks: false, widthMm: null, depthMm: null, heightMm: null, weightKg: null, screen: null, bestFor: null, highlights: [] });

/** The facts the machine chooser uses, one machine at a time (matched to the shop product). */
export function ModelFacts({ product, model }: { product: { slug: string; name: string }; model: MachineModel | null }) {
  const router = useRouter();
  const [m, setM] = useState<MachineModel>(model ?? blankModel(product.slug));
  const [hl, setHl] = useState((model?.highlights ?? []).join("\n"));
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (p: Partial<MachineModel>) => setM((o) => ({ ...o, ...p }));
  const mm = (k: "widthMm" | "depthMm" | "heightMm" | "weightKg", label: string) => (
    <div><Label htmlFor={`mf-${product.slug}-${k}`}>{label}</Label><Input id={`mf-${product.slug}-${k}`} type="number" min={0} value={m[k] ?? ""} onChange={(e) => set({ [k]: e.target.value === "" ? null : Number(e.target.value) } as Partial<MachineModel>)} /></div>
  );
  return (
    <div className="px-4 py-3">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 text-left">
        <span className="min-w-0 flex-1 truncate text-[0.875rem] font-medium text-ink">{product.name}</span>
        <span className="text-[0.75rem] text-ink-muted">{model ? `${model.cups}/day · ${model.milk} milk · ${model.water === "both" ? "tank or plumbed" : model.water}` : <span className="text-amber-700">Not in the chooser yet</span>}</span>
      </button>
      {open && (
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <div><Label htmlFor={`mf-${product.slug}-cups`}>Coffees a day</Label><Input id={`mf-${product.slug}-cups`} type="number" min={1} value={m.cups} onChange={(e) => set({ cups: Number(e.target.value) })} /></div>
          <div><Label htmlFor={`mf-${product.slug}-milk`}>Milk</Label><Select id={`mf-${product.slug}-milk`} value={m.milk} onChange={(e) => set({ milk: e.target.value as MachineModel["milk"] })}><option value="fresh">Fresh</option><option value="powder">Powdered</option><option value="both">Fresh or powdered</option></Select></div>
          <div><Label htmlFor={`mf-${product.slug}-water`}>Water</Label><Select id={`mf-${product.slug}-water`} value={m.water} onChange={(e) => set({ water: e.target.value as MachineModel["water"] })}><option value="tank">Tank</option><option value="plumbed">Plumbed</option><option value="both">Tank or plumbed</option></Select></div>
          <div><Label htmlFor={`mf-${product.slug}-screen`}>Screen</Label><Input id={`mf-${product.slug}-screen`} value={m.screen ?? ""} onChange={(e) => set({ screen: e.target.value || null })} placeholder='e.g. 10.1"' /></div>
          {mm("widthMm", "Width (mm)")}{mm("depthMm", "Depth (mm)")}{mm("heightMm", "Height (mm)")}{mm("weightKg", "Weight (kg)")}
          <label className="flex items-center gap-2 text-[0.8125rem]"><input type="checkbox" className="h-4 w-4" checked={m.steamWand} onChange={(e) => set({ steamWand: e.target.checked })} />Steam wand</label>
          <label className="flex items-center gap-2 text-[0.8125rem]"><input type="checkbox" className="h-4 w-4" checked={m.twoMilks} onChange={(e) => set({ twoMilks: e.target.checked })} />Two milks at once</label>
          <div className="sm:col-span-2"><Label htmlFor={`mf-${product.slug}-best`}>Best for</Label><Input id={`mf-${product.slug}-best`} value={m.bestFor ?? ""} onChange={(e) => set({ bestFor: e.target.value || null })} /></div>
          <div className="sm:col-span-4"><Label htmlFor={`mf-${product.slug}-hl`} hint="One per line">Highlights</Label><Textarea id={`mf-${product.slug}-hl`} rows={3} value={hl} onChange={(e) => setHl(e.target.value)} /></div>
          <div className="flex items-center gap-2 sm:col-span-4">
            <Button size="sm" variant="primary" disabled={pending} onClick={() => start(async () => { const r = await saveMachineModel({ ...m, highlights: hl.split("\n").map((x) => x.trim()).filter(Boolean) }); setMsg(r.ok ? "Saved." : r.error); if (r.ok) router.refresh(); })}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Save</Button>
            {model && <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => { const r = await saveMachineModel(m, true); setMsg(r.ok ? "Taken out of the chooser." : r.error); if (r.ok) router.refresh(); })}>Take out of the chooser</Button>}
            {msg && <span className="text-[0.8125rem] text-ink-muted">{msg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
