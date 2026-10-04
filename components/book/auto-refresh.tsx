"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-checks the page every few seconds (e.g. while Stripe's payment confirmation arrives). Stops after a minute. */
export function AutoRefresh({ every = 2500, max = 24 }: { every?: number; max?: number }) {
  const router = useRouter();
  useEffect(() => {
    let n = 0;
    const id = setInterval(() => { if (++n > max) clearInterval(id); else router.refresh(); }, every);
    return () => clearInterval(id);
  }, [router, every, max]);
  return null;
}
