import Link from "next/link";
import { requireOrg } from "@/lib/context";
import { fmtDateTime, money } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import { attribute, readTemplates } from "@/lib/accounts/core";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

/** How the chasing emails are doing: opened, pay link clicked, and money paid after each one. */
export default async function AccountsResultsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { supabase, org } = await requireOrg();
  const sp = await searchParams;
  const days = [30, 90, 365].includes(Number(sp.days)) ? Number(sp.days) : 90;
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const [{ data: em }, { data: o }] = await Promise.all([
    supabase.from("collection_emails").select("id, customer_id, invoice_id, kind, template, subject, sent_at, opened_at, clicked_at, balance_at_send, customer:customers(name)").eq("organisation_id", org.id).gte("sent_at", since).order("sent_at", { ascending: false }).limit(3000),
    supabase.from("organisations").select("settings").eq("id", org.id).single(),
  ]);
  type Em = { id: string; customer_id: string; invoice_id: string | null; kind: string; template: string | null; subject: string | null; sent_at: string; opened_at: string | null; clicked_at: string | null; balance_at_send: number | null; customer: { name: string } | null };
  const emails = (em ?? []) as unknown as Em[];
  const invIds = [...new Set(emails.map((e) => e.invoice_id).filter((x): x is string => !!x))];
  const pays: { invoice_id: string; amount: number; paid_at: string }[] = [];
  for (let i = 0; i < invIds.length; i += 200) {
    const { data } = await supabase.from("payments").select("invoice_id, amount, paid_at").in("invoice_id", invIds.slice(i, i + 200)).gte("paid_at", since);
    pays.push(...((data ?? []) as { invoice_id: string; amount: number }[] as { invoice_id: string; amount: number; paid_at: string }[]).map((p) => ({ ...p, amount: Number(p.amount) })));
  }
  const rec = attribute(emails, pays);
  const names = new Map(readTemplates(o?.settings).map((t) => [t.key, t.name]));
  const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");
  const sum = (l: Em[]) => ({ sent: l.length, opened: l.filter((e) => e.opened_at).length, clicked: l.filter((e) => e.clicked_at).length, paid: l.filter((e) => (rec.get(e.id) ?? 0) > 0).length, money: l.reduce((a, e) => a + (rec.get(e.id) ?? 0), 0) });
  const all = sum(emails);
  const byTpl = [...new Set(emails.map((e) => e.template ?? "custom"))].map((k) => ({ k, ...sum(emails.filter((e) => (e.template ?? "custom") === k)) })).sort((a, b) => b.money - a.money);
  const cur = org.currency;
  return (
    <>
      <PageHeader eyebrow="Accounts" title="Email results" subtitle="Every chasing email: whether it was opened, whether they clicked to pay, and what was paid after it (within 30 days)." />
      <div className="mb-4 flex gap-1.5">{[30, 90, 365].map((d) => <Link key={d} href={`/accounts/results?days=${d}`} className={cn("rounded-full px-3 py-1 text-[0.7812rem] font-medium", d === days ? "bg-ink text-surface" : "bg-surface text-ink-muted ring-1 ring-line")}>{d === 365 ? "Last year" : `Last ${d} days`}</Link>)}</div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[["Emails sent", String(all.sent)], ["Opened", pct(all.opened, all.sent)], ["Clicked to pay", pct(all.clicked, all.sent)], ["Paid after", pct(all.paid, all.sent)], ["Money recovered", money(all.money, cur, { cents: false })]].map(([l, v]) => (
          <Card key={l} className="p-4"><p className="text-[0.75rem] font-medium text-ink-muted">{l}</p><p className="mt-1 text-[1.5rem] font-semibold tabular-nums text-ink">{v}</p></Card>
        ))}
      </div>
      <p className="mt-2 text-[0.75rem] text-ink-faint">Opens are a lower bound — some email apps block the tiny image that tells us. A click on the pay link counts as an open.</p>
      {!emails.length ? <Card className="mt-5"><EmptyState title="No chasing emails yet">Send one from a customer on the Money owing tab.</EmptyState></Card> : <>
        <Card className="mt-5">
          <CardHeader title="By template" />
          <div className="overflow-x-auto border-t border-line">
            <table className="w-full min-w-[560px] text-[0.8125rem]">
              <thead><tr className="border-b border-line text-left text-[0.75rem] text-ink-muted"><th className="px-4 py-2 font-medium">Template</th><th className="px-2 py-2 text-right font-medium">Sent</th><th className="px-2 py-2 text-right font-medium">Opened</th><th className="px-2 py-2 text-right font-medium">Clicked</th><th className="px-2 py-2 text-right font-medium">Paid after</th><th className="px-4 py-2 text-right font-medium">Recovered</th></tr></thead>
              <tbody>{byTpl.map((r) => <tr key={r.k} className="border-b border-line last:border-0"><td className="px-4 py-2 font-medium">{names.get(r.k) ?? r.k}</td><td className="px-2 py-2 text-right tabular-nums">{r.sent}</td><td className="px-2 py-2 text-right tabular-nums">{pct(r.opened, r.sent)}</td><td className="px-2 py-2 text-right tabular-nums">{pct(r.clicked, r.sent)}</td><td className="px-2 py-2 text-right tabular-nums">{pct(r.paid, r.sent)}</td><td className="px-4 py-2 text-right font-semibold tabular-nums">{money(r.money, cur)}</td></tr>)}</tbody>
            </table>
          </div>
        </Card>
        <Card className="mt-5">
          <CardHeader title="Every email" />
          <ul className="divide-y divide-line border-t border-line">
            {emails.slice(0, 200).map((e) => (
              <li key={e.id}><Link href={`/accounts/${e.customer_id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2.5 text-[0.8125rem] hover:bg-zinc-50">
                <span className="min-w-0 flex-1 basis-56"><span className="font-medium text-ink">{e.customer?.name ?? "Client"}</span><span className="block truncate text-[0.75rem] text-ink-faint">{e.subject} · {fmtDateTime(e.sent_at, org.timezone)}</span></span>
                <span className={e.opened_at ? "text-emerald-700" : "text-ink-faint"}>{e.opened_at ? "Opened" : "Not opened"}</span>
                <span className={e.clicked_at ? "text-emerald-700" : "text-ink-faint"}>{e.clicked_at ? "Clicked" : "No click"}</span>
                <span className="w-24 text-right font-semibold tabular-nums">{(rec.get(e.id) ?? 0) > 0 ? <span className="text-emerald-700">+{money(rec.get(e.id)!, cur)}</span> : <span className="font-normal text-ink-faint">—</span>}</span>
              </Link></li>
            ))}
          </ul>
        </Card>
      </>}
    </>
  );
}
