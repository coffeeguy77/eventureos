import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { createServiceClient } from "@/lib/integrations/runtime";
import { catalogueFor, customerByToken, settleFromReturn, todayIn } from "@/lib/wholesale/orders";
import { deliveryDateFor } from "@/lib/wholesale/rules";
import { readWholesale } from "@/lib/wholesale/settings";
import { fmtDate, money } from "@/lib/format";
import { OrderForm } from "./order-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Place an order", robots: { index: false, follow: false } };

const safeColour = (c?: string | null) => (c && /^#[0-9a-f]{6}$/i.test(c) ? c : "#6028EC");

export default async function WholesaleOrderPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ placed?: string; ok?: string; cancelled?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const db = createServiceClient();
  const found = await customerByToken(db, token);
  if (!found) notFound();
  const { customer: c, org } = found;
  const ws = readWholesale(org.settings);
  const brand = safeColour(org.brand_colour);
  const today = todayIn(org.timezone);
  const delivery = deliveryDateFor(today, c.delivery_weekday ?? ws.deliveryWeekday);

  // Back from Stripe: settle now if the webhook hasn't yet, then show the order
  let done: { number: string; total: number; delivery_date: string | null; paid: boolean; lines: { name: string; quantity: number }[] } | null = null;
  if (sp.placed && /^[0-9a-f]{48}$/.test(sp.placed)) {
    await settleFromReturn(db, org.id, sp.placed);
    const { data: o } = await db.from("wholesale_orders").select("number, total, delivery_date, payment_status, status, lines:wholesale_order_lines(name, quantity)").eq("organisation_id", org.id).eq("customer_id", c.id).eq("view_token", sp.placed).maybeSingle();
    if (o) done = { number: o.number as string, total: Number(o.total), delivery_date: o.delivery_date as string | null, paid: o.payment_status === "paid", lines: (o.lines ?? []) as { name: string; quantity: number }[] };
  } else if (sp.ok && /^W-\d+$/.test(sp.ok)) {
    const { data: o } = await db.from("wholesale_orders").select("number, total, delivery_date, payment_status, lines:wholesale_order_lines(name, quantity)").eq("organisation_id", org.id).eq("customer_id", c.id).eq("number", sp.ok).maybeSingle();
    if (o) done = { number: o.number as string, total: Number(o.total), delivery_date: o.delivery_date as string | null, paid: false, lines: (o.lines ?? []) as { name: string; quantity: number }[] };
  }

  const header = (
    <header className="mb-6 text-center">
      {org.logo_url && /^https:\/\//.test(org.logo_url)
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={org.logo_url} alt={org.name} className="mx-auto h-12 w-auto object-contain" />
        : <p className="text-[1.25rem] font-semibold text-zinc-900">{org.name}</p>}
      <p className="mt-3 text-[0.8125rem] text-zinc-500">Ordering for</p>
      <h1 className="text-[1.375rem] font-semibold tracking-tight text-zinc-900">{c.name}</h1>
    </header>
  );
  const shell = (children: React.ReactNode) => <main className="min-h-screen bg-zinc-50 px-4 py-8"><div className="mx-auto max-w-2xl">{header}{children}</div></main>;

  if (done) {
    return shell(
      <div className="rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-zinc-200">
        <CheckCircle2 className="mx-auto h-10 w-10" style={{ color: brand }} />
        <h2 className="mt-3 text-[1.125rem] font-semibold text-zinc-900">Order {done.number} is in</h2>
        <p className="mt-1 text-[0.9375rem] text-zinc-600">{done.delivery_date ? `Delivery ${fmtDate(done.delivery_date, "long")}` : "We'll deliver it on the next run"} · {money(done.total, org.currency, { cents: true })} {done.paid ? "paid" : c.payment_mode === "invoice" ? "on your account" : "— payment still processing"}</p>
        <ul className="mx-auto mt-4 max-w-sm text-left text-[0.875rem] text-zinc-700">{done.lines.map((l, i) => <li key={i} className="border-t border-zinc-100 py-1.5">{Number(l.quantity)} × {l.name}</li>)}</ul>
        <p className="mt-4 text-[0.8125rem] text-zinc-500">A confirmation is on its way by email. Need to change something? Just reply to it.</p>
        <a href={`/order/${token}`} className="mt-5 inline-flex h-11 items-center rounded-xl px-5 text-[0.9375rem] font-semibold text-white" style={{ background: brand }}>Place another order</a>
      </div>,
    );
  }
  if (!c.active || !ws.ordering) {
    return shell(<div className="rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-zinc-200"><p className="text-[0.9375rem] text-zinc-700">Online ordering isn&apos;t open {c.active ? "yet" : "for this account"}. Please contact {org.name}{org.contact_email ? <> at <a href={`mailto:${org.contact_email}`} className="underline">{org.contact_email}</a></> : null} to order.</p></div>);
  }

  const items = await catalogueFor(db, c);
  const { data: lastOrder } = await db.from("wholesale_orders").select("id, lines:wholesale_order_lines(product_id, quantity)").eq("customer_id", c.id).neq("status", "cancelled").neq("status", "pending").order("order_date", { ascending: false }).limit(1).maybeSingle();
  const last = Object.fromEntries((((lastOrder?.lines ?? []) as { product_id: string | null; quantity: number }[]).filter((l) => l.product_id).map((l) => [l.product_id!, Number(l.quantity)])));
  const payNote = c.payment_mode === "card" ? "You'll pay by card on the next screen (secure, through Stripe)." : `Goes on your account — pay within ${c.payment_terms_days} day${c.payment_terms_days === 1 ? "" : "s"}.`;
  return shell(
    <>
      <p className="mb-5 rounded-xl bg-white px-4 py-3 text-center text-[0.875rem] text-zinc-700 shadow-sm ring-1 ring-zinc-200">
        Order now for delivery <strong>{fmtDate(delivery, "long")}</strong>
        {sp.cancelled && <span className="mt-1 block text-[0.8125rem] text-amber-700">Card payment was cancelled — your order wasn&apos;t placed.</span>}
      </p>
      {items.length === 0 ? <p className="text-center text-zinc-600">Nothing is available to order right now.</p>
        : <OrderForm token={token} items={items} currency={org.currency} brand={brand} last={last} payNote={payNote} freight={ws.freight} freeOver={ws.freeFreightOver} minOrder={Number(c.min_order)} />}
    </>,
  );
}
