import Link from "next/link";
import { Store, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { STATUS_LABEL, STATUS_TONE, bookingBrand, type HireSettings } from "@/lib/hire/core";
import type { BookingListRow } from "@/lib/hire/server";
import { money } from "@/lib/format";

const when = (iso: string, tz: string) => new Intl.DateTimeFormat("en-AU", { timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
export const hireWhen = when;

/** One hire booking in a list: client, number, status, dates, how it gets there and what's on it. */
export function BookingRow({ b, tz, currency, note, showMoney = true, hire }: { b: BookingListRow; tz: string; currency: string; note?: React.ReactNode; showMoney?: boolean; hire?: Pick<HireSettings, "brands" | "itemBrands"> }) {
  const brand = hire && hire.brands.length > 1 ? bookingBrand(hire, b.lines) : null;
  const units = b.lines.reduce((a, l) => a + Number(l.quantity), 0);
  return (
    <li>
      <Link href={`/rentals/bookings/${b.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-zinc-50/70 sm:px-5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-zinc-100 text-ink-muted" title={b.fulfilment === "deliver" ? "Delivery" : "Customer collects"}>
          {b.fulfilment === "deliver" ? <Truck className="h-4 w-4" /> : <Store className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1 basis-56">
          <p className="flex flex-wrap items-center gap-2 text-[0.8438rem] font-medium text-ink">
            {b.customer?.name ?? "No client"}<span className="text-[0.75rem] font-normal text-ink-faint">{b.number}</span>
            <Badge tone={STATUS_TONE[b.status]}>{STATUS_LABEL[b.status]}</Badge>
            {brand && hire && brand.key !== hire.brands[0].key && <Badge tone="neutral">{brand.name}</Badge>}
            {note}
          </p>
          <p className="truncate text-[0.75rem] text-ink-muted">{b.title ? `${b.title} · ` : ""}{b.lines.slice(0, 4).map((l) => `${Number(l.quantity)} × ${l.name}`).join(", ")}{b.lines.length > 4 ? ` +${b.lines.length - 4} more` : ""}{!b.lines.length ? "No items" : ""}</p>
        </div>
        <div className="text-[0.75rem] text-ink-muted sm:text-right">
          <p>{when(b.starts_at, tz)} → {when(b.ends_at, tz)}</p>
          <p className="text-ink-faint">{units} item{units === 1 ? "" : "s"}{b.fulfilment === "deliver" && b.address ? ` · ${b.address.split(/\n|,/)[0]}` : ""}</p>
        </div>
        {showMoney && <p className="w-24 text-right text-[0.8438rem] font-medium tabular-nums text-ink">{money(b.total, currency)}</p>}
      </Link>
    </li>
  );
}
