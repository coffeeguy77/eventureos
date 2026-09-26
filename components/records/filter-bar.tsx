"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Search } from "lucide-react";
import { inputClass } from "@/components/ui/form";
import { cn } from "@/lib/cn";

export function FilterBar({ filters, searchPlaceholder = "Search…" }: {
  filters: { key: string; label: string; options: { value: string; label: string }[] }[];
  searchPlaceholder?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [pending, start] = useTransition();

  function set(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value); else next.delete(key);
    start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  useEffect(() => {
    const t = setTimeout(() => { if ((params.get("q") ?? "") !== q) set("q", q.trim()); }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className={cn("flex flex-col gap-2 transition-opacity sm:flex-row sm:flex-wrap sm:items-center", pending && "opacity-60")}>
      <div className="relative w-full sm:w-auto sm:min-w-[220px] sm:max-w-xs sm:flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder} className={cn(inputClass, "h-10 py-0 pl-9 sm:h-9")} />
      </div>
      {filters.length > 0 && (
        <div className="no-scrollbar flex gap-2 overflow-x-auto sm:contents">
          {filters.map((f) => (
            <select
              key={f.key}
              aria-label={f.label}
              value={params.get(f.key) ?? ""}
              onChange={(e) => set(f.key, e.target.value)}
              className={cn(inputClass, "h-10 w-auto shrink-0 py-0 pr-8 text-[13px] sm:h-9")}
            >
              <option value="">{f.label}: All</option>
              {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ))}
        </div>
      )}
    </div>
  );
}
