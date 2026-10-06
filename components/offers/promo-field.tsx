"use client";

import { useEffect, useRef, useState } from "react";
import { BadgePercent, Check, Loader2, X } from "lucide-react";
import type { OfferCheck } from "@/app/book/actions";

export type AppliedOffer = { code: string; discount: number; label: string };

/**
 * "Have a promo code?" — opens to a code box with Apply. Shows the applied offer with what it takes off.
 * `check` asks the server (prices never come from the browser). `recheckKey` changes when the price changes
 * (date, seats, gift choice) so the discount is worked out again. `initial` (from a ?code= link) is applied straight away.
 */
export function PromoField({ check, applied, onChange, recheckKey, initial, money, tone = "default", disabled }: {
  check: (code: string) => Promise<OfferCheck>;
  applied: AppliedOffer | null;
  onChange: (o: AppliedOffer | null) => void;
  recheckKey: string;
  initial?: string | null;
  money: (n: number) => string;
  tone?: "default" | "warm";
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(!!initial);
  const [code, setCode] = useState(initial ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const wanted = useRef<string | null>(initial?.trim() ? initial : null);

  const run = async (c: string, quiet = false) => {
    if (!c.trim()) return;
    setBusy(true); if (!quiet) setErr(null);
    const r = await check(c.trim()).catch(() => ({ ok: false as const, error: "Couldn't check that code — try again." }));
    setBusy(false);
    if (r.ok) { onChange({ code: r.code, discount: r.discount, label: r.label }); setErr(null); wanted.current = r.code; }
    else { onChange(null); setErr(r.error); }
  };

  // Work the discount out again when the price changes (and apply a code from a link once there's a price)
  useEffect(() => {
    if (disabled) return;
    const c = applied?.code ?? wanted.current;
    if (c) void run(c, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recheckKey, disabled]);

  const box = tone === "warm"
    ? "h-[46px] w-full rounded-lg border border-[#E2D8D2] bg-[#FCFAF8] px-3.5 text-[0.9375rem] uppercase tracking-[0.08em] text-[#1E1A18] placeholder:normal-case placeholder:tracking-normal placeholder:text-[#8C8480] focus:border-[var(--b)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--b)_22%,transparent)]"
    : "h-12 w-full rounded-xl border border-line-strong bg-surface px-3.5 text-base uppercase tracking-wider text-ink placeholder:normal-case placeholder:tracking-normal placeholder:text-ink-faint focus:border-[var(--b)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--b)_25%,transparent)]";

  if (applied) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-dashed border-[var(--b)] bg-[color-mix(in_srgb,var(--b)_8%,white)] px-3.5 py-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--b)] text-white"><Check className="h-[18px] w-[18px]" strokeWidth={3} /></span>
        <span className="min-w-0 flex-1 text-[0.875rem] leading-tight">
          <span className="block font-semibold text-[#1E1A18]"><span className="font-mono tracking-wider">{applied.code}</span> applied — {money(applied.discount)} off</span>
          <span className="block truncate text-[#6E6560]">{applied.label}</span>
        </span>
        <button type="button" onClick={() => { onChange(null); wanted.current = null; setCode(""); }} aria-label="Remove code" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[#6E6560] hover:bg-white"><X className="h-4 w-4" /></button>
      </div>
    );
  }
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-2 text-[0.875rem] font-semibold text-[var(--b)] hover:underline">
        <BadgePercent className="h-[18px] w-[18px]" strokeWidth={1.8} />Have a promo code?
      </button>
    );
  }
  return (
    <div>
      <label htmlFor="promo-code" className="mb-1.5 block text-[0.8125rem] font-medium text-[#1E1A18]">Promo code</label>
      <div className="flex gap-2">
        <input id="promo-code" className={box} value={code} onChange={(e) => { setCode(e.target.value.toUpperCase()); setErr(null); }} placeholder="Enter your code" autoCapitalize="characters" autoComplete="off" maxLength={40}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void run(code); } }} />
        <button type="button" onClick={() => void run(code)} disabled={busy || disabled || code.trim().length < 2}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[#1E1A18] px-5 text-[0.9375rem] font-semibold text-white disabled:opacity-40">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}Apply
        </button>
      </div>
      {err && <p role="alert" className="mt-1.5 text-[0.8125rem] font-medium text-rose-700">{err}</p>}
    </div>
  );
}
