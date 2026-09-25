import { Package } from "lucide-react";
import { cn } from "@/lib/cn";
import { fmtDate, money } from "@/lib/format";
import type { QuoteSnapshotData } from "./types";

/**
 * The quote exactly as the customer sees it. Renders a build_quote_snapshot() / quote_versions.snapshot
 * payload, so the preview, the version history and the portal all show the same thing.
 */
export function QuoteDocument({ snap, currency = "AUD", orgName, quoteNumber, customerName, eventLabel, versionLabel, compact = false }: {
  snap: QuoteSnapshotData;
  currency?: string;
  orgName?: string;
  quoteNumber?: number;
  customerName?: string;
  eventLabel?: string;
  versionLabel?: string;
  compact?: boolean;
}) {
  const sections = snap.sections ?? [];
  const optionalTotal = sections.reduce((a, s) => a + s.items.filter((i) => i.optional)
    .reduce((b, i) => b + Number(i.line_total) * (1 + Number(i.tax_rate ?? 0) / 100), 0), 0);
  const pad = compact ? "px-5" : "px-6 sm:px-10";

  return (
    <article className={cn("bg-white text-ink", !compact && "rounded-xl border border-line shadow-card")}>
      {!compact && (
        <header className={cn(pad, "border-b border-line pb-6 pt-8")}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              {orgName && <p className="text-[13px] font-semibold text-ink">{orgName}</p>}
              <h2 className="mt-3 text-[22px] font-semibold tracking-tight">{snap.title}</h2>
              {eventLabel && <p className="mt-1 text-[13px] text-ink-muted">{eventLabel}</p>}
            </div>
            <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-[12.5px]">
              {quoteNumber != null && <><dt className="text-ink-faint">Quote</dt><dd className="tabular text-right font-medium">Q-{quoteNumber}</dd></>}
              {versionLabel && <><dt className="text-ink-faint">Version</dt><dd className="text-right">{versionLabel}</dd></>}
              <dt className="text-ink-faint">Issued</dt><dd className="text-right">{fmtDate(snap.issue_date)}</dd>
              <dt className="text-ink-faint">Valid until</dt><dd className="text-right">{fmtDate(snap.expiry_date)}</dd>
            </dl>
          </div>
          {customerName && (
            <p className="mt-5 text-[12.5px] text-ink-muted">Prepared for <span className="font-medium text-ink">{customerName}</span></p>
          )}
        </header>
      )}

      <div className={cn(pad, compact ? "pb-2" : "py-6")}>
        {sections.length === 0 && <p className="py-6 text-center text-[13px] text-ink-muted">This quote has no items yet.</p>}
        {sections.map((s, si) => (
          <section key={si} className="mb-6 last:mb-2">
            <div className="mb-2 flex items-baseline justify-between gap-3 border-b border-line pb-1.5">
              <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">{s.title}</h3>
              {s.optional && <span className="text-[11.5px] font-medium text-brand-700">Optional extras</span>}
            </div>
            {s.description && <p className="mb-2 whitespace-pre-line text-[12.5px] text-ink-muted">{s.description}</p>}
            <ul className="divide-y divide-line">
              {s.items.map((it, ii) => (
                <li key={ii} className="flex gap-3 py-2.5">
                  {it.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.image_url} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover ring-1 ring-line" loading="lazy" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 text-[13.5px] font-medium">
                      {it.name}
                      {it.package && <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-1.5 py-0.5 text-[10.5px] font-medium text-brand-700"><Package className="h-3 w-3" />Package</span>}
                      {it.optional && !s.optional && <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10.5px] font-medium text-ink-muted">Optional</span>}
                    </p>
                    {it.description && <p className="mt-0.5 whitespace-pre-line text-[12.5px] text-ink-muted">{it.description}</p>}
                    <p className="tabular mt-0.5 text-[12px] text-ink-faint">
                      {Number(it.quantity)}{it.unit ? ` ${it.unit}` : ""} × {money(it.unit_price, currency)}
                      {Number(it.discount_percent ?? 0) > 0 && <span className="text-emerald-700"> · {Number(it.discount_percent)}% off</span>}
                    </p>
                  </div>
                  <p className={cn("tabular shrink-0 text-right text-[13.5px]", it.optional ? "text-ink-muted" : "font-medium")}>{money(it.line_total, currency)}</p>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <dl className="ml-auto mt-4 w-full max-w-[300px] space-y-1.5 border-t border-line pt-3 text-[13px]">
          <div className="flex justify-between"><dt className="text-ink-muted">Subtotal (ex GST)</dt><dd className="tabular">{money(snap.subtotal, currency)}</dd></div>
          <div className="flex justify-between"><dt className="text-ink-muted">GST</dt><dd className="tabular">{money(snap.tax_total, currency)}</dd></div>
          <div className="flex justify-between border-t border-line pt-1.5 text-[15px] font-semibold"><dt>Total (inc GST)</dt><dd className="tabular">{money(snap.total, currency)}</dd></div>
          {optionalTotal > 0 && (
            <div className="flex justify-between pt-1 text-[12px] text-ink-muted"><dt>Optional extras (not included)</dt><dd className="tabular">{money(optionalTotal, currency)}</dd></div>
          )}
        </dl>

        {(snap.notes || snap.terms) && (
          <div className="mt-8 grid gap-6 border-t border-line pt-5 sm:grid-cols-2">
            {snap.notes && (
              <div>
                <h4 className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">Notes</h4>
                <p className="mt-1.5 whitespace-pre-line text-[12.5px] leading-relaxed text-ink-muted">{snap.notes}</p>
              </div>
            )}
            {snap.terms && (
              <div className={cn(!snap.notes && "sm:col-span-2")}>
                <h4 className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">Terms &amp; conditions</h4>
                <p className="mt-1.5 whitespace-pre-line text-[12px] leading-relaxed text-ink-muted">{snap.terms}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
