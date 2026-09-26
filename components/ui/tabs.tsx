"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

/** Keep the active tab in view when the tab bar scrolls horizontally (phones). */
function useActiveInView(active: string) {
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = nav.current?.querySelector<HTMLElement>("[aria-current=page]");
    const box = nav.current;
    if (!el || !box || box.scrollWidth <= box.clientWidth) return;
    const left = el.getBoundingClientRect().left - box.getBoundingClientRect().left + box.scrollLeft;
    if (left < box.scrollLeft || left + el.offsetWidth > box.scrollLeft + box.clientWidth) {
      box.scrollLeft = Math.max(0, left - (box.clientWidth - el.offsetWidth) / 2);
    }
  }, [active]);
  return nav;
}

export function Tabs({ tabs, active, baseHref }: {
  tabs: { key: string; label: string; count?: number }[]; active: string; baseHref: string;
}) {
  const nav = useActiveInView(active);
  return (
    <nav ref={nav} className="no-scrollbar -mx-4 -mb-px flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0" aria-label="Tabs">
      {tabs.map((t) => {
        const isActive = t.key === active;
        const href = t.key === tabs[0].key ? baseHref : `${baseHref}?tab=${t.key}`;
        return (
          <Link
            key={t.key}
            href={href}
            scroll={false}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 pb-3 pt-2 sm:pb-2.5 sm:pt-1 text-[13px] font-medium transition-colors",
              isActive ? "border-brand-500 text-ink" : "border-transparent text-ink-muted hover:text-ink"
            )}
          >
            {t.label}
            {t.count != null && t.count > 0 && (
              <span className={cn("rounded-full px-1.5 text-[11px]", isActive ? "bg-brand-50 text-brand-700" : "bg-zinc-100 text-ink-muted")}>
                {t.count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
