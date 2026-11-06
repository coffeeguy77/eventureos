import { canManage, requireOrg } from "@/lib/context";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { todayISO } from "@/lib/format";
import { QuickInvoice } from "@/components/invoices/quick-invoice";

export const dynamic = "force-dynamic";
export const metadata = { title: "Invoice a job" };

/** Invoice a job from the calendar (booked over the phone, no quote): choose the customer, build the lines, send. */
export default async function QuickInvoicePage({ searchParams }: { searchParams: Promise<{ entry?: string; event?: string; customer?: string }> }) {
  const sp = await searchParams;
  const { supabase, org, role } = await requireOrg();
  if (!canManage(role)) return <Card className="mx-auto max-w-3xl p-6 text-[0.8125rem] text-ink-muted">Only owners, admins and managers can raise invoices.</Card>;
  const tz = org.timezone;
  const UUID = /^[0-9a-f-]{36}$/i;

  type EntryRow = { id: string; title: string; starts_at: string; location: string | null; event_id: string | null; customer_id: string | null };
  type EvRow = { id: string; name: string; event_date: string | null; venue: string | null; customer_id: string };
  let entry: EntryRow | null = null;
  if (sp.entry && UUID.test(sp.entry)) {
    const { data } = await supabase.from("calendar_events").select("id, title, starts_at, location, event_id, customer_id").eq("id", sp.entry).eq("organisation_id", org.id).maybeSingle();
    entry = data as EntryRow | null;
  }
  const eventId = (sp.event && UUID.test(sp.event) ? sp.event : null) ?? entry?.event_id ?? null;
  let ev: EvRow | null = null;
  if (eventId) {
    const { data } = await supabase.from("events").select("id, name, event_date, venue, customer_id").eq("id", eventId).eq("organisation_id", org.id).maybeSingle();
    ev = data as EvRow | null;
  }
  const entryDate = entry ? new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(entry.starts_at)) : null;

  const [custRes, svcRes, invRes] = await Promise.all([
    supabase.from("customers").select("id, name, payment_terms_days").eq("organisation_id", org.id).order("name").limit(5000),
    supabase.from("services").select("id, name, description, unit_price, tax_rate, code, xero_account_code, category").eq("organisation_id", org.id).eq("active", true).order("category").order("position"),
    ev ? supabase.from("invoices").select("id, number, total").eq("organisation_id", org.id).eq("event_id", ev.id).neq("status", "void") : Promise.resolve({ data: [] }),
  ]);
  const settings = org.settings as { default_payment_terms_days?: number };
  const terms = Number.isFinite(Number(settings.default_payment_terms_days)) ? Number(settings.default_payment_terms_days) : 14;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader eyebrow="Invoices" title="Invoice a job" subtitle="For a job booked over the phone — no quote needed. Copy a past invoice, use their rates or your price list, then send." />
      <QuickInvoice
        entryId={entry?.id ?? null} eventId={ev?.id ?? null}
        customers={((custRes.data ?? []) as { id: string; name: string; payment_terms_days: number | null }[]).map((c) => ({ id: c.id, name: c.name, terms: c.payment_terms_days }))}
        priceList={((svcRes.data ?? []) as { id: string; name: string; description: string | null; unit_price: number; tax_rate: number; code: string | null; xero_account_code: string | null; category: string | null }[])}
        initial={{ customer: ev?.customer_id ?? entry?.customer_id ?? (sp.customer && UUID.test(sp.customer) ? sp.customer : ""), name: ev?.name ?? entry?.title ?? "", date: ev?.event_date ?? entryDate ?? todayISO(tz), venue: ev?.venue ?? entry?.location ?? "" }}
        existing={((invRes.data ?? []) as { id: string; number: string; total: number }[]).map((x) => ({ ...x, total: Number(x.total) }))}
        today={todayISO(tz)} terms={terms} currency={org.currency}
      />
    </div>
  );
}
