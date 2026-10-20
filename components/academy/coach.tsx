"use client";

import { useRef, useState, useTransition } from "react";
import { Camera, ImagePlus, Loader2, Send, Sparkles, X } from "lucide-react";
import { coachAction, photoAction } from "@/app/academy/actions";
import type { PhotoResult } from "@/lib/learn/ai";
import { btn, btnGhost, field } from "./ui";
import { cn } from "@/lib/cn";

const MODES = [["default", "Anything"], ["espresso", "Espresso"], ["milk", "Milk"], ["latte_art", "Latte art"], ["roasting", "Roasting"], ["troubleshoot", "Equipment"]] as const;
type Img = { data: string; mediaType: string; preview: string };

/** Shrink a photo to at most 1024px (JPEG) so it's quick to send. */
async function shrink(file: File): Promise<Img> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error("That file isn't a photo we can read.")); i.src = url; });
    const k = Math.min(1, 1024 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    const preview = c.toDataURL("image/jpeg", 0.82);
    return { data: preview.split(",")[1], mediaType: "image/jpeg", preview };
  } finally { URL.revokeObjectURL(url); }
}

function PhotoPick({ onPick, children, className }: { onPick: (i: Img | null, error?: string) => void; children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={async (e) => {
        const f = e.target.files?.[0]; e.target.value = "";
        if (!f) return;
        try { onPick(await shrink(f)); } catch (x) { onPick(null, x instanceof Error ? x.message : "That photo couldn't be read."); }
      }} />
      <button type="button" className={className} onClick={() => ref.current?.click()}>{children}</button>
    </>
  );
}

export function Coach({ slug, firstName, left }: { slug: string; firstName: string; left: { messages: number; photos: number } }) {
  const [mode, setMode] = useState<string>("default");
  const [turns, setTurns] = useState<{ role: "user" | "assistant"; content: string; image?: string }[]>([]);
  const [text, setText] = useState("");
  const [img, setImg] = useState<Img | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);

  const send = () => {
    if (!text.trim() && !img) return;
    const q = text.trim() || "What do you think of this?";
    const next = [...turns, { role: "user" as const, content: q, image: img?.preview }];
    setTurns(next); setText(""); setErr(null);
    const photo = img; setImg(null);
    start(async () => {
      const r = await coachAction(slug, mode, next.map(({ role, content }) => ({ role, content })), photo ? { data: photo.data, mediaType: photo.mediaType } : null)
        .catch(() => ({ ok: false as const, error: "Couldn't reach the coach — try again." }));
      if (!r.ok) { setErr(r.error); return; }
      setTurns((t) => [...t, { role: "assistant", content: r.reply }]);
      setTimeout(() => end.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 50);
    });
  };

  return (
    <section className="flex min-h-[520px] flex-col rounded-2xl border border-line bg-surface shadow-card">
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto border-b border-line p-3">
        {MODES.map(([k, l]) => <button key={k} type="button" onClick={() => setMode(k)} className={cn("h-9 shrink-0 rounded-full px-3.5 text-[0.8438rem] font-semibold", mode === k ? "bg-[var(--b)] text-[var(--on-b)]" : "bg-zinc-100 text-ink-muted hover:text-ink")}>{l}</button>)}
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {turns.length === 0 && (
          <div className="rounded-xl bg-zinc-50 p-4 text-[0.9375rem] text-ink-muted">
            <p className="flex items-center gap-2 font-semibold text-ink"><Sparkles className="h-4 w-4 text-[var(--b)]" />Hi {firstName} — I&apos;m Bean Coach.</p>
            <p className="mt-1">Ask me anything about espresso, milk, latte art, roasting or your equipment. Add a photo of your shot or pour and I&apos;ll take a look.</p>
            <p className="mt-2 text-[0.8125rem]">Today: {left.messages} questions and {left.photos} photo scores left.</p>
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className={cn("max-w-[85%] rounded-2xl px-4 py-3 text-[0.9375rem] leading-relaxed", t.role === "user" ? "ml-auto bg-[var(--b)] text-[var(--on-b)]" : "bg-zinc-100 text-ink")}>
            {t.image && <img src={t.image} alt="" className="mb-2 max-h-48 rounded-lg" />}
            <p className="whitespace-pre-line">{t.content}</p>
          </div>
        ))}
        {pending && <p className="flex items-center gap-2 text-[0.875rem] text-ink-muted"><Loader2 className="h-4 w-4 animate-spin" />Bean Coach is thinking…</p>}
        {err && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-[0.875rem] font-medium text-rose-800">{err}</p>}
        <div ref={end} />
      </div>
      <form className="border-t border-line p-3" onSubmit={(e) => { e.preventDefault(); send(); }}>
        {img && <div className="mb-2 flex items-center gap-2"><img src={img.preview} alt="" className="h-14 rounded-lg" /><button type="button" className="text-ink-muted" aria-label="Remove photo" onClick={() => setImg(null)}><X className="h-4 w-4" /></button></div>}
        <div className="flex gap-2">
          <PhotoPick onPick={(i, e) => { if (i) setImg(i); else if (e) setErr(e); }} className={`${btnGhost} w-11 px-0`}><ImagePlus className="h-5 w-5" /><span className="sr-only">Add a photo</span></PhotoPick>
          <input className={`${field} h-11 min-w-0 flex-1`} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. My shot runs in 18 seconds and tastes sour" maxLength={2000} />
          <button className={`${btn} w-11 px-0`} disabled={pending || (!text.trim() && !img)} aria-label="Send"><Send className="h-5 w-5" /></button>
        </div>
      </form>
    </section>
  );
}

export function PhotoScore({ slug }: { slug: string }) {
  const [kind, setKind] = useState<"latte_art" | "espresso">("latte_art");
  const [img, setImg] = useState<Img | null>(null);
  const [res, setRes] = useState<{ result: PhotoResult; badges: string[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-card">
      <h2 className="flex items-center gap-2 text-[1rem] font-semibold text-ink"><Camera className="h-5 w-5 text-[var(--b)]" />Score a photo</h2>
      <div className="mt-3 flex gap-1 rounded-xl bg-zinc-100 p-1">
        {([["latte_art", "Latte art"], ["espresso", "Espresso shot"]] as const).map(([k, l]) => <button key={k} type="button" onClick={() => { setKind(k); setRes(null); }} className={cn("h-9 flex-1 rounded-lg text-[0.875rem] font-semibold", kind === k ? "bg-surface text-ink shadow-sm" : "text-ink-muted")}>{l}</button>)}
      </div>
      <div className="mt-3">
        {img ? <img src={img.preview} alt="Your photo" className="max-h-64 w-full rounded-xl object-cover" /> : <div className="grid h-32 place-items-center rounded-xl border border-dashed border-line-strong text-[0.875rem] text-ink-muted">Take or choose a photo from above</div>}
      </div>
      <div className="mt-3 flex gap-2">
        <PhotoPick onPick={(i, e) => { if (i) { setImg(i); setRes(null); } else if (e) setErr(e); }} className={`${btnGhost} flex-1`}><ImagePlus className="h-4 w-4" />{img ? "Change photo" : "Add photo"}</PhotoPick>
        <button type="button" className={`${btn} flex-1`} disabled={!img || pending} onClick={() => start(async () => {
          setErr(null);
          const r = await photoAction(slug, kind, { data: img!.data, mediaType: img!.mediaType }).catch(() => ({ ok: false as const, error: "Couldn't reach the coach — try again." }));
          if (!r.ok) setErr(r.error); else setRes({ result: r.result, badges: r.badges });
        })}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Score it</button>
      </div>
      {err && <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-4 py-3 text-[0.875rem] font-medium text-rose-800">{err}</p>}
      {res && (
        <div className="mt-4 space-y-3">
          <p className="text-[1.75rem] font-bold text-ink">{res.result.overall}<span className="text-[0.9375rem] text-ink-faint"> / 100</span></p>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(res.result.scores).map(([k, v]) => (
              <div key={k} className="rounded-xl bg-zinc-50 px-3 py-2"><p className="text-[0.75rem] capitalize text-ink-muted">{k.replace(/_/g, " ")}</p><div className="mt-1 h-1.5 rounded-full bg-zinc-200"><div className="h-1.5 rounded-full bg-[var(--b)]" style={{ width: `${v}%` }} /></div><p className="mt-0.5 text-[0.8125rem] font-semibold tabular-nums">{v}</p></div>
            ))}
          </div>
          {[["What's good", res.result.strengths], ["To improve", res.result.improvements], ["Tips", res.result.tips]].map(([h, list]) => (list as string[]).length ? (
            <div key={h as string}><p className="text-[0.8125rem] font-semibold text-ink">{h as string}</p><ul className="mt-1 list-disc space-y-0.5 pl-5 text-[0.875rem] text-ink-muted">{(list as string[]).map((x) => <li key={x}>{x}</li>)}</ul></div>
          ) : null)}
          {res.badges.length > 0 && <p className="text-[0.875rem] font-medium text-[var(--b)]">New badge: {res.badges.join(", ")}</p>}
        </div>
      )}
    </section>
  );
}
