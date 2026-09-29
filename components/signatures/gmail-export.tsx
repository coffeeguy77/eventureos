"use client";

import { useMemo, useRef, useState } from "react";
import { Check, ClipboardCopy, Download, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GMAIL_SIGNATURE_LIMIT, renderSignature, type SignatureDesign, type SignaturePerson, type Variant } from "@/lib/signatures/render";
import { cn } from "@/lib/cn";

async function copyRich(html: string, text: string, fallbackEl: HTMLElement | null) {
  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([text], { type: "text/plain" }),
      })]);
      return true;
    }
  } catch { /* fall through to selection copy */ }
  if (!fallbackEl) return false;
  const range = document.createRange();
  range.selectNodeContents(fallbackEl);
  const sel = window.getSelection();
  sel?.removeAllRanges(); sel?.addRange(range);
  const ok = document.execCommand("copy");
  sel?.removeAllRanges();
  return ok;
}

function download(name: string, html: string) {
  const blob = new Blob([`<!doctype html><html><head><meta charset="utf-8"><title>${name}</title></head><body>${html}</body></html>`], { type: "text/html" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${name.replace(/[^a-z0-9-]+/gi, "-").toLowerCase()}.html`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** "Copy for Gmail": full and reply versions, a download, and the install steps. */
export function GmailExport({ design, person, version }: { design: SignatureDesign; person: SignaturePerson; version: number | null }) {
  const full = useMemo(() => renderSignature(design, person, "full"), [design, person]);
  const short = useMemo(() => renderSignature(design, person, "compact"), [design, person]);
  const [copied, setCopied] = useState<Variant | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const refs = { full: useRef<HTMLDivElement>(null), compact: useRef<HTMLDivElement>(null) };
  const name = `${person.display_name ?? "signature"} ${design.company.name}`.trim();

  async function copy(v: Variant) {
    setErr(null);
    const r = v === "full" ? full : short;
    const ok = await copyRich(r.html, r.text, refs[v].current);
    if (ok) { setCopied(v); setTimeout(() => setCopied((c) => (c === v ? null : c)), 2500); }
    else setErr("Your browser blocked copying. Select the signature below, copy it, and paste it into Gmail.");
  }

  const card = (v: Variant, title: string, hint: string) => {
    const r = v === "full" ? full : short;
    const over = r.html.length > GMAIL_SIGNATURE_LIMIT;
    return (
      <div className="rounded-xl border border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
          <div>
            <p className="text-[0.8125rem] font-semibold text-ink">{title}</p>
            <p className="text-[0.75rem] text-ink-muted">{hint}</p>
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant={v === "full" ? "primary" : "secondary"} onClick={() => copy(v)} disabled={over}>
              {copied === v ? <Check className="h-3.5 w-3.5" /> : <ClipboardCopy className="h-3.5 w-3.5" />}{copied === v ? "Copied" : "Copy"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => download(`${name} ${v === "full" ? "" : "reply"}`, r.html)} title="Download as an HTML file">
              <Download className="h-3.5 w-3.5" /><span className="sr-only">Download</span>
            </Button>
          </div>
        </div>
        {/* Rendered on white exactly as Gmail will receive it; also the selection fallback for copying */}
        <div className="overflow-x-auto bg-white px-4 py-4 [color-scheme:light]">
          <div ref={refs[v]} dangerouslySetInnerHTML={{ __html: r.html }} />
        </div>
        {over && <p className="border-t border-line px-4 py-2 text-[0.75rem] text-rose-700">This is over Gmail's {GMAIL_SIGNATURE_LIMIT.toLocaleString()}-character limit — ask an admin to simplify the design.</p>}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        {card("full", "Full signature", "For new emails")}
        {card("compact", "Short signature", "For replies and forwards")}
      </div>
      {err && <p role="alert" className="text-[0.8125rem] text-rose-700">{err}</p>}
      <ol className="space-y-2 rounded-xl bg-canvas p-4 text-[0.8125rem] text-ink ring-1 ring-inset ring-line">
        {[
          <>Copy the <b>full signature</b> above.</>,
          <>In Gmail on a computer, open <b>Settings</b> (the gear icon) → <b>See all settings</b>, and stay on the <b>General</b> tab.</>,
          <>Scroll to <b>Signature</b>, choose <b>Create new</b>, name it (e.g. “{design.company.name || "Company"} – full”) and paste.</>,
          <>Do the same with the <b>short signature</b> (e.g. “– reply”).</>,
          <>Under <b>Signature defaults</b>, pick the full one for <b>new emails</b> and the short one for <b>reply/forward</b>. If you send from more than one address, choose the address first.</>,
          <>Scroll to the bottom and click <b>Save Changes</b>.</>,
        ].map((s, i) => (
          <li key={i} className="flex gap-3"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-500 text-[0.6875rem] font-semibold text-on-brand">{i + 1}</span><span>{s}</span></li>
        ))}
        <li className="pt-1 text-[0.75rem] text-ink-muted">
          Gmail keeps a copy, so it won't update itself: when {version ? `the company signature changes (it's on version ${version})` : "the company signature changes"}, copy it again.
          Replies you send from EventureOS add the signature automatically — Gmail doesn't add a second one to those.{" "}
          <a className="inline-flex items-center gap-0.5 font-medium text-brand-700 hover:underline" href="https://mail.google.com/mail/u/0/#settings/general" target="_blank" rel="noreferrer">Open Gmail settings <ExternalLink className="h-3 w-3" /></a>
        </li>
      </ol>
    </div>
  );
}

export function StatusDot({ tone }: { tone: "ok" | "warn" | "off" }) {
  return <span aria-hidden className={cn("inline-block h-2 w-2 rounded-full", tone === "ok" ? "bg-emerald-500" : tone === "warn" ? "bg-amber-500" : "bg-zinc-300")} />;
}
