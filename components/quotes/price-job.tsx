"use client";

import { useMemo, useState } from "react";
import { Calculator, Lightbulb, X } from "lucide-react";
import { addPricedSection } from "@/app/(app)/quotes/actions";
import { Button } from "@/components/ui/button";
import { FormError, Label, inputClass } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";
import { priceJob, suggestedStaff, serviceHours, type PackageRules, type PricedService } from "@/lib/pricing/engine";
import type { QItem, QSection } from "./types";

export interface PricingPackage { id: string; name: string; summary: string | null; rules: PackageRules }

const toMin = (v: string) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(v);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

export function PriceJobPanel({ quoteId, packages, services, defaults, currency, onClose, onAdded }: {
  quoteId: string;
  packages: PricingPackage[];
  services: PricedService[];
  defaults: { start: string | null; end: string | null; guests: number | null };
  currency: string;
  onClose: () => void;
  onAdded: (section: QSection, items: QItem[]) => void;
}) {
  const [pkgId, setPkgId] = useState(packages[0]?.id ?? "");
  const [start, setStart] = useState(defaults.start?.slice(0, 5) ?? "");
  const [end, setEnd] = useState(defaults.end?.slice(0, 5) ?? "");
  const [serves, setServes] = useState(defaults.guests != null ? String(defaults.guests) : "");
  const [staff, setStaff] = useState<string | null>(null); // null = follow the recommendation
  const [delivery, setDelivery] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pkg = packages.find((p) => p.id === pkgId) ?? null;
  const s = toMin(start), e = toMin(end);
  const n = Math.max(0, Math.floor(Number(serves) || 0));
  const recommended = pkg && s != null && e != null ? suggestedStaff(pkg.rules, n, serviceHours(s, e)) : 1;
  const staffN = staff != null ? Math.max(0, Math.floor(Number(staff) || 0)) : recommended;

  const preview = useMemo(() => {
    if (!pkg || s == null || e == null) return null;
    try {
      return { ok: true as const, r: priceJob(pkg.rules, services, { start_minutes: s, end_minutes: e, serves: n, staff_count: staffN, include_delivery: delivery }) };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  }, [pkg, services, s, e, n, staffN, delivery]);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setError(null);
    if (!pkg) { setError("Choose a package."); return; }
    if (s == null || e == null) { setError("Enter the service start and finish times."); return; }
    setPending(true);
    const res = await addPricedSection(quoteId, { packageId: pkg.id, start, end, serves: n, staff: staffN, includeDelivery: delivery })
      .catch(() => ({ ok: false as const, error: "Couldn't reach the server. Check your connection and try again." }));
    setPending(false);
    if (!res.ok) { setError(res.error); return; }
    onAdded(res.data.section, res.data.items);
  }

  if (!packages.length) {
    return (
      <div className="rounded-xl border border-line bg-white p-4 text-[13px] text-ink-muted shadow-card">
        No packages yet. Add your services and packages in <a className="font-medium text-brand-700 underline" href="/settings/pricing">Settings → Services &amp; pricing</a>.
        <button type="button" onClick={onClose} className="ml-2 text-ink-faint hover:text-ink">Close</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-brand-200 bg-white p-4 shadow-card sm:p-5" aria-label="Price a job">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-[14px] font-semibold text-ink"><Calculator className="h-4 w-4 text-brand-600" />Price a job</p>
          <p className="mt-0.5 text-[12.5px] text-ink-muted">Adds a section with the lines worked out from your price list.</p>
        </div>
        <button type="button" onClick={onClose} className="-m-1.5 rounded-md p-2.5 text-ink-faint hover:bg-zinc-100 hover:text-ink sm:m-0 sm:p-1" aria-label="Close"><X className="h-4 w-4" /></button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {packages.map((p) => (
          <button key={p.id} type="button" onClick={() => setPkgId(p.id)}
            className={cn("rounded-lg px-3 py-2 text-left ring-1 ring-inset", p.id === pkgId ? "bg-brand-50 ring-brand-300" : "ring-line-strong hover:bg-zinc-50")}>
            <span className="block text-[13px] font-medium text-ink">{p.name}</span>
            {p.summary && <span className="block max-w-[260px] text-[11.5px] text-ink-muted">{p.summary}</span>}
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div><Label htmlFor="pj-start">Service starts</Label><input id="pj-start" type="time" value={start} onChange={(x) => setStart(x.target.value)} className={inputClass} required /></div>
        <div><Label htmlFor="pj-end">Service ends</Label><input id="pj-end" type="time" value={end} onChange={(x) => setEnd(x.target.value)} className={inputClass} required /></div>
        <div><Label htmlFor="pj-serves">Coffees / serves</Label><input id="pj-serves" type="number" min={0} inputMode="numeric" value={serves} onChange={(x) => setServes(x.target.value)} className={inputClass} /></div>
        <div>
          <Label htmlFor="pj-staff" hint={staff != null && staffN !== recommended ? `suggest ${recommended}` : undefined}>Staff</Label>
          <input id="pj-staff" type="number" min={0} max={20} inputMode="numeric" value={staff ?? String(recommended)} onChange={(x) => setStaff(x.target.value)} className={inputClass} />
        </div>
      </div>
      {pkg?.rules.delivery && (
        <label className="mt-3 flex items-center gap-2 text-[13px] text-ink">
          <input type="checkbox" checked={delivery} onChange={(x) => setDelivery(x.target.checked)} className="h-4 w-4 rounded border-line-strong text-brand-600" />
          Include delivery, setup &amp; pickup
        </label>
      )}

      {preview?.ok === false && <div className="mt-3"><FormError message={preview.error} /></div>}
      {preview?.ok && (
        <div className="mt-4 overflow-hidden rounded-lg ring-1 ring-line">
          <table className="w-full text-[12.5px]">
            <tbody>
              {preview.r.lines.map((l, i) => (
                <tr key={i} className="border-b border-line last:border-0">
                  <td className="px-3 py-2 align-top">
                    <div className="font-medium text-ink">{l.name}</div>
                    {l.kind === "staff" && l.description && <div className="text-ink-muted">{l.description}</div>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right align-top text-ink-muted">{l.quantity} × {money(l.unit_price, currency)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right align-top font-medium text-ink">{money(l.line_total, currency)}</td>
                </tr>
              ))}
              <tr className="bg-zinc-50">
                <td className="px-3 py-2 text-ink-muted" colSpan={2}>Subtotal {money(preview.r.subtotal, currency)} + GST {money(preview.r.tax_total, currency)}</td>
                <td className="px-3 py-2 text-right font-semibold text-ink">{money(preview.r.total, currency)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {preview?.ok && preview.r.notes.map((t, i) => (
        <p key={i} className="mt-3 flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800 ring-1 ring-inset ring-amber-100">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" />{t}
        </p>
      ))}

      <div className="mt-4"><FormError message={error} /></div>
      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={pending || !preview?.ok}>{pending ? "Adding…" : "Add to quote"}</Button>
      </div>
    </form>
  );
}
