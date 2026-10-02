"use client";

import { useEffect, useMemo, useState } from "react";
import { Calculator, Lightbulb, X } from "lucide-react";
import { addPricedSection } from "@/app/(app)/quotes/actions";
import { Button } from "@/components/ui/button";
import { FormError, Label, inputClass } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";
import { isDaily, needsTimes, priceJob, suggestedStaff, serviceHours, type PackageRules, type PricedService } from "@/lib/pricing/engine";
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
  defaults: { start: string | null; end: string | null; guests: number | null; days?: number | null };
  currency: string;
  onClose: () => void;
  onAdded: (section: QSection, items: QItem[]) => void;
}) {
  const [pkgId, setPkgId] = useState(packages[0]?.id ?? "");
  const [start, setStart] = useState(defaults.start?.slice(0, 5) ?? "");
  const [end, setEnd] = useState(defaults.end?.slice(0, 5) ?? "");
  const [serves, setServes] = useState(defaults.guests != null ? String(defaults.guests) : "");
  const [staff, setStaff] = useState<string | null>(null); // null = follow the recommendation
  // "include" = we deliver; "pickup" = they collect; "choice" = show delivery as an optional extra
  const [deliveryMode, setDeliveryMode] = useState<"include" | "pickup" | "choice">("include");
  const [days, setDays] = useState(String(defaults.days ?? 1));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pkg = packages.find((p) => p.id === pkgId) ?? null;
  const pickupLabel = pkg?.rules.delivery?.no_delivery_label ?? null;
  // Packages with a free-pickup option default to letting the customer choose
  useEffect(() => { setDeliveryMode(pickupLabel ? "choice" : "include"); }, [pkgId, pickupLabel]);
  const delivery = deliveryMode === "include";
  const offerDelivery = deliveryMode === "choice";
  const timed = pkg ? needsTimes(pkg.rules) : true;
  const daily = !!pkg?.rules.hire && isDaily(services.find((x) => x.id === pkg.rules.hire!.service_id)?.unit);
  const dayN = Math.max(1, Math.min(365, Math.floor(Number(days) || 1)));
  // Equipment-only hires have no times; the engine only uses them for staff and per-serve pricing
  const s = timed ? toMin(start) : 0, e = timed ? toMin(end) : 0;
  const n = Math.max(0, Math.floor(Number(serves) || 0));
  const recommended = pkg && s != null && e != null ? suggestedStaff(pkg.rules, n, serviceHours(s, e)) : 1;
  const staffN = staff != null ? Math.max(0, Math.floor(Number(staff) || 0)) : recommended;

  const preview = useMemo(() => {
    if (!pkg || s == null || e == null) return null;
    try {
      return { ok: true as const, r: priceJob(pkg.rules, services, { start_minutes: s, end_minutes: e, serves: timed ? n : 0, staff_count: timed ? staffN : 0, include_delivery: delivery, offer_delivery: offerDelivery, days: dayN }) };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  }, [pkg, services, s, e, n, staffN, delivery, offerDelivery, timed, dayN]);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setError(null);
    if (!pkg) { setError("Choose a package."); return; }
    if (s == null || e == null) { setError("Enter the service start and finish times."); return; }
    setPending(true);
    const res = await addPricedSection(quoteId, { packageId: pkg.id, start: timed ? start : "", end: timed ? end : "", serves: timed ? n : 0, staff: timed ? staffN : 0, includeDelivery: delivery, offerDelivery, days: dayN })
      .catch(() => ({ ok: false as const, error: "Couldn't reach the server. Check your connection and try again." }));
    setPending(false);
    if (!res.ok) { setError(res.error); return; }
    onAdded(res.data.section, res.data.items);
  }

  if (!packages.length) {
    return (
      <div className="rounded-xl border border-line bg-surface p-4 text-[0.8125rem] text-ink-muted shadow-card">
        No packages yet. Add your services and packages in <a className="font-medium text-brand-700 underline" href="/settings/pricing">Settings → Services &amp; pricing</a>.
        <button type="button" onClick={onClose} className="ml-2 text-ink-faint hover:text-ink">Close</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-brand-200 bg-surface p-4 shadow-card sm:p-5" aria-label="Price a job">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-[0.875rem] font-semibold text-ink"><Calculator className="h-4 w-4 text-brand-600" />Price a job</p>
          <p className="mt-0.5 text-[0.7812rem] text-ink-muted">Adds a section with the lines worked out from your price list.</p>
        </div>
        <button type="button" onClick={onClose} className="-m-1.5 rounded-md p-2.5 text-ink-faint hover:bg-zinc-100 hover:text-ink sm:m-0 sm:p-1" aria-label="Close"><X className="h-4 w-4" /></button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {packages.map((p) => (
          <button key={p.id} type="button" onClick={() => setPkgId(p.id)}
            className={cn("rounded-lg px-3 py-2 text-left ring-1 ring-inset", p.id === pkgId ? "bg-brand-50 ring-brand-300" : "ring-line-strong hover:bg-zinc-50")}>
            <span className="block text-[0.8125rem] font-medium text-ink">{p.name}</span>
            {p.summary && <span className="block max-w-[260px] text-[0.7188rem] text-ink-muted">{p.summary}</span>}
          </button>
        ))}
      </div>

      {daily && (
        <div className="mt-4 max-w-[160px]"><Label htmlFor="pj-days" hint="charged per day">Hire days</Label>
          <input id="pj-days" type="number" min={1} max={365} inputMode="numeric" value={days} onChange={(x) => setDays(x.target.value)} className={inputClass} /></div>
      )}
      {timed && <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div><Label htmlFor="pj-start">Service starts</Label><input id="pj-start" type="time" value={start} onChange={(x) => setStart(x.target.value)} className={inputClass} required /></div>
        <div><Label htmlFor="pj-end">Service ends</Label><input id="pj-end" type="time" value={end} onChange={(x) => setEnd(x.target.value)} className={inputClass} required /></div>
        <div><Label htmlFor="pj-serves">Coffees / serves</Label><input id="pj-serves" type="number" min={0} inputMode="numeric" value={serves} onChange={(x) => setServes(x.target.value)} className={inputClass} /></div>
        <div>
          <Label htmlFor="pj-staff" hint={staff != null && staffN !== recommended ? `suggest ${recommended}` : undefined}>Staff</Label>
          <input id="pj-staff" type="number" min={0} max={20} inputMode="numeric" value={staff ?? String(recommended)} onChange={(x) => setStaff(x.target.value)} className={inputClass} />
        </div>
      </div>}
      {pkg?.rules.delivery && (pickupLabel ? (
        <fieldset className="mt-3">
          <legend className="text-[0.7812rem] font-medium text-ink">Delivery</legend>
          <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1.5 text-[0.8125rem] text-ink">
            {([["choice", "Let the customer choose"], ["include", "We deliver"], ["pickup", "Customer picks up"]] as const).map(([v, l]) => (
              <label key={v} className="flex items-center gap-2">
                <input type="radio" name="pj-delivery" checked={deliveryMode === v} onChange={() => setDeliveryMode(v)} className="h-4 w-4 accent-brand-500" />{l}
              </label>
            ))}
          </div>
          {deliveryMode === "choice" && <p className="mt-1 text-[0.75rem] text-ink-muted">Shows “{pickupLabel}” and delivery as an optional extra they can ask for.</p>}
        </fieldset>
      ) : (
        <label className="mt-3 flex items-center gap-2 text-[0.8125rem] text-ink">
          <input type="checkbox" checked={delivery} onChange={(x) => setDeliveryMode(x.target.checked ? "include" : "pickup")} className="h-4 w-4 rounded border-line-strong text-brand-600" />
          Include delivery, setup &amp; pickup
        </label>
      ))}

      {preview?.ok === false && <div className="mt-3"><FormError message={preview.error} /></div>}
      {preview?.ok && (
        <div className="mt-4 overflow-hidden rounded-lg ring-1 ring-line">
          <table className="w-full text-[0.7812rem]">
            <tbody>
              {preview.r.lines.map((l, i) => (
                <tr key={i} className="border-b border-line last:border-0">
                  <td className="px-3 py-2 align-top">
                    <div className="font-medium text-ink">{l.name}{l.optional && <span className="ml-1.5 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[0.6562rem] font-medium text-ink-muted">Optional</span>}</div>
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
        <p key={i} className="mt-3 flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[0.7812rem] text-amber-800 ring-1 ring-inset ring-amber-100">
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
