import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, Mail, Phone } from "lucide-react";
import { canManage, getMembers, requireOrg } from "@/lib/context";
import { Card, CardHeader, EmptyState, Field } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActivityFeed } from "@/components/records/activity-feed";
import { NextActionBanner } from "@/components/records/next-action";
import type { NextAction } from "@/lib/next-action";
import { INVOICE_STATUS, QUOTE_STATUS } from "@/lib/status";
import { daysBetween, fmtDate, fmtDateTime, money, relative, todayISO, zonedTimeUTC } from "@/lib/format";
import type { ActivityLog, InvoiceStatus, QuoteStatus } from "@/lib/types";
import { cn } from "@/lib/cn";
import { InvoiceActions } from "./controls";

export const metadata = { title: "Invoice" };

const KIND_LABEL: Record<string, string> = { deposit: "Deposit invoice", final: "Final invoice", full: "Invoice", other: "Invoice" };

type Inv = {
  id: string; number: string; kind: string; issue_date: string; due_date: string | null; subtotal: number; tax_total: number; total: number;
  amount_paid: number; balance: number; status: InvoiceStatus; currency: string; xero_invoice_id: string | null; xero_synced_at: string | null;
  quote_id: string | null; created_at: string; updated_at: string;
  customer: { id: string; name: string; email: string | null; phone: string | null; company: string | null } | null;
  event: { id: string; number: number; name: string; event_date: string | null; venue: string | null } | null;
};
type Version = {
  id: string; version_number: number; status: QuoteStatus; total: number; subtotal: number; tax_total: number; published_at: string;
  snapshot: { sections: { title: string; items: { name: string; quantity: number; unit: string | null; line_total: number; optional: boolean }[] }[] };
  quote: { number: number; title: string } | null;
};

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, org, role } = await requireOrg();
  const tz = org.timezone;
  const today = todayISO(tz);

  const { data, error } = await supabase.from("invoices")
    .select("id, number, kind, issue_date, due_date, subtotal, tax_total, total, amount_paid, balance, status, currency, xero_invoice_id, xero_synced_at, quote_id, created_at, updated_at, customer:customers(id, name, email, phone, company), event:events(id, number, name, event_date, venue)")
    .eq("id", id).eq("organisation_id", org.id).maybeSingle();
  if (error) throw new Error(`Could not load invoice: ${error.message}`);
  if (!data) notFound();
  const inv = data as unknown as Inv;
  const cur = inv.currency || org.currency;

  const [payRes, actRes, verRes, members] = await Promise.all([
    supabase.from("payments").select("id, amount, paid_at, method, reference, xero_payment_id, created_by").eq("organisation_id", org.id).eq("invoice_id", inv.id).order("paid_at", { ascending: false }),
    supabase.from("activity_logs").select("*").eq("organisation_id", org.id).eq("entity_id", inv.id).order("created_at", { ascending: false }).limit(100),
    inv.quote_id
      ? supabase.from("quote_versions").select("id, version_number, status, total, subtotal, tax_total, published_at, snapshot, quote:quotes!quote_versions_quote_id_organisation_id_fkey(number, title)")
        .eq("organisation_id", org.id).eq("quote_id", inv.quote_id).order("version_number", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    getMembers(org.id),
  ]);
  for (const r of [payRes, actRes, verRes]) if (r.error) throw new Error(`Could not load invoice details: ${r.error.message}`);
  const payments = payRes.data ?? [];
  const activity = (actRes.data ?? []) as ActivityLog[];
  const versions = (verRes.data ?? []) as unknown as Version[];
  const version = versions.find((v) => v.status === "accepted") ?? versions[0] ?? null;
  const names = Object.fromEntries(members.map((m) => [m.id, m.full_name ?? m.email]));

  const s = INVOICE_STATUS[inv.status];
  const xeroManaged = !!inv.xero_invoice_id;
  const open = ["awaiting_payment", "part_paid", "overdue"].includes(inv.status);
  const late = open && !!inv.due_date && inv.due_date < today && Number(inv.balance) > 0;
  const lateDays = late && inv.due_date ? daysBetween(inv.due_date, today) : 0;

  const na: NextAction =
    inv.status === "void" ? { label: "Void — no action needed", urgency: "done" }
      : inv.status === "paid" || Number(inv.balance) <= 0 ? { label: "Paid in full", detail: payments[0] ? `Last payment ${fmtDateTime(payments[0].paid_at, tz, "date")}` : undefined, urgency: "done" }
        : inv.status === "draft" ? { label: "Send the invoice to the customer", detail: xeroManaged ? "Approve it in Xero" : "Mark it as sent once it’s gone out", urgency: "normal" }
          : late ? { label: `Chase payment — ${money(inv.balance, cur)} is ${lateDays} day${lateDays === 1 ? "" : "s"} overdue`, detail: inv.customer?.email ?? undefined, urgency: "overdue" }
            : {
              label: `Await payment of ${money(inv.balance, cur)}`,
              due: inv.due_date ? zonedTimeUTC(inv.due_date, "23:59", tz) : null,
              urgency: inv.due_date && daysBetween(today, inv.due_date) <= 2 ? "soon" : "normal",
            };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2 text-[12px] text-ink-faint">
            <Link href="/invoices" className="hover:text-ink">Invoices</Link><span>/</span><span>{inv.number}</span>
          </div>
          <h1 className={cn("text-[22px] font-semibold tracking-tight text-ink", inv.status === "void" && "text-ink-muted line-through")}>
            {inv.number} <span className="font-normal text-ink-muted">· {KIND_LABEL[inv.kind] ?? "Invoice"}</span>
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-muted">
            <Badge tone={s.tone} dot>{s.label}</Badge>
            {inv.customer && <Link href={`/clients/${inv.customer.id}`} className="font-medium text-ink hover:text-brand-700">{inv.customer.name}</Link>}
            <span>Issued {fmtDate(inv.issue_date)}</span>
            <span className={cn(late && "font-medium text-rose-700")}>Due {fmtDate(inv.due_date)}{late ? ` · ${lateDays}d overdue` : ""}</span>
            <span className={cn("text-[12.5px]", xeroManaged ? "text-emerald-700" : "text-ink-faint")}>
              {xeroManaged ? `Synced with Xero · ${inv.xero_synced_at ? `last sync ${relative(inv.xero_synced_at)}` : "awaiting first sync"}` : "Not in Xero"}
            </span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[11.5px] font-medium uppercase tracking-wide text-ink-faint">Balance</p>
          <p className={cn("tabular text-[24px] font-semibold tracking-tight", late ? "text-rose-700" : "text-ink")}>{money(inv.balance, cur)}</p>
        </div>
      </div>

      <NextActionBanner action={na} />

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Amounts" subtitle={xeroManaged ? "Xero is authoritative for these values" : "Prices include GST"} />
            <dl className="grid grid-cols-2 gap-4 px-5 pb-5 sm:grid-cols-5">
              <Field label="Subtotal"><span className="tabular">{money(inv.subtotal, cur)}</span></Field>
              <Field label="GST"><span className="tabular">{money(inv.tax_total, cur)}</span></Field>
              <Field label="Total"><span className="tabular font-semibold">{money(inv.total, cur)}</span></Field>
              <Field label="Paid"><span className="tabular text-emerald-700">{money(inv.amount_paid, cur)}</span></Field>
              <Field label="Balance"><span className={cn("tabular font-semibold", late && "text-rose-700")}>{money(inv.balance, cur)}</span></Field>
            </dl>
            {Number(inv.total) > 0 && (
              <div className="px-5 pb-5">
                <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, (Number(inv.amount_paid) / Number(inv.total)) * 100)}%` }} />
                </div>
                <p className="mt-1 text-[11.5px] text-ink-faint">{Math.round((Number(inv.amount_paid) / Number(inv.total)) * 100)}% paid</p>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader
              title={version?.quote ? `From quote Q-${version.quote.number} · ${version.quote.title}` : "Line summary"}
              subtitle={version ? `Version ${version.version_number} · ${money(version.total, cur)} quote total` : undefined}
              action={version && <Badge tone={QUOTE_STATUS[version.status].tone}>{QUOTE_STATUS[version.status].label}</Badge>}
            />
            {!version ? (
              <EmptyState title="Not linked to a quote">This invoice was raised for a set amount rather than from a quote.</EmptyState>
            ) : (
              <div className="px-5 pb-5">
                {version.snapshot.sections.map((sec) => (
                  <div key={sec.title} className="mb-3">
                    <p className="mb-1 text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">{sec.title}</p>
                    <ul className="divide-y divide-line">
                      {sec.items.map((it, idx) => (
                        <li key={idx} className={cn("flex items-baseline justify-between gap-3 py-1.5 text-[13px]", it.optional && "text-ink-faint")}>
                          <span className="min-w-0 truncate text-ink">{it.name}{it.optional ? " (optional)" : ""} <span className="text-ink-faint">× {Number(it.quantity)}{it.unit ? ` ${it.unit}` : ""}</span></span>
                          <span className="tabular shrink-0 text-ink-muted">{money(it.line_total, cur)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                <div className="mt-3 flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2 text-[13px]">
                  <span className="text-ink-muted">
                    {KIND_LABEL[inv.kind] ?? "Invoice"}
                    {Number(version.total) > 0 && Number(inv.total) !== Number(version.total) ? ` · ${Math.round((Number(inv.total) / Number(version.total)) * 100)}% of quote` : ""}
                  </span>
                  <span className="tabular font-semibold text-ink">{money(inv.total, cur)}</span>
                </div>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Payments" subtitle={`${money(inv.amount_paid, cur)} received`} />
            {payments.length === 0 ? <EmptyState title="No payments yet" /> : (
              <ul className="divide-y divide-line border-t border-line">
                {payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-ink">{fmtDateTime(p.paid_at, tz, "date")} · {p.method ?? "Payment"}</p>
                      <p className="truncate text-[12px] text-ink-muted">
                        {p.reference ? `Ref ${p.reference} · ` : ""}{p.xero_payment_id ? "From Xero" : `Recorded manually${p.created_by && names[p.created_by] ? ` by ${names[p.created_by]}` : ""}`}
                      </p>
                    </div>
                    <span className="tabular shrink-0 text-[13.5px] font-medium text-emerald-700">{money(p.amount, cur)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Actions" />
            <InvoiceActions id={inv.id} status={inv.status} balance={Number(inv.balance)} balanceLabel={money(inv.balance, cur)}
              today={today} xeroManaged={xeroManaged} canManage={canManage(role)} />
          </Card>

          <Card>
            <CardHeader title="Customer" action={inv.customer && <Link href={`/clients/${inv.customer.id}`} className="text-[12.5px] font-medium text-brand-600 hover:text-brand-700">View record</Link>} />
            <div className="px-5 pb-5">
              <p className="text-[14px] font-semibold text-ink">{inv.customer?.name ?? "—"}</p>
              {inv.customer?.company && inv.customer.company !== inv.customer.name && <p className="text-[12.5px] text-ink-muted">{inv.customer.company}</p>}
              <ul className="mt-3 space-y-1.5 text-[13px] text-ink">
                {inv.customer?.email && <li className="flex items-center gap-2"><Mail className="h-4 w-4 text-ink-faint" />{inv.customer.email}</li>}
                {inv.customer?.phone && <li className="flex items-center gap-2"><Phone className="h-4 w-4 text-ink-faint" />{inv.customer.phone}</li>}
              </ul>
            </div>
          </Card>

          <Card>
            <CardHeader title="Event" />
            {inv.event ? (
              <Link href={`/events/${inv.event.id}?tab=invoice`} className="mx-5 mb-5 flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2.5 hover:border-brand-200">
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-medium text-ink">{inv.event.name}</p>
                  <p className="truncate text-[12px] text-ink-muted">EV-{inv.event.number} · {fmtDate(inv.event.event_date)}{inv.event.venue ? ` · ${inv.event.venue}` : ""}</p>
                </div>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-ink-faint" />
              </Link>
            ) : <p className="px-5 pb-5 text-[12.5px] text-ink-muted">Not linked to an event.</p>}
          </Card>

          <Card>
            <CardHeader title="Activity" subtitle="Every change to this invoice" />
            <ActivityFeed items={activity} names={names} tz={tz} />
          </Card>
        </div>
      </div>
      <p className="mt-8 text-[11.5px] text-ink-faint">Created {fmtDateTime(inv.created_at, tz)} · last updated {relative(inv.updated_at)}</p>
    </div>
  );
}
