import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { createServiceClient } from "@/lib/integrations/runtime";
import QRCode from "qrcode";
import { catalogueFor, customerByToken, pickupPassLink, pickupReady, settleFromReturn, todayIn } from "@/lib/wholesale/orders";
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
  let done: { number: string; total: number; delivery_date: string | null; paid: boolean; pickup: boolean; viewToken: string; lines: { name: string; quantity: number }[] } | null = null;
  const cols = `number, total, delivery_date, payment_status, status, view_token${(await pickupReady(db)) ? ", fulfilment" : ""}, lines:wholesale_order_lines(name, quantity)`;
  type DoneRow = { number: string; total: number; delivery_date: string | null; payment_status: string; view_token: string; fulfilment?: string; lines: { name: string; quantity: number }[] };
  let row: DoneRow | null = null;
  if (sp.placed && /^[0-9a-f]{48}$/.test(sp.placed)) {
    await settleFromReturn(db, org.id, sp.placed);
    ({ data: row } = await db.from("wholesale_orders").select(cols).eq("organisation_id", org.id).eq("customer_id", c.id).eq("view_token", sp.placed).maybeSingle<DoneRow>());
  } else if (sp.ok && /^W-\d+$/.test(sp.ok)) {
    ({ data: row } = await db.from("wholesale_orders").select(cols).eq("organisation_id", org.id).eq("customer_id", c.id).eq("number", sp.ok).maybeSingle<DoneRow>());
  }
  if (row) done = { number: row.number, total: Number(row.total), delivery_date: row.delivery_date, paid: row.payment_status === "paid", pickup: row.fulfilment === "pickup", viewToken: row.view_token, lines: row.lines ?? [] };
  // Pickup orders that are paid (or on account) get a pass: a QR the counter staff scan to see the verified order
  const passUrl = done?.pickup && (done.paid || c.payment_mode === "invoice") ? pickupPassLink(done.viewToken) : null;
  const passQr = passUrl ? await QRCode.toDataURL(passUrl, { margin: 1, width: 480 }) : null;

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
        <p className="mt-1 text-[0.9375rem] text-zinc-600">{done.pickup ? (done.delivery_date ? `Pickup — ready from ${fmtDate(done.delivery_date, "long")}` : "Pickup") : done.delivery_date ? `Delivery ${fmtDate(done.delivery_date, "long")}` : "We'll deliver it on the next run"} · {money(done.total, org.currency, { cents: true })} {done.paid ? "paid" : c.payment_mode === "invoice" ? "on your account" : "— payment still processing"}</p>
        {passQr && passUrl && (
          <div className="mx-auto mt-5 max-w-xs rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
            <p className="text-[0.875rem] font-semibold text-zinc-900">Your pickup pass</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={passQr} alt={`Pickup QR code for order ${done.number}`} className="mx-auto mt-2 h-56 w-56" />
            <p className="mt-2 text-[0.8125rem] text-zinc-500">Show this at the counter when you collect. It&apos;s also in your confirmation email.</p>
            <a href={passUrl} className="mt-2 inline-block text-[0.8125rem] font-medium underline" style={{ color: brand }}>Open the pass</a>
          </div>
        )}
        {done.pickup && !passQr && <p className="mt-4 text-[0.8125rem] text-zinc-500">Your pickup pass (QR code) will be emailed as soon as the payment goes through.</p>}
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
        {c.fulfilment === "pickup" ? <>Order now for pickup — ready from <strong>{fmtDate(delivery, "long")}</strong></>
          : c.fulfilment === "either" ? <>Delivery or pickup — next run <strong>{fmtDate(delivery, "long")}</strong></>
          : <>Order now for delivery <strong>{fmtDate(delivery, "long")}</strong></>}
        {sp.cancelled && <span className="mt-1 block text-[0.8125rem] text-amber-700">Card payment was cancelled — your order wasn&apos;t placed.</span>}
      </p>
      {items.length === 0 ? <p className="text-center text-zinc-600">Nothing is available to order right now.</p>
        : <OrderForm token={token} items={items} currency={org.currency} brand={brand} last={last} payNote={payNote} freight={ws.freight} freeOver={ws.freeFreightOver} minOrder={Number(c.min_order)}
            fulfilment={c.fulfilment} deliveryLabel={`Delivered ${fmtDate(delivery, "short")}`} pickupLabel={`Ready ${fmtDate(delivery, "short")} · no fee`} />}
    </>,
  );
}
