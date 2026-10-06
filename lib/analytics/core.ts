/**
 * Website analytics report — pure aggregation of site_events rows (no database).
 * Finds the flat spots: which sections people stop at, which parts of a page they never reach, where they leave.
 */

export interface SiteEvent { visitor: string; session: string; kind: string; section: string | null; path: string | null; label: string | null; device: string | null; created_at: string; /** local calendar day, if known */ day?: string }

export interface Funnel { section: string; sessions: number; clicked: number; started: number; submitted: number }
export interface PagePart { name: string; reached: number; share: number; flat: boolean }
export interface PageDepth { path: string; views: number; parts: PagePart[] }
export interface Report {
  visitors: number; sessions: number; views: number; formsSent: number; quotes: number; cartAdds: number; checkouts: number;
  devices: { name: string; n: number }[];
  funnels: Funnel[];
  flows: { from: string; to: string; n: number }[];
  pages: PageDepth[];
  exits: { path: string; n: number; share: number }[];
  clicks: { label: string; section: string; n: number }[];
  daily: { day: string; views: number; sessions: number }[];
}

const FLAT = 0.35;

export function buildReport(rows: SiteEvent[], days: string[]): Report {
  const sessions = new Map<string, SiteEvent[]>();
  for (const r of rows) (sessions.get(r.session) ?? sessions.set(r.session, []).get(r.session)!).push(r);
  for (const list of sessions.values()) list.sort((a, b) => a.created_at.localeCompare(b.created_at));
  const pageViews = rows.filter((r) => r.kind === "view" && !r.label?.startsWith("#"));

  // Funnel per website section
  const fun = new Map<string, Funnel>();
  for (const list of sessions.values()) {
    const bySec = new Map<string, Set<string>>();
    for (const e of list) { const s = e.section || "other"; (bySec.get(s) ?? bySec.set(s, new Set()).get(s)!).add(e.kind); }
    for (const [s, kinds] of bySec) {
      const f = fun.get(s) ?? { section: s, sessions: 0, clicked: 0, started: 0, submitted: 0 };
      f.sessions++;
      if (kinds.has("click") || kinds.has("cart_add")) f.clicked++;
      if (kinds.has("form_start") || kinds.has("quote_start") || kinds.has("cart_add")) f.started++;
      if (kinds.has("form_submit") || kinds.has("quote_submit") || kinds.has("checkout_start") || kinds.has("purchase")) f.submitted++;
      fun.set(s, f);
    }
  }

  // Section → section moves within a visit
  const flows = new Map<string, number>();
  for (const list of sessions.values()) {
    let prev: string | null = null;
    for (const e of list) {
      if (e.kind !== "view" || e.label?.startsWith("#")) continue;
      const s = e.section || "other";
      if (prev && prev !== s) flows.set(`${prev}→${s}`, (flows.get(`${prev}→${s}`) ?? 0) + 1);
      prev = s;
    }
  }

  // How far down each page people get (page parts marked with data-section)
  const viewsByPath = new Map<string, number>();
  for (const v of pageViews) if (v.path) viewsByPath.set(v.path, (viewsByPath.get(v.path) ?? 0) + 1);
  const partsByPath = new Map<string, Map<string, Set<string>>>();
  const order = new Map<string, Map<string, number>>();
  for (const r of rows) {
    if (r.kind !== "view" || !r.label?.startsWith("#") || !r.path) continue;
    const name = r.label.slice(1);
    const m = partsByPath.get(r.path) ?? partsByPath.set(r.path, new Map()).get(r.path)!;
    (m.get(name) ?? m.set(name, new Set()).get(name)!).add(r.session);
    const o = order.get(r.path) ?? order.set(r.path, new Map()).get(r.path)!;
    if (!o.has(name)) o.set(name, o.size);
  }
  const pages: PageDepth[] = [...viewsByPath.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([path, views]) => {
    const m = partsByPath.get(path) ?? new Map<string, Set<string>>();
    const sessionsOnPage = new Set(pageViews.filter((v) => v.path === path).map((v) => v.session)).size || 1;
    const o = order.get(path) ?? new Map();
    const parts = [...m.entries()].sort((a, b) => (o.get(a[0]) ?? 0) - (o.get(b[0]) ?? 0)).map(([name, set]) => {
      const share = Math.min(1, set.size / sessionsOnPage);
      return { name, reached: set.size, share, flat: share < FLAT && sessionsOnPage >= 10 };
    });
    return { path, views, parts };
  });

  // Last page of each visit
  const exits = new Map<string, number>();
  for (const list of sessions.values()) {
    const last = [...list].reverse().find((e) => e.kind === "view" && !e.label?.startsWith("#") && e.path);
    if (last?.path) exits.set(last.path, (exits.get(last.path) ?? 0) + 1);
  }
  const clicks = new Map<string, { label: string; section: string; n: number }>();
  for (const r of rows) {
    if ((r.kind !== "click" && r.kind !== "cart_add") || !r.label) continue;
    const k = `${r.section}|${r.label}`;
    const c = clicks.get(k) ?? { label: r.label, section: r.section ?? "other", n: 0 };
    c.n++; clicks.set(k, c);
  }
  const dev = new Map<string, number>();
  for (const list of sessions.values()) { const d = list[0]?.device ?? "unknown"; dev.set(d, (dev.get(d) ?? 0) + 1); }
  const daily = days.map((day) => ({ day, views: pageViews.filter((v) => (v.day ?? v.created_at.slice(0, 10)) === day).length, sessions: new Set(rows.filter((v) => (v.day ?? v.created_at.slice(0, 10)) === day).map((v) => v.session)).size }));

  const count = (k: string) => rows.filter((r) => r.kind === k).length;
  return {
    visitors: new Set(rows.map((r) => r.visitor)).size, sessions: sessions.size, views: pageViews.length,
    formsSent: count("form_submit"), quotes: count("quote_submit"), cartAdds: count("cart_add"), checkouts: count("checkout_start"),
    devices: [...dev.entries()].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n),
    funnels: [...fun.values()].sort((a, b) => b.sessions - a.sessions),
    flows: [...flows.entries()].map(([k, n]) => { const [from, to] = k.split("→"); return { from, to, n }; }).sort((a, b) => b.n - a.n).slice(0, 10),
    pages,
    exits: [...exits.entries()].map(([path, n]) => ({ path, n, share: n / Math.max(1, sessions.size) })).sort((a, b) => b.n - a.n).slice(0, 8),
    clicks: [...clicks.values()].sort((a, b) => b.n - a.n).slice(0, 15),
    daily,
  };
}
