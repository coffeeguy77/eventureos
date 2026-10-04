"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="inline-flex h-12 items-center gap-2 rounded-xl px-5 text-[0.9375rem] font-semibold text-ink ring-1 ring-line hover:bg-zinc-50">
      <Printer className="h-4 w-4" />Print
    </button>
  );
}
