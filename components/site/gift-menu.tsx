"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, Coffee, GraduationCap } from "lucide-react";

/** "Gift Certificates" in the site menu: a small dropdown — Barista lessons or Coffee. */
export function GiftMenu({ label, items, light, active, itemClass }: {
  label: string; light: boolean; active: boolean; itemClass: string;
  items: { kind: "lessons" | "coffee"; href: string; label: string; note: string }[];
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <span ref={box} className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((o) => !o)} className={`${itemClass} gap-1`}>
        {label}<ChevronDown className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`} />
        {active && <span className="absolute inset-x-3 bottom-0 h-[3px] rounded-t-full bg-[color-mix(in_srgb,var(--b)_70%,#ff0a6c)] max-sm:inset-x-2 max-sm:bottom-1 max-sm:h-[2px]" />}
      </button>
      {open && (
        <span role="menu" className={`fixed right-3 top-[52px] z-[60] w-[260px] rounded-2xl p-2 shadow-[0_24px_48px_-20px_rgba(0,0,0,.45)] ring-1 sm:absolute sm:right-0 sm:top-full ${light ? "bg-white ring-[#EDE3DB]" : "bg-[#1E1819] ring-white/10"}`}>
          {items.map((i) => {
            const I = i.kind === "coffee" ? Coffee : GraduationCap;
            return (
              <Link key={i.href} role="menuitem" href={i.href} onClick={() => setOpen(false)} data-track={`Gift menu: ${i.label}`}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition ${light ? "hover:bg-[#FBF1F3]" : "hover:bg-white/[0.06]"}`}>
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${light ? "bg-[color-mix(in_srgb,var(--b)_14%,white)]" : "bg-white/10"} text-[color-mix(in_srgb,var(--b)_55%,#ff0a6c)]`}><I className="h-[18px] w-[18px]" /></span>
                <span><span className={`block text-[0.9375rem] font-semibold ${light ? "text-[#151312]" : "text-white"}`}>{i.label}</span><span className={`block text-[0.8125rem] ${light ? "text-[#5E5853]" : "text-white/60"}`}>{i.note}</span></span>
              </Link>
            );
          })}
        </span>
      )}
    </span>
  );
}
