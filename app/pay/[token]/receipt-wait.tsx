"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Right after paying, the payment is recorded a few seconds later (Stripe tells us) — check again until the receipt is there. */
export function ReceiptWait() {
  const router = useRouter();
  useEffect(() => {
    let n = 0;
    const t = setInterval(() => { n++; router.refresh(); if (n >= 10) clearInterval(t); }, 3000);
    return () => clearInterval(t);
  }, [router]);
  return null;
}
