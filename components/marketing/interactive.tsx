"use client";

import { useEffect, useRef, useState } from "react";
import { BellRing, CalendarCheck2, CreditCard, FileCheck2, Inbox, ShieldAlert } from "lucide-react";

const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/* ------------------------------------------------------------------ Hero: live activity */
const TOASTS = [
  { i: Inbox, t: "New enquiry from your website", d: "Corporate breakfast · 150 coffees · Sat" },
  { i: FileCheck2, t: "Quote Q-1042 accepted", d: "Emma Hart signed online · $3,597.00" },
  { i: ShieldAlert, t: "Short-notice booking", d: "Event is tomorrow — waiting for your approval" },
  { i: CalendarCheck2, t: "Added to Google Calendar", d: "Jess, Tom and the client invited" },
  { i: CreditCard, t: "Paid by card · $1,079.10", d: "Deposit INV-2302 — recorded in Xero" },
];

export function HeroActivity() {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduced()) return;
    const t = setInterval(() => setI((x) => (x + 1) % TOASTS.length), 3200);
    return () => clearInterval(t);
  }, []);
  const a = TOASTS[i], b = TOASTS[(i + 1) % TOASTS.length];
  return (
    <div aria-live="off" className="pointer-events-none absolute -right-3 top-[56%] z-10 hidden w-[300px] space-y-2.5 xl:-right-12 lg:block">
      {[a, b].map((x, k) => {
        const I = x.i;
        return (
          <div key={x.t + k} className="mk-toast flex items-start gap-3 rounded-2xl border border-white/10 bg-[#16151d]/90 p-3.5 text-white shadow-[0_24px_60px_-20px_rgba(0,0,0,.7)] backdrop-blur-md"
            style={{ animationDelay: `${k * 140}ms`, opacity: k ? 0.75 : 1, transform: k ? "scale(.96)" : undefined }}>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[#FF3D8B]/15 text-[#FF7AB8]"><I className="h-4 w-4" /></span>
            <span className="min-w-0"><span className="block text-[0.8125rem] font-semibold">{x.t}</span><span className="block text-[0.75rem] text-white/60">{x.d}</span></span>
            {k === 0 && <BellRing className="ml-auto h-3.5 w-3.5 shrink-0 text-white/40" />}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ Workflow: enquiry → completed event */
export interface Stage { id: string; step: string; title: string; body: string; points: string[]; visual: React.ReactNode }

export function WorkflowStory({ stages }: { stages: Stage[] }) {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => {
    const io = new IntersectionObserver((entries) => {
      const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (vis) setActive(Number((vis.target as HTMLElement).dataset.i));
    }, { rootMargin: "-40% 0px -45% 0px", threshold: [0, 0.25, 0.5, 1] });
    refs.current.forEach((r) => r && io.observe(r));
    return () => io.disconnect();
  }, []);

  return (
    <div className="relative grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
      {/* Steps (scrolling) */}
      <ol className="relative">
        <span aria-hidden className="absolute bottom-10 left-[15px] top-10 w-px bg-[rgb(var(--line)/var(--line-a))] lg:bottom-[31vh] lg:top-[31vh]">
          <span className="absolute left-0 top-0 w-px bg-gradient-to-b from-[rgb(var(--mk-pink))] to-[rgb(var(--mk-violet))] transition-[height] duration-700 ease-out"
            style={{ height: `${(active / Math.max(1, stages.length - 1)) * 100}%` }} />
        </span>
        {stages.map((s, i) => (
          <li key={s.id}>
            <div ref={(el) => { refs.current[i] = el; }} data-i={i} className="relative flex gap-5 py-8 lg:min-h-[62vh] lg:items-center lg:py-0">
              <span aria-hidden className={`relative z-10 mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full border text-[0.75rem] font-semibold transition-all duration-500 lg:mt-0 ${i <= active ? "border-transparent bg-[rgb(var(--accent))] text-white" : "border-[rgb(var(--line)/calc(var(--line-a)*2))] bg-[rgb(var(--bg))] text-[rgb(var(--faint))]"} ${i === active ? "mk-pulse" : ""}`}>{i + 1}</span>
              <div className={`min-w-0 flex-1 transition-opacity duration-500 ${i === active ? "opacity-100" : "lg:opacity-40"}`}>
                <p className="mk-eyebrow">{s.step}</p>
                <h3 className="mk-serif mt-2 text-[clamp(1.75rem,1.2rem+1.6vw,2.6rem)] leading-[1.05]">{s.title}</h3>
                <p className="mk-muted mt-3 max-w-[34rem] text-[1.0625rem] leading-relaxed">{s.body}</p>
                <ul className="mt-4 space-y-1.5 text-[0.9375rem]">
                  {s.points.map((p) => <li key={p} className="flex gap-2.5"><span aria-hidden className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-[rgb(var(--accent))]" />{p}</li>)}
                </ul>
                {/* Mobile: the visual sits with its step */}
                <div className="mt-6 lg:hidden">{s.visual}</div>
              </div>
            </div>
          </li>
        ))}
      </ol>
      {/* Visual (sticky, desktop) */}
      <div className="relative hidden lg:block">
        <div className="sticky top-[12vh] h-[76vh]">
          {stages.map((s, i) => (
            <div key={s.id} aria-hidden={i !== active}
              className={`absolute inset-0 flex items-center transition-all duration-700 ease-[cubic-bezier(.2,.7,.2,1)] ${i === active ? "opacity-100 [transform:none]" : i < active ? "pointer-events-none -translate-y-6 opacity-0" : "pointer-events-none translate-y-6 opacity-0"}`}>
              <div className="w-full">{s.visual}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Showcase tabs */
export interface ShowcaseTab { id: string; label: string; title: string; body: string; node: React.ReactNode }

export function Showcase({ tabs }: { tabs: ShowcaseTab[] }) {
  const [i, setI] = useState(0);
  const t = tabs[i];
  return (
    <div>
      <div role="tablist" aria-label="Explore EventureOS" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:justify-center sm:px-0">
        {tabs.map((x, k) => (
          <button key={x.id} role="tab" id={`tab-${x.id}`} aria-selected={k === i} aria-controls={`panel-${x.id}`} onClick={() => setI(k)}
            onKeyDown={(e) => { if (e.key === "ArrowRight") setI((k + 1) % tabs.length); if (e.key === "ArrowLeft") setI((k - 1 + tabs.length) % tabs.length); }}
            className={`shrink-0 rounded-full border px-4 py-2 text-[0.875rem] font-medium transition-colors ${k === i ? "border-transparent bg-[rgb(var(--accent))] text-white" : "border-[rgb(var(--line)/calc(var(--line-a)*2))] text-[rgb(var(--ink))] hover:bg-[rgb(var(--line)/.06)]"}`}>
            {x.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${t.id}`} aria-labelledby={`tab-${t.id}`} className="mt-10 grid items-center gap-8 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-14">
        <div key={t.id} className="mk-toast">
          <h3 className="mk-serif text-[clamp(1.9rem,1.3rem+1.6vw,2.8rem)] leading-[1.05]">{t.title}</h3>
          <p className="mk-muted mt-4 text-[1.0625rem] leading-relaxed">{t.body}</p>
        </div>
        <div key={t.id + "-v"} className="mk-toast">{t.node}</div>
      </div>
    </div>
  );
}
