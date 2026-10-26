"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setHireEnabled } from "@/app/(app)/rentals/actions";

/** Switch the Hire section on or off for the business (its bookings and items are kept either way). */
export function HireSwitch({ on }: { on: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant={on ? "secondary" : "primary"} disabled={pending} onClick={() => start(async () => {
        setMsg(null);
        const r = await setHireEnabled(!on);
        if (!r.ok) setMsg(r.error); else router.refresh();
      })}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}{on ? "Switch Hire off" : "Switch Hire on"}</Button>
      {on && <span className="text-[0.75rem] text-ink-faint">Switching off hides the Hire menu. Nothing is deleted.</span>}
      {msg && <span className="text-[0.8125rem] text-rose-600" role="alert">{msg}</span>}
    </div>
  );
}
