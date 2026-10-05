"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { saveProduct, type ProductInput } from "@/app/(app)/store/actions";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/form";
import { Card } from "@/components/ui/card";
import { PhotoUpload } from "@/components/bookings/course-tools";

export function ProductEditor({ orgId, initial, defaultGrinds }: { orgId: string; initial: ProductInput; defaultGrinds: string[] }) {
  const router = useRouter();
  const [p, setP] = useState<ProductInput>(initial);
  const [grindText, setGrindText] = useState(initial.grinds.join("\n"));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof ProductInput>(k: K, v: ProductInput[K]) => setP({ ...p, [k]: v });
  const txt = (k: "name" | "slug" | "category" | "short" | "description" | "tasting_notes" | "origin" | "roast" | "best_for" | "image_url") => ({ value: (p[k] as string) ?? "", onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(k, e.target.value) });
  const save = () => start(async () => {
    const r = await saveProduct({ ...p, grinds: grindText.split("\n").map((x) => x.trim()).filter(Boolean) });
    setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error });
    if (r.ok && !p.id) router.replace(`/store/products/${r.data}`); else if (r.ok) router.refresh();
  });
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
      <div className="space-y-5">
        <Card className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label htmlFor="pe-n">Name</Label><Input id="pe-n" {...txt("name")} /></div>
            <div><Label htmlFor="pe-s" hint="web address">Short name</Label><Input id="pe-s" {...txt("slug")} placeholder="made from the name" /></div>
            <div><Label htmlFor="pe-k">Type</Label><Select id="pe-k" value={p.kind} onChange={(e) => set("kind", e.target.value as ProductInput["kind"])}><option value="coffee">Coffee</option><option value="other">Other (equipment, merch…)</option></Select></div>
            <div><Label htmlFor="pe-c" hint="e.g. Espresso coffee">Category</Label><Input id="pe-c" {...txt("category")} /></div>
          </div>
          <div><Label htmlFor="pe-t" hint="shown big on the card">Tasting notes</Label><Input id="pe-t" {...txt("tasting_notes")} placeholder="Caramel, chocolate, nuts" /></div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div><Label htmlFor="pe-o">Origin</Label><Input id="pe-o" {...txt("origin")} /></div>
            <div><Label htmlFor="pe-r">Roast</Label><Input id="pe-r" {...txt("roast")} placeholder="Medium" /></div>
            <div><Label htmlFor="pe-b">Best for</Label><Input id="pe-b" {...txt("best_for")} placeholder="Milk-based espresso" /></div>
          </div>
          <div><Label htmlFor="pe-sh">Short description</Label><Textarea id="pe-sh" {...txt("short")} /></div>
          <div><Label htmlFor="pe-d" hint="blank line = new paragraph">About this coffee</Label><Textarea id="pe-d" className="min-h-[180px]" {...txt("description")} /></div>
        </Card>
        <Card className="p-5">
          <h2 className="text-[0.9375rem] font-semibold text-ink">Sizes &amp; prices</h2>
          <p className="mt-0.5 text-[0.8125rem] text-ink-muted">Prices include GST. Sizes like 250g or 1kg are used for the roast plan weights.</p>
          <div className="mt-3 space-y-2">
            {p.variants.map((v, i) => (
              <div key={v.id ?? `n${i}`} className="flex items-center gap-2">
                <Input aria-label="Size" value={v.label} onChange={(e) => set("variants", p.variants.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))} placeholder="1kg" className="w-36" />
                <div className="relative w-32"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[0.8438rem] text-ink-faint">$</span><Input aria-label="Price" type="number" step="0.01" min={0} value={v.price} onChange={(e) => set("variants", p.variants.map((x, k) => (k === i ? { ...x, price: Number(e.target.value) } : x)))} className="pl-6" /></div>
                <label className="flex items-center gap-1.5 text-[0.8125rem]"><input type="checkbox" checked={v.active} onChange={(e) => set("variants", p.variants.map((x, k) => (k === i ? { ...x, active: e.target.checked } : x)))} />On sale</label>
                <button type="button" onClick={() => set("variants", p.variants.filter((_, k) => k !== i))} className="ml-auto grid h-9 w-9 place-items-center rounded-lg text-ink-faint hover:bg-zinc-100" aria-label="Remove size"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            <Button type="button" size="sm" variant="secondary" onClick={() => set("variants", [...p.variants, { id: null, label: "", price: 0, active: true }])}><Plus className="h-4 w-4" />Add size</Button>
          </div>
        </Card>
      </div>
      <div className="space-y-5">
        <Card className="space-y-4 p-5">
          <div><Label htmlFor="pe-st">Status</Label><Select id="pe-st" value={p.status} onChange={(e) => set("status", e.target.value as ProductInput["status"])}><option value="active">On sale</option><option value="draft">Hidden (draft)</option><option value="archived">Archived</option></Select></div>
          <label className="flex items-center gap-2 text-[0.8438rem]"><input type="checkbox" checked={p.subscribable} disabled={p.kind !== "coffee"} onChange={(e) => set("subscribable", e.target.checked)} />Can be a subscription</label>
          <label className="flex items-center gap-2 text-[0.8438rem]"><input type="checkbox" checked={p.featured} onChange={(e) => set("featured", e.target.checked)} />Featured badge</label>
          <div><Label htmlFor="pe-pos" hint="lower shows first">Order on page</Label><Input id="pe-pos" type="number" value={p.position} onChange={(e) => set("position", Number(e.target.value))} /></div>
        </Card>
        <Card className="space-y-3 p-5">
          <Label htmlFor="pe-img">Photo</Label>
          {p.image_url && <img src={p.image_url} alt="" className="aspect-square w-full rounded-lg bg-zinc-50 object-contain p-3" />}
          <div className="flex gap-2"><Input id="pe-img" {...txt("image_url")} placeholder="https://…" /><PhotoUpload orgId={orgId} folder="shop" onUploaded={(u) => set("image_url", u)} /></div>
        </Card>
        <Card className="space-y-2 p-5">
          <Label htmlFor="pe-g" hint="one per line">Grind choices</Label>
          <Textarea id="pe-g" value={grindText} onChange={(e) => setGrindText(e.target.value)} className="min-h-[130px]" />
          {!grindText.trim() && <button type="button" onClick={() => setGrindText(defaultGrinds.join("\n"))} className="text-[0.8125rem] font-medium text-ink underline">Use the usual grinds</button>}
          <p className="text-[0.75rem] text-ink-faint">Customers can also ask for a little finer or coarser than your usual setting.</p>
        </Card>
        <div className="flex items-center gap-3"><Button type="button" variant="primary" disabled={pending} onClick={save}>{p.id ? "Save changes" : "Create product"}</Button>{msg && <span className={msg.ok ? "text-[0.8125rem] text-emerald-700" : "text-[0.8125rem] text-rose-700"}>{msg.text}</span>}</div>
      </div>
    </div>
  );
}
