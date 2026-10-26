"use client";

import { Check } from "lucide-react";
import { APPS, type AppKey } from "@/lib/apps";
import { cn } from "@/lib/cn";
import { AppIcon } from "./app-icon";

/** Tick the apps a business gets. `planApps` marks what their plan includes (anything else is an add-on). */
export function AppPicker({ value, onChange, planApps }: { value: AppKey[]; onChange: (v: AppKey[]) => void; planApps?: AppKey[] }) {
  const on = new Set(value);
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-2 text-[0.75rem]">
        {planApps && <button type="button" onClick={() => onChange([...planApps])} className="rounded-full bg-zinc-100 px-2.5 py-1 font-medium text-ink-muted hover:bg-zinc-200 hover:text-ink">Use the plan&apos;s apps</button>}
        <button type="button" onClick={() => onChange(APPS.map((a) => a.key))} className="rounded-full bg-zinc-100 px-2.5 py-1 font-medium text-ink-muted hover:bg-zinc-200 hover:text-ink">All</button>
        <button type="button" onClick={() => onChange([])} className="rounded-full bg-zinc-100 px-2.5 py-1 font-medium text-ink-muted hover:bg-zinc-200 hover:text-ink">Core only</button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {APPS.map((a) => {
          const ticked = on.has(a.key);
          const addOn = ticked && planApps && !planApps.includes(a.key);
          return (
            <button key={a.key} type="button" role="checkbox" aria-checked={ticked}
              onClick={() => onChange(ticked ? value.filter((k) => k !== a.key) : [...value, a.key])}
              className={cn("flex items-start gap-3 rounded-xl p-3 text-left ring-1 transition-colors", ticked ? "bg-brand-50 ring-brand-300" : "bg-surface ring-line hover:bg-zinc-50")}>
              <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", ticked ? "bg-brand-500 text-on-brand" : "bg-zinc-100 text-ink-muted")}><AppIcon icon={a.icon} className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-[0.8438rem] font-semibold text-ink">{a.name}{addOn && <span className="rounded-full bg-amber-100 px-1.5 text-[0.6875rem] font-semibold text-amber-900">Add-on</span>}</span>
                <span className="block text-[0.75rem] text-ink-muted">{a.tagline}</span>
              </span>
              <span className={cn("mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-md ring-1", ticked ? "bg-brand-500 text-on-brand ring-brand-500" : "ring-line-strong")}>{ticked && <Check className="h-3.5 w-3.5" />}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
