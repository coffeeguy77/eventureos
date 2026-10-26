"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/form";
import { saveItem, type ItemInput } from "@/app/(app)/rentals/actions";
import type { RateUnit } from "@/lib/hire/core";

type Opt = { id: string; name: string; kind: string };
type Ref = { item_id: string; qty: number; auto?: boolean };

/** Add or edit a hire item: stock, rates for each unit, bond, turnaround, what goes with it, packages, maintenance dates. */
export function ItemForm({ id, initial, units, others, categories, canEdit, brands = [] }: { id: string | null; initial: ItemInput; units: RateUnit[]; others: Opt[]; categories: string[]; canEdit: boolean; brands?: { key: string; name: string }[] }) {
  const router = useRouter();
  const [f, setF] = useState(initial);
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
        <div className="grid gap-4 sm:grid-cols-4">
          <div><Label htmlFor="it-loc" hint="shelf, bay">Location</Label><Input id="it-loc" value={f.location ?? ""} maxLength={80} onChange={(e) => set("location", e.target.value)} /></div>
          <div><Label htmlFor="it-dim" hint="optional">Size</Label><Input id="it-dim" value={f.dimensions ?? ""} maxLength={120} onChange={(e) => set("dimensions", e.target.value)} placeholder="L × W × H" /></div>
          <div><Label htmlFor="it-kg" hint="optional">Weight (kg)</Label><Input id="it-kg" type="number" min={0} step="0.1" value={f.weight_kg ?? ""} onChange={(e) => set("weight_kg", e.target.value === "" ? null : Number(e.target.value))} /></div>
          <div><Label htmlFor="it-img" hint="optional">Photo address</Label><Input id="it-img" value={f.image_url ?? ""} maxLength={1000} onChange={(e) => set("image_url", e.target.value)} placeholder="https://…" /></div>
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
