"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/cn";

/** The broker portal's and client form's own light / dark / auto choice (remembered on this device). */
export const PORTAL_SCHEME_COOKIE = "eos-portal-scheme";
type Choice = "light" | "dark" | "system";

export function SchemeToggle({ className }: { className?: string }) {
  const [v, setV] = useState<Choice>("light");
  useEffect(() => {
    const cur = document.documentElement.getAttribute("data-scheme");
    setV(cur === "dark" || cur === "system" ? cur : "light");
  }, []);
  const pick = (c: Choice) => {
    setV(c);
    document.documentElement.setAttribute("data-scheme", c);
    document.cookie = `${PORTAL_SCHEME_COOKIE}=${c}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  };
  const opts: { id: Choice; label: string; Icon: typeof Sun }[] = [
    { id: "light", label: "Light", Icon: Sun }, { id: "dark", label: "Dark", Icon: Moon }, { id: "system", label: "Auto (follow this device)", Icon: Monitor },
  ];
  return (
    <div role="radiogroup" aria-label="Appearance" className={cn("inline-flex items-center gap-0.5 rounded-full bg-canvas p-0.5 ring-1 ring-inset ring-line print:hidden", className)}>
      {opts.map(({ id, label, Icon }) => (
        <button key={id} type="button" role="radio" aria-checked={v === id} aria-label={label} title={label} onClick={() => pick(id)}
          className={cn("grid h-7 w-7 place-items-center rounded-full transition-colors", v === id ? "bg-surface text-ink shadow-sm ring-1 ring-inset ring-line" : "text-ink-faint hover:text-ink")}>
          <Icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}
