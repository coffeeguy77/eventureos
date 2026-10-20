"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormError, Input, Label, Select, Textarea } from "@/components/ui/form";
import { saveCustomer, type CustomerInput } from "@/app/(app)/wholesale/actions";
import { WEEKDAYS } from "@/lib/wholesale/rules";

/** Add / edit a wholesale customer: details, how they pay, their price group and delivery day. */
export function CustomerForm({ id, initial, groups, defaultDay, canEdit }: { id: string | null; initial: CustomerInput; groups: string[]; defaultDay: number; canEdit: boolean }) {
  const router = useRouter();
  const [v, setV] = useState<CustomerInput>(initial);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const set = <K extends keyof CustomerInput>(k: K, val: CustomerInput[K]) => { setV((x) => ({ ...x, [k]: val })); setSaved(false); };
  const save = () => start(async () => {
    setErr(null);
    const r = await saveCustomer(id, v).catch(() => ({ ok: false as const, error: "Couldn't reach the server." }));
    if (!r.ok) { setErr(r.error); return; }
    setSaved(true);
    if (!id) router.push(`/wholesale/customers/${r.data.id}`); else router.refresh();
  });
  const text = (k: keyof CustomerInput, label: string, o: { type?: string; hint?: string; span?: boolean } = {}) => (
    <div className={o.span ? "sm:col-span-2" : undefined}><Label htmlFor={`wc-${k}`} hint={o.hint}>{label}</Label>
      <Input id={`wc-${k}`} type={o.type ?? "text"} value={(v[k] as string | null) ?? ""} onChange={(e) => set(k, e.target.value as never)} disabled={!canEdit} /></div>
  );
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        {text("name", "Name", { hint: "as they're known (trading name)" })}
        {text("business_name", "Business / billing name")}
        {text("contact_name", "Contact person")}
        {text("phone", "Phone", { type: "tel" })}
        {text("email", "Email", { type: "email", hint: "order confirmations and the ordering link" })}
        {text("billing_email", "Accounts email", { type: "email", hint: "if different" })}
        {text("address1", "Address", { span: true })}
        {text("address2", "Address line 2", { span: true })}
        {text("suburb", "Suburb")}
        <div className="grid grid-cols-2 gap-3">{text("state", "State")}{text("postcode", "Postcode")}</div>
        {text("abn", "ABN")}
        <div><Label htmlFor="wc-group" hint="their special prices">Price group</Label>
          <Input id="wc-group" list="wc-groups" value={v.price_group ?? ""} onChange={(e) => set("price_group", e.target.value)} disabled={!canEdit} placeholder="Standard prices" />
          <datalist id="wc-groups">{groups.map((g) => <option key={g} value={g} />)}</datalist></div>
      </div>
      <fieldset className="rounded-xl p-4 ring-1 ring-inset ring-line">
        <legend className="px-1 text-[0.8125rem] font-semibold text-ink">Ordering & payment</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label htmlFor="wc-pay">How they pay</Label>
            <Select id="wc-pay" value={v.payment_mode} onChange={(e) => set("payment_mode", e.target.value as "card" | "invoice")} disabled={!canEdit}>
              <option value="card">Card when they order (Stripe)</option>
              <option value="invoice">On account — pay by invoice</option>
            </Select></div>
          {v.payment_mode === "invoice" && <div><Label htmlFor="wc-terms" hint="days after ordering">Payment terms</Label><Input id="wc-terms" type="number" min={0} max={120} value={v.payment_terms_days} onChange={(e) => set("payment_terms_days", Number(e.target.value))} disabled={!canEdit} /></div>}
          <div><Label htmlFor="wc-day">Delivery day</Label>
            <Select id="wc-day" value={v.delivery_weekday ?? ""} onChange={(e) => set("delivery_weekday", e.target.value === "" ? null : Number(e.target.value))} disabled={!canEdit}>
              <option value="">Usual run ({WEEKDAYS[defaultDay]})</option>
              {WEEKDAYS.map((d, i) => i === defaultDay ? null : <option key={d} value={i}>{d}</option>)}
            </Select></div>
          <div><Label htmlFor="wc-min" hint="before GST, 0 = none">Minimum order $</Label><Input id="wc-min" type="number" min={0} step="0.01" value={v.min_order} onChange={(e) => set("min_order", Number(e.target.value))} disabled={!canEdit} /></div>
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label htmlFor="wc-del" hint="shown on the run sheet">Delivery instructions</Label><Textarea id="wc-del" rows={2} value={v.delivery_instructions ?? ""} onChange={(e) => set("delivery_instructions", e.target.value)} disabled={!canEdit} /></div>
        <div><Label htmlFor="wc-notes" hint="only your team">Notes</Label><Textarea id="wc-notes" rows={2} value={v.notes ?? ""} onChange={(e) => set("notes", e.target.value)} disabled={!canEdit} /></div>
      </div>
      <label className="flex items-center gap-2 text-[0.8125rem] text-ink"><input type="checkbox" className="h-4 w-4 accent-brand-500" checked={v.active} onChange={(e) => set("active", e.target.checked)} disabled={!canEdit} />Active <span className="text-ink-faint">(untick when they stop ordering — their ordering link stops working)</span></label>
      <FormError message={err} />
      {canEdit && <div className="flex items-center justify-end gap-3">{saved && <span className="text-[0.75rem] text-emerald-700">Saved.</span>}<Button variant="primary" onClick={save} disabled={pending || !v.name.trim()}>{pending ? "Saving…" : id ? "Save changes" : "Add customer"}</Button></div>}
    </div>
  );
}
