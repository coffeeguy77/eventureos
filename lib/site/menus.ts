/**
 * The website's menus — the top menu (computer + phone) and the footer — built automatically from what the business has
 * switched on, then arranged by the owner in Website → Menus: order, names, show/hide, phone/computer, and their own links.
 *
 * Saved at settings.site.menus = { top: SavedNode[], footer: SavedNode[] }. Only the owner's changes are stored, keyed by
 * each item's id, so a newly switched-on section still appears (at the end of its list) and a switched-off one disappears.
 */
import type { PublicOrg } from "@/lib/bookings/server";
import { readSiteNav, lessonLinks } from "@/lib/site-nav";
import { readJobSettings } from "@/lib/jobs/core";
import { readShop } from "@/lib/shop/core";
import { readEvents } from "@/lib/events/core";
import { cafePages, readCafe } from "@/lib/cafe/core";
import { readLearnSettings } from "@/lib/learn/core";
import type { FooterModel } from "@/lib/site/footer";
import { readHireSettings } from "@/lib/hire/core";
import { readSite } from "@/lib/site/site";

export const MENU_ICONS = ["events", "lessons", "academy", "jobs", "shop", "coffee", "cafe", "order", "table", "club", "roast", "wholesale", "gifts", "franchise", "info", "link"] as const;
export type MenuIcon = (typeof MENU_ICONS)[number];

export interface MenuNode { id: string; label: string; href: string; note?: string; icon?: MenuIcon; external?: boolean; children?: MenuNode[] }
export interface MenuItem {
  id: string; label: string; href: string; note: string; icon: MenuIcon; external: boolean;
  hidden: boolean; desktop: boolean; mobile: boolean; custom: boolean;
  /** what the system would show (for "back to original" in the editor) */
  auto: { label: string; note: string } | null;
  children: MenuItem[];
}
export interface SavedNode {
  id: string; label?: string; note?: string; href?: string; icon?: MenuIcon;
  hidden?: boolean; desktop?: boolean; mobile?: boolean; custom?: boolean; children?: SavedNode[];
}
export interface SavedMenus { top?: SavedNode[]; footer?: SavedNode[] }

const ID = /^[a-z0-9:._/-]{1,120}$/;
const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

/** A link a person typed or picked: a page on this site, https, email or phone. */
export function okHref(v: string) {
  return /^\/[\w\-./#?=&%]{0,300}$/.test(v) || /^https:\/\/[^\s"'<>]{4,400}$/.test(v) || /^mailto:[^\s"'<>]{3,200}$/.test(v) || /^tel:[\d+ ()-]{3,30}$/.test(v);
}

/** Clean address ("/franchise-canberra", "/hire/quote") → the EventureOS address, which works on every domain. */
export function internalHref(slug: string, clean: string) {
  if (!clean.startsWith("/")) return clean;
  const [path, hash = ""] = clean.split("#");
  const tail = hash ? `#${hash}` : "";
  if (path === "/" || path === "") return `/site/${slug}${tail}`;
  if (path === "/classes") return `/${slug}${tail}`;
  const [, first, ...rest] = path.split("/");
  if (first === slug || rest[0] === slug) return clean; // already an EventureOS address
  if (["hire", "shop", "cafe", "jobs", "academy", "book", "site"].includes(first)) return `/${first}/${slug}${rest.length ? "/" + rest.join("/") : ""}${tail}`;
  return `/site/${slug}/${first}${tail}`;
}

/** A stable id for an automatic link, from its address (business name taken out). */
export function idFromHref(href: string, slug: string) {
  if (/^https?:\/\//.test(href)) return `ext:${href.replace(/^https?:\/\/(www\.)?/, "").replace(/[^a-z0-9.]+/gi, "-").toLowerCase().slice(0, 60)}`;
  const [path, hash] = href.split("#");
  const p = path.split("/").filter(Boolean).filter((x) => x !== slug).join("/").toLowerCase() || "home";
  return (hash ? `${p}#${hash}` : p).replace(/[^a-z0-9:._/#-]+/g, "-").slice(0, 120).replace("#", ".");
}

function withIds(nodes: MenuNode[], slug: string): MenuNode[] {
  return nodes.map((n) => {
    const seen = new Set<string>();
    const children = n.children?.map((c) => {
      let id = c.id || idFromHref(c.href, slug);
      while (seen.has(id)) id += "-2";
      seen.add(id);
      return { ...c, id };
    });
    return { ...n, children };
  });
}

// ------------------------------------------------------------------------------------------------ automatic menus

/** The top menu as the system builds it (same rules the menu always used). */
export function topMenuAuto(org: PublicOrg): MenuNode[] {
  const s = org.rawSettings;
  const base = org.slug;
  const labels = readSiteNav(s);
  const learn = readLearnSettings(s);
  const jobs = readJobSettings(s, org.name).enabled;
  const shop = readShop(s).enabled;
  const classes = !!org.settings.enabled;
  const cafe = readCafe(s);
  const cp = cafePages(cafe);
  const out: MenuNode[] = [];
  if (readEvents(s).enabled) out.push({ id: "events", label: labels.events, href: `/hire/${base}`, note: "Coffee carts, vans & catering", icon: "events" });
  const lessonKids: MenuNode[] = [
    ...(classes ? [{ id: "", label: "Hands-on classes", href: `/${base}`, note: "Courses & upcoming dates", icon: "lessons" as const }] : []),
    ...(learn.enabled ? [{ id: "", label: learn.name, href: `/academy/${base}`, note: "Learn online, at your own pace", icon: "academy" as const }] : []),
    ...(classes ? lessonLinks(s, base).map((l) => ({ id: "", ...l, icon: "roast" as const })) : []),
    ...(jobs ? [{ id: "", label: labels.jobs, href: `/jobs/${base}`, note: "Find barista work or staff", icon: "jobs" as const }] : []),
  ];
  if (classes || learn.enabled) out.push({ id: "lessons", label: labels.lessons, href: classes ? `/${base}` : `/academy/${base}`, note: "Courses & upcoming dates", icon: "lessons", children: lessonKids });
  // The job board sits under Barista lessons; it gets its own item only when there are no lessons to sit under
  else if (jobs) out.push({ id: "jobs", label: labels.jobs, href: `/jobs/${base}`, note: "Find barista work or staff", icon: "jobs" });
  if (shop) out.push({ id: "shop", label: labels.shop, href: `/shop/${base}`, note: "Freshly roasted coffee", icon: "shop" });
  if (cp.home) out.push({ id: "cafe", label: labels.cafe, href: `/cafe/${base}`, note: "Order, book a table & more", icon: "cafe", children: [
    { id: "", label: "Our café", href: `/cafe/${base}`, note: "Coffee, kitchen & hours", icon: "cafe" },
    ...(cp.order ? [{ id: "", label: "Order online", href: `/cafe/${base}/order`, note: "Pick up from the café", icon: "order" as const }]
      : cp.appOrder ? [{ id: "", label: "Order online", href: cafe.appUrl, note: "Order in our app", icon: "order" as const, external: true }] : []),
    ...(cp.reserve ? [{ id: "", label: "Reserve a table", href: `/cafe/${base}/reserve`, note: "Book ahead", icon: "table" as const }] : []),
    ...(cp.club ? [{ id: "", label: cafe.clubTitle || "Roasting Club", href: `/cafe/${base}/roasting-club`, note: "Shared roasting space", icon: "club" as const }] : []),
    ...(cp.wholesale ? [{ id: "", label: "Wholesale", href: `/cafe/${base}/wholesale`, note: "Coffee for your business", icon: "wholesale" as const }] : []),
  ] });
  // the online hire shop (Hire app) and pages the business has put in the menu
  if (readHireSettings(s).shop.enabled) out.push({ id: "hireshop", label: "Hire", href: `/hire/${base}/shop`, note: "See what's free and book online", icon: "events" });
  for (const p of readSite(s).pages.filter((x) => x.menu)) out.push({ id: `page-${p.slug}`, label: p.title.slice(0, 40), href: `/site/${base}/${p.slug}`, icon: p.form === "franchise" ? "franchise" : "info" });
  const lessonsGift = classes && org.stripeReady;
  const coffeeGift = shop && org.stripeReady;
  if (lessonsGift || coffeeGift) out.push({ id: "gifts", label: labels.gifts, href: lessonsGift ? `/book/${base}/gift` : `/shop/${base}/gift-card`, note: "Classes & coffee gift cards", icon: "gifts", children: [
    ...(lessonsGift ? [{ id: "", label: labels.lessons, href: `/book/${base}/gift`, note: "A class they'll love", icon: "lessons" as const }] : []),
    ...(coffeeGift ? [{ id: "", label: "Coffee", href: `/shop/${base}/gift-card`, note: "Choose an amount", icon: "coffee" as const }] : []),
  ] });
  return withIds(out, base);
}

const GROUP_ICON: Record<string, MenuIcon> = { cafe: "cafe", coffee: "coffee", learn: "lessons", roast: "roast", events: "events", wholesale: "wholesale", jobs: "jobs" };

/** The footer columns as the system builds them. */
export function footerMenuAuto(m: FooterModel, slug: string): MenuNode[] {
  const out: MenuNode[] = m.groups.map((g) => ({ id: g.key, label: g.title, href: g.links[0]?.href ?? "", icon: GROUP_ICON[g.key] ?? "link",
    children: g.links.map((l) => ({ id: "", label: l.label, href: l.href, external: l.external })) }));
  if (m.company.length) out.push({ id: "company", label: m.name, href: m.company[0].href, icon: "info", children: m.company.map((l) => ({ id: "", label: l.label, href: l.href })) });
  return withIds(out, slug);
}

// ------------------------------------------------------------------------------------------------ arranging

function fromAuto(n: MenuNode, s?: SavedNode): MenuItem {
  return {
    id: n.id, label: s?.label || n.label, href: n.href, note: s?.note ?? n.note ?? "", icon: s?.icon ?? n.icon ?? "link", external: !!n.external,
    hidden: !!s?.hidden, desktop: s?.desktop !== false, mobile: s?.mobile !== false, custom: false,
    auto: { label: n.label, note: n.note ?? "" }, children: [],
  };
}
function fromCustom(s: SavedNode): MenuItem | null {
  const label = str(s.label, 40), href = str(s.href, 400);
  if (!label || (href && !okHref(href))) return null;
  return {
    id: s.id, label, href, note: str(s.note, 60), icon: s.icon && (MENU_ICONS as readonly string[]).includes(s.icon) ? s.icon : "link", external: /^https:/.test(href),
    hidden: !!s.hidden, desktop: s.desktop !== false, mobile: s.mobile !== false, custom: true, auto: null, children: [],
  };
}

function arrangeLevel(auto: MenuNode[], saved: SavedNode[] | undefined, depth: number): MenuItem[] {
  const byId = new Map(auto.map((n) => [n.id, n]));
  const out: MenuItem[] = [];
  const used = new Set<string>();
  for (const s of saved ?? []) {
    if (!s || typeof s.id !== "string" || used.has(s.id)) continue;
    const a = s.custom ? null : byId.get(s.id);
    const item = a ? fromAuto(a, s) : s.custom ? fromCustom(s) : null;
    if (!item) continue; // a section that's been switched off
    used.add(s.id);
    if (depth === 0) item.children = arrangeLevel(a?.children ?? [], s.children, 1);
    out.push(item);
  }
  // Anything new (just switched on) goes at the end, in the system's order
  for (const a of auto) if (!used.has(a.id)) {
    const item = fromAuto(a);
    if (depth === 0) item.children = arrangeLevel(a.children ?? [], undefined, 1);
    out.push(item);
  }
  return out;
}

export function arrangeMenu(auto: MenuNode[], saved?: SavedNode[]): MenuItem[] {
  return arrangeLevel(auto, saved, 0);
}

/** What visitors see: hidden items (and everything under a hidden heading) removed; optionally only phone or computer items. */
export function visibleMenu(items: MenuItem[], where?: "desktop" | "mobile"): MenuItem[] {
  const ok = (i: MenuItem) => !i.hidden && (!where || i[where]);
  return items.filter(ok).map((i) => ({ ...i, children: i.children.filter(ok) }));
}

// ------------------------------------------------------------------------------------------------ reading / saving

export function readMenus(settings: unknown): SavedMenus {
  const site = settings && typeof settings === "object" ? (settings as Record<string, unknown>).site : null;
  const m = site && typeof site === "object" ? (site as Record<string, unknown>).menus : null;
  if (!m || typeof m !== "object") return {};
  const r = m as Record<string, unknown>;
  return { top: cleanSaved(r.top, 0), footer: cleanSaved(r.footer, 0) };
}

/** Validate what the editor sends (or what's stored) — anything malformed is dropped. */
export function cleanSaved(v: unknown, depth: number): SavedNode[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: SavedNode[] = [];
  const seen = new Set<string>();
  for (const x of v.slice(0, depth ? 40 : 20)) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const id = str(o.id, 120);
    if (!ID.test(id) || seen.has(id)) continue;
    const n: SavedNode = { id };
    if (o.custom === true) {
      const label = str(o.label, 40), href = str(o.href, 400);
      if (!label || (href && !okHref(href))) continue;
      n.custom = true; n.label = label; if (href) n.href = href;
    } else if (str(o.label, 40)) n.label = str(o.label, 40);
    if (typeof o.note === "string") n.note = str(o.note, 60);
    if (typeof o.icon === "string" && (MENU_ICONS as readonly string[]).includes(o.icon)) n.icon = o.icon as MenuIcon;
    if (o.hidden === true) n.hidden = true;
    if (o.desktop === false) n.desktop = false;
    if (o.mobile === false) n.mobile = false;
    if (depth === 0) { const kids = cleanSaved(o.children, 1); if (kids) n.children = kids; }
    seen.add(id);
    out.push(n);
  }
  return out;
}

/** The editor's list → what gets stored (only differences from the automatic menu, plus order and custom links). */
export function toSaved(items: MenuItem[], depth = 0): SavedNode[] {
  return items.map((i) => {
    const n: SavedNode = { id: i.id };
    if (i.custom) { n.custom = true; n.label = i.label; if (i.href) n.href = i.href; if (i.note) n.note = i.note; n.icon = i.icon; }
    else {
      if (i.auto && i.label !== i.auto.label) n.label = i.label;
      if (i.auto && i.note !== i.auto.note) n.note = i.note;
    }
    if (i.hidden) n.hidden = true;
    if (!i.desktop) n.desktop = false;
    if (!i.mobile) n.mobile = false;
    if (depth === 0) n.children = toSaved(i.children, 1);
    return n;
  });
}
