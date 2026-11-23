import Link from "next/link";
import { canManage, requireOrg } from "@/lib/context";
import { fmtDate, money } from "@/lib/format";
import { blockBalance, fmtHours, readCare } from "@/lib/nerdherd/care";
import { readNerd } from "@/lib/nerdherd/core";
import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CareSettingsForm, GiveHours, VoidBlockButton } from "@/components/nerdherd/care-tools";
import { allPages } from "@/lib/supabase/all-pages";
import { CarePlans } from "@/components/nerdherd/care-plans";

export const dynamic = "force-dynamic";

type B = { id: string; customer_id: string; hours: number; price_ex_gst: number; label: string | null; status: string; created_at: string; invoice_id: string | null; customers: { name: string } | null; invoices: { number: string | null; status: string; balance: number | null } | null };
type U = { ticket_id: string; customer_id: string; minutes_logged: number; minutes_charged: number; updated_at: string; support_tickets: { number: number; subject: string; status: string } | null };

/** Care Hub: every client's prepaid hours, the requests using them, the blocks on sale and the Google Ads add-on. */
export default async function CareHub() {
  const { supabase, org, role } = await requireOrg();
  const manage = canManage(role);
  const [b, u, { data: clients }] = await Promise.all([
    supabase.from("nh_blocks").select("id, customer_id, hours, price_ex_gst, label, status, created_at, invoice_id, customers(name), invoices(number, status, balance)").eq("organisation_id", org.id).neq("status", "void").order("created_at", { ascending: false }).limit(2000),
    supabase.from("nh_block_usage").select("ticket_id, customer_id, minutes_logged, minutes_charged, updated_at, support_tickets(number, subject, status)").eq("organisation_id", org.id).order("updated_at", { ascending: false }).limit(2000),
    allPages((a, z) => supabase.from("customers").select("id, name").eq("organisation_id", org.id).order("name").order("id").range(a, z)),
  ]);
  const care = readCare(org.settings);
  const nerd = readNerd(org.settings);
  const settings = manage && <Card><CardHeader title="Settings" subtitle="What clients can buy in their portal." /><div className="border-t border-line px-5 py-4"><CareSettingsForm initial={care} rate={nerd.hourlyRate} currency={org.currency} /></div></Card>;
  if (b.error) {
    return <div className="space-y-5"><Card><EmptyState title="Run the Care Hub update first">Open Supabase → SQL editor and run supabase/migrations/0115_care_hub.sql. Then this page shows every client&apos;s prepaid hours.</EmptyState></Card>{settings}</div>;
  }
  const blocks = ((b.data ?? []) as unknown as B[]).map((x) => {
    const dead = x.invoices?.status === "void";
    const paid = !dead && (!x.invoices || x.invoices.status === "paid" || (x.invoices.status !== "draft" && Number(x.invoices.balance ?? 0) <= 0.009));
    return { ...x, hours: Number(x.hours), paid, status: dead ? "void" : x.status };
  }).filter((x) => x.status !== "void");
  const usage = (u.data ?? []) as unknown as U[];
  const ids = [...new Set([...blocks.map((x) => x.customer_id), ...usage.map((x) => x.customer_id)])];
  const names = new Map(((clients ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
  const rows = ids.map((id) => {
    const bal = blockBalance(blocks.filter((x) => x.customer_id === id), usage.filter((x) => x.customer_id === id));
    const last = usage.find((x) => x.customer_id === id);
    return { id, name: names.get(id) ?? "Client", ...bal, last };
  }).sort((a, z) => a.leftMin - z.leftMin);
  const sold = blocks.filter((x) => x.paid && x.price_ex_gst > 0).reduce((a, x) => a + Number(x.price_ex_gst), 0);
  const outstanding = rows.reduce((a, r) => a + Math.max(0, r.leftMin), 0);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        {[["Clients with hours", String(rows.length)], ["Hours owed to clients", fmtHours(outstanding)], ["Blocks paid (ex GST)", money(sold, org.currency, { cents: false })]].map(([k, v]) => (
          <Card key={k} className="px-5 py-4"><p className="text-[0.75rem] text-ink-muted">{k}</p><p className="mt-1 text-[1.375rem] font-semibold text-ink">{v}</p></Card>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <CarePlans db={supabase} orgId={org.id} currency={org.currency} tz={org.timezone} />
          <Card>
            <CardHeader title="Prepaid hours by client" subtitle="Lowest first — anyone over their hours is at the top. Time logged on a “prepaid hours” ticket comes off here." />
            {rows.length ? (
              <div className="overflow-x-auto border-t border-line">
                <table className="w-full min-w-[640px] text-[0.8125rem]">
                  <thead className="text-left text-[0.7188rem] uppercase tracking-wide text-ink-faint"><tr><th className="px-5 py-2 font-medium">Client</th><th className="px-3 py-2 font-medium">Left</th><th className="px-3 py-2 font-medium">Used</th><th className="px-3 py-2 font-medium">Bought</th><th className="px-3 py-2 font-medium">Waiting on payment</th><th className="px-5 py-2 font-medium">Last request</th></tr></thead>
                  <tbody className="divide-y divide-line">
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td className="px-5 py-2.5"><Link href={`/clients/${r.id}?tab=web`} className="font-medium text-ink hover:underline">{r.name}</Link></td>
                        <td className={`px-3 py-2.5 font-semibold ${r.leftMin < 0 ? "text-rose-600" : r.leftMin < 60 ? "text-amber-600" : "text-ink"}`}>{fmtHours(r.leftMin)}</td>
                        <td className="px-3 py-2.5 text-ink-muted">{fmtHours(r.usedMin)}</td>
                        <td className="px-3 py-2.5 text-ink-muted">{fmtHours(r.boughtMin)}</td>
                        <td className="px-3 py-2.5">{r.pendingMin ? <Badge tone="amber">{fmtHours(r.pendingMin)}</Badge> : <span className="text-ink-faint">—</span>}</td>
                        <td className="px-5 py-2.5">{r.last?.support_tickets ? <Link href={`/nerd-herd/tickets/${r.last.ticket_id}`} className="hover:underline">#{r.last.support_tickets.number} {r.last.support_tickets.subject}</Link> : <span className="text-ink-faint">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <EmptyState title="No prepaid hours yet">Clients buy blocks in their portal, or you can add hours for them here.</EmptyState>}
          </Card>
          <Card>
            <CardHeader title="Blocks" subtitle="Bought in the portal (with an invoice) or added by hand." />
            {blocks.length ? (
              <ul className="divide-y divide-line border-t border-line">
                {blocks.slice(0, 200).map((x) => (
                  <li key={x.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5 text-[0.8125rem]">
                    <span className="min-w-0"><span className="font-medium text-ink">{x.customers?.name ?? "Client"}</span> · {x.hours} h{x.price_ex_gst > 0 ? ` · ${money(x.price_ex_gst, org.currency)} + GST` : " · added by hand"}<span className="block truncate text-ink-muted">{fmtDate(x.created_at)}{x.invoice_id ? <> · <Link href={`/invoices/${x.invoice_id}`} className="hover:underline">invoice {x.invoices?.number}</Link></> : x.label ? ` · ${x.label}` : ""}</span></span>
                    <span className="flex items-center gap-3">{x.paid ? <Badge tone="green">Counting</Badge> : <Badge tone="amber">Awaiting payment</Badge>}{manage && !x.invoice_id && <VoidBlockButton id={x.id} />}</span>
                  </li>
                ))}
              </ul>
            ) : <EmptyState title="No blocks yet" />}
          </Card>
        </div>
        <div className="space-y-5">
          {manage && <Card><CardHeader title="Add hours by hand" subtitle="For hours a client prepaid before the Care Hub, or a goodwill top-up. No invoice is raised." /><div className="border-t border-line px-5 py-4"><GiveHours clients={(clients ?? []) as { id: string; name: string }[]} /></div></Card>}
          {settings}
        </div>
      </div>
    </div>
  );
}
