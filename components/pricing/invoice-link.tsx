"use client";

import { useState } from "react";
import { invoicePdfLink } from "@/app/(app)/pricing/actions";

/** Opens the invoice PDF in a new tab (a private link that works for five minutes). */
export function InvoiceLink({ id, label }: { id: string; label: string }) {
  const [err, setErr] = useState<string | null>(null);
  return (
    <span>
      <button type="button" className="text-left hover:text-brand-700 hover:underline" onClick={async () => {
        setErr(null);
        const w = window.open("", "_blank"); // opened straight away so the browser doesn't block it
        const r = await invoicePdfLink(id);
        if (r.ok && w) w.location.href = r.data; else { w?.close(); setErr(r.ok ? "Allow pop-ups to open the PDF." : r.error); }
      }}>{label}</button>
      {err && <span className="ml-2 text-[0.7188rem] text-rose-600">{err}</span>}
    </span>
  );
}
