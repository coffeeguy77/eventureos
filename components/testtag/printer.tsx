"use client";

import { useEffect, useState, useTransition } from "react";
import { Bluetooth, Copy, Download, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { bleSupported, choosePrinter, downloadZpl, forgetPrinter, isIOS, printZpl, printerName } from "@/lib/testtag/zebra-ble";
import { markPrinted } from "@/app/(app)/test-tag/actions";

/** The printer bar: choose the Zebra once (needs a tap), then every label prints straight to it. */
export function PrinterBar() {
  const [name, setName] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  useEffect(() => { setSupported(bleSupported()); setName(printerName()); }, []);
  if (!supported) {
    return (
      <div className="rounded-lg bg-amber-50 px-3 py-2.5 text-[0.8125rem] text-amber-900 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/30">
        <p className="font-medium">This browser can&apos;t reach Bluetooth printers.</p>
        <p className="mt-0.5 text-[0.75rem]">{isIOS() ? "On iPhone, open EventureOS in the free Bluefy browser (App Store) to print straight to the Zebra — Safari and Chrome on iPhone can't. You can still download each label." : "Use Chrome or Edge, or download each label and send it with the Zebra app."}</p>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-zinc-50 px-3 py-2 ring-1 ring-inset ring-line dark:bg-white/5">
      <Bluetooth className={`h-4 w-4 ${name ? "text-brand-600" : "text-ink-faint"}`} />
      <span className="flex-1 text-[0.8125rem] text-ink">{name ? <>Printer: <b>{name}</b></> : "No printer chosen"}</span>
      {name && <Button size="sm" variant="ghost" onClick={() => { forgetPrinter(); setName(null); }}>Forget</Button>}
      <Button size="sm" variant={name ? "secondary" : "primary"} disabled={busy} onClick={() => start(async () => {
        setErr(null);
        try { setName(await choosePrinter()); } catch (e) { const m = e instanceof Error ? e.message : String(e); if (!/cancel/i.test(m)) setErr(m); }
      })}>{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{name ? "Change" : "Choose printer"}</Button>
      {err && <p className="w-full text-[0.75rem] text-rose-600">{err}</p>}
    </div>
  );
}

/** Print one label (choosing the printer first if needed), or download / copy it. */
export function PrintLabel({ zpl, name, testId, auto, compact }: { zpl: string; name: string; testId?: string | null; auto?: boolean; compact?: boolean }) {
  const [state, setState] = useState<"idle" | "printing" | "done" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [supported, setSupported] = useState(true);
  useEffect(() => { setSupported(bleSupported()); }, []);
  const print = async () => {
    setErr(null); setState("printing");
    try {
      if (!printerName()) await choosePrinter();
      await printZpl(zpl);
      setState("done");
      if (testId) void markPrinted(testId);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setState(/cancel/i.test(m) ? "idle" : "error"); if (!/cancel/i.test(m)) setErr(m);
    }
  };
  useEffect(() => {
    if (auto && bleSupported() && printerName()) void print();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, zpl]);
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        {supported && <Button size={compact ? "sm" : "md"} variant="primary" disabled={state === "printing"} onClick={print}>
          {state === "printing" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}{state === "done" ? "Print again" : "Print label"}
        </Button>}
        <Button size={compact ? "sm" : "md"} onClick={() => { downloadZpl(zpl, name); if (testId) void markPrinted(testId); }}><Download className="h-3.5 w-3.5" />.zpl</Button>
        {!compact && <Button size="md" variant="ghost" onClick={async () => { try { await navigator.clipboard.writeText(zpl); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* no clipboard */ } }}><Copy className="h-3.5 w-3.5" />{copied ? "Copied" : "Copy ZPL"}</Button>}
        {state === "done" && <span className="text-[0.75rem] font-medium text-emerald-700">Sent to the printer</span>}
      </div>
      {err && <p className="text-[0.75rem] text-rose-600">{err}</p>}
    </div>
  );
}
