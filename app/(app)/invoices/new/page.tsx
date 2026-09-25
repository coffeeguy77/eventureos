import { canManage, requireOrg } from "@/lib/context";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { addDaysISO, fmtDate, todayISO } from "@/lib/format";
import { NewInvoiceForm, type QuoteOption } from "./form";

export const metadata = { title: "New invoice" };

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ customer?: string; event?: string; quote?: string }> }) {
  const sp = await searchParams;
  const { supabase, org, role } = await requireOrg();
  if (!canManage(role)) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader eyebrow="Invoices" title="New invoice" />
        <Card className="p-6 text-[13px] text-ink-muted">Only owners, admins and managers can raise invoices.</Card>
      </div>
    );
  }
  const tz = org.timezone;
  const today = todayISO(tz);
  const settings = org.settings as { deposit_percent?: number; default_payment_terms_days?: number };
  const depositPct = Number(settings.deposit_percent ?? 30) || 30;
  const terms = Number.isFinite(Number(settings.default_payment_terms_days)) ? Number(settings.default_payment_terms_days) : 14;

  const [custRes, evRes, quoteRes, invRes, xeroRes] = await Promise.all([
    supabase.from("customers").select("id, name").eq("organisation_id", org.id).order("name"),
    supabase.from("events").select("id, number, name, event_date, customer_id, status").eq("organisation_id", org.id)
      .neq("status", "cancelled").order("event_date", { ascending: false, nullsFirst: false }).limit(1000),
    supabase.from("quotes").select("id, number, title, customer_id, event_id, version:quote_versions!quotes_current_version_id_organisation_id_fkey(total)")
      .eq("organisation_id", org.id).eq("status", "accepted").order("created_at", { ascending: false }),
    supabase.from("invoices").select("quote_id, total, status").eq("organisation_id", org.id).not("quote_id", "is", null).neq("status", "void"),
    supabase.from("integrations").select("status").eq("organisation_id", org.id).eq("provider", "xero").maybeSingle(),
  ]);
  for (const r of [custRes, evRes, quoteRes, invRes]) if (r.error) throw new Error(`Could not load invoice options: ${r.error.message}`);

  const invoiced: Record<string, number> = {};
  for (const i of invRes.data ?? []) invoiced[i.quote_id as string] = (invoiced[i.quote_id as string] ?? 0) + Number(i.total);
  const quotes: QuoteOption[] = ((quoteRes.data ?? []) as unknown as { id: string; number: number; title: string; customer_id: string; event_id: string | null; version: { total: number } | null }[])
    .filter((q) => q.version)
    .map((q) => ({ id: q.id, label: `Q-${q.number} · ${q.title}`, customerId: q.customer_id, eventId: q.event_id, total: Number(q.version!.total), invoiced: invoiced[q.id] ?? 0 }));

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Invoices" title="New invoice"
        subtitle={xeroRes.data?.status === "connected" ? "Created here, then sent to Xero on the next sync." : "Xero isn’t connected — this invoice will be managed in EventureOS."} />
      <NewInvoiceForm
        customers={(custRes.data ?? []).map((c) => ({ id: c.id, name: c.name }))}
        events={(evRes.data ?? []).map((e) => ({ id: e.id, label: `EV-${e.number} · ${e.name}${e.event_date ? ` · ${fmtDate(e.event_date)}` : ""}`, customerId: e.customer_id }))}
        quotes={quotes}
        depositPct={depositPct}
        terms={terms}
        today={today}
        defaultDue={addDaysISO(today, terms)}
        currency={org.currency}
        initial={{ customer: sp.customer, event: sp.event, quote: sp.quote }}
      />
    </div>
  );
}
