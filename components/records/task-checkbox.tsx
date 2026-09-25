"use client";

import { useOptimistic, useTransition } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { setTaskDone } from "@/app/(app)/record-actions";

export function TaskCheckbox({ id, done }: { id: string; done: boolean }) {
  const [optimistic, setOptimistic] = useOptimistic(done);
  const [, start] = useTransition();
  return (
    <button
      type="button"
      aria-label={optimistic ? "Mark as not done" : "Mark as done"}
      onClick={() => start(async () => { setOptimistic(!optimistic); await setTaskDone(id, !optimistic); })}
      className={cn(
        "mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors",
        optimistic ? "border-brand-500 bg-brand-500 text-white" : "border-line-strong bg-white hover:border-brand-400"
      )}
    >
      {optimistic && <Check className="h-3 w-3" strokeWidth={3} />}
    </button>
  );
}
