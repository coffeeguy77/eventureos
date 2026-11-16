"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

/** Page tabs that follow the address (#overview, #documents …), so links anywhere on the page can open a tab. Printing shows every tab. */
export function LoanTabs({ tabs, panels }: { tabs: { key: string; label: string; badge?: number }[]; panels: Record<string, React.ReactNode> }) {
  const [active, setActive] = useState(tabs[0].key);
  useEffect(() => {
    const read = () => {
      const h = window.location.hash.slice(1);
      if (tabs.some((t) => t.key === h)) { setActive(h); window.scrollTo({ top: 0, behavior: "smooth" }); }
      else if (h) { const host = tabs.find((t) => document.getElementById(`panel-${t.key}`)?.querySelector(`#${CSS.escape(h)}`)); if (host) { setActive(host.key); setTimeout(() => document.getElementById(h)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); } }
    };
    read(); window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [tabs]);
  return (
    <>
      <nav className="-mb-px flex gap-1 overflow-x-auto border-b border-line print:hidden" role="tablist">
        {tabs.map((t) => (
          <a key={t.key} href={`#${t.key}`} role="tab" aria-selected={active === t.key}
            className={cn("inline-flex shrink-0 items-center gap-2 border-b-2 px-3 pb-3 pt-1 text-[0.9375rem] font-medium",
              active === t.key ? "border-emerald-700 text-ink" : "border-transparent text-ink-muted hover:text-ink")}>
            {t.label}{t.badge ? <span className="rounded-full bg-emerald-50 px-2 text-[0.75rem] font-semibold text-emerald-800">{t.badge}</span> : null}
          </a>
        ))}
      </nav>
      {tabs.map((t) => (
        <div key={t.key} id={`panel-${t.key}`} role="tabpanel" className={cn("pt-5", active === t.key ? "block" : "hidden print:block")}>{panels[t.key]}</div>
      ))}
    </>
  );
}

/** Export: the browser's print dialog (Save as PDF) — every tab prints. */
export function PrintButton({ className, children }: { className?: string; children: React.ReactNode }) {
  return <button type="button" onClick={() => window.print()} className={className}>{children}</button>;
}
