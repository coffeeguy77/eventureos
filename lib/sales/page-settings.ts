/** How the listing's sales page reads: kept in sale_listings.details.page (no extra tables). */
export interface SaleTerm { id: string; title: string; text: string; categories: string[]; figure: "sales" | "qty" | "none" }
export interface AddBack { label: string; amount: number }
export interface PageSettings {
  /** Square categories that count as coffee (null = not chosen yet) */
  coffee_categories: string[] | null;
  /** headline numbers anyone with the page sees; the rest (charts, P&L) are for signed buyers */
  public_figures: FigureKey[];
  headline: string;
  terms: SaleTerm[];
  valuation: { multiple: number; addbacks: AddBack[]; show: "buyers" | "public" | "hidden" };
  /** years of history buyers can choose between on the page */
  years: number;
}
export const FIGURES = {
  coffees: "Coffees sold", coffee_sales: "Coffee revenue", sales: "Total sales", orders: "Sales (transactions)",
  avg_sale: "Average sale", per_day: "Average day", best_day: "Busiest day", coffees_per_day: "Coffees a day",
} as const;
export type FigureKey = keyof typeof FIGURES;

export const DEFAULT_PAGE: PageSettings = {
  coffee_categories: null, public_figures: ["coffees", "coffee_sales", "sales", "orders"], headline: "", terms: [],
  valuation: { multiple: 2.5, addbacks: [], show: "buyers" }, years: 3,
};

export function readPage(details: unknown): PageSettings {
  const p = ((details as { page?: unknown } | null)?.page ?? {}) as Partial<PageSettings>;
  const keys = Object.keys(FIGURES) as FigureKey[];
  const v = (p.valuation ?? {}) as Partial<PageSettings["valuation"]>;
  return {
    coffee_categories: Array.isArray(p.coffee_categories) ? p.coffee_categories.map(String) : null,
    public_figures: Array.isArray(p.public_figures) ? (p.public_figures.filter((k) => keys.includes(k as FigureKey)) as FigureKey[]) : DEFAULT_PAGE.public_figures,
    headline: typeof p.headline === "string" ? p.headline : "",
    terms: Array.isArray(p.terms) ? p.terms.map((t, i) => ({ id: String(t?.id ?? `t${i}`), title: String(t?.title ?? ""), text: String(t?.text ?? ""), categories: Array.isArray(t?.categories) ? t.categories.map(String) : [], figure: t?.figure === "qty" || t?.figure === "none" ? t.figure : "sales" })) : [],
    valuation: {
      multiple: Number.isFinite(Number(v.multiple)) && Number(v.multiple) > 0 ? Number(v.multiple) : 2.5,
      addbacks: Array.isArray(v.addbacks) ? v.addbacks.map((a) => ({ label: String(a?.label ?? ""), amount: Number(a?.amount) || 0 })).filter((a) => a.label) : [],
      show: v.show === "public" || v.show === "hidden" ? v.show : "buyers",
    },
    years: [1, 2, 3].includes(Number(p.years)) ? Number(p.years) : 3,
  };
}
