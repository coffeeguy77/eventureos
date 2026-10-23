/**
 * Café pages (café, order online, reserve a table, roasting club, wholesale) — settings and pure helpers.
 * Settings live in organisations.settings.cafe. The live menu, opening hours, ordering, payments and table bookings
 * all come from the business's ordering app (settings.cafe.appUrl) — this site never stores orders itself.
 */

export type TierUnit = "month" | "year" | "hour" | "session" | "kg" | "once";
export const TIER_UNITS: Record<TierUnit, string> = { month: "per month", year: "per year", hour: "per hour", session: "per session", kg: "per kg", once: "one-off" };

export interface ClubTier { id: string; name: string; tagline: string; price: number | null; unit: TierUnit; features: string[]; featured: boolean; show: boolean }
export interface Equipment { id: string; group: string; name: string; detail: string }
export interface InfoCard { title: string; text: string }
export interface Faq { q: string; a: string }

export interface CafeSettings {
  enabled: boolean;
  /** The ordering app, e.g. https://app.example.com.au — menu, hours, orders, payments and bookings run through it */
  appUrl: string;
  /** Take orders on this website (paid through the app's Square account). Off → the order button opens the app. */
  ordering: boolean;
  /** Table bookings on this website (sent to the app's bookings). Off → the booking button opens the app. */
  reservations: boolean;
  club: boolean;
  wholesale: boolean;
  /** Café home */
  heroTitle: string; heroText: string; heroImage: string | null;
  coffeeTitle: string; coffeeText: string; coffeeImage: string | null;
  kitchenTitle: string; kitchenText: string; kitchenImage: string | null;
  /** Instagram handle without the @ (the feed shows once Instagram is connected in the office) */
  instagram: string;
  /** Or: a ready-made Instagram feed to show (e.g. the one LeadPages keeps for this business) — https link returning { media: [...] } */
  igFeedUrl: string;
  /** Up to 8 menu items chosen for "From the menu" on the café page (app item ids); none chosen = the first items with photos */
  featured: string[];
  /** Roasting Club page */
  clubTitle: string; clubIntro: string; clubImage: string | null;
  clubTiers: ClubTier[];
  equipment: Equipment[];
  clubPerks: InfoCard[];
  software: InfoCard[];
  clubFaq: Faq[];
  /** Wholesale page */
  wholesaleTitle: string; wholesaleIntro: string; wholesaleImage: string | null;
  wholesalePoints: InfoCard[];
  wholesaleFaq: Faq[];
}

export const DEFAULT_CAFE: CafeSettings = {
  enabled: false, appUrl: "", ordering: false, reservations: false, club: false, wholesale: false,
  heroTitle: "Our roastery café",
  heroText: "Coffee roasted metres from the counter, a kitchen cooking from scratch, and a table waiting for you.",
  heroImage: null,
  coffeeTitle: "Try our coffee where it's roasted",
  coffeeText: "Every coffee on the menu is roasted here. Come in for an espresso, try a filter of this week's single origin, and take home a bag of whatever you liked.",
  coffeeImage: null,
  kitchenTitle: "From our kitchen",
  kitchenText: "Breakfast and lunch made in our own kitchen — order ahead for pick-up, or grab a table.",
  kitchenImage: null,
  instagram: "", igFeedUrl: "", featured: [],
  clubTitle: "The Roasting Club",
  clubIntro: "A members' roastery: use our commercial roasters, sample roasters, packing and label printing to roast and sell your own coffee — with people around who'll help.",
  clubImage: null,
  clubTiers: [],
  equipment: [],
  clubPerks: [],
  software: [],
  clubFaq: [],
  wholesaleTitle: "Wholesale coffee",
  wholesaleIntro: "Fresh roasted coffee for cafés, offices and restaurants, with training and support from the people who roast it.",
  wholesaleImage: null,
  wholesalePoints: [],
  wholesaleFaq: [],
};

const str = (v: unknown, n: number, d = "") => (typeof v === "string" ? v.trim().slice(0, n) : d);
const img = (v: unknown) => { const s = str(v, 600); return /^(https:\/\/|\/media\/)/.test(s) ? s : null; };
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
const arr = (v: unknown) => (Array.isArray(v) ? v : []);
const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

/** A web address for the ordering app: https only, no trailing slash, no path tricks. */
export function cleanAppUrl(v: unknown): string {
  const s = str(v, 200);
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    if (u.protocol !== "https:" || !u.hostname.includes(".") || u.username || u.password) return "";
    return `https://${u.host}`;
  } catch { return ""; }
}

export function cleanHandle(v: unknown) {
  return str(v, 120).replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/^@/, "").replace(/[/?#].*$/, "").replace(/[^A-Za-z0-9._]/g, "").slice(0, 30);
}

function price(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

const id = (v: unknown, i: number, p: string) => (str(v, 40).replace(/[^a-z0-9-]/gi, "") || `${p}${i + 1}`);
const cards = (v: unknown, n = 12): InfoCard[] => arr(v).slice(0, n).map((x) => ({ title: str(obj(x).title, 80), text: str(obj(x).text, 600) })).filter((c) => c.title || c.text);
const faqs = (v: unknown): Faq[] => arr(v).slice(0, 20).map((x) => ({ q: str(obj(x).q, 200), a: str(obj(x).a, 1200) })).filter((f) => f.q && f.a);

export function readCafe(orgSettings: unknown): CafeSettings {
  const raw = obj(obj(orgSettings).cafe);
  const d = DEFAULT_CAFE;
  const t = (k: keyof CafeSettings, n: number) => str(raw[k], n) || (d[k] as string);
  return {
    enabled: bool(raw.enabled, d.enabled),
    appUrl: cleanAppUrl(raw.appUrl),
    ordering: bool(raw.ordering, d.ordering),
    reservations: bool(raw.reservations, d.reservations),
    club: bool(raw.club, d.club),
    wholesale: bool(raw.wholesale, d.wholesale),
    heroTitle: t("heroTitle", 90), heroText: t("heroText", 400), heroImage: img(raw.heroImage),
    coffeeTitle: t("coffeeTitle", 90), coffeeText: t("coffeeText", 600), coffeeImage: img(raw.coffeeImage),
    kitchenTitle: t("kitchenTitle", 90), kitchenText: t("kitchenText", 600), kitchenImage: img(raw.kitchenImage),
    instagram: cleanHandle(raw.instagram),
    igFeedUrl: /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}\/[^\s"'<>]{0,300}$/i.test(str(raw.igFeedUrl, 400)) ? str(raw.igFeedUrl, 400) : "",
    featured: [...new Set(arr(raw.featured).map((x) => str(x, 120)).filter((x) => /^[A-Za-z0-9:_#-]{1,120}$/.test(x)))].slice(0, 8),
    clubTitle: t("clubTitle", 90), clubIntro: t("clubIntro", 600), clubImage: img(raw.clubImage),
    clubTiers: arr(raw.clubTiers).slice(0, 6).map((x, i) => {
      const o = obj(x);
      const unit = (Object.keys(TIER_UNITS) as TierUnit[]).includes(o.unit as TierUnit) ? (o.unit as TierUnit) : "month";
      return {
        id: id(o.id, i, "tier"), name: str(o.name, 60), tagline: str(o.tagline, 160), price: price(o.price), unit,
        features: arr(o.features).map((f) => str(f, 140)).filter(Boolean).slice(0, 12), featured: bool(o.featured, false), show: bool(o.show, true),
      };
    }).filter((x) => x.name),
    equipment: arr(raw.equipment).slice(0, 40).map((x, i) => { const o = obj(x); return { id: id(o.id, i, "eq"), group: str(o.group, 40) || "Equipment", name: str(o.name, 90), detail: str(o.detail, 400) }; }).filter((e) => e.name),
    clubPerks: cards(raw.clubPerks),
    software: cards(raw.software, 8),
    clubFaq: faqs(raw.clubFaq),
    wholesaleTitle: t("wholesaleTitle", 90), wholesaleIntro: t("wholesaleIntro", 600), wholesaleImage: img(raw.wholesaleImage),
    wholesalePoints: cards(raw.wholesalePoints),
    wholesaleFaq: faqs(raw.wholesaleFaq),
  };
}

/** Which café pages are live. Ordering / booking pages need the app address too. */
export function cafePages(c: CafeSettings) {
  const app = !!c.appUrl;
  return {
    home: c.enabled,
    order: c.enabled && app && c.ordering,
    reserve: c.enabled && app && c.reservations,
    club: c.enabled && c.club,
    wholesale: c.enabled && c.wholesale,
    /** The app can still take orders / bookings even when this website doesn't */
    appOrder: c.enabled && app,
  };
}

export const tierPrice = (t: ClubTier) => (t.price === null ? null : `$${t.price % 1 === 0 ? t.price.toFixed(0) : t.price.toFixed(2)}`);

// ------------------------------------------------------------------------------------------------
// Money, hours and the cart — shared by the order page (browser) and the server
// ------------------------------------------------------------------------------------------------

export const money = (cents: number) => `$${(Math.round(cents) / 100).toFixed(2)}`;

/** The app's opening-hours shape: weekly[MON..SUN] = [{ start: "07:00", end: "14:00", startMin, endMin }] */
export interface Period { start?: string; end?: string; startMin?: number | null; endMin?: number | null }
export type Weekly = Partial<Record<"SUN" | "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT", Period[]>>;
export interface Closure { date?: string; from?: string; to?: string; annual?: boolean }
export const DAY_KEYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;

const toMin = (p: Period, k: "start" | "end") => {
  const m = k === "start" ? p.startMin : p.endMin;
  if (typeof m === "number") return m;
  const s = p[k];
  if (!s || !/^\d{1,2}:\d{2}/.test(s)) return null;
  const [h, mm] = s.split(":").map(Number);
  return h * 60 + mm;
};

export function fmtMin(min: number) {
  const h = Math.floor(min / 60) % 24, m = min % 60;
  const ap = h >= 12 ? "pm" : "am";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hh}:${String(m).padStart(2, "0")}${ap}` : `${hh}${ap}`;
}

export function periodsFor(weekly: Weekly | null | undefined, dow: number) {
  return ((weekly ?? {})[DAY_KEYS[dow]] ?? []).map((p) => ({ s: toMin(p, "start"), e: toMin(p, "end") })).filter((p): p is { s: number; e: number } => p.s !== null && p.e !== null);
}

/** Opening hours, Monday first, for display. */
export function hoursRows(weekly: Weekly | null | undefined) {
  const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return [1, 2, 3, 4, 5, 6, 0].map((dow) => {
    const p = periodsFor(weekly, dow);
    return { dow, day: names[dow], text: p.length ? p.map((x) => `${fmtMin(x.s)} – ${fmtMin(x.e)}`).join(", ") : "Closed", closed: !p.length };
  });
}

export function closureHit(c: Closure, ds: string) {
  const md = ds.slice(5);
  if (c.from && c.to) {
    if (c.annual) { const f = c.from.slice(5), t = c.to.slice(5); return f <= t ? md >= f && md <= t : md >= f || md <= t; }
    return ds >= c.from && ds <= c.to;
  }
  if (c.date) return c.date === ds || (!!c.annual && c.date.slice(5) === md);
  return false;
}

/** Today's date and the minutes past midnight in a time zone. */
export function nowIn(tz: string, at = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

export function addDays(ds: string, n: number) {
  const d = new Date(`${ds}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
export const dowOf = (ds: string) => new Date(`${ds}T00:00:00Z`).getUTCDay();

/** 15-minute slots inside a day's opening hours (today: from `leadMin` minutes from now). */
export function slotsFor(ds: string, weekly: Weekly | null | undefined, closures: Closure[], now: { date: string; minutes: number }, leadMin = 15, lastBeforeCloseMin = 15) {
  if (closures.some((c) => closureHit(c, ds)) || ds < now.date) return [];
  const out: { value: string; label: string }[] = [];
  for (const p of periodsFor(weekly, dowOf(ds))) {
    const end = p.e <= p.s ? p.e + 1440 : p.e;
    for (let m = Math.ceil(p.s / 15) * 15; m <= end - lastBeforeCloseMin; m += 15) {
      if (ds === now.date && m < now.minutes + leadMin) continue;
      if (m >= 1440) break;
      out.push({ value: `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`, label: fmtMin(m) });
    }
  }
  return out;
}

/** The next `days` dates that have at least one slot. */
export function openDates(weekly: Weekly | null | undefined, closures: Closure[], now: { date: string; minutes: number }, days = 14, leadMin = 15, lastBeforeCloseMin = 15) {
  const out: string[] = [];
  for (let i = 0; i <= days; i++) {
    const ds = addDays(now.date, i);
    if (slotsFor(ds, weekly, closures, now, leadMin, lastBeforeCloseMin).length) out.push(ds);
  }
  return out;
}

/** A wall-clock date + time in a time zone → an ISO timestamp. */
export function zonedIso(ds: string, hhmm: string, tz: string) {
  const [y, m, d] = ds.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(guess)).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute));
  return new Date(guess - (asUtc - guess)).toISOString();
}

export function dateLabel(ds: string, today: string) {
  if (ds === today) return "Today";
  if (ds === addDays(today, 1)) return "Tomorrow";
  return new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${ds}T00:00:00Z`));
}

/** The menu as the app serves it (only the fields this site uses). Prices are in cents. */
export interface MenuModifier { id: string; name: string; price: number }
export interface MenuGroup { id: string; name: string; selectionType?: string; min?: number; max?: number; modifiers: MenuModifier[] }
export interface MenuVariation { id: string; name: string; price: number | null; soldOut?: boolean }
export interface MenuItem {
  id: string; name: string; description?: string; image?: string | null; soldOut?: boolean; category?: string | null;
  variations: MenuVariation[]; modifierGroups?: MenuGroup[]; lockedModifierIds?: string[]; lockedModifierNames?: string[];
  defaults?: Record<string, string[]>; isPreset?: boolean; custom?: boolean; isGroup?: boolean; subProducts?: MenuItem[]; fromPrice?: number; isCombo?: boolean;
  /** Combo builder (the app's "combos"): pick one option per group; the app takes the discount off at checkout */
  comboId?: string; comboGroups?: ComboGroup[]; comboDiscountValue?: number;
}
export interface ComboOption { id: string; name: string; image?: string | null; variations: MenuVariation[]; modifierGroups?: MenuGroup[]; lockedMods?: MenuModifier[]; defaults?: Record<string, string[]> }
export interface ComboGroup { id: string; label: string; options: ComboOption[] }
/** A banner at the top of a menu section (set in the app's Menu Builder) */
export interface SectionBanner { title: string; image: string | null; itemId: string | null; hideText: boolean }
export interface MenuSection {
  category: string; items: MenuItem[];
  /** The app's "show images" switch for this section — off means a slim list with no photos */
  showImages?: boolean;
  banner?: SectionBanner | null;
}

export const isCombo = (it: MenuItem) => !!it.isCombo || it.variations?.some((v) => /^combo-price-/.test(v.id));
const httpsImg = (v: unknown) => (typeof v === "string" && /^https:\/\/[^\s"'<>()]+$/.test(v) && v.length < 800 ? v : null);

/** Keep what can be ordered from a web page: combos with every group filled, items with a price, no POS-only sections. */
export function webMenu(raw: unknown): MenuSection[] {
  const cats = arr(obj(raw).categories) as (MenuSection & { posOnly?: boolean; eventOnly?: boolean })[];
  const comboOk = (it: MenuItem) => !!it.comboId && arr(it.comboGroups).length > 0 && arr(it.comboGroups).every((g) => arr((g as ComboGroup).options).length > 0);
  const ok = (it: MenuItem): boolean => !!it && typeof it.name === "string"
    && (isCombo(it) ? comboOk(it) : it.isGroup ? arr(it.subProducts).some((s) => ok(s as MenuItem)) : arr(it.variations).some((v) => typeof (v as MenuVariation).price === "number"));
  const seen = new Set<string>();
  return cats.filter((c) => !c.posOnly && !c.eventOnly).map((c) => {
    const b = obj(c.banner);
    const banner = c.banner && (httpsImg(b.image) || str(b.title, 120)) ? { title: str(b.title, 120), image: httpsImg(b.image), itemId: str(b.itemId, 120) || null, hideText: b.hideText === true } : null;
    return { category: str(c.category, 80) || "Menu", items: arr(c.items).filter((i) => ok(i as MenuItem)) as MenuItem[], showImages: c.showImages !== false, banner };
  }).filter((c) => c.items.length && !seen.has(c.category.toLowerCase()) && !!seen.add(c.category.toLowerCase()));
}

/** A slide in the app's banner carousel (its "hero"), as the website shows it. */
export interface Banner { id: string; image: string | null; title: string; subtitle: string; cta: string; textColor: string; background: string | null; fit: "cover" | "contain"; link: { type: "item" | "category" | "url" | "none"; value: string } }

/** The app's banners that are on now and shown at this store (links the website can't follow become plain banners). */
export function webBanners(rawHero: unknown, smartSlides: unknown, locationId: string | null): Banner[] {
  const here = (x: Record<string, unknown>) => !Array.isArray(x.locations) || x.locations.length === 0 || (!!locationId && (x.locations as unknown[]).includes(locationId));
  const color = (v: unknown) => (typeof v === "string" && /^#[0-9a-f]{3,8}$/i.test(v) ? v : "#ffffff");
  // Only plain colours and simple gradients as a background (never arbitrary CSS)
  const bgOk = (v: unknown) => (typeof v === "string" && /^(#[0-9a-f]{3,8}|(linear|radial)-gradient\([#\w\s,.%-]+(\([\d\s,.%]+\)[#\w\s,.%-]*)*\))$/i.test(v.trim()) ? v.trim() : null);
  const out: Banner[] = [];
  for (const x of [...arr(smartSlides), ...arr(rawHero)].map(obj)) {
    if (x.enabled === false || !here(x)) continue;
    const bgImg = typeof x.bg === "string" ? (x.bg.match(/url\((['"]?)(.*?)\1\)/) ?? [])[2] : undefined;
    const image = httpsImg(x.image) ?? httpsImg(bgImg);
    const l = obj(x.link);
    const t = String(l.type ?? "");
    const link = t === "item" || t === "category" ? { type: t, value: str(l.value, 120) } as const
      : t === "url" && str(l.value, 400) ? { type: "url" as const, value: /^https?:\/\//i.test(str(l.value, 400)) ? str(l.value, 400) : `https://${str(l.value, 400)}` }
      : { type: "none" as const, value: "" };
    const b: Banner = { id: str(x.id, 60) || `b${out.length}`, image, title: str(x.title, 140), subtitle: str(x.subtitle, 240), cta: str(x.cta, 40), textColor: color(x.textColor),
      background: image ? null : bgOk(x.bg), fit: typeof x.bg === "string" && /contain/.test(x.bg) ? "contain" : "cover", link };
    if (b.image || b.title || b.background) out.push(b);
  }
  return out.slice(0, 12);
}

export function fromPrice(it: MenuItem): number {
  if (it.isGroup) return Math.min(...(it.subProducts ?? []).map(fromPrice));
  const p = it.variations.filter((v) => typeof v.price === "number" && !v.soldOut).map((v) => v.price as number);
  return p.length ? Math.min(...p) : Math.min(...it.variations.map((v) => v.price ?? 0));
}

/** One line in the website cart — the same shape the app's checkout sends. */
export interface CafeLine {
  key: string; itemId: string; name: string; image: string | null; category: string | null;
  variationId: string; variationName: string; modifierIds: string[]; modifierNames: string[];
  unitPrice: number; quantity: number; note: string; presetId?: string; custom?: boolean;
  /** Part of a combo: every line of one combo shares the instance id; the discount comes off once per combo */
  comboId?: string; comboInstanceId?: string; comboGroupId?: string; comboName?: string; comboDiscount?: number;
}

/** Required groups not satisfied by a selection. */
export function unmetGroups(item: MenuItem, selected: Record<string, string[]>) {
  return (item.modifierGroups ?? []).filter((g) => (g.min ?? 0) > 0 && (selected[g.id]?.length ?? 0) < (g.min ?? 0));
}

/** Toggle an option the way the app does: single-choice groups move the tick; multi groups respect their max. */
export function toggleOption(g: MenuGroup, cur: string[], modId: string) {
  if (g.selectionType === "SINGLE" || g.max === 1) return cur.includes(modId) ? [] : [modId];
  if (cur.includes(modId)) return cur.filter((x) => x !== modId);
  if ((g.max ?? -1) > 0 && cur.length >= (g.max as number)) return cur;
  return [...cur, modId];
}

export function buildLine(item: MenuItem, variationId: string, selected: Record<string, string[]>, quantity: number, note: string): CafeLine {
  const variation = item.variations.find((v) => v.id === variationId) ?? item.variations[0];
  const ids: string[] = [], names: string[] = [];
  let unit = variation?.price ?? 0;
  for (const g of item.modifierGroups ?? []) {
    const on = new Set(selected[g.id] ?? []);
    for (const m of g.modifiers) if (on.has(m.id)) { ids.push(m.id); names.push(m.name); unit += m.price || 0; }
  }
  const allIds = [...ids, ...(item.lockedModifierIds ?? [])];
  const allNames = [...names, ...(item.lockedModifierNames ?? [])];
  const n = note.trim().slice(0, 200);
  return {
    key: [item.id, variation?.id, [...allIds].sort().join(","), n].join("|"),
    itemId: item.id, name: item.name, image: item.image ?? null, category: item.category ?? null,
    variationId: variation?.id ?? "", variationName: item.variations.length > 1 ? variation?.name ?? "" : "",
    modifierIds: allIds, modifierNames: allNames, unitPrice: unit, quantity: Math.max(1, Math.min(50, Math.round(quantity) || 1)), note: n,
    presetId: item.isPreset ? item.id : undefined, custom: item.custom ? true : undefined,
  };
}

export function defaultSelection(item: MenuItem): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(item.defaults ?? {})) if (Array.isArray(v)) out[k] = v.filter((x) => typeof x === "string");
  return out;
}

/** Combo discounts in the cart (shown before paying — the app re-checks and applies them). */
export function comboDiscounts(lines: CafeLine[]) {
  const seen = new Map<string, { name: string; cents: number }>();
  for (const l of lines) if (l.comboInstanceId && !seen.has(l.comboInstanceId)) seen.set(l.comboInstanceId, { name: l.comboName ?? "Combo", cents: Math.max(0, l.comboDiscount ?? 0) * l.quantity });
  return [...seen.values()].filter((d) => d.cents > 0);
}
export const cartSubtotal = (lines: CafeLine[]) => lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0) - comboDiscounts(lines).reduce((s, d) => s + d.cents, 0);

/** The cart lines for one combo: one line per group, all sharing an instance id. */
export function comboLines(combo: MenuItem, picks: { group: ComboGroup; option: ComboOption; variationId: string; selected: Record<string, string[]> }[], quantity: number, instanceId: string): CafeLine[] {
  const subtotal = picks.reduce((s, p) => s + comboPickPrice(p.option, p.variationId, p.selected), 0);
  const discount = Math.min(subtotal, Math.max(0, combo.comboDiscountValue ?? 0));
  const q = Math.max(1, Math.min(50, Math.round(quantity) || 1));
  return picks.map((p) => {
    const v = p.option.variations.find((x) => x.id === p.variationId) ?? p.option.variations[0];
    const ids = (p.option.lockedMods ?? []).map((m) => m.id), names = (p.option.lockedMods ?? []).map((m) => m.name);
    for (const g of p.option.modifierGroups ?? []) for (const m of g.modifiers) if ((p.selected[g.id] ?? []).includes(m.id)) { ids.push(m.id); names.push(m.name); }
    return {
      key: [instanceId, p.option.id, v?.id, [...ids].sort().join(",")].join("|"), itemId: p.option.id, name: p.option.name, image: p.option.image ?? null, category: combo.name,
      variationId: v?.id ?? "", variationName: p.option.variations.length > 1 ? v?.name ?? "" : "", modifierIds: ids, modifierNames: names,
      unitPrice: comboPickPrice(p.option, p.variationId, p.selected), quantity: q, note: `Part of: ${combo.name}`,
      comboId: combo.comboId, comboInstanceId: instanceId, comboGroupId: p.group.id, comboName: combo.name, comboDiscount: discount,
    };
  });
}
export function comboPickPrice(o: ComboOption, variationId: string, selected: Record<string, string[]>) {
  const v = o.variations.find((x) => x.id === variationId) ?? o.variations[0];
  let p = (v?.price ?? 0) + (o.lockedMods ?? []).reduce((s, m) => s + (m.price || 0), 0);
  for (const g of o.modifierGroups ?? []) for (const m of g.modifiers) if ((selected[g.id] ?? []).includes(m.id)) p += m.price || 0;
  return p;
}

/** The app's surcharge settings (percentages), as /api/config returns them. */
export interface Surcharges { holiday?: { activeToday?: boolean; percent?: number; label?: string; locations?: string[] }; weekend?: { activeToday?: boolean; percent?: number; label?: string; locations?: string[] }; card?: { enabled?: boolean; percent?: number; label?: string; locations?: string[] } }

/** Estimated surcharges shown before paying (the app/Square work out the real total; we always charge that). */
export function surchargeRows(subtotal: number, sc: Surcharges | null | undefined, locationId: string | null) {
  const here = (c?: { locations?: string[] }) => !c?.locations?.length || (!!locationId && c.locations.includes(locationId));
  const rows: { label: string; cents: number }[] = [];
  if (subtotal <= 0 || !sc) return rows;
  let base = subtotal;
  if (sc.holiday?.activeToday && here(sc.holiday) && (sc.holiday.percent ?? 0) > 0) {
    const c = Math.round(subtotal * (sc.holiday.percent as number) / 100); rows.push({ label: `${sc.holiday.label || "Public holiday surcharge"} (${sc.holiday.percent}%)`, cents: c }); base += c;
  } else if (sc.weekend?.activeToday && here(sc.weekend) && (sc.weekend.percent ?? 0) > 0) {
    const c = Math.round(subtotal * (sc.weekend.percent as number) / 100); rows.push({ label: `${sc.weekend.label || "Weekend surcharge"} (${sc.weekend.percent}%)`, cents: c }); base += c;
  }
  if (sc.card?.enabled && here(sc.card) && (sc.card.percent ?? 0) > 0) rows.push({ label: `${sc.card.label || "Card surcharge"} (${sc.card.percent}%)`, cents: Math.round(base * (sc.card.percent as number) / 100) });
  return rows;
}
