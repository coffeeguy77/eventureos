import Link from "next/link";
import { requireOrg } from "@/lib/context";
import { PageHeader } from "@/components/ui/page-header";
import { Card, EmptyState } from "@/components/ui/card";
import { ShipBoard } from "@/components/store/ship-board";
import { parcelWeightKg, readAusPost, settingsProblems, type ShipOrder } from "@/lib/shop/auspost";

export const dynamic = "force-dynamic";
export const metadata = { title: "Post with Australia Post" };

/** Make a MyPost Business import file for the ticked orders, then paste the tracking numbers back. */
export default async function ShipPage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const sp = await searchParams;
  const { supabase, org } = await requireOrg();
  const ids = (sp.ids ?? "").split(",").filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 200);
  const ap = readAusPost(org.settings);
  const { data } = ids.length ? await supabase.from("shop_orders").select("id, number, name, email, phone, address, items, delivery, status, tracking_number").eq("organisation_id", org.id).in("id", ids) : { data: [] };
  const rows = ((data ?? []) as { id: string; number: number; name: string | null; email: string | null; phone: string | null; address: Record<string, unknown>; items: { name: string; variant: string; qty: number; kind?: string }[]; delivery: string; status: string; tracking_number: string | null }[])
    .filter((o) => o.delivery === "post").sort((a, b) => a.number - b.number);
  const orders = rows.map((o) => {
    const items = (o.items ?? []).filter((i) => i.kind !== "gift_card").map((i) => ({ name: i.name, variant: i.variant ?? "", qty: Number(i.qty) || 1 }));
    const so: ShipOrder = { id: o.id, number: o.number, name: o.name, email: o.email, phone: o.phone, address: o.address ?? {}, items };
    return { order: so, weightKg: parcelWeightKg(items, ap.packingGrams), status: o.status, tracking: o.tracking_number };
  });
  const problems = settingsProblems(ap);
  return (
    <>
      <PageHeader eyebrow={<Link href="/store" className="hover:underline">← Orders</Link>} title="Post with Australia Post" subtitle="Make the MyPost Business import file, print the labels in MyPost Business, then paste the tracking numbers here." />
      {problems.length > 0 && <Card className="mb-4 p-4 text-[0.8125rem] text-amber-800">{problems.join(" ")} <Link href="/store/settings" className="font-medium underline">Shop settings</Link></Card>}
      {orders.length === 0 ? <Card><EmptyState title="No orders to post">Tick orders on the Orders page (ones going by post), then choose Post with Australia Post.</EmptyState></Card>
        : <ShipBoard orders={orders} settings={ap} ready={!problems.length} />}
    </>
  );
}
