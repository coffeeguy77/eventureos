"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormError, Input, Label, Select } from "@/components/ui/form";
import { importShopEmailsNow, saveAusPostSettings, saveShopImportSettings } from "@/app/(app)/store/actions";
import { PACKAGING, type AusPostSettings } from "@/lib/shop/auspost";

function useSave() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const go = (fn: () => Promise<{ ok: true; data: string } | { ok: false; error: string }>) => start(async () => {
    setMsg(null);
    const r = await fn().catch(() => ({ ok: false as const, error: "Couldn't reach the server." }));
    setMsg(r.ok ? { ok: true, text: r.data } : { ok: false, text: r.error });
    router.refresh();
  });
  return { pending, msg, go };
}

/** WooCommerce order emails → shop orders. */
export function ShopEmailsForm({ initial, gmail }: { initial: { enabled: boolean; subjects: string[]; since: string | null }; gmail: boolean }) {
  const [v, setV] = useState({ ...initial, subjects: [...initial.subjects, "", ""].slice(0, Math.max(2, initial.subjects.length)) });
  const { pending, msg, go } = useSave();
  return (
    <Card className="mt-6 max-w-3xl p-5 sm:p-6">
      <h2 className="text-[0.9375rem] font-semibold text-ink">Orders from WooCommerce emails</h2>
      <p className="mt-1 text-[0.8125rem] text-ink-muted">While your website still takes orders through WooCommerce, EventureOS reads its &quot;New order&quot; and &quot;subscription renewal&quot; emails from Gmail every 10 minutes, so you can pack, post and track them here. Barista course bookings and emailed gift cards in those emails are left out — they belong in Bookings. Nothing is sent to customers and WooCommerce isn&apos;t changed.</p>
      {!gmail && <p className="mt-2 text-[0.8125rem] text-amber-700">Gmail isn&apos;t connected — connect it in Settings → Integrations.</p>}
      <label className="mt-4 flex items-center gap-2 text-[0.875rem] text-ink"><input type="checkbox" className="h-4 w-4 accent-brand-500" checked={v.enabled} onChange={(e) => setV({ ...v, enabled: e.target.checked })} />Read shop orders from the order emails</label>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {v.subjects.map((s, i) => (
          <div key={i}><Label htmlFor={`se-${i}`} hint="subject starts with">{i === 0 ? "New order emails" : i === 1 ? "Renewal emails" : "Also"}</Label>
            <Input id={`se-${i}`} value={s} onChange={(e) => setV({ ...v, subjects: v.subjects.map((x, j) => (j === i ? e.target.value : x)) })} /></div>
        ))}
        <div><Label htmlFor="se-since" hint="first time only">Read orders from</Label><Input id="se-since" type="date" value={v.since ?? ""} onChange={(e) => setV({ ...v, since: e.target.value || null })} /></div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant="primary" disabled={pending} onClick={() => go(() => saveShopImportSettings({ enabled: v.enabled, subjects: v.subjects, since: v.since }))}>{pending ? "Saving…" : "Save"}</Button>
        {initial.enabled && <Button disabled={pending} onClick={() => go(importShopEmailsNow)}>Check for new orders now</Button>}
        {msg && <span className={msg.ok ? "text-[0.8125rem] text-emerald-700" : "text-[0.8125rem] text-rose-700"}>{msg.text}</span>}
      </div>
    </Card>
  );
}

/** Australia Post (MyPost Business): who parcels come from, and the usual packaging. */
export function AusPostForm({ initial }: { initial: AusPostSettings }) {
  const [v, setV] = useState(initial);
  const { pending, msg, go } = useSave();
  const f = (k: keyof AusPostSettings["from"], label: string, opts: { hint?: string; max?: number } = {}) => (
    <div><Label htmlFor={`ap-${k}`} hint={opts.hint}>{label}</Label><Input id={`ap-${k}`} value={v.from[k]} maxLength={opts.max} onChange={(e) => setV({ ...v, from: { ...v.from, [k]: e.target.value } })} /></div>
  );
  const num = (k: "length" | "width" | "height", label: string) => (
    <div><Label htmlFor={`ap-${k}`} hint="cm">{label}</Label><Input id={`ap-${k}`} type="number" min={1} max={104} value={v[k] ?? ""} onChange={(e) => setV({ ...v, [k]: e.target.value ? Number(e.target.value) : null })} /></div>
  );
  return (
    <Card className="mt-6 max-w-3xl p-5 sm:p-6">
      <h2 className="text-[0.9375rem] font-semibold text-ink">Australia Post (MyPost Business)</h2>
      <p className="mt-1 text-[0.8125rem] text-ink-muted">Tick orders, then &quot;Post with Australia Post&quot; makes a file to import in MyPost Business (Import CSV), where you pay for and print the labels. Paste the tracking numbers back and they go on each order — and on the customer&apos;s order page.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {f("name", "Send from name", { max: 35 })}{f("business", "Business name", { max: 40 })}
        {f("line1", "Address", { max: 40 })}{f("line2", "Address line 2", { max: 40 })}
        {f("suburb", "Suburb", { max: 30 })}
        <div className="grid grid-cols-2 gap-3">
          <div><Label htmlFor="ap-state">State</Label><Select id="ap-state" value={v.from.state} onChange={(e) => setV({ ...v, from: { ...v.from, state: e.target.value } })}><option value="">—</option>{["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"].map((s) => <option key={s}>{s}</option>)}</Select></div>
          {f("postcode", "Postcode", { max: 4 })}
        </div>
        {f("phone", "Phone", { hint: "10 digits", max: 14 })}{f("email", "Email", { max: 50 })}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2"><Label htmlFor="ap-pk">Usual packaging</Label><Select id="ap-pk" value={v.packaging} onChange={(e) => setV({ ...v, packaging: e.target.value as AusPostSettings["packaging"] })}>{PACKAGING.map((p) => <option key={p.id} value={p.id}>{p.label} (up to {p.maxKg} kg)</option>)}</Select></div>
        <div><Label htmlFor="ap-sv">Service</Label><Select id="ap-sv" value={v.service} onChange={(e) => setV({ ...v, service: e.target.value as "PP" | "EXP" })}><option value="PP">Parcel Post</option><option value="EXP">Express Post</option></Select></div>
        {v.packaging === "OWN_PACKAGING" && <>{num("length", "Length")}{num("width", "Width")}{num("height", "Height")}</>}
        <div><Label htmlFor="ap-g" hint="grams">Packing weight</Label><Input id="ap-g" type="number" min={0} max={5000} value={v.packingGrams} onChange={(e) => setV({ ...v, packingGrams: Number(e.target.value) })} /></div>
        <label className="flex items-end gap-2 pb-2 text-[0.8125rem] text-ink sm:col-span-2"><input type="checkbox" className="h-4 w-4 accent-brand-500" checked={v.signature} onChange={(e) => setV({ ...v, signature: e.target.checked })} />Signature on delivery</label>
      </div>
      <p className="mt-2 text-[0.75rem] text-ink-faint">Parcel weight = each bag&apos;s size × quantity + the packing weight. You can change any parcel before making the file.</p>
      <div className="mt-4 flex items-center gap-3">
        <Button variant="primary" disabled={pending} onClick={() => go(() => saveAusPostSettings(v as unknown as Record<string, unknown>))}>{pending ? "Saving…" : "Save"}</Button>
        {msg && <span className={msg.ok ? "text-[0.8125rem] text-emerald-700" : "text-[0.8125rem] text-rose-700"}>{msg.text}</span>}
      </div>
      <FormError message={null} />
    </Card>
  );
}
