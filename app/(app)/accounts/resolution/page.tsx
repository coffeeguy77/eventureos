import Link from "next/link";
import { getMembers, requireOrg } from "@/lib/context";
import { fmtDate, money, todayISO } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Card, EmptyState } from "@/components/ui/card";
import { daysBetween } from "@/lib/accounts/core";
import { Decide } from "@/components/accounts/resolution-tools";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";
export const metadata = { title: "Resolution centre" };

const STATUS: Record<string, { label: string; tone: string }> = {
  open: { label: "Needs a decision", tone: "bg-violet-100 text-violet-800" },
  investigating: { label: "Investigating", tone: "bg-sky-100 text-sky-800" },
  write_off: { label: "Write off", tone: "bg-rose-100 text-rose-800" },
  keep_chasing: { label: "Keep chasing", tone: "bg-amber-100 text-amber-900" },
  resolved: { label: "Resolved", tone: "bg-emerald-100 text-emerald-800" },
};
const TABS = [{ key: "open", label: "To decide" }, { key: "investigating", label: "Investigating" }, { key: "write_off", label: "To write off" }, { key: "done", label: "Decided" }] as const;

type Issue = {
  id: string; customer_id: string; invoice_id: string | null; reason: string; amount: number | null; status: string; decision_note: string | null;
  raised_by: string | null; decided_by: string | null; decided_at: string | null; created_at: string;
  customer: { name: string } | null; invoice: { number: string; balance: number; due_date: string | null; status: string; origin: string | null } | null;
};

/** Invoices the accounts person has flagged: decide whether to write off, investigate or keep chasing. */
export default async function ResolutionPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { supabase, org } = await requireOrg();
  const sp = await searchParams;
  const tab = TABS.find((x) => x.key === sp.t)?.key ?? "open";
  const today = todayISO(org.timezone);
  const [{ data, error }, members] = await Promise.all([
    supabase.from("account_issues").select("id, customer_id, invoice_id, reason, amount, status, decision_note, raised_by, decided_by, decided_at, created_at, customer:customers(name), invoice:invoices(number, balance, due_date, status, origin)")
      .eq("organisation_id", org.id).order("created_at", { ascending: false }).limit(500),
    getMembers(org.id),
  ]);
  const who = (id: string | null) => (id ? members.find((m) => m.id === id)?.full_name ?? "Team" : "—");
  if (error && /does not exist|could not find/i.test(error.message)) {
    return (
      <>
        <PageHeader eyebrow="Accounts" title="Resolution centre" />
        <Card className="p-6 text-[0.875rem] text-ink-muted">The resolution centre needs its database update first: run <span className="font-mono">supabase/migrations/0078_accounts_resolution.sql</span> in Supabase (SQL editor), then refresh.</Card>
      </>
    );
  }
  const all = (data ?? []) as unknown as Issue[];
  const count = (k: string) => all.filter((x) => (k === "done" ? ["keep_chasing", "resolved"].includes(x.status) : x.status === k)).length;
  const list = all.filter((x) => (tab === "done" ? ["keep_chasing", "resolved"].includes(x.status) : x.status === tab));
  const writeOffTotal = all.filter((x) => x.status === "write_off").reduce((a, x) => a + Number(x.invoice?.balance ?? x.amount ?? 0), 0);
  const cur = org.currency;

  return (
    <>
      <PageHeader eyebrow="Accounts" title="Resolution centre" subtitle="Invoices flagged for a decision — write it off, look into it, or keep chasing. Flagged accounts stay off the Call next list until they're decided." />
      <div className="no-scrollbar mb-3 flex items-center gap-1.5 overflow-x-auto">
        {TABS.map((x) => <Link key={x.key} href={`/accounts/resolution?t=${x.key}`} className={cn("shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-[0.7812rem] font-medium", tab === x.key ? "bg-ink text-surface" : "bg-surface text-ink-muted ring-1 ring-line hover:text-ink")}>{x.label} <span className="tabular-nums opacity-70">{count(x.key)}</span></Link>)}
        {writeOffTotal > 0 && <span className="ml-auto shrink-0 text-[0.75rem] text-ink-muted">To write off: <strong className="text-rose-700">{money(writeOffTotal, cur)}</strong></span>}
      </div>
      <Card>
        {!list.length ? <EmptyState title={tab === "open" ? "Nothing waiting for a decision" : "Nothing here"}>{tab === "open" ? "Flag an invoice from a customer's account page when it needs a call on whether to write it off or investigate." : "Try another tab."}</EmptyState> : (
          <ul className="divide-y divide-line">
            {list.map((x) => {
              const st = STATUS[x.status] ?? STATUS.open;
              const late = x.invoice?.due_date && x.invoice.due_date < today ? daysBetween(x.invoice.due_date, today) : 0;
              const paid = x.invoice && Number(x.invoice.balance) <= 0;
              return (
                <li key={x.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-[0.875rem]">
                        <Link href={`/accounts/${x.customer_id}`} className="font-semibold text-ink hover:text-brand-700 hover:underline">{x.customer?.name ?? "Customer"}</Link>
                        <span className={cn("rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold", st.tone)}>{st.label}</span>
                        {paid && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[0.6875rem] font-semibold text-emerald-800">Since paid</span>}
                      </p>
                      <p className="mt-0.5 text-[0.75rem] text-ink-faint">
                        {x.invoice ? <><Link href={`/invoices/${x.invoice_id}`} className="hover:underline">{x.invoice.number}</Link>{late ? ` · ${late} days overdue` : ""}{x.invoice.origin === "xero" ? " · from Xero" : ""}</> : "Whole account"} · flagged {fmtDate(x.created_at.slice(0, 10), "short")} by {who(x.raised_by)}
                      </p>
                      <p className="mt-2 whitespace-pre-line text-[0.8125rem] text-ink">{x.reason}</p>
                      {x.decision_note && <p className="mt-1.5 text-[0.8125rem] text-ink-muted"><span className="font-medium">{who(x.decided_by)}</span>{x.decided_at ? ` (${fmtDate(x.decided_at.slice(0, 10), "short")})` : ""}: {x.decision_note}</p>}
                      {x.status === "write_off" && x.invoice && !paid && (
                        <p className="mt-1.5 text-[0.75rem] text-rose-800">To finish: {x.invoice.origin === "xero" ? "credit or void it in Xero (it syncs back here)" : <>credit it on the <Link href={`/invoices/${x.invoice_id}`} className="font-semibold underline">invoice page</Link></>}, then mark this Resolved.</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-[1rem] font-semibold tabular-nums text-ink">{money(Number(x.invoice?.balance ?? x.amount ?? 0), cur)}</p>
                      {x.amount != null && x.invoice && Number(x.invoice.balance) !== Number(x.amount) && <p className="text-[0.6875rem] text-ink-faint">{money(Number(x.amount), cur)} when flagged</p>}
                    </div>
                  </div>
                  {x.status !== "resolved" && <Decide id={x.id} current={x.status} />}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
