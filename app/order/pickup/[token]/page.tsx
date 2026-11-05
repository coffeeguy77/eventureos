import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { createServiceClient } from "@/lib/integrations/runtime";
import { pickupPassLink } from "@/lib/wholesale/orders";
import { passOrder, passVerdict, teamViewer } from "@/lib/wholesale/pickup";
import { fmtDate, fmtDateTime, money } from "@/lib/format";
import { CollectButton } from "./ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pickup pass", robots: { index: false, follow: false } };

const safeColour = (c?: string | null) => (c && /^#[0-9a-f]{6}$/i.test(c) ? c : "#6028EC");

/**
 * The pickup pass. The customer shows its QR at the counter; whoever scans it sees this page — no sign-in needed —
 * with a clear verdict (paid / on account / not paid / already collected / cancelled). Signed-in team members can
 * mark it collected.
 */
export default async function PickupPass({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = createServiceClient();
  const o = await passOrder(db, token);
  if (!o) notFound();
  const [{ data: org }, staff] = await Promise.all([
    db.from("organisations").select("name, logo_url, brand_colour, timezone, currency").eq("id", o.organisation_id).single(),
    teamViewer(db, o.organisation_id),
  ]);
  if (!org) notFound();
  const tz = (org.timezone as string) || "Australia/Sydney";
  const brand = safeColour(org.brand_colour as string | null);
  const v = passVerdict(o);
  const qr = await QRCode.toDataURL(pickupPassLink(o.view_token), { margin: 1, width: 480 });
  const Icon = v.tone === "green" ? CheckCircle2 : v.tone === "amber" ? AlertTriangle : XCircle;
  const banner = v.tone === "green" ? "bg-emerald-600" : v.tone === "amber" ? "bg-amber-500" : "bg-rose-600";

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-6">
      <div className="mx-auto max-w-md">
        <header className="mb-4 text-center">
          {org.logo_url && /^https:\/\//.test(org.logo_url as string)
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={org.logo_url as string} alt={org.name as string} className="mx-auto h-12 w-auto object-contain" />
            : <p className="text-[1.25rem] font-semibold text-zinc-900">{org.name as string}</p>}
          <p className="mt-2 text-[0.75rem] font-semibold uppercase tracking-wide text-zinc-500">Wholesale pickup pass</p>
        </header>

        <div className={`flex items-center gap-3 rounded-2xl px-4 py-4 text-white shadow-sm ${banner}`}>
          <Icon className="h-9 w-9 shrink-0" />
          <div className="min-w-0">
            <p className="text-[1.125rem] font-bold leading-tight">{v.title}</p>
            <p className="text-[0.875rem] text-white/90">
              {o.collected_at ? `${fmtDateTime(o.collected_at, tz)}${o.collected_by ? ` · by ${o.collected_by}` : ""}`
                : o.payment_status === "paid" && o.paid_at ? `Paid ${fmtDateTime(o.paid_at, tz)}` : `Order ${o.number}`}
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[1.25rem] font-semibold text-zinc-900">{o.customer?.name ?? "Customer"}</p>
              {o.customer?.contact_name && <p className="text-[0.8125rem] text-zinc-500">{o.customer.contact_name}</p>}
            </div>
            <p className="shrink-0 rounded-lg bg-zinc-100 px-2 py-1 text-[0.875rem] font-semibold text-zinc-900">{o.number}</p>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[0.8125rem]">
            <dt className="text-zinc-500">Ordered</dt><dd className="text-right text-zinc-900">{fmtDate(o.order_date, "medium")}</dd>
            <dt className="text-zinc-500">Ready from</dt><dd className="text-right text-zinc-900">{o.delivery_date ? fmtDate(o.delivery_date, "weekday") : "—"}</dd>
            <dt className="text-zinc-500">Total</dt><dd className="text-right text-zinc-900">{money(o.total, (org.currency as string) || "AUD", { cents: true })} {o.payment_status === "paid" ? "paid" : o.payment_mode === "invoice" ? "on account" : "unpaid"}</dd>
          </dl>
          <ul className="mt-4 divide-y divide-zinc-100 border-y border-zinc-100">
            {o.lines.map((l, i) => (
              <li key={i} className="flex items-center gap-3 py-2 text-[0.9375rem] text-zinc-900">
                <span className="grid h-8 min-w-8 place-items-center rounded-lg px-1.5 text-[0.875rem] font-bold text-white" style={{ background: brand }}>{Number(l.quantity)}</span>
                <span className="min-w-0 flex-1">{l.name}</span>
              </li>
            ))}
          </ul>
          {o.customer_note && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[0.8125rem] text-amber-900 ring-1 ring-inset ring-amber-200">Note: {o.customer_note}</p>}
          {staff && v.ok && <CollectButton token={o.view_token} brand={brand} name={staff.name} />}
          {staff && <a href={`/wholesale/orders/${o.id}`} className="mt-3 block text-center text-[0.8125rem] font-medium underline" style={{ color: brand }}>Open in EventureOS</a>}
        </div>

        {!o.collected_at && o.status !== "cancelled" && (
          <div className="mt-4 rounded-2xl bg-white p-5 text-center shadow-sm ring-1 ring-zinc-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt={`Pickup QR code for order ${o.number}`} className="mx-auto h-52 w-52" />
            <p className="mt-2 text-[0.8125rem] text-zinc-500">Show this QR code at the counter when you collect.</p>
          </div>
        )}
        <p className="mt-4 text-center text-[0.75rem] text-zinc-400">This pass is checked live against {org.name as string}&apos;s orders each time it&apos;s opened.</p>
      </div>
    </main>
  );
}
