"use client";
import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, ExternalLink, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/form";
import { HIRE_KINDS, SLOTS, type CateringSettings, type DrinkGroup, type EventsSettings, type HireKind, type Slot } from "@/lib/events/core";
import { saveEventsSettings } from "@/app/(app)/website/actions";

const KIND_NAME: Record<HireKind, string> = { cart: "Coffee carts", van: "Coffee van", diy: "Equipment only" };
const IMG: { key: keyof EventsSettings["images"]; label: string }[] = [
  { key: "hero", label: "Events page banner" }, { key: "cart", label: "Coffee cart photo" }, { key: "van", label: "Coffee van photo" },
  { key: "diy", label: "Equipment photo" }, { key: "branding", label: "Branded cart photo" }, { key: "drinks", label: "Drinks feature photo" }, { key: "catering", label: "Catering photo" },
  { key: "band", label: "“Lock in your date” band (wide)" }, { key: "contact", label: "Contact section photo" },
];

export function EventsForm({ initial, packages, slug, base, menus }: { initial: EventsSettings; packages: { id: string; name: string }[]; slug: string; base: string; menus: string[] }) {
  const [v, setV] = useState<EventsSettings>(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof EventsSettings>(k: K, val: EventsSettings[K]) => setV({ ...v, [k]: val });
  const setDrink = (gi: number, g: DrinkGroup) => set("drinks", v.drinks.map((x, i) => (i === gi ? g : x)));
  const cat = v.catering;
  const setCat = (patch: Partial<CateringSettings>) => set("catering", { ...cat, ...patch });
  const setSlotMenus = (sl: Slot, list: string[]) => setCat({ slots: { ...cat.slots, [sl]: list } });
  const save = () => start(async () => { const r = await saveEventsSettings(v); setMsg(r.ok ? { ok: true, text: r.data } : { ok: false, text: r.error }); });

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-ink">Events pages</h2>
            <p className="mt-0.5 max-w-xl text-[0.8125rem] text-ink-muted">Event hire, the quote builder, coffee cart / van pages for search, the drinks menu, branding and catering. Customers never see prices in the quote builder — you get a draft quote to check and send.</p>
          </div>
          <label className="flex items-center gap-2 text-[0.8438rem] font-medium">
            <input type="checkbox" className="h-4 w-4" checked={v.enabled} onChange={(e) => set("enabled", e.target.checked)} />Pages live
          </label>
        </div>
        {v.enabled && <a href={`${base}/hire/${slug}`} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-[0.8125rem] font-medium text-brand-600 hover:underline">Open the events page<ExternalLink className="h-3.5 w-3.5" /></a>}
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><Label htmlFor="ev-h" hint='Put | where you want a line break'>Heading</Label><Input id="ev-h" value={v.heading} onChange={(e) => set("heading", e.target.value)} /></div>
          <div className="sm:col-span-2"><Label htmlFor="ev-i">Intro</Label><Textarea id="ev-i" value={v.intro} onChange={(e) => set("intro", e.target.value)} /></div>
          <div><Label htmlFor="ev-c" hint="Used in page titles, e.g. Coffee Cart Hire Canberra">City</Label><Input id="ev-c" value={v.city} onChange={(e) => set("city", e.target.value)} /></div>
          <div><Label htmlFor="ev-a" hint="Comma separated">Areas you cover</Label><Input id="ev-a" value={v.areas.join(", ")} onChange={(e) => set("areas", e.target.value.split(",").map((x) => x.trim()).filter(Boolean))} placeholder="Queanbeyan, Belconnen, Tuggeranong" /></div>
          <div><Label htmlFor="ev-l" hint="Under this = tentative">Days notice to lock in a date</Label><Input id="ev-l" type="number" min={0} max={60} value={v.leadDays} onChange={(e) => set("leadDays", Number(e.target.value))} /></div>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold text-ink">What you hire out</h2>
        <p className="mt-0.5 text-[0.8125rem] text-ink-muted">How many you have decides availability in the quote builder. Set 0 to hide one. Prices come from the package in Settings → Services &amp; pricing.</p>
        <div className="mt-4 space-y-4">
          {HIRE_KINDS.map((k) => (
            <div key={k} className="grid gap-3 rounded-lg border border-line p-4 sm:grid-cols-[110px_1fr_1fr]">
              <div><Label htmlFor={`ev-n-${k}`}>{KIND_NAME[k]}</Label><Input id={`ev-n-${k}`} type="number" min={0} max={50} value={v.fleet[k]} onChange={(e) => set("fleet", { ...v.fleet, [k]: Math.max(0, Number(e.target.value)) })} /></div>
              <div><Label htmlFor={`ev-lb-${k}`}>Name on the website</Label><Input id={`ev-lb-${k}`} value={v.labels[k]} onChange={(e) => set("labels", { ...v.labels, [k]: e.target.value })} /></div>
              <div><Label htmlFor={`ev-p-${k}`}>Price list package</Label>
                <Select id={`ev-p-${k}`} value={v.packages[k] ?? ""} onChange={(e) => set("packages", { ...v.packages, [k]: e.target.value || undefined })}>
                  <option value="">Match by name</option>
                  {packages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select></div>
              <div className="sm:col-span-3"><Label htmlFor={`ev-b-${k}`}>Short description</Label><Input id={`ev-b-${k}`} value={v.blurbs[k]} onChange={(e) => set("blurbs", { ...v.blurbs, [k]: e.target.value })} /></div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold text-ink">Catering</h2>
        <p className="mt-0.5 text-[0.8125rem] text-ink-muted">The catering order page. Menu items come from Settings → Services &amp; pricing (categories starting with &quot;Catering&quot;). Prices show + GST.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-4">
          <div><Label htmlFor="cat-min">Minimum of each item</Label><Input id="cat-min" type="number" min={1} max={500} value={cat.minQty} onChange={(e) => setCat({ minQty: Math.max(1, Number(e.target.value)) })} /></div>
          <div><Label htmlFor="cat-fee" hint="Blank = no delivery">Delivery (ex GST)</Label><Input id="cat-fee" type="number" min={0} step="0.01" value={cat.deliveryFee ?? ""} onChange={(e) => setCat({ deliveryFee: e.target.value === "" ? null : Number(e.target.value) })} /></div>
          <div><Label htmlFor="cat-per">Charge delivery</Label><Select id="cat-per" value={cat.deliveryPer} onChange={(e) => setCat({ deliveryPer: e.target.value === "delivery" ? "delivery" : "order" })}><option value="order">Once per order</option><option value="delivery">For each delivery time</option></Select></div>
          <label className="flex items-center gap-2 self-end pb-2 text-[0.8125rem]"><input type="checkbox" className="h-4 w-4" checked={cat.pickup} onChange={(e) => setCat({ pickup: e.target.checked })} />Free pickup</label>
        </div>
        <div className="mt-5">
          <Label>How the menu shows (customers can change it with the filter button)</Label>
          <div className="flex flex-wrap gap-2">
            {([["list", "Menu after menu"], ["tabs", "Tabbed menus"]] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setCat({ layout: k })} className={`rounded-lg px-3 py-1.5 text-[0.8125rem] font-medium ring-1 ring-inset ${cat.layout === k ? "bg-brand-50 text-ink ring-brand-300" : "text-ink-muted ring-line-strong hover:bg-zinc-50"}`}>{l}</button>
            ))}
            <span className="mx-1 w-px self-stretch bg-line" />
            {([["tiles", "Item tiles"], ["rows", "Compact list"]] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setCat({ display: k })} className={`rounded-lg px-3 py-1.5 text-[0.8125rem] font-medium ring-1 ring-inset ${cat.display === k ? "bg-brand-50 text-ink ring-brand-300" : "text-ink-muted ring-line-strong hover:bg-zinc-50"}`}>{l}</button>
            ))}
          </div>
        </div>
        <div className="mt-5">
          <Label>Menus for each time, in order</Label>
          <p className="-mt-1 mb-3 text-[0.7812rem] text-ink-muted">Ticked menus show first, in this order. The rest sit under &quot;Looking for something else?&quot; so customers can still add them.</p>
          {!menus.length && <p className="text-[0.8125rem] text-ink-muted">No catering items in your price list yet.</p>}
          <div className="grid gap-4 md:grid-cols-3">
            {SLOTS.map((sl) => {
              const chosen = cat.slots[sl.id].filter((g) => menus.includes(g));
              const notChosen = menus.filter((g) => !chosen.includes(g));
              const move = (i: number, d: number) => { const l = [...chosen]; const j = i + d; if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; setSlotMenus(sl.id, l); };
              return (
                <div key={sl.id} className="rounded-lg border border-line p-3">
                  <p className="mb-2 text-[0.8125rem] font-semibold text-ink">{sl.label.replace(" delivery", "")}</p>
                  <ul className="space-y-1">
                    {chosen.map((g, i) => (
                      <li key={g} className="flex items-center gap-1.5 rounded-md bg-brand-50/60 px-2 py-1 text-[0.8125rem]">
                        <input type="checkbox" checked onChange={() => setSlotMenus(sl.id, chosen.filter((x) => x !== g))} aria-label={`Hide ${g}`} />
                        <span className="flex-1 truncate">{i + 1}. {g}</span>
                        <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="text-ink-faint disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                        <button type="button" aria-label="Move down" disabled={i === chosen.length - 1} onClick={() => move(i, 1)} className="text-ink-faint disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
                      </li>
                    ))}
                    {notChosen.map((g) => (
                      <li key={g} className="flex items-center gap-1.5 px-2 py-1 text-[0.8125rem] text-ink-muted">
                        <input type="checkbox" checked={false} onChange={() => setSlotMenus(sl.id, [...chosen, g])} aria-label={`Show ${g}`} /><span className="truncate">{g}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold text-ink">Branding</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div><Label htmlFor="ev-sp" hint="Leave blank to hide">Cup sticker price (each, ex GST)</Label><Input id="ev-sp" type="number" min={0} step="0.01" value={v.stickerPrice ?? ""} onChange={(e) => set("stickerPrice", e.target.value === "" ? null : Number(e.target.value))} /></div>
          <div><Label htmlFor="ev-ss">Sticker size</Label><Input id="ev-ss" value={v.stickerSize} onChange={(e) => set("stickerSize", e.target.value)} /></div>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold text-ink">Photos</h2>
        <p className="mt-0.5 text-[0.8125rem] text-ink-muted">Paste an image link (https://…). Without a photo the page shows a drawing instead.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {IMG.map((i) => <div key={i.key}><Label htmlFor={`ev-img-${i.key}`}>{i.label}</Label><Input id={`ev-img-${i.key}`} value={v.images[i.key] ?? ""} onChange={(e) => set("images", { ...v.images, [i.key]: e.target.value.trim() || undefined })} placeholder="https://" /></div>)}
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between gap-3">
          <div><h2 className="font-semibold text-ink">Drinks menu</h2><p className="mt-0.5 text-[0.8125rem] text-ink-muted">Shown on the drinks page. Give one drink a tag (like &quot;Crowd favourite&quot;) to feature it at the top.</p></div>
          <Button type="button" size="sm" onClick={() => set("drinks", [...v.drinks, { title: "New group", intro: null, items: [] }])}><Plus className="h-3.5 w-3.5" />Group</Button>
        </div>
        <div className="mt-4 space-y-4">
          {v.drinks.map((g, gi) => (
            <div key={gi} className="rounded-lg border border-line p-4">
              <div className="flex gap-2">
                <Input aria-label="Group name" value={g.title} onChange={(e) => setDrink(gi, { ...g, title: e.target.value })} className="font-medium" />
                <Button type="button" variant="ghost" size="sm" aria-label="Remove group" onClick={() => set("drinks", v.drinks.filter((_, i) => i !== gi))}><Trash2 className="h-4 w-4" /></Button>
              </div>
              <Input aria-label="Group intro" className="mt-2" value={g.intro ?? ""} placeholder="Intro (optional)" onChange={(e) => setDrink(gi, { ...g, intro: e.target.value || null })} />
              <div className="mt-3 space-y-2">
                {g.items.map((it, ii) => (
                  <div key={ii} className="grid gap-2 sm:grid-cols-[1fr_1.6fr_0.8fr_auto]">
                    <Input aria-label="Drink" value={it.name} placeholder="Drink" onChange={(e) => setDrink(gi, { ...g, items: g.items.map((x, j) => (j === ii ? { ...x, name: e.target.value } : x)) })} />
                    <Input aria-label="Note" value={it.note ?? ""} placeholder="Note" onChange={(e) => setDrink(gi, { ...g, items: g.items.map((x, j) => (j === ii ? { ...x, note: e.target.value || null } : x)) })} />
                    <Input aria-label="Tag" value={it.tag ?? ""} placeholder="Tag" onChange={(e) => setDrink(gi, { ...g, items: g.items.map((x, j) => (j === ii ? { ...x, tag: e.target.value || null } : x)) })} />
                    <Button type="button" variant="ghost" size="sm" aria-label="Remove drink" onClick={() => setDrink(gi, { ...g, items: g.items.filter((_, j) => j !== ii) })}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
                <Button type="button" variant="ghost" size="sm" onClick={() => setDrink(gi, { ...g, items: [...g.items, { name: "", note: null, tag: null }] })}><Plus className="h-3.5 w-3.5" />Drink</Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="sticky bottom-3 z-10 flex items-center gap-3 rounded-xl border border-line bg-surface/95 p-3 shadow-card backdrop-blur">
        <Button type="button" variant="primary" disabled={pending} onClick={save}>{pending ? "Saving…" : "Save events pages"}</Button>
        {msg && <span className={`text-[0.8125rem] ${msg.ok ? "text-ink-muted" : "text-rose-700"}`} role="status">{msg.text}</span>}
      </div>
    </div>
  );
}
