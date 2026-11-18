"use client";

/* The 360° walkthrough builder: rooms (panoramas), arrows between rooms and sound-clip hotspots.
   Positions use the same x/y (0–1) as exit360 and the viewer in ./tour.tsx. */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Check, Eye, EyeOff, Flag, Loader2, Navigation, Plus, Trash2, Upload, Volume2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormError, Input, Label, Select } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { createClient } from "@/lib/supabase/client";
import { saveTour } from "@/app/(app)/business-sale/actions";
import { thumb, type TourPin, type TourSpace } from "./tour";

type Pin = TourPin & { description?: string; heightMetres?: number };
type Space = TourSpace & { pins: Pin[] };

const xToYaw = (x: number) => (x - 0.5) * 360;
const yToPitch = (y: number) => (0.5 - y) * 180;
const yawToX = (yaw: number) => yaw / 360 + 0.5;
const pitchToY = (pitch: number) => 0.5 - pitch / 180;
const toXY = (pitch: number, yaw: number) => ({ x: ((yawToX(yaw) % 1) + 1) % 1, y: Math.min(1, Math.max(0, pitchToY(pitch))) });
const uid = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Pnlm = any;
let pnlmPromise: Promise<Pnlm> | null = null;
function loadPannellum(): Promise<Pnlm> {
  const w = window as unknown as { pannellum?: Pnlm };
  if (w.pannellum) return Promise.resolve(w.pannellum);
  if (pnlmPromise) return pnlmPromise;
  pnlmPromise = new Promise((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet"; css.href = "https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.css";
    document.head.appendChild(css);
    const js = document.createElement("script");
    js.src = "https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.js";
    js.onload = () => resolve((window as unknown as { pannellum: Pnlm }).pannellum);
    js.onerror = () => { pnlmPromise = null; reject(new Error("The 360° viewer didn't load — check your connection.")); };
    document.head.appendChild(js);
  });
  return pnlmPromise;
}

/** Upload a panorama (shrunk to 4096×2048, which every phone can show) or a sound clip to sale-media/<org>/tour/… */
async function uploadMedia(orgId: string, file: File, kind: "pano" | "audio"): Promise<string> {
  let blob: Blob = file, ext = (file.name.split(".").pop() || "bin").toLowerCase();
  if (kind === "pano") {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("Use a JPG, PNG or WebP 360° photo.");
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, 4096 / bmp.width);
      const c = document.createElement("canvas");
      c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
      c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
      const out = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.88));
      if (out) { blob = out; ext = "jpg"; }
    } catch { /* upload as is */ }
  } else if (!/^audio\//.test(file.type)) throw new Error("Use an MP3 or M4A sound clip.");
  if (blob.size > 25 * 1024 * 1024) throw new Error("That file is over 25 MB.");
  const supabase = createClient();
  const path = `${orgId}/tour/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("sale-media").upload(path, blob, { contentType: blob.type || file.type, cacheControl: "31536000", upsert: false });
  if (error) throw new Error(/bucket not found/i.test(error.message) ? "Run the database update 0112_sale_report_buyers.sql first." : error.message);
  return supabase.storage.from("sale-media").getPublicUrl(path).data.publicUrl;
}

export function TourEditor({ orgId, listingId, initial, onDone }: { orgId: string; listingId: string; initial: TourSpace[]; onDone: () => void }) {
  const router = useRouter();
  const [spaces, setSpaces] = useState<Space[]>(() => initial.map((s) => ({ ...s, pins: (s.pins ?? []) as Pin[] })));
  const [selSpace, setSelSpace] = useState<string | null>(() => (initial.find((s) => s.isStartScene) ?? initial[0])?.id ?? null);
  const [selPin, setSelPin] = useState<string | null>(null);
  const [placing, setPlacing] = useState<"navigation" | "audio" | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Pnlm>(null);
  const placingRef = useRef(placing); placingRef.current = placing;
  const space = spaces.find((s) => s.id === selSpace) ?? null;
  const pin = space?.pins.find((p) => p.id === selPin) ?? null;
  const spaceRef = useRef(space); spaceRef.current = space;

  const touch = () => setDirty(true);
  const updSpace = (id: string, patch: Partial<Space>) => { setSpaces((ss) => ss.map((s) => (s.id === id ? { ...s, ...patch } : s))); touch(); };
  const updPin = (sid: string, pid: string, patch: Partial<Pin>) => { setSpaces((ss) => ss.map((s) => (s.id === sid ? { ...s, pins: s.pins.map((p) => (p.id === pid ? { ...p, ...patch } : p)) } : s))); touch(); };

  function hotspot(p: Pin, sid: string) {
    const col = p.type === "audio" ? "#16a34a" : "#2563eb";
    const sel = p.id === selPin;
    return {
      id: p.id, pitch: yToPitch(p.position.y), yaw: xToYaw(p.position.x), cssClass: "eos-edit-hs", draggable: true,
      dragHandlerFunc: (e: MouseEvent) => { try { const [pitch, yaw] = viewerRef.current.mouseEventToCoords(e); updPin(sid, p.id, { position: toXY(pitch, yaw) }); } catch { /* ignore */ } },
      createTooltipFunc: (div: HTMLElement) => {
        div.style.cssText = "cursor:grab;transform:translate(-50%,-50%);width:0;height:0;overflow:visible";
        div.innerHTML = `<div style="position:relative"><div style="width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;background:${col};border:3px solid #fff;box-shadow:0 0 0 ${sel ? 5 : 0}px rgba(255,255,255,.45),0 2px 8px rgba(0,0,0,.6)"></div><div style="position:absolute;top:16px;left:50%;transform:translateX(-50%);white-space:nowrap;font:600 11px system-ui;color:#fff;background:rgba(0,0,0,.6);padding:2px 6px;border-radius:6px">${(p.title || (p.type === "audio" ? "Sound clip" : "Go to…")).replace(/[<>&"]/g, "")}</div></div>`;
        div.addEventListener("mousedown", () => { setSelPin(p.id); setPlacing(null); });
        div.addEventListener("click", (ev) => { ev.stopPropagation(); setSelPin(p.id); setPlacing(null); });
      },
    };
  }

  // the viewer for the selected room
  useEffect(() => {
    const s = spaceRef.current;
    if (!s?.panoramaUrl) { try { viewerRef.current?.destroy(); } catch { /* ignore */ } viewerRef.current = null; return; }
    let gone = false;
    loadPannellum().then((pnlm) => {
      if (gone || !stageRef.current) return;
      try { viewerRef.current?.destroy(); } catch { /* ignore */ }
      const v = pnlm.viewer(stageRef.current, {
        type: "equirectangular", panorama: s.panoramaUrl, autoLoad: true, showZoomCtrl: true, showFullscreenCtrl: false, compass: false,
        hfov: 100, yaw: typeof s.defaultYaw === "number" ? s.defaultYaw : s.panoramaStartYaw ?? 0, crossOrigin: "anonymous",
        hotSpots: s.pins.map((p) => hotspot(p, s.id)),
      });
      viewerRef.current = v;
      const onClick = (e: MouseEvent) => {
        const type = placingRef.current, cur = spaceRef.current;
        if (!type || !cur) return;
        try {
          const [pitch, yaw] = v.mouseEventToCoords(e);
          const p: Pin = { id: uid("pin"), type, title: type === "audio" ? "Sound clip" : "", position: toXY(pitch, yaw) };
          setSpaces((ss) => ss.map((x) => (x.id === cur.id ? { ...x, pins: [...x.pins, p] } : x)));
          setSelPin(p.id); setPlacing(null); setDirty(true);
        } catch { /* ignore */ }
      };
      stageRef.current.addEventListener("click", onClick);
      v.__onClick = onClick;
    }).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
    return () => {
      gone = true;
      const v = viewerRef.current;
      if (v) { try { if (v.__onClick) stageRef.current?.removeEventListener("click", v.__onClick); v.destroy(); } catch { /* ignore */ } viewerRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selSpace, space?.panoramaUrl]);

  // refresh hotspots when pins change, without reloading the panorama
  useEffect(() => {
    const v = viewerRef.current; if (!v || !space) return;
    try {
      (v.getConfig().hotSpots ?? []).slice().forEach((h: { id: string }) => { try { v.removeHotSpot(h.id); } catch { /* ignore */ } });
      space.pins.forEach((p) => { try { v.addHotSpot(hotspot(p, space.id)); } catch { /* ignore */ } });
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [space?.pins, selPin]);

  const addRoom = () => { const s: Space = { id: uid("space"), name: `Room ${spaces.length + 1}`, panoramaUrl: "", pins: [], isStartScene: spaces.length === 0 }; setSpaces((ss) => [...ss, s]); setSelSpace(s.id); setSelPin(null); touch(); };
  const delRoom = (id: string) => { setSpaces((ss) => ss.filter((s) => s.id !== id).map((s) => ({ ...s, pins: s.pins.filter((p) => p.targetSpaceId !== id) }))); if (selSpace === id) setSelSpace(spaces.find((s) => s.id !== id)?.id ?? null); setSelPin(null); touch(); };
  const move = (i: number, d: -1 | 1) => { const j = i + d; if (j < 0 || j >= spaces.length) return; setSpaces((ss) => { const a = [...ss]; [a[i], a[j]] = [a[j], a[i]]; return a; }); touch(); };
  const upload = async (file: File | undefined, kind: "pano" | "audio", key: string, done: (url: string) => void) => {
    if (!file) return; setBusy(key); setErr(null);
    try { done(await uploadMedia(orgId, file, kind)); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy("");
  };
  const save = async () => {
    setBusy("save"); setErr(null);
    const r = await saveTour(listingId, spaces);
    setBusy("");
    if (!r.ok) { setErr(r.error); return; }
    setDirty(false); router.refresh();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[0.8125rem] text-ink-muted">{dirty ? "Unsaved changes." : "All changes saved."} Drag a hotspot to move it.</p>
        <div className="flex gap-2">
          <Button onClick={() => { if (!dirty) onDone(); else { setSpaces(initial.map((s) => ({ ...s, pins: (s.pins ?? []) as Pin[] }))); setDirty(false); onDone(); } }}>{dirty ? "Discard" : "Close builder"}</Button>
          <Button variant="primary" disabled={!dirty || busy === "save"} onClick={save}>{busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Save tour</Button>
        </div>
      </div>
      <FormError message={err} />
      <div className="grid gap-3 lg:grid-cols-[15rem_minmax(0,1fr)_18rem]">
        {/* rooms */}
        <div className="order-2 rounded-2xl bg-surface p-2 ring-1 ring-line lg:order-1">
          <div className="flex items-center justify-between px-1.5 py-1"><p className="text-[0.8125rem] font-semibold text-ink">Rooms ({spaces.length})</p><button type="button" onClick={addRoom} className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[0.8125rem] font-medium text-brand-700"><Plus className="h-4 w-4" />Add</button></div>
          <ul className="max-h-[32rem] space-y-1 overflow-y-auto">
            {spaces.map((s, i) => (
              <li key={s.id}>
                <div className={cn("flex items-center gap-2 rounded-xl p-1.5", s.id === selSpace ? "bg-canvas ring-1 ring-line" : "")}>
                  <button type="button" onClick={() => { setSelSpace(s.id); setSelPin(null); setPlacing(null); }} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                    {s.panoramaUrl ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={thumb(s.panoramaUrl, 96, 60)} alt="" className="h-9 w-14 shrink-0 rounded-md object-cover" /> : <span className="grid h-9 w-14 shrink-0 place-items-center rounded-md bg-canvas text-[0.625rem] text-ink-faint ring-1 ring-line">no photo</span>}
                    <span className="min-w-0">
                      <span className={cn("block truncate text-[0.8125rem] text-ink", s.enabled === false && "text-ink-faint line-through")}>{s.name}</span>
                      <span className="block text-[0.6875rem] text-ink-faint">{s.isStartScene ? "Start · " : ""}{s.pins.length} hotspot{s.pins.length === 1 ? "" : "s"}</span>
                    </span>
                  </button>
                  <span className="flex shrink-0 flex-col">
                    <button type="button" aria-label="Move up" onClick={() => move(i, -1)} className="text-ink-faint hover:text-ink"><ArrowUp className="h-3.5 w-3.5" /></button>
                    <button type="button" aria-label="Move down" onClick={() => move(i, 1)} className="text-ink-faint hover:text-ink"><ArrowDown className="h-3.5 w-3.5" /></button>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* panorama */}
        <div className="order-1 lg:order-2">
          <div className="relative overflow-hidden rounded-2xl bg-black ring-1 ring-line" style={{ height: "clamp(320px, 52vw, 560px)" }}>
            {space?.panoramaUrl ? <div ref={stageRef} className={cn("h-full w-full", placing && "cursor-crosshair")} /> : (
              <label className="grid h-full cursor-pointer place-items-center text-center text-[0.875rem] text-white/80">
                <span>{busy === "pano" ? <Loader2 className="mx-auto h-6 w-6 animate-spin" /> : <Upload className="mx-auto h-6 w-6" />}<span className="mt-2 block">{space ? "Upload this room's 360° photo" : "Add a room to start"}</span></span>
                {space && <input type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files?.[0], "pano", "pano", (url) => updSpace(space.id, { panoramaUrl: url }))} />}
              </label>
            )}
            {placing && <div className="pointer-events-none absolute inset-x-0 top-3 mx-auto w-fit rounded-full bg-black/70 px-3 py-1.5 text-[0.75rem] text-white">Tap the panorama where the {placing === "audio" ? "sound clip" : "arrow"} goes</div>}
          </div>
          {space?.panoramaUrl && (
            <div className="mt-2 flex flex-wrap gap-2">
              <Button variant={placing === "navigation" ? "primary" : "secondary"} onClick={() => setPlacing(placing === "navigation" ? null : "navigation")}><Navigation className="h-4 w-4" />Add arrow to a room</Button>
              <Button variant={placing === "audio" ? "primary" : "secondary"} onClick={() => setPlacing(placing === "audio" ? null : "audio")}><Volume2 className="h-4 w-4" />Add sound clip</Button>
              <Button onClick={() => { try { updSpace(space.id, { defaultYaw: Math.round(viewerRef.current.getYaw()) }); } catch { /* ignore */ } }}><Flag className="h-4 w-4" />Start facing this way</Button>
            </div>
          )}
        </div>

        {/* settings */}
        <div className="order-3 rounded-2xl bg-surface p-3.5 ring-1 ring-line">
          {pin && space ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between"><p className="text-[0.875rem] font-semibold text-ink">{pin.type === "audio" ? "Sound clip" : "Arrow to a room"}</p><button type="button" aria-label="Close" onClick={() => setSelPin(null)} className="text-ink-faint hover:text-ink"><X className="h-4 w-4" /></button></div>
              <div><Label>Label</Label><Input value={pin.title} onChange={(e) => updPin(space.id, pin.id, { title: e.target.value })} placeholder={pin.type === "audio" ? "e.g. First impressions" : "e.g. Kitchen"} /></div>
              {pin.type === "navigation" ? (<>
                <div><Label>Goes to</Label><Select value={pin.targetSpaceId ?? ""} onChange={(e) => { const t = spaces.find((s) => s.id === e.target.value); updPin(space.id, pin.id, { targetSpaceId: e.target.value || undefined, title: pin.title || t?.name || "" }); }}><option value="">Choose a room</option>{spaces.filter((s) => s.id !== space.id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></div>
                <div><Label hint="0–359, blank = that room's start">Facing on arrival</Label><Input inputMode="numeric" value={pin.targetYaw == null ? "" : String(pin.targetYaw)} onChange={(e) => updPin(space.id, pin.id, { targetYaw: e.target.value.trim() === "" ? undefined : ((Number(e.target.value) % 360) + 360) % 360 })} /></div>
              </>) : (
                <div className="space-y-2">
                  <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl px-3 text-[0.8125rem] font-medium text-ink ring-1 ring-inset ring-line">
                    {busy === "pinaudio" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{pin.audioUrl ? "Replace clip" : "Upload clip"}
                    <input type="file" accept="audio/*" className="hidden" onChange={(e) => upload(e.target.files?.[0], "audio", "pinaudio", (url) => updPin(space.id, pin.id, { audioUrl: url, audioName: pin.title }))} />
                  </label>
                  {pin.audioUrl && <audio src={pin.audioUrl} controls className="h-9 w-full" />}
                </div>
              )}
              <Button variant="danger" onClick={() => { setSpaces((ss) => ss.map((s) => (s.id === space.id ? { ...s, pins: s.pins.filter((p) => p.id !== pin.id) } : s))); setSelPin(null); touch(); }}><Trash2 className="h-4 w-4" />Remove hotspot</Button>
            </div>
          ) : space ? (
            <div className="space-y-3">
              <p className="text-[0.875rem] font-semibold text-ink">Room</p>
              <div><Label>Name</Label><Input value={space.name} onChange={(e) => updSpace(space.id, { name: e.target.value })} /></div>
              <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl px-3 text-[0.8125rem] font-medium text-ink ring-1 ring-inset ring-line">
                {busy === "pano" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{space.panoramaUrl ? "Replace 360° photo" : "Upload 360° photo"}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files?.[0], "pano", "pano", (url) => updSpace(space.id, { panoramaUrl: url }))} />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => { setSpaces((ss) => ss.map((s) => ({ ...s, isStartScene: s.id === space.id }))); touch(); }} disabled={!!space.isStartScene}><Flag className="h-4 w-4" />{space.isStartScene ? "Tour starts here" : "Start tour here"}</Button>
                <Button onClick={() => updSpace(space.id, { enabled: space.enabled === false })}>{space.enabled === false ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}{space.enabled === false ? "Show to buyers" : "Hide from buyers"}</Button>
              </div>
              <div className="space-y-2 border-t border-line pt-3">
                <Label hint="plays on arrival">Room narration</Label>
                <Input value={space.audioName ?? ""} onChange={(e) => updSpace(space.id, { audioName: e.target.value })} placeholder="e.g. First impressions matter" />
                <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl px-3 text-[0.8125rem] font-medium text-ink ring-1 ring-inset ring-line">
                  {busy === "roomaudio" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{space.audioUrl ? "Replace narration" : "Upload narration"}
                  <input type="file" accept="audio/*" className="hidden" onChange={(e) => upload(e.target.files?.[0], "audio", "roomaudio", (url) => updSpace(space.id, { audioUrl: url }))} />
                </label>
                {space.audioUrl && <><audio src={space.audioUrl} controls className="h-9 w-full" /><button type="button" onClick={() => updSpace(space.id, { audioUrl: undefined, audioName: undefined })} className="text-[0.75rem] text-ink-muted hover:text-rose-600">Remove narration</button></>}
              </div>
              <p className="text-[0.75rem] text-ink-faint">{space.pins.length} hotspot{space.pins.length === 1 ? "" : "s"} — tap one on the panorama to edit it.</p>
              <Button variant="danger" onClick={() => delRoom(space.id)}><Trash2 className="h-4 w-4" />Delete room</Button>
            </div>
          ) : <p className="text-[0.8125rem] text-ink-muted">Add a room to start building the walkthrough.</p>}
        </div>
      </div>
    </div>
  );
}
