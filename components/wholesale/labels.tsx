"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Minus, Plus, Printer } from "lucide-react";
import type { Box, BoxLine } from "@/lib/wholesale/rules";
import { cn } from "@/lib/cn";

export interface LabelOrder {
  id: string; number: string; delivery: string | null; customer: string; attention: string | null; phone: string | null;
  address: string[]; instructions: string | null; lines: BoxLine[]; boxes: Box[];
}
interface Label { order: LabelOrder; n: number; of: number; box: Box | null }

const day = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`)) : "");
const kg = (n: number) => `${Number(n.toFixed(2))} kg`;

/**
 * Box labels: one per box (coffee packed into boxes of the business's box size, plus a box for other items),
 * marked "1 of 3", "2 of 3"… The count can be changed per order before printing.
 *  4×6": one label per page, for a label printer (e.g. DYMO LabelWriter 4XL with 4×6" / 104×159 mm labels).
 *  A4: four labels to a sheet (105 × 148 mm each) with cut lines — plain paper or 4-up label sheets.
 */
export function LabelSheet({ orders, size, business, boxKg, back, query }: {
  orders: LabelOrder[]; size: "4x6" | "a4"; business: { name: string; logo: string | null }; boxKg: number; back: string; query: string;
}) {
  const [counts, setCounts] = useState<Record<string, number>>(() => Object.fromEntries(orders.map((o) => [o.id, Math.max(1, o.boxes.length)])));
  const [contents, setContents] = useState(true);
  const labels = useMemo<Label[]>(() => orders.flatMap((o) => {
    const of = counts[o.id] ?? 1;
    const asPacked = of === o.boxes.length;
    return Array.from({ length: of }, (_, i) => ({ order: o, n: i + 1, of, box: asPacked ? o.boxes[i] : null }));
  }), [orders, counts]);
  const pages = size === "a4" ? Array.from({ length: Math.ceil(labels.length / 4) }, (_, i) => labels.slice(i * 4, i * 4 + 4)) : labels.map((l) => [l]);

  return (
    <div className="min-h-screen bg-zinc-100 print:bg-white">
      <style>{`${size === "a4" ? "@page { size: A4; margin: 0 }" : "@page { size: 4in 6in; margin: 0 }"} @media print { html, body { background: #fff !important } }`}</style>
      <div className="mx-auto max-w-5xl px-4 py-5 print:hidden">
        <div className="flex flex-wrap items-center gap-3">
          <Link href={back} className="inline-flex items-center gap-1 text-[0.8125rem] font-medium text-zinc-600 hover:text-zinc-900"><ArrowLeft className="h-4 w-4" />Back</Link>
          <h1 className="text-[1.25rem] font-semibold text-zinc-900">Box labels</h1>
          <div className="flex rounded-lg bg-white p-0.5 ring-1 ring-zinc-200">
            {(["4x6", "a4"] as const).map((s) => <Link key={s} href={`/print/wholesale-labels?${query}&size=${s}`} className={cn("rounded-md px-3 py-1.5 text-[0.8125rem] font-medium", s === size ? "bg-zinc-900 text-white" : "text-zinc-600 hover:text-zinc-900")}>{s === "4x6" ? "4×6\" label printer" : "A4 sheet (4 per page)"}</Link>)}
          </div>
          <label className="flex items-center gap-1.5 text-[0.8125rem] text-zinc-700"><input type="checkbox" className="h-4 w-4" checked={contents} onChange={(e) => setContents(e.target.checked)} />Show what&apos;s in each box</label>
          <button type="button" onClick={() => window.print()} disabled={!labels.length} className="ml-auto inline-flex h-9 items-center gap-2 rounded-lg bg-violet-600 px-4 text-[0.8125rem] font-semibold text-white hover:bg-violet-700 disabled:opacity-50"><Printer className="h-4 w-4" />Print {labels.length} label{labels.length === 1 ? "" : "s"}</button>
        </div>
        <p className="mt-2 text-[0.75rem] text-zinc-500">
          {size === "4x6" ? "In the print window choose your label printer, paper size 4×6\" (104 × 159 mm), margins None, scale 100%." : "In the print window choose A4, margins None, scale 100%. Cut along the dotted lines, or print on 4-per-sheet A4 labels."}
          {" "}One label per {kg(boxKg)} box of coffee, plus one for other items — change the box size in Wholesale → Settings.
        </p>
        {orders.length === 0 ? <p className="mt-6 rounded-xl bg-white p-6 text-[0.875rem] text-zinc-600 ring-1 ring-zinc-200">No orders to label.</p> : (
          <ul className="mt-4 divide-y divide-zinc-100 rounded-xl bg-white ring-1 ring-zinc-200">
            {orders.map((o) => {
              const c = counts[o.id] ?? 1;
              const coffee = o.boxes.filter((b) => b.kind === "coffee").reduce((t, b) => t + b.kg, 0);
              return (
                <li key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-[0.8125rem]">
                  <span className="min-w-0 flex-1 basis-56"><span className="font-medium text-zinc-900">{o.customer}</span> <span className="text-zinc-500">{o.number}</span>
                    <span className="block text-[0.75rem] text-zinc-500">{coffee ? `${kg(coffee)} coffee` : "No coffee"}{o.boxes.some((b) => b.kind === "other") ? " · other items" : ""} · {o.boxes.length || 1} box{(o.boxes.length || 1) === 1 ? "" : "es"} suggested</span></span>
                  <span className="flex items-center gap-1">
                    <button type="button" aria-label={`Fewer labels for ${o.customer}`} onClick={() => setCounts({ ...counts, [o.id]: Math.max(1, c - 1) })} className="grid h-8 w-8 place-items-center rounded-md ring-1 ring-zinc-200 hover:bg-zinc-50"><Minus className="h-3.5 w-3.5" /></button>
                    <span className="w-16 text-center font-semibold tabular-nums text-zinc-900">{c} label{c === 1 ? "" : "s"}</span>
                    <button type="button" aria-label={`More labels for ${o.customer}`} onClick={() => setCounts({ ...counts, [o.id]: Math.min(30, c + 1) })} className="grid h-8 w-8 place-items-center rounded-md ring-1 ring-zinc-200 hover:bg-zinc-50"><Plus className="h-3.5 w-3.5" /></button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap justify-center gap-6 px-4 pb-10 print:block print:gap-0 print:p-0">
        {pages.map((page, i) => size === "a4" ? (
          <div key={i} className="grid h-[297mm] w-[210mm] shrink-0 grid-cols-2 grid-rows-2 bg-white shadow-lg print:shadow-none" style={{ breakAfter: i < pages.length - 1 ? "page" : "auto" }}>
            {page.map((l, j) => <div key={j} className="h-[148.5mm] w-[105mm] overflow-hidden border border-dashed border-zinc-300 p-[6mm]"><LabelFace l={l} business={business} contents={contents} /></div>)}
          </div>
        ) : (
          <div key={i} className="h-[6in] w-[4in] shrink-0 overflow-hidden bg-white p-[0.22in] shadow-lg print:shadow-none" style={{ breakAfter: i < pages.length - 1 ? "page" : "auto" }}>
            <LabelFace l={page[0]} business={business} contents={contents} />
          </div>
        ))}
      </div>
    </div>
  );
}

function LabelFace({ l, business, contents }: { l: Label; business: { name: string; logo: string | null }; contents: boolean }) {
  const o = l.order;
  const items = l.box ? l.box.items : null;
  return (
    <div className="flex h-full flex-col text-black">
      <div className="flex items-start justify-between gap-3 border-b-2 border-black pb-2">
        <div className="min-w-0">
          {business.logo
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={business.logo} alt={business.name} className="h-9 max-w-[1.8in] object-contain object-left" />
            : <p className="text-[11pt] font-bold">{business.name}</p>}
          <p className="mt-1 text-[8.5pt]">{o.number}{o.delivery ? ` · Delivery ${day(o.delivery)}` : ""}</p>
        </div>
        <div className="shrink-0 rounded-md border-2 border-black px-2 py-1 text-center leading-none">
          <p className="text-[7.5pt] font-semibold uppercase tracking-wide">Box</p>
          <p className="mt-0.5 whitespace-nowrap text-[20pt] font-extrabold">{l.n}<span className="text-[11pt] font-bold"> of {l.of}</span></p>
        </div>
      </div>
      <div className="mt-3">
        <p className="text-[8pt] font-semibold uppercase tracking-wide">Deliver to</p>
        <p className="mt-0.5 text-[19pt] font-extrabold leading-tight">{o.customer}</p>
        {o.attention && <p className="text-[10pt]">Attn: {o.attention}</p>}
        {o.address.map((a, i) => <p key={i} className="text-[11.5pt] leading-snug">{a}</p>)}
        {o.phone && <p className="mt-0.5 text-[10pt]">{o.phone}</p>}
        {o.instructions && <p className="mt-2 border-l-4 border-black pl-2 text-[9.5pt] font-semibold leading-snug">{o.instructions}</p>}
      </div>
      {contents && (
        <div className="mt-auto border-t border-black pt-2">
          <p className="text-[8pt] font-semibold uppercase tracking-wide">{l.box ? (l.box.kind === "coffee" ? `In this box · ${kg(l.box.kg)} coffee` : "In this box · other items") : "Order"}</p>
          <ul className="mt-0.5 text-[9.5pt] leading-snug">
            {(items ?? o.lines.map((x) => ({ name: x.name, quantity: x.quantity }))).slice(0, 9).map((x, i) => <li key={i}><b>{x.quantity} ×</b> {x.name}</li>)}
            {(items ?? o.lines).length > 9 && <li>+ {(items ?? o.lines).length - 9} more</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
