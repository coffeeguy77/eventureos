"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Pt = { x: number; y: number };

/**
 * Sign with a finger, stylus or mouse. Strokes are drawn in the page's ink colour (so it reads in dark mode) and
 * exported as a transparent PNG in dark navy, the way it appears on the signed PDF.
 */
export function SignaturePad({ onChange, disabled, label }: { onChange: (png: string | null) => void; disabled?: boolean; label: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Pt[][]>([]);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  const paint = useCallback((c: HTMLCanvasElement, colour: string, scale = window.devicePixelRatio || 1) => {
    const ctx = c.getContext("2d")!; const w = c.width / scale, h = c.height / scale;
    ctx.setTransform(scale, 0, 0, scale, 0, 0); ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = colour; ctx.fillStyle = colour; ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (const s of strokes.current) {
      if (s.length === 1) { ctx.beginPath(); ctx.arc(s[0].x * w, s[0].y * h, 1.2, 0, Math.PI * 2); ctx.fill(); continue; }
      ctx.beginPath(); ctx.moveTo(s[0].x * w, s[0].y * h);
      for (const p of s.slice(1)) ctx.lineTo(p.x * w, p.y * h);
      ctx.stroke();
    }
  }, []);
  const redraw = useCallback(() => { const c = cv.current; if (c) paint(c, getComputedStyle(c).color || "#111"); }, [paint]);
  const fit = useCallback(() => {
    const c = cv.current, box = wrap.current; if (!c || !box) return;
    const r = window.devicePixelRatio || 1;
    c.width = Math.round(box.clientWidth * r); c.height = Math.round(box.clientHeight * r);
    redraw();
  }, [redraw]);
  useEffect(() => { fit(); const ro = new ResizeObserver(fit); if (wrap.current) ro.observe(wrap.current); return () => ro.disconnect(); }, [fit]);

  const at = (e: React.PointerEvent): Pt => { const b = cv.current!.getBoundingClientRect(); return { x: Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)), y: Math.min(1, Math.max(0, (e.clientY - b.top) / b.height)) }; };
  const finish = () => {
    if (!drawing.current) return; drawing.current = false;
    // export: navy on transparent, 2x the on-screen size, for the PDF
    const box = wrap.current!; const out = document.createElement("canvas");
    out.width = Math.round(box.clientWidth * 2); out.height = Math.round(box.clientHeight * 2);
    paint(out, "#0a2248", 2);
    onChange(out.toDataURL("image/png"));
  };
  return (
    <div>
      <div ref={wrap} className="relative h-40 w-full touch-none rounded-xl bg-canvas ring-1 ring-inset ring-line sm:h-44">
        <canvas ref={cv} aria-label={label} role="img" className={`absolute inset-0 h-full w-full text-ink ${disabled ? "cursor-not-allowed" : "cursor-crosshair"}`}
          onPointerDown={(e) => { if (disabled) return; e.preventDefault(); cv.current!.setPointerCapture(e.pointerId); drawing.current = true; strokes.current.push([at(e)]); setEmpty(false); redraw(); }}
          onPointerMove={(e) => { if (!drawing.current) return; strokes.current[strokes.current.length - 1].push(at(e)); redraw(); }}
          onPointerUp={finish} onPointerCancel={finish} />
        <div className="pointer-events-none absolute inset-x-5 bottom-6 border-t border-line pt-1 text-[0.75rem] text-ink-faint">{empty ? "Sign here" : ""}</div>
      </div>
      {!empty && !disabled && (
        <button type="button" onClick={() => { strokes.current = []; setEmpty(true); redraw(); onChange(null); }} className="mt-1 text-[0.8125rem] text-ink-muted underline-offset-2 hover:text-ink hover:underline">Clear and sign again</button>
      )}
    </div>
  );
}
