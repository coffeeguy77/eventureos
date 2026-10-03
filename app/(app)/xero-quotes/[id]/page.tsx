import Link from "next/link";
import { notFound } from "next/navigation";
import { canManage, requireOrg } from "@/lib/context";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, Field } from "@/components/ui/card";
import { OldLines } from "@/components/history/old-lines";
import { fmtDate, money, todayISO } from "@/lib/format";
import { copyPeople, forView, loadMatchContext } from "@/lib/quotes/history";
import { matchLines, type XeroLine } from "@/lib/quotes/xero-import";

export const metadata = { title: "Xero quote" };

const TONE: Record<string, "neutral" | "blue" | "green" | "red"> = {
  DRAFT: "neutral", SENT: "blue", ACCEPTED: "green", INVOICED: "green", DECLINED: "red", DELETED: "red",
};

/** An old quote from Xero, read-only: what was on it, how it lines up with today's price list, and "Copy to new quote". */
export default async function XeroQuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, org, role } = await requireOrg();
  const { data: q, error } = await supabase.from("xero_quotes")
    .select("id, number, reference, title, summary, status, quote_date, expiry_date, subtotal, tax_total, total, line_items, xero_updated_at, customer:customers(id, name)")
    .eq("id", id).eq("organisation_id", org.id).maybeSingle();
  if (error) throw new Error(`Could not load the quote: ${error.message}`);
  if (!q) notFound();
  const customer = q.customer as unknown as { id: string; name: string } | null;

  const { priceList, aliases } = await loadMatchContext(org.id);
  const people = customer ? await copyPeople(supabase, org.id, customer.id).catch(() => []) : [];
  const view = forView(matchLines((q.line_items ?? []) as XeroLine[], priceList, aliases), priceList);
  const today = todayISO(org.timezone);
  const current = (q.status === "SENT" || q.status === "DRAFT") && (!q.expiry_date || q.expiry_date >= today);
  const expired = (q.status === "SENT" || q.status === "DRAFT") && !!q.expiry_date && q.expiry_date < today;
  const status = q.status.charAt(0) + q.status.slice(1).toLowerCase();

  return (
    <div>
      <div className="mb-5">
        <div className="mb-1 flex items-center gap-2 text-[0.75rem] text-ink-faint">
          {customer ? <Link href={`/clients/${customer.id}?tab=history`} className="hover:text-ink">{customer.name}</Link> : <span>Client</span>}
          <span>/</span><span>{q.number ?? "Xero quote"}</span>
        </div>
        <h1 className="break-words text-[1.25rem] font-semibold tracking-tight text-ink sm:text-[1.375rem]">
          {q.number ?? "Xero quote"}{(q.reference || q.title) && <span className="font-normal text-ink-muted"> · {q.reference || q.title}</span>}
        </h1>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.8125rem] text-ink-muted">
          <Badge tone={TONE[q.status] ?? "neutral"} dot>{status} in Xero</Badge>
          {current && <Badge tone="amber">Current</Badge>}
          {expired && <span className="text-ink-faint">Expired {fmtDate(q.expiry_date)}</span>}
          <span>Dated {fmtDate(q.quote_date)}</span>
          {q.expiry_date && !expired && <span>Expires {fmtDate(q.expiry_date)}</span>}
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <OldLines lines={view.lines} options={view.options} currency={org.currency} canEdit={canManage(role)}
          source="xero_quote" sourceId={q.id} people={people} defaultName={q.reference || q.title || customer?.name || ""} total={Number(q.total)} />
        <Card className="self-start">
          <CardHeader title="Details" subtitle="A copy of the quote in Xero — read only" />
          <dl className="grid grid-cols-2 gap-4 px-5 pb-5">
            <Field label="Client">{customer ? <Link href={`/clients/${customer.id}`} className="font-medium text-brand-700 hover:underline">{customer.name}</Link> : "—"}</Field>
            <Field label="Status">{status}</Field>
            <Field label="Subtotal"><span className="tabular">{money(Number(q.subtotal), org.currency)}</span></Field>
            <Field label="GST"><span className="tabular">{money(Number(q.tax_total), org.currency)}</span></Field>
            {q.summary && <div className="col-span-2"><Field label="Summary"><span className="whitespace-pre-line">{q.summary}</span></Field></div>}
          </dl>
        </Card>
      </div>
    </div>
  );
}
