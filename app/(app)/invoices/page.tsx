import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { canManage, requireOrg } from "@/lib/context";
import { Card, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { FilterBar } from "@/components/records/filter-bar";
import { Kpi } from "@/components/records/kpi";
import { INVOICE_STATUS } from "@/lib/status";
import { daysBetween, fmtDate, fmtDateTime, money, monthBoundsUTC, relative, todayISO } from "@/lib/format";
import type { InvoiceStatus } from "@/lib/types";
import { cn } from "@/lib/cn";

export const metadata = { title: "Invoices" };

const STATUSES: InvoiceStatus[] = ["draft", "awaiting_payment", "part_paid", "paid", "overdue", "void"];
const OPEN: InvoiceStatus[] = ["awaiting_payment", "part_paid", "overdue"];

type Row = {
  id: string; number: string; kind: string; issue_date: string; due_date: string | null; total: number; amount_paid: number; balance: number;
  status: InvoiceStatus; xero_invoice_id: string | null; xero_synced_at: string | null; event_id: string | null;
  origin?: string; quote_id: string | null; created_by: string | null;
  emailed_at?: string | null; view_count?: number; last_viewed_at?: string | null; reminders?: { key: string; at: string }[];
  customer: { id: string; name: string } | null; event: { id: string; number: number; name: string } | null;
};

/** Raised in EventureOS (quotes, bookings, by hand) — or brought in from Xero's history. Before the 0058 update, guessed. */
const fromXero = (i: Row) => (i.origin ? i.origin === "xero" : !!i.xero_invoice_id && !i.quote_id && !i.created_by && i.kind === "other");

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; src?: string }> }) {
  const sp = await searchParams;
  const { supabase, org, role } = await requireOrg();
  const tz = org.timezone;
  const cur = org.currency;
  const today = todayISO(tz);
  const month = monthBoundsUTC(tz);
  const status = STATUSES.includes(sp.status as InvoiceStatus) ? (sp.status as InvoiceStatus) : null;
  // Two lists: invoices raised here (the default — Xero ones sent from here get a Xero pill), and everything in Xero
  const src: "eventureos" | "xero" = sp.src === "xero" ? "xero" : "eventureos";
  const cols = "id, number, kind, issue_date, due_date, total, amount_paid, balance, status, xero_invoice_id, xero_synced_at, event_id, quote_id, created_by, customer:customers(id, name), event:events(id, number, name)";
  const listQuery = (withOrigin: boolean) => {
    let q = supabase.from("invoices").select(withOrigin ? `${cols}, origin, emailed_at, view_count, last_viewed_at, reminders` : cols).eq("organisation_id", org.id);
    if (src === "xero") q = q.not("xero_invoice_id", "is", null);
    else if (withOrigin) q = q.eq("origin", "eventureos");
    return q.order("issue_date", { ascending: false }).order("created_at", { ascending: false }).limit(2000);
  };

  const [invRes, payRes, xeroRes] = await Promise.all([
    listQuery(true).then((r) => (r.error && /origin|emailed_at|view_count|last_viewed_at|reminders/.test(r.error.message) ? listQuery(false) : r)),
    supabase.from("payments").select("amount, invoice:invoices(id, xero_invoice_id, quote_id, created_by, kind)").eq("organisation_id", org.id).gte("paid_at", month.start).lt("paid_at", month.end),
    supabase.from("integrations").select("status, last_sync_at, last_sync_status, last_error, account_label").eq("organisation_id", org.id).eq("provider", "xero").maybeSingle(),
  ]);
  if (invRes.error) throw new Error(`Could not load invoices: ${invRes.error.message}`);
  if (payRes.error) throw new Error(`Could not load payments: ${payRes.error.message}`);
  if (xeroRes.error) throw new Error(`Could not load Xero status: ${xeroRes.error.message}`);

  const all = ((invRes.data ?? []) as unknown as Row[]).filter((i) => (src === "xero" ? true : !fromXero(i)));
  const shown = new Set(all.map((i) => i.id));
  const xero = xeroRes.data;
  const xeroConnected = xero?.status === "connected" || xero?.status === "syncing";

  const pastDue = (i: Row) => OPEN.includes(i.status) && !!i.due_date && i.due_date < today && Number(i.balance) > 0;
  const openInv = all.filter((i) => OPEN.includes(i.status));
  const overdue = all.filter((i) => i.status === "overdue" || pastDue(i));
  const outstanding = openInv.reduce((s, i) => s + Number(i.balance), 0);
  const overdueTotal = overdue.reduce((s, i) => s + Number(i.balance), 0);
  const paidMonth = ((payRes.data ?? []) as unknown as { amount: number; invoice: { id: string } | null }[])
    .filter((p) => (p.invoice ? shown.has(p.invoice.id) : src === "eventureos")).reduce((s, p) => s + Number(p.amount), 0);
  const counts = Object.fromEntries(STATUSES.map((s) => [s, all.filter((i) => i.status === s).length])) as Record<InvoiceStatus, number>;

  const term = (sp.q ?? "").trim().toLowerCase();
  const rows = all.filter((i) =>
    (!status || i.status === status) &&
    (!term || [i.number, i.customer?.name, i.event?.name, i.event ? `ev-${i.event.number}` : null].some((v) => v?.toLowerCase().includes(term))));
  const counted = rows.filter((i) => i.status !== "void");
  const totals = counted.reduce((t, i) => ({ total: t.total + Number(i.total), paid: t.paid + Number(i.amount_paid), balance: t.balance + Number(i.balance) }), { total: 0, paid: 0, balance: 0 });

  const pill = (key: string | null, label: string, count: number) => {
    const qs = new URLSearchParams();
    if (src === "xero") qs.set("src", "xero");
    if (key) qs.set("status", key);
    if (sp.q) qs.set("q", sp.q);
    const on = status === key;
    return (
      <Link key={key ?? "all"} href={`/invoices${qs.size ? `?${qs}` : ""}`}
        className={cn("flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.7812rem] font-medium",
          on ? "bg-ink text-surface" : "bg-surface text-ink-muted ring-1 ring-inset ring-line hover:text-ink")}>
        {label}
        <span className={cn("rounded-full px-1.5 text-[0.6562rem] font-semibold",
          on ? "bg-surface/20 text-surface" : key === "overdue" && count > 0 ? "bg-rose-100 text-rose-700" : "bg-zinc-100 text-ink-faint")}>{count}</span>
      </Link>
    );
  };

  return (
    <div>
      <PageHeader title="Invoices" subtitle="What’s been billed, what’s been paid and what’s still owed."
        actions={canManage(role) ? <ButtonLink href="/invoices/new" variant="primary">New invoice</ButtonLink> : undefined} />

      <div className={cn("mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-4 py-2.5 text-[0.7812rem]",
        xeroConnected ? "border-emerald-200 bg-emerald-50/60" : xero?.status === "error" ? "border-rose-200 bg-rose-50/60" : "border-line bg-surface")}>
        <RefreshCw className={cn("h-4 w-4 shrink-0", xeroConnected ? "text-emerald-600" : "text-ink-faint")} />
        {xeroConnected ? (
          <>
            <span className="font-semibold uppercase tracking-wide text-emerald-800">Synced with Xero</span>
            <span className="min-w-0 break-words text-emerald-900/80">
              {xero?.last_sync_at ? <>Last synchronised {relative(xero.last_sync_at)} · {fmtDateTime(xero.last_sync_at, tz)}</> : "Waiting for the first sync"}
              {xero?.account_label ? ` · ${xero.account_label}` : ""}
            </span>
            <span className="text-emerald-900/70 sm:ml-auto">Xero is authoritative for amounts and payment status.</span>
          </>
        ) : xero?.status === "error" ? (
          <>
            <span className="font-semibold text-rose-800">Xero sync error</span>
            <span className="min-w-0 break-words text-rose-800/80">{xero.last_error ?? "The last sync failed."}{xero.last_sync_at ? ` · last successful sync ${relative(xero.last_sync_at)}` : ""}</span>
          </>
        ) : (
          <>
            <span className="font-semibold text-ink">Xero not connected</span>
            <span className="text-ink-muted">Invoices and payments are managed in EventureOS until Xero is connected. <Link href="/settings/integrations" className="font-medium text-brand-700 underline underline-offset-2">Connect Xero</Link></span>
          </>
        )}
      </div>

      <div className="mb-4 flex gap-1 border-b border-line" role="tablist" aria-label="Which invoices">
        {([["eventureos", "Our invoices", "Raised in EventureOS"], ["xero", "Xero", "Everything in Xero, including history"]] as const).map(([k, label, hint]) => (
          <Link key={k} href={k === "xero" ? "/invoices?src=xero" : "/invoices"} role="tab" aria-selected={src === k} title={hint}
            className={cn("-mb-px border-b-2 px-3 py-2 text-[0.8438rem] font-medium", src === k ? "border-brand-600 text-ink" : "border-transparent text-ink-muted hover:text-ink")}>
            {label}
          </Link>
        ))}
        <span className="ml-auto hidden self-center text-[0.75rem] text-ink-faint sm:block">
          {src === "xero" ? "Every invoice in Xero — history and the ones sent from here." : "Invoices raised here. A Xero pill means it's been sent to Xero too."}
        </span>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi label="Outstanding" value={money(outstanding, cur)} sub={`${openInv.length} open invoice${openInv.length === 1 ? "" : "s"}`} href={`/invoices?${src === "xero" ? "src=xero&" : ""}status=awaiting_payment`} />
        <Kpi label="Overdue" value={money(overdueTotal, cur)} alert={overdue.length > 0} sub={overdue.length ? `${overdue.length} invoice${overdue.length === 1 ? "" : "s"} past due` : "Nothing overdue"} href={`/invoices?${src === "xero" ? "src=xero&" : ""}status=overdue`} />
        <Kpi label={`Paid · ${month.label}`} value={money(paidMonth, cur)} sub="Payments received this month" href="/payments" />
      </div>

      <div className="no-scrollbar -mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:pb-0">
        {pill(null, "All", all.length)}
        {STATUSES.map((s) => pill(s, INVOICE_STATUS[s].label, counts[s]))}
      </div>

      <Card>
        <div className="border-b border-line px-4 py-3">
          <FilterBar filters={[]} searchPlaceholder="Search invoice #, customer or event…" />
        </div>
        {rows.length === 0 ? (
          <EmptyState title={all.length ? "No invoices match" : "No invoices yet"}>
            {all.length ? "Try a different status or search." : src === "xero" ? "Nothing from Xero yet — connect Xero in Settings → Integrations." : "Invoices are raised automatically when a quote is accepted, or you can create one."}
          </EmptyState>
        ) : (
          <>
          <ul className="divide-y divide-line md:hidden">
            {rows.map((i) => {
              const late = i.status === "overdue" || pastDue(i);
              const lateDays = late && i.due_date ? daysBetween(i.due_date, today) : 0;
              const s = INVOICE_STATUS[i.status];
              return (
                <li key={i.id} className={cn(late && "bg-rose-50/40")}>
                  <Link href={`/invoices/${i.id}`} className="flex min-h-[56px] items-start gap-3 px-4 py-3 active:bg-zinc-50">
                    <div className="min-w-0 flex-1">
                      <div className={cn("truncate text-[0.8438rem] font-medium", i.status === "void" ? "text-ink-faint line-through" : "text-ink")}>
                        {i.number}{src === "eventureos" && i.xero_invoice_id && <XeroPill />} <span className="font-normal text-ink-muted">· {i.customer?.name ?? "—"}</span>
                      </div>
                      {i.event && <div className="truncate text-[0.7812rem] text-ink-muted">{i.event.name}</div>}
                      <div className={cn("mt-0.5 truncate text-[0.75rem]", late ? "font-medium text-rose-700" : "text-ink-faint")}>
                        Due {fmtDate(i.due_date)}{late && lateDays > 0 ? ` · ${lateDays}d overdue` : ""}
                      </div>
                      <SentLine i={i} />
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className={cn("tabular text-[0.8125rem] font-medium", late ? "text-rose-700" : i.status === "void" ? "text-ink-faint" : "text-ink")}>{money(i.balance, cur)}</span>
                      <Badge tone={s.tone} dot>{s.label}</Badge>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="flex items-center justify-between gap-3 border-t-2 border-line bg-zinc-50/70 px-4 py-3 text-[0.8125rem] font-semibold text-ink md:hidden">
            <span className="min-w-0">Balance <span className="font-normal text-ink-muted">· {counted.length} invoice{counted.length === 1 ? "" : "s"}</span></span>
            <span className="tabular shrink-0">{money(totals.balance, cur)}</span>
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[980px] text-left text-[0.8125rem]">
              <thead>
                <tr className="border-b border-line text-[0.7188rem] uppercase tracking-wide text-ink-faint">
                  {["Invoice #", "Customer", "Event", "Date", "Due", "Amount", "Paid", "Balance", "Status"].map((h) => (
                    <th key={h} className={cn("whitespace-nowrap px-4 py-2.5 font-medium", ["Amount", "Paid", "Balance"].includes(h) && "text-right")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((i) => {
                  const late = i.status === "overdue" || pastDue(i);
                  const lateDays = late && i.due_date ? daysBetween(i.due_date, today) : 0;
                  const s = INVOICE_STATUS[i.status];
                  return (
                    <tr key={i.id} className={cn("relative hover:bg-zinc-50/70", late && "bg-rose-50/40 hover:bg-rose-50/70", i.status === "void" && "text-ink-faint")}>
                      <td className="whitespace-nowrap px-4 py-3">
                        <Link href={`/invoices/${i.id}`} className={cn("font-medium after:absolute after:inset-0", i.status === "void" ? "text-ink-faint line-through" : "text-ink")}>{i.number}</Link>
                        {src === "eventureos" && i.xero_invoice_id && <XeroPill />}
                        {src === "xero" && !fromXero(i) && <span className="ml-1.5 inline-flex items-center rounded-full bg-brand-50 px-1.5 py-px align-middle text-[0.625rem] font-semibold uppercase tracking-wide text-brand-700 ring-1 ring-inset ring-brand-100" title="Raised in EventureOS">Ours</span>}
                        <SentLine i={i} />
                      </td>
                      <td className="max-w-[200px] truncate px-4 py-3 text-ink">{i.customer?.name ?? "—"}</td>
                      <td className="max-w-[220px] truncate px-4 py-3 text-ink-muted">{i.event?.name ?? "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-ink-muted">{fmtDate(i.issue_date)}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className={cn(late ? "font-medium text-rose-700" : "text-ink-muted")}>{fmtDate(i.due_date)}</span>
                        {late && lateDays > 0 && <span className="block text-[0.7188rem] text-rose-700">{lateDays}d overdue</span>}
                      </td>
                      <td className="tabular whitespace-nowrap px-4 py-3 text-right text-ink">{money(i.total, cur)}</td>
                      <td className="tabular whitespace-nowrap px-4 py-3 text-right text-ink-muted">{money(i.amount_paid, cur)}</td>
                      <td className={cn("tabular whitespace-nowrap px-4 py-3 text-right font-medium", late ? "text-rose-700" : "text-ink")}>{money(i.balance, cur)}</td>
                      <td className="px-4 py-3"><Badge tone={s.tone} dot>{s.label}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-line bg-zinc-50/70 text-[0.8125rem] font-semibold text-ink">
                  <td className="px-4 py-3" colSpan={5}>
                    Total <span className="font-normal text-ink-muted">· {counted.length} invoice{counted.length === 1 ? "" : "s"}{rows.length !== counted.length ? " (void excluded)" : ""}</span>
                  </td>
                  <td className="tabular whitespace-nowrap px-4 py-3 text-right">{money(totals.total, cur)}</td>
                  <td className="tabular whitespace-nowrap px-4 py-3 text-right">{money(totals.paid, cur)}</td>
                  <td className="tabular whitespace-nowrap px-4 py-3 text-right">{money(totals.balance, cur)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          </>
        )}
      </Card>
    </div>
  );
}

/** "Sent to Xero" marker on an invoice raised in EventureOS. */
function XeroPill() {
  return <span className="ml-1.5 inline-flex items-center rounded-full bg-sky-50 px-1.5 py-px align-middle text-[0.625rem] font-semibold uppercase tracking-wide text-sky-700 ring-1 ring-inset ring-sky-100" title="Sent to Xero">Xero</span>;
}

/** "Emailed 19 Oct · Viewed 2× · 1 reminder" — or "Not sent yet" (for invoices raised here). */
function SentLine({ i }: { i: Row }) {
  if (i.emailed_at === undefined) return null; // before the database update
  const fromXero = i.origin === "xero";
  if (fromXero) return <span className="block text-[0.7188rem] text-ink-faint">From Xero</span>;
  if (i.status === "void") return null;
  const d = (x: string) => new Date(x).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "Australia/Sydney" });
  const rem = Array.isArray(i.reminders) ? i.reminders.length : 0;
  if (!i.emailed_at) return <span className={cn("block text-[0.7188rem] font-medium", i.status === "paid" ? "text-ink-faint" : "text-amber-700")}>{i.status === "paid" ? "Paid" : "Not sent yet"}</span>;
  return (
    <span className="block text-[0.7188rem] text-ink-faint">
      Emailed {d(i.emailed_at)}
      {i.view_count ? <span className="text-emerald-700"> · Viewed{i.view_count > 1 ? ` ${i.view_count}×` : ""}{i.last_viewed_at ? ` ${d(i.last_viewed_at)}` : ""}</span> : <span> · Not opened</span>}
      {rem ? ` · ${rem} reminder${rem === 1 ? "" : "s"}` : ""}
    </span>
  );
}
