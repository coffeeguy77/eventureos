/**
 * Quote templates — a named starting point made of price-list items (prices always come from the
 * price list when the template is used) and, optionally, one-off lines with their own price.
 * Pure: shared by the server actions, the settings editor and the quote builder.
 */
export interface TemplateItem {
  /** A price-list item; its current name, description and price are used. */
  service_id?: string | null;
  /** One-off lines (no service): name and price stored on the template. */
  name?: string | null;
  description?: string | null;
  unit?: string | null;
  unit_price?: number | null;
  tax_rate?: number | null;
  quantity: number;
  optional?: boolean;
}
export interface TemplateSection { title: string; items: TemplateItem[] }
export interface QuoteTemplate { id: string; name: string; summary: string | null; sections: TemplateSection[]; active: boolean; position: number }

export interface PriceListItem { id: string; name: string; description: string | null; unit: string | null; unit_price: number; tax_rate: number }

export interface ResolvedLine {
  service_id: string | null; name: string; description: string | null; unit: string | null;
  quantity: number; unit_price: number; tax_rate: number; optional: boolean;
}

const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : d);

/** Clean template sections coming from a form or the database. */
export function cleanSections(raw: unknown): TemplateSection[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 20).map((s) => {
    const sec = (s ?? {}) as { title?: unknown; items?: unknown };
    const items = (Array.isArray(sec.items) ? sec.items : []).slice(0, 100).map((x) => {
      const i = (x ?? {}) as Record<string, unknown>;
      const service_id = typeof i.service_id === "string" && /^[0-9a-f-]{36}$/i.test(i.service_id) ? i.service_id : null;
      const out: TemplateItem = { quantity: Math.max(0, Math.round(num(i.quantity, 1) * 1000) / 1000) };
      if (service_id) out.service_id = service_id;
      else {
        out.name = String(i.name ?? "").trim().slice(0, 200) || null;
        out.unit = String(i.unit ?? "").trim().slice(0, 40) || null;
        out.unit_price = Math.max(0, Math.round(num(i.unit_price) * 100) / 100);
        out.tax_rate = Math.min(100, Math.max(0, num(i.tax_rate, 10)));
      }
      const desc = String(i.description ?? "").trim().slice(0, 4000);
      if (desc) out.description = desc;
      if (i.optional) out.optional = true;
      return out;
    }).filter((i) => i.service_id || i.name);
    return { title: String(sec.title ?? "").trim().slice(0, 200) || "Services", items };
  }).filter((s) => s.items.length);
}

/**
 * Turn a template into quote lines using the current price list.
 * Items whose price-list entry has been removed or switched off are reported, not silently dropped.
 */
export function resolveTemplate(sections: TemplateSection[], priceList: PriceListItem[]) {
  const byId = new Map(priceList.map((p) => [p.id, p]));
  const missing: number[] = [];
  let n = 0;
  const out = sections.map((s) => ({
    title: s.title,
    lines: s.items.flatMap((i): ResolvedLine[] => {
      n++;
      if (i.service_id) {
        const p = byId.get(i.service_id);
        if (!p) { missing.push(n); return []; }
        return [{ service_id: p.id, name: p.name, description: i.description ?? p.description, unit: p.unit, quantity: i.quantity, unit_price: p.unit_price, tax_rate: p.tax_rate, optional: !!i.optional }];
      }
      return [{ service_id: null, name: i.name ?? "Item", description: i.description ?? null, unit: i.unit ?? null, quantity: i.quantity, unit_price: num(i.unit_price), tax_rate: num(i.tax_rate, 10), optional: !!i.optional }];
    }),
  })).filter((s) => s.lines.length);
  return { sections: out, missing: missing.length };
}

/** Ex-tax subtotal and total (inc tax) of the included (non-optional) lines. */
export function templateTotals(sections: TemplateSection[], priceList: PriceListItem[]) {
  const { sections: r } = resolveTemplate(sections, priceList);
  let sub = 0, tax = 0;
  for (const s of r) for (const l of s.lines) if (!l.optional) { const t = Math.round(l.quantity * l.unit_price * 100) / 100; sub += t; tax += t * l.tax_rate / 100; }
  return { subtotal: Math.round(sub * 100) / 100, total: Math.round((sub + tax) * 100) / 100 };
}
