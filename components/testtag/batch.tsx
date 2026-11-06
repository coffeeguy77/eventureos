"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { bleSupported, downloadZpl, printZpl } from "@/lib/testtag/zebra-ble";
import { markManyPrinted, unprintedLabels } from "@/app/(app)/test-tag/actions";

/** All labels not printed yet, in one file (or straight to a Bluetooth LE printer where the browser can). */
export function BatchLabels({ count }: { count: number }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();
  const [ble, setBle] = useState(false);
  useEffect(() => { setBle(bleSupported()); }, []);
  if (!count) return <p className="text-[0.8125rem] text-ink-muted">Every label has been printed.</p>;
  const run = (mode: "download" | "print") => start(async () => {
    setMsg(null);
    const r = await unprintedLabels(null);
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
    if (!r.data.count) { setMsg({ ok: true, text: "Nothing left to print." }); router.refresh(); return; }
    try {
      if (mode === "print") await printZpl(r.data.zpl);
      else downloadZpl(r.data.zpl, `labels-${new Date().toISOString().slice(0, 10)}`);
      await markManyPrinted(r.data.ids);
      setMsg({ ok: true, text: mode === "print" ? `${r.data.count} labels sent to the printer.` : `${r.data.count} labels saved in one file — send it from the Zebra app (Available Files).` });
      router.refresh();
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); }
  });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={busy} onClick={() => run("download")}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}Download {count} label{count === 1 ? "" : "s"} (one file)</Button>
        {ble && <Button disabled={busy} onClick={() => run("print")}><Printer className="h-3.5 w-3.5" />Print all</Button>}
      </div>
      {msg && <p className={msg.ok ? "text-[0.75rem] text-emerald-700" : "text-[0.75rem] text-rose-600"}>{msg.text}</p>}
    </div>
  );
}
