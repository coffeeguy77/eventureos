"use client";
import { useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";

/** Genuine reviews, one at a time. Buttons and dots only — it never moves on its own. */
export function Testimonials({ items }: { items: { quote: string; name: string }[] }) {
  const [i, setI] = useState(0);
  const n = items.length;
  if (!n) return null;
  const t = items[i];
  const go = (d: number) => setI((x) => (x + d + n) % n);
  const btn = "grid h-12 w-12 shrink-0 place-items-center rounded-full border-[1.5px] border-[var(--ink)] text-[var(--ink)] transition-colors hover:bg-[var(--ink)] hover:text-[var(--card)]";
  return (
    <div role="region" aria-roledescription="carousel" aria-label="Client reviews">
      <div className="flex items-center gap-4 sm:gap-8">
        {n > 1 && <button type="button" onClick={() => go(-1)} className={`${btn} hidden sm:grid`} aria-label="Previous review"><ArrowLeft aria-hidden className="h-5 w-5" strokeWidth={2} /></button>}
        <figure key={i} aria-roledescription="slide" aria-label={`${i + 1} of ${n}`} className="ag-in mx-auto min-h-[15rem] max-w-[46rem] flex-1 text-center sm:min-h-[13rem]" aria-live="polite">
          <svg viewBox="0 0 64 48" aria-hidden className="mx-auto h-10 w-14 text-[var(--lime-ink)]"><path fill="currentColor" d="M27 4C13 9 4 19 4 31c0 8 5 13 11 13s11-5 11-11-4-10-9-10c1-6 6-11 13-14zM60 4C46 9 37 19 37 31c0 8 5 13 11 13s11-5 11-11-4-10-9-10c1-6 6-11 13-14z" /></svg>
          <blockquote className="ag-serif mt-5 text-[1.5rem] italic leading-[1.35] text-[var(--ink)] sm:text-[2rem]">{t.quote}</blockquote>
          <figcaption className="mt-6 text-[1rem] font-bold text-[var(--ink)]">{t.name} <span className="font-medium text-[var(--muted)]">· Google review</span></figcaption>
        </figure>
        {n > 1 && <button type="button" onClick={() => go(1)} className={`${btn} hidden sm:grid`} aria-label="Next review"><ArrowRight aria-hidden className="h-5 w-5" strokeWidth={2} /></button>}
      </div>
      {n > 1 && (
        <div className="mt-8 flex items-center justify-center gap-4">
          <button type="button" onClick={() => go(-1)} className={`${btn} sm:hidden`} aria-label="Previous review"><ArrowLeft aria-hidden className="h-5 w-5" strokeWidth={2} /></button>
          <div className="flex gap-1">
            {items.map((x, j) => (
              <button key={x.name} type="button" onClick={() => setI(j)} aria-label={`Review ${j + 1}: ${x.name}`} aria-current={j === i ? "true" : undefined} className="grid h-8 w-8 place-items-center">
                <span className={`block h-2.5 rounded-full transition-all ${j === i ? "w-7 bg-[var(--ink)]" : "w-2.5 bg-[rgba(20,45,35,.3)]"}`} />
              </button>
            ))}
          </div>
          <button type="button" onClick={() => go(1)} className={`${btn} sm:hidden`} aria-label="Next review"><ArrowRight aria-hidden className="h-5 w-5" strokeWidth={2} /></button>
        </div>
      )}
    </div>
  );
}
