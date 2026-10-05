import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, Loader2, Package, Truck } from "lucide-react";
import { createServiceClient } from "@/lib/integrations/runtime";
import { settleFromReturn, shopOrg } from "@/lib/shop/server";
import { addressLine, ORDER_STATUS, type Address } from "@/lib/shop/core";
import { ShopFrame, serif, hand } from "@/components/shop/frame";
import { ClearCart } from "@/components/shop/clear-cart";
import { AutoRefresh } from "@/components/book/auto-refresh";
import { PAGE } from "@/components/book/shell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your order", robots: { index: false, follow: false } };

const money = (n: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(Number(n));
const fmtDay = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" });
const STEPS = [{ k: "paid", t: "Order received" }, { k: "roasting", t: "Roasting" }, { k: "packed", t: "Packed" }, { k: "shipped", t: "On its way" }];
const ORDER = ["paid", "roasting", "packed", "shipped", "completed"];

export default async function OrderPage({ params, searchParams }: { params: Promise<{ org: string; token: string }>; searchParams: Promise<{ paid?: string }> }) {
  const { org: slug, token } = await params;
  const sp = await searchParams;
  const org = await shopOrg(slug);
  if (!org || !/^[0-9a-f]{48}$/.test(token)) notFound();
  const db = createServiceClient();
  const cols = "id, organisation_id, number, status, kind, items, subtotal, discount, shipping, gift_amount, total, delivery, address, dispatch_on, tracking_number, subscription_id, stripe_session_id, name";
  let { data: o } = await db.from("shop_orders").select(cols).eq("view_token", token).maybeSingle();
  if (!o || o.organisation_id !== org.id) notFound();
  if (sp.paid === "1" && o.status === "pending") {
    await settleFromReturn(org.id, o.id as string, o.stripe_session_id as string | null);
    ({ data: o } = await db.from("shop_orders").select(cols).eq("view_token", token).maybeSingle());
  }
  const order = o!;
  const items = (order.items as { name: string; variant: string; grind_label: string | null; qty: number; line_total: number }[]) ?? [];
  const at = ORDER.indexOf(order.status as string);
  const paidish = at >= 0;
  const base = `/shop/${org.slug}`;

  return (
    <ShopFrame org={org}>
      {paidish && sp.paid === "1" && <ClearCart slug={org.slug} />}
      <div className={`${PAGE} max-w-3xl py-10 sm:py-14`}>
        {order.status === "pending" ? (
          <div className="py-10 text-center">
            {sp.paid === "1" && <AutoRefresh />}
            <Loader2 className="mx-auto h-12 w-12 animate-spin text-[var(--b)]" />
            <h1 className="mt-4 text-[1.5rem] font-bold">{sp.paid === "1" ? "Confirming your payment…" : "Waiting for payment"}</h1>
          </div>
        ) : (
          <>
            <p className={`${hand} text-[1.75rem] leading-none text-[var(--b)]`}>{paidish ? "Thank you!" : ""}</p>
            <h1 className={`${serif} mt-2 text-[2.25rem] font-semibold leading-tight sm:text-[2.75rem]`}>Order #{order.number}</h1>
            <p className="mt-2 text-[1.0625rem] text-[#5b5955]">{ORDER_STATUS[order.status as string] ?? order.status}{order.dispatch_on && paidish && at < 3 ? ` · ${order.delivery === "pickup" ? "ready" : "ships"} ${fmtDay(order.dispatch_on as string)}` : ""}</p>

            {paidish && (
              <ol className="mt-8 grid grid-cols-4 gap-2">
                {STEPS.map((st, i) => {
                  const done = at >= i || order.status === "completed";
                  return (
                    <li key={st.k} className="text-center">
                      <span className={`mx-auto grid h-11 w-11 place-items-center rounded-full ${done ? "bg-[var(--b)] text-[var(--on-b)]" : "bg-[#EDE5DC] text-[#8a817a]"}`}>{i === 3 ? <Truck className="h-5 w-5" /> : i === 2 ? <Package className="h-5 w-5" /> : <Check className="h-5 w-5" strokeWidth={2.5} />}</span>
                      <span className={`mt-2 block text-[0.8125rem] font-medium ${done ? "text-[#171714]" : "text-[#8a817a]"}`}>{st.t}</span>
                    </li>
                  );
                })}
              </ol>
            )}
            {order.tracking_number && <p className="mt-6 rounded-2xl bg-[#F1EAE2] p-4 text-[0.9688rem]">Tracking: <a className="font-semibold underline" href={`https://auspost.com.au/mypost/track/details/${encodeURIComponent(order.tracking_number as string)}`} target="_blank" rel="noreferrer">{order.tracking_number}</a></p>}

            <div className="mt-8 rounded-[26px] bg-[#FFFDFC] p-6 ring-1 ring-[#EAE1D7]">
              <ul className="divide-y divide-[#EFE7DE]">
                {items.map((i, k) => <li key={k} className="flex justify-between gap-4 py-3"><span><span className="font-semibold">{i.qty} × {i.name}</span> <span className="text-[#6b655f]">{i.variant}</span>{i.grind_label && <span className="block text-[0.875rem] text-[#6b655f]">{i.grind_label}</span>}</span><span className="font-medium">{money(i.line_total)}</span></li>)}
              </ul>
              <dl className="mt-3 space-y-2 border-t border-[#EFE7DE] pt-3 text-[0.9688rem]">
                {Number(order.discount) > 0 && <div className="flex justify-between text-[var(--b)]"><dt>Discount</dt><dd>−{money(order.discount as number)}</dd></div>}
                <div className="flex justify-between"><dt className="text-[#5b5955]">Shipping</dt><dd>{Number(order.shipping) > 0 ? money(order.shipping as number) : order.delivery === "pickup" ? "Pick up" : order.delivery === "event" ? "With your event" : "Free"}</dd></div>
                {Number(order.gift_amount) > 0 && <div className="flex justify-between"><dt className="text-[#5b5955]">Gift card</dt><dd>−{money(order.gift_amount as number)}</dd></div>}
                <div className="flex justify-between text-[1.125rem] font-bold"><dt>Paid</dt><dd>{money(Number(order.total) - Number(order.gift_amount))}</dd></div>
              </dl>
              {order.delivery === "post" && <p className="mt-4 text-[0.9375rem] text-[#5b5955]">Delivering to {addressLine(order.address as Address)}</p>}
            </div>
            {org.shop.roastNote && <p className="mt-5 rounded-2xl border border-dashed border-[#D8CCBF] p-4 text-[0.9375rem] text-[#4a4743]">{org.shop.roastNote}</p>}
            <div className="mt-8 flex flex-wrap gap-3">
              {order.subscription_id && <Link href={`${base}/account`} className="shop-btn inline-flex h-14 items-center rounded-2xl bg-[var(--b)] px-6 font-semibold text-[var(--on-b)]">Manage my subscription</Link>}
              <Link href={base} className="shop-btn inline-flex h-14 items-center rounded-2xl px-6 font-semibold ring-1 ring-[#171714]/60">Keep shopping</Link>
            </div>
          </>
        )}
      </div>
    </ShopFrame>
  );
}
