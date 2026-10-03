"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Check, Minus, Palette, Plus, RotateCcw, X } from "lucide-react";
import { savePrefs } from "@/app/prefs-actions";
import { ACCENTS, DEFAULT_PREFS, htmlAttrs, parsePrefs, SCHEMES, TEXT_STEPS, type UiPrefs } from "@/lib/theme/prefs";
import { cn } from "@/lib/cn";

export function readCurrent(): UiPrefs {
  const el = document.documentElement;
  const fs = Number(getComputedStyle(el).getPropertyValue("--fs")) || DEFAULT_PREFS.text / 100;
  return parsePrefs({ scheme: el.dataset.scheme, accent: el.dataset.accent, contrast: el.dataset.contrast, motion: el.dataset.motion, width: el.dataset.width, emails: el.dataset.emails, text: Math.round(fs * 100) });
}

export function applyPrefs(p: UiPrefs) {
  const el = document.documentElement;
  const a = htmlAttrs(p);
  el.dataset.scheme = a["data-scheme"]; el.dataset.accent = a["data-accent"]; el.dataset.contrast = a["data-contrast"]; el.dataset.motion = a["data-motion"]; el.dataset.width = a["data-width"]; el.dataset.emails = a["data-emails"];
  el.style.setProperty("--fs", String(p.text / 100));
}

/** Brings the account's saved display settings to a new device (once), without a flash on later loads. */
export function PrefsSync({ saved }: { saved: unknown }) {
  useEffect(() => {
    if (!saved || document.cookie.includes("eos-ui=")) return;
    const p = parsePrefs(saved);
    applyPrefs(p);
    void savePrefs(p, false);
  }, [saved]);
  return null;
}

/** "Personalise" — appearance, accent colour, text size, contrast and motion. Saved to this browser and your account. */
export function Personalise({ variant = "icon" }: { variant?: "icon" | "row" }) {
  const [open, setOpen] = useState(false);
  const [p, setP] = useState<UiPrefs>(DEFAULT_PREFS);
  const [, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Phones: the panel is portalled to <body> so the blurred top bar can't clip or confine it
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const on = () => setPhone(mq.matches);
    on(); mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setP(readCurrent()); }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener("keydown", onKey); document.addEventListener("mousedown", onDown);
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDown); };
  }, [open]);

  function update(patch: Partial<UiPrefs>) {
    const next = parsePrefs({ ...p, ...patch });
    setP(next);
    applyPrefs(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => start(() => { void savePrefs(next); }), 400);
  }
  const ti = TEXT_STEPS.indexOf(p.text);

  const seg = (label: string, value: string, options: [string, string][], onPick: (v: string) => void) => (
    <div className="py-3">
      <p className="mb-2 text-[0.8125rem] font-semibold text-ink">{label}</p>
      <div className="flex gap-1.5" role="radiogroup" aria-label={label}>
        {options.map(([v, l]) => (
          <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onPick(v)}
            className={cn("h-9 flex-1 rounded-lg text-[0.8125rem] font-medium ring-1 ring-inset", value === v ? "bg-brand-50 text-brand-800 ring-brand-300" : "text-ink-muted ring-line-strong hover:text-ink")}>{l}</button>
        ))}
      </div>
    </div>
  );

  return (
    <div ref={ref} className={cn("relative", variant === "row" && "w-full")}>
      {variant === "icon" ? (
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Personalise display" title="Personalise display"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted hover:bg-zinc-100 hover:text-ink">
          <Palette className="h-[1.15rem] w-[1.15rem]" />
        </button>
      ) : (
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
          className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-[0.875rem] font-medium text-ink hover:bg-zinc-50">
          <Palette className="h-5 w-5 text-ink-muted" /> Personalise display
        </button>
      )}
      {(() => {
        const ui = (
          <>
      {open && (
        // Phones: a full-width bottom sheet over a backdrop. Larger screens: a dropdown under the icon.
        <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="fixed inset-0 z-[69] bg-black/40 sm:hidden" />
      )}
      {open && (
        <div ref={panelRef} role="dialog" aria-modal={phone || undefined} aria-label="Personalise your display"
          className={cn("z-[70] flex flex-col overflow-hidden border border-line bg-surface shadow-pop",
            "fixed inset-x-0 bottom-0 max-h-[88dvh] rounded-t-2xl pb-[env(safe-area-inset-bottom)]",
            variant === "icon" ? "sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-11 sm:max-h-none sm:w-[22rem] sm:max-w-[calc(100vw-1.5rem)] sm:rounded-xl sm:pb-0"
              : "sm:inset-x-3 sm:bottom-24 sm:mx-auto sm:w-[22rem] sm:rounded-xl sm:pb-0")}>
          <div aria-hidden className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-line-strong sm:hidden" />
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-4 py-3">
            <div>
              <p className="text-[0.9rem] font-semibold text-ink">Personalise your display</p>
              <p className="text-[0.75rem] text-ink-muted">Saved to this browser and your account.</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="-m-1.5 rounded-md p-2.5 text-ink-faint hover:bg-zinc-100 hover:text-ink sm:m-0 sm:p-1"><X className="h-5 w-5 sm:h-4 sm:w-4" /></button>
          </div>
          <div className="min-h-0 flex-1 divide-y divide-line overflow-y-auto overscroll-contain px-4 sm:max-h-[70vh] sm:flex-none">
            <div className="py-3">
              <p className="mb-2 text-[0.8125rem] font-semibold text-ink">Appearance</p>
              <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="Appearance">
                {SCHEMES.map((s) => (
                  <button key={s.id} type="button" role="radio" aria-checked={p.scheme === s.id} title={s.hint} onClick={() => update({ scheme: s.id })}
                    className={cn("flex flex-col items-center gap-1 rounded-lg p-1.5 text-[0.6875rem] font-medium ring-1 ring-inset", p.scheme === s.id ? "text-brand-800 ring-2 ring-brand-400" : "text-ink-muted ring-line-strong hover:text-ink")}>
                    <span className="flex h-7 w-full overflow-hidden rounded-md ring-1 ring-black/10">
                      <span className="h-full w-1/2" style={{ background: s.swatch[0] }} />
                      <span className="h-full w-1/2" style={{ background: s.swatch[1] }} />
                    </span>
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="py-3">
              <p className="mb-2 text-[0.8125rem] font-semibold text-ink">Accent colour</p>
              <div className="grid grid-cols-7 gap-2 justify-items-center sm:justify-items-start" role="radiogroup" aria-label="Accent colour">
                {ACCENTS.map((a) => (
                  <button key={a.id} type="button" role="radio" aria-checked={p.accent === a.id} aria-label={a.name} title={a.name} onClick={() => update({ accent: a.id })}
                    className={cn("relative aspect-square w-full max-w-[2.5rem] rounded-full ring-offset-2 ring-offset-surface sm:h-8 sm:w-8", p.accent === a.id ? "ring-2 ring-ink" : "hover:ring-2 hover:ring-line-strong")}
                    style={{ background: a.hex }}>
                    {p.accent === a.id && <Check className="absolute inset-0 m-auto h-4 w-4 text-white mix-blend-difference" />}
                  </button>
                ))}
              </div>
            </div>
            <div className="py-3">
              <p className="mb-2 text-[0.8125rem] font-semibold text-ink">Text size</p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => ti > 0 && update({ text: TEXT_STEPS[ti - 1] })} disabled={ti <= 0} aria-label="Smaller text"
                  className="inline-flex h-9 w-11 items-center justify-center rounded-lg text-ink ring-1 ring-inset ring-line-strong hover:bg-zinc-50 disabled:opacity-40"><Minus className="h-4 w-4" /><span className="sr-only">A−</span></button>
                <div className="flex h-9 flex-1 items-center justify-center rounded-lg bg-zinc-50 text-[0.875rem] font-semibold tabular-nums text-ink" aria-live="polite">{p.text}%</div>
                <button type="button" onClick={() => ti < TEXT_STEPS.length - 1 && update({ text: TEXT_STEPS[ti + 1] })} disabled={ti >= TEXT_STEPS.length - 1} aria-label="Larger text"
                  className="inline-flex h-9 w-11 items-center justify-center rounded-lg text-ink ring-1 ring-inset ring-line-strong hover:bg-zinc-50 disabled:opacity-40"><Plus className="h-4 w-4" /><span className="sr-only">A+</span></button>
              </div>
            </div>
            {seg("Page width", p.width, [["standard", "Standard"], ["wide", "Wide"], ["full", "Full width"]], (v) => update({ width: v as UiPrefs["width"] }))}
            {seg("Customer emails on a quote", p.emails, [["side", "Side panel"], ["popup", "Pop-up window"]], (v) => update({ emails: v as UiPrefs["emails"] }))}
            {seg("Contrast", p.contrast, [["normal", "Standard"], ["more", "Increased"]], (v) => update({ contrast: v as UiPrefs["contrast"] }))}
            {seg("Motion", p.motion, [["full", "Full"], ["reduce", "Reduced"]], (v) => update({ motion: v as UiPrefs["motion"] }))}
          </div>
          <div className="flex shrink-0 justify-end border-t border-line px-4 py-2.5">
            <button type="button" onClick={() => update(DEFAULT_PREFS)} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[0.8125rem] font-medium text-ink-muted hover:bg-zinc-100 hover:text-ink">
              <RotateCcw className="h-3.5 w-3.5" />Reset to defaults
            </button>
          </div>
        </div>
      )}
          </>
        );
        return phone && open ? createPortal(ui, document.body) : ui;
      })()}
    </div>
  );
}
