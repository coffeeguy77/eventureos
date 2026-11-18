"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { TourEditor } from "./tour-editor";
import { Button } from "@/components/ui/button";
import { FormError, Input, Label } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { copyFromListing, createListing, deleteEquipmentItem, saveEquipmentIncluded, saveEquipmentItem, saveTourScenesShown, type EquipmentInput } from "@/app/(app)/business-sale/actions";
import { InteractiveTour, thumb, type TourSpace } from "./tour";
import { aud } from "./charts";

export interface EquipmentRow { id: string; name: string; category: string | null; division: string | null; brand: string | null; condition: string | null; secondhand_value: number; replacement_cost: number; included: boolean }

/** The 360° walkthrough, plus which rooms buyers see. */
export function TourPanel({ orgId, listingId, spaces }: { orgId: string; listingId: string; spaces: TourSpace[] }) {
  const [editing, setEditing] = useState(false);
  const router = useRouter();
  const [shown, setShown] = useState<Record<string, boolean>>(() => Object.fromEntries(spaces.map((s) => [s.id, s.enabled !== false])));
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const live = useMemo(() => spaces.map((s) => ({ ...s, enabled: shown[s.id] })), [spaces, shown]);
  const pins = spaces.reduce((t, s) => t + s.pins.length, 0);
  const clips = spaces.filter((s) => s.audioUrl).length + spaces.reduce((t, s) => t + s.pins.filter((p) => p.audioUrl).length, 0);
  if (editing || !spaces.length) {
    if (!editing) return <div className="space-y-3"><p className="text-[0.8125rem] text-ink-muted">No 360° walkthrough on this listing yet.</p><Button variant="primary" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" />Build the tour</Button></div>;
    return <TourEditor orgId={orgId} listingId={listingId} initial={spaces} onDone={() => setEditing(false)} />;
  }
  const changed = spaces.some((s) => (s.enabled !== false) !== shown[s.id]);
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button onClick={() => setEditing(true)}><Pencil className="h-4 w-4" />Edit tour</Button></div>
      <InteractiveTour spaces={live} />
      <p className="text-[0.8125rem] text-ink-muted">{spaces.length} rooms · {pins} hotspots · {clips} sound clip{clips === 1 ? "" : "s"}. Tap the arrows in the tour to walk between rooms; green hotspots play the sound clips.</p>
      <div>
        <p className="mb-2 text-[0.8125rem] font-medium text-ink">Rooms buyers see</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {spaces.map((s) => (
            <button key={s.id} type="button" onClick={() => { setShown((o) => ({ ...o, [s.id]: !o[s.id] })); setSaved(false); }}
              className={cn("flex items-center gap-2 rounded-xl p-1.5 text-left ring-1 ring-inset", shown[s.id] ? "ring-line" : "opacity-50 ring-line")}>
              <img src={thumb(s.panoramaUrl, 96, 60)} alt="" loading="lazy" className="h-9 w-14 shrink-0 rounded-md object-cover" />
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate text-[0.8125rem] text-ink", !shown[s.id] && "line-through")}>{s.name}</span>
                <span className="block text-[0.6875rem] text-ink-faint">{shown[s.id] ? "Shown" : "Hidden"}{s.audioUrl || s.pins.some((p) => p.audioUrl) ? " · 🔊" : ""}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
      {changed && (
        <div className="flex items-center gap-3">
          <Button variant="primary" disabled={pending} onClick={() => start(async () => { setErr(null); const r = await saveTourScenesShown(listingId, shown); if (!r.ok) { setErr(r.error); return; } setSaved(true); router.refresh(); })}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Save rooms</Button>
        </div>
      )}
      {saved && !changed && <p className="text-[0.8125rem] font-medium text-emerald-700">Saved.</p>}
      <FormError message={err} />
    </div>
  );
}

/** Equipment register, by division, with what's included in the sale. */
export function EquipmentPanel({ listingId, items }: { listingId: string; items: EquipmentRow[] }) {
  const router = useRouter();
  const [edit, setEdit] = useState<string | null>(null);
  const [inc, setInc] = useState<Record<string, boolean>>(() => Object.fromEntries(items.map((i) => [i.id, i.included])));
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const groups = useMemo(() => {
    const m = new Map<string, EquipmentRow[]>();
    for (const i of items) { const k = i.division || "General"; m.set(k, [...(m.get(k) ?? []), i]); }
    return [...m.entries()];
  }, [items]);
  if (!items.length) return edit === "new" ? <EquipmentForm listingId={listingId} divisions={[]} onDone={() => setEdit(null)} /> : <div className="space-y-3"><p className="text-[0.8125rem] text-ink-muted">No equipment on this listing yet.</p><Button onClick={() => setEdit("new")}><Plus className="h-4 w-4" />Add an item</Button></div>;
  const sum = (rows: EquipmentRow[], k: "secondhand_value" | "replacement_cost") => rows.filter((r) => inc[r.id]).reduce((t, r) => t + Number(r[k]), 0);
  const changed = items.some((i) => i.included !== inc[i.id]);
  const editing = items.find((i) => i.id === edit);
  return (
    <div className="space-y-4">
      <p className="text-[0.8125rem] text-ink-muted">Untick anything the seller keeps — it shows on the buyer page as not included. Tap the pencil to change an item.</p>
      {(edit === "new" || editing) && <EquipmentForm listingId={listingId} item={editing} divisions={groups.map(([d]) => d)} onDone={() => setEdit(null)} />}
      {edit !== "new" && <Button onClick={() => setEdit("new")}><Plus className="h-4 w-4" />Add an item</Button>}
      <div className="grid grid-cols-1 gap-2.5 min-[360px]:grid-cols-2">
        <div className="rounded-2xl bg-surface p-3.5 ring-1 ring-line"><p className="text-[0.75rem] text-ink-muted">Included, second-hand value</p><p className="mt-1 text-[1.125rem] font-semibold tabular-nums text-ink">{aud(sum(items, "secondhand_value"))}</p><p className="text-[0.75rem] text-ink-faint">what the sale is priced on</p></div>
        <div className="rounded-2xl bg-surface p-3.5 ring-1 ring-line"><p className="text-[0.75rem] text-ink-muted">Cost to buy it all new</p><p className="mt-1 text-[1.125rem] font-semibold tabular-nums text-ink">{aud(sum(items, "replacement_cost"))}</p><p className="text-[0.75rem] text-ink-faint">{items.filter((i) => inc[i.id]).length} of {items.length} items included</p></div>
      </div>
      {groups.map(([div, rows]) => (
        <div key={div} className="rounded-2xl bg-surface ring-1 ring-line">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-2.5">
            <p className="text-[0.875rem] font-semibold text-ink">{div}</p>
            <p className="text-[0.75rem] tabular-nums text-ink-muted">{aud(sum(rows, "secondhand_value"))} second-hand · {aud(sum(rows, "replacement_cost"))} new</p>
          </div>
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-[0.8125rem]">
                <button type="button" role="checkbox" aria-checked={inc[r.id]} onClick={() => setInc((o) => ({ ...o, [r.id]: !o[r.id] }))}
                  className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-md ring-1 ring-inset", inc[r.id] ? "bg-brand-500 text-white ring-brand-500" : "ring-line")}>{inc[r.id] && <Check className="h-4 w-4" />}</button>
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate text-ink", !inc[r.id] && "text-ink-faint line-through")}>{r.name}</span>
                  {(r.category || r.brand || r.condition) && <span className="block truncate text-[0.75rem] text-ink-faint">{[r.category, r.brand, r.condition].filter(Boolean).join(" · ")}</span>}
                </span>
                <span className="shrink-0 text-right tabular-nums">
                  <span className="block text-ink">{aud(Number(r.secondhand_value))}</span>
                  <span className="block text-[0.75rem] text-ink-faint">new {aud(Number(r.replacement_cost))}</span>
                </span>
                <button type="button" aria-label={`Edit ${r.name}`} onClick={() => setEdit(edit === r.id ? null : r.id)} className="grid h-9 w-8 shrink-0 place-items-center text-ink-faint hover:text-ink"><Pencil className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {changed && <Button variant="primary" disabled={pending} onClick={() => start(async () => { setErr(null); const r = await saveEquipmentIncluded(listingId, inc); if (!r.ok) setErr(r.error); else router.refresh(); })}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Save what&apos;s included</Button>}
      <FormError message={err} />
    </div>
  );
}

const LABELS: [string, string, "money" | "text"][] = [
  ["askingPriceMin", "Asking price from", "money"], ["askingPriceMax", "Asking price to", "money"], ["weeklyRevenue", "Weekly revenue", "money"],
  ["adjustedProfit", "Adjusted profit (a year)", "money"], ["rent", "Rent", "money"], ["staffCount", "Staff", "text"], ["ownerHours", "Owner's hours a week", "text"],
  ["leaseOptions", "Lease options", "text"], ["leaseExpiry", "Lease expiry", "text"], ["trainingPeriod", "Training period", "text"], ["franchiseStatus", "Franchise / licence", "text"],
  ["reasonForSale", "Reason for sale", "text"], ["growthOpportunities", "Growth opportunities", "text"], ["category", "Category", "text"], ["subcategory", "Type", "text"],
  ["suburb", "Suburb", "text"], ["state", "State", "text"],
];

/** The listing's details as brought over (read-only for now). */
export function ListingDetails({ title, details, photos, source }: { title: string; details: Record<string, unknown>; photos: string[]; source: string }) {
  const rows = LABELS.filter(([k]) => details[k] !== undefined && details[k] !== null && details[k] !== "" && details[k] !== 0);
  return (
    <div className="space-y-4">
      {photos[0] && <img src={thumb(photos[0], 1200, 600)} alt="" className="aspect-[2/1] w-full rounded-2xl object-cover ring-1 ring-line" />}
      <div>
        <p className="text-[1rem] font-semibold text-ink">{title}</p>
        {typeof details.description === "string" && details.description && <p className="mt-1 text-[0.875rem] text-ink-muted">{details.description}</p>}
        {source === "exit360" && <p className="mt-1 text-[0.75rem] text-ink-faint">Brought over from exit360.</p>}
      </div>
      <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
        {rows.map(([k, l, f]) => (
          <div key={k} className="flex items-baseline justify-between gap-3 border-b border-line py-2 text-[0.8125rem]">
            <dt className="text-ink-muted">{l}</dt>
            <dd className="text-right tabular-nums text-ink">{f === "money" ? aud(Number(details[k])) : String(details[k])}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function StartListing({ unitId }: { unitId: string }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      <p className="text-[0.8125rem] text-ink-muted">Make a buyer page for this sale: a 360° walkthrough, the information memorandum, the equipment list and private links for buyers.</p>
      <Button variant="primary" disabled={pending} onClick={() => start(async () => { setErr(null); const r = await createListing(unitId); if (!r.ok) setErr(r.error); else router.refresh(); })}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Make the buyer page</Button>
      <FormError message={err} />
    </div>
  );
}

function EquipmentForm({ listingId, item, divisions, onDone }: { listingId: string; item?: EquipmentRow; divisions: string[]; onDone: () => void }) {
  const router = useRouter();
  const [f, setF] = useState<EquipmentInput>({ id: item?.id, name: item?.name ?? "", division: item?.division ?? divisions[0] ?? "", category: item?.category ?? "", brand: item?.brand ?? "", condition: item?.condition ?? "", secondhand_value: item?.secondhand_value ?? "", replacement_cost: item?.replacement_cost ?? "", included: item?.included ?? true });
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3 rounded-2xl bg-surface p-4 ring-1 ring-line">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Label>Item</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. La Marzocco Linea PB 3 group" /></div>
        <div><Label hint="e.g. Espresso Bar">Division</Label><Input list="eq-divisions" value={f.division ?? ""} onChange={(e) => setF({ ...f, division: e.target.value })} /><datalist id="eq-divisions">{divisions.map((d) => <option key={d} value={d} />)}</datalist></div>
        <div><Label hint="optional">Brand</Label><Input value={f.brand ?? ""} onChange={(e) => setF({ ...f, brand: e.target.value })} /></div>
        <div><Label>Second-hand value</Label><Input inputMode="decimal" value={String(f.secondhand_value ?? "")} onChange={(e) => setF({ ...f, secondhand_value: e.target.value })} /></div>
        <div><Label>Cost to buy new</Label><Input inputMode="decimal" value={String(f.replacement_cost ?? "")} onChange={(e) => setF({ ...f, replacement_cost: e.target.value })} /></div>
      </div>
      <label className="flex items-center gap-2.5 text-[0.8125rem] text-ink"><input type="checkbox" className="h-4 w-4" checked={f.included} onChange={(e) => setF({ ...f, included: e.target.checked })} />Included in the sale</label>
      <FormError message={err} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <Button variant="primary" disabled={pending} onClick={() => start(async () => { setErr(null); const r = await saveEquipmentItem(listingId, f); if (!r.ok) { setErr(r.error); return; } router.refresh(); onDone(); })}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Save item</Button>
          <Button onClick={onDone}>Cancel</Button>
        </div>
        {item && <button type="button" onClick={() => start(async () => { const r = await deleteEquipmentItem(listingId, item.id); if (!r.ok) setErr(r.error); else { router.refresh(); onDone(); } })} className="inline-flex items-center gap-1 text-[0.8125rem] text-ink-muted hover:text-rose-600"><Trash2 className="h-4 w-4" />Delete item</button>}
      </div>
    </div>
  );
}

export interface CopySource { id: string; title: string; rooms: { id: string; name: string; panoramaUrl: string }[]; divisions: { name: string; items: number }[]; sections: number }

/** Build this listing from another one: the tour rooms this buyer should walk through, equipment by division, the report. */
export function CopyFrom({ listingId, sources }: { listingId: string; sources: CopySource[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [src, setSrc] = useState(sources[0]?.id ?? "");
  const [rooms, setRooms] = useState<string[]>([]);
  const [divs, setDivs] = useState<string[]>([]);
  const [secs, setSecs] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const s = sources.find((x) => x.id === src);
  if (!sources.length) return null;
  if (!open) return <Button onClick={() => setOpen(true)}><Copy className="h-4 w-4" />Copy rooms, equipment or report from another listing</Button>;
  const tog = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  return (
    <div className="space-y-3 rounded-2xl bg-surface p-4 ring-1 ring-line">
      <p className="text-[0.875rem] font-semibold text-ink">Copy from another listing</p>
      <p className="text-[0.75rem] text-ink-muted">For a division: choose only the rooms its buyer should walk through (e.g. the café, not the roastery out the back). Arrows to rooms you leave out are removed. This replaces this listing&apos;s tour{divs.length ? " and equipment" : ""}.</p>
      {sources.length > 1 && <select className="h-10 w-full rounded-xl bg-surface px-3 text-[0.875rem] text-ink ring-1 ring-line" value={src} onChange={(e) => { setSrc(e.target.value); setRooms([]); setDivs([]); }}>{sources.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</select>}
      {s && (<>
        <div className="flex items-center justify-between"><p className="text-[0.8125rem] font-medium text-ink">Rooms ({rooms.length} of {s.rooms.length})</p><button type="button" className="text-[0.75rem] text-brand-700" onClick={() => setRooms(rooms.length === s.rooms.length ? [] : s.rooms.map((r) => r.id))}>{rooms.length === s.rooms.length ? "None" : "All"}</button></div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {s.rooms.map((r) => (
            <button key={r.id} type="button" onClick={() => setRooms(tog(rooms, r.id))} className={cn("flex items-center gap-2 rounded-xl p-1.5 text-left ring-1 ring-inset", rooms.includes(r.id) ? "bg-brand-50 ring-brand-200 dark:bg-brand-500/15" : "ring-line")}>
              {r.panoramaUrl ? <img src={thumb(r.panoramaUrl, 96, 60)} alt="" loading="lazy" className="h-9 w-14 shrink-0 rounded-md object-cover" /> : <span className="h-9 w-14 shrink-0 rounded-md bg-canvas" />}
              <span className="min-w-0 truncate text-[0.8125rem] text-ink">{rooms.includes(r.id) ? "✓ " : ""}{r.name}</span>
            </button>
          ))}
        </div>
        {s.divisions.length > 0 && (<>
          <p className="text-[0.8125rem] font-medium text-ink">Equipment of these divisions</p>
          <div className="flex flex-wrap gap-2">{s.divisions.map((d) => <button key={d.name} type="button" onClick={() => setDivs(tog(divs, d.name))} className={cn("min-h-9 rounded-full px-3 text-[0.8125rem] ring-1 ring-inset", divs.includes(d.name) ? "bg-brand-50 font-medium text-brand-800 ring-brand-200 dark:bg-brand-500/15 dark:text-brand-200" : "text-ink-muted ring-line")}>{divs.includes(d.name) ? "✓ " : ""}{d.name} ({d.items})</button>)}</div>
        </>)}
        {s.sections > 0 && <label className="flex items-center gap-2.5 text-[0.8125rem] text-ink"><input type="checkbox" className="h-4 w-4" checked={secs} onChange={(e) => setSecs(e.target.checked)} />Also copy the report sections ({s.sections}) to edit for this sale</label>}
      </>)}
      {msg && <p className="text-[0.8125rem] font-medium text-emerald-700">{msg}</p>}
      <FormError message={err} />
      <div className="flex gap-2">
        <Button variant="primary" disabled={pending || !s || (!rooms.length && !divs.length && !secs)} onClick={() => start(async () => { setErr(null); const r = await copyFromListing(listingId, src, { rooms, divisions: divs, sections: secs }); if (!r.ok) { setErr(r.error); return; } setMsg(`Copied ${r.data.rooms} rooms, ${r.data.equipment} equipment items${secs ? ` and ${r.data.sections} report sections` : ""}.`); router.refresh(); })}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}Copy</Button>
        <Button onClick={() => setOpen(false)}>Close</Button>
      </div>
    </div>
  );
}
