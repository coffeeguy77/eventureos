"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyField({ value, label = "Copy" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex items-stretch gap-2">
      <code className="min-w-0 flex-1 break-all rounded-lg bg-zinc-50 px-3 py-2 text-[0.75rem] text-ink ring-1 ring-inset ring-line">{value}</code>
      <button type="button" onClick={() => { navigator.clipboard?.writeText(value).then(() => { setDone(true); setTimeout(() => setDone(false), 1800); }).catch(() => undefined); }}
        className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 text-[0.75rem] font-medium text-ink ring-1 ring-inset ring-line-strong hover:bg-zinc-50">
        {done ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}{done ? "Copied" : label}
      </button>
    </div>
  );
}
