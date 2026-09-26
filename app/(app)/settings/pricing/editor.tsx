"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormError, Label, inputClass } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";
import type { PackageRules } from "@/lib/pricing/engine";
import { deletePackage, deleteService, savePackage, saveService, type ServiceInput } from "./actions";

interface Service extends ServiceInput { id: string; position: number }
interface Pkg { id: string; name: string; summary: string | null; rules: PackageRules; active: boolean }

const blankService: ServiceInput = { code: null, name: "", description: null, category: null, unit: "each", unit_price: 0, tax_rate: 10, xero_account_code: null, active: true };

export function PricingEditor({ services, packages, canEdit, currency }: { services: Service[]; packages: Pkg[]; canEdit: boolean; currency: string }) {
  const [editing, setEditing] = useState<string | null>(null); // service id or "new"
  const [editingPkg, setEditingPkg] = useState<string | null>(null);
  const byId = new Map(services.map((s) => [s.id, s]));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Price list"
          subtitle="Everything you charge for. Prices are excluding GST. These appear in Quick add on every quote."
          action={canEdit ? <Button size="sm" onClick={() => setEditing("new")}><Plus className="h-3.5 w-3.5" />Add service</Button> : undefined} />
        {!canEdit && <p className="mx-5 mb-4 rounded-lg bg-zinc-50 px-3 py-2 text-[12.5px] text-ink-muted ring-1 ring-inset ring-line">Only owners, admins and managers can change prices.</p>}
        <ul className="divide-y divide-line border-t border-line">
          {editing === "new" && <li className="px-5 py-4"><ServiceForm initial={blankService} onDone={() => setEditing(null)} /></li>}
          {services.map((s) => (
            <li key={s.id} className="px-5 py-3">
              {editing === s.id ? <ServiceForm initial={s} onDone={() => setEditing(null)} /> : (
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13.5px] font-medium text-ink">{s.name}</span>
                      {s.code && <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] text-ink-muted">{s.code}</span>}
                      {!s.active && <Badge tone="neutral">Off</Badge>}
                    </div>
                    {s.description && <p className="mt-0.5 line-clamp-2 text-[12.5px] text-ink-muted">{s.description}</p>}
                    <p className="mt-0.5 text-[12px] text-ink-faint">{[s.category, s.xero_account_code ? `Xero account ${s.xero_account_code}` : null].filter(Boolean).join(" · ")}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-[13.5px] font-semibold text-ink">{money(s.unit_price, currency, { cents: true })}{s.unit ? <span className="font-normal text-ink-muted"> /{s.unit}</span> : null}</div>
                    <div className="text-[11.5px] text-ink-faint">+{s.tax_rate}% GST = {money(s.unit_price * (1 + s.tax_rate / 100), currency, { cents: true })}</div>
                  </div>
                  {canEdit && <button onClick={() => setEditing(s.id)} className="rounded-md p-1.5 text-ink-faint hover:bg-zinc-100 hover:text-ink" aria-label={`Edit ${s.name}`}><Pencil className="h-4 w-4" /></button>}
                </div>
              )}
            </li>
          ))}
          {!services.length && editing !== "new" && <li className="px-5 py-6 text-center text-[13px] text-ink-muted">No services yet.</li>}
        </ul>
      </Card>

      <Card>
        <CardHeader title="Packages & rules"
          subtitle="How a job is priced from its times and number of serves. Used by “Price a job” on a quote."
          action={canEdit && services.length ? <Button size="sm" onClick={() => setEditingPkg("new")}><Plus className="h-3.5 w-3.5" />Add package</Button> : undefined} />
        <ul className="divide-y divide-line border-t border-line">
          {editingPkg === "new" && <li className="px-5 py-4"><PackageForm initial={{ id: "", name: "", summary: null, rules: {}, active: true }} services={services} onDone={() => setEditingPkg(null)} /></li>}
          {packages.map((p) => (
            <li key={p.id} className="px-5 py-4">
              {editingPkg === p.id ? <PackageForm initial={p} services={services} onDone={() => setEditingPkg(null)} /> : (
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2"><span className="text-[14px] font-semibold text-ink">{p.name}</span>{!p.active && <Badge tone="neutral">Off</Badge>}</div>
                    {p.summary && <p className="text-[12.5px] text-ink-muted">{p.summary}</p>}
                    <ul className="mt-2 space-y-0.5 text-[12.5px] text-ink">
                      {describeRules(p.rules, byId, currency).map((l, i) => <li key={i}>• {l}</li>)}
                    </ul>
                  </div>
                  {canEdit && <button onClick={() => setEditingPkg(p.id)} className="rounded-md p-1.5 text-ink-faint hover:bg-zinc-100 hover:text-ink" aria-label={`Edit ${p.name}`}><Pencil className="h-4 w-4" /></button>}
                </div>
              )}
            </li>
          ))}
          {!packages.length && editingPkg !== "new" && <li className="px-5 py-6 text-center text-[13px] text-ink-muted">No packages yet.</li>}
        </ul>
      </Card>
    </div>
  );
}

function describeRules(r: PackageRules, byId: Map<string, Service>, currency: string): string[] {
  const nm = (id?: string) => (id && byId.get(id)) || null;
  const p = (s: Service | null, per = true) => s ? `${s.name} ${money(s.unit_price, currency, { cents: true })}${per && s.unit ? "/" + s.unit : ""} + GST` : "⚠ missing service";
  const out: string[] = [];
  if (r.hire) out.push(`Hire: ${p(nm(r.hire.service_id), false)}`);
  out.push(r.delivery ? `Delivery: ${p(nm(r.delivery.service_id), false)}` : "No delivery charge");
  if (r.staff) {
    const s = r.staff;
    const bits = [p(nm(s.service_id))];
    if (s.setup_minutes) bits.push(`charged from ${s.setup_minutes} min before service`);
    if (s.packdown_minutes) bits.push(`plus ${s.packdown_minutes} min after`);
    if (s.min_hours) bits.push(`${s.min_hours} hr minimum per person`);
    if (s.included_hours) bits.push(`first ${s.included_hours} hr included${(s.included_applies_to ?? "first") === "first" ? " (first staff member only)" : " (each staff member)"}`);
    if (s.round_to_hours) bits.push(`rounded up to ${s.round_to_hours} hr`);
    out.push(`Staff: ${bits.join(", ")}`);
  }
  if (r.per_serve) out.push(`Per serve: ${p(nm(r.per_serve.service_id))}`);
  if (r.extra_staff) out.push(`Suggest a 2nd staff member when over ${r.extra_staff.serves_over} serves and service is ${r.extra_staff.max_service_hours} hrs or less`);
  return out;
}

function ServiceForm({ initial, onDone }: { initial: ServiceInput & { id?: string }; onDone: () => void }) {
  const router = useRouter();
  const [v, setV] = useState({ ...initial, unit_price: String(initial.unit_price), tax_rate: String(initial.tax_rate) });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setPending(true); setError(null);
    const r = await saveService({ ...v, unit_price: Number(v.unit_price), tax_rate: Number(v.tax_rate) });
    setPending(false);
    if (!r.ok) { setError(r.error); return; }
    router.refresh(); onDone();
  }
  async function remove() {
    if (!initial.id || !confirm(`Delete ${initial.name}? Existing quotes keep their lines.`)) return;
    setPending(true);
    const r = await deleteService(initial.id);
    setPending(false);
    if (!r.ok) { setError(r.error); return; }
    router.refresh(); onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
        <div><Label htmlFor="sv-name">Name</Label><input id="sv-name" value={v.name} onChange={set("name")} className={inputClass} required maxLength={200} /></div>
        <div><Label htmlFor="sv-code" hint="Xero item code">Code</Label><input id="sv-code" value={v.code ?? ""} onChange={set("code")} className={inputClass} maxLength={60} /></div>
      </div>
      <div><Label htmlFor="sv-desc">Description on the quote</Label><textarea id="sv-desc" value={v.description ?? ""} onChange={set("description")} className={cn(inputClass, "min-h-[70px]")} maxLength={4000} /></div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div><Label htmlFor="sv-price" hint="ex GST">Price</Label><input id="sv-price" type="number" step="0.01" min={0} value={v.unit_price} onChange={set("unit_price")} className={inputClass} required /></div>
        <div><Label htmlFor="sv-unit" hint="hour, cup…">Per</Label><input id="sv-unit" value={v.unit ?? ""} onChange={set("unit")} className={inputClass} maxLength={40} /></div>
        <div><Label htmlFor="sv-tax">GST %</Label><input id="sv-tax" type="number" step="0.01" min={0} max={100} value={v.tax_rate} onChange={set("tax_rate")} className={inputClass} /></div>
        <div><Label htmlFor="sv-cat">Group</Label><input id="sv-cat" value={v.category ?? ""} onChange={set("category")} className={inputClass} maxLength={80} /></div>
        <div><Label htmlFor="sv-acc" hint="Xero">Account</Label><input id="sv-acc" value={v.xero_account_code ?? ""} onChange={set("xero_account_code")} className={inputClass} maxLength={20} /></div>
      </div>
      <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} className="h-4 w-4 rounded" />Available on quotes</label>
      <FormError message={error} />
      <div className="flex items-center gap-2">
        {initial.id && <Button type="button" variant="danger" size="sm" onClick={remove} disabled={pending}><Trash2 className="h-3.5 w-3.5" />Delete</Button>}
        <span className="flex-1" />
        <Button type="button" size="sm" onClick={onDone}>Cancel</Button>
        <Button type="submit" size="sm" variant="primary" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
      </div>
    </form>
  );
}

function ServicePick({ id, label, value, onChange, services, optional }: { id: string; label: string; value: string | undefined; onChange: (v: string) => void; services: Service[]; optional?: string }) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <select id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={cn(inputClass, "pr-8")}>
        <option value="">{optional ?? "None"}</option>
        {services.map((s) => <option key={s.id} value={s.id}>{s.name}{s.code ? ` (${s.code})` : ""}</option>)}
      </select>
    </div>
  );
}

function PackageForm({ initial, services, onDone }: { initial: Pkg; services: Service[]; onDone: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [summary, setSummary] = useState(initial.summary ?? "");
  const [active, setActive] = useState(initial.active);
  const r = initial.rules;
  const [hire, setHire] = useState(r.hire?.service_id ?? "");
  const [delivery, setDelivery] = useState(r.delivery?.service_id ?? "");
  const [perServe, setPerServe] = useState(r.per_serve?.service_id ?? "");
  const [staffSvc, setStaffSvc] = useState(r.staff?.service_id ?? "");
  const [label, setLabel] = useState(r.staff?.label ?? "barista");
  const [setup, setSetup] = useState(String(r.staff?.setup_minutes ?? 0));
  const [packdown, setPackdown] = useState(String(r.staff?.packdown_minutes ?? 0));
  const [minH, setMinH] = useState(String(r.staff?.min_hours ?? 0));
  const [incl, setIncl] = useState(String(r.staff?.included_hours ?? 0));
  const [inclTo, setInclTo] = useState<"first" | "each">(r.staff?.included_applies_to ?? "first");
  const [round, setRound] = useState(String(r.staff?.round_to_hours ?? 0.5));
  const [extraOn, setExtraOn] = useState(!!r.extra_staff);
  const [extraServes, setExtraServes] = useState(String(r.extra_staff?.serves_over ?? 100));
  const [extraHours, setExtraHours] = useState(String(r.extra_staff?.max_service_hours ?? 3));
  const [extraReason, setExtraReason] = useState(r.extra_staff?.reason ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setPending(true); setError(null);
    const rules: PackageRules = {
      hire: hire ? { service_id: hire } : null,
      delivery: delivery ? { service_id: delivery } : null,
      per_serve: perServe ? { service_id: perServe } : null,
      staff: staffSvc ? {
        service_id: staffSvc, label: label.trim() || "staff", setup_minutes: Number(setup) || 0, packdown_minutes: Number(packdown) || 0,
        min_hours: Number(minH) || 0, included_hours: Number(incl) || 0, included_applies_to: inclTo, round_to_hours: Number(round) || 0,
      } : null,
      extra_staff: staffSvc && extraOn ? { serves_over: Number(extraServes) || 0, max_service_hours: Number(extraHours) || 0, reason: extraReason.trim() || undefined } : null,
    };
    const res = await savePackage({ id: initial.id || undefined, name, summary: summary || null, rules, active });
    setPending(false);
    if (!res.ok) { setError(res.error); return; }
    router.refresh(); onDone();
  }
  async function remove() {
    if (!initial.id || !confirm(`Delete the ${initial.name} package?`)) return;
    setPending(true);
    const res = await deletePackage(initial.id);
    setPending(false);
    if (!res.ok) { setError(res.error); return; }
    router.refresh(); onDone();
  }
  const num = (id: string, lbl: string, val: string, set: (v: string) => void, hint?: string, step = "0.5") => (
    <div><Label htmlFor={id} hint={hint}>{lbl}</Label><input id={id} type="number" min={0} step={step} value={val} onChange={(e) => set(e.target.value)} className={inputClass} /></div>
  );

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label htmlFor="pk-name">Package name</Label><input id="pk-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} required maxLength={120} /></div>
        <div><Label htmlFor="pk-sum" hint="shown when picking">Summary</Label><input id="pk-sum" value={summary} onChange={(e) => setSummary(e.target.value)} className={inputClass} maxLength={300} /></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <ServicePick id="pk-hire" label="Hire" value={hire} onChange={setHire} services={services} />
        <ServicePick id="pk-del" label="Delivery / setup" value={delivery} onChange={setDelivery} services={services} optional="None (no delivery charge)" />
        <ServicePick id="pk-serve" label="Per serve" value={perServe} onChange={setPerServe} services={services} />
      </div>
      <fieldset className="rounded-lg p-3 ring-1 ring-inset ring-line">
        <legend className="px-1 text-[12.5px] font-semibold text-ink">Staff</legend>
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2"><ServicePick id="pk-staff" label="Hourly rate" value={staffSvc} onChange={setStaffSvc} services={services} optional="No staff charge" /></div>
          <div><Label htmlFor="pk-label">Called</Label><input id="pk-label" value={label} onChange={(e) => setLabel(e.target.value)} className={inputClass} maxLength={30} /></div>
          {num("pk-round", "Round up to", round, setRound, "hrs")}
          {num("pk-setup", "Paid before service", setup, setSetup, "min", "5")}
          {num("pk-pack", "Paid after service", packdown, setPackdown, "min", "5")}
          {num("pk-min", "Minimum per person", minH, setMinH, "hrs")}
          {num("pk-incl", "Hours included", incl, setIncl, "not charged")}
        </div>
        {Number(incl) > 0 && (
          <div className="mt-3 flex flex-wrap gap-4 text-[13px]">
            <label className="flex items-center gap-2"><input type="radio" checked={inclTo === "first"} onChange={() => setInclTo("first")} />Included hours for the first staff member only</label>
            <label className="flex items-center gap-2"><input type="radio" checked={inclTo === "each"} onChange={() => setInclTo("each")} />For each staff member</label>
          </div>
        )}
        <label className="mt-3 flex items-center gap-2 text-[13px]"><input type="checkbox" checked={extraOn} onChange={(e) => setExtraOn(e.target.checked)} className="h-4 w-4 rounded" />Recommend a second staff member for busy, short jobs</label>
        {extraOn && (
          <div className="mt-2 grid gap-3 sm:grid-cols-[120px_120px_1fr]">
            {num("pk-xs", "Over serves", extraServes, setExtraServes, undefined, "1")}
            {num("pk-xh", "Service hrs ≤", extraHours, setExtraHours)}
            <div><Label htmlFor="pk-xr" hint="shown when pricing">Why</Label><input id="pk-xr" value={extraReason} onChange={(e) => setExtraReason(e.target.value)} className={inputClass} maxLength={500} /></div>
          </div>
        )}
      </fieldset>
      <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 rounded" />Available in “Price a job”</label>
      <FormError message={error} />
      <div className="flex items-center gap-2">
        {initial.id && <Button type="button" variant="danger" size="sm" onClick={remove} disabled={pending}><Trash2 className="h-3.5 w-3.5" />Delete</Button>}
        <span className="flex-1" />
        <Button type="button" size="sm" onClick={onDone}>Cancel</Button>
        <Button type="submit" size="sm" variant="primary" disabled={pending}>{pending ? "Saving…" : "Save package"}</Button>
      </div>
    </form>
  );
}
