import { notFound, redirect } from "next/navigation";
import { requireOrg } from "@/lib/context";
import { packBoxes } from "@/lib/wholesale/rules";
import { readWholesale } from "@/lib/wholesale/settings";
import { LabelSheet, type LabelOrder } from "@/components/wholesale/labels";

export const dynamic = "force-dynamic";
export const metadata = { title: "Box labels" };

type Row = {
  id: string; number: string; delivery_date: string | null; customer_note: string | null; ship_to: { text?: string } | null;
  customer: { name: string; business_name: string | null; contact_name: string | null; phone: string | null; address1: string | null; address2: string | null; suburb: string | null; state: string | null; postcode: string | null; delivery_instructions: string | null } | null;
  lines: { name: string; quantity: number; weight_kg: number | null; position: number }[];
};

/** Box labels for a delivery run (or one order): 4×6" for a label printer, or four to an A4 sheet. */
export default async function WholesaleLabelsPage({ searchParams }: { searchParams: Promise<{ run?: string; order?: string; size?: string }> }) {
  const sp = await searchParams;
  const { supabase, org, role } = await requireOrg();
  if (role === "staff" || role === "customer") redirect("/dashboard");
  const ws = readWholesale(org.settings);
  const size = sp.size === "a4" ? "a4" : "4x6";
  let q = supabase.from("wholesale_orders")
    .select("id, number, delivery_date, customer_note, ship_to, customer:wholesale_customers(name, business_name, contact_name, phone, address1, address2, suburb, state, postcode, delivery_instructions), lines:wholesale_order_lines(name, quantity, weight_kg, position)")
    .eq("organisation_id", org.id);
  if (sp.order && /^[0-9a-f-]{36}$/i.test(sp.order)) q = q.eq("id", sp.order);
  else if (sp.run && /^\d{4}-\d{2}-\d{2}$/.test(sp.run)) q = q.eq("delivery_date", sp.run).in("status", ["placed", "packed", "delivered"]);
  else notFound();
  const { data } = await q;
  const rows = ((data ?? []) as unknown as Row[]).sort((a, b) => (a.customer?.suburb ?? "").localeCompare(b.customer?.suburb ?? "") || (a.customer?.name ?? "").localeCompare(b.customer?.name ?? ""));
  const orders: LabelOrder[] = rows.map((o) => {
    const c = o.customer;
    const address = o.ship_to?.text ? o.ship_to.text.split(/\n|,\s*/).filter(Boolean)
      : [c?.address1, c?.address2, [c?.suburb, c?.state, c?.postcode].filter(Boolean).join(" ")].filter((x): x is string => !!x);
    const lines = [...o.lines].sort((a, b) => a.position - b.position).map((l) => ({ name: l.name, quantity: Number(l.quantity), weight_kg: l.weight_kg == null ? null : Number(l.weight_kg) }));
    return {
      id: o.id, number: o.number, delivery: o.delivery_date, customer: c?.name ?? "Customer", attention: c?.contact_name ?? null, phone: c?.phone ?? null,
      address, instructions: c?.delivery_instructions ?? null, lines, boxes: packBoxes(lines, ws.boxKg),
    };
  });
  return <LabelSheet orders={orders} size={size} business={{ name: org.name, logo: org.logo_url && /^https:\/\//.test(org.logo_url) ? org.logo_url : null }} boxKg={ws.boxKg}
    back={sp.order ? `/wholesale/orders/${sp.order}` : `/wholesale${sp.run ? `?run=${sp.run}` : ""}`} query={sp.order ? `order=${sp.order}` : `run=${sp.run}`} />;
}
