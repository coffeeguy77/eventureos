"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

export function ClientTabs({ tabs, className, variant = "pills" }: {
  tabs: { key: string; label: string; count?: number; tone?: "alert"; content: React.ReactNode }[];
  className?: string;
  variant?: "pills" | "underline";
}) {
  const firstWithItems = tabs.find((t) => (t.count ?? 1) > 0) ?? tabs[0];
  const [active, setActive] = useState(firstWithItems?.key);
  const current = tabs.find((t) => t.key === active) ?? tabs[0];
  return (
    <div className={className}>
      <div className={cn("no-scrollbar flex gap-1 overflow-x-auto px-4", variant === "underline" ? "border-b border-line" : "pb-2")} role="tablist">
        {tabs.map((t) => {
          const on = t.key === current.key;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={on}
              onClick={() => setActive(t.key)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[12.5px] font-medium transition-colors",
                variant === "underline"
                  ? cn("-mb-px border-b-2 px-2.5 pb-2 pt-1", on ? "border-brand-500 text-ink" : "border-transparent text-ink-muted hover:text-ink")
                  : cn("rounded-full px-3 py-1.5", on ? "bg-ink text-white" : "text-ink-muted hover:bg-zinc-100 hover:text-ink")
              )}
            >
              {t.label}
              {t.count != null && (
                <span className={cn(
                  "rounded-full px-1.5 text-[10.5px] font-semibold",
                  on && variant === "pills" ? "bg-white/20 text-white"
                    : t.tone === "alert" && t.count > 0 ? "bg-rose-100 text-rose-700"
                      : t.count > 0 ? "bg-brand-50 text-brand-700" : "bg-zinc-100 text-ink-faint"
                )}>{t.count}</span>
              )}
            </button>
          );
        })}
      </div>
      <div role="tabpanel">{current.content}</div>
    </div>
  );
}
