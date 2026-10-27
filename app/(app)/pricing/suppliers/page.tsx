import { requireOrg } from "@/lib/context";
import { todayISO } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Suppliers, type SupplierRow } from "@/components/pricing/suppliers";

export const dynamic = "force-dynamic";

export default async function PricingSuppliersPage() {
  const { supabase, org } = await requireOrg();
  const cols = "id, name, match_from, match_subject, match_exclude, parser, active, min_order, free_delivery_over, delivery_fee, rep_name, rep_email, rep_phone, notes, last_synced_at";
  const supQ = async () => {
    const a = await supabase.from("price_suppliers").select(`${cols}, mailbox`).eq("organisation_id", org.id).order("name");
    return a.error && /mailbox/.test(a.error.message) ? supabase.from("price_suppliers").select(cols).eq("organisation_id", org.id).order("name") : a;
  };
  const [{ data: sups }, { data: invs }, { data: boxes }] = await Promise.all([
    supQ(),
    supabase.from("price_invoices").select("supplier_id, line_count, invoice_date").eq("organisation_id", org.id).limit(20000),
    supabase.from("integrations").select("provider, status, account_label").eq("organisation_id", org.id).in("provider", ["gmail", "gmail2"]),
  ]);
  const stats = new Map<string, { invoices: number; lines: number; last: string | null }>();
  for (const i of (invs ?? []) as { supplier_id: string; line_count: number; invoice_date: string | null }[]) {
    const x = stats.get(i.supplier_id) ?? { invoices: 0, lines: 0, last: null };
    x.invoices++; x.lines += i.line_count; if (i.invoice_date && (!x.last || i.invoice_date > x.last)) x.last = i.invoice_date;
    stats.set(i.supplier_id, x);
  }
  const mailboxes = ((boxes ?? []) as { provider: "gmail" | "gmail2"; status: string; account_label: string | null }[])
    .filter((b) => ["connected", "syncing", "error"].includes(b.status)).sort((a, b) => a.provider.localeCompare(b.provider))
    .map((b) => ({ key: b.provider, label: b.account_label ?? (b.provider === "gmail" ? "Gmail" : "Second Gmail account") }));
  const rows: SupplierRow[] = ((sups ?? []) as unknown as Omit<SupplierRow, "invoices" | "lines" | "last_invoice">[]).map((s) => ({
    ...s, mailbox: s.mailbox === "gmail2" ? "gmail2" : "gmail", min_order: s.min_order == null ? null : Number(s.min_order), free_delivery_over: s.free_delivery_over == null ? null : Number(s.free_delivery_over), delivery_fee: s.delivery_fee == null ? null : Number(s.delivery_fee),
    invoices: stats.get(s.id)?.invoices ?? 0, lines: stats.get(s.id)?.lines ?? 0, last_invoice: stats.get(s.id)?.last ?? null,
  }));
  return (
    <>
      <PageHeader eyebrow="Pricing" title="Suppliers" subtitle="Who you buy from and where their invoices come from. Minimum orders and free-delivery amounts are used when you order." />
      <Suppliers initial={rows} mailboxes={mailboxes} today={todayISO(org.timezone)} />
    </>
  );
}
