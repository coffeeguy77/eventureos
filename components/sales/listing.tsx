"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil } from "lucide-react";
import { TourEditor } from "./tour-editor";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { saveEquipmentIncluded, saveTourScenesShown } from "@/app/(app)/business-sale/actions";
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
  const [inc, setInc] = useState<Record<string, boolean>>(() => Object.fromEntries(items.map((i) => [i.id, i.included])));
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const groups = useMemo(() => {
    const m = new Map<string, EquipmentRow[]>();
    for (const i of items) { const k = i.division || "General"; m.set(k, [...(m.get(k) ?? []), i]); }
    return [...m.entries()];
  }, [items]);
  if (!items.length) return <p className="text-[0.8125rem] text-ink-muted">No equipment on this listing yet.</p>;
  const sum = (rows: EquipmentRow[], k: "secondhand_value" | "replacement_cost") => rows.filter((r) => inc[r.id]).reduce((t, r) => t + Number(r[k]), 0);
  const changed = items.some((i) => i.included !== inc[i.id]);
  return (
    <div className="space-y-4">
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
