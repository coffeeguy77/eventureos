import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requireOrg } from "@/lib/context";
import { Card, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Kpi } from "@/components/records/kpi";
import { fmtDateTime, money, relative, todayISO, zonedMidnightUTC } from "@/lib/format";
import { cn } from "@/lib/cn";

export const metadata = { title: "Payments" };

type Row = {
  id: string; amount: number; paid_at: string; method: string | null; reference: string | null; xero_payment_id: string | null;
  invoice: { id: string; number: string; customer: { id: string; name: string } | null; event: { id: string; name: string } | null } | null;
};

const shiftMonth = (ym: string, n: number) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
};
const monthLabel = (ym: string) =>
  new Intl.DateTimeFormat("en-AU", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(ym + "-01T00:00:00Z"));

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const sp = await searchParams;
  const { supabase, org } = await requireOrg();
  const tz = org.timezone;
  const cur = org.currency;
  const thisMonth = todayISO(tz).slice(0, 7);
  const all = sp.month === "all";
  const month = !all && sp.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month) ? sp.month : thisMonth;
  const start = zonedMidnightUTC(month + "-01", tz);
  const end = zonedMidnightUTC(shiftMonth(month, 1) + "-01", tz);

  let q = supabase.from("payments")
    .select("id, amount, paid_at, method, reference, xero_payment_id, invoice:invoices(id, number, customer:customers(id, name), event:events(id, name))")
    .eq("organisation_id", org.id).order("paid_at", { ascending: false }).limit(2000);
  if (!all) q = q.gte("paid_at", start).lt("paid_at", end);
  const [payRes, xeroRes] = await Promise.all([
    q,
    supabase.from("integrations").select("status, last_sync_at").eq("organisation_id", org.id).eq("provider", "xero").maybeSingle(),
  ]);
  if (payRes.error) throw new Error(`Could not load payments: ${payRes.error.message}`);
  const rows = (payRes.data ?? []) as unknown as Row[];
  const total = rows.reduce((s, p) => s + Number(p.amount), 0);
  const fromXero = rows.filter((p) => p.xero_payment_id);
  const xeroConnected = xeroRes.data?.status === "connected" || xeroRes.data?.status === "syncing";
  const period = all ? "All time" : monthLabel(month);

  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(thisMonth, -i));

  return (
    <div>
      <PageHeader title="Payments" subtitle="Every payment received, by customer, invoice and event."
        actions={<span className={cn("text-[12px]", xeroConnected ? "text-emerald-700" : "text-ink-faint")}>
          {xeroConnected ? `Synced with Xero${xeroRes.data?.last_sync_at ? ` · ${relative(xeroRes.data.last_sync_at)}` : ""}` : "Xero not connected · manual payments only"}
        </span>} />

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi label={`Received · ${period}`} value={money(total, cur)} sub={`${rows.length} payment${rows.length === 1 ? "" : "s"}`} />
        <Kpi label="Recorded manually" value={money(total - fromXero.reduce((s, p) => s + Number(p.amount), 0), cur)} sub={`${rows.length - fromXero.length} payment${rows.length - fromXero.length === 1 ? "" : "s"}`} />
        <Kpi label="From Xero" value={money(fromXero.reduce((s, p) => s + Number(p.amount), 0), cur)} sub={xeroConnected ? `${fromXero.length} synced` : "Xero not connected"} />
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          {!all && (
            <div className="flex">
              <Link href={`/payments?month=${shiftMonth(month, -1)}`} aria-label="Previous month" className={buttonClass("ghost", "sm", "px-2")}><ChevronLeft className="h-4 w-4" /></Link>
              <Link href={month === thisMonth ? "/payments" : `/payments?month=${shiftMonth(month, 1)}`} aria-label="Next month" className={buttonClass("ghost", "sm", "px-2")}><ChevronRight className="h-4 w-4" /></Link>
            </div>
          )}
          <h2 className="text-[14px] font-semibold text-ink">{period}</h2>
          <div className="no-scrollbar ml-auto flex max-w-full gap-1 overflow-x-auto">
            {months.map((m) => (
              <Link key={m} href={m === thisMonth ? "/payments" : `/payments?month=${m}`}
                className={cn("shrink-0 rounded-full px-2.5 py-1 text-[12px] font-medium",
                  !all && m === month ? "bg-ink text-white" : "text-ink-muted hover:bg-zinc-100 hover:text-ink")}>
                {new Intl.DateTimeFormat("en-AU", { month: "short", timeZone: "UTC" }).format(new Date(m + "-01T00:00:00Z"))}
              </Link>
            ))}
            <Link href="/payments?month=all" className={cn("shrink-0 rounded-full px-2.5 py-1 text-[12px] font-medium", all ? "bg-ink text-white" : "text-ink-muted hover:bg-zinc-100 hover:text-ink")}>All</Link>
          </div>
        </div>
        {rows.length === 0 ? (
          <EmptyState title={`No payments in ${period}`}>Payments appear here when they’re recorded on an invoice{xeroConnected ? " or synced from Xero" : ""}.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-line text-[11.5px] uppercase tracking-wide text-ink-faint">
                  {["Date", "Customer", "Invoice", "Event", "Method", "Reference", "Amount", "Source"].map((h) => (
                    <th key={h} className={cn("whitespace-nowrap px-4 py-2.5 font-medium", h === "Amount" && "text-right")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((p) => (
                  <tr key={p.id} className="hover:bg-zinc-50/70">
                    <td className="whitespace-nowrap px-4 py-3 text-ink">{fmtDateTime(p.paid_at, tz, "date")}</td>
                    <td className="max-w-[200px] truncate px-4 py-3">
                      {p.invoice?.customer ? <Link href={`/clients/${p.invoice.customer.id}`} className="text-ink hover:text-brand-700">{p.invoice.customer.name}</Link> : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {p.invoice ? <Link href={`/invoices/${p.invoice.id}`} className="font-medium text-ink hover:text-brand-700">{p.invoice.number}</Link> : "—"}
                    </td>
                    <td className="max-w-[220px] truncate px-4 py-3 text-ink-muted">
                      {p.invoice?.event ? <Link href={`/events/${p.invoice.event.id}?tab=payments`} className="hover:text-brand-700">{p.invoice.event.name}</Link> : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink-muted">{p.method ?? "—"}</td>
                    <td className="max-w-[160px] truncate px-4 py-3 text-ink-muted">{p.reference ?? "—"}</td>
                    <td className="tabular whitespace-nowrap px-4 py-3 text-right font-medium text-emerald-700">{money(p.amount, cur)}</td>
                    <td className="px-4 py-3">{p.xero_payment_id ? <Badge tone="blue">Xero</Badge> : <Badge>Manual</Badge>}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-line bg-zinc-50/70 font-semibold text-ink">
                  <td className="px-4 py-3" colSpan={6}>Total · {period} <span className="font-normal text-ink-muted">· {rows.length} payment{rows.length === 1 ? "" : "s"}</span></td>
                  <td className="tabular whitespace-nowrap px-4 py-3 text-right">{money(total, cur)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
