"use client";

import { useEffect } from "react";
import { recordInvoiceView } from "./actions";

/** Counts the view once the page has been visible for a moment in a real browser (email link scanners don't run this). */
export function InvoiceViewBeacon({ token }: { token: string }) {
  useEffect(() => {
    let done = false;
    const fire = () => { if (done || document.visibilityState !== "visible") return; done = true; void recordInvoiceView(token); };
    const t = setTimeout(fire, 1500);
    const onVis = () => { if (document.visibilityState === "visible") setTimeout(fire, 1500); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearTimeout(t); document.removeEventListener("visibilitychange", onVis); };
  }, [token]);
  return null;
}
