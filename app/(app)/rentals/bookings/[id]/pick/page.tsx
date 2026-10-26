import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/context";
import { PrintButton } from "@/components/kitchen/editors";
import { STATUS_LABEL, bookingBrand, readHireSettings, type HireStatus } from "@/lib/hire/core";
import { loadItems } from "@/lib/hire/server";

export const metadata = { title: "Pick list" };
export const dynamic = "force-dynamic";

/** Pick list and delivery docket: what to load (packages broken into their items, with shelf locations), tick boxes, and sign-off. */
export default async function PickListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, org } = await requireOrg();
  const { data: b } = await supabase.from("hire_bookings")
    .select("number, status, title, starts_at, ends_at, fulfilment, address, delivery_at, pickup_at, notes, internal_notes, reference, customer:customers(name, phone, email), lines:hire_booking_lines(item_id, name, kind, quantity, sort, line_total)")
    .eq("id", id).eq("organisation_id", org.id).maybeSingle();
  if (!b) notFound();
  const items = new Map((await loadItems(supabase, org.id)).map((i) => [i.id, i]));
  const tz = org.timezone;
  const f = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-AU", { timeZone: tz, weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso)) : "—");
  type L = { item_id: string | null; name: string; kind: string; quantity: number; sort: number };
  const lines = ((b.lines ?? []) as L[]).filter((l) => l.kind !== "misc").sort((x, y) => x.sort - y.sort);
  const brand = bookingBrand(readHireSettings(org.settings), (b.lines ?? []) as { item_id: string | null; line_total: number }[]);
  const c = b.customer as unknown as { name: string; phone: string | null; email: string | null } | null;
  const rows: { name: string; qty: number; code: string | null; loc: string | null; sub?: boolean }[] = [];
  for (const l of lines) {
    const it = l.item_id ? items.get(l.item_id) : undefined;
    rows.push({ name: l.name, qty: l.quantity, code: it?.code ?? null, loc: it?.location ?? null });
    if (it?.kind === "package") for (const p of it.package_lines) { const ci = items.get(p.item_id); if (ci) rows.push({ name: ci.name, qty: p.qty * l.quantity, code: ci.code, loc: ci.location, sub: true }); }
  }
  const box = <span className="inline-block h-4 w-4 rounded-sm border border-zinc-400" />;
  return (
    <div className="mx-auto max-w-3xl bg-white p-6 text-[0.8125rem] text-zinc-900 print:p-0">
      <div className="mb-4 flex items-start justify-between gap-4 print:hidden"><p className="text-zinc-500">Print this for the warehouse and the driver.</p><PrintButton /></div>
      <div className="flex items-start justify-between gap-4 border-b border-zinc-300 pb-3">
        <div><p className="text-[1.25rem] font-bold">{b.fulfilment === "deliver" ? "Delivery docket" : "Pick list"} · {b.number}</p><p className="text-zinc-600">{brand?.name ?? org.name}</p></div>
        <p className="text-right text-zinc-600">{STATUS_LABEL[b.status as HireStatus]}{b.reference ? <><br />Ref {b.reference}</> : null}</p>
      </div>
      <div className="grid grid-cols-2 gap-4 border-b border-zinc-300 py-3">
        <div><p className="text-[0.6875rem] font-semibold uppercase text-zinc-500">Client</p><p className="font-semibold">{c?.name ?? "—"}</p><p>{c?.phone ?? ""}</p>{b.title && <p className="text-zinc-600">{b.title}</p>}</div>
        <div><p className="text-[0.6875rem] font-semibold uppercase text-zinc-500">{b.fulfilment === "deliver" ? "Deliver to" : "Client collects"}</p>
          {b.fulfilment === "deliver" ? <><p className="whitespace-pre-line font-semibold">{b.address}</p><p>Deliver {f(b.delivery_at ?? b.starts_at)}</p><p>Collect {f(b.pickup_at ?? b.ends_at)}</p></> : <><p>Out {f(b.starts_at)}</p><p>Back {f(b.ends_at)}</p></>}</div>
      </div>
      <table className="mt-3 w-full">
        <thead><tr className="border-b border-zinc-300 text-left text-[0.6875rem] uppercase text-zinc-500"><th className="py-1.5">Item</th><th>Code</th><th>Location</th><th className="text-center">Qty</th><th className="text-center">Picked</th><th className="text-center">Loaded</th><th className="text-center">Back</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-zinc-200">
              <td className={`py-2 ${r.sub ? "pl-5 text-zinc-600" : "font-semibold"}`}>{r.sub ? "↳ " : ""}{r.name}</td>
              <td className="text-zinc-600">{r.code ?? ""}</td><td className="text-zinc-600">{r.loc ?? ""}</td>
              <td className="text-center font-semibold tabular-nums">{r.qty}</td>
              <td className="text-center">{box}</td><td className="text-center">{box}</td><td className="text-center">{box}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {(b.notes || b.internal_notes) && <div className="mt-4 space-y-2">{b.notes && <p><span className="font-semibold">Notes: </span><span className="whitespace-pre-line">{b.notes}</span></p>}{b.internal_notes && <p><span className="font-semibold">Team notes: </span><span className="whitespace-pre-line">{b.internal_notes}</span></p>}</div>}
      <div className="mt-10 grid grid-cols-2 gap-8 text-zinc-600">
        <div><div className="h-10 border-b border-zinc-400" /><p className="mt-1">Received by (name, signature)</p></div>
        <div><div className="h-10 border-b border-zinc-400" /><p className="mt-1">Date and time</p></div>
      </div>
    </div>
  );
}
