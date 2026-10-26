import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireOrg } from "@/lib/context";
import { addDaysISO, fmtDate, todayISO } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { BASE_LABEL } from "@/lib/pricing/units";
import { analysePrices, money } from "@/lib/pricing/analysis";
import { loadPriceRows } from "@/lib/pricing/data";
import { productWords } from "@/lib/pricing/core";
import { ChangeCell, PriceChart } from "@/components/pricing/charts";
import { InvoiceLink } from "@/components/pricing/invoice-link";

export const dynamic = "force-dynamic";

/** One product from one supplier: its price over time, every order, and what other suppliers charge for something similar. */
export default async function PriceItemPage({ searchParams }: { searchParams: Promise<{ s?: string; k?: string }> }) {
  const { supabase, org } = await requireOrg();
  const sp = await searchParams;
  if (!sp.s || !sp.k || !/^[0-9a-f-]{36}$/i.test(sp.s)) notFound();
  const today = todayISO(org.timezone);
  const windowStart = addDaysISO(today, -90);
  const [all, { data: sups }] = await Promise.all([loadPriceRows(supabase, org.id), supabase.from("price_suppliers").select("id, name, rep_name, rep_email, rep_phone").eq("organisation_id", org.id)]);
  const products = analysePrices(all, { windowStart, today });
  const p = products.find((x) => x.supplierId === sp.s && x.matchKey === sp.k);
  if (!p) notFound();
  const supList = (sups ?? []) as { id: string; name: string; rep_name: string | null; rep_email: string | null; rep_phone: string | null }[];
  const sup = supList.find((x) => x.id === p.supplierId);
  const u = BASE_LABEL[p.baseUnit];
  const unitWord = p.baseUnit === "ea" ? "unit" : p.baseUnit;
  const lines = all.filter((r) => r.supplier_id === p.supplierId && r.match_key === p.matchKey && r.base_unit === p.baseUnit).reverse();
  // similar products: share at least two identifying words (or one, for one-word names), same way of pricing
  const mine = new Set(productWords(p.description));
  const need = Math.min(2, mine.size);
  const similar = need ? products.filter((x) => x.key !== p.key && x.baseUnit === p.baseUnit && productWords(x.description).filter((w) => mine.has(w)).length >= need)
    .sort((a, b) => a.latest.price - b.latest.price).slice(0, 12) : [];

  return (
    <>
      <Link href="/pricing" className="mb-3 inline-flex items-center gap-1 text-[0.7812rem] text-ink-muted hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" />Supplier prices</Link>
      <PageHeader title={p.description} subtitle={`${sup?.name ?? "Supplier"} · ${p.orders} order${p.orders === 1 ? "" : "s"} · prices ex GST`} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-4"><p className="text-[0.75rem] text-ink-muted">Latest</p><p className="text-[1.5rem] font-semibold tabular-nums">{money(p.latest.price)}<span className="text-[0.875rem] text-ink-faint">{u}</span></p><p className="text-[0.75rem] text-ink-faint">{fmtDate(p.latest.date)}</p></Card>
        <Card className="p-4"><p className="text-[0.75rem] text-ink-muted">Last price change</p><div className="mt-2"><ChangeCell p={p} /></div><p className="mt-1 text-[0.75rem] text-ink-faint">{p.previous && p.changedOn ? `was ${money(p.previous.price)}${u} until ${fmtDate(p.changedOn, "short")}` : "Same price every order"}</p></Card>
        <Card className="p-4"><p className="text-[0.75rem] text-ink-muted">Over 90 days</p><p className="text-[1.5rem] font-semibold tabular-nums">{p.windowPct === null ? "—" : `${p.windowPct > 0 ? "+" : ""}${p.windowPct.toFixed(1)}%`}</p><p className="text-[0.75rem] text-ink-faint">{p.firstInWindow ? `from ${money(p.firstInWindow.price)}${u}` : "Not enough orders"}</p></Card>
        <Card className="p-4"><p className="text-[0.75rem] text-ink-muted">Range</p><p className="text-[1.5rem] font-semibold tabular-nums">{money(p.low)}–{money(p.high)}</p><p className="text-[0.75rem] text-ink-faint">per {unitWord}</p></Card>
      </div>
      <p className="mt-3 text-[0.8125rem] text-ink-muted">
        Last 12 months: <strong className="text-ink">{money(p.spend12, 0)}</strong> on about {Math.round(p.volume12 * 10) / 10} {unitWord}.
        {p.potentialSaving >= 1 && p.best12
          ? <> You&apos;re paying {(p.overBestPct ?? 0).toFixed(1)}% more than your best price of {money(p.best12.price)}{u} ({fmtDate(p.best12.date)}) — about <strong className="text-rose-700">{money(p.potentialSaving, 0)} a year</strong> at your current rate.{sup?.rep_name || sup?.rep_email || sup?.rep_phone ? <> Worth raising with {sup.rep_name ?? "your rep"}{sup.rep_phone ? ` (${sup.rep_phone})` : ""}{sup.rep_email ? <> · <a href={`mailto:${sup.rep_email}?subject=${encodeURIComponent(`Pricing: ${p.description}`)}`} className="font-medium text-brand-700 underline">email</a></> : null}.</> : " Worth asking the supplier."}</>
          : " You're paying your best price of the last 12 months."}
      </p>
      <Card className="mt-5"><CardHeader title={`Price per ${unitWord}`} subtitle="Hover a point for that order's price" /><div className="p-3"><PriceChart points={p.history} unitLabel={unitWord} /></div></Card>

      {similar.length > 0 && (
        <Card className="mt-5">
          <CardHeader title="Similar products" subtitle={`Other products and suppliers, per ${unitWord}, cheapest first`} />
          <ul className="divide-y divide-line border-t border-line">
            {similar.map((x) => (
              <li key={x.key}>
                <Link href={`/pricing/item?s=${x.supplierId}&k=${encodeURIComponent(x.matchKey)}`} className="flex items-center gap-3 px-5 py-2.5 text-[0.8125rem] hover:bg-zinc-50">
                  <span className="min-w-0 flex-1"><span className="font-medium text-ink">{x.description}</span><span className="block text-[0.7188rem] text-ink-faint">{supList.find((s) => s.id === x.supplierId)?.name} · last bought {fmtDate(x.latest.date, "short")}</span></span>
                  <span className={`tabular-nums font-semibold ${x.latest.price < p.latest.price ? "text-emerald-700" : "text-ink"}`}>{money(x.latest.price)}<span className="font-normal text-ink-faint">{u}</span></span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="mt-5">
        <CardHeader title="Every order" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-[0.8125rem]">
            <thead><tr className="border-b border-line text-left text-[0.75rem] text-ink-muted">
              <th className="px-4 py-2 font-medium">Invoice date</th><th className="px-2 py-2 text-right font-medium">Qty</th><th className="px-2 py-2 font-medium">Pack</th>
              <th className="px-2 py-2 text-right font-medium">Unit price</th><th className="px-2 py-2 text-right font-medium">Per {unitWord}</th><th className="px-4 py-2 text-right font-medium">Line total</th>
            </tr></thead>
            <tbody>
              {lines.map((r, i) => (
                <tr key={i} className="border-b border-line last:border-0">
                  <td className="px-4 py-2"><InvoiceLink id={r.delivery_id} label={fmtDate(r.invoice_date)} /></td>
                  <td className="px-2 py-2 text-right tabular-nums">{r.qty ?? "—"}</td>
                  <td className="px-2 py-2 text-ink-muted">{r.pack_size ?? r.unit ?? "—"}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{money(r.unit_price)}</td>
                  <td className="px-2 py-2 text-right font-medium tabular-nums">{money(r.price_per_base)}{u}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(r.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
