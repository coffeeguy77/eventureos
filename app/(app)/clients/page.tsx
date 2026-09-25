import Link from "next/link";
import { requireOrg } from "@/lib/context";
import { Card, EmptyState } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { FilterBar } from "@/components/records/filter-bar";
import { fmtDate, money } from "@/lib/format";

export const metadata = { title: "Clients" };

type Row = {
  id: string; name: string; company: string | null; email: string | null; phone: string | null; kind: string; tags: string[]; customer_since: string;
  events: { id: string; event_date: string | null; status: string }[];
  invoices: { total: number; amount_paid: number; balance: number; status: string }[];
};

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string; kind?: string }> }) {
  const sp = await searchParams;
  const { supabase, org } = await requireOrg();
  let query = supabase.from("customers")
    .select("id, name, company, email, phone, kind, tags, customer_since, events(id, event_date, status), invoices(total, amount_paid, balance, status)")
    .eq("organisation_id", org.id).order("name").limit(500);
  if (sp.kind) query = query.eq("kind", sp.kind);
  if (sp.q) {
    const t = sp.q.replace(/[,()%"\\]/g, " ").trim();
    if (t) query = query.or(["name", "company", "email", "phone"].map((c) => `${c}.ilike."%${t}%"`).join(","));
  }
  const { data, error } = await query;
  if (error) throw new Error(`Could not load clients: ${error.message}`);
  const rows = (data ?? []) as Row[];

  return (
    <div>
      <PageHeader title="Clients" subtitle="Everyone you’ve worked with, and what they’re worth." />
      <Card>
        <div className="border-b border-line px-4 py-3">
          <FilterBar searchPlaceholder="Search name, company, email, phone…"
            filters={[{ key: "kind", label: "Type", options: [{ value: "company", label: "Companies" }, { value: "individual", label: "Individuals" }] }]} />
        </div>
        {rows.length === 0 ? <EmptyState title="No clients found" /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-[13px]">
              <thead><tr className="border-b border-line text-[11.5px] uppercase tracking-wide text-ink-faint">
                {["Client", "Contact", "Events", "Lifetime value", "Outstanding", "Client since"].map((h) => (
                  <th key={h} className={`px-4 py-2.5 font-medium ${["Events", "Lifetime value", "Outstanding"].includes(h) ? "text-right" : ""}`}>{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-line">
                {rows.map((c) => {
                  const ltv = c.invoices.filter((i) => i.status !== "void").reduce((s, i) => s + Number(i.amount_paid), 0);
                  const owing = c.invoices.filter((i) => i.status !== "void").reduce((s, i) => s + Number(i.balance), 0);
                  const overdue = c.invoices.some((i) => i.status === "overdue");
                  return (
                    <tr key={c.id} className="relative hover:bg-zinc-50/70">
                      <td className="px-4 py-3">
                        <Link href={`/clients/${c.id}`} className="flex items-center gap-3 after:absolute after:inset-0">
                          <Avatar name={c.name} size={30} />
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-ink">{c.name}</span>
                            <span className="flex gap-1">{c.tags.slice(0, 2).map((t) => <Badge key={t} className="!py-0 !text-[10.5px]">{t}</Badge>)}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-ink-muted"><span className="block">{c.email ?? "—"}</span><span className="text-[12px] text-ink-faint">{c.phone}</span></td>
                      <td className="tabular px-4 py-3 text-right text-ink">{c.events.length}</td>
                      <td className="tabular px-4 py-3 text-right text-ink">{money(ltv, org.currency, { cents: false })}</td>
                      <td className={`tabular px-4 py-3 text-right ${overdue ? "font-medium text-rose-700" : owing > 0 ? "text-ink" : "text-ink-faint"}`}>{owing > 0 ? money(owing, org.currency) : "—"}</td>
                      <td className="px-4 py-3 text-ink-muted">{fmtDate(c.customer_since)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="border-t border-line px-4 py-2.5 text-[12px] text-ink-faint">{rows.length} client{rows.length === 1 ? "" : "s"}</div>
      </Card>
    </div>
  );
}
