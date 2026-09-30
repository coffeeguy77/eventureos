"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Check, ImageUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type { SignatureDesign } from "@/lib/signatures/render";
import { cn } from "@/lib/cn";

const TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
const MAX_BYTES = 2 * 1024 * 1024; // the branding bucket's limit

/** Natural pixel size of an image URL (0×0 if it can't be loaded). */
function measure(url: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 0, h: 0 });
    img.src = url;
  });
}

/** Tall logos start about 140px tall (like a typical Gmail signature logo); wide ones at 120px wide. */
function startWidth(w: number, h: number) {
  if (!w || !h) return 96;
  return Math.max(40, Math.min(200, h > w ? Math.round((140 * w) / h) : 120));
}

type Company = SignatureDesign["company"];

/** Choose the signature logo: the Branding logo, or one uploaded just for email signatures — and how big it is. */
export function LogoPicker({ orgId, brandLogo, company, width, onCompany, onWidth }: {
  orgId: string; brandLogo: string | null; company: Company; width: number;
  onCompany: (p: Partial<Company>, width?: number) => void; onWidth: (w: number) => void;
}) {
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const custom = company.customLogoUrl;
  const height = company.logoW > 0 && company.logoH > 0 ? Math.round((width * company.logoH) / company.logoW) : null;

  async function choose(source: "brand" | "custom", url: string | null) {
    setErr(null);
    if (!url) return;
    const { w, h } = await measure(url);
    onCompany({ logoSource: source, logoUrl: url, logoW: w, logoH: h }, company.logoUrl === url ? undefined : startWidth(w, h));
  }

  async function upload(f: File) {
    setErr(null);
    const ext = TYPES[f.type];
    if (!ext) return setErr("Use a PNG, JPG, WebP or GIF image. A PNG with a transparent background looks best.");
    if (f.size > MAX_BYTES) return setErr(`That file is ${(f.size / 1024 / 1024).toFixed(1)} MB — the limit is 2 MB.`);
    setBusy(true);
    try {
      const supabase = createClient();
      const path = `${orgId}/signature/logo-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("branding").upload(path, f, { contentType: f.type, cacheControl: "31536000", upsert: false });
      if (error) throw new Error(`Upload failed: ${error.message}`);
      const url = supabase.storage.from("branding").getPublicUrl(path).data.publicUrl;
      const { w, h } = await measure(url);
      onCompany({ customLogoUrl: url, logoSource: "custom", logoUrl: url, logoW: w, logoH: h }, startWidth(w, h));
    } catch (e) { setErr(e instanceof Error ? e.message : "Upload failed"); }
    finally { setBusy(false); if (file.current) file.current.value = ""; }
  }

  const card = (source: "brand" | "custom", url: string | null, title: string, hint: React.ReactNode) => {
    const on = company.logoSource === source && Boolean(url) && company.logoUrl === url;
    return (
      <div role="radio" aria-checked={on} tabIndex={url ? 0 : -1}
        onClick={() => url && !on && void choose(source, url)}
        onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && url && !on) { e.preventDefault(); void choose(source, url); } }}
        className={cn("flex min-w-0 flex-col rounded-xl p-2.5 ring-1 ring-inset transition", on ? "bg-brand-50/60 ring-2 ring-brand-500" : url ? "cursor-pointer ring-line-strong hover:ring-brand-300" : "ring-line")}>
        <div className="grid h-20 place-items-center overflow-hidden rounded-lg bg-white ring-1 ring-line">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {url ? <img src={url} alt="" className="max-h-16 max-w-[90%] object-contain" /> : <span className="px-2 text-center text-[0.6875rem] text-ink-faint">None yet</span>}
        </div>
        <div className="mt-2 flex items-start gap-1.5">
          <span className={cn("mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full ring-1", on ? "bg-brand-500 text-white ring-brand-500" : "ring-line-strong")}>{on && <Check className="h-3 w-3" strokeWidth={3} />}</span>
          <span className="min-w-0"><span className="block text-[0.8125rem] font-medium text-ink">{title}</span><span className="block text-[0.6875rem] leading-snug text-ink-muted">{hint}</span></span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <p className="text-[0.8125rem] font-semibold text-ink">Signature logo</p>
      <div role="radiogroup" aria-label="Signature logo" className="grid grid-cols-2 gap-2.5">
        {card("brand", brandLogo, "Branding logo", <>From <Link href="/settings/branding" className="text-brand-700 hover:underline" onClick={(e) => e.stopPropagation()}>Branding & portal</Link></>)}
        {card("custom", custom || null, "Custom logo", "Just for email signatures")}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
        <Button type="button" size="sm" onClick={() => file.current?.click()} disabled={busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageUp className="h-3.5 w-3.5" />}{busy ? "Uploading…" : custom ? "Upload a different custom logo" : "Upload a custom logo"}
        </Button>
      </div>
      <p className="text-[0.6875rem] text-ink-muted">PNG with a transparent background, at least twice the size it shows (e.g. 300px wide) so it stays sharp. Max 2 MB.</p>
      {err && <p role="alert" className="text-[0.75rem] text-rose-700">{err}</p>}
      <div>
        <div className="mb-1.5 flex items-baseline justify-between text-[0.7812rem] font-medium text-ink">
          <span>Logo size</span><span className="font-normal text-ink-faint">{width}px wide{height ? ` × ${height}px tall` : ""}</span>
        </div>
        <input type="range" min={40} max={200} value={width} onChange={(e) => onWidth(Number(e.target.value))} aria-label="Logo size" className="w-full accent-brand-500" />
      </div>
    </div>
  );
}
