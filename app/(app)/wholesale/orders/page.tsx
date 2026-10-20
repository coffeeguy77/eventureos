import Link from "next/link";
import { requireOrg } from "@/lib/context";
import { Card, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmtDate, money } from "@/lib/format";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

const TABS = [
  { k: "upcoming", label: "Upcoming" },
  { k: "check", label: "To check" },
  { k: "past", label: "Past" },
  { k: "all", label: "All" },
] as const;
const STATUS: Record<string, { label: string; tone: "neutral" | "amber" | "green" | "slate" | "red" }> = {
  pending: { label: "Waiting for payment", tone: "slate" }, placed: { label: "To pack", tone: "amber" }, packed: { label: "Packed", tone: "neutral" },
  delivered: { label: "Delivered", tone: "green" }, cancelled: { label: "Cancelled", tone: "red" },
};

export default async function WholesaleOrdersPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const sp = await searchParams;
  const tab = TABS.find((t) => t.k === sp.tab) ?? TABS[0];
  const q = (sp.q ?? "").trim().slice(0, 60);
  const { supabase, org } = await requireOrg();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: org.timezone || "Australia/Sydney" }).format(new Date());
  let query = supabase.from("wholesale_orders").select("id, number, source, status, order_date, delivery_date, total, needs_check, customer:wholesale_customers(id, name), lines:wholesale_order_lines(name, quantity)")
    .eq("organisation_id", org.id).limit(300);
  if (tab.k === "upcoming") query = query.gte("delivery_date", today).neq("status", "cancelled").order("delivery_date").order("order_date");
  else if (tab.k === "check") query = query.not("needs_check", "is", null).neq("status", "cancelled").order("order_date", { ascending: false });
  else if (tab.k === "past") query = query.lt("delivery_date", today).order("delivery_date", { ascending: false });
  else query = query.order("order_date", { ascending: false });
  if (q) {
    if (/^(omo|omi|w-)?\d+$/i.test(q)) query = query.ilike("number", `%${q.replace(/^omi/i, "OMO")}%`);
    else {
      const { data: cs } = await supabase.from("wholesale_customers").select("id").eq("organisation_id", org.id).ilike("name", `%${q.replace(/[%_]/g, " ")}%`).limit(50);
      query = query.in("customer_id", ((cs ?? []) as { id: string }[]).map((c) => c.id).concat("00000000-0000-0000-0000-000000000000"));
    }
  }
  const { data } = await query;
  type Row = { id: string; number: string; source: string; status: string; order_date: string; delivery_date: string | null; total: number; needs_check: string | null; customer: { id: string; name: string } | null; lines: { name: string; quantity: number }[] };
  const rows = (data ?? []) as unknown as Row[];
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {TABS.map((t) => <Link key={t.k} href={`/wholesale/orders?tab=${t.k}`} className={cn("rounded-full px-3 py-1.5 text-[0.8125rem] font-medium", t.k === tab.k ? "bg-ink text-white" : "bg-surface text-ink-muted ring-1 ring-line hover:text-ink")}>{t.label}</Link>)}
        <form className="ml-auto w-full sm:w-auto"><input type="hidden" name="tab" value={tab.k} /><input name="q" defaultValue={q} placeholder="Order number or customer" aria-label="Search orders" className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-[0.8125rem] sm:h-9 sm:w-60" /></form>
      </div>
      {rows.length === 0 ? <Card><EmptyState title={tab.k === "check" ? "Nothing to check" : "No orders here"} /></Card> : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line">
            {rows.map((o) => {
              const st = STATUS[o.status] ?? STATUS.placed;
              return (
                <li key={o.id}>
                  <Link href={`/wholesale/orders/${o.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-zinc-50/70 sm:px-5">
                    <div className="min-w-0 flex-1 basis-60">
                      <p className="flex flex-wrap items-center gap-2 text-[0.8438rem] font-medium text-ink">{o.customer?.name ?? "Unknown customer"}<span className="text-[0.75rem] font-normal text-ink-faint">{o.number}</span>{o.source === "eventureos" && <Badge tone="brand">Direct</Badge>}{o.needs_check && <Badge tone="amber">Check</Badge>}</p>
                      <p className="truncate text-[0.75rem] text-ink-muted">{o.lines.map((l) => `${Number(l.quantity)} × ${l.name}`).join(", ") || "No items"}</p>
                    </div>
                    <div className="text-[0.75rem] text-ink-muted"><span className="block">Ordered {fmtDate(o.order_date)}</span><span className="block">{o.delivery_date ? `Delivery ${fmtDate(o.delivery_date)}` : "No delivery date"}</span></div>
                    <div className="w-28 text-right"><p className="tabular text-[0.8438rem] font-semibold text-ink">{money(o.total, org.currency)}</p><Badge tone={st.tone}>{st.label}</Badge></div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
