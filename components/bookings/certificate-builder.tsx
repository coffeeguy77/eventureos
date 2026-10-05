"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { Eraser, ImageUp, Loader2, PenLine, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { artFor, CERT_FONT_CSS, layout, toSvg, type CertDesign, type CertStyle } from "@/lib/bookings/certificate";
import { saveCertificateDesign } from "@/app/(app)/bookings/certificate-actions";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/form";
import { cn } from "@/lib/cn";

const STYLES: { id: CertStyle; name: string; hint: string }[] = [
  { id: "swoosh", name: "Swoosh", hint: "Flowing curves, right-aligned" },
  { id: "classic", name: "Classic", hint: "Double border, script name" },
  { id: "modern", name: "Modern", hint: "Colour band, bold type" },
  { id: "minimal", name: "Minimal", hint: "Clean and light" },
  { id: "latte", name: "Photo panel", hint: "Your photo, big title, skill icons" },
  { id: "botanical", name: "Botanical", hint: "Coffee branches, ornate border" },
  { id: "poster", name: "Poster", hint: "Bold colour panel, skill icons" },
  { id: "elegant", name: "Elegant", hint: "Fine border, serif name" },
];
const NEW = ["latte", "botanical", "poster", "elegant"];
const PALETTES: { name: string; accent: string; paper: string }[] = [
  { name: "Gold", accent: "#9A7B4F", paper: "#FFFDF7" },
  { name: "Espresso", accent: "#5B3A29", paper: "#FBF7F2" },
  { name: "Forest", accent: "#2F5D50", paper: "#F8FBF9" },
  { name: "Navy", accent: "#1F3A5F", paper: "#F7F9FC" },
  { name: "Rose", accent: "#C2416B", paper: "#FFF8FA" },
  { name: "Charcoal", accent: "#2B2B2B", paper: "#FFFFFF" },
];

export function CertificateBuilder({ initial, autoIssue, brand, business, logoUrl, sampleCourse, hasTemplate, orgId, courses = [] }: {
  initial: CertDesign; autoIssue: boolean; brand: string | null; business: string; logoUrl: string | null; sampleCourse: string; hasTemplate: boolean; orgId: string;
  courses?: { id: string; name: string; minutes: number }[];
}) {
  const router = useRouter();
  const [d, setD] = useState<CertDesign>(initial);
  const [auto, setAuto] = useState(autoIssue);
  const [name, setName] = useState("Alex Example");
  const [qr, setQr] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof CertDesign>(k: K, v: CertDesign[K]) => setD({ ...d, [k]: v });
  // Which course the preview shows (so its skills appear)
  const [previewCourse, setPreviewCourse] = useState(courses[0]?.id ?? "");
  const pc = courses.find((c) => c.id === previewCourse) ?? null;
  const [skillText, setSkillText] = useState<Record<string, string>>(() => Object.fromEntries(courses.map((c) => [c.id, (initial.skills[c.id] ?? []).join("\n")])));
  const setSkills = (id: string, text: string) => {
    setSkillText({ ...skillText, [id]: text });
    const pts = text.split(/\n/).map((x) => x.replace(/^[\s•*·-]+/, "").trim()).filter(Boolean).slice(0, 10);
    const next = { ...d.skills };
    if (pts.length) next[id] = pts; else delete next[id];
    setD({ ...d, skills: next });
  };

  const data = useMemo(() => ({ name: name || "Alex Example", course: pc ? pc.name.replace(/\s*\(\d+\s*hrs?\)\s*$/i, "") : sampleCourse,
    date: new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "long", year: "numeric" }).format(new Date()),
    hours: pc?.minutes ? `${Math.round((pc.minutes / 60) * 10) / 10} hour${pc.minutes === 60 ? "" : "s"}` : "2 hours", number: "C-1001", business, verifyUrl: "https://www.eventureos.com.au/verify/example",
    points: pc ? d.skills[pc.id] ?? [] : [] }), [name, sampleCourse, business, pc, d.skills]);
  useEffect(() => { QRCode.toDataURL(data.verifyUrl, { margin: 0, width: 200 }).then(setQr).catch(() => setQr(null)); }, [data.verifyUrl]);
  const svg = useMemo(() => toSvg(layout(d, data, { logo: !!logoUrl, art: !!artFor(d) }), { logo: logoUrl, signature: d.signature, qr, background: d.background, photo: d.photo, art: artFor(d) }), [d, data, logoUrl, qr]);
  const [upErr, setUpErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const uploadArtwork = async (f: File, key: "background" | "photo" | "art" = "background") => {
    setUpErr(null);
    if (!/^image\/(png|jpeg)$/.test(f.type)) { setUpErr("Use a PNG or JPG image."); return; }
    if (f.size > (key === "art" ? 4 : 2) * 1024 * 1024) { setUpErr(`That image is over ${key === "art" ? 4 : 2} MB — save it smaller (about 2500 px wide is plenty).`); return; }
    setUploading(true);
    try {
      const supabase = createClient();
      const path = `${orgId}/certificate/${key}-${Date.now()}.${f.type === "image/png" ? "png" : "jpg"}`;
      const { error } = await supabase.storage.from("branding").upload(path, f, { contentType: f.type, cacheControl: "31536000", upsert: false });
      if (error) throw new Error(/row-level|policy/i.test(error.message) ? "Only owners and admins can upload artwork." : error.message);
      const url = supabase.storage.from("branding").getPublicUrl(path).data.publicUrl;
      if (key === "art") setD((x) => ({ ...x, arts: { ...x.arts, [x.style]: url } }));
      else set(key, url);
    } catch (e) { setUpErr(e instanceof Error ? e.message : "Upload failed"); } finally { setUploading(false); }
  };

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
      <style>{CERT_FONT_CSS}</style>
      <div className="space-y-4">
        <section className="rounded-xl border border-line bg-surface p-4 shadow-card">
          <p className="mb-2 text-[0.8438rem] font-semibold text-ink">Style</p>
          <div className="grid grid-cols-2 gap-2">
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

        {d.style === "swoosh" && (
          <section className="rounded-xl border border-line bg-surface p-4 shadow-card">
            <p className="text-[0.8438rem] font-semibold text-ink">Artwork</p>
            <p className="mb-2 text-[0.75rem] text-ink-muted">The curves are drawn in your colours. Or upload your own full-page background (A4 landscape, PNG or JPG) — keep the right-hand side plain for the text.</p>
            {d.background ? (
              <div className="flex items-center gap-2"><img src={d.background} alt="" className="h-12 w-[68px] rounded object-cover ring-1 ring-line" /><Button size="sm" onClick={() => set("background", null)}>Use the built-in curves</Button></div>
            ) : (
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.78rem] font-medium text-ink ring-1 ring-inset ring-line-strong hover:bg-zinc-50">
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}Upload background
                <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadArtwork(f); e.target.value = ""; }} />
              </label>
            )}
            {upErr && <p className="mt-1.5 text-[0.75rem] text-rose-700">{upErr}</p>}
          </section>
        )}

        {NEW.includes(d.style) && (
          <section className="rounded-xl border border-line bg-surface p-4 shadow-card">
            <p className="text-[0.8438rem] font-semibold text-ink">Finished artwork</p>
            <p className="mb-2 text-[0.75rem] text-ink-muted">Optional: a complete A4 landscape design for this style, with the student&apos;s name, course, hours, skills, signature, date and QR code left blank. Those are printed on top in this style&apos;s places.</p>
            <div className="flex flex-wrap items-center gap-2">
              {artFor(d) && <><img src={artFor(d)!} alt="" className="h-12 w-[68px] rounded object-cover ring-1 ring-line" /><Button size="sm" onClick={() => { const a = { ...d.arts }; delete a[d.style as keyof typeof a]; set("arts", a); }}>Use the drawn version</Button></>}
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.78rem] font-medium text-ink ring-1 ring-inset ring-line-strong hover:bg-zinc-50">
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}{artFor(d) ? "Replace artwork" : "Upload artwork"}
                <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadArtwork(f, "art"); e.target.value = ""; }} />
              </label>
            </div>
          </section>
        )}

        {(d.style === "latte" || d.style === "poster") && !artFor(d) && (
          <section className="rounded-xl border border-line bg-surface p-4 shadow-card">
            <p className="text-[0.8438rem] font-semibold text-ink">Photo</p>
            <p className="mb-2 text-[0.75rem] text-ink-muted">{d.style === "latte" ? "Fills the panel on the left — a latte or a barista at work looks great." : "Shown at the bottom of the colour panel, washed in your colour."} PNG or JPG, under 2 MB.</p>
            <div className="flex flex-wrap items-center gap-2">
              {d.photo && <><img src={d.photo} alt="" className="h-12 w-[68px] rounded object-cover ring-1 ring-line" /><Button size="sm" onClick={() => set("photo", null)}>Remove</Button></>}
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.78rem] font-medium text-ink ring-1 ring-inset ring-line-strong hover:bg-zinc-50">
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}{d.photo ? "Change photo" : "Upload photo"}
                <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadArtwork(f, "photo"); e.target.value = ""; }} />
              </label>
            </div>
            {upErr && <p className="mt-1.5 text-[0.75rem] text-rose-700">{upErr}</p>}
          </section>
        )}

        <section className="space-y-2.5 rounded-xl border border-line bg-surface p-4 shadow-card">
          <p className="text-[0.8438rem] font-semibold text-ink">Wording</p>
          {d.style === "latte" && <div><Label hint="optional">Small line above the title</Label><Input value={d.eyebrow} onChange={(e) => set("eyebrow", e.target.value)} maxLength={40} placeholder="Barista training" /></div>}
          <div><Label>Title</Label><Input value={d.title} onChange={(e) => set("title", e.target.value)} maxLength={80} /></div>
          <div><Label>Line above the name</Label><Input value={d.subtitle} onChange={(e) => set("subtitle", e.target.value)} maxLength={80} /></div>
          <div><Label hint="{course} {date} {hours} {business}">Main text</Label><Textarea value={d.body} onChange={(e) => set("body", e.target.value)} maxLength={300} className="min-h-[64px]" /></div>
          {NEW.includes(d.style) && <>
            <div><Label hint="{business} {hours}">Line under the course</Label><Input value={d.tagline} onChange={(e) => set("tagline", e.target.value)} maxLength={120} placeholder="{business} · Canberra" /></div>
            <div><Label hint="shown when the course has a length">Hours line</Label><Input value={d.hoursLine} onChange={(e) => set("hoursLine", e.target.value)} maxLength={60} placeholder="{hours} practical training" /></div>
          </>}
          {d.style === "poster" && <>
            <div><Label>Big words on the colour panel</Label><Input value={d.panelTitle} onChange={(e) => set("panelTitle", e.target.value)} maxLength={40} placeholder="Barista training" /></div>
            <div><Label hint="one per line">Small words on the panel</Label><Textarea value={d.panelWords} onChange={(e) => set("panelWords", e.target.value)} maxLength={160} className="min-h-[64px]" placeholder={"Coffee\nPeople\nSkills"} /></div>
          </>}
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

        {courses.length > 0 && (
          <section className="rounded-xl border border-line bg-surface p-4 shadow-card">
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="text-[0.8438rem] font-semibold text-ink">What each course covers</p>
              <label className="flex items-center gap-1.5 text-[0.75rem] text-ink-muted"><input type="checkbox" checked={d.showSkills} onChange={(e) => set("showSkills", e.target.checked)} />Show on certificate</label>
            </div>
            <p className="mb-3 text-[0.75rem] text-ink-muted">One skill per line (up to 10). Printed under &ldquo;Skills covered&rdquo; with the course length — handy for job applications.</p>
            <div className="space-y-3">
              {courses.map((c) => (
                <div key={c.id}>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <Label>{c.name}</Label>
                    <button type="button" onClick={() => setPreviewCourse(c.id)} className={cn("text-[0.72rem] font-semibold", previewCourse === c.id ? "text-ink-muted" : "text-brand-700 hover:underline")}>{previewCourse === c.id ? "In preview" : "Preview this"}</button>
                  </div>
                  <textarea rows={4} value={skillText[c.id] ?? ""} onChange={(e) => setSkills(c.id, e.target.value)} onFocus={() => setPreviewCourse(c.id)}
                    className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-[0.8125rem] text-ink placeholder:text-ink-faint focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                    placeholder={"For example:\nEspresso extraction\nMilk texturing\nLatte art basics"} />
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="rounded-xl border border-line bg-surface p-4 shadow-card">
          <p className="mb-2 text-[0.8438rem] font-semibold text-ink">Show</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[0.8125rem] text-ink">
            <label className="flex items-center gap-2"><input type="checkbox" checked={d.showLogo} onChange={(e) => set("showLogo", e.target.checked)} />Logo</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={d.showSeal} onChange={(e) => set("showSeal", e.target.checked)} />Seal</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={d.showQr} onChange={(e) => set("showQr", e.target.checked)} />Verify QR code</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={d.showNumber} onChange={(e) => set("showNumber", e.target.checked)} />Certificate number</label>
          </div>
          {d.showSeal && <div className="mt-2"><Label>Seal word</Label><Input value={d.sealText} onChange={(e) => set("sealText", e.target.value)} maxLength={24} /></div>}
          {d.showSeal && NEW.includes(d.style) && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div><Label>Around the top</Label><Input value={d.sealTop} onChange={(e) => set("sealTop", e.target.value)} maxLength={40} placeholder="{business}" /></div>
              <div><Label>Around the bottom</Label><Input value={d.sealBottom} onChange={(e) => set("sealBottom", e.target.value)} maxLength={30} placeholder="Barista" /></div>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-line bg-surface p-4 shadow-card">
          <label className="flex items-start gap-2 text-[0.8125rem] text-ink"><input type="checkbox" className="mt-0.5" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
            <span><b className="font-semibold">Give certificates automatically</b><span className="block text-ink-muted">Everyone gets one after their class, ready in their account{hasTemplate ? "" : ", and all past students get theirs when you save"}.</span></span></label>
          <label className="mt-3 flex items-start gap-2 text-[0.8125rem] text-ink"><input type="checkbox" className="mt-0.5" checked={d.emailAuto} onChange={(e) => set("emailAuto", e.target.checked)} />
            <span><b className="font-semibold">Email certificates automatically</b><span className="block text-ink-muted">About an hour after each class, students (and their case manager) get the PDF by email. Leave off until you&apos;re happy with the design.</span></span></label>
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
          <div className="flex flex-wrap items-center gap-2">
            {courses.length > 1 && <select aria-label="Course in preview" value={previewCourse} onChange={(e) => setPreviewCourse(e.target.value)} className="h-8 rounded-lg border border-line-strong bg-surface px-2 text-[0.78rem] text-ink">{courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
            <label className="flex items-center gap-2 text-[0.78rem] text-ink-muted">Try a name <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 w-48 py-1" maxLength={60} /></label>
          </div>
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
        <span className="flex items-center gap-2">Sign above, or
          <label className="inline-flex cursor-pointer items-center gap-1 font-semibold text-brand-700 hover:underline"><ImageUp className="h-3 w-3" />upload an image
            <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void shrinkImage(f).then((url) => { onChange(url); setEditing(false); }).catch(() => undefined); }} />
          </label>
        </span>
        <span className="flex items-center gap-3">
          <button type="button" onClick={() => { const c = ref.current; c?.getContext("2d")?.clearRect(0, 0, c.width, c.height); dirty.current = false; onChange(null); }} className="inline-flex items-center gap-1 hover:text-ink"><Eraser className="h-3 w-3" />Clear</button>
          {value && <button type="button" onClick={() => setEditing(false)} className="font-semibold text-brand-700 hover:underline">Done</button>}
        </span>
      </div>
    </div>
  );
}

/** Resize an uploaded signature/logotype to at most 800 px wide and keep it as a PNG (transparency preserved). */
function shrinkImage(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 800 / img.width);
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL(f.type === "image/jpeg" ? "image/jpeg" : "image/png", 0.9));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(f);
  });
}
