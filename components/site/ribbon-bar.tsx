"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Check, Copy, Sparkles, X } from "lucide-react";

const two = (n: number) => String(n).padStart(2, "0");

/** The offer ribbon's moving parts: copy the code, live countdown, close for this visit. */
export function RibbonBar({ code, headline, short, deal, href, endsAt, endsLabel }: { code: string; headline: string | null; short: string; deal: string; href: string; endsAt: number | null; endsLabel: string | null }) {
  const [now, setNow] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [hidden, setHidden] = useState(false);
  const key = `offer-ribbon-${code}`;
  useEffect(() => {
    try { if (sessionStorage.getItem(key) === "1") setHidden(true); } catch { /* private mode */ }
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [key]);
  if (hidden) return null;
  const left = endsAt && now ? Math.max(0, endsAt - now) : null;
  if (left === 0) return null;
  // A live countdown in the last 14 days; before that just the end date
  const countdown = left !== null && left < 14 * 86400e3
    ? (() => { const s = Math.floor(left / 1000); const d = Math.floor(s / 86400); return d > 0 ? `${d}d ${two(Math.floor(s / 3600) % 24)}h ${two(Math.floor(s / 60) % 60)}m` : `${two(Math.floor(s / 3600))}:${two(Math.floor(s / 60) % 60)}:${two(s % 60)}`; })()
    : null;
  const copy = async () => { try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* not allowed */ } };
  return (
    <div role="region" aria-label="Special offer" className="relative overflow-hidden bg-[var(--b)] text-[var(--on-b)]">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(100deg,transparent_20%,rgba(255,255,255,.22)_50%,transparent_80%)] bg-[length:250%_100%] motion-safe:animate-[ribbon-shine_6s_ease-in-out_infinite]" />
      <style>{`@keyframes ribbon-shine{0%,60%{background-position:120% 0}100%{background-position:-120% 0}}`}</style>
      <div className="relative mx-auto flex min-h-[46px] max-w-[1536px] flex-wrap items-center justify-center gap-x-4 gap-y-1 px-12 py-2 text-center text-[0.875rem] sm:px-14">
        <span className="inline-flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 shrink-0" strokeWidth={2} />
          {headline && <span className="font-semibold">{headline}</span>}
          {headline && <span className="sm:hidden">· {short}</span>}
          <span className={headline ? "hidden sm:inline" : ""}>{headline ? "· " : ""}{deal}</span>
        </span>
        <button type="button" onClick={copy} title="Copy the code" className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-current bg-white/15 px-2 py-0.5 font-mono text-[0.8125rem] font-bold tracking-[0.12em] transition hover:bg-white/25">
          {code}{copied ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <Copy className="h-3.5 w-3.5 opacity-80" />}
        </button>
        {countdown ? <span className="hidden tabular-nums md:inline" aria-live="off">Ends in <span className="font-semibold">{countdown}</span></span>
          : endsLabel ? <span className="hidden md:inline">Ends {endsLabel}</span> : null}
        <a href={href} className="inline-flex items-center gap-1 rounded-full bg-white px-3.5 py-1 text-[0.8125rem] font-semibold text-[#1A1614] shadow-sm transition hover:translate-x-0.5">Claim offer<ArrowRight className="h-3.5 w-3.5" /></a>
      </div>
      <button type="button" aria-label="Hide this offer" onClick={() => { setHidden(true); try { sessionStorage.setItem(key, "1"); } catch { /* private mode */ } }}
        className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full opacity-80 hover:bg-white/15 hover:opacity-100"><X className="h-4 w-4" /></button>
    </div>
  );
}
