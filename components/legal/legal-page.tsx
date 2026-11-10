import Link from "next/link";
import type { ReactNode } from "react";

/** Operator details shown on the privacy policy and terms. */
export const OPERATOR = {
  name: "Web Culture",
  legal: "Bean Culture trading as Web Culture",
  place: "Canberra, Australia",
  email: "hello@webculture.au",
};
export const LEGAL_UPDATED = "10 November 2026";

/** A plain, readable page for the privacy policy and terms (works in light and dark). */
export function LegalPage({ title, intro, children }: { title: string; intro: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link href="/" className="text-[1.0625rem] font-bold tracking-tight text-ink">EventureOS</Link>
          <nav className="flex gap-4 text-[0.875rem] text-ink-muted">
            <Link href="/privacy" className="hover:text-ink">Privacy</Link>
            <Link href="/terms" className="hover:text-ink">Terms</Link>
            <Link href="/login" className="hover:text-ink">Sign in</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="text-[1.75rem] font-bold leading-tight sm:text-[2rem]">{title}</h1>
        <p className="mt-2 text-[0.875rem] text-ink-muted">Last updated {LEGAL_UPDATED}</p>
        <div className="mt-5 text-[0.9688rem] leading-relaxed text-ink-muted">{intro}</div>
        <div className="legal mt-8 space-y-8 text-[0.9375rem] leading-relaxed text-ink-muted [&_a]:text-brand-700 [&_a]:underline dark:[&_a]:text-brand-300 [&_h2]:mb-2 [&_h2]:text-[1.1875rem] [&_h2]:font-semibold [&_h2]:text-ink [&_h3]:mb-1 [&_h3]:mt-4 [&_h3]:font-semibold [&_h3]:text-ink [&_li]:mt-1 [&_p+p]:mt-3 [&_strong]:text-ink [&_ul]:list-disc [&_ul]:pl-5">
          {children}
        </div>
        <p className="mt-12 border-t border-line pt-6 text-[0.8125rem] text-ink-faint">EventureOS is operated by {OPERATOR.legal}, {OPERATOR.place}. Questions: <a href={`mailto:${OPERATOR.email}`} className="underline">{OPERATOR.email}</a></p>
      </main>
    </div>
  );
}
