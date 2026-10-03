"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AppWindow, Mail, PanelRight, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { fmtDateTime } from "@/lib/format";
import { savePrefs } from "@/app/prefs-actions";
import { readCurrent } from "@/components/shell/personalise";

export interface DrawerMessage { id: string; direction: "inbound" | "outbound"; from: string; at: string; body: string }
export interface DrawerThread { id: string; subject: string; messages: DrawerMessage[] }

type Mode = "side" | "popup";
const W_KEY = "eos-email-panel-w";
const POP_KEY = "eos-email-popup";
const MIN_W = 320;
// Browser storage can be blocked (private windows) — it only remembers sizes, so failing quietly is fine
const load = <T,>(k: string, fallback: T): T => { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; } };
const keep = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* not remembered */ } };

/**
 * The customer's emails beside the quote, so details can be checked while pricing. Two ways to show it
 * (Personalise → "Customer emails on a quote", or the buttons in its header):
 *  - Side panel: its own column on the right — the quote moves over rather than being covered. Drag the left
 *    edge to make it wider or narrower.
 *  - Pop-up window: floats over the page; drag it by the title bar, resize from the corner.
 * Phones always get a full-width sheet.
 */
export function EmailDrawer({ threads, tz, open, onClose, highlightThread }: {
  threads: DrawerThread[]; tz: string; open: boolean; onClose: () => void; highlightThread?: string | null;
}) {
  const [active, setActive] = useState<string | null>(highlightThread ?? threads[0]?.id ?? null);
  const [mode, setMode] = useState<Mode>("side");
  const [width, setWidth] = useState(440);
  const [pop, setPop] = useState({ x: -1, y: -1, w: 560, h: 640 });
  const [desktop, setDesktop] = useState(false);
  const boxRef = useRef<HTMLElement>(null);

  useEffect(() => { if (highlightThread) setActive(highlightThread); }, [highlightThread]);
  useEffect(() => {
    setMode(document.documentElement.dataset.emails === "popup" ? "popup" : "side");
    setWidth(Math.max(MIN_W, Number(load(W_KEY, 440)) || 440));
    setPop((p) => ({ ...p, ...load(POP_KEY, {}) }));
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setDesktop(mq.matches);
    on(); mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);

  // Docked: give the panel its own column so nothing is hidden behind it
  const docked = open && desktop && mode === "side";
  useEffect(() => {
    const el = document.documentElement;
    if (docked) { el.dataset.panel = "side"; el.style.setProperty("--side-w", `${width}px`); }
    else { delete el.dataset.panel; }
    return () => { delete el.dataset.panel; };
  }, [docked, width]);

  const switchMode = (m: Mode) => {
    setMode(m);
    document.documentElement.dataset.emails = m;
    void savePrefs({ ...readCurrent(), emails: m }).catch(() => undefined);
  };

  // Side panel: drag the left edge to resize
  const startResize = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const max = Math.max(MIN_W + 80, Math.round(window.innerWidth * 0.6));
    let w = width;
    const move = (ev: PointerEvent) => { w = Math.min(max, Math.max(MIN_W, window.innerWidth - ev.clientX)); setWidth(w); };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); document.body.style.userSelect = ""; keep(W_KEY, w); };
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  }, [width]);

  // Pop-up: drag by the title bar
  const startDrag = useCallback((e: React.PointerEvent) => {
    if (mode !== "popup" || !desktop || (e.target as HTMLElement).closest("button")) return;
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) return;
    const dx = e.clientX - box.left, dy = e.clientY - box.top;
    let next = { x: box.left, y: box.top };
    const move = (ev: PointerEvent) => {
      next = { x: Math.min(window.innerWidth - 120, Math.max(0, ev.clientX - dx)), y: Math.min(window.innerHeight - 48, Math.max(0, ev.clientY - dy)) };
      setPop((p) => ({ ...p, ...next }));
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); document.body.style.userSelect = ""; setPop((p) => { keep(POP_KEY, { ...p, ...next }); return { ...p, ...next }; }); };
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  }, [mode, desktop]);

  // Pop-up: remember its size after a corner resize
  useEffect(() => {
    if (!open || mode !== "popup" || !desktop || !boxRef.current || typeof ResizeObserver === "undefined") return;
    const el = boxRef.current;
    let t: ReturnType<typeof setTimeout> | null = null;
    const ro = new ResizeObserver(() => {
      if (t) clearTimeout(t);
      t = setTimeout(() => setPop((p) => { const n = { ...p, w: el.offsetWidth, h: el.offsetHeight }; keep(POP_KEY, n); return n; }), 300);
    });
    ro.observe(el);
    return () => { ro.disconnect(); if (t) clearTimeout(t); };
  }, [open, mode, desktop]);

  if (!open) return null;
  const t = threads.find((x) => x.id === active) ?? threads[0];
  // Oldest first reads like the conversation happened; the first message is the original request
  const msgs = t ? [...t.messages].sort((a, b) => a.at.localeCompare(b.at)) : [];
  const floating = desktop && mode === "popup";
  const popStyle = floating ? {
    left: pop.x >= 0 ? Math.min(pop.x, window.innerWidth - 160) : undefined, top: pop.y >= 0 ? Math.min(pop.y, window.innerHeight - 80) : undefined,
    right: pop.x >= 0 ? undefined : 24, bottom: pop.y >= 0 ? undefined : 24,
    width: Math.min(pop.w, window.innerWidth - 32), height: Math.min(pop.h, window.innerHeight - 32),
  } : docked ? { width } : undefined;

  return (
    <aside ref={boxRef} aria-label="Customer's emails" style={popStyle}
      className={cn("fixed z-40 flex flex-col bg-surface",
        floating ? "min-h-[280px] min-w-[340px] resize overflow-hidden rounded-2xl shadow-2xl ring-1 ring-line-strong"
          : docked ? "bottom-0 right-0 top-0 border-l border-line shadow-[-8px_0_24px_-12px_rgb(var(--shadow)/0.25)]"
            : "inset-x-0 bottom-0 top-14 border-l border-line shadow-2xl sm:left-auto sm:w-[440px]")}>
      {docked && (
        <div role="separator" aria-orientation="vertical" aria-label="Drag to resize the email panel" title="Drag to resize"
          onPointerDown={startResize}
          className="absolute -left-1.5 top-0 z-10 h-full w-3 cursor-col-resize after:absolute after:left-1/2 after:top-1/2 after:h-10 after:w-1 after:-translate-x-1/2 after:-translate-y-1/2 after:rounded-full after:bg-line-strong hover:after:bg-brand-400" />
      )}
      <header onPointerDown={startDrag} className={cn("flex items-center gap-2 border-b border-line px-4 py-3", floating && "cursor-move select-none")}>
        <Mail className="h-4 w-4 shrink-0 text-brand-600" />
        <p className="min-w-0 flex-1 truncate text-[0.875rem] font-semibold text-ink">{t?.subject ?? "Emails"}</p>
        {desktop && (
          <div className="flex shrink-0 rounded-lg p-0.5 ring-1 ring-inset ring-line" role="radiogroup" aria-label="Show emails as">
            <button type="button" role="radio" aria-checked={mode === "side"} onClick={() => switchMode("side")} title="Side panel — the quote moves over"
              className={cn("rounded-md p-1.5", mode === "side" ? "bg-brand-50 text-brand-700" : "text-ink-faint hover:text-ink")}><PanelRight className="h-4 w-4" /><span className="sr-only">Side panel</span></button>
            <button type="button" role="radio" aria-checked={mode === "popup"} onClick={() => switchMode("popup")} title="Pop-up window — drag it anywhere"
              className={cn("rounded-md p-1.5", mode === "popup" ? "bg-brand-50 text-brand-700" : "text-ink-faint hover:text-ink")}><AppWindow className="h-4 w-4" /><span className="sr-only">Pop-up window</span></button>
          </div>
        )}
        <button type="button" onClick={onClose} className="shrink-0 rounded-md p-1.5 text-ink-faint hover:bg-zinc-100 hover:text-ink" aria-label="Close emails"><X className="h-4 w-4" /></button>
      </header>
      {threads.length > 1 && (
        <div className="flex flex-wrap gap-1.5 border-b border-line px-3 py-2">
          {threads.map((x) => (
            <button key={x.id} type="button" onClick={() => setActive(x.id)} title={x.subject}
              className={cn("max-w-full truncate rounded-full px-2.5 py-1 text-[0.75rem] ring-1 ring-inset", x.id === t?.id ? "bg-brand-50 text-brand-800 ring-brand-200" : "text-ink-muted ring-line hover:bg-zinc-50")}>
              {x.subject.length > 44 ? `${x.subject.slice(0, 44)}…` : x.subject}
            </button>
          ))}
        </div>
      )}
      <ol className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {msgs.length === 0 && <li className="text-[0.8125rem] text-ink-muted">No emails in this conversation yet.</li>}
        {msgs.map((m, i) => (
          <li key={m.id} className={cn("rounded-xl px-3 py-2.5 ring-1 ring-inset", m.direction === "outbound" ? "bg-brand-50/40 ring-brand-100" : "bg-surface ring-line")}>
            <p className="flex flex-wrap items-baseline gap-x-2 text-[0.75rem]">
              <span className="font-semibold text-ink">{m.from}</span>
              {i === 0 && <span className="rounded-full bg-brand-50 px-1.5 py-0.5 text-[0.6562rem] font-medium text-brand-700 ring-1 ring-inset ring-brand-100">Original</span>}
              <span className="ml-auto text-ink-faint">{fmtDateTime(m.at, tz)}</span>
            </p>
            {/* Selectable, so details can be copied straight into the quote */}
            <p className="mt-1.5 select-text whitespace-pre-line break-words text-[0.8125rem] leading-relaxed text-ink">{m.body}</p>
          </li>
        ))}
      </ol>
      <p className="border-t border-line px-4 py-2 text-[0.7188rem] text-ink-faint">
        {floating ? "Drag the title bar to move it, the corner to resize. Esc closes." : docked ? "Drag the left edge to resize. Select text to copy details into the quote. Esc closes." : "Select text to copy details into the quote. Press Esc to close."}
      </p>
    </aside>
  );
}
