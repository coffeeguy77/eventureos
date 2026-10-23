"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Bean, CakeSlice, Check, ChefHat, Coffee, CupSoda, UtensilsCrossed, ChevronLeft, ChevronRight, Clock, Loader2, Lock, Minus, Plus, Search, ShoppingBag, Sparkles, Trash2, X } from "lucide-react";
import { cafeOrderStatus, cancelCafeOrder, payCafeOrder, startCafeOrder } from "@/app/cafe/[org]/actions";
import {
  buildLine, cartSubtotal, comboDiscounts, comboLines, comboPickPrice, dateLabel, defaultSelection, fromPrice, isCombo, money, openDates, periodsFor, dowOf, slotsFor, surchargeRows, toggleOption, unmetGroups,
  type Banner, type CafeLine, type FooterSlot, type Closure, type ComboGroup, type ComboOption, type MenuGroup, type MenuItem, type MenuSection, type Surcharges, type Weekly,
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
  banners?: Banner[]; bannerRatio?: string | null; bannerInterval?: number;
  footer?: FooterSlot[]; pickup?: string;
}

const field = "h-[50px] w-full rounded-[14px] border border-[#E6DCD4] bg-white px-4 text-[0.9688rem] text-[#151312] outline-none transition placeholder:text-[#A39A93] focus:border-[var(--pk)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--pk)_14%,transparent)]";
const lbl = "mb-1.5 block text-[0.8125rem] font-semibold text-[#3A3431]";
const slugId = (s: string) => `sec-${s.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
const pill = (on: boolean) => `inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-3.5 py-1.5 text-left text-[0.875rem] font-medium ring-1 transition disabled:opacity-40 ${on ? "bg-[#151312] text-white ring-[#151312]" : "bg-white text-[#26211E] ring-[#E6DCD4] hover:ring-[#151312]"}`;
const newInstance = () => `ci${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

type Open = { item: MenuItem; showImage: boolean };

export function OrderApp(p: Props) {
  const store = `eos_cafe_cart_${p.slug}`;
  const [lines, setLines] = useState<CafeLine[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState<Open | null>(null);
  const [step, setStep] = useState<"menu" | "checkout" | "done">("menu");
  const [drawer, setDrawer] = useState(false);
  const [q, setQ] = useState("");
  const [activeSec, setActiveSec] = useState(p.menu[0]?.category ?? "");
  const hold = useRef(0); // while a footer/menu button is scrolling, don't let the scroll position change the highlighted section
  const [done, setDone] = useState<{ orderId: string; ticketName: string | null; when: string; amount: number; receiptUrl: string | null } | null>(null);

  useEffect(() => {
    try { const raw = localStorage.getItem(store); if (raw) { const v = JSON.parse(raw); if (Array.isArray(v)) setLines(v.filter((l) => l && typeof l.variationId === "string")); } } catch { /* storage unavailable */ }
    setLoaded(true);
  }, [store]);
  useEffect(() => { if (loaded) try { localStorage.setItem(store, JSON.stringify(lines)); } catch { /* ignore */ } }, [lines, loaded, store]);

  // Lines whose item is no longer on the menu (sold out / removed) are dropped — a whole combo goes if any part of it has.
  const known = useMemo(() => {
    const ids = new Set<string>();
    const walk = (i: MenuItem) => {
      if (i.isGroup) (i.subProducts ?? []).forEach(walk);
      else if (isCombo(i)) (i.comboGroups ?? []).forEach((g) => g.options.forEach((o) => o.variations.forEach((v) => { if (!v.soldOut) ids.add(v.id); })));
      else if (!i.soldOut) i.variations.forEach((v) => { if (!v.soldOut) ids.add(v.id); });
    };
    p.menu.forEach((s) => s.items.forEach(walk));
    return ids;
  }, [p.menu]);
  useEffect(() => {
    if (!loaded) return;
    setLines((ls) => {
      const badCombos = new Set(ls.filter((l) => l.comboInstanceId && !known.has(l.variationId)).map((l) => l.comboInstanceId));
      return ls.filter((l) => known.has(l.variationId) && !(l.comboInstanceId && badCombos.has(l.comboInstanceId)));
    });
  }, [loaded, known]);

  const kitchenCats = useMemo(() => new Set((p.hours.kitchen?.categories ?? []).map((c) => c.toLowerCase())), [p.hours.kitchen]);
  const kitchenClosedNow = !!p.hours.kitchen && p.hours.kitchen.open === false && p.hours.open;
  const isKitchen = (cat: string | null) => !!cat && kitchenCats.has(cat.toLowerCase());

  const sections = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return p.menu;
    return p.menu.map((s) => ({ ...s, banner: null, items: s.items.filter((i) => `${i.name} ${i.description ?? ""}`.toLowerCase().includes(t)) })).filter((s) => s.items.length);
  }, [p.menu, q]);

  useEffect(() => {
    if (step !== "menu" || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver((es) => { const v = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]; if (v && Date.now() > hold.current) setActiveSec((v.target as HTMLElement).dataset.cat ?? ""); }, { rootMargin: "-130px 0px -60% 0px" });
    document.querySelectorAll("[data-cat]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [sections, step]);

  const addLines = (add: CafeLine[]) => {
    setLines((ls) => {
      const n = [...ls];
      for (const line of add) {
        const i = line.comboInstanceId ? -1 : n.findIndex((l) => l.key === line.key);
        if (i < 0) n.push(line); else n[i] = { ...n[i], quantity: Math.min(50, n[i].quantity + line.quantity) };
      }
      return n;
    });
    setOpen(null);
  };
  /** Quantity for a plain line, or for a whole combo (every line of it moves together). */
  const setQty = (key: string, qty: number) => setLines((ls) => {
    const l = ls.find((x) => x.key === key);
    const same = (x: CafeLine) => (l?.comboInstanceId ? x.comboInstanceId === l.comboInstanceId : x.key === key);
    return qty <= 0 ? ls.filter((x) => !same(x)) : ls.map((x) => (same(x) ? { ...x, quantity: Math.min(50, qty) } : x));
  });
  const count = lines.filter((l, i) => !l.comboInstanceId || lines.findIndex((x) => x.comboInstanceId === l.comboInstanceId) === i).reduce((n, l) => n + l.quantity, 0);
  const subtotal = cartSubtotal(lines);

  // Banners and section banners can open an item (or combo) or jump to a section
  const findItem = useCallback((id: string) => {
    for (const s of p.menu) {
      const hit = s.items.find((i) => i.id === id) ?? s.items.flatMap((i) => i.subProducts ?? []).find((i) => i.id === id);
      if (hit) return { item: { ...hit, category: hit.category ?? s.category }, showImage: s.showImages !== false };
    }
    return null;
  }, [p.menu]);
  const follow = (link: Banner["link"]) => {
    if (link.type === "item") { const hit = findItem(link.value); if (hit && !hit.item.soldOut) setOpen(hit); else document.getElementById("menu-top")?.scrollIntoView({ behavior: "smooth" }); }
    else if (link.type === "category") document.getElementById(slugId(p.menu.find((s) => s.category.toLowerCase() === link.value.toLowerCase())?.category ?? link.value))?.scrollIntoView({ behavior: "smooth" });
    else if (link.type === "url") window.open(link.value, "_blank", "noopener,noreferrer");
  };

  if (step === "done" && done) return <Done {...p} done={done} onAgain={() => { setDone(null); setStep("menu"); }} />;
  if (step === "checkout") {
    return <Checkout {...p} lines={lines} setQty={setQty} isKitchen={isKitchen} onBack={() => setStep("menu")}
      onPaid={(d) => { setDone(d); setLines([]); setStep("done"); window.scrollTo({ top: 0 }); }} />;
  }

  const cartPanel = (
    <CartPanel lines={lines} setQty={setQty} subtotal={subtotal} surcharges={p.surcharges} locationId={p.locationId}
      onCheckout={() => { setDrawer(false); setStep("checkout"); window.scrollTo({ top: 0 }); }} />
  );

  const footer = p.footer ?? [];
  const jump = (cat: string) => { hold.current = Date.now() + 1200; setActiveSec(cat); document.getElementById(slugId(cat))?.scrollIntoView({ behavior: "smooth" }); };
  const search = (
    <label className="relative block w-full sm:w-72 sm:shrink-0">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8C847D]" />
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the menu" aria-label="Search the menu" className="h-11 w-full rounded-full border border-[#E6DCD4] bg-white pl-10 pr-4 text-[0.9375rem] outline-none focus:border-[var(--pk)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--pk)_14%,transparent)]" />
    </label>
  );

  return (
    <div className={`mx-auto w-full max-w-[1360px] px-5 sm:px-8 lg:px-10 ${footer.length ? "pb-44 lg:pb-32" : "pb-28 lg:pb-16"}`}>
      {/* One slim row: what this page is, whether we're open, and the search */}
      <div className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="shop-serif shrink-0 text-[1.75rem] font-semibold leading-tight">Order online</h1>
          {!p.hours.open ? (
            <p className="flex min-w-0 items-center gap-2 rounded-full bg-[#FFF6EC] px-3.5 py-1.5 text-[0.875rem] text-[#7A4A12] ring-1 ring-[#F6DFC3]">
              <Clock className="h-4 w-4 shrink-0" />
              <span>{p.hours.paused ? "Online ordering is paused right now." : <>Closed{p.hours.nextOpen ? ` · opens ${p.hours.nextOpen}` : ""} — <span className="font-semibold">order ahead for pick-up</span></>}</span>
            </p>
          ) : (
            <p className="flex items-center gap-2 rounded-full bg-emerald-50 px-3.5 py-1.5 text-[0.875rem] font-semibold text-emerald-800 ring-1 ring-emerald-200"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />Open now{p.pickup ? ` · pick up from ${p.pickup}` : ""}</p>
          )}
          {kitchenClosedNow && <p className="flex items-center gap-2 rounded-full bg-[#F4ECE6] px-3.5 py-1.5 text-[0.875rem] text-[#3A3431]"><ChefHat className="h-4 w-4" />Kitchen closed for today — drinks still available</p>}
        </div>
        {search}
      </div>

      {!!p.banners?.length && <Banners banners={p.banners} ratio={p.bannerRatio ?? "3 / 2"} interval={p.bannerInterval ?? 5} onClick={follow} />}

      <div id="menu-top" className="sticky top-[58px] z-30 -mx-5 mt-4 scroll-mt-[60px] border-b border-[#EEE6DF] bg-[#FCFAF7]/95 px-5 py-2.5 backdrop-blur sm:-mx-8 sm:px-8 lg:-mx-10 lg:px-10">
        <nav className="no-scrollbar flex gap-1.5 overflow-x-auto lg:flex-wrap lg:overflow-visible" aria-label="Menu sections">
          {sections.map((s) => (
            <a key={s.category} href={`#${slugId(s.category)}`} className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[0.875rem] font-medium transition ${activeSec === s.category ? "bg-[#151312] text-white" : "bg-white text-[#3A3431] ring-1 ring-[#EDE3DB] hover:bg-[#F4ECE6]"}`}>{s.category}</a>
          ))}
        </nav>
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-10">
          {sections.map((s) => {
            const pics = s.showImages !== false;
            return (
              <section key={s.category} id={slugId(s.category)} data-cat={s.category} className="scroll-mt-[130px]">
                <h2 className="shop-serif text-[1.75rem] font-semibold">{s.category}</h2>
                {isKitchen(s.category) && kitchenClosedNow && <p className="mt-1 text-[0.875rem] text-[#8C847D]">Kitchen closed today — order ahead for another day.</p>}
                {s.banner && (
                  <button type="button" onClick={() => s.banner?.itemId && follow({ type: "item", value: s.banner.itemId })} disabled={!s.banner.itemId}
                    className="mt-4 block w-full overflow-hidden rounded-[20px] bg-[#F4ECE6] text-left ring-1 ring-[#EDE3DB] enabled:hover:shadow-[0_18px_36px_-26px_rgba(80,45,40,.45)]">
                    {s.banner.image && <img src={s.banner.image} alt={s.banner.title || s.category} loading="lazy" className="max-h-[260px] w-full object-contain" />}
                    {s.banner.title && !s.banner.hideText && <span className="block px-5 py-3 font-semibold">{s.banner.title}</span>}
                  </button>
                )}
                {pics ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {s.items.map((i) => <ItemCard key={i.id} i={i} onOpen={() => setOpen({ item: { ...i, category: i.category ?? s.category }, showImage: true })} />)}
                  </div>
                ) : (
                  <ul className="mt-3 grid gap-x-6 sm:grid-cols-2">
                    {s.items.map((i) => <ItemRow key={i.id} i={i} onOpen={() => setOpen({ item: { ...i, category: i.category ?? s.category }, showImage: false })} />)}
                  </ul>
                )}
              </section>
            );
          })}
          {!sections.length && <p className="py-10 text-center text-[#5E5853]">Nothing on the menu matches “{q}”.</p>}
        </div>
        <aside className="hidden lg:block"><div className="sticky top-[130px]">{cartPanel}</div></aside>
      </div>

      {(footer.length > 0 || count > 0) && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex flex-col items-center gap-2 lg:bottom-4">
          {count > 0 && (
            <div className="pointer-events-auto w-full px-3 lg:hidden">
              <button type="button" onClick={() => setDrawer(true)} className="shop-btn flex h-[52px] w-full items-center justify-between rounded-full bg-[var(--pk)] px-6 font-semibold text-white shadow-[0_16px_30px_-16px_var(--pk)]">
                <span className="flex items-center gap-2"><ShoppingBag className="h-5 w-5" />View order · {count}</span><span>{money(subtotal)}</span>
              </button>
            </div>
          )}
          {footer.length > 0 && !q && <FooterDock slots={footer} active={activeSec} onGo={jump} />}
          {count > 0 && !footer.length && <div className="h-3 lg:hidden" />}
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
      {open && (isCombo(open.item)
        ? <ComboSheet combo={open.item} showImage={open.showImage} onClose={() => setOpen(null)} onAdd={addLines} />
        : <ItemSheet item={open.item} showImage={open.showImage} onClose={() => setOpen(null)} onAdd={(l) => addLines([l])} kitchenNote={isKitchen(open.item.category ?? null) && kitchenClosedNow} />)}
    </div>
  );
}

/* ------------------------------------------------------------------ footer icons */

const dockIcon = (label: string, cats: string[]) => {
  const s = `${label} ${cats.join(" ")}`.toLowerCase();
  if (/coffee bag|bean/.test(s)) return Bean;
  if (/coffee|tea|hot/.test(s)) return Coffee;
  if (/cold|shake|smooth|ice|juice/.test(s)) return CupSoda;
  if (/cake|pastr|sweet/.test(s)) return CakeSlice;
  if (/special|combo/.test(s)) return Sparkles;
  return UtensilsCrossed;
};

/** The app's footer buttons. Pressing one again steps to its next section (e.g. All Day: Breakfast → Lunch → Breakfast). */
function FooterDock({ slots, active, onGo }: { slots: FooterSlot[]; active: string; onGo: (cat: string) => void }) {
  const last = useRef<{ slot: number; idx: number }>({ slot: -1, idx: 0 });
  return (
    <nav aria-label="Menu" className="pointer-events-auto w-full border-t border-[#EEE6DF] bg-white/95 backdrop-blur lg:w-auto lg:rounded-full lg:border lg:px-2 lg:shadow-[0_24px_50px_-28px_rgba(60,30,20,.55)]">
      <div className="mx-auto flex max-w-[640px] justify-around lg:max-w-none lg:gap-1">
        {slots.map((s, i) => {
          const at = s.cats.indexOf(active);
          const on = at >= 0;
          const Icon = dockIcon(s.label, s.cats);
          return (
            <button key={`${s.label}-${i}`} type="button" aria-current={on ? "true" : undefined}
              title={s.cats.length > 1 ? `${s.label}: ${s.cats.join(", ")}` : s.label}
              onClick={() => {
                // Same button again → its next section; a different button → its first section (as in the app)
                const idx = last.current.slot === i && on ? (Math.max(0, at) + 1) % s.cats.length : 0;
                last.current = { slot: i, idx };
                onGo(s.cats[idx]);
              }}
              className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1.5 pb-2 pt-2 text-[0.6875rem] font-semibold transition lg:min-w-[84px] lg:flex-none lg:rounded-full lg:px-3 ${on ? "text-[var(--pk)]" : "text-[#5E5853] hover:text-[#151312]"}`}>
              {s.svg
                ? <span aria-hidden className="block h-[26px] w-[26px] [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: s.svg }} />
                : <Icon aria-hidden className="h-[26px] w-[26px]" strokeWidth={1.8} />}
              <span className="max-w-full truncate">{s.label}</span>
              {s.cats.length > 1 && <span aria-hidden className="flex gap-0.5">{s.cats.map((c) => <span key={c} className={`h-1 w-1 rounded-full ${c === active ? "bg-[var(--pk)]" : "bg-[#D9CEC6]"}`} />)}</span>}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/* ------------------------------------------------------------------ menu tiles */

function Price({ i }: { i: MenuItem }) {
  const multi = i.isGroup || i.variations.length > 1;
  if (i.soldOut) return <span className="text-[#A39A93]">Sold out</span>;
  return <>{multi ? <span className="font-normal text-[#8C847D]">from</span> : null}{multi ? " " : null}{money(fromPrice(i))}</>;
}

function ItemCard({ i, onOpen }: { i: MenuItem; onOpen: () => void }) {
  const combo = isCombo(i);
  return (
    <button type="button" disabled={!!i.soldOut} onClick={onOpen} data-track={`Order: ${i.name}`}
      className="group flex w-full items-stretch gap-4 rounded-[20px] bg-white p-3 text-left ring-1 ring-[#EDE3DB] transition hover:-translate-y-0.5 hover:shadow-[0_18px_36px_-26px_rgba(80,45,40,.45)] disabled:opacity-55 disabled:hover:translate-y-0">
      <span className="flex min-w-0 flex-1 flex-col py-1 pl-1">
        {combo && <span className="mb-1 inline-flex w-fit items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--pk)_12%,white)] px-2 py-0.5 text-[0.6875rem] font-bold uppercase tracking-wide text-[var(--pk)]"><Sparkles className="h-3 w-3" />Combo{i.comboDiscountValue ? ` · save ${money(i.comboDiscountValue)}` : ""}</span>}
        <span className="font-semibold leading-snug">{i.name}</span>
        {i.description && <span className="mt-1 line-clamp-2 text-[0.8438rem] leading-snug text-[#5E5853]">{i.description}</span>}
        <span className="mt-auto flex items-center gap-2 pt-2 text-[0.9063rem] font-semibold"><Price i={i} /></span>
      </span>
      <span className="relative h-[104px] w-[104px] shrink-0 overflow-hidden rounded-[14px] bg-[#F4ECE6]">
        {i.image ? <img src={i.image} alt="" loading="lazy" className="h-full w-full object-cover" /> : <span className="grid h-full w-full place-items-center text-[#C9BDB3]"><ShoppingBag className="h-7 w-7" /></span>}
        {!i.soldOut && <span className="absolute bottom-1.5 right-1.5 grid h-8 w-8 place-items-center rounded-full bg-white text-[var(--pk)] shadow ring-1 ring-[#EDE3DB] transition group-hover:bg-[var(--pk)] group-hover:text-white"><Plus className="h-4 w-4" /></span>}
      </span>
    </button>
  );
}

/** Slim row for sections the app shows without photos. */
function ItemRow({ i, onOpen }: { i: MenuItem; onOpen: () => void }) {
  return (
    <li className="border-b border-[#EFE6DF]">
      <button type="button" disabled={!!i.soldOut} onClick={onOpen} data-track={`Order: ${i.name}`} className="group flex w-full items-center gap-3 py-3 text-left disabled:opacity-55">
        <span className="min-w-0 flex-1">
          <span className="block font-semibold leading-snug">{i.name}</span>
          {i.description && <span className="mt-0.5 block truncate text-[0.8125rem] text-[#5E5853]">{i.description}</span>}
        </span>
        <span className="shrink-0 text-[0.9063rem] font-semibold tabular-nums"><Price i={i} /></span>
        {!i.soldOut && <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[var(--pk)] ring-1 ring-[#EDE3DB] transition group-hover:bg-[var(--pk)] group-hover:text-white"><Plus className="h-4 w-4" /></span>}
      </button>
    </li>
  );
}

/** The app's banner carousel: one at a time on a phone, two or three across on a computer. */
function Banners({ banners, ratio, interval, onClick }: { banners: Banner[]; ratio: string; interval: number; onClick: (l: Banner["link"]) => void }) {
  const track = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const step = (dir: 1 | -1) => {
    const el = track.current; if (!el) return;
    const card = el.firstElementChild as HTMLElement | null;
    const w = (card?.offsetWidth ?? el.clientWidth) + 16;
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
    el.scrollTo({ left: dir === 1 && atEnd ? 0 : el.scrollLeft + dir * w, behavior: "smooth" });
  };
  useEffect(() => {
    if (paused || banners.length < 2 || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => { const el = track.current; if (el && el.scrollWidth > el.clientWidth + 4) step(1); }, Math.max(2, interval) * 1000);
    return () => clearInterval(t);
  }, [paused, banners.length, interval]);
  return (
    <div className="relative mt-6" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onTouchStart={() => setPaused(true)}>
      <div ref={track} className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto" aria-label="Specials">
        {banners.map((b) => {
          const linked = b.link.type !== "none";
          return (
            <button key={b.id} type="button" disabled={!linked} onClick={() => onClick(b.link)} data-track={`Order banner: ${b.title || b.id}`}
              className="relative w-[88%] shrink-0 snap-start overflow-hidden rounded-[22px] bg-[#F4ECE6] text-left ring-1 ring-[#EDE3DB] sm:w-[calc(50%-8px)] xl:w-[calc(33.333%-11px)]"
              style={{ aspectRatio: ratio, background: b.background ?? undefined, color: b.textColor }}>
              {b.image && <img src={b.image} alt={b.title || "Special"} loading="lazy" className={`absolute inset-0 h-full w-full ${b.fit === "contain" ? "object-contain" : "object-cover"}`} />}
              {(b.title || b.subtitle || b.cta) && (
                <span className={`absolute inset-x-0 bottom-0 block p-5 ${b.image ? "bg-gradient-to-t from-black/55 to-transparent" : ""}`}>
                  {b.title && <span className="shop-serif block text-[1.5rem] font-semibold leading-tight">{b.title}</span>}
                  {b.subtitle && <span className="mt-1 block text-[0.9063rem] opacity-90">{b.subtitle}</span>}
                  {b.cta && <span className="mt-3 inline-flex rounded-full bg-white px-4 py-1.5 text-[0.8438rem] font-semibold text-[#151312]">{b.cta}</span>}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {banners.length > 1 && (
        <>
          <button type="button" onClick={() => step(-1)} aria-label="Previous" className="absolute left-2 top-1/2 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/95 shadow ring-1 ring-[#EDE3DB] sm:grid"><ChevronLeft className="h-5 w-5" /></button>
          <button type="button" onClick={() => step(1)} aria-label="Next" className="absolute right-2 top-1/2 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/95 shadow ring-1 ring-[#EDE3DB] sm:grid"><ChevronRight className="h-5 w-5" /></button>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ cart */

function CartPanel({ lines, setQty, subtotal, surcharges, locationId, onCheckout }: { lines: CafeLine[]; setQty: (k: string, q: number) => void; subtotal: number; surcharges: Surcharges | null; locationId: string | null; onCheckout: () => void }) {
  const rows = surchargeRows(subtotal, surcharges, locationId);
  const groups = cartGroups(lines);
  const qtyCtl = (key: string, q: number) => (
    <div className="mt-2 flex items-center gap-2">
      <button type="button" aria-label="One less" onClick={() => setQty(key, q - 1)} className="grid h-8 w-8 place-items-center rounded-full ring-1 ring-[#E6DCD4] hover:bg-[#F4ECE6]">{q === 1 ? <Trash2 className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}</button>
      <span className="w-6 text-center text-[0.9375rem] font-semibold tabular-nums">{q}</span>
      <button type="button" aria-label="One more" onClick={() => setQty(key, q + 1)} className="grid h-8 w-8 place-items-center rounded-full ring-1 ring-[#E6DCD4] hover:bg-[#F4ECE6]"><Plus className="h-3.5 w-3.5" /></button>
    </div>
  );
  return (
    <div className="rounded-[24px] bg-white p-5 shadow-[0_30px_60px_-44px_rgba(80,45,40,.4)] ring-1 ring-[#EDE3DB]">
      <p className="shop-serif text-[1.5rem] font-semibold">Your order</p>
      {!lines.length ? (
        <div className="py-8 text-center text-[#8C847D]"><ShoppingBag className="mx-auto h-8 w-8" /><p className="mt-2 text-[0.9375rem]">Add something from the menu.</p></div>
      ) : (
        <>
          <ul className="mt-3 divide-y divide-[#F1E9E2]">
            {groups.map((g) => g.combo ? (
              <li key={g.key} className="flex gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-snug">{g.name} <span className="ml-1 rounded-full bg-[color-mix(in_srgb,var(--pk)_12%,white)] px-1.5 py-0.5 text-[0.6875rem] font-bold uppercase text-[var(--pk)]">Combo</span></p>
                  {g.lines.map((l) => <p key={l.key} className="mt-0.5 text-[0.8125rem] text-[#5E5853]">{l.name}{l.variationName ? ` · ${l.variationName}` : ""}{l.modifierNames.length ? ` — ${l.modifierNames.join(", ")}` : ""}</p>)}
                  {qtyCtl(g.lines[0].key, g.quantity)}
                </div>
                <p className="shrink-0 text-right font-semibold tabular-nums">{money(g.total)}{g.saving > 0 && <span className="block text-[0.75rem] font-medium text-emerald-700">saves {money(g.saving)}</span>}</p>
              </li>
            ) : (
              <li key={g.key} className="flex gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-snug">{g.lines[0].name}{g.lines[0].variationName ? <span className="font-normal text-[#5E5853]"> · {g.lines[0].variationName}</span> : null}</p>
                  {g.lines[0].modifierNames.length > 0 && <p className="mt-0.5 text-[0.8125rem] text-[#5E5853]">{g.lines[0].modifierNames.join(", ")}</p>}
                  {g.lines[0].note && <p className="mt-0.5 text-[0.8125rem] italic text-[#8C847D]">“{g.lines[0].note}”</p>}
                  {qtyCtl(g.key, g.quantity)}
                </div>
                <p className="shrink-0 font-semibold tabular-nums">{money(g.total)}</p>
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

/** Cart lines as the customer sees them: plain lines, and each combo as one entry. */
function cartGroups(lines: CafeLine[]) {
  const out: { key: string; combo: boolean; name: string; lines: CafeLine[]; quantity: number; total: number; saving: number }[] = [];
  const seen = new Set<string>();
  for (const l of lines) {
    if (!l.comboInstanceId) { out.push({ key: l.key, combo: false, name: l.name, lines: [l], quantity: l.quantity, total: l.unitPrice * l.quantity, saving: 0 }); continue; }
    if (seen.has(l.comboInstanceId)) continue;
    seen.add(l.comboInstanceId);
    const ls = lines.filter((x) => x.comboInstanceId === l.comboInstanceId);
    const saving = comboDiscounts(ls).reduce((s, d) => s + d.cents, 0);
    out.push({ key: l.comboInstanceId, combo: true, name: l.comboName ?? "Combo", lines: ls, quantity: l.quantity, total: ls.reduce((s, x) => s + x.unitPrice * x.quantity, 0) - saving, saving });
  }
  return out;
}

/* ------------------------------------------------------------------ item & combo panels */

/**
 * How many options sit on one line: as many as fit (by the longest name), then spread evenly over the lines
 * (7 options → 4 + 3, 5 → 3 + 2, never 4 + 1).
 */
function balanced(names: string[], phone: boolean) {
  const n = names.length;
  if (!n) return 1;
  const longest = Math.max(...names.map((x) => x.length));
  const fit = phone ? (longest <= 9 ? 3 : longest <= 18 ? 2 : 1) : (longest <= 11 ? 4 : longest <= 18 ? 3 : 2);
  const per = Math.min(fit, n);
  return Math.ceil(n / Math.ceil(n / per));
}

/** A row (or evenly split rows) of equal-width choices. */
function ChoiceGrid({ names, children }: { names: string[]; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 [grid-template-columns:repeat(var(--m),minmax(0,1fr))] sm:[grid-template-columns:repeat(var(--d),minmax(0,1fr))]"
      style={{ ["--m" as string]: balanced(names, true), ["--d" as string]: balanced(names, false) } as React.CSSProperties}>
      {children}
    </div>
  );
}

function Choice({ on, onClick, name, extra, disabled, image }: { on: boolean; onClick: () => void; name: string; extra?: string | null; disabled?: boolean; image?: string | null }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={on}
      className={`relative flex min-h-[52px] items-center justify-center gap-2.5 rounded-[14px] px-3 py-2 text-center ring-1 transition disabled:opacity-40 ${image ? "justify-start text-left" : ""} ${on ? "bg-[#151312] text-white ring-[#151312]" : "bg-white text-[#26211E] ring-[#E6DCD4] hover:ring-[#151312]"}`}>
      {image && <img src={image} alt="" className="h-10 w-10 shrink-0 rounded-[10px] object-cover" />}
      <span className="min-w-0">
        <span className="block text-[0.9063rem] font-medium leading-tight">{name}</span>
        {extra && <span className={`mt-0.5 block text-[0.75rem] ${on ? "text-white/75" : "text-[#8C847D]"}`}>{extra}</span>}
      </span>
      {on && <Check className="absolute right-1.5 top-1.5 h-3.5 w-3.5" />}
    </button>
  );
}

/** One question: the question on its own line, the choices underneath. */
function Question({ title, tag, bad, children }: { title: string; tag?: string; bad?: boolean; children: React.ReactNode }) {
  return (
    <fieldset className="border-t border-[#EFE6DF] pt-5 first:border-0 first:pt-0">
      <legend className="sr-only">{title}</legend>
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <p className="text-[0.9688rem] font-semibold leading-snug">{title}</p>
        {tag && <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[0.75rem] font-semibold ${bad ? "bg-[#FDECEA] text-[#B42318]" : tag === "Optional" ? "text-[#8C847D]" : "bg-[#F4ECE6] text-[#5E5853]"}`}>{tag}</span>}
      </div>
      <div className={bad ? "rounded-[16px] p-1.5 ring-1 ring-[#F3B4AE]" : ""}>{children}</div>
    </fieldset>
  );
}

function Groups({ groups, sel, setSel, tried }: { groups: MenuGroup[]; sel: Record<string, string[]>; setSel: (s: Record<string, string[]>) => void; tried: boolean }) {
  return (
    <>
      {groups.filter((g) => g.modifiers.length).map((g) => {
        const cur = sel[g.id] ?? [];
        const need = g.min ?? 0;
        const single = g.selectionType === "SINGLE" || g.max === 1;
        return (
          <Question key={g.id} title={g.name} bad={tried && cur.length < need}
            tag={need > 0 ? (single ? "Required" : `Choose at least ${need}`) : (g.max ?? -1) > 1 ? `Up to ${g.max}` : "Optional"}>
            <ChoiceGrid names={g.modifiers.map((m) => m.name)}>
              {g.modifiers.map((m) => (
                <Choice key={m.id} on={cur.includes(m.id)} onClick={() => setSel({ ...sel, [g.id]: toggleOption(g, cur, m.id) })} name={m.name} extra={m.price > 0 ? `+${money(m.price)}` : null} />
              ))}
            </ChoiceGrid>
          </Question>
        );
      })}
    </>
  );
}

function useSheetKeys(onClose: () => void) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc); document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", esc); document.body.style.overflow = ""; };
  }, [onClose]);
}

/**
 * Bottom sheet on a phone. On a computer, with a photo: the whole photo (never cropped, at most half the panel) with the
 * name and description under it on the left, and the choices on the right. Without a photo: one tidy column.
 */
function Sheet({ title, image, info, onClose, back, children, footer, heading }: { title: string; image: string | null; info?: React.ReactNode; onClose: () => void; back?: () => void; children: React.ReactNode; footer: React.ReactNode; heading?: string }) {
  useSheetKeys(onClose);
  const two = !!image;
  const close = <button type="button" onClick={onClose} aria-label="Close" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white shadow ring-1 ring-[#EDE3DB] hover:bg-[#F4ECE6]"><X className="h-5 w-5" /></button>;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center sm:p-6" onClick={onClose}>
      <div role="dialog" aria-modal aria-label={title} onClick={(e) => e.stopPropagation()}
        className={`relative flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-[28px] bg-[#FCFAF7] sm:rounded-[28px] ${two ? "sm:max-w-[680px] lg:h-[min(860px,90vh)] lg:max-w-[1180px]" : "sm:max-w-[680px]"}`}>
        <div className={`absolute right-4 top-4 z-10 ${two ? "lg:hidden" : ""}`}>{close}</div>
        <div className={`min-h-0 flex-1 overflow-y-auto ${two ? "lg:flex lg:overflow-hidden" : ""}`}>
          <div className={`px-5 pt-5 sm:px-7 sm:pt-7 ${two ? "lg:w-[46%] lg:shrink-0 lg:overflow-y-auto lg:border-r lg:border-[#EEE6DF] lg:pb-8" : ""}`}>
            {image && (
              <div className="grid place-items-center overflow-hidden rounded-[22px] bg-[#F4ECE6]">
                <img src={image} alt="" className="max-h-[30vh] w-auto max-w-full object-contain lg:max-h-[50vh]" />
              </div>
            )}
            {back && <button type="button" onClick={back} className="mt-4 inline-flex items-center gap-1 text-[0.875rem] font-semibold text-[#3A3431] hover:text-black"><ArrowLeft className="h-4 w-4" />Back</button>}
            <h3 className={`shop-serif text-[1.75rem] font-semibold leading-tight ${image || back ? "mt-4" : "pr-12"}`}>{title}</h3>
            {info && <div className="mt-2">{info}</div>}
          </div>
          <div className={two ? "lg:flex lg:min-h-0 lg:flex-1 lg:flex-col" : ""}>
            {two && <div className="hidden items-center justify-between gap-3 border-b border-[#EEE6DF] px-7 py-4 lg:flex"><p className="text-[0.8125rem] font-semibold uppercase tracking-[0.08em] text-[#8C847D]">{heading ?? "Your choices"}</p>{close}</div>}
            <div className={`space-y-5 px-5 pb-6 pt-5 sm:px-7 ${two ? "lg:flex-1 lg:overflow-y-auto lg:pt-6" : ""}`}>{children}</div>
            {two && <div className="hidden lg:block">{footer}</div>}
          </div>
        </div>
        <div className={two ? "lg:hidden" : ""}>{footer}</div>
      </div>
    </div>
  );
}

function AddBar({ qty, setQty, label, onAdd, disabled }: { qty: number; setQty: (n: number) => void; label: string; onAdd: () => void; disabled?: boolean }) {
  return (
    <div className="flex shrink-0 items-center gap-3 border-t border-[#EEE6DF] bg-white px-5 py-4 sm:px-7">
      <div className="flex items-center gap-2">
        <button type="button" aria-label="One less" onClick={() => setQty(Math.max(1, qty - 1))} className="grid h-10 w-10 place-items-center rounded-full ring-1 ring-[#E6DCD4]"><Minus className="h-4 w-4" /></button>
        <span className="w-6 text-center font-semibold tabular-nums">{qty}</span>
        <button type="button" aria-label="One more" onClick={() => setQty(Math.min(50, qty + 1))} className="grid h-10 w-10 place-items-center rounded-full ring-1 ring-[#E6DCD4]"><Plus className="h-4 w-4" /></button>
      </div>
      <button type="button" disabled={disabled} onClick={onAdd} className="shop-btn flex h-[52px] flex-1 items-center justify-center rounded-full bg-[var(--pk)] font-semibold text-white disabled:opacity-60">{label}</button>
    </div>
  );
}

function ItemSheet({ item: start, showImage, onClose, onAdd, kitchenNote }: { item: MenuItem; showImage: boolean; onClose: () => void; onAdd: (l: CafeLine) => void; kitchenNote: boolean }) {
  const [sub, setSub] = useState<MenuItem | null>(start.isGroup ? null : start);
  const item = sub ?? start;
  const firstVar = item.variations.find((v) => !v.soldOut) ?? item.variations[0];
  const [variationId, setVariationId] = useState(firstVar?.id ?? "");
  const [sel, setSel] = useState<Record<string, string[]>>(() => defaultSelection(item));
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  useEffect(() => { const v = item.variations.find((x) => !x.soldOut) ?? item.variations[0]; setVariationId(v?.id ?? ""); setSel(defaultSelection(item)); setTried(false); }, [item]);
  const line = sub ? buildLine({ ...item, category: start.category }, variationId, sel, qty, note) : null;
  const unmet = sub ? unmetGroups(item, sel) : [];
  const [more, setMore] = useState(false);
  const long = (item.description ?? "").length > 220;
  const info = (item.description || kitchenNote) ? (
    <>
      {item.description && <p className={`whitespace-pre-line text-[0.9375rem] leading-relaxed text-[#5E5853] ${long && !more ? "max-lg:line-clamp-4" : ""}`}>{item.description}</p>}
      {long && <button type="button" onClick={() => setMore(!more)} className="mt-1 text-[0.875rem] font-semibold text-[var(--pk)] lg:hidden">{more ? "Less" : "Read more"}</button>}
      {kitchenNote && <p className="mt-3 rounded-xl bg-[#F4ECE6] px-3 py-2 text-[0.8438rem] text-[#3A3431]">The kitchen has closed for today — choose a pick-up time when it&apos;s open at checkout.</p>}
    </>
  ) : null;

  return (
    <Sheet title={item.name} image={showImage ? item.image ?? start.image ?? null : null} info={info} onClose={onClose} back={sub && start.isGroup ? () => setSub(null) : undefined} heading={sub ? "Make it yours" : "Choose one"}
      footer={sub && line ? <AddBar qty={qty} setQty={setQty} label={unmet.length && tried ? `Choose ${unmet[0].name.toLowerCase()}` : `Add · ${money(line.unitPrice * line.quantity)}`} onAdd={() => { if (unmet.length) { setTried(true); return; } onAdd(line); }} /> : null}>
      {!sub && (
        <Question title="Choose one">
          <ChoiceGrid names={(start.subProducts ?? []).map((x) => x.name)}>
            {(start.subProducts ?? []).map((x) => <Choice key={x.id} on={false} disabled={x.soldOut} onClick={() => setSub(x)} name={x.name} extra={x.soldOut ? "Sold out" : money(fromPrice(x))} image={showImage ? x.image : null} />)}
          </ChoiceGrid>
        </Question>
      )}
      {sub && item.variations.length > 1 && (
        <Question title="Size" tag="Required">
          <ChoiceGrid names={item.variations.map((v) => v.name || "Regular")}>
            {item.variations.map((v) => <Choice key={v.id} on={variationId === v.id} disabled={v.soldOut} onClick={() => setVariationId(v.id)} name={v.name || "Regular"} extra={money(v.price ?? 0)} />)}
          </ChoiceGrid>
        </Question>
      )}
      {sub && <Groups groups={item.modifierGroups ?? []} sel={sel} setSel={setSel} tried={tried} />}
      {sub && (
        <fieldset className="border-t border-[#EFE6DF] pt-5 first:border-0 first:pt-0">
          <label className="block">
            <span className="text-[0.9688rem] font-semibold">Note for the kitchen <span className="font-normal text-[#8C847D]">(optional)</span></span>
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="e.g. extra hot, no onion" className={`${field} mt-2.5`} />
          </label>
        </fieldset>
      )}
    </Sheet>
  );
}

/** A combo: choose one option per step (with its own size and extras); the discount comes off once at checkout. */
function ComboSheet({ combo, showImage, onClose, onAdd }: { combo: MenuItem; showImage: boolean; onClose: () => void; onAdd: (l: CafeLine[]) => void }) {
  const groups = combo.comboGroups ?? [];
  type Pick = { option: ComboOption; variationId: string; selected: Record<string, string[]> };
  const pickOf = (o: ComboOption): Pick => ({ option: o, variationId: (o.variations.find((v) => !v.soldOut) ?? o.variations[0])?.id ?? "", selected: Object.fromEntries(Object.entries(o.defaults ?? {}).map(([k, v]) => [k, [...v]])) });
  const [picks, setPicks] = useState<Record<string, Pick>>(() => Object.fromEntries(groups.filter((g) => g.options.length === 1).map((g) => [g.id, pickOf(g.options[0])])));
  const [qty, setQty] = useState(1);
  const [tried, setTried] = useState(false);
  const subtotal = groups.reduce((s, g) => s + (picks[g.id] ? comboPickPrice(picks[g.id].option, picks[g.id].variationId, picks[g.id].selected) : 0), 0);
  const discount = Math.min(subtotal, combo.comboDiscountValue ?? 0);
  const missing = groups.filter((g) => !picks[g.id]);
  const unmet = groups.filter((g) => picks[g.id] && (picks[g.id].option.modifierGroups ?? []).some((mg) => (mg.min ?? 0) > 0 && (picks[g.id].selected[mg.id]?.length ?? 0) < (mg.min ?? 0)));
  const ready = !missing.length && !unmet.length;
  const add = () => {
    if (!ready) { setTried(true); return; }
    onAdd(comboLines(combo, groups.map((g) => ({ group: g, ...picks[g.id] })), qty, newInstance()));
  };
  const optPrice = (o: ComboOption) => Math.min(...o.variations.filter((v) => !v.soldOut).map((v) => v.price ?? 0)) + (o.lockedMods ?? []).reduce((s, m) => s + (m.price || 0), 0);
  const info = (
    <>
      {combo.description && <p className="whitespace-pre-line text-[0.9375rem] leading-relaxed text-[#5E5853]">{combo.description}</p>}
      {discount > 0 && <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[0.8438rem] font-semibold text-emerald-800 ring-1 ring-emerald-200"><Sparkles className="h-4 w-4" />You save {money(discount)} with this combo</p>}
      <ol className="mt-5 space-y-2">
        {groups.map((g, gi) => {
          const pk = picks[g.id];
          return (
            <li key={g.id} className="flex items-center gap-3 rounded-[14px] bg-white px-3 py-2.5 ring-1 ring-[#EDE3DB]">
              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[0.8125rem] font-bold ${pk ? "bg-[var(--pk)] text-white" : "bg-[#F4ECE6] text-[#5E5853]"}`}>{pk ? <Check className="h-4 w-4" /> : gi + 1}</span>
              <span className="min-w-0 flex-1"><span className="block text-[0.75rem] font-semibold uppercase tracking-[0.06em] text-[#8C847D]">{g.options.length === 1 ? "Included" : g.label}</span><span className="block truncate font-semibold">{pk ? pk.option.name : "Not chosen yet"}</span></span>
              {pk && <span className="shrink-0 text-[0.875rem] tabular-nums text-[#5E5853]">{money(comboPickPrice(pk.option, pk.variationId, pk.selected))}</span>}
            </li>
          );
        })}
      </ol>
    </>
  );
  return (
    <Sheet title={combo.name} image={showImage ? combo.image ?? null : null} info={info} onClose={onClose} heading="Build your combo"
      footer={<AddBar qty={qty} setQty={setQty} onAdd={add}
        label={!ready && tried ? (missing[0] ? `Choose: ${missing[0].label.toLowerCase()}` : `Finish: ${unmet[0].label.toLowerCase()}`) : missing.length ? `Choose ${missing.length} more` : `Add combo · ${money((subtotal - discount) * qty)}`} />}>
      {groups.map((g, gi) => {
        const pk = picks[g.id];
        const only = g.options.length === 1;
        return (
          <section key={g.id} className="border-t border-[#EFE6DF] pt-5 first:border-0 first:pt-0">
            <div className="mb-3 flex items-center gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#151312] text-[0.875rem] font-bold text-white">{gi + 1}</span>
              <p className="text-[1.0625rem] font-semibold leading-snug">{only ? g.options[0].name : g.label}</p>
              {!only && <span className={`ml-auto shrink-0 rounded-full px-2.5 py-0.5 text-[0.75rem] font-semibold ${tried && !pk ? "bg-[#FDECEA] text-[#B42318]" : "bg-[#F4ECE6] text-[#5E5853]"}`}>Choose 1</span>}
            </div>
            {!only && (
              <div className={tried && !pk ? "rounded-[16px] p-1.5 ring-1 ring-[#F3B4AE]" : ""}>
                <ChoiceGrid names={g.options.map((o) => o.name)}>
                  {g.options.map((o) => <Choice key={o.id} on={pk?.option.id === o.id} onClick={() => setPicks({ ...picks, [g.id]: pickOf(o) })} name={o.name} extra={money(optPrice(o))} image={showImage ? o.image : null} />)}
                </ChoiceGrid>
              </div>
            )}
            {pk && (pk.option.variations.length > 1 || (pk.option.modifierGroups ?? []).some((mg) => mg.modifiers.length) || (pk.option.lockedMods ?? []).length > 0) && (
              <div className={`space-y-5 ${only ? "" : "mt-5"} border-l-2 border-[color-mix(in_srgb,var(--pk)_30%,transparent)] pl-4 sm:pl-5`}>
                {(pk.option.lockedMods ?? []).length > 0 && <p className="text-[0.875rem] text-[#5E5853]">Included: {(pk.option.lockedMods ?? []).map((m) => m.name).join(", ")}</p>}
                {pk.option.variations.length > 1 && (
                  <Question title="Size" tag="Required">
                    <ChoiceGrid names={pk.option.variations.map((v) => v.name || "Regular")}>
                      {pk.option.variations.map((v) => <Choice key={v.id} on={pk.variationId === v.id} disabled={v.soldOut} onClick={() => setPicks({ ...picks, [g.id]: { ...pk, variationId: v.id } })} name={v.name || "Regular"} extra={money(v.price ?? 0)} />)}
                    </ChoiceGrid>
                  </Question>
                )}
                <Groups groups={pk.option.modifierGroups ?? []} sel={pk.selected} setSel={(sx) => setPicks({ ...picks, [g.id]: { ...pk, selected: sx } })} tried={tried} />
              </div>
            )}
          </section>
        );
      })}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ checkout */


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
      lines: p.lines.map((l) => ({ variationId: l.variationId, quantity: l.quantity, modifierIds: l.modifierIds, note: l.note || undefined, presetId: l.presetId, custom: l.custom, comboId: l.comboId, comboInstanceId: l.comboInstanceId, comboGroupId: l.comboGroupId })),
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
              {comboDiscounts(p.lines).map((d, i) => <div key={i} className="flex justify-between text-[0.875rem] text-emerald-700"><span>{d.name} saving</span><span className="tabular-nums">−{money(d.cents)}</span></div>)}
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
