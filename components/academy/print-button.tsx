"use client";
import { Printer } from "lucide-react";

export function PrintButton() {
  return <button type="button" onClick={() => window.print()} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--b)] px-4 text-[0.9063rem] font-semibold text-[var(--on-b)]"><Printer className="h-4 w-4" />Print or save as PDF</button>;
}
