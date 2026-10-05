import { requireOrg } from "@/lib/context";
import { createServiceClient } from "@/lib/integrations/runtime";
import { roastPlan, shopOrgById } from "@/lib/shop/server";
import { PageHeader } from "@/components/ui/page-header";
import { Card, EmptyState } from "@/components/ui/card";
import { PrintButton } from "@/components/book/print-button";

export const dynamic = "force-dynamic";
const kg = (g: number) => (g >= 1000 ? `${(g / 1000).toFixed(g % 1000 ? 2 : 0)} kg` : `${g} g`);

export default async function RoastPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const days = Math.max(1, Math.min(28, Number((await searchParams).days) || 7));
  const { org } = await requireOrg();
  const db = createServiceClient();
  const plan = await roastPlan(db, await shopOrgById(db, org.id), days);
  const total = plan.totals.reduce((a, t) => a + t.grams, 0);
  return (
    <>
      <PageHeader title="Roast plan" subtitle={`Paid orders not yet shipped + subscription deliveries due in the next ${days} days (${plan.from} → ${plan.to}). Roasted weight before roast loss.`}
        actions={<><form className="flex items-center gap-2 text-[0.8125rem]"><select name="days" defaultValue={String(days)} className="h-9 rounded-lg border border-line-strong bg-surface px-2">{[3, 7, 14, 28].map((d) => <option key={d} value={d}>Next {d} days</option>)}</select><button className="h-9 rounded-lg border border-line-strong bg-surface px-3 font-medium">Show</button></form><PrintButton /></>} />
      {plan.rows.length === 0 ? <Card><EmptyState title="Nothing to roast">Paid orders and upcoming subscription deliveries add up here.</EmptyState></Card> : (
        <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
          <Card className="p-5">
            <h2 className="text-[0.9375rem] font-semibold text-ink">By coffee</h2>
            <ul className="mt-3 space-y-2">
              {plan.totals.map((t) => (
                <li key={t.name}>
                  <div className="flex justify-between text-[0.875rem]"><span className="font-medium text-ink">{t.name}</span><span className="font-semibold text-ink">{kg(t.grams)}</span></div>
                  <div className="mt-1 h-2 rounded-full bg-zinc-100"><div className="h-2 rounded-full bg-brand-500" style={{ width: `${total ? Math.max(4, Math.round((t.grams / total) * 100)) : 0}%` }} /></div>
                </li>
              ))}
            </ul>
            <p className="mt-4 border-t border-line pt-3 text-[0.875rem] font-semibold text-ink">Total {kg(total)}</p>
          </Card>
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-[0.8438rem]">
              <thead className="border-b border-line bg-zinc-50 text-[0.75rem] text-ink-muted"><tr><th className="px-4 py-2">Coffee</th><th className="px-4 py-2">Size</th><th className="px-4 py-2">Grind</th><th className="px-4 py-2 text-right">Bags</th><th className="px-4 py-2 text-right">Weight</th><th className="px-4 py-2">From</th></tr></thead>
              <tbody className="divide-y divide-line">
                {plan.rows.map((r) => (
                  <tr key={`${r.name}${r.size}${r.grind}`}>
                    <td className="px-4 py-2.5 font-medium text-ink">{r.name}</td><td className="px-4 py-2.5">{r.size}</td><td className="px-4 py-2.5">{r.grind}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-ink">{r.qty}</td><td className="px-4 py-2.5 text-right">{r.grams ? kg(r.grams) : "—"}</td>
                    <td className="px-4 py-2.5 text-[0.75rem] text-ink-muted">{[r.sources.orders ? `${r.sources.orders} ordered` : null, r.sources.subs ? `${r.sources.subs} subscription` : null, r.sources.woo ? `${r.sources.woo} WooCommerce sub` : null].filter(Boolean).join(" · ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </>
  );
}
