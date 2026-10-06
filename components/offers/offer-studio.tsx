"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink, Megaphone, Pencil, Plus, Printer, Sparkles, X } from "lucide-react";
import { saveOffer, toggleOffer, type OfferInput } from "@/app/(app)/offers/actions";
import { PLACES, type Offer, type OfferPlace } from "@/lib/offers/core";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/form";

export interface StudioOffer {
  offer: Offer; raw: Record<string, unknown>; link: string; qr: string; summary: string;
  status: { label: string; tone: "live" | "soon" | "off" }; stats: { uses: number; sales: number; given: number };
}
type Course = { id: string; name: string; price: number };

const money = (n: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n).replace(/\.00$/, "");
const plusDays = (today: string, d: number) => { const x = new Date(today + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10); };

const EMPTY: OfferInput = {
  id: null, code: "", headline: "", description: "", kind: "percent", value: 10, works_on: ["classes", "gifts"], course_ids: [],
  applies_to: "all", product_ids: [], subscription_cycles: null, min_spend: null, first_order_only: false, max_uses: null, per_customer: null,
  starts_on: null, ends_on: null, active: true, ribbon: false,
};

function fromRow(o: Offer, r: Record<string, unknown>): OfferInput {
  return {
    id: o.id, code: o.code, headline: o.headline ?? "", description: o.description ?? "", kind: o.kind, value: o.value, works_on: o.works_on, course_ids: o.course_ids,
    applies_to: (r.applies_to as OfferInput["applies_to"]) ?? "all", product_ids: (r.product_ids as string[]) ?? [], subscription_cycles: (r.subscription_cycles as number | null) ?? null,
    min_spend: o.min_spend, first_order_only: o.first_order_only, max_uses: o.max_uses, per_customer: o.per_customer, starts_on: o.starts_on, ends_on: o.ends_on, active: o.active, ribbon: o.ribbon,
  };
}

/** Ready-made ideas that fill the form (nothing is saved until "Save offer"). */
function ideas(today: string, courses: Course[]) {
  const cheapest = courses.length ? Math.min(...courses.map((c) => c.price)) : 0;
  return [
    { t: "Welcome offer", d: "10% off a first class", v: { ...EMPTY, code: "WELCOME10", headline: "Welcome to the bar", description: "10% off your first barista class.", value: 10, works_on: ["classes"] as OfferPlace[], first_order_only: true, per_customer: 1 } },
    { t: "Gift season", d: "15% off gift certificates, with a website ribbon", v: { ...EMPTY, code: "GIFT15", headline: "Gift season special", description: "15% off gift certificates — they choose their own date.", value: 15, works_on: ["gifts"] as OfferPlace[], ends_on: plusDays(today, 30), ribbon: true } },
    { t: "Bring a friend", d: "$20 off when two book together", v: { ...EMPTY, code: "FRIEND20", headline: "Bring a friend", description: "$20 off when you book two places together.", kind: "fixed" as const, value: 20, works_on: ["classes"] as OfferPlace[], min_spend: cheapest ? cheapest * 2 : null } },
    { t: "Coffee cart QR", d: "10% off coffee — print the poster for the cart", v: { ...EMPTY, code: "CART10", headline: "Loved your coffee today?", description: "Take some home — 10% off your first bag from our roastery.", value: 10, works_on: ["shop"] as OfferPlace[], per_customer: 1 } },
  ];
}

export function OfferStudio({ offers, ready, today, slug, courses, products }: { offers: StudioOffer[]; ready: boolean; today: string; slug: string; courses: Course[]; products: { id: string; name: string }[] }) {
  const [editing, setEditing] = useState<OfferInput | null>(offers.length ? null : EMPTY);
  const [key, setKey] = useState(0);
  const open = (v: OfferInput) => { setEditing(v); setKey((k) => k + 1); if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" }); };
  const live = offers.filter((o) => o.status.tone === "live");
  const totals = offers.reduce((a, o) => ({ uses: a.uses + o.stats.uses, sales: a.sales + o.stats.sales }), { uses: 0, sales: 0 });

  return (
    <div className="space-y-5">
      {!ready && (
        <Card className="border-amber-300 bg-amber-50 p-4 text-[0.875rem] text-amber-900">
          <p className="font-semibold">One database update to run</p>
          <p className="mt-1">Run <span className="font-mono">supabase/migrations/0056_offers.sql</span> in Supabase (SQL editor) so codes can work on classes and gift certificates and show on your website. Until then, codes work in the coffee shop only.</p>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Running now" value={String(live.length)} hint={live.length ? live.map((o) => o.offer.code).slice(0, 3).join(", ") : "No offers running"} />
        <Stat label="Times used" value={String(totals.uses)} hint="Across every offer" />
        <Stat label="Sales with a code" value={money(totals.sales)} hint="Paid orders, bookings and gifts" />
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_460px]">
        <div className="space-y-3">
          {!editing && (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="primary" onClick={() => open(EMPTY)}><Plus className="h-4 w-4" />New offer</Button>
              <span className="text-[0.8125rem] text-ink-muted">or start from an idea:</span>
              {ideas(today, courses).map((i) => <button key={i.t} type="button" onClick={() => open(i.v)} className="rounded-full border border-line px-3 py-1.5 text-[0.8125rem] font-medium text-ink hover:bg-zinc-50" title={i.d}><Sparkles className="mr-1 inline h-3.5 w-3.5 text-brand-500" />{i.t}</button>)}
            </div>
          )}
          {offers.length === 0 ? (
            <Card className="p-8 text-center text-[0.9375rem] text-ink-muted">No offers yet — make your first one, or start from an idea.</Card>
          ) : offers.map((o) => <OfferCard key={o.offer.id} o={o} slug={slug} onEdit={() => open(fromRow(o.offer, o.raw))} />)}
        </div>
        {editing && <div className="xl:sticky xl:top-4"><OfferForm key={key} initial={editing} courses={courses} products={products} today={today} ideas={ideas(today, courses)} onPick={open} onDone={() => setEditing(null)} /></div>}
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card className="p-4">
      <p className="text-[0.75rem] font-medium uppercase tracking-wider text-ink-faint">{label}</p>
      <p className="mt-1 text-[1.5rem] font-semibold tabular-nums text-ink">{value}</p>
      <p className="truncate text-[0.8125rem] text-ink-muted">{hint}</p>
    </Card>
  );
}

function OfferCard({ o, slug, onEdit }: { o: StudioOffer; slug: string; onEdit: () => void }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const flip = (field: "active" | "ribbon", value: boolean) => start(async () => { const r = await toggleOffer(o.offer.id, field, value); setMsg(r.ok ? r.data : r.error); router.refresh(); });
  const copy = async () => { try { await navigator.clipboard.writeText(o.link); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { setMsg(o.link); } };
  const tone = o.status.tone === "live" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : o.status.tone === "soon" ? "bg-sky-50 text-sky-700 ring-sky-200" : "bg-zinc-100 text-zinc-600 ring-zinc-200";
  return (
    <Card className="overflow-hidden">
      <div className="flex gap-4 p-4">
        <a href={o.link} target="_blank" rel="noreferrer" className="hidden shrink-0 sm:block" title="Scan or open the claim link">
          <img src={o.qr} alt={`QR code for ${o.offer.code}`} className="h-[92px] w-[92px] rounded-lg ring-1 ring-line" />
        </a>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-dashed border-brand-500 bg-brand-50 px-2 py-0.5 font-mono text-[0.9375rem] font-bold tracking-wider text-ink">{o.offer.code}</span>
            <span className={`rounded-full px-2 py-0.5 text-[0.7188rem] font-semibold ring-1 ${tone}`}>{o.status.label}</span>
            {o.offer.ribbon && o.status.tone === "live" && <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[0.7188rem] font-semibold text-brand-700 ring-1 ring-brand-200"><Megaphone className="h-3 w-3" />On your website</span>}
          </div>
          {o.offer.headline && <p className="mt-1.5 font-semibold text-ink">{o.offer.headline}</p>}
          <p className="mt-0.5 text-[0.8125rem] text-ink-muted">{o.summary}</p>
          <p className="mt-1.5 text-[0.8125rem] text-ink-muted"><span className="font-semibold text-ink">{o.stats.uses}</span> used{o.offer.max_uses ? ` of ${o.offer.max_uses}` : ""} · <span className="font-semibold text-ink">{money(o.stats.sales)}</span> sales · {money(o.stats.given)} off</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 border-t border-line bg-zinc-50/60 px-3 py-2">
        <Button type="button" size="sm" variant="ghost" onClick={onEdit}><Pencil className="h-3.5 w-3.5" />Edit</Button>
        <Button type="button" size="sm" variant="ghost" onClick={copy}>{copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}{copied ? "Copied" : "Copy link"}</Button>
        <a href={`/api/offers/${o.offer.id}/poster`} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[0.8125rem] font-medium text-ink hover:bg-zinc-100"><Printer className="h-3.5 w-3.5" />Poster</a>
        <a href={o.link} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[0.8125rem] font-medium text-ink hover:bg-zinc-100"><ExternalLink className="h-3.5 w-3.5" />Preview</a>
        <span className="flex-1" />
        <label className="flex items-center gap-1.5 text-[0.8125rem] text-ink-muted"><input type="checkbox" checked={o.offer.ribbon} disabled={pending} onChange={(e) => flip("ribbon", e.target.checked)} />Website ribbon</label>
        <label className="ml-3 flex items-center gap-1.5 text-[0.8125rem] text-ink-muted"><input type="checkbox" checked={o.offer.active} disabled={pending} onChange={(e) => flip("active", e.target.checked)} />On</label>
      </div>
      {msg && <p className="border-t border-line px-4 py-2 text-[0.8125rem] text-ink-muted">{msg}</p>}
      <span className="sr-only">{slug}</span>
    </Card>
  );
}

function OfferForm({ initial, courses, products, today, ideas: list, onPick, onDone }: {
  initial: OfferInput; courses: Course[]; products: { id: string; name: string }[]; today: string;
  ideas: { t: string; d: string; v: OfferInput }[]; onPick: (v: OfferInput) => void; onDone: () => void;
}) {
  const router = useRouter();
  const [c, setC] = useState<OfferInput>(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const num = (v: string) => (v === "" ? null : Number(v));
  const has = (p: OfferPlace) => c.works_on.includes(p);
  const togglePlace = (p: OfferPlace, on: boolean) => setC({ ...c, works_on: on ? [...new Set([...c.works_on, p])] : c.works_on.filter((x) => x !== p) });
  const preview = c.kind === "percent" ? `${c.value || 0}% off` : c.kind === "fixed" ? `${money(c.value || 0)} off` : "Free shipping";
  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-ink">{c.id ? `Edit ${c.code}` : "New offer"}</h2>
        <button type="button" onClick={onDone} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg text-ink-muted hover:bg-zinc-100"><X className="h-4 w-4" /></button>
      </div>
      {!c.id && !c.code && (
        <div className="flex flex-wrap gap-1.5">{list.map((i) => <button key={i.t} type="button" onClick={() => onPick(i.v)} className="rounded-full border border-line px-2.5 py-1 text-[0.75rem] font-medium text-ink hover:bg-zinc-50" title={i.d}><Sparkles className="mr-1 inline h-3 w-3 text-brand-500" />{i.t}</button>)}</div>
      )}

      {/* Live preview of the ribbon customers see */}
      <div className="overflow-hidden rounded-xl bg-brand-500 px-4 py-2.5 text-[0.8125rem] text-on-brand">
        <span className="font-semibold">{c.headline || "Your offer"}</span> · {preview}{c.code ? <> · code <span className="rounded bg-white/20 px-1.5 font-mono font-bold">{c.code}</span></> : null}{c.ends_on ? ` · ends ${c.ends_on.split("-").reverse().join("/")}` : ""}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label htmlFor="of-c">Code</Label><Input id="of-c" value={c.code} onChange={(e) => setC({ ...c, code: e.target.value.toUpperCase().replace(/\s+/g, "") })} placeholder="SPRING15" /></div>
        <div><Label htmlFor="of-h" hint="ribbon & poster">Name of the offer</Label><Input id="of-h" value={c.headline} maxLength={80} onChange={(e) => setC({ ...c, headline: e.target.value })} placeholder="Spring special" /></div>
        <div><Label htmlFor="of-k">Discount</Label><Select id="of-k" value={c.kind} onChange={(e) => setC({ ...c, kind: e.target.value as OfferInput["kind"] })}><option value="percent">% off</option><option value="fixed">$ off</option><option value="free_shipping">Free shipping (coffee shop)</option></Select></div>
        {c.kind !== "free_shipping" && <div><Label htmlFor="of-v">{c.kind === "percent" ? "Percent off" : "Dollars off"}</Label><Input id="of-v" type="number" min={0} step={c.kind === "percent" ? 1 : 0.5} value={c.value} onChange={(e) => setC({ ...c, value: Number(e.target.value) })} /></div>}
      </div>
      <div><Label htmlFor="of-d" hint="shown to customers">Short description</Label><Input id="of-d" value={c.description} maxLength={200} onChange={(e) => setC({ ...c, description: e.target.value })} placeholder="15% off barista classes and gift certificates." /></div>

      <div>
        <Label hint="tick one or more">Works on</Label>
        <div className="flex flex-wrap gap-2">
          {PLACES.map((p) => (
            <label key={p.id} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-[0.875rem] ${has(p.id) ? "border-brand-500 bg-brand-50 text-ink" : "border-line text-ink-muted"}`}>
              <input type="checkbox" checked={has(p.id)} onChange={(e) => togglePlace(p.id, e.target.checked)} />{p.label}
            </label>
          ))}
        </div>
      </div>
      {(has("classes") || has("gifts")) && courses.length > 0 && (
        <div><Label hint="none ticked = all classes">Only these classes</Label>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">{courses.map((x) => <label key={x.id} className="flex items-center gap-1.5 text-[0.8125rem]"><input type="checkbox" checked={c.course_ids.includes(x.id)} onChange={(e) => setC({ ...c, course_ids: e.target.checked ? [...c.course_ids, x.id] : c.course_ids.filter((y) => y !== x.id) })} />{x.name}</label>)}</div>
        </div>
      )}
      {has("shop") && (
        <details className="rounded-xl border border-line px-3 py-2" open={c.applies_to !== "all" || c.product_ids.length > 0}>
          <summary className="cursor-pointer text-[0.8125rem] font-medium text-ink">Coffee shop options</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor="of-a">Orders</Label><Select id="of-a" value={c.applies_to} onChange={(e) => setC({ ...c, applies_to: e.target.value as OfferInput["applies_to"] })}><option value="all">One-off and subscriptions</option><option value="one_off">One-off orders only</option><option value="subscription">Subscriptions only</option></Select></div>
            {c.applies_to !== "one_off" && <div><Label htmlFor="of-sc" hint="blank = every delivery">Subscription deliveries</Label><Input id="of-sc" type="number" min={1} value={c.subscription_cycles ?? ""} onChange={(e) => setC({ ...c, subscription_cycles: num(e.target.value) })} placeholder="e.g. 3" /></div>}
          </div>
          {products.length > 0 && <div className="mt-3"><Label hint="none ticked = every product">Only these products</Label>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">{products.map((p) => <label key={p.id} className="flex items-center gap-1.5 text-[0.8125rem]"><input type="checkbox" checked={c.product_ids.includes(p.id)} onChange={(e) => setC({ ...c, product_ids: e.target.checked ? [...c.product_ids, p.id] : c.product_ids.filter((x) => x !== p.id) })} />{p.name}</label>)}</div></div>}
        </details>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label htmlFor="of-s">Starts</Label><Input id="of-s" type="date" min={c.id ? undefined : today} value={c.starts_on ?? ""} onChange={(e) => setC({ ...c, starts_on: e.target.value || null })} /></div>
        <div><Label htmlFor="of-e" hint="blank = no end">Ends</Label><Input id="of-e" type="date" value={c.ends_on ?? ""} onChange={(e) => setC({ ...c, ends_on: e.target.value || null })} /></div>
        <div><Label htmlFor="of-m">Minimum spend</Label><Input id="of-m" type="number" min={0} value={c.min_spend ?? ""} onChange={(e) => setC({ ...c, min_spend: num(e.target.value) })} /></div>
        <div><Label htmlFor="of-u" hint="blank = unlimited">Total uses</Label><Input id="of-u" type="number" min={1} value={c.max_uses ?? ""} onChange={(e) => setC({ ...c, max_uses: num(e.target.value) })} /></div>
        <div><Label htmlFor="of-pc" hint="by email">Uses per customer</Label><Input id="of-pc" type="number" min={1} value={c.per_customer ?? ""} onChange={(e) => setC({ ...c, per_customer: num(e.target.value) })} /></div>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-[0.8125rem]">
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={c.first_order_only} onChange={(e) => setC({ ...c, first_order_only: e.target.checked })} />First-time customers only</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={c.ribbon} onChange={(e) => setC({ ...c, ribbon: e.target.checked })} />Show as a ribbon on my website</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={c.active} onChange={(e) => setC({ ...c, active: e.target.checked })} />On</label>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <Button type="button" variant="primary" disabled={pending} onClick={() => start(async () => { const r = await saveOffer(c); setMsg(r.ok ? r.data : r.error); if (r.ok) { router.refresh(); onDone(); } })}>Save offer</Button>
        <Button type="button" variant="secondary" onClick={onDone}>Cancel</Button>
        {msg && <span className="text-[0.8125rem] text-ink-muted">{msg}</span>}
      </div>
    </Card>
  );
}
