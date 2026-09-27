"use client";

import { useMemo, useState } from "react";
import { UtensilsCrossed, X } from "lucide-react";
import { addMenuItems } from "@/app/(app)/quotes/actions";
import { Button } from "@/components/ui/button";
import { FormError, Label, inputClass } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";
import type { QItem, QSection } from "./types";

export interface MenuService { id: string; name: string; description: string | null; unit: string | null; unit_price: number; tax_rate: number; category: string | null }

/** Pick items from a price-list group (e.g. the catering menu) with quantities; adds them as one section. */
export function MenuPicker({ quoteId, services, guests, currency, onClose, onAdded }: {
  quoteId: string;
  services: MenuService[];
  guests: number | null;
  currency: string;
  onClose: () => void;
  onAdded: (section: QSection, items: QItem[]) => void;
}) {
  // Top-level menus: "Catering · Breakfast" → "Catering"
  const menus = useMemo(() => [...new Set(services.map((s) => s.category?.split(" · ")[0]).filter((x): x is string => !!x))], [services]);
  const [menu, setMenu] = useState(menus.includes("Catering") ? "Catering" : menus[0] ?? "");
  const [people, setPeople] = useState(guests ? String(guests) : "");
  const [qty, setQty] = useState<Record<string, string>>({});
  const [title, setTitle] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inMenu = services.filter((s) => s.category?.split(" · ")[0] === menu);
  const groups = [...new Set(inMenu.map((s) => s.category!))].map((g) => ({ name: g.split(" · ").slice(1).join(" · ") || g, items: inMenu.filter((s) => s.category === g) }));
  const picked = Object.entries(qty).map(([id, q]) => ({ id, q: Number(q) })).filter((p) => p.q > 0 && inMenu.some((s) => s.id === p.id));
  const subtotal = picked.reduce((sum, p) => sum + p.q * (inMenu.find((s) => s.id === p.id)?.unit_price ?? 0), 0);
  const peopleN = Math.max(0, Math.floor(Number(people) || 0));

  function toggle(s: MenuService) {
    setQty((all) => {
      const next = { ...all };
      if (Number(next[s.id]) > 0) delete next[s.id];
      else next[s.id] = s.unit === "person" && peopleN ? String(peopleN) : "1";
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!picked.length) { setError("Tick at least one item."); return; }
    setPending(true);
    const res = await addMenuItems(quoteId, title.trim() || menu, picked.map((p) => ({ serviceId: p.id, quantity: p.q })))
      .catch(() => ({ ok: false as const, error: "Couldn't reach the server. Check your connection and try again." }));
    setPending(false);
    if (!res.ok) { setError(res.error); return; }
    onAdded(res.data.section, res.data.items);
  }

  if (!menus.length) {
    return (
      <div className="rounded-xl border border-line bg-surface p-4 text-[0.8125rem] text-ink-muted shadow-card">
        Nothing to pick from yet. Give services a group in <a className="font-medium text-brand-700 underline" href="/settings/pricing">Settings → Services &amp; pricing</a>.
        <button type="button" onClick={onClose} className="ml-2 text-ink-faint hover:text-ink">Close</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-brand-200 bg-surface p-4 shadow-card sm:p-5" aria-label="Add from menu">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-[0.875rem] font-semibold text-ink"><UtensilsCrossed className="h-4 w-4 text-brand-600" />Add from menu</p>
          <p className="mt-0.5 text-[0.7812rem] text-ink-muted">Tick items and set quantities. Per-person items start at the number of people.</p>
        </div>
        <button type="button" onClick={onClose} className="-m-1.5 rounded-md p-2.5 text-ink-faint hover:bg-zinc-100 hover:text-ink sm:m-0 sm:p-1" aria-label="Close"><X className="h-4 w-4" /></button>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        {menus.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {menus.map((m) => (
              <button key={m} type="button" onClick={() => setMenu(m)}
                className={cn("rounded-lg px-3 py-1.5 text-[0.8125rem] font-medium ring-1 ring-inset", m === menu ? "bg-brand-50 text-brand-800 ring-brand-300" : "text-ink ring-line-strong hover:bg-zinc-50")}>{m}</button>
            ))}
          </div>
        )}
        <div className="w-28"><Label htmlFor="mp-people">People</Label><input id="mp-people" type="number" min={0} inputMode="numeric" value={people} onChange={(e) => setPeople(e.target.value)} className={inputClass} /></div>
        <div className="min-w-[12rem] flex-1"><Label htmlFor="mp-title" hint="optional">Section title</Label><input id="mp-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={menu} className={inputClass} maxLength={120} /></div>
      </div>

      <div className="mt-4 max-h-[55vh] space-y-4 overflow-y-auto pr-1">
        {groups.map((g) => (
          <div key={g.name}>
            <p className="mb-1.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-ink-faint">{g.name}</p>
            <ul className="divide-y divide-line rounded-lg ring-1 ring-line">
              {g.items.map((s) => {
                const on = Number(qty[s.id]) > 0;
                return (
                  <li key={s.id} className={cn("flex items-start gap-3 px-3 py-2", on && "bg-brand-50/40")}>
                    <input type="checkbox" checked={on} onChange={() => toggle(s)} aria-label={`Add ${s.name}`} className="mt-1 h-4 w-4 rounded border-line-strong text-brand-600" />
                    <button type="button" onClick={() => toggle(s)} className="min-w-0 flex-1 text-left">
                      <span className="block text-[0.8125rem] font-medium text-ink">{s.name}</span>
                      {s.description && <span className="block text-[0.75rem] text-ink-muted">{s.description}</span>}
                    </button>
                    <span className="shrink-0 pt-0.5 text-right text-[0.7812rem] text-ink-muted">{money(s.unit_price, currency, { cents: true })}{s.unit ? <span className="text-ink-faint"> /{s.unit === "person" ? "pp" : s.unit}</span> : null}</span>
                    <input type="number" min={0} step="1" inputMode="numeric" value={qty[s.id] ?? ""} placeholder="0" aria-label={`Quantity of ${s.name}`}
                      onChange={(e) => setQty((all) => ({ ...all, [s.id]: e.target.value }))}
                      className={cn(inputClass, "w-20 shrink-0 py-1 text-right")} />
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-4"><FormError message={error} /></div>
      <div className="mt-3 flex flex-wrap items-center justify-end gap-3">
        <span className="mr-auto text-[0.7812rem] text-ink-muted">{picked.length} item{picked.length === 1 ? "" : "s"} · {money(subtotal, currency, { cents: true })} + GST</span>
        <Button type="button" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={pending || !picked.length}>{pending ? "Adding…" : "Add to quote"}</Button>
      </div>
    </form>
  );
}
