"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, CreditCard, Loader2, MapPin, Pause, Play, Plus, RotateCcw, SkipForward, Trash2, X, Zap } from "lucide-react";
import { myCardAction, mySubAction, type SubChange } from "@/app/shop/actions";
import { addressLine, frequencyLabel, grindLabel, SUB_STATUS, type Address, type IntervalUnit, type Product, type ShopSettings } from "@/lib/shop/core";
import type { ParcelItem, SubView } from "@/lib/shop/server";
import { GrindAdjuster } from "./buy-box";

const money = (n: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);
const fmtDay = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "long" }) : "—");
const input = "h-11 w-full rounded-xl border border-[#E2D8CD] bg-white px-3 text-[0.9375rem] focus:border-[var(--b)] focus:outline-none";
const STATES = ["ACT", "NSW", "VIC", "QLD", "SA", "WA", "TAS", "NT"];

/** Run a change against the server, then refresh. Works for the customer portal and the office (pass a different `run`). */
export type Runner = (subId: string, change: SubChange) => Promise<{ ok: true; data: string } | { ok: false; error: string }>;

export function SubManager({ slug, sub, products, s, perDelivery, cardLabel, run, office = false }: {
  slug: string; sub: SubView; products: Product[]; s: ShopSettings; perDelivery: number; cardLabel: string | null; run?: Runner; office?: boolean;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<null | "pause" | "cancel" | "freq" | "date" | "split">(null);
  const exec: Runner = run ?? ((id, c) => mySubAction(slug, id, c));
  const go = (c: SubChange, after?: () => void) => start(async () => {
    const r = await exec(sub.id, c).catch(() => ({ ok: false as const, error: "Couldn't save — try again." }));
    setMsg(r.ok ? { ok: true, text: r.data } : { ok: false, text: r.error });
    if (r.ok) { setOpen(null); after?.(); router.refresh(); }
  });
  const woo = sub.billing === "woocommerce";
  const cancelled = sub.status === "cancelled";
  const statusTone = sub.status === "active" ? "bg-emerald-100 text-emerald-800" : sub.status === "paused" ? "bg-amber-100 text-amber-900" : sub.status === "payment_failed" ? "bg-rose-100 text-rose-800" : "bg-zinc-200 text-zinc-700";
  const btn = "inline-flex h-11 items-center gap-2 rounded-xl px-4 text-[0.9063rem] font-semibold ring-1 ring-[#E2D8CD] bg-white hover:bg-[#F6F0E9] disabled:opacity-50";

  return (
    <article className="overflow-hidden rounded-[26px] bg-[#FFFDFC] ring-1 ring-[#EAE1D7]">
      <header className="flex flex-wrap items-start justify-between gap-4 bg-[#1d1915] p-5 text-[#FFFDFC] sm:p-6">
        <div>
          <p className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-0.5 text-[0.75rem] font-bold ${statusTone}`}>{SUB_STATUS[sub.status] ?? sub.status}{sub.status === "paused" && sub.paused_until ? ` until ${fmtDay(sub.paused_until)}` : ""}</span>
            {sub.billing === "prepaid" && <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[0.75rem] font-semibold">Prepaid · {sub.prepaid_remaining ?? 0} of {sub.prepaid_deliveries ?? 0} left</span>}
            {woo && <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[0.75rem] font-semibold">Billed by our old website</span>}</p>
          <p className="mt-2 text-[1.5rem] font-semibold">{frequencyLabel(sub.interval_unit, sub.interval_count)}</p>
          <p className="text-[0.9375rem] text-white/75">{sub.parcels.length > 1 ? `${sub.parcels.length} addresses · ` : ""}{money(perDelivery)} a delivery{sub.discount_percent > 0 ? ` (incl. ${sub.discount_percent}% subscriber saving)` : ""}</p>
        </div>
        {!cancelled && (
          <div className="text-right">
            <p className="text-[0.8125rem] uppercase tracking-wider text-white/60">Next delivery ships</p>
            <p className="text-[1.25rem] font-semibold">{sub.status === "paused" ? (sub.paused_until ? fmtDay(sub.paused_until) : "When you resume") : fmtDay(sub.next_date)}</p>
          </div>
        )}
      </header>

      <div className="space-y-5 p-5 sm:p-6">
        {msg && <p role="status" className={`rounded-xl px-4 py-3 text-[0.9375rem] font-medium ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>{msg.text}</p>}
        {sub.status === "payment_failed" && !office && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-rose-50 p-4">
            <p className="text-[0.9375rem] text-rose-900">We couldn&apos;t take payment{sub.last_error ? ` (${sub.last_error})` : ""}. Your coffee is on hold.</p>
            <button type="button" disabled={pending} onClick={() => start(async () => { const r = await myCardAction(slug, sub.id); if (r.ok) window.location.href = r.data; else setMsg({ ok: false, text: r.error }); })} className="inline-flex h-11 items-center gap-2 rounded-xl bg-rose-700 px-4 font-semibold text-white"><CreditCard className="h-4 w-4" />Update card &amp; pay</button>
          </div>
        )}

        {/* Quick actions */}
        {cancelled ? (
          sub.billing !== "woocommerce" && <button type="button" disabled={pending} onClick={() => go({ type: "reactivate" })} className={btn}><RotateCcw className="h-4 w-4" />Restart this subscription</button>
        ) : (
          <div className="flex flex-wrap gap-2">
            {sub.status === "paused"
              ? <button type="button" disabled={pending} onClick={() => go({ type: "resume" })} className={btn}><Play className="h-4 w-4" />Resume</button>
              : <button type="button" disabled={pending} onClick={() => setOpen(open === "pause" ? null : "pause")} className={btn}><Pause className="h-4 w-4" />Pause</button>}
            <button type="button" disabled={pending} onClick={() => go({ type: "skip" })} className={btn}><SkipForward className="h-4 w-4" />Skip next</button>
            <button type="button" disabled={pending} onClick={() => go({ type: "sooner" })} className={btn}><Zap className="h-4 w-4" />Send sooner</button>
            <button type="button" disabled={pending} onClick={() => setOpen(open === "freq" ? null : "freq")} className={btn}><RotateCcw className="h-4 w-4" />Change frequency</button>
            <button type="button" disabled={pending} onClick={() => setOpen(open === "date" ? null : "date")} className={btn}><CalendarDays className="h-4 w-4" />Pick next date</button>
            <button type="button" disabled={pending} onClick={() => setOpen(open === "cancel" ? null : "cancel")} className={`${btn} text-rose-700`}><X className="h-4 w-4" />Cancel</button>
            {pending && <Loader2 className="h-5 w-5 animate-spin self-center text-[#8a817a]" />}
          </div>
        )}
        {open === "pause" && <PausePanel onGo={(until) => go({ type: "pause", until })} pending={pending} />}
        {open === "freq" && <FreqPanel s={s} unit={sub.interval_unit} count={sub.interval_count} onGo={(u, c) => go({ type: "frequency", unit: u, count: c })} pending={pending} />}
        {open === "date" && <DatePanel onGo={(d) => go({ type: "next_date", date: d })} pending={pending} />}
        {open === "cancel" && <CancelPanel onGo={(r) => go({ type: "cancel", reason: r })} onPause={() => setOpen("pause")} pending={pending} />}

        {/* Parcels */}
        <div className="space-y-4">
          {sub.parcels.map((p) => <ParcelEditor key={p.id} p={p} products={products} s={s} canRemove={sub.parcels.length > 1} disabled={cancelled || pending}
            onSave={(patch) => go({ type: "parcel", parcelId: p.id, ...patch })} onRemove={() => go({ type: "remove_parcel", parcelId: p.id })} />)}
        </div>
        {!cancelled && (open === "split"
          ? <SplitPanel products={products} s={s} onGo={(label, address, items) => go({ type: "add_parcel", label, address, items })} onClose={() => setOpen(null)} pending={pending} />
          : <button type="button" onClick={() => setOpen("split")} className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#DCD0C4] p-4 text-[0.9375rem] font-semibold text-[#4a4743] hover:border-[var(--b)] hover:text-[#171714]"><Plus className="h-4 w-4" />Send some to a second address (e.g. work)</button>)}
        {cardLabel && sub.billing === "card" && <p className="flex items-center gap-2 text-[0.875rem] text-[#6b655f]"><CreditCard className="h-4 w-4" />Charged to {cardLabel} the day before each delivery ships.</p>}
        {woo && <p className="text-[0.875rem] text-[#6b655f]">This subscription moved here from our old website, which still takes the payments for now. Changes you make here are passed on to the team.</p>}
      </div>
    </article>
  );
}

function PausePanel({ onGo, pending }: { onGo: (until: string | null) => void; pending: boolean }) {
  const [until, setUntil] = useState("");
  const inWeeks = (w: number) => { const d = new Date(); d.setDate(d.getDate() + 7 * w); return d.toISOString().slice(0, 10); };
  return (
    <div className="rounded-2xl bg-[#F6F0E9] p-4">
      <p className="font-semibold">Pause until…</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {[2, 4, 8].map((w) => <button key={w} type="button" disabled={pending} onClick={() => onGo(inWeeks(w))} className="rounded-full bg-white px-3.5 py-2 text-[0.875rem] font-medium ring-1 ring-[#DCD0C4]">{w} weeks</button>)}
        <button type="button" disabled={pending} onClick={() => onGo(null)} className="rounded-full bg-white px-3.5 py-2 text-[0.875rem] font-medium ring-1 ring-[#DCD0C4]">Until I resume</button>
        <span className="inline-flex items-center gap-2"><input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className="h-9 rounded-lg border border-[#DCD0C4] bg-white px-2 text-[0.875rem]" aria-label="Pause until date" />
          <button type="button" disabled={!until || pending} onClick={() => onGo(until)} className="h-9 rounded-lg bg-[#171714] px-3 text-[0.875rem] font-semibold text-white disabled:opacity-40">Pause</button></span>
      </div>
    </div>
  );
}

function FreqPanel({ s, unit, count, onGo, pending }: { s: ShopSettings; unit: IntervalUnit; count: number; onGo: (u: IntervalUnit, c: number) => void; pending: boolean }) {
  const [u, setU] = useState(unit);
  const [c, setC] = useState(count);
  return (
    <div className="rounded-2xl bg-[#F6F0E9] p-4">
      <p className="font-semibold">How often?</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {s.frequencies.map((f) => <button key={`${f.unit}${f.count}`} type="button" disabled={pending} onClick={() => onGo(f.unit, f.count)} className={`rounded-full px-3.5 py-2 text-[0.875rem] font-medium ring-1 ${f.unit === unit && f.count === count ? "bg-[#171714] text-white ring-[#171714]" : "bg-white ring-[#DCD0C4]"}`}>{frequencyLabel(f.unit, f.count)}</button>)}
      </div>
      <div className="mt-3 flex items-center gap-2 text-[0.9375rem]">Every
        <input type="number" min={1} max={26} value={c} onChange={(e) => setC(Math.max(1, Math.min(26, Number(e.target.value) || 1)))} className="h-10 w-16 rounded-lg border border-[#DCD0C4] bg-white text-center" aria-label="How many" />
        <select value={u} onChange={(e) => setU(e.target.value as IntervalUnit)} className="h-10 rounded-lg border border-[#DCD0C4] bg-white px-2" aria-label="Weeks or months"><option value="week">weeks</option><option value="month">months</option></select>
        <button type="button" disabled={pending} onClick={() => onGo(u, c)} className="h-10 rounded-lg bg-[#171714] px-4 font-semibold text-white">Save</button>
      </div>
    </div>
  );
}

function DatePanel({ onGo, pending }: { onGo: (d: string) => void; pending: boolean }) {
  const [d, setD] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-[#F6F0E9] p-4">
      <span className="font-semibold">Ship the next one on or after</span>
      <input type="date" value={d} onChange={(e) => setD(e.target.value)} className="h-10 rounded-lg border border-[#DCD0C4] bg-white px-2" aria-label="Next delivery date" />
      <button type="button" disabled={!d || pending} onClick={() => onGo(d)} className="h-10 rounded-lg bg-[#171714] px-4 font-semibold text-white disabled:opacity-40">Save</button>
      <span className="w-full text-[0.8125rem] text-[#6b655f]">We&apos;ll use the next roast day from that date.</span>
    </div>
  );
}

function CancelPanel({ onGo, onPause, pending }: { onGo: (reason: string | null) => void; onPause: () => void; pending: boolean }) {
  const [r, setR] = useState("");
  return (
    <div className="rounded-2xl bg-rose-50 p-4">
      <p className="font-semibold text-rose-900">Cancel your subscription?</p>
      <p className="mt-1 text-[0.9063rem] text-rose-900/80">Too much coffee? You could <button type="button" onClick={onPause} className="font-semibold underline">pause</button>, skip a delivery or switch to a longer gap instead.</p>
      <select value={r} onChange={(e) => setR(e.target.value)} className="mt-3 h-11 w-full rounded-xl border border-rose-200 bg-white px-3 text-[0.9375rem]" aria-label="Reason">
        <option value="">Reason (optional)</option>
        {["Too much coffee", "Too expensive", "Trying something else", "Moving / travelling", "Not happy with the coffee", "Other"].map((x) => <option key={x}>{x}</option>)}
      </select>
      <button type="button" disabled={pending} onClick={() => onGo(r || null)} className="mt-3 h-11 rounded-xl bg-rose-700 px-4 font-semibold text-white">Yes, cancel</button>
    </div>
  );
}

function AddressFields({ a, setA }: { a: Partial<Address>; setA: (x: Partial<Address>) => void }) {
  return (
    <div className="grid gap-2.5 sm:grid-cols-6">
      <input className={`${input} sm:col-span-3`} placeholder="Name on parcel" value={a.name ?? ""} onChange={(e) => setA({ ...a, name: e.target.value })} aria-label="Name on parcel" />
      <input className={`${input} sm:col-span-3`} placeholder="Business (optional)" value={a.company ?? ""} onChange={(e) => setA({ ...a, company: e.target.value })} aria-label="Business" />
      <input className={`${input} sm:col-span-4`} placeholder="Street address" value={a.line1 ?? ""} onChange={(e) => setA({ ...a, line1: e.target.value })} aria-label="Street address" />
      <input className={`${input} sm:col-span-2`} placeholder="Unit / level" value={a.line2 ?? ""} onChange={(e) => setA({ ...a, line2: e.target.value })} aria-label="Unit or level" />
      <input className={`${input} sm:col-span-3`} placeholder="Suburb" value={a.suburb ?? ""} onChange={(e) => setA({ ...a, suburb: e.target.value })} aria-label="Suburb" />
      <select className={`${input} sm:col-span-1`} value={a.state ?? ""} onChange={(e) => setA({ ...a, state: e.target.value })} aria-label="State"><option value="">State</option>{STATES.map((x) => <option key={x}>{x}</option>)}</select>
      <input className={`${input} sm:col-span-2`} placeholder="Postcode" inputMode="numeric" maxLength={4} value={a.postcode ?? ""} onChange={(e) => setA({ ...a, postcode: e.target.value.replace(/\D/g, "") })} aria-label="Postcode" />
      <input className={`${input} sm:col-span-6`} placeholder="Delivery instructions (optional)" value={a.instructions ?? ""} onChange={(e) => setA({ ...a, instructions: e.target.value })} aria-label="Delivery instructions" />
    </div>
  );
}

function ItemsEditor({ items, setItems, products }: { items: ParcelItem[]; setItems: (x: ParcelItem[]) => void; products: Product[] }) {
  const coffees = products.filter((p) => p.kind === "coffee" && p.subscribable);
  const find = (vid: string) => coffees.find((p) => p.variants.some((v) => v.id === vid));
  return (
    <div className="space-y-3">
      {items.map((it, i) => {
        const p = find(it.variant_id);
        const set = (patch: Partial<ParcelItem>) => setItems(items.map((x, k) => (k === i ? { ...x, ...patch } : x)));
        return (
          <div key={i} className="rounded-xl bg-white p-3 ring-1 ring-[#EAE1D7]">
            <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
              <select className={input} value={it.variant_id} onChange={(e) => { const np = find(e.target.value); set({ variant_id: e.target.value, grind: np?.grinds.includes(it.grind ?? "") ? it.grind : np?.grinds[0] ?? null }); }} aria-label="Coffee and size">
                {coffees.map((cp) => <optgroup key={cp.id} label={cp.name}>{cp.variants.map((v) => <option key={v.id} value={v.id}>{cp.name} — {v.label} ({money(v.price)})</option>)}</optgroup>)}
                {!p && <option value={it.variant_id}>No longer available</option>}
              </select>
              {p && p.grinds.length > 0 && <select className={input} value={it.grind ?? ""} onChange={(e) => set({ grind: e.target.value, adjust: /whole/i.test(e.target.value) ? 0 : it.adjust })} aria-label="Grind">{p.grinds.map((g) => <option key={g}>{g}</option>)}</select>}
              <input type="number" min={1} max={20} className={`${input} w-20`} value={it.qty} onChange={(e) => set({ qty: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })} aria-label="Quantity" />
              <button type="button" onClick={() => setItems(items.filter((_, k) => k !== i))} disabled={items.length <= 1} className="grid h-11 w-11 place-items-center rounded-xl text-[#8a817a] hover:bg-[#F3ECE4] disabled:opacity-30" aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
            </div>
            {it.grind && !/whole/i.test(it.grind) && <div className="mt-3 max-w-sm"><GrindAdjuster compact value={it.adjust ?? 0} onChange={(n) => set({ adjust: n })} /></div>}
          </div>
        );
      })}
      {coffees[0]?.variants[0] && items.length < 12 && <button type="button" onClick={() => setItems([...items, { variant_id: coffees[0].variants[0].id, grind: coffees[0].grinds[0] ?? null, adjust: 0, qty: 1 }])} className="inline-flex items-center gap-1.5 text-[0.9063rem] font-semibold"><Plus className="h-4 w-4" />Add another coffee</button>}
    </div>
  );
}

function ParcelEditor({ p, products, s, canRemove, disabled, onSave, onRemove }: {
  p: SubView["parcels"][number]; products: Product[]; s: ShopSettings; canRemove: boolean; disabled: boolean;
  onSave: (patch: { label?: string; delivery?: "post" | "pickup"; address?: unknown; items?: ParcelItem[] }) => void; onRemove: () => void;
}) {
  const [edit, setEdit] = useState<null | "items" | "address">(null);
  const [items, setItems] = useState<ParcelItem[]>(p.items.map((i) => ({ ...i, adjust: i.adjust ?? 0 })));
  const [a, setA] = useState<Partial<Address>>(p.address as Address);
  const [label, setLabel] = useState(p.label);
  const vmap = new Map(products.flatMap((x) => x.variants.map((v) => [v.id, { x, v }] as const)));
  return (
    <section className="rounded-2xl bg-[#FAF6F1] p-4 ring-1 ring-[#EFE7DE]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{p.label}</p>
          <p className="flex items-start gap-1.5 text-[0.875rem] text-[#6b655f]"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />{p.delivery === "pickup" ? "Pick up" : addressLine(p.address as Address) || "No address yet"}</p>
        </div>
        {!disabled && <div className="flex gap-1.5 text-[0.8438rem] font-semibold">
          <button type="button" onClick={() => setEdit(edit === "items" ? null : "items")} className="rounded-lg px-2.5 py-1.5 hover:bg-white">Change coffee</button>
          <button type="button" onClick={() => setEdit(edit === "address" ? null : "address")} className="rounded-lg px-2.5 py-1.5 hover:bg-white">Change address</button>
          {canRemove && <button type="button" onClick={onRemove} className="rounded-lg px-2.5 py-1.5 text-rose-700 hover:bg-white">Remove</button>}
        </div>}
      </div>
      {edit !== "items" && (
        <ul className="mt-3 space-y-1 text-[0.9375rem]">
          {p.items.map((i, k) => { const hit = vmap.get(i.variant_id); return <li key={k}>{i.qty} × {hit ? `${hit.x.name} ${hit.v.label}` : "Coffee no longer available"}{i.grind ? <span className="text-[#6b655f]"> · {grindLabel(i.grind, i.adjust)}</span> : null}</li>; })}
        </ul>
      )}
      {edit === "items" && (
        <div className="mt-3"><ItemsEditor items={items} setItems={setItems} products={products} />
          <div className="mt-3 flex gap-2"><button type="button" onClick={() => { onSave({ items }); setEdit(null); }} className="h-10 rounded-lg bg-[#171714] px-4 font-semibold text-white">Save coffee</button><button type="button" onClick={() => setEdit(null)} className="h-10 rounded-lg px-3 font-semibold">Cancel</button></div></div>
      )}
      {edit === "address" && (
        <div className="mt-3 space-y-2.5">
          <input className={input} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label, e.g. Home or Work" aria-label="Label" />
          <AddressFields a={a} setA={setA} />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { onSave({ label, delivery: "post", address: a }); setEdit(null); }} className="h-10 rounded-lg bg-[#171714] px-4 font-semibold text-white">Save address</button>
            {s.pickup && <button type="button" onClick={() => { onSave({ label, delivery: "pickup", address: {} }); setEdit(null); }} className="h-10 rounded-lg px-3 font-semibold ring-1 ring-[#DCD0C4]">I&apos;ll pick up instead</button>}
            <button type="button" onClick={() => setEdit(null)} className="h-10 rounded-lg px-3 font-semibold">Cancel</button>
          </div>
        </div>
      )}
    </section>
  );
}

function SplitPanel({ products, s, onGo, onClose, pending }: { products: Product[]; s: ShopSettings; onGo: (label: string, address: unknown, items: ParcelItem[]) => void; onClose: () => void; pending: boolean }) {
  const first = products.find((p) => p.kind === "coffee" && p.subscribable);
  const [label, setLabel] = useState("Work");
  const [a, setA] = useState<Partial<Address>>({});
  const [items, setItems] = useState<ParcelItem[]>(first?.variants[0] ? [{ variant_id: first.variants[0].id, grind: first.grinds[0] ?? null, adjust: 0, qty: 1 }] : []);
  void s;
  return (
    <section className="space-y-3 rounded-2xl bg-[#F6F0E9] p-4">
      <p className="font-semibold">Add a second address</p>
      <p className="text-[0.875rem] text-[#6b655f]">Each delivery sends both parcels at the same time — handy for home and the office.</p>
      <input className={input} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label, e.g. Work" aria-label="Label" />
      <AddressFields a={a} setA={setA} />
      <ItemsEditor items={items} setItems={setItems} products={products} />
      <div className="flex gap-2"><button type="button" disabled={pending} onClick={() => onGo(label, a, items)} className="h-11 rounded-xl bg-[var(--b)] px-4 font-semibold text-[var(--on-b)]">Add this address</button><button type="button" onClick={onClose} className="h-11 rounded-xl px-3 font-semibold">Cancel</button></div>
    </section>
  );
}
