"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Code2, ImageOff, Image as ImageIcon, Monitor, Moon, Reply, Smartphone, Sun, SquarePen, Type } from "lucide-react";
import { GMAIL_SIGNATURE_LIMIT, esc, renderSignature, type SignatureDesign, type SignaturePerson, type Variant } from "@/lib/signatures/render";
import { cn } from "@/lib/cn";

export interface PreviewOptions { kind: "new" | "reply"; device: "desktop" | "mobile"; theme: "light" | "dark"; images: boolean; format: "html" | "text" }
export const DEFAULT_PREVIEW: PreviewOptions = { kind: "new", device: "desktop", theme: "light", images: true, format: "html" };

/** Which variant the preview shows for "new" vs "reply" under the design's reply rule. */
export function previewVariant(design: SignatureDesign, kind: PreviewOptions["kind"]): Variant {
  if (kind === "new") return "full";
  return design.reply.mode === "full" ? "full" : "compact";
}

function stripImages(html: string) {
  // Show what an image-blocking mail app shows: an empty box with the alt text, same width
  return html.replace(/<img src="[^"]*" alt="([^"]*)" width="(\d+)"[^>]*\/>/g, (_m, alt: string, w: string) =>
    `<span style="display:inline-block;width:${w}px;max-width:100%;padding:6px;border:1px dashed #c4c4c4;color:#8a8a8a;font:11px Arial,sans-serif;box-sizing:border-box;">${alt || "image"}</span>`);
}

function doc(body: string, o: PreviewOptions) {
  const dark = o.theme === "dark";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;background:${dark ? "#121212" : "#ffffff"}}body{padding:${o.device === "mobile" ? "16px" : "24px 28px"};font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#202124}
${dark ? ".mail{filter:invert(1) hue-rotate(180deg)}.mail img{filter:invert(1) hue-rotate(180deg)}" : ""}
a{pointer-events:none}.q{margin-top:18px;padding-left:12px;border-left:2px solid #dadce0;color:#5f6368}.meta{color:#5f6368;font-size:12px;margin-top:18px}</style></head>
<body><div class="mail">${body}</div></body></html>`;
}

const NEW_BODY = `<p style="margin:0 0 1em">Hi Emma,</p><p style="margin:0 0 1em">Thanks for getting in touch about your event on Saturday the 14th. I've put together a quote for 150 guests — you can review and accept it online.</p><p style="margin:0 0 1em">Kind regards,</p>`;
const REPLY_BODY = `<p style="margin:0 0 1em">Hi Emma, yes — we can do an 8am start. I've updated the quote.</p>`;
const QUOTED = `<div class="meta">On Tue, Emma Hart &lt;emma@example.com&gt; wrote:</div><div class="q">Could the team arrive for an 8am start instead of 9?<br><br>Thanks, Emma</div>`;

/** Live, sandboxed preview of a signature inside a sample email, with the review matrix controls. */
export function SignaturePreview({ design, person, options, onOptions, compactToolbar }: {
  design: SignatureDesign; person: SignaturePerson; options: PreviewOptions; onOptions: (o: PreviewOptions) => void; compactToolbar?: boolean;
}) {
  const variant = previewVariant(design, options.kind);
  const sig = useMemo(() => renderSignature(design, person, variant), [design, person, variant]);
  const html = options.images ? sig.html : stripImages(sig.html);
  const srcDoc = useMemo(() => {
    if (options.format === "text") {
      const body = (options.kind === "new" ? "Hi Emma,\n\nThanks for getting in touch about your event on Saturday the 14th. I've put together a quote for 150 guests — you can review and accept it online.\n\nKind regards,\n" : "Hi Emma, yes — we can do an 8am start. I've updated the quote.\n") + "\n-- \n" + sig.text;
      return doc(`<pre style="margin:0;white-space:pre-wrap;font:13px/1.55 ui-monospace,Menlo,Consolas,monospace;color:#202124">${esc(body)}</pre>`, options);
    }
    return doc((options.kind === "new" ? NEW_BODY : REPLY_BODY) + html + (options.kind === "reply" ? QUOTED : ""), options);
  }, [html, sig.text, options]);

  // Size the frame to its content
  const frame = useRef<HTMLIFrameElement>(null);
  const [h, setH] = useState(320);
  useEffect(() => {
    const f = frame.current;
    if (!f) return;
    const measure = () => { const d = f.contentDocument; if (d?.body) setH(Math.max(220, Math.ceil(d.documentElement.scrollHeight))); };
    f.addEventListener("load", measure);
    const t = setTimeout(measure, 60);
    return () => { f.removeEventListener("load", measure); clearTimeout(t); };
  }, [srcDoc]);

  const size = sig.html.length;
  const pct = Math.min(100, (size / GMAIL_SIGNATURE_LIMIT) * 100);
  const set = (p: Partial<PreviewOptions>) => onOptions({ ...options, ...p });

  const seg = <K extends keyof PreviewOptions>(k: K, items: [PreviewOptions[K], string, React.ComponentType<{ className?: string }>][], label: string) => (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg bg-zinc-100 p-0.5">
      {items.map(([v, l, I]) => (
        <button key={String(v)} type="button" role="radio" aria-checked={options[k] === v} title={l} onClick={() => set({ [k]: v } as Partial<PreviewOptions>)}
          className={cn("inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[0.75rem] font-medium", options[k] === v ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink")}>
          <I className="h-3.5 w-3.5" /><span className={cn(compactToolbar && "sr-only")}>{l}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        {seg("kind", [["new", "New email", SquarePen], ["reply", "Reply", Reply]], "Message type")}
        {seg("device", [["desktop", "Desktop", Monitor], ["mobile", "Phone", Smartphone]], "Screen")}
        {seg("theme", [["light", "Light", Sun], ["dark", "Dark", Moon]], "Theme")}
        {seg("images", [[true, "Images", ImageIcon], [false, "Blocked", ImageOff]], "Images")}
        {seg("format", [["html", "HTML", Code2], ["text", "Plain text", Type]], "Format")}
      </div>

      <div className={cn("mt-3 overflow-hidden rounded-xl border border-line bg-zinc-100/70", options.device === "mobile" ? "p-4 sm:p-6" : "p-0")}>
        <div className={cn("mx-auto overflow-hidden bg-white", options.device === "mobile" ? "w-[375px] max-w-full rounded-[1.75rem] border-[6px] border-zinc-800 shadow-lg" : "w-full")}>
          <div className={cn("flex items-center gap-2 border-b px-4 py-2.5 text-[0.75rem]", options.theme === "dark" ? "border-white/10 bg-[#1e1e1e] text-white/60" : "border-zinc-200 bg-zinc-50 text-zinc-500")}>
            <span className="truncate"><b className={options.theme === "dark" ? "text-white/85" : "text-zinc-700"}>{options.kind === "new" ? "Your quote from" : "Re: Your quote from"} {design.company.name || "us"}</b></span>
            <span className="ml-auto shrink-0">to Emma Hart</span>
          </div>
          <iframe ref={frame} title="Signature preview" srcDoc={srcDoc} sandbox="allow-same-origin" style={{ height: h }} className="block w-full border-0" />
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[0.75rem] text-ink-muted">
        <span>{variant === "full" ? "Full signature" : "Short reply signature"}</span>
        <span>About {sig.width}px wide</span>
        <span className="inline-flex items-center gap-2">
          <span className="relative h-1.5 w-20 overflow-hidden rounded-full bg-zinc-200" aria-hidden>
            <span className={cn("absolute inset-y-0 left-0 rounded-full", pct > 90 ? "bg-rose-500" : pct > 60 ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${pct}%` }} />
          </span>
          {size.toLocaleString()} of Gmail's {GMAIL_SIGNATURE_LIMIT.toLocaleString()} characters
        </span>
        {options.theme === "dark" && <span className="text-ink-faint">Dark is simulated by inverting colours; each mail app handles dark mode differently, so send yourself a test.</span>}
      </div>
    </div>
  );
}

/** The rendered signature at a small scale, for layout cards and tables. Our renderer escapes everything it outputs. */
export function SignatureThumb({ design, person, scale = 0.62, className }: { design: SignatureDesign; person: SignaturePerson; scale?: number; className?: string }) {
  const { html } = useMemo(() => renderSignature(design, person, "full"), [design, person]);
  return (
    <div className={cn("pointer-events-none overflow-hidden", className)} aria-hidden>
      <div style={{ zoom: scale }} className="text-left [color-scheme:light]" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
