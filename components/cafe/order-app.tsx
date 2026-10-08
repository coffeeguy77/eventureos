"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, ChefHat, Clock, Loader2, Lock, Minus, Plus, Search, ShoppingBag, Trash2, X } from "lucide-react";
import { cafeOrderStatus, cancelCafeOrder, payCafeOrder, startCafeOrder } from "@/app/cafe/[org]/actions";
import {
  buildLine, cartSubtotal, dateLabel, defaultSelection, fromPrice, money, openDates, periodsFor, dowOf, slotsFor, surchargeRows, toggleOption, unmetGroups,
  type CafeLine, type Closure, type MenuItem, type MenuSection, type Surcharges, type Weekly,
} from "@/lib/cafe/core";

type Square = { payments: (appId: string, locationId: string) => Payments };
type Payments = {
  card: (opts?: unknown) => Promise<Card>;
  verifyBuyer: (token: string, details: unknown) => Promise<{ token?: string } | undefined>;
};
type Card = { attach: (sel: string) => Promise<void>; tokenize: () => Promise<{ status: string; token?: string; errors?: { message?: string }[] }>; destroy: () => Promise<void> };
declare global { interface Window { Square?: Square } }

const sdkSrc = (env: string) => (env === "sandbox" ? "https://sandbox.web.squarecdn.com/v1/square.js" : "https://web.squarecdn.com/v1/square.js");
function loadSquare(env: string): Promise<Square> {
  if (window.Square) return Promise.resolve(window.Square);
  return new Promise((res, rej) => {
    const src = sdkSrc(env);
    const done = () => (window.Square ? res(window.Square) : rej(new Error("Card payments didn't load.")));
    const have = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (have) { have.addEventListener("load", done); have.addEventListener("error", () => rej(new Error("Card payments didn't load."))); return; }
    const s = document.createElement("script"); s.src = src; s.async = true; s.onload = done; s.onerror = () => rej(new Error("Card payments didn't load — check your connection and refresh."));
    document.head.appendChild(s);
  });
}

interface Hours { open: boolean; nextOpen: string | null; weekly: Weekly | null; closures: Closure[]; kitchen: { open?: boolean; categories?: string[]; hasHours?: boolean; weekly?: Weekly } | null; paused: boolean }
interface Props {
  slug: string; menu: MenuSection[]; square: { applicationId: string; locationId: string; environment: string; currency: string };
  locationId: string | null; hours: Hours; surcharges: Surcharges | null; tz: string; now: { date: string; minutes: number }; maxDays: number; business: string; phone: string | null;
}

const field = "h-[50px] w-full rounded-[14px] border border-[#E6DCD4] bg-white px-4 text-[0.9688rem] text-[#151312] outline-none transition placeholder:text-[#A39A93] focus:border-[var(--pk)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--pk)_14%,transparent)]";
const lbl = "mb-1.5 block text-[0.8125rem] font-semibold text-[#3A3431]";
const slugId = (s: string) => `sec-${s.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

export function OrderApp(p: Props) {
  const store = `eos_cafe_cart_${p.slug}`;
  const [lines, setLines] = useState<CafeLine[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState<MenuItem | null>(null);
  const [step, setStep] = useState<"menu" | "checkout" | "done">("menu");
  const [drawer, setDrawer] = useState(false);
  const [q, setQ] = useState("");
  const [activeSec, setActiveSec] = useState(p.menu[0]?.category ?? "");
  const [done, setDone] = useState<{ orderId: string; ticketName: string | null; when: string; amount: number; receiptUrl: string | null } | null>(null);

  useEffect(() => {
    try { const raw = localStorage.getItem(store); if (raw) { const v = JSON.parse(raw); if (Array.isArray(v)) setLines(v.filter((l) => l && typeof l.variationId === "string")); } } catch { /* storage unavailable */ }
    setLoaded(true);
  }, [store]);
  useEffect(() => { if (loaded) try { localStorage.setItem(store, JSON.stringify(lines)); } catch { /* ignore */ } }, [lines, loaded, store]);

  // Lines whose item is no longer on the menu (sold out / removed) are dropped.
  const known = useMemo(() => {
    const ids = new Set<string>();
    const walk = (i: MenuItem) => { if (i.isGroup) (i.subProducts ?? []).forEach(walk); else if (!i.soldOut) i.variations.forEach((v) => { if (!v.soldOut) ids.add(v.id); }); };
    p.menu.forEach((s) => s.items.forEach(walk));
    return ids;
  }, [p.menu]);
  useEffect(() => { if (loaded) setLines((ls) => ls.filter((l) => known.has(l.variationId))); }, [loaded, known]);

  const kitchenCats = useMemo(() => new Set((p.hours.kitchen?.categories ?? []).map((c) => c.toLowerCase())), [p.hours.kitchen]);
  const kitchenClosedNow = !!p.hours.kitchen && p.hours.kitchen.open === false && p.hours.open;
  const isKitchen = (cat: string | null) => !!cat && kitchenCats.has(cat.toLowerCase());

  const sections = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return p.menu;
    return p.menu.map((s) => ({ ...s, items: s.items.filter((i) => `${i.name} ${i.description ?? ""}`.toLowerCase().includes(t)) })).filter((s) => s.items.length);
  }, [p.menu, q]);

  useEffect(() => {
    if (step !== "menu" || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver((es) => { const v = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]; if (v) setActiveSec((v.target as HTMLElement).dataset.cat ?? ""); }, { rootMargin: "-130px 0px -60% 0px" });
    document.querySelectorAll("[data-cat]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [sections, step]);

  const add = (line: CafeLine) => {
    setLines((ls) => { const i = ls.findIndex((l) => l.key === line.key); if (i < 0) return [...ls, line]; const n = [...ls]; n[i] = { ...n[i], quantity: Math.min(50, n[i].quantity + line.quantity) }; return n; });
    setOpen(null);
  };
  const setQty = (key: string, qty: number) => setLines((ls) => qty <= 0 ? ls.filter((l) => l.key !== key) : ls.map((l) => (l.key === key ? { ...l, quantity: Math.min(50, qty) } : l)));
  const count = lines.reduce((n, l) => n + l.quantity, 0);
  const subtotal = cartSubtotal(lines);

  if (step === "done" && done) return <Done {...p} done={done} onAgain={() => { setDone(null); setStep("menu"); }} />;
  if (step === "checkout") {
    return <Checkout {...p} lines={lines} setQty={setQty} isKitchen={isKitchen} onBack={() => setStep("menu")}
      onPaid={(d) => { setDone(d); setLines([]); setStep("done"); window.scrollTo({ top: 0 }); }} />;
  }

  const cartPanel = (
    <CartPanel lines={lines} setQty={setQty} subtotal={subtotal} surcharges={p.surcharges} locationId={p.locationId}
      onCheckout={() => { setDrawer(false); setStep("checkout"); window.scrollTo({ top: 0 }); }} />
  );

  return (
    <div className="mx-auto w-full max-w-[1360px] px-5 pb-28 sm:px-8 lg:px-10 lg:pb-16">
      {!p.hours.open && (
        <p className="mt-4 flex items-start gap-2 rounded-2xl bg-[#FFF6EC] px-4 py-3 text-[0.9375rem] text-[#7A4A12] ring-1 ring-[#F6DFC3]">
          <Clock className="mt-0.5 h-[18px] w-[18px] shrink-0" />
          {p.hours.paused ? "Online ordering is paused right now." : `We're closed right now${p.hours.nextOpen ? ` — we open ${p.hours.nextOpen}` : ""}. You can still order ahead for a pick-up time.`}
        </p>
      )}
      {kitchenClosedNow && <p className="mt-3 flex items-center gap-2 rounded-2xl bg-[#F4ECE6] px-4 py-3 text-[0.9375rem] text-[#3A3431]"><ChefHat className="h-[18px] w-[18px]" />The kitchen has closed for today — drinks are still available.</p>}

      <div className="sticky top-[58px] z-30 -mx-5 mt-4 border-b border-[#EEE6DF] bg-[#FCFAF7]/95 px-5 py-3 backdrop-blur sm:-mx-8 sm:px-8 lg:-mx-10 lg:px-10">
        <div className="flex items-center gap-3">
          <label className="relative hidden shrink-0 sm:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8C847D]" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the menu" aria-label="Search the menu" className="h-10 w-56 rounded-full border border-[#E6DCD4] bg-white pl-9 pr-3 text-[0.9063rem] outline-none focus:border-[var(--pk)]" />
          </label>
          <nav className="no-scrollbar flex flex-1 gap-1.5 overflow-x-auto" aria-label="Menu sections">
            {sections.map((s) => (
              <a key={s.category} href={`#${slugId(s.category)}`} className={`shrink-0 rounded-full px-3.5 py-1.5 text-[0.875rem] font-medium transition ${activeSec === s.category ? "bg-[#151312] text-white" : "bg-white text-[#3A3431] ring-1 ring-[#EDE3DB] hover:bg-[#F4ECE6]"}`}>{s.category}</a>
            ))}
          </nav>
        </div>
        <label className="relative mt-2 block sm:hidden">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8C847D]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the menu" aria-label="Search the menu" className="h-10 w-full rounded-full border border-[#E6DCD4] bg-white pl-9 pr-3 text-[0.9375rem] outline-none focus:border-[var(--pk)]" />
        </label>
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-10">
          {sections.map((s) => (
            <section key={s.category} id={slugId(s.category)} data-cat={s.category} className="scroll-mt-[140px]">
              <h2 className="shop-serif text-[1.75rem] font-semibold">{s.category}</h2>
              {isKitchen(s.category) && kitchenClosedNow && <p className="mt-1 text-[0.875rem] text-[#8C847D]">Kitchen closed today — order ahead for another day.</p>}
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {s.items.map((i) => {
                  const off = !!i.soldOut;
                  const multi = i.isGroup || i.variations.length > 1;
                  return (
                    <button key={i.id} type="button" disabled={off} onClick={() => setOpen({ ...i, category: i.category ?? s.category })} data-track={`Order: ${i.name}`}
                      className="group flex w-full items-stretch gap-4 rounded-[20px] bg-white p-3 text-left ring-1 ring-[#EDE3DB] transition hover:-translate-y-0.5 hover:shadow-[0_18px_36px_-26px_rgba(80,45,40,.45)] disabled:opacity-55 disabled:hover:translate-y-0">
                      <span className="flex min-w-0 flex-1 flex-col py-1 pl-1">
                        <span className="font-semibold leading-snug">{i.name}</span>
                        {i.description && <span className="mt-1 line-clamp-2 text-[0.8438rem] leading-snug text-[#5E5853]">{i.description}</span>}
                        <span className="mt-auto flex items-center gap-2 pt-2 text-[0.9063rem] font-semibold">
                          {i.soldOut ? <span className="text-[#A39A93]">Sold out</span> : <>{multi ? <span className="font-normal text-[#8C847D]">from</span> : null}{money(fromPrice(i))}</>}
                        </span>
                      </span>
                      <span className="relative h-[104px] w-[104px] shrink-0 overflow-hidden rounded-[14px] bg-[#F4ECE6]">
                        {i.image ? <img src={i.image} alt="" loading="lazy" className="h-full w-full object-cover" /> : <span className="grid h-full w-full place-items-center text-[#C9BDB3]"><ShoppingBag className="h-7 w-7" /></span>}
                        {!i.soldOut && <span className="absolute bottom-1.5 right-1.5 grid h-8 w-8 place-items-center rounded-full bg-white text-[var(--pk)] shadow ring-1 ring-[#EDE3DB] transition group-hover:bg-[var(--pk)] group-hover:text-white"><Plus className="h-4 w-4" /></span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
          {!sections.length && <p className="py-10 text-center text-[#5E5853]">Nothing on the menu matches “{q}”.</p>}
        </div>
        <aside className="hidden lg:block"><div className="sticky top-[150px]">{cartPanel}</div></aside>
      </div>

      {count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#EEE6DF] bg-white/95 p-3 backdrop-blur lg:hidden">
          <button type="button" onClick={() => setDrawer(true)} className="shop-btn flex h-[54px] w-full items-center justify-between rounded-full bg-[var(--pk)] px-6 font-semibold text-white">
            <span className="flex items-center gap-2"><ShoppingBag className="h-5 w-5" />View order · {count}</span><span>{money(subtotal)}</span>
          </button>
        </div>
      )}
      {drawer && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40 lg:hidden" onClick={() => setDrawer(false)}>
          <div className="max-h-[88vh] w-full overflow-y-auto rounded-t-[28px] bg-[#FCFAF7] p-4" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Your order">
            <div className="mb-2 flex justify-end"><button type="button" onClick={() => setDrawer(false)} aria-label="Close" className="grid h-10 w-10 place-items-center rounded-full hover:bg-[#F4ECE6]"><X className="h-5 w-5" /></button></div>
            {cartPanel}
          </div>
        </div>
      )}
      {open && <ItemSheet item={open} onClose={() => setOpen(null)} onAdd={add} kitchenNote={isKitchen(open.category ?? null) && kitchenClosedNow} />}
    </div>
  );
}

function CartPanel({ lines, setQty, subtotal, surcharges, locationId, onCheckout }: { lines: CafeLine[]; setQty: (k: string, q: number) => void; subtotal: number; surcharges: Surcharges | null; locationId: string | null; onCheckout: () => void }) {
  const rows = surchargeRows(subtotal, surcharges, locationId);
  return (
    <div className="rounded-[24px] bg-white p-5 shadow-[0_30px_60px_-44px_rgba(80,45,40,.4)] ring-1 ring-[#EDE3DB]">
      <p className="shop-serif text-[1.5rem] font-semibold">Your order</p>
      {!lines.length ? (
        <div className="py-8 text-center text-[#8C847D]"><ShoppingBag className="mx-auto h-8 w-8" /><p className="mt-2 text-[0.9375rem]">Add something from the menu.</p></div>
      ) : (
        <>
          <ul className="mt-3 divide-y divide-[#F1E9E2]">
            {lines.map((l) => (
              <li key={l.key} className="flex gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-snug">{l.name}{l.variationName ? <span className="font-normal text-[#5E5853]"> · {l.variationName}</span> : null}</p>
                  {l.modifierNames.length > 0 && <p className="mt-0.5 text-[0.8125rem] text-[#5E5853]">{l.modifierNames.join(", ")}</p>}
                  {l.note && <p className="mt-0.5 text-[0.8125rem] italic text-[#8C847D]">“{l.note}”</p>}
                  <div className="mt-2 flex items-center gap-2">
                    <button type="button" aria-label="One less" onClick={() => setQty(l.key, l.quantity - 1)} className="grid h-8 w-8 place-items-center rounded-full ring-1 ring-[#E6DCD4] hover:bg-[#F4ECE6]">{l.quantity === 1 ? <Trash2 className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}</button>
                    <span className="w-6 text-center text-[0.9375rem] font-semibold tabular-nums">{l.quantity}</span>
                    <button type="button" aria-label="One more" onClick={() => setQty(l.key, l.quantity + 1)} className="grid h-8 w-8 place-items-center rounded-full ring-1 ring-[#E6DCD4] hover:bg-[#F4ECE6]"><Plus className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
                <p className="shrink-0 font-semibold tabular-nums">{money(l.unitPrice * l.quantity)}</p>
              </li>
            ))}
          </ul>
          <div className="mt-2 space-y-1 border-t border-[#F1E9E2] pt-3 text-[0.9375rem]">
            <div className="flex justify-between"><span className="text-[#5E5853]">Subtotal</span><span className="tabular-nums">{money(subtotal)}</span></div>
            {rows.map((r) => <div key={r.label} className="flex justify-between text-[0.875rem] text-[#5E5853]"><span>{r.label}</span><span className="tabular-nums">+{money(r.cents)}</span></div>)}
          </div>
          <button type="button" onClick={onCheckout} className="shop-btn mt-4 flex h-[54px] w-full items-center justify-center gap-2 rounded-full bg-[var(--pk)] font-semibold text-white shadow-[0_16px_30px_-16px_var(--pk)]" data-track="Order: checkout">
            Checkout · {money(subtotal + rows.reduce((s, r) => s + r.cents, 0))}
          </button>
        </>
      )}
    </div>
  );
}

function ItemSheet({ item: start, onClose, onAdd, kitchenNote }: { item: MenuItem; onClose: () => void; onAdd: (l: CafeLine) => void; kitchenNote: boolean }) {
  const [sub, setSub] = useState<MenuItem | null>(start.isGroup ? null : start);
  const item = sub ?? start;
  const firstVar = item.variations.find((v) => !v.soldOut) ?? item.variations[0];
  const [variationId, setVariationId] = useState(firstVar?.id ?? "");
  const [sel, setSel] = useState<Record<string, string[]>>(() => defaultSelection(item));
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  useEffect(() => { const v = item.variations.find((x) => !x.soldOut) ?? item.variations[0]; setVariationId(v?.id ?? ""); setSel(defaultSelection(item)); setTried(false); }, [item]);
  useEffect(() => { const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose(); document.addEventListener("keydown", esc); document.body.style.overflow = "hidden"; return () => { document.removeEventListener("keydown", esc); document.body.style.overflow = ""; }; }, [onClose]);
  const line = sub ? buildLine({ ...item, category: start.category }, variationId, sel, qty, note) : null;
  const unmet = sub ? unmetGroups(item, sel) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center sm:p-6" onClick={onClose}>
      <div role="dialog" aria-modal aria-label={item.name} onClick={(e) => e.stopPropagation()} className="flex max-h-[92vh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-[28px] bg-[#FCFAF7] sm:rounded-[28px]">
        <div className="relative shrink-0">
          {item.image ? <img src={item.image} alt="" className="aspect-[16/9] max-h-[30vh] w-full object-cover" /> : <div className="h-14" />}
          <button type="button" onClick={onClose} aria-label="Close" className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-white/95 shadow"><X className="h-5 w-5" /></button>
          {sub && start.isGroup && <button type="button" onClick={() => setSub(null)} className="absolute left-3 top-3 inline-flex h-10 items-center gap-1 rounded-full bg-white/95 px-3 text-[0.875rem] font-semibold shadow"><ArrowLeft className="h-4 w-4" />Back</button>}
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-4 pt-4 sm:px-6">
          <h3 className="shop-serif text-[1.75rem] font-semibold leading-tight">{item.name}</h3>
          {item.description && <p className="mt-2 whitespace-pre-line text-[0.9375rem] leading-relaxed text-[#5E5853]">{item.description}</p>}
          {kitchenNote && <p className="mt-3 rounded-xl bg-[#F4ECE6] px-3 py-2 text-[0.8438rem] text-[#3A3431]">The kitchen has closed for today — choose a pick-up time when it&apos;s open at checkout.</p>}

          {!sub && (
            <div className="mt-5 space-y-2">
              <p className="text-[0.875rem] font-semibold">Choose one</p>
              {(start.subProducts ?? []).map((s) => (
                <button key={s.id} type="button" disabled={s.soldOut} onClick={() => setSub(s)} className="flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left ring-1 ring-[#EDE3DB] hover:ring-[var(--pk)] disabled:opacity-50">
                  {s.image && <img src={s.image} alt="" className="h-14 w-14 rounded-xl object-cover" />}
                  <span className="flex-1 font-semibold">{s.name}</span>
                  <span className="text-[0.9063rem]">{s.soldOut ? "Sold out" : money(fromPrice(s))}</span>
                </button>
              ))}
            </div>
          )}

          {sub && item.variations.length > 1 && (
            <fieldset className="mt-5">
              <legend className="text-[0.875rem] font-semibold">Size</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {item.variations.map((v) => (
                  <button key={v.id} type="button" disabled={v.soldOut} onClick={() => setVariationId(v.id)} aria-pressed={variationId === v.id}
                    className={`rounded-full px-4 py-2 text-[0.9063rem] font-medium ring-1 transition disabled:opacity-40 ${variationId === v.id ? "bg-[#151312] text-white ring-[#151312]" : "bg-white ring-[#E6DCD4] hover:ring-[#151312]"}`}>
                    {v.name || "Regular"} · {money(v.price ?? 0)}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          {sub && (item.modifierGroups ?? []).filter((g) => g.modifiers.length).map((g) => {
            const cur = sel[g.id] ?? [];
            const need = g.min ?? 0;
            const bad = tried && cur.length < need;
            const single = g.selectionType === "SINGLE" || g.max === 1;
            return (
              <fieldset key={g.id} className="mt-5">
                <legend className="flex w-full items-center justify-between gap-3 text-[0.875rem] font-semibold">
                  <span>{g.name}</span>
                  <span className={`text-[0.75rem] font-medium ${bad ? "text-[#B42318]" : "text-[#8C847D]"}`}>{need > 0 ? (single ? "Required" : `Choose at least ${need}`) : (g.max ?? -1) > 1 ? `Up to ${g.max}` : "Optional"}</span>
                </legend>
                <div className={`mt-2 divide-y divide-[#F1E9E2] overflow-hidden rounded-2xl bg-white ring-1 ${bad ? "ring-[#F3B4AE]" : "ring-[#EDE3DB]"}`}>
                  {g.modifiers.map((m) => {
                    const on = cur.includes(m.id);
                    return (
                      <button key={m.id} type="button" onClick={() => setSel({ ...sel, [g.id]: toggleOption(g, cur, m.id) })} aria-pressed={on} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[#FBF7F4]">
                        <span className={`grid h-5 w-5 shrink-0 place-items-center ${single ? "rounded-full" : "rounded-md"} ring-[1.5px] ${on ? "bg-[var(--pk)] text-white ring-[var(--pk)]" : "ring-[#CFC4BB]"}`}>{on && <Check className="h-3.5 w-3.5" />}</span>
                        <span className="flex-1 text-[0.9375rem]">{m.name}</span>
                        {m.price > 0 && <span className="text-[0.875rem] text-[#5E5853]">+{money(m.price)}</span>}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}

          {sub && (
            <label className="mt-5 block">
              <span className="text-[0.875rem] font-semibold">Note for the kitchen <span className="font-normal text-[#8C847D]">(optional)</span></span>
              <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="e.g. extra hot, no onion" className={`${field} mt-2`} />
            </label>
          )}
        </div>
        {sub && line && (
          <div className="flex shrink-0 items-center gap-3 border-t border-[#EEE6DF] bg-white px-5 py-4 sm:px-6">
            <div className="flex items-center gap-2">
              <button type="button" aria-label="One less" onClick={() => setQty(Math.max(1, qty - 1))} className="grid h-10 w-10 place-items-center rounded-full ring-1 ring-[#E6DCD4]"><Minus className="h-4 w-4" /></button>
              <span className="w-6 text-center font-semibold tabular-nums">{qty}</span>
              <button type="button" aria-label="One more" onClick={() => setQty(Math.min(50, qty + 1))} className="grid h-10 w-10 place-items-center rounded-full ring-1 ring-[#E6DCD4]"><Plus className="h-4 w-4" /></button>
            </div>
            <button type="button" onClick={() => { if (unmet.length) { setTried(true); return; } onAdd(line); }}
              className="shop-btn flex h-[52px] flex-1 items-center justify-center rounded-full bg-[var(--pk)] font-semibold text-white">
              {unmet.length && tried ? `Choose ${unmet[0].name.toLowerCase()}` : `Add · ${money(line.unitPrice * line.quantity)}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Checkout(p: Props & { lines: CafeLine[]; setQty: (k: string, q: number) => void; isKitchen: (c: string | null) => boolean; onBack: () => void; onPaid: (d: { orderId: string; ticketName: string | null; when: string; amount: number; receiptUrl: string | null }) => void }) {
  const canNow = p.hours.open;
  const dates = useMemo(() => openDates(p.hours.weekly, p.hours.closures, p.now, p.maxDays), [p.hours, p.now, p.maxDays]);
  const [mode, setMode] = useState<"asap" | "later">(canNow ? "asap" : "later");
  const [date, setDate] = useState(dates[0] ?? "");
  const slots = useMemo(() => (date ? slotsFor(date, p.hours.weekly, p.hours.closures, p.now) : []), [date, p.hours, p.now]);
  const [time, setTime] = useState("");
  useEffect(() => { if (!slots.some((s) => s.value === time)) setTime(slots[0]?.value ?? ""); }, [slots, time]);
  const [f, setF] = useState({ name: "", phone: "", email: "", note: "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [cardState, setCardState] = useState<"loading" | "ready" | "error">("loading");
  const card = useRef<Card | null>(null);
  const payments = useRef<Payments | null>(null);
  const subtotal = cartSubtotal(p.lines);
  const rows = surchargeRows(subtotal, p.surcharges, p.locationId);
  const estimate = subtotal + rows.reduce((s, r) => s + r.cents, 0);

  useEffect(() => {
    try { const s = JSON.parse(localStorage.getItem("eos_cafe_me") || "{}"); setF((x) => ({ ...x, name: s.name || "", phone: s.phone || "", email: s.email || "" })); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    let gone = false;
    (async () => {
      try {
        const sq = await loadSquare(p.square.environment);
        if (gone) return;
        const pay = sq.payments(p.square.applicationId, p.square.locationId);
        payments.current = pay;
        const c = await pay.card();
        if (gone) { void c.destroy(); return; }
        await c.attach("#cafe-card");
        card.current = c;
        setCardState("ready");
      } catch (e) { if (!gone) { setCardState("error"); setErr(e instanceof Error ? e.message : "Card payments didn't load."); } }
    })();
    return () => { gone = true; void card.current?.destroy().catch(() => {}); card.current = null; };
  }, [p.square]);

  // Kitchen items need the kitchen open at the pick-up time.
  const kitchenProblem = (() => {
    const k = p.hours.kitchen;
    if (!k || !p.lines.some((l) => p.isKitchen(l.category))) return null;
    if (mode === "asap") return k.open === false ? "The kitchen has closed for today — choose a later pick-up time, or remove the food items." : null;
    if (!k.hasHours || !k.weekly || !date || !time) return null;
    const [hh, mm] = time.split(":").map(Number);
    const m = hh * 60 + mm;
    const ok = periodsFor(k.weekly, dowOf(date)).some((x) => m >= x.s && m < (x.e <= x.s ? x.e + 1440 : x.e));
    return ok ? null : "The kitchen isn't open at that time — choose another time, or remove the food items.";
  })();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!p.lines.length) return setErr("Your order is empty.");
    if (f.name.trim().length < 2) return setErr("Add your name so we know whose order it is.");
    if (f.phone.replace(/\D/g, "").length < 8) return setErr("Add a mobile number in case we need to reach you.");
    if (mode === "later" && (!date || !time)) return setErr("Choose a pick-up time.");
    if (kitchenProblem) return setErr(kitchenProblem);
    if (!card.current || !payments.current) return setErr("The card form hasn't loaded yet.");
    try { localStorage.setItem("eos_cafe_me", JSON.stringify({ name: f.name.trim(), phone: f.phone.trim(), email: f.email.trim() })); } catch { /* ignore */ }

    // Check the card details first, so nothing is created for a typo.
    setBusy("Checking your card…");
    const tok = await card.current.tokenize().catch(() => null);
    if (!tok || tok.status !== "OK" || !tok.token) { setBusy(null); return setErr(tok?.errors?.[0]?.message || "Please check your card details."); }

    setBusy("Placing your order…");
    const started = await startCafeOrder(p.slug, {
      lines: p.lines.map((l) => ({ variationId: l.variationId, quantity: l.quantity, modifierIds: l.modifierIds, note: l.note || undefined, presetId: l.presetId, custom: l.custom })),
      name: f.name.trim(), phone: f.phone.trim(), note: f.note.trim(), when: mode === "later" ? { date, time } : null,
    });
    if (!started.ok) { setBusy(null); return setErr(started.error); }

    let verificationToken: string | undefined;
    if (started.amount > 0) {
      setBusy("Confirming with your bank…");
      try {
        const v = await payments.current.verifyBuyer(tok.token, { intent: "CHARGE", amount: (started.amount / 100).toFixed(2), currencyCode: started.currency, billingContact: { givenName: f.name.trim(), email: f.email.trim() || undefined, phone: f.phone.trim() } });
        verificationToken = v?.token;
      } catch { /* the app treats verification as optional, as it does in its own checkout */ }
    }
    setBusy(`Paying ${money(started.amount)}…`);
    const paid = await payCafeOrder(p.slug, { ticket: started.ticket, sourceId: tok.token, verificationToken, email: f.email.trim() });
    if (!paid.ok) {
      await cancelCafeOrder(p.slug, started.ticket).catch(() => {});
      setBusy(null);
      // a Square card token is single-use — reattach a fresh card form for the next try
      try { await card.current?.destroy(); const c = await payments.current.card(); await c.attach("#cafe-card"); card.current = c; } catch { /* ignore */ }
      return setErr(paid.error);
    }
    setBusy(null);
    p.onPaid({ orderId: started.orderId, ticketName: started.ticketName, amount: started.amount, receiptUrl: paid.receiptUrl, when: mode === "later" ? `${dateLabel(date, p.now.date)} at ${slots.find((s) => s.value === time)?.label ?? time}` : "As soon as possible" });
  }

  return (
    <div className="mx-auto w-full max-w-[1360px] px-5 pb-16 pt-6 sm:px-8 lg:px-10">
      <button type="button" onClick={p.onBack} className="inline-flex items-center gap-1.5 text-[0.9375rem] font-semibold text-[#3A3431] hover:text-black"><ArrowLeft className="h-4 w-4" />Back to the menu</button>
      <form onSubmit={submit} className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]" data-track="Café order checkout">
        <div className="space-y-6">
          <section className="rounded-[24px] bg-white p-5 ring-1 ring-[#EDE3DB] sm:p-7">
            <p className="shop-serif text-[1.5rem] font-semibold">Pick-up</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {([["asap", "As soon as possible", canNow ? "Usually ready in minutes" : "We're closed right now"], ["later", "Choose a time", "Today or another day"]] as const).map(([k, t, d]) => (
                <button key={k} type="button" disabled={k === "asap" && !canNow} onClick={() => setMode(k)} aria-pressed={mode === k}
                  className={`rounded-2xl p-4 text-left ring-1 transition disabled:opacity-45 ${mode === k ? "bg-[color-mix(in_srgb,var(--pk)_8%,white)] ring-2 ring-[var(--pk)]" : "ring-[#E6DCD4] hover:ring-[#151312]"}`}>
                  <span className="block font-semibold">{t}</span><span className="mt-0.5 block text-[0.8125rem] text-[#5E5853]">{d}</span>
                </button>
              ))}
            </div>
            {mode === "later" && (
              dates.length ? (
                <div className="mt-4 space-y-3">
                  <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                    {dates.map((d) => <button key={d} type="button" onClick={() => setDate(d)} aria-pressed={date === d} className={`shrink-0 rounded-full px-4 py-2 text-[0.875rem] font-medium ring-1 ${date === d ? "bg-[#151312] text-white ring-[#151312]" : "bg-white ring-[#E6DCD4]"}`}>{dateLabel(d, p.now.date)}</button>)}
                  </div>
                  <select value={time} onChange={(e) => setTime(e.target.value)} className={field} aria-label="Pick-up time">
                    {slots.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              ) : <p className="mt-4 text-[0.9375rem] text-[#5E5853]">There are no pick-up times available in the next few days.</p>
            )}
            {kitchenProblem && <p className="mt-3 rounded-xl bg-[#FFF6EC] px-3 py-2 text-[0.875rem] text-[#7A4A12]">{kitchenProblem}</p>}
          </section>

          <section className="rounded-[24px] bg-white p-5 ring-1 ring-[#EDE3DB] sm:p-7">
            <p className="shop-serif text-[1.5rem] font-semibold">Your details</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div><label className={lbl} htmlFor="co-name">Name</label><input id="co-name" className={field} autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></div>
              <div><label className={lbl} htmlFor="co-phone">Mobile</label><input id="co-phone" type="tel" className={field} autoComplete="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} required /></div>
              <div className="sm:col-span-2"><label className={lbl} htmlFor="co-email">Email for your receipt <span className="font-normal text-[#8C847D]">(optional)</span></label><input id="co-email" type="email" className={field} autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
              <div className="sm:col-span-2"><label className={lbl} htmlFor="co-note">Anything else? <span className="font-normal text-[#8C847D]">(optional)</span></label><input id="co-note" className={field} maxLength={250} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
            </div>
          </section>

          <section className="rounded-[24px] bg-white p-5 ring-1 ring-[#EDE3DB] sm:p-7">
            <p className="flex items-center gap-2 shop-serif text-[1.5rem] font-semibold"><Lock className="h-5 w-5 text-[#5E5853]" />Payment</p>
            <p className="mt-1 text-[0.8438rem] text-[#5E5853]">Card details go straight to Square — this website never sees them.</p>
            <div id="cafe-card" className="mt-4 min-h-[90px]" />
            {cardState === "loading" && <p className="flex items-center gap-2 text-[0.875rem] text-[#8C847D]"><Loader2 className="h-4 w-4 animate-spin" />Loading secure card form…</p>}
          </section>
        </div>

        <aside>
          <div className="sticky top-[80px] rounded-[24px] bg-white p-5 shadow-[0_30px_60px_-44px_rgba(80,45,40,.4)] ring-1 ring-[#EDE3DB] sm:p-7">
            <p className="shop-serif text-[1.5rem] font-semibold">Summary</p>
            <ul className="mt-3 divide-y divide-[#F1E9E2]">
              {p.lines.map((l) => (
                <li key={l.key} className="flex justify-between gap-3 py-2.5 text-[0.9375rem]">
                  <span className="min-w-0"><span className="font-semibold">{l.quantity} × {l.name}</span>{l.variationName && <span className="text-[#5E5853]"> · {l.variationName}</span>}{l.modifierNames.length > 0 && <span className="block text-[0.8125rem] text-[#5E5853]">{l.modifierNames.join(", ")}</span>}</span>
                  <span className="shrink-0 tabular-nums">{money(l.unitPrice * l.quantity)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-2 space-y-1 border-t border-[#F1E9E2] pt-3 text-[0.9375rem]">
              <div className="flex justify-between"><span className="text-[#5E5853]">Subtotal</span><span className="tabular-nums">{money(subtotal)}</span></div>
              {rows.map((r) => <div key={r.label} className="flex justify-between text-[0.875rem] text-[#5E5853]"><span>{r.label}</span><span className="tabular-nums">+{money(r.cents)}</span></div>)}
              <div className="flex justify-between pt-2 text-[1.125rem] font-semibold"><span>Total</span><span className="tabular-nums">{money(estimate)}</span></div>
              <p className="text-[0.75rem] text-[#8C847D]">Square confirms the exact total when you pay.</p>
            </div>
            {err && <p className="mt-4 rounded-xl bg-[#FFF1F1] px-4 py-3 text-[0.875rem] text-[#B42318]" role="alert">{err}</p>}
            <button type="submit" disabled={!!busy || cardState !== "ready" || !p.lines.length} className="shop-btn mt-5 flex h-[56px] w-full items-center justify-center gap-2 rounded-full bg-[var(--pk)] font-semibold text-white shadow-[0_16px_30px_-16px_var(--pk)] disabled:opacity-60" data-track="Order: pay">
              {busy ? <><Loader2 className="h-5 w-5 animate-spin" />{busy}</> : <><Lock className="h-4 w-4" />Pay {money(estimate)}</>}
            </button>
            <p className="mt-3 text-center text-[0.75rem] text-[#8C847D]">Your order goes straight to our café system.</p>
          </div>
        </aside>
      </form>
    </div>
  );
}

const STEPS = [["new", "Received"], ["preparing", "Being made"], ["ready", "Ready to collect"]] as const;

function Done(p: Props & { done: { orderId: string; ticketName: string | null; when: string; amount: number; receiptUrl: string | null }; onAgain: () => void }) {
  const [status, setStatus] = useState<string>("new");
  useEffect(() => {
    let stop = false;
    const tick = async () => { const s = await cafeOrderStatus(p.slug, p.done.orderId).catch(() => null); if (!stop && s) setStatus(s); };
    void tick();
    const t = setInterval(tick, 15000);
    return () => { stop = true; clearInterval(t); };
  }, [p.slug, p.done.orderId]);
  const idx = status === "done" ? 3 : Math.max(0, STEPS.findIndex(([k]) => k === status));
  return (
    <div className="mx-auto w-full max-w-[640px] px-5 py-12 text-center sm:py-16">
      <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200"><Check className="h-8 w-8" /></span>
      <h2 className="shop-serif mt-5 text-[2.25rem] font-semibold">Thanks — your order&apos;s in</h2>
      <p className="mt-2 text-[1.0625rem] text-[#5E5853]">Paid {money(p.done.amount)} · Pick-up: <strong className="text-[#151312]">{p.done.when}</strong></p>
      {p.done.ticketName && <p className="mt-1 text-[#5E5853]">Order name: <strong className="text-[#151312]">{p.done.ticketName}</strong></p>}
      <div className="mt-8 rounded-[24px] bg-white p-6 text-left ring-1 ring-[#EDE3DB]">
        <ol className="space-y-3">
          {STEPS.map(([k, label], i) => (
            <li key={k} className="flex items-center gap-3">
              <span className={`grid h-8 w-8 place-items-center rounded-full text-[0.8125rem] font-semibold ${i <= idx ? "bg-[var(--pk)] text-white" : "bg-[#F4ECE6] text-[#8C847D]"}`}>{i < idx || idx === 3 ? <Check className="h-4 w-4" /> : i + 1}</span>
              <span className={i <= idx ? "font-semibold" : "text-[#8C847D]"}>{label}</span>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-[0.8125rem] text-[#8C847D]">This updates by itself — keep the page open if you like.</p>
      </div>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {p.done.receiptUrl && <a href={p.done.receiptUrl} target="_blank" rel="noopener noreferrer" className="shop-btn inline-flex h-[52px] items-center rounded-full px-6 font-semibold ring-1 ring-[#1F1B19]">View receipt</a>}
        <button type="button" onClick={p.onAgain} className="shop-btn inline-flex h-[52px] items-center rounded-full bg-[var(--pk)] px-6 font-semibold text-white">Order something else</button>
      </div>
      {p.phone && <p className="mt-6 text-[0.875rem] text-[#5E5853]">Need to change something? Call {p.business} on <a href={`tel:${p.phone.replace(/[^\d+]/g, "")}`} className="font-semibold text-[#151312]">{p.phone}</a>.</p>}
    </div>
  );
}
