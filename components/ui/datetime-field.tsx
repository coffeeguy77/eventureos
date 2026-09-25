"use client";

import { useState } from "react";
import { inputClass } from "@/components/ui/form";
import { cn } from "@/lib/cn";

function toLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A datetime-local input that submits an exact ISO timestamp (interpreted in the user's own timezone). */
export function DateTimeField({ name, defaultISO, id, className }: { name: string; defaultISO?: string | null; id?: string; className?: string }) {
  const [local, setLocal] = useState(toLocalInput(defaultISO));
  const iso = local ? new Date(local).toISOString() : "";
  return (
    <>
      <input id={id} type="datetime-local" value={local} onChange={(e) => setLocal(e.target.value)} className={cn(inputClass, className)} />
      <input type="hidden" name={name} value={iso} />
    </>
  );
}
