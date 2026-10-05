"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { Eraser, Loader2, PenLine } from "lucide-react";
import { CERT_FONT_CSS, layout, toSvg, type CertDesign, type CertStyle } from "@/lib/bookings/certificate";
import { saveCertificateDesign } from "@/app/(app)/bookings/certificate-actions";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/form";
import { cn } from "@/lib/cn";

const STYLES: { id: CertStyle; name: string; hint: string }[] = [
  { id: "classic", name: "Classic", hint: "Double border, script name" },
  { id: "modern", name: "Modern", hint: "Colour band, bold type" },
  { id: "minimal", name: "Minimal", hint: "Clean and light" },
];
const PALETTES: { name: string; accent: string; paper: string }[] = [
  { name: "Gold", accent: "#9A7B4F", paper: "#FFFDF7" },
  { name: "Espresso", accent: "#5B3A29", paper: "#FBF7F2" },
  { name: "Forest", accent: "#2F5D50", paper: "#F8FBF9" },
  { name: "Navy", accent: "#1F3A5F", paper: "#F7F9FC" },
  { name: "Rose", accent: "#C2416B", paper: "#FFF8FA" },
  { name: "Charcoal", accent: "#2B2B2B", paper: "#FFFFFF" },
];

export function CertificateBuilder({ initial, autoIssue, brand, business, logoUrl, sampleCourse, hasTemplate }: {
  initial: CertDesign; autoIssue: boolean; brand: string | null; business: string; logoUrl: string | null; sampleCourse: string; hasTemplate: boolean;
}) {
  const router = useRouter();
  const [d, setD] = useState<CertDesign>(initial);
  const [auto, setAuto] = useState(autoIssue);
  const [name, setName] = useState("Alex Example");
  const [qr, setQr] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof CertDesign>(k: K, v: CertDesign[K]) => setD({ ...d, [k]: v });

  const data = useMemo(() => ({ name: name || "Alex Example", course: sampleCourse, date: new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "long", year: "numeric" }).format(new Date()),
    hours: "2 hours", number: "C-1001", business, verifyUrl: "https://www.eventureos.com.au/verify/example" }), [name, sampleCourse, business]);
  useEffect(() => { QRCode.toDataURL(data.verifyUrl, { margin: 0, width: 200 }).then(setQr).catch(() => setQr(null)); }, [data.verifyUrl]);
  const svg = useMemo(() => toSvg(layout(d, data, { logo: !!logoUrl }), { logo: logoUrl, signature: d.signature, qr }), [d, data, logoUrl, qr]);

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
      <style>{CERT_FONT_CSS}</style>
      <div className="space-y-4">
        <section className="rounded-xl border border-line bg-surface p-4 shadow-card">
          <p className="mb-2 text-[0.8438rem] font-semibold text-ink">Style</p>
          <div className="grid grid-cols-3 gap-2">
            {STYLES.map((s) => (
              <button key={s.id} type="button" onClick={() => set("style", s.id)} className={cn("rounded-lg px-2 py-2.5 text-left ring-1 ring-inset", d.style === s.id ? "bg-brand-50 ring-brand-500" : "ring-line hover:bg-zinc-50")}>
                <span className="block text-[0.8125rem] font-semibold text-ink">{s.name}</span><span className="block text-[0.6875rem] leading-tight text-ink-muted">{s.hint}</span>
              </button>
            ))}
          </div>
          <p className="mb-2 mt-4 text-[0.8438rem] font-semibold text-ink">Colours</p>
          <div className="flex flex-wrap gap-2">
            {[...(brand ? [{ name: "Your brand", accent: brand, paper: "#FFFFFF" }] : []), ...PALETTES].map((p) => (
              <button key={p.name} type="button" onClick={() => setD({ ...d, accent: p.accent, paper: p.paper })} title={p.name}
                className={cn("flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 text-[0.75rem] ring-1 ring-inset", d.accent === p.accent && d.paper === p.paper ? "ring-brand-500" : "ring-line")}>
                <span className="h-5 w-5 rounded-full ring-1 ring-black/10" style={{ background: `linear-gradient(135deg, ${p.accent} 50%, ${p.paper} 50%)` }} />{p.name}
              </button>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div><Label>Accent</Label><Input type="color" value={d.accent} onChange={(e) => set("accent", e.target.value)} className="h-9 p-1" /></div>
            <div><Label>Paper</Label><Input type="color" value={d.paper} onChange={(e) => set("paper", e.target.value)} className="h-9 p-1" /></div>
          </div>
        </section>

        <section className="space-y-2.5 rounded-xl border border-line bg-surface p-4 shadow-card">
          <p className="text-[0.8438rem] font-semibold text-ink">Wording</p>
          <div><Label>Title</Label><Input value={d.title} onChange={(e) => set("title", e.target.value)} maxLength={80} /></div>
          <div><Label>Line above the name</Label><Input value={d.subtitle} onChange={(e) => set("subtitle", e.target.value)} maxLength={80} /></div>
          <div><Label hint="{course} {date} {hours} {business}">Main text</Label><Textarea value={d.body} onChange={(e) => set("body", e.target.value)} maxLength={300} className="min-h-[64px]" /></div>
          <div><Label hint="optional">Small print at the bottom</Label><Input value={d.footer} onChange={(e) => set("footer", e.target.value)} maxLength={160} placeholder="U5, 47-49 Vicars St, Mitchell ACT" /></div>
        </section>

        <section className="space-y-2.5 rounded-xl border border-line bg-surface p-4 shadow-card">
          <p className="text-[0.8438rem] font-semibold text-ink">Signature</p>
          <SignaturePad value={d.signature} onChange={(v) => set("signature", v)} />
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Name</Label><Input value={d.signerName} onChange={(e) => set("signerName", e.target.value)} maxLength={80} /></div>
            <div><Label>Title</Label><Input value={d.signerTitle} onChange={(e) => set("signerTitle", e.target.value)} maxLength={80} /></div>
          </div>
        </section>

        <section className="rounded-xl border border-line bg-surface p-4 shadow-card">
          <p className="mb-2 text-[0.8438rem] font-semibold text-ink">Show</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[0.8125rem] text-ink">
            <label className="flex items-center gap-2"><input type="checkbox" checked={d.showLogo} onChange={(e) => set("showLogo", e.target.checked)} />Logo</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={d.showSeal} onChange={(e) => set("showSeal", e.target.checked)} />Seal</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={d.showQr} onChange={(e) => set("showQr", e.target.checked)} />Verify QR code</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={d.showNumber} onChange={(e) => set("showNumber", e.target.checked)} />Certificate number</label>
          </div>
          {d.showSeal && <div className="mt-2"><Label>Seal word</Label><Input value={d.sealText} onChange={(e) => set("sealText", e.target.value)} maxLength={24} /></div>}
        </section>

        <section className="rounded-xl border border-line bg-surface p-4 shadow-card">
          <label className="flex items-start gap-2 text-[0.8125rem] text-ink"><input type="checkbox" className="mt-0.5" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
            <span><b className="font-semibold">Give certificates automatically</b><span className="block text-ink-muted">Everyone gets one after their class (with a link in the thank-you email){hasTemplate ? "" : ", and all past students get theirs when you save"}.</span></span></label>
          {msg && <p className={cn("mt-2 text-[0.8125rem] font-medium", msg.ok ? "text-emerald-700" : "text-rose-700")}>{msg.text}</p>}
          <Button variant="primary" className="mt-3 w-full" disabled={pending} onClick={() => start(async () => {
            setMsg(null);
            const r = await saveCertificateDesign(d, auto).catch(() => ({ ok: false as const, error: "Couldn't reach the server." }));
            setMsg(r.ok ? { ok: true, text: `Saved.${r.data.issued ? ` ${r.data.issued} certificates issued to past students.` : ""}` } : { ok: false, text: r.error });
            if (r.ok) router.refresh();
          })}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Save design</Button>
        </section>
      </div>

      <div className="xl:sticky xl:top-20">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[0.8438rem] font-semibold text-ink">Preview</p>
          <label className="flex items-center gap-2 text-[0.78rem] text-ink-muted">Try a name <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 w-48 py-1" maxLength={60} /></label>
        </div>
        <div className="overflow-hidden rounded-xl bg-white shadow-pop ring-1 ring-line" dangerouslySetInnerHTML={{ __html: svg }} />
        <p className="mt-2 text-[0.75rem] text-ink-faint">A4 landscape. The PDF people download looks exactly like this. The QR code opens a page proving the certificate is genuine.</p>
      </div>
    </div>
  );
}

/** Draw a signature with a finger or mouse; saved as a small transparent PNG. */
function SignaturePad({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);
  const [editing, setEditing] = useState(!value);
  useEffect(() => {
    const c = ref.current; if (!c || !editing) return;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.lineWidth = 3.2; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#1F1A17";
  }, [editing]);
  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => { const r = e.currentTarget.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * e.currentTarget.width, y: ((e.clientY - r.top) / r.height) * e.currentTarget.height }; };
  if (!editing && value) {
    return (
      <div className="flex items-center gap-3 rounded-lg bg-zinc-50 p-2">
        <img src={value} alt="Signature" className="h-14 flex-1 object-contain" />
        <Button size="sm" onClick={() => { setEditing(true); onChange(null); }}><PenLine className="h-3.5 w-3.5" />Redraw</Button>
      </div>
    );
  }
  return (
    <div>
      <canvas ref={ref} width={600} height={180} className="h-[90px] w-full touch-none rounded-lg bg-zinc-50 ring-1 ring-inset ring-line"
        onPointerDown={(e) => { drawing.current = true; e.currentTarget.setPointerCapture(e.pointerId); const ctx = e.currentTarget.getContext("2d")!; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); }}
        onPointerMove={(e) => { if (!drawing.current) return; const ctx = e.currentTarget.getContext("2d")!; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); dirty.current = true; }}
        onPointerUp={() => { drawing.current = false; if (dirty.current && ref.current) onChange(ref.current.toDataURL("image/png")); }} />
      <div className="mt-1 flex items-center justify-between text-[0.72rem] text-ink-faint">
        <span>Sign above with your finger or mouse</span>
        <span className="flex items-center gap-3">
          <button type="button" onClick={() => { const c = ref.current; c?.getContext("2d")?.clearRect(0, 0, c.width, c.height); dirty.current = false; onChange(null); }} className="inline-flex items-center gap-1 hover:text-ink"><Eraser className="h-3 w-3" />Clear</button>
          {value && <button type="button" onClick={() => setEditing(false)} className="font-semibold text-brand-700 hover:underline">Done</button>}
        </span>
      </div>
    </div>
  );
}
