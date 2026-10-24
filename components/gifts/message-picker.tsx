"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { GIFT_MESSAGES, occasionFor, occasionsFor, type GiftKind, type Occasion } from "@/lib/gifts/messages";

/**
 * Ready-made messages above the message box. Tap an occasion for its first message; tap it again (or use the arrows)
 * for the next — it loops. The message stays fully editable. The occasion for the time of year is chosen to start with.
 */
export function MessagePicker({ kind, today, value, onChange, onPick }: { kind: GiftKind; today: string; value: string; onChange: (message: string) => void; /** after they choose one (e.g. turn the card over) */ onPick?: () => void }) {
  const list = occasionsFor(today);
  const [occ, setOcc] = useState<Occasion>(() => occasionFor(today));
  const [idx, setIdx] = useState(0);
  const msgs = GIFT_MESSAGES[kind][occ];
  // Start with the season's first message, unless they've already written something
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!value.trim()) onChange(GIFT_MESSAGES[kind][occasionFor(today)][0]);
  }, [kind, today, value, onChange]);

  const show = (o: Occasion, i: number) => { const m = GIFT_MESSAGES[kind][o]; const n = ((i % m.length) + m.length) % m.length; setOcc(o); setIdx(n); onChange(m[n]); onPick?.(); };
  const tap = (o: Occasion) => show(o, o === occ ? idx + 1 : 0);
  const edited = !!value.trim() && value.trim() !== msgs[idx];

  return (
    <div className="mb-2.5">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Message ideas">
        {list.map((o) => {
          const on = o.id === occ;
          return (
            <button key={o.id} type="button" onClick={() => tap(o.id)} aria-pressed={on} title={on ? "Tap again for another message" : undefined}
              className={`rounded-full px-3 py-1.5 text-[0.8125rem] font-medium ring-1 transition ${on ? "bg-[var(--b)] text-[var(--on-b,#fff)] ring-[var(--b)]" : "bg-white text-[#3A3431] ring-[#E2D8D2] hover:ring-[var(--b)]"}`}>
              {o.label}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 text-[0.8125rem] text-[#6E6560]">
        <span className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-[var(--b)]" />
          {edited ? "Your own words — tap an occasion for ideas" : <>{list.find((o) => o.id === occ)?.label} · {idx + 1} of {msgs.length}</>}
        </span>
        <span className="flex items-center gap-1">
          <button type="button" onClick={() => show(occ, idx - 1)} aria-label="Previous message" className="grid h-8 w-8 place-items-center rounded-full bg-white ring-1 ring-[#E2D8D2] hover:ring-[var(--b)]"><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" onClick={() => show(occ, idx + 1)} aria-label="Next message" className="grid h-8 w-8 place-items-center rounded-full bg-white ring-1 ring-[#E2D8D2] hover:ring-[var(--b)]"><ChevronRight className="h-4 w-4" /></button>
        </span>
      </div>
    </div>
  );
}
