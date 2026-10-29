import Link from "next/link";
import { requireOrg } from "@/lib/context";
import { fmtDate, money } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import { KIND_LABEL, readBonusRates } from "@/lib/bonuses/core";
import { bonusTotals, loadBonuses } from "@/lib/bonuses/server";
import { getMembers } from "@/lib/context";
import { todayISO } from "@/lib/format";
import { BonusRates, PayBonuses } from "@/components/bonuses/manage";

export const dynamic = "force-dynamic";
export const metadata = { title: "My bonuses" };

/** A team member's sales bonuses: new builds and maintenance they sold (ex GST), what's been paid to them and when. */
export default async function MyBonusesPage() {
  const { supabase, org, user, role } = await requireOrg();
  const admin = role === "owner" || role === "admin";
  const { data: o } = await supabase.from("organisations").select("settings").eq("id", org.id).single();
  const rates = readBonusRates(o?.settings)[user.id] ?? null;
  const rows = await loadBonuses(supabase, org.id, user.id);
  const cur = org.currency;
  if (rows === null) return (<><PageHeader title="My bonuses" /><Card><EmptyState title="Almost ready">Bonuses need the 0081 database update — ask the owner to run it.</EmptyState></Card></>);
  const t = bonusTotals(rows);
  const tile = (label: string, value: string, sub: string, tone?: string) => (
    <Card className="p-4"><p className="text-[0.75rem] font-medium text-ink-muted">{label}</p><p className={`mt-1 text-[1.5rem] font-semibold tabular-nums ${tone ?? "text-ink"}`}>{value}</p><p className="mt-0.5 text-[0.75rem] text-ink-muted">{sub}</p></Card>
  );
  return (
    <>
      <PageHeader title="My bonuses" subtitle={rates ? `${rates.build}% on new website builds and ${rates.maintenance}% on maintenance — on the amount ex GST, once the customer pays. Paid on top of your wage.` : "Your bonus rates haven't been set up yet."} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tile("Paid to you", money(t.paid, cur), "already in your bank", "text-emerald-700")}
        {tile("Ready to be paid", money(t.ready, cur), "customer has paid")}
        {tile("Waiting on the customer", money(t.waiting, cur), "paid once they pay")}
        {tile("Your sales (ex GST)", money(t.buildSales + t.maintenanceSales, cur), `${money(t.buildSales, cur, { cents: false })} builds · ${money(t.maintenanceSales, cur, { cents: false })} maintenance`)}
      </div>
      {admin && await (async () => {
        const [members, all] = await Promise.all([getMembers(org.id), loadBonuses(supabase, org.id)]);
        const allRates = readBonusRates(o?.settings);
        const team = members.filter((m) => m.role !== "owner" || m.id !== user.id || allRates[m.id]).map((m) => ({ id: m.id, name: m.full_name ?? m.email ?? "Team member", ...(allRates[m.id] ?? { build: 0, maintenance: 0 }) }));
        const who = (id: string) => members.find((m) => m.id === id)?.full_name ?? "Team member";
        const rowsAll = (all ?? []).map((b) => ({ id: b.id, who: who(b.user_id), invoice: b.invoice?.number ?? "—", customer: b.invoice?.customer?.name ?? "", kind: KIND_LABEL[b.kind], exGst: b.figures.exGst,
          bonus: b.status === "paid" ? b.amount_paid ?? 0 : b.figures.full, ready: b.figures.paidInFull, paid: b.status === "paid", paidOn: b.paid_on, reference: b.reference }));
        return (
          <div className="mt-5 space-y-5">
            <h2 className="text-[1rem] font-semibold text-ink">Team bonuses (owners and admins)</h2>
            <PayBonuses rows={rowsAll} currency={cur} today={todayISO(org.timezone)} />
            <BonusRates people={team} />
          </div>
        );
      })()}
      <Card className="mt-5">
        <CardHeader title="Your sales" />
        {!rows.length ? <EmptyState title="No sales credited yet">When an invoice is credited to you (on the invoice page), it shows here with your bonus.</EmptyState> : (
          <div className="overflow-x-auto border-t border-line">
            <table className="w-full min-w-[720px] text-[0.8125rem]">
              <thead><tr className="border-b border-line text-left text-[0.75rem] text-ink-muted"><th className="px-5 py-2 font-medium">Invoice</th><th className="px-2 py-2 font-medium">Type</th><th className="px-2 py-2 text-right font-medium">Sale ex GST</th><th className="px-2 py-2 text-right font-medium">Bonus</th><th className="px-5 py-2 font-medium">Status</th></tr></thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id} className="border-b border-line last:border-0">
                    <td className="px-5 py-2"><Link href={`/invoices/${b.invoice_id}`} className="font-medium hover:underline">{b.invoice?.number ?? "—"}</Link><span className="block text-[0.75rem] text-ink-muted">{b.invoice?.customer?.name ?? ""}{b.invoice?.issue_date ? ` · ${fmtDate(b.invoice.issue_date, "short")}` : ""}</span></td>
                    <td className="px-2 py-2">{KIND_LABEL[b.kind]} · {b.rate}%</td>
                    <td className="px-2 py-2 text-right tabular-nums">{money(b.figures.exGst, cur)}</td>
                    <td className="px-2 py-2 text-right font-semibold tabular-nums">{money(b.status === "paid" ? b.amount_paid ?? 0 : b.figures.full, cur)}</td>
                    <td className="px-5 py-2">{b.status === "paid" ? <span className="text-emerald-700">Paid {b.paid_on ? fmtDate(b.paid_on, "short") : ""}{b.reference ? <span className="block text-[0.75rem] text-ink-muted">Bank: “{b.reference}”</span> : null}</span>
                      : b.figures.paidInFull ? <span className="font-medium text-ink">Ready — customer paid</span>
                      : b.figures.share > 0 ? <span className="text-amber-700">Customer part paid ({Math.round(b.figures.share * 100)}%)</span> : <span className="text-ink-muted">Waiting on the customer</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
