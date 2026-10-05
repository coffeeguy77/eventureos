"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteBanner, saveBanner, saveCoupon, type BannerInput, type CouponInput } from "@/app/(app)/store/actions";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/form";
import { Card } from "@/components/ui/card";
import { PhotoUpload } from "@/components/bookings/course-tools";

const EMPTY_COUPON: CouponInput = { id: null, code: "", description: "", kind: "percent", value: 10, applies_to: "all", product_ids: [], min_spend: null, first_order_only: false, subscription_cycles: null, max_uses: null, per_customer: null, starts_on: null, ends_on: null, active: true };

export function CouponForm({ initial, products, onDone }: { initial?: CouponInput; products: { id: string; name: string }[]; onDone?: () => void }) {
  const router = useRouter();
  const [c, setC] = useState<CouponInput>(initial ?? EMPTY_COUPON);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const num = (v: string) => (v === "" ? null : Number(v));
  return (
    <Card className="space-y-3 p-5">
      <h2 className="font-semibold text-ink">{c.id ? `Edit ${c.code}` : "New coupon"}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label htmlFor="cp-c">Code</Label><Input id="cp-c" value={c.code} onChange={(e) => setC({ ...c, code: e.target.value.toUpperCase() })} placeholder="WELCOME10" /></div>
        <div><Label htmlFor="cp-k">Discount</Label><Select id="cp-k" value={c.kind} onChange={(e) => setC({ ...c, kind: e.target.value as CouponInput["kind"] })}><option value="percent">% off</option><option value="fixed">$ off</option><option value="free_shipping">Free shipping</option></Select></div>
        {c.kind !== "free_shipping" && <div><Label htmlFor="cp-v">{c.kind === "percent" ? "Percent off" : "Dollars off"}</Label><Input id="cp-v" type="number" min={0} value={c.value} onChange={(e) => setC({ ...c, value: Number(e.target.value) })} /></div>}
        <div><Label htmlFor="cp-a">Works on</Label><Select id="cp-a" value={c.applies_to} onChange={(e) => setC({ ...c, applies_to: e.target.value as CouponInput["applies_to"] })}><option value="all">Everything</option><option value="one_off">One-off orders only</option><option value="subscription">Subscriptions only</option></Select></div>
        {c.applies_to !== "one_off" && <div><Label htmlFor="cp-sc" hint="blank = every delivery">Subscription deliveries</Label><Input id="cp-sc" type="number" min={1} value={c.subscription_cycles ?? ""} onChange={(e) => setC({ ...c, subscription_cycles: num(e.target.value) })} placeholder="e.g. 3" /></div>}
        <div><Label htmlFor="cp-m">Minimum spend</Label><Input id="cp-m" type="number" min={0} value={c.min_spend ?? ""} onChange={(e) => setC({ ...c, min_spend: num(e.target.value) })} /></div>
        <div><Label htmlFor="cp-u" hint="blank = unlimited">Total uses</Label><Input id="cp-u" type="number" min={1} value={c.max_uses ?? ""} onChange={(e) => setC({ ...c, max_uses: num(e.target.value) })} /></div>
        <div><Label htmlFor="cp-pc">Uses per customer</Label><Input id="cp-pc" type="number" min={1} value={c.per_customer ?? ""} onChange={(e) => setC({ ...c, per_customer: num(e.target.value) })} /></div>
        <div><Label htmlFor="cp-s">Starts</Label><Input id="cp-s" type="date" value={c.starts_on ?? ""} onChange={(e) => setC({ ...c, starts_on: e.target.value || null })} /></div>
        <div><Label htmlFor="cp-e">Ends</Label><Input id="cp-e" type="date" value={c.ends_on ?? ""} onChange={(e) => setC({ ...c, ends_on: e.target.value || null })} /></div>
      </div>
      <div><Label htmlFor="cp-d" hint="shown to the customer">Description</Label><Input id="cp-d" value={c.description} onChange={(e) => setC({ ...c, description: e.target.value })} placeholder="10% off your first order" /></div>
      <div><Label hint="none ticked = every product">Only these products</Label>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">{products.map((p) => <label key={p.id} className="flex items-center gap-1.5 text-[0.8125rem]"><input type="checkbox" checked={c.product_ids.includes(p.id)} onChange={(e) => setC({ ...c, product_ids: e.target.checked ? [...c.product_ids, p.id] : c.product_ids.filter((x) => x !== p.id) })} />{p.name}</label>)}</div></div>
      <div className="flex flex-wrap gap-4 text-[0.8125rem]">
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={c.first_order_only} onChange={(e) => setC({ ...c, first_order_only: e.target.checked })} />First order only</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={c.active} onChange={(e) => setC({ ...c, active: e.target.checked })} />Active</label>
      </div>
      <div className="flex items-center gap-3">
        <Button type="button" variant="primary" disabled={pending} onClick={() => start(async () => { const r = await saveCoupon(c); setMsg(r.ok ? r.data : r.error); if (r.ok) { if (!c.id) setC(EMPTY_COUPON); router.refresh(); onDone?.(); } })}>Save coupon</Button>
        {onDone && <Button type="button" variant="secondary" onClick={onDone}>Close</Button>}
        {msg && <span className="text-[0.8125rem] text-ink-muted">{msg}</span>}
      </div>
    </Card>
  );
}

export function CouponRow({ c, products, uses, label }: { c: CouponInput; products: { id: string; name: string }[]; uses: number; label: string }) {
  const [edit, setEdit] = useState(false);
  if (edit) return <CouponForm initial={c} products={products} onDone={() => setEdit(false)} />;
  return (
    <button type="button" onClick={() => setEdit(true)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-zinc-50">
      <span className="font-mono font-semibold tracking-wide text-ink">{c.code}</span>
      <span className="flex-1 text-[0.8125rem] text-ink-muted">{label}</span>
      <span className="text-[0.8125rem] text-ink-muted">{uses} used{c.max_uses ? ` of ${c.max_uses}` : ""}</span>
      <span className={`rounded-full px-2 py-0.5 text-[0.7188rem] font-medium ${c.active ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-600"}`}>{c.active ? "Active" : "Off"}</span>
    </button>
  );
}

const EMPTY_BANNER: BannerInput = { id: null, title: "", body: "", cta_label: "", product_id: null, link_url: "", coupon_code: "", image_url: "", tone: "brand", placement: "shop", starts_on: null, ends_on: null, active: true, position: 0 };

export function BannerForm({ orgId, initial, products, onDone }: { orgId: string; initial?: BannerInput; products: { id: string; name: string }[]; onDone?: () => void }) {
  const router = useRouter();
  const [b, setB] = useState<BannerInput>(initial ?? EMPTY_BANNER);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Card className="space-y-3 p-5">
      <h2 className="font-semibold text-ink">{b.id ? "Edit banner" : "New banner"}</h2>
      <div><Label htmlFor="bn-t">Heading</Label><Input id="bn-t" value={b.title} onChange={(e) => setB({ ...b, title: e.target.value })} placeholder="New: Seasonal Espresso" /></div>
      <div><Label htmlFor="bn-b">Text</Label><Input id="bn-b" value={b.body} onChange={(e) => setB({ ...b, body: e.target.value })} placeholder="Black tea, caramel candy and citrus. Roasting this week." /></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label htmlFor="bn-p">Links to product</Label><Select id="bn-p" value={b.product_id ?? ""} onChange={(e) => setB({ ...b, product_id: e.target.value || null })}><option value="">— none —</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></div>
        <div><Label htmlFor="bn-l" hint="if no product">Or link</Label><Input id="bn-l" value={b.link_url} onChange={(e) => setB({ ...b, link_url: e.target.value })} placeholder="/shop/… or https://…" /></div>
        <div><Label htmlFor="bn-c" hint="optional">Coupon code to show</Label><Input id="bn-c" value={b.coupon_code} onChange={(e) => setB({ ...b, coupon_code: e.target.value.toUpperCase() })} /></div>
        <div><Label htmlFor="bn-cta">Button text</Label><Input id="bn-cta" value={b.cta_label} onChange={(e) => setB({ ...b, cta_label: e.target.value })} placeholder="Shop now" /></div>
        <div><Label htmlFor="bn-pl">Where</Label><Select id="bn-pl" value={b.placement} onChange={(e) => setB({ ...b, placement: e.target.value as BannerInput["placement"] })}><option value="shop">Shop front page</option><option value="top">Thin strip at the top of every shop page</option><option value="course">Barista course page</option><option value="everywhere">All of the above</option></Select></div>
        <div><Label htmlFor="bn-tn">Style</Label><Select id="bn-tn" value={b.tone} onChange={(e) => setB({ ...b, tone: e.target.value as BannerInput["tone"] })}><option value="brand">Brand colour</option><option value="dark">Dark</option><option value="light">Light</option></Select></div>
        <div><Label htmlFor="bn-s">Show from</Label><Input id="bn-s" type="date" value={b.starts_on ?? ""} onChange={(e) => setB({ ...b, starts_on: e.target.value || null })} /></div>
        <div><Label htmlFor="bn-e">Until</Label><Input id="bn-e" type="date" value={b.ends_on ?? ""} onChange={(e) => setB({ ...b, ends_on: e.target.value || null })} /></div>
      </div>
      <div><Label htmlFor="bn-i" hint="optional">Picture</Label><div className="flex gap-2"><Input id="bn-i" value={b.image_url} onChange={(e) => setB({ ...b, image_url: e.target.value })} placeholder="https://…" /><PhotoUpload orgId={orgId} folder="shop" onUploaded={(u) => setB({ ...b, image_url: u })} /></div></div>
      <label className="flex items-center gap-1.5 text-[0.8125rem]"><input type="checkbox" checked={b.active} onChange={(e) => setB({ ...b, active: e.target.checked })} />Showing</label>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="primary" disabled={pending} onClick={() => start(async () => { const r = await saveBanner(b); setMsg(r.ok ? r.data : r.error); if (r.ok) { if (!b.id) setB(EMPTY_BANNER); router.refresh(); onDone?.(); } })}>Save banner</Button>
        {b.id && <Button type="button" variant="secondary" disabled={pending} onClick={() => start(async () => { const r = await deleteBanner(b.id!); setMsg(r.ok ? r.data : r.error); router.refresh(); })}>Delete</Button>}
        {onDone && <Button type="button" variant="secondary" onClick={onDone}>Close</Button>}
        {msg && <span className="text-[0.8125rem] text-ink-muted">{msg}</span>}
      </div>
    </Card>
  );
}

export function BannerRow({ orgId, b, products, label }: { orgId: string; b: BannerInput; products: { id: string; name: string }[]; label: string }) {
  const [edit, setEdit] = useState(false);
  if (edit) return <BannerForm orgId={orgId} initial={b} products={products} onDone={() => setEdit(false)} />;
  return (
    <button type="button" onClick={() => setEdit(true)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-zinc-50">
      <span className="font-medium text-ink">{b.title}</span>
      <span className="flex-1 text-[0.8125rem] text-ink-muted">{label}</span>
      <span className={`rounded-full px-2 py-0.5 text-[0.7188rem] font-medium ${b.active ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-600"}`}>{b.active ? "Showing" : "Hidden"}</span>
    </button>
  );
}
