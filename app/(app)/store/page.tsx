import Link from "next/link";
import { requireOrg } from "@/lib/context";
import { PageHeader } from "@/components/ui/page-header";
import { Card, EmptyState } from "@/components/ui/card";
import { OrdersTable, type OrderRow } from "@/components/store/orders-table";
import { readShop } from "@/lib/shop/core";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

const TABS = [
  { k: "todo", label: "To roast & ship", statuses: ["paid", "roasting", "packed"] },
  { k: "shipped", label: "Shipped", statuses: ["shipped", "completed"] },
  { k: "problems", label: "Problems", statuses: ["failed", "on_hold"] },
  { k: "all", label: "All", statuses: [] as string[] },
];

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const sp = await searchParams;
  const tab = TABS.find((t) => t.k === sp.tab) ?? TABS[0];
  const q = (sp.q ?? "").trim().slice(0, 60);
  const { supabase, org } = await requireOrg();
  const shop = readShop(org.settings);
  let query = supabase.from("shop_orders").select("id, number, created_at, name, email, status, kind, source, total, delivery, dispatch_on, items, address").eq("organisation_id", org.id).neq("status", "pending")
    .order(tab.k === "todo" ? "dispatch_on" : "created_at", { ascending: tab.k === "todo", nullsFirst: false }).limit(400);
  if (tab.statuses.length) query = query.in("status", tab.statuses);
  if (tab.k === "todo") query = query.neq("source", "woocommerce"); // WooCommerce still handles its own orders until the switch
  if (q) { const like = `%${q.replace(/[%_,()]/g, " ")}%`; query = /^\d+$/.test(q) ? query.eq("number", Number(q)) : query.or(`name.ilike.${like},email.ilike.${like}`); }
  const { data } = await query;
  const rows: OrderRow[] = (data ?? []).map((o) => {
    const items = (o.items as { name: string; variant: string; grind_label: string | null; qty: number }[]) ?? [];
    const a = o.address as { suburb?: string; state?: string } | null;
    return {
      id: o.id as string, number: o.number as number, created_at: o.created_at as string, name: o.name as string | null, email: o.email as string | null, status: o.status as string, kind: o.kind as string, source: o.source as string,
      total: Number(o.total), delivery: o.delivery as string, dispatch_on: o.dispatch_on as string | null, woo: o.source === "woocommerce",
      summary: items.map((i) => `${i.qty}× ${i.name} ${i.variant}${i.grind_label ? ` (${i.grind_label})` : ""}`).join(", ") || "—",
      place: o.delivery === "pickup" ? "Pick up" : o.delivery === "event" ? "With event" : [a?.suburb, a?.state].filter(Boolean).join(" ") || "Post",
    };
  });
  return (
    <>
      <PageHeader title="Orders" subtitle={shop.enabled ? <>Shop is live at <a href={`/shop/${org.slug}`} target="_blank" rel="noreferrer" className="font-medium text-ink underline">/shop/{org.slug}</a></> : <>The shop is switched off — turn it on in <Link href="/store/settings" className="font-medium text-ink underline">Settings</Link>.</>} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {TABS.map((t) => <Link key={t.k} href={`/store?tab=${t.k}`} className={cn("rounded-full px-3 py-1.5 text-[0.8125rem] font-medium", t.k === tab.k ? "bg-ink text-white" : "bg-surface text-ink-muted ring-1 ring-line hover:text-ink")}>{t.label}</Link>)}
        <form className="ml-auto"><input type="hidden" name="tab" value={tab.k} /><input name="q" defaultValue={q} placeholder="Order #, name or email" className="h-9 w-56 rounded-lg border border-line-strong bg-surface px-3 text-[0.8125rem]" /></form>
      </div>
      {rows.length === 0 ? <Card><EmptyState title={tab.k === "todo" ? "Nothing to roast right now" : "No orders here"}>Paid orders and subscription deliveries show up here, sorted by the day they ship.</EmptyState></Card> : <OrdersTable rows={rows} currency={org.currency} />}
    </>
  );
}
