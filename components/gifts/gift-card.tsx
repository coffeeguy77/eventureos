"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";

/**
 * A gift card / certificate that flips: the front is the finished artwork (or a blank artwork with our own wording printed on it),
 * the back carries who it's for, the personal message, who it's from, the value and the code.
 * Text sizes use container units, so the card looks the same at any width and when printed.
 */
export interface CardFront {
  art: string | null;
  /** Print this wording on the artwork (for blank artwork). Leave out when the artwork already has its wording. */
  words?: { eyebrow: string; title: string; subtitle: string; tagline: string } | null;
}
export interface CardBack {
  to: string | null; from: string | null; message: string | null;
  value: string; valueNote?: string | null; code?: string | null; expires?: string | null;
  business: string; redeem?: string | null; art?: string | null;
}

const FONTS = `
@font-face{font-family:'GC Script';src:url('/fonts/cert/PinyonScript-Regular.ttf') format('truetype');font-display:swap}
@font-face{font-family:'GC Serif';src:url('/fonts/cert/PlayfairDisplay-Variable.ttf') format('truetype');font-weight:400 900;font-display:swap}
@font-face{font-family:'GC Sans';src:url('/fonts/cert/Barlow-Regular.ttf') format('truetype');font-weight:400;font-display:swap}
@font-face{font-family:'GC Sans';src:url('/fonts/cert/Barlow-Medium.ttf') format('truetype');font-weight:500;font-display:swap}
@font-face{font-family:'GC Sans';src:url('/fonts/cert/Barlow-SemiBold.ttf') format('truetype');font-weight:600;font-display:swap}
.gc{container-type:inline-size;perspective:2400px}
.gc-inner{position:relative;width:100%;aspect-ratio:1489/1056;transition:transform .9s cubic-bezier(.3,.7,.2,1);transform-style:preserve-3d}
.gc[data-flipped] .gc-inner{transform:rotateY(180deg)}
.gc-face{position:absolute;inset:0;overflow:hidden;border-radius:2.2cqw;backface-visibility:hidden;-webkit-backface-visibility:hidden;background:#F7F2EA;box-shadow:0 2.5cqw 6cqw -2.5cqw rgba(40,25,15,.45),0 .3cqw .8cqw rgba(40,25,15,.12)}
.gc-back{transform:rotateY(180deg)}
.gc-script{font-family:'GC Script',cursive}
.gc-serif{font-family:'GC Serif',Georgia,serif}
.gc-sans{font-family:'GC Sans',system-ui,sans-serif}
@media (prefers-reduced-motion:reduce){.gc-inner{transition:none}}
@media print{
  .gc{perspective:none}
  .gc-inner{transform:none!important;aspect-ratio:auto;transform-style:flat}
  .gc-face{position:relative;inset:auto;aspect-ratio:1489/1056;box-shadow:none;border:1px dashed #bbb;break-inside:avoid;margin-bottom:6mm;transform:none!important;backface-visibility:visible}
  .gc-flip{display:none!important}
}
`;

export function GiftCard({ front, back, flipped: controlled, onFlip, className = "", label = "Flip card" }: {
  front: CardFront; back: CardBack; flipped?: boolean; onFlip?: (v: boolean) => void; className?: string; label?: string;
}) {
  const [own, setOwn] = useState(false);
  const flipped = controlled ?? own;
  const flip = () => { const v = !flipped; if (onFlip) onFlip(v); else setOwn(v); };
  return (
    <div className={className}>
      <style>{FONTS}</style>
      <div className="gc" data-flipped={flipped ? "" : undefined}>
        <div className="gc-inner">
          <Front f={front} />
          <Back b={back} />
        </div>
      </div>
      <div className="gc-flip mt-4 flex justify-center">
        <button type="button" onClick={flip} className="inline-flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-[0.875rem] font-semibold text-[#2A2522] shadow-sm ring-1 ring-black/10 backdrop-blur transition hover:bg-white">
          <RotateCcw className="h-4 w-4" />{flipped ? "See the front" : label}
        </button>
      </div>
    </div>
  );
}

function Front({ f }: { f: CardFront }) {
  return (
    <div className="gc-face" aria-label="Front of the card">
      {f.art ? <img src={f.art} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_80%_30%,color-mix(in_srgb,var(--b)_25%,#F7F2EA),#F7F2EA)]" />}
      {f.words && (
        <div className="absolute left-[6.1%] top-[37%] w-[62%] text-[#151210]">
          <p className="gc-sans font-medium uppercase" style={{ fontSize: "2.85cqw", letterSpacing: "0.32em" }}>{f.words.eyebrow}</p>
          <p className="gc-serif font-bold uppercase leading-[1]" style={{ fontSize: "8.1cqw", marginTop: "2.6cqw", letterSpacing: "-0.005em" }}>{f.words.title}</p>
          <p className="gc-sans font-medium uppercase" style={{ fontSize: "2.85cqw", letterSpacing: "0.32em", marginTop: "3.2cqw" }}>{f.words.subtitle}</p>
          <p className="gc-script" style={{ fontSize: "5.4cqw", marginTop: "8.4cqw", lineHeight: 1.1 }}>{f.words.tagline}</p>
        </div>
      )}
    </div>
  );
}

function Back({ b }: { b: CardBack }) {
  return (
    <div className="gc-face gc-back" aria-label="Back of the card">
      {b.art && <img src={b.art} alt="" className="absolute inset-0 h-full w-full object-cover opacity-[0.55]" style={{ transform: "scaleX(-1)" }} />}
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(247,242,234,.25)_0%,rgba(247,242,234,.92)_38%,rgba(247,242,234,.97)_100%)]" />
      <div className="absolute inset-y-[8%] left-[36%] right-[6%] flex flex-col text-[#1d1916]">
        <p className="gc-sans font-medium uppercase text-[#6d655e]" style={{ fontSize: "1.9cqw", letterSpacing: "0.3em" }}>To</p>
        <p className="gc-script leading-[1.05]" style={{ fontSize: "6.4cqw", minHeight: "6.6cqw" }}>{b.to || " "}</p>
        <div className="mt-[2.2cqw] h-px w-full bg-[#1d1916]/15" />
        <p className="gc-serif mt-[2.8cqw] flex-1 overflow-hidden whitespace-pre-line italic leading-[1.45] text-[#2c2622]" style={{ fontSize: b.message && b.message.length > 140 ? "2.55cqw" : "3.05cqw" }}>
          {b.message || <span className="text-[#2c2622]/35">Your message will appear here.</span>}
        </p>
        <p className="gc-sans font-medium uppercase text-[#6d655e]" style={{ fontSize: "1.9cqw", letterSpacing: "0.3em" }}>From</p>
        <p className="gc-script leading-[1.05]" style={{ fontSize: "5cqw", minHeight: "5.2cqw" }}>{b.from || " "}</p>
        <div className="mt-[2.4cqw] flex items-end justify-between gap-[2cqw] border-t border-[#1d1916]/15 pt-[2.2cqw]">
          <div className="min-w-0">
            <p className="gc-serif font-bold leading-none" style={{ fontSize: "4.4cqw" }}>{b.value}</p>
            {b.valueNote && <p className="gc-sans mt-[0.8cqw] text-[#6d655e]" style={{ fontSize: "1.75cqw" }}>{b.valueNote}</p>}
          </div>
          <div className="text-right">
            {b.code && <p className="gc-sans font-semibold tracking-[0.14em]" style={{ fontSize: "2.5cqw" }}>{b.code}</p>}
            <p className="gc-sans text-[#6d655e]" style={{ fontSize: "1.65cqw" }}>{[b.expires ? `Valid until ${b.expires}` : null, b.business].filter(Boolean).join(" · ")}</p>
          </div>
        </div>
        {b.redeem && <p className="gc-sans mt-[1.2cqw] text-[#6d655e]" style={{ fontSize: "1.6cqw" }}>{b.redeem}</p>}
      </div>
    </div>
  );
}
