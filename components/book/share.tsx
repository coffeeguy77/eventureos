"use client";

import { useState } from "react";
import { Copy, Check, Share2 } from "lucide-react";

/** Share the class with friends: the phone's share sheet, Facebook, or copy the link. */
export function ShareBox({ url, text }: { url: string; text: string }) {
  const [copied, setCopied] = useState(false);
  const native = typeof navigator !== "undefined" && "share" in navigator;
  const fb = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
  return (
    <div className="flex flex-wrap gap-2">
      {native && (
        <button type="button" onClick={() => navigator.share({ title: text, text, url }).catch(() => undefined)} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--b)] px-4 text-[0.875rem] font-semibold text-[var(--on-b)]">
          <Share2 className="h-4 w-4" />Share
        </button>
      )}
      <a href={fb} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center gap-2 rounded-xl border border-line px-4 text-[0.875rem] font-semibold text-ink hover:bg-zinc-50">Facebook</a>
      <button type="button" onClick={() => { navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => undefined); }}
        className="inline-flex h-11 items-center gap-2 rounded-xl border border-line px-4 text-[0.875rem] font-semibold text-ink hover:bg-zinc-50">
        {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}{copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}
