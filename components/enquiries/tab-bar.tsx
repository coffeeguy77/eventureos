"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, SlidersHorizontal } from "lucide-react";
import { savePrefs } from "@/app/prefs-actions";
import { readCurrent } from "@/components/shell/personalise";
import { DEFAULT_ENQ_TABS } from "@/lib/theme/prefs";
import { cn } from "@/lib/cn";

export interface EnquiryTab { key: string; label: string; count: number; href: string }

const pill = (on: boolean) => cn("flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.7812rem] font-medium",
  on ? "bg-ink text-surface" : "bg-surface text-ink-muted ring-1 ring-inset ring-line hover:text-ink");

/** Status tabs: the ones you chose, "More" for the rest, and "Choose tabs" to change which show. Wraps — never off-screen. */
export function EnquiryTabBar({ tabs, pinned, active }: { tabs: EnquiryTab[]; pinned: string[]; active: string }) {
  const router = useRouter();
  const [menu, setMenu] = useState<null | "more" | "edit">(null);
  const [chosen, setChosen] = useState<string[]>(pinned);
  const [pending, start] = useTransition();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => setChosen(pinned), [pinned]);
  useEffect(() => {
    if (!menu) return;
    const down = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setMenu(null); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(null); };
    document.addEventListener("mousedown", down); window.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); window.removeEventListener("keydown", key); };
  }, [menu]);

  // The tab you're on always shows, even if it isn't one of your chosen ones
  const shown = tabs.filter((t) => pinned.includes(t.key) || t.key === active);
  const rest = tabs.filter((t) => !shown.includes(t));
  const save = (next: string[]) => {
    const list = next.length ? next : DEFAULT_ENQ_TABS;
    setChosen(list);
    document.documentElement.dataset.enqTabs = list.join(",");
    start(async () => { await savePrefs({ ...readCurrent(), enqTabs: list }).catch(() => undefined); router.refresh(); });
  };

  return (
    <div ref={box} className="relative mb-4 flex flex-wrap items-center gap-1.5">
      {shown.map((t) => (
        <Link key={t.key} href={t.href} scroll={false} className={pill(t.key === active)}>
          {t.label}<span className={cn("text-[0.6875rem]", t.key === active ? "text-surface/70" : "text-ink-faint")}>{t.count}</span>
        </Link>
      ))}
      {rest.length > 0 && (
        <button type="button" onClick={() => setMenu(menu === "more" ? null : "more")} aria-expanded={menu === "more"} className={pill(false)}>
          More<ChevronDown className="h-3.5 w-3.5" />
        </button>
      )}
      <button type="button" onClick={() => setMenu(menu === "edit" ? null : "edit")} aria-expanded={menu === "edit"} title="Choose which tabs show"
        className="ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[0.75rem] font-medium text-ink-muted hover:bg-zinc-100 hover:text-ink">
        <SlidersHorizontal className="h-3.5 w-3.5" /><span className="max-sm:sr-only">Choose tabs</span>
      </button>

      {menu === "more" && (
        <div className="absolute left-0 top-full z-30 mt-1.5 w-60 rounded-xl bg-surface p-1.5 shadow-pop ring-1 ring-line">
          {rest.map((t) => (
            <Link key={t.key} href={t.href} scroll={false} onClick={() => setMenu(null)}
              className="flex items-center justify-between rounded-lg px-2.5 py-2 text-[0.8125rem] text-ink hover:bg-zinc-50">
              {t.label}<span className="text-[0.75rem] text-ink-faint">{t.count}</span>
            </Link>
          ))}
        </div>
      )}
      {menu === "edit" && (
        <div className="absolute right-0 top-full z-30 mt-1.5 w-64 rounded-xl bg-surface p-3 shadow-pop ring-1 ring-line">
          <p className="text-[0.8125rem] font-semibold text-ink">Tabs to show</p>
          <p className="mb-2 text-[0.72rem] text-ink-muted">The rest are under “More”. Saved to your account.</p>
          <ul className="space-y-0.5">
            {tabs.map((t) => {
              const on = chosen.includes(t.key);
              return (
                <li key={t.key}>
                  <button type="button" disabled={pending} onClick={() => save(on ? chosen.filter((k) => k !== t.key) : [...chosen, t.key])}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[0.8125rem] text-ink hover:bg-zinc-50">
                    <span className={cn("grid h-4 w-4 shrink-0 place-items-center rounded ring-1 ring-inset", on ? "bg-brand-500 text-white ring-brand-500" : "ring-line-strong")}>{on && <Check className="h-3 w-3" />}</span>
                    <span className="flex-1">{t.label}</span><span className="text-[0.72rem] text-ink-faint">{t.count}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <button type="button" disabled={pending} onClick={() => save(DEFAULT_ENQ_TABS)} className="mt-2 text-[0.75rem] font-medium text-brand-700 hover:underline">Back to the default tabs</button>
        </div>
      )}
    </div>
  );
}
