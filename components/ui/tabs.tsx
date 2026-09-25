import Link from "next/link";
import { cn } from "@/lib/cn";

export function Tabs({ tabs, active, baseHref }: {
  tabs: { key: string; label: string; count?: number }[]; active: string; baseHref: string;
}) {
  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto border-b border-line" aria-label="Tabs">
      {tabs.map((t) => {
        const isActive = t.key === active;
        const href = t.key === tabs[0].key ? baseHref : `${baseHref}?tab=${t.key}`;
        return (
          <Link
            key={t.key}
            href={href}
            scroll={false}
            className={cn(
              "flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 pb-2.5 pt-1 text-[13px] font-medium transition-colors",
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
