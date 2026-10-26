"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, ExternalLink, ImagePlus, Loader2, Plus, Sparkles, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/form";
import { draftItemPage, saveItem, type ItemInput } from "@/app/(app)/rentals/actions";
import { uploadPhoto } from "@/components/ui/photo-upload";
import type { RateUnit } from "@/lib/hire/core";

type Opt = { id: string; name: string; kind: string };
type Ref = { item_id: string; qty: number; auto?: boolean };

/** Add or edit a hire item: stock, rates for each unit, bond, turnaround, what goes with it, packages, maintenance dates. */
export function ItemForm({ id, initial, units, others, categories, canEdit, brands = [], orgId, pagesReady = false, shopBase = null }: {
  id: string | null; initial: ItemInput; units: RateUnit[]; others: Opt[]; categories: string[]; canEdit: boolean; brands?: { key: string; name: string }[];
  /** for photo uploads */ orgId: string;
  /** migration 0069 has run (gallery + product page) */ pagesReady?: boolean;
  /** the public shop address, when the shop is on */ shopBase?: string | null;
}) {
  const router = useRouter();
  const [f, setF] = useState<ItemInput>(() => ({ ...initial, images: initial.images ?? (initial.image_url ? [initial.image_url] : []), specs: initial.specs ?? [], related: initial.related ?? [], show_online: initial.show_online !== false }));
  const [uploading, setUploading] = useState(false);
  const [facts, setFacts] = useState("");
  const [drafting, startDraft] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const images = f.images ?? [];
  const maxPhotos = pagesReady ? 12 : 1;
  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true); setMsg(null);
    try {
      const room = Math.max(0, maxPhotos - images.length);
      const urls: string[] = [];
      for (const file of Array.from(files).slice(0, room)) urls.push(await uploadPhoto(orgId, "items", file));
      setF((o) => ({ ...o, images: pagesReady ? [...(o.images ?? []), ...urls] : urls.slice(0, 1) }));
      if (files.length > room && pagesReady) setMsg({ ok: false, text: `Up to ${maxPhotos} photos — the rest weren't added.` });
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't upload that photo." }); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };
  const movePhoto = (i: number, d: number) => setF((o) => { const a = [...(o.images ?? [])]; const j = i + d; if (j < 0 || j >= a.length) return o; [a[i], a[j]] = [a[j], a[i]]; return { ...o, images: a }; });
  const draft = () => startDraft(async () => {
    setMsg(null);
    const r = await draftItemPage({ name: f.name, category: f.category, description: f.description, facts, brand: f.brand });
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
    setF((o) => ({ ...o, details: r.data.details || o.details, seo_title: r.data.seo_title || o.seo_title, seo_description: r.data.seo_description || o.seo_description, specs: (o.specs ?? []).length ? o.specs : r.data.specs }));
    setMsg({ ok: true, text: "Drafted — read it over, change anything, then save." });
  });
  const [rates, setRates] = useState<Record<string, string>>(() => Object.fromEntries(((initial.rates as { unit: string; price: number }[]) ?? []).map((r) => [r.unit, String(r.price)])));
  const [comps, setComps] = useState<Ref[]>((initial.companions as Ref[]) ?? []);
  const [pack, setPack] = useState<Ref[]>((initial.package_lines as Ref[]) ?? []);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof ItemInput>(k: K, v: ItemInput[K]) => setF((o) => ({ ...o, [k]: v }));
  const hireOthers = useMemo(() => others.filter((o) => o.kind !== "package"), [others]);

  const submit = () => start(async () => {
    setMsg(null);
    const r = await saveItem(id, {
      ...f, rates: Object.entries(rates).filter(([, v]) => v.trim() !== "").map(([unit, v]) => ({ unit, price: Number(v) })),
      companions: comps.filter((c) => c.item_id), package_lines: pack.filter((c) => c.item_id),
    });
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
    if (!id) router.push(`/rentals/items/${r.data}`); else { setMsg({ ok: true, text: "Saved." }); router.refresh(); }
  });

  const refRows = (rows: Ref[], setRows: (r: Ref[]) => void, withAuto: boolean, label: string) => (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <Select aria-label={`${label} item`} value={r.item_id} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, item_id: e.target.value } : x)))} className="min-w-0 flex-1"><option value="">Choose an item…</option>{hireOthers.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select>
          <Input aria-label="Quantity" type="number" min={1} value={r.qty} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, qty: Math.max(1, Number(e.target.value) || 1) } : x)))} className="w-20" />
          {withAuto && <label className="flex items-center gap-1.5 text-[0.75rem] text-ink-muted"><input type="checkbox" checked={r.auto !== false} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, auto: e.target.checked } : x)))} />Add automatically</label>}
          <button type="button" aria-label="Remove" onClick={() => setRows(rows.filter((_, j) => j !== i))} className="grid h-8 w-8 place-items-center rounded-lg text-ink-faint hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
        </div>
      ))}
      <Button size="sm" variant="ghost" onClick={() => setRows([...rows, { item_id: "", qty: 1, auto: true }])}><Plus className="h-4 w-4" />{label}</Button>
    </div>
  );

  return (
    <fieldset disabled={!canEdit} className="space-y-5">
      <Card className="p-5">
        <div className="grid gap-4 sm:grid-cols-6">
          <div className="sm:col-span-4"><Label htmlFor="it-name">Name</Label><Input id="it-name" value={f.name} maxLength={200} onChange={(e) => set("name", e.target.value)} placeholder="e.g. 3m × 6m pop-up marquee" /></div>
          <div className="sm:col-span-2"><Label htmlFor="it-code" hint="optional">Code</Label><Input id="it-code" value={f.code ?? ""} maxLength={40} onChange={(e) => set("code", e.target.value)} /></div>
          <div className="sm:col-span-2"><Label htmlFor="it-kind">Type</Label>
            <Select id="it-kind" value={f.kind} onChange={(e) => set("kind", e.target.value as ItemInput["kind"])}><option value="hire">Hire item</option><option value="sale">Sale item (sold, not returned)</option><option value="package">Package (a set of items)</option></Select></div>
          <div className="sm:col-span-2"><Label htmlFor="it-cat">Category</Label><Input id="it-cat" list="it-cats" value={f.category ?? ""} maxLength={80} onChange={(e) => set("category", e.target.value)} placeholder="e.g. Marquees" /><datalist id="it-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist></div>
          {brands.length > 1 && <div className="sm:col-span-2"><Label htmlFor="it-brand">Brand</Label><Select id="it-brand" value={f.brand ?? brands[0].key} onChange={(e) => set("brand", e.target.value)}>{brands.map((b) => <option key={b.key} value={b.key}>{b.name}</option>)}</Select></div>}
          <div className="sm:col-span-2"><Label htmlFor="it-sub" hint="optional">Sub-category</Label><Input id="it-sub" value={f.subcategory ?? ""} maxLength={80} onChange={(e) => set("subcategory", e.target.value)} /></div>
          {f.kind !== "package" && <>
            <div className="sm:col-span-2"><Label htmlFor="it-qty">{f.kind === "sale" ? "In stock" : "How many you own"}</Label><Input id="it-qty" type="number" min={0} value={f.quantity} onChange={(e) => set("quantity", Number(e.target.value))} /></div>
            {f.kind === "hire" && <div className="sm:col-span-2"><Label htmlFor="it-oos" hint="broken, being fixed">Out of service</Label><Input id="it-oos" type="number" min={0} value={f.out_of_service} onChange={(e) => set("out_of_service", Number(e.target.value))} /></div>}
          </>}
          <div className="sm:col-span-6"><Label htmlFor="it-desc" hint="optional">Description</Label><Textarea id="it-desc" rows={2} value={f.description ?? ""} onChange={(e) => set("description", e.target.value)} /></div>
        </div>
      </Card>

      <Card className="p-5">
        <p className="text-[0.8438rem] font-semibold text-ink">Rates (including GST)</p>
        <p className="mt-0.5 text-[0.75rem] text-ink-muted">{f.kind === "sale" ? "Use the per hire price as the price each." : f.kind === "package" ? "Leave blank to charge the total of the items inside." : "Fill in the ones you use. Each booking is charged the cheapest mix for its length, so a week rate kicks in once it beats paying by the day."}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          {units.map((u) => (
            <div key={u.key}><Label htmlFor={`rate-${u.key}`} hint={u.hours ? `${u.hours}h` : "flat"}>{u.label}</Label>
              <Input id={`rate-${u.key}`} type="number" min={0} step="0.01" inputMode="decimal" value={rates[u.key] ?? ""} onChange={(e) => setRates((r) => ({ ...r, [u.key]: e.target.value }))} placeholder="—" /></div>
          ))}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <div><Label htmlFor="it-bond" hint="refundable">Bond</Label><Input id="it-bond" type="number" min={0} step="0.01" value={f.bond} onChange={(e) => set("bond", Number(e.target.value))} /></div>
          {f.kind === "hire" && <div><Label htmlFor="it-buf" hint="blank = default">Turnaround (hours)</Label><Input id="it-buf" type="number" min={0} step="0.5" value={f.buffer_hours ?? ""} onChange={(e) => set("buffer_hours", e.target.value === "" ? null : Number(e.target.value))} /></div>}
        </div>
      </Card>

      {f.kind === "package" ? (
        <Card className="p-5">
          <p className="text-[0.8438rem] font-semibold text-ink">What's in the package</p>
          <p className="mb-3 mt-0.5 text-[0.75rem] text-ink-muted">Stock is checked item by item, so a package is only available when everything in it is.</p>
          {refRows(pack, setPack, false, "Add an item")}
        </Card>
      ) : (
        <Card className="p-5">
          <p className="text-[0.8438rem] font-semibold text-ink">Goes with</p>
          <p className="mb-3 mt-0.5 text-[0.75rem] text-ink-muted">Items to add alongside this one, per one of these (e.g. 4 weights per marquee). If they aren&apos;t added automatically, they&apos;re suggested.</p>
          {refRows(comps, setComps, true, "Add a companion")}
        </Card>
      )}

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-[0.8438rem] font-semibold text-ink">Photos</p>
            <p className="mt-0.5 text-[0.75rem] text-ink-muted">{pagesReady ? "The first photo shows in the shop; the rest appear on the item's own page. Items without a photo still show — just without a picture." : "Shown in the online shop. Items without a photo still show — just without a picture."}</p>
          </div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple={pagesReady} className="hidden" onChange={(e) => addPhotos(e.target.files)} />
          <Button size="sm" variant="secondary" disabled={uploading || images.length >= maxPhotos} onClick={() => fileRef.current?.click()}>{uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}{images.length && !pagesReady ? "Replace photo" : "Add photos"}</Button>
        </div>
        {images.length > 0 && (
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {images.map((u, i) => (
              <li key={u} className="group relative overflow-hidden rounded-lg ring-1 ring-line">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u} alt="" className="aspect-[4/3] w-full object-cover" />
                {i === 0 && <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[0.6875rem] font-semibold text-white"><Star className="h-3 w-3" />Main</span>}
                <div className="absolute inset-x-0 bottom-0 flex justify-between bg-gradient-to-t from-black/60 to-transparent p-1.5">
                  <span className="flex gap-1">
                    {i > 0 && <button type="button" aria-label="Move left" onClick={() => movePhoto(i, -1)} className="grid h-7 w-7 place-items-center rounded-full bg-white/90 text-ink"><ArrowLeft className="h-3.5 w-3.5" /></button>}
                    {i < images.length - 1 && <button type="button" aria-label="Move right" onClick={() => movePhoto(i, 1)} className="grid h-7 w-7 place-items-center rounded-full bg-white/90 text-ink"><ArrowRight className="h-3.5 w-3.5" /></button>}
                  </span>
                  <button type="button" aria-label="Remove photo" onClick={() => setF((o) => ({ ...o, images: (o.images ?? []).filter((x) => x !== u) }))} className="grid h-7 w-7 place-items-center rounded-full bg-white/90 text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-[0.8438rem] font-semibold text-ink">Product page</p>
            <p className="mt-0.5 text-[0.75rem] text-ink-muted">Its own page in your online shop, so people searching to hire it can find it, see it&apos;s free and book.</p>
          </div>
          {id && f.slug && shopBase && pagesReady && <a href={`${shopBase}/${f.slug}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[0.8125rem] font-medium text-brand-700 hover:underline">View page <ExternalLink className="h-3.5 w-3.5" /></a>}
        </div>
        {!pagesReady ? <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[0.8125rem] text-amber-900">Product pages and extra photos switch on after a quick database update (0069). Your EventureOS contact runs it.</p> : (
          <div className="mt-3 grid gap-4 sm:grid-cols-6">
            <label className="flex items-center gap-2 text-[0.8125rem] text-ink sm:col-span-6"><input type="checkbox" checked={f.show_online !== false} onChange={(e) => set("show_online", e.target.checked)} />Show in the online shop</label>
            <div className="sm:col-span-6"><Label htmlFor="it-slug" hint="blank = from the name">Web address</Label>
              <div className="flex items-center gap-1"><span className="hidden max-w-[50%] truncate text-[0.8125rem] text-ink-faint sm:block">{shopBase ? `${shopBase.replace(/^https?:\/\//, "")}/` : ".../shop/"}</span><Input id="it-slug" value={f.slug ?? ""} maxLength={80} onChange={(e) => set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-"))} placeholder="big-buck-hunter" /></div></div>
            <div className="rounded-lg bg-canvas p-3 sm:col-span-6">
              <Label htmlFor="it-facts" hint="for the AI writer">Key facts</Label>
              <Textarea id="it-facts" rows={2} value={facts} onChange={(e) => setFacts(e.target.value)} placeholder="e.g. 2 players, light-up rifles, needs a standard power point, fits through a normal door, popular at 21sts and corporate events" />
              <Button size="sm" variant="secondary" className="mt-2" disabled={drafting || !f.name.trim()} onClick={draft}>{drafting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Write the page for me</Button>
              <p className="mt-1 text-[0.7188rem] text-ink-faint">Uses only what you give it — check it before saving.</p>
            </div>
            <div className="sm:col-span-6"><Label htmlFor="it-details" hint="blank lines start a new paragraph">About this item</Label><Textarea id="it-details" rows={6} value={f.details ?? ""} onChange={(e) => set("details", e.target.value)} /></div>
            <div className="sm:col-span-6">
              <Label>Specs</Label>
              <div className="space-y-2">
                {(f.specs ?? []).map((sp, i) => (
                  <div key={i} className="flex gap-2">
                    <Input aria-label="Spec" value={sp.label} maxLength={60} placeholder="e.g. Size" onChange={(e) => set("specs", (f.specs ?? []).map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} className="w-40" />
                    <Input aria-label="Value" value={sp.value} maxLength={200} placeholder="e.g. 1.9m tall × 0.8m wide" onChange={(e) => set("specs", (f.specs ?? []).map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} className="min-w-0 flex-1" />
                    <button type="button" aria-label="Remove" onClick={() => set("specs", (f.specs ?? []).filter((_, j) => j !== i))} className="grid h-9 w-9 place-items-center rounded-lg text-ink-faint hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
                <Button size="sm" variant="ghost" onClick={() => set("specs", [...(f.specs ?? []), { label: "", value: "" }])}><Plus className="h-4 w-4" />Add a spec</Button>
              </div>
            </div>
            <div className="sm:col-span-6">
              <Label hint="shown on its page as “add to your hire”">You might also like</Label>
              <div className="flex flex-wrap gap-1.5">
                {(f.related ?? []).map((rid) => { const o = others.find((x) => x.id === rid); return o ? <span key={rid} className="flex items-center gap-1 rounded-full bg-canvas py-1 pl-3 pr-1 text-[0.8125rem] ring-1 ring-line">{o.name}<button type="button" aria-label={`Remove ${o.name}`} onClick={() => set("related", (f.related ?? []).filter((x) => x !== rid))} className="grid h-5 w-5 place-items-center rounded-full hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-3 w-3" /></button></span> : null; })}
              </div>
              <Select aria-label="Add a suggestion" value="" className="mt-2" onChange={(e) => e.target.value && set("related", [...(f.related ?? []), e.target.value].slice(0, 12))}>
                <option value="">Add an item…</option>
                {others.filter((o) => !(f.related ?? []).includes(o.id)).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </Select>
            </div>
            <div className="sm:col-span-3"><Label htmlFor="it-seot" hint={`${(f.seo_title ?? "").length}/60`}>Search title</Label><Input id="it-seot" value={f.seo_title ?? ""} maxLength={70} onChange={(e) => set("seo_title", e.target.value)} placeholder={`${f.name || "Item"} hire`} /></div>
            <div className="sm:col-span-3"><Label htmlFor="it-seod" hint={`${(f.seo_description ?? "").length}/155`}>Search description</Label><Input id="it-seod" value={f.seo_description ?? ""} maxLength={170} onChange={(e) => set("seo_description", e.target.value)} /></div>
          </div>
        )}
      </Card>

      <Card className="p-5">
        <div className="grid gap-4 sm:grid-cols-4">
          <div><Label htmlFor="it-loc" hint="shelf, bay">Location</Label><Input id="it-loc" value={f.location ?? ""} maxLength={80} onChange={(e) => set("location", e.target.value)} /></div>
          <div><Label htmlFor="it-dim" hint="optional">Size</Label><Input id="it-dim" value={f.dimensions ?? ""} maxLength={120} onChange={(e) => set("dimensions", e.target.value)} placeholder="L × W × H" /></div>
          <div><Label htmlFor="it-kg" hint="optional">Weight (kg)</Label><Input id="it-kg" type="number" min={0} step="0.1" value={f.weight_kg ?? ""} onChange={(e) => set("weight_kg", e.target.value === "" ? null : Number(e.target.value))} /></div>
          <div><Label htmlFor="it-tag">Test &amp; tag due</Label><Input id="it-tag" type="date" value={f.test_tag_due ?? ""} onChange={(e) => set("test_tag_due", e.target.value || null)} /></div>
          <div><Label htmlFor="it-svc">Service due</Label><Input id="it-svc" type="date" value={f.service_due ?? ""} onChange={(e) => set("service_due", e.target.value || null)} /></div>
          <div className="sm:col-span-4"><Label htmlFor="it-notes" hint="only your team sees these">Notes</Label><Textarea id="it-notes" rows={2} value={f.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></div>
          <label className="flex items-center gap-2 text-[0.8125rem] text-ink sm:col-span-4"><input type="checkbox" checked={f.active} onChange={(e) => set("active", e.target.checked)} />Active (untick to archive. Past bookings keep it.)</label>
        </div>
      </Card>

      {canEdit && (
        <div className="flex flex-wrap items-center justify-end gap-3">
          {msg && <p className={`text-[0.8125rem] ${msg.ok ? "text-emerald-700" : "text-rose-600"}`} role="status">{msg.text}</p>}
          <Button variant="primary" disabled={pending || !f.name.trim()} onClick={submit}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}{id ? "Save item" : "Add item"}</Button>
        </div>
      )}
    </fieldset>
  );
}
