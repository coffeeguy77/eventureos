"use client";

import { thumb } from "@/lib/sales/format";
export { thumb };
/* Ported from exit360 (Biz360-Mobile artifacts/exit360-web/src/components/InteractiveTour.tsx). */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Camera, Maximize2, Minimize2, LayoutGrid, EyeOff } from "lucide-react";

/**
 * Cross-platform "immersive" fullscreen. The native Fullscreen API
 * (element.requestFullscreen) is NOT supported on iOS Safari for anything other
 * than <video>, so the button silently did nothing on iPhone. Instead we make
 * the tour fill the viewport with a fixed overlay (position:fixed; inset:0),
 * which works identically on desktop and mobile. Body scroll is locked while
 * immersive and Escape exits.
 */
export function useImmersive() {
  const [isFs, setIsFs] = useState(false);
  useEffect(() => {
    if (!isFs) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setIsFs(false); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [isFs]);
  return { isFs, setIsFs, toggle: () => setIsFs((v) => !v) };
}

/** Wrapper style for a tour frame — a fixed full-viewport overlay when immersive. */
export function immersiveWrapStyle(isFs: boolean, collapsedHeight: string): CSSProperties {
  return isFs
    ? { position: "fixed", inset: 0, zIndex: 9999, borderRadius: 0, touchAction: "none" }
    : { height: collapsedHeight, touchAction: "none" };
}

export interface TourPin {
  id: string;
  type: string;
  title: string;
  position: { x: number; y: number };
  targetSpaceId?: string;
  targetYaw?: number;
  audioUrl?: string;
  audioName?: string;
}

export interface TourSpace {
  id: string;
  name: string;
  panoramaUrl: string;
  isStartScene?: boolean;
  autoPan?: boolean;
  audioUrl?: string;
  audioName?: string;
  groundPitch?: number;
  panoramaStartYaw?: number;
  defaultYaw?: number;
  /** When false, the zone is hidden from the tour (not deleted). Undefined = shown. */
  enabled?: boolean;
  pins: TourPin[];
}

/** Build the Pannellum multi-scene srcDoc with nav-pin + audio hotspots baked in. */
export function buildMultiSceneSrcdoc(spaces: TourSpace[], autoPanAll = false): string {
  // Disabled zones are hidden from the tour entirely; nav pins that point at
  // them are dropped automatically because validIds is built from this set.
  const shown = spaces.filter((s) => s.enabled !== false);
  const spacesJson = JSON.stringify(shown);
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0"/>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.css"/>
<script>(function(){var _I=window.Image;window.Image=function(w,h){var i=typeof w!='undefined'?new _I(w,h):new _I();i.crossOrigin='anonymous';return i};window.Image.prototype=_I.prototype;Object.defineProperty(window.Image,'prototype',{value:_I.prototype})})();<\/script>
<script src="https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.js"><\/script>
<style>
  *{box-sizing:border-box}
  html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:#000}
  #pano{position:absolute;inset:0;touch-action:none;user-select:none;-webkit-user-select:none;background:#000}
  @keyframes kfNavPulse{0%{transform:scale(0.9);opacity:0.7}70%{transform:scale(1.6);opacity:0}100%{transform:scale(1.6);opacity:0}}
  .nav-pin-ring{position:absolute;top:50%;left:50%;width:52px;height:52px;margin-left:-26px;margin-top:-26px;border-radius:50%;background:rgba(37,99,235,0.45);animation:kfNavPulse 2.2s ease-out infinite;pointer-events:none}
  .nav-pin-label{position:absolute;bottom:60px;left:50%;transform:translateX(-50%);background:rgba(15,23,42,0.88);color:#fff;font-size:11px;font-weight:600;padding:3px 9px;border-radius:8px;white-space:nowrap;pointer-events:none;font-family:system-ui,-apple-system,sans-serif;max-width:150px;overflow:hidden;text-overflow:ellipsis}
  .pnlm-hotspot.pnlm-nav-pin-wrap{background:transparent!important;border:none!important;box-shadow:none!important;width:52px!important;height:52px!important;overflow:visible!important;margin-left:-26px!important;margin-top:-26px!important}
  .pnlm-hotspot.pnlm-nav-pin-wrap::before{display:none!important}
  .pnlm-audio-hs{width:32px;height:32px;background:rgba(16,163,74,0.85);border:2px solid rgba(255,255,255,0.7);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;cursor:pointer;box-shadow:0 0 0 4px rgba(16,163,74,0.2);transition:background .2s;user-select:none}
  .pnlm-audio-hs:hover{background:rgba(16,163,74,1)}
  .pnlm-audio-hs.active{background:#ea580c;box-shadow:0 0 0 6px rgba(234,88,12,0.3)}
  .pnlm-audio-hs-tooltip{position:absolute;bottom:38px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.8);color:#fff;font-size:11px;font-weight:500;padding:4px 8px;border-radius:4px;white-space:nowrap;pointer-events:none;opacity:0;transition:opacity .2s}
  .pnlm-audio-hs:hover .pnlm-audio-hs-tooltip{opacity:1}
  /* ── Street-View style navigation overlay ── */
  #nav-layer{position:absolute;inset:0;pointer-events:none;z-index:20;font-family:system-ui,-apple-system,sans-serif}
  #nav-hint{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:none;flex-direction:column;align-items:center;gap:8px;pointer-events:auto;cursor:pointer}
  #nav-hint .ring{width:70px;height:70px;border-radius:50%;border:3px solid rgba(255,255,255,0.95);box-shadow:0 2px 14px rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;background:transparent;transition:transform .15s,background .15s}
  #nav-hint:hover .ring{transform:scale(1.08);background:rgba(255,255,255,0.14)}
  #nav-hint .ring svg{width:34px;height:34px}
  #nav-hint .hint-label{background:rgba(15,23,42,0.9);color:#fff;font-size:12px;font-weight:700;padding:5px 12px;border-radius:20px;white-space:nowrap;box-shadow:0 2px 10px rgba(0,0,0,0.5)}
  .nav-edge{position:absolute;top:50%;transform:translateY(-50%);width:52px;height:52px;border-radius:50%;background:rgba(15,23,42,0.55);border:2px solid rgba(255,255,255,0.55);display:none;align-items:center;justify-content:center;pointer-events:auto;cursor:pointer;backdrop-filter:blur(2px);transition:background .15s}
  .nav-edge:hover{background:rgba(37,99,235,0.7)}
  .nav-edge svg{width:26px;height:26px;stroke:#fff}
  #nav-edge-l{left:14px}#nav-edge-r{right:14px}
  #nav-chips{position:absolute;left:0;right:0;bottom:14px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap;padding:0 14px;pointer-events:none}
  .nav-chip{pointer-events:auto;cursor:pointer;display:inline-flex;align-items:center;gap:6px;background:rgba(15,23,42,0.82);color:#fff;font-size:12px;font-weight:600;padding:7px 13px;border-radius:20px;border:1px solid rgba(148,163,184,0.4);white-space:nowrap;box-shadow:0 2px 10px rgba(0,0,0,0.45);transition:background .15s,transform .15s;max-width:200px;overflow:hidden;text-overflow:ellipsis}
  .nav-chip:hover{background:rgba(37,99,235,0.85);transform:translateY(-1px)}
  .nav-chip .dot{width:8px;height:8px;border-radius:50%;background:#60a5fa;flex-shrink:0}
</style>
</head>
<body>
<div id="pano"></div>
<script>
var SPACES=${spacesJson};
function xToYaw(x){return(x-0.5)*360}
function yToPitch(y){return(0.5-y)*180}
/* Navigation preserves the viewer's current zoom (clamped to a sane band) so a
   scene change never snaps to a different zoom than what you're looking at.
   Fullscreen just sets a comfortable wide default — no aspect maths that could
   blow the field of view out to a "hyperspace" warp on ultra-wide screens. */
var IS_FS=false;
var FS_HFOV=112, EMBED_HFOV=100;
/* Safe maximum zoom-OUT. A 360 pano stays natural up to ~120°; beyond that it
   warps into "hyperspace". This is the single value to tune the max width. */
var MAX_HFOV=110;
function navHfov(){
  var h; try{h=viewer.getHfov();}catch(e){h=IS_FS?FS_HFOV:EMBED_HFOV;}
  if(!(h>0))h=IS_FS?FS_HFOV:EMBED_HFOV;
  if(h<70)h=70; if(h>MAX_HFOV)h=MAX_HFOV;
  return h;
}
function createNavPin(container,args){
  container.style.cssText='width:52px;height:52px;overflow:visible;position:relative;cursor:pointer';
  var ring=document.createElement('span');
  ring.className='nav-pin-ring';
  container.appendChild(ring);
  var svgWrap=document.createElement('div');
  svgWrap.style.cssText='position:absolute;top:50%;left:50%;width:44px;height:44px;margin-left:-22px;margin-top:-22px;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.55))';
  svgWrap.innerHTML=
    '<svg width="44" height="44" viewBox="0 0 44 44" fill="none" style="display:block">'+
      '<circle cx="22" cy="22" r="20" fill="white" stroke="#2563eb" stroke-width="2.5"/>'+
      '<path d="M22 29V17M15 24l7-8 7 8" stroke="#2563eb" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>'+
    '</svg>';
  container.appendChild(svgWrap);
  var label=document.createElement('span');
  label.className='nav-pin-label';
  label.textContent=args.label;
  container.appendChild(label);
  container.addEventListener('click',function(e){
    e.stopPropagation();
    try{
      /* Match the thumbnail navigation exactly: reset pitch to 0 and hfov to 100
         so we never inherit a zoomed/tilted view (the 'brown screen'/zoom bug),
         and face the target space's configured default orientation. */
      var navSp=SPACES.find(function(s){return s.id===args.sceneId});
      var navYaw=typeof args.targetYaw==='number'?args.targetYaw:(navSp&&typeof navSp.defaultYaw==='number'?navSp.defaultYaw:(navSp&&typeof navSp.panoramaStartYaw==='number'?navSp.panoramaStartYaw:0));
      viewer.loadScene(args.sceneId,0,navYaw,navHfov());
    }catch(err){}
  });
}
function createAudioHotspot(div,args){
  div.classList.add('pnlm-audio-hs');
  div.innerHTML='🔊<span class="pnlm-audio-hs-tooltip">'+args.name+'</span>';
  var audio=null,playing=false;
  div.addEventListener('click',function(e){
    e.stopPropagation();
    if(!audio)audio=new Audio(args.url);
    if(playing){audio.pause();playing=false;div.classList.remove('active')}
    else{audio.play().catch(function(){});playing=true;div.classList.add('active');audio.onended=function(){playing=false;div.classList.remove('active')}}
  });
}
var AUTOPAN_ALL=${autoPanAll ? "true" : "false"};
var validIds=new Set(SPACES.filter(function(s){return s.panoramaUrl&&s.panoramaUrl.indexOf('file://')!==0}).map(function(s){return s.id}));
var firstScene=null,scenesConfig={};
SPACES.forEach(function(s){
  if(!validIds.has(s.id))return;
  if(!firstScene)firstScene=s.id;
  if(s.isStartScene)firstScene=s.id;
  var hotSpots=[];
  (s.pins||[]).forEach(function(pin){
    if(pin.type==='navigation'&&validIds.has(pin.targetSpaceId)){
      /* Honour the seller's placed position (x→yaw, y→pitch) so markers appear
         exactly where they were dropped in the app. Clamp pitch to a sane band
         so a mis-placed pin never lands straight-down at your feet or overhead. */
      var navPitch=yToPitch(pin.position.y);
      if(navPitch<-35)navPitch=-35;
      if(navPitch>35)navPitch=35;
      hotSpots.push({pitch:navPitch,yaw:xToYaw(pin.position.x),type:'custom',cssClass:'pnlm-nav-pin-wrap',createTooltipFunc:createNavPin,createTooltipArgs:{sceneId:pin.targetSpaceId,label:pin.title,targetYaw:typeof pin.targetYaw==='number'?pin.targetYaw:null}});
    } else if(pin.type==='audio'&&pin.audioUrl){
      hotSpots.push({pitch:Math.max(10,yToPitch(pin.position.y)),yaw:xToYaw(pin.position.x),type:'custom',text:pin.title,cssClass:'pnlm-audio-hs-wrap',createTooltipFunc:createAudioHotspot,createTooltipArgs:{url:pin.audioUrl,name:pin.audioName||pin.title}});
    }
  });
  var sc={type:'equirectangular',panorama:s.panoramaUrl,title:s.name,hotSpots:hotSpots,pitch:0,hfov:100,minHfov:50,maxHfov:MAX_HFOV,yaw:typeof s.defaultYaw==='number'?s.defaultYaw:(typeof s.panoramaStartYaw==='number'?s.panoramaStartYaw:0)};
  if(typeof s.groundPitch==='number')sc.groundPitch=s.groundPitch;
  scenesConfig[s.id]=sc;
});
var userInteracted=false;
var viewer=pannellum.viewer('pano',{default:{firstScene:firstScene,sceneFadeDuration:800,autoLoad:true,showFullscreenCtrl:false,showZoomCtrl:true,compass:false,friction:0.15,hfov:100,pitch:0,yaw:0,minHfov:50,maxHfov:MAX_HFOV},scenes:scenesConfig});
(function(){
  var panoEl=document.getElementById('pano');
  function markInteracted(){userInteracted=true;}
  if(panoEl){
    panoEl.addEventListener('mousedown',markInteracted,{once:true,capture:true});
    panoEl.addEventListener('touchstart',markInteracted,{once:true,capture:true,passive:true});
  }
  var sp0=SPACES.find(function(s){return s.id===firstScene});
  if(AUTOPAN_ALL||(sp0&&sp0.autoPan)){try{viewer.startAutoRotate(-2)}catch(e){}}
})();
function doResize(){try{viewer.resize()}catch(e){}}
window.addEventListener('load',function(){setTimeout(doResize,50);setTimeout(doResize,300)});
window.addEventListener('resize',doResize);
viewer.on('scenechange',function(id){
  try{window.parent.postMessage({type:'pano_sceneChange',sceneId:id},'*')}catch(e){}
  currentSceneId=id;
  try{rebuildChips();}catch(e){}
  if(userInteracted)return;
  var scSp=SPACES.find(function(s){return s.id===id});
  if(AUTOPAN_ALL||(scSp&&scSp.autoPan)){try{viewer.startAutoRotate(-2)}catch(e){}}
  else{try{viewer.stopAutoRotate()}catch(e){}}
});
window.addEventListener('message',function(e){
  if(!e.data)return;
  if(e.data.type==='pano_goto'&&e.data.sceneId){try{ gotoScene(e.data.sceneId, typeof e.data.yaw==='number'?e.data.yaw:null); }catch(e2){}}
  else if(e.data.type==='pano_fullscreen'){
    IS_FS=!!e.data.on;
    /* In fullscreen the parent shows a bigger thumbnail row along the bottom, so
       lift the in-pano scene-chip labels ABOVE it (not hidden). When the presets
       are toggled off, hide the chips too. */
    try{
      if(typeof chipsEl!=='undefined'&&chipsEl){
        if(IS_FS){
          chipsEl.style.bottom=e.data.presets===false?'14px':'112px';
          chipsEl.style.display=e.data.presets===false?'none':'flex';
        }else{
          chipsEl.style.bottom='14px';
          chipsEl.style.display='flex';
        }
      }
    }catch(e3){}
    try{ setTimeout(function(){viewer.resize();viewer.setHfov(IS_FS?FS_HFOV:EMBED_HFOV,false);},60); }catch(e4){}
  }
  else if(e.data.type==='pano_presets'){
    try{ if(typeof chipsEl!=='undefined'&&chipsEl && IS_FS){ chipsEl.style.display=e.data.on?'flex':'none'; chipsEl.style.bottom=e.data.on?'112px':'14px'; } }catch(e5){}
  }
});

/* ─────────────────────────────────────────────────────────────────────────
   Street-View style navigation. Pannellum's own hotspot clicks proved
   unreliable, so navigation is driven entirely from here instead:
     • A bottom row of always-clickable scene chips (guaranteed to work).
     • Left/right edge arrows that appear when a connected space is off to
       the side — click to spin toward it.
     • A centre reticle: turn to face a doorway/opening and it lights up with
       "Enter <space>"; click the pano (or the reticle) to walk through.
   ───────────────────────────────────────────────────────────────────────── */
var currentSceneId=firstScene;
function defaultYawFor(id){var s=SPACES.find(function(x){return x.id===id});return s&&typeof s.defaultYaw==='number'?s.defaultYaw:(s&&typeof s.panoramaStartYaw==='number'?s.panoramaStartYaw:0);}
function gotoScene(id,yaw){
  if(!validIds.has(id))return;
  var y=typeof yaw==='number'?yaw:defaultYawFor(id);
  try{viewer.loadScene(id,0,y,navHfov());}catch(e){}
}
function navTargets(){
  var s=SPACES.find(function(x){return x.id===currentSceneId});
  if(!s)return [];
  return (s.pins||[]).filter(function(p){return p.type==='navigation'&&validIds.has(p.targetSpaceId);}).map(function(p){
    var tp=SPACES.find(function(x){return x.id===p.targetSpaceId});
    return {id:p.targetSpaceId,label:(p.title||(tp&&tp.name)||'Next space'),yaw:xToYaw(p.position.x),targetYaw:(typeof p.targetYaw==='number'?p.targetYaw:null)};
  });
}
function angDiff(a,b){var d=((a-b+540)%360)-180;return d;}

// Build overlay DOM
var navLayer=document.createElement('div');navLayer.id='nav-layer';
navLayer.innerHTML=
  '<div id="nav-hint"><div class="ring"><svg viewBox="0 0 44 44" fill="none"><path d="M22 8v22M12 20l10-12 10 12" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></div><div class="hint-label"></div></div>'+
  '<div class="nav-edge" id="nav-edge-l"><svg viewBox="0 0 24 24" fill="none"><path d="M15 5l-7 7 7 7" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>'+
  '<div class="nav-edge" id="nav-edge-r"><svg viewBox="0 0 24 24" fill="none"><path d="M9 5l7 7-7 7" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>'+
  '<div id="nav-chips"></div>';
document.body.appendChild(navLayer);
var hintEl=document.getElementById('nav-hint');
var edgeL=document.getElementById('nav-edge-l');
var edgeR=document.getElementById('nav-edge-r');
var chipsEl=document.getElementById('nav-chips');
var hintTargetId='';

hintEl.addEventListener('click',function(){if(hintTargetId)gotoScene(hintTargetId);});

function rebuildChips(){
  var targets=navTargets();
  chipsEl.innerHTML='';
  targets.forEach(function(t){
    var b=document.createElement('div');b.className='nav-chip';
    b.innerHTML='<span class="dot"></span>'+t.label;
    b.addEventListener('click',function(){gotoScene(t.id,t.targetYaw);});
    chipsEl.appendChild(b);
  });
}
rebuildChips();

// Turn-to-face reticle + edge arrows, updated each frame.
function tick(){
  /* Hard safety clamp — never let the zoom-out exceed MAX_HFOV (no hyperspace),
     regardless of scroll/pinch or any pannellum edge case. */
  try{ if(viewer.getHfov()>MAX_HFOV) viewer.setHfov(MAX_HFOV,false); }catch(e){}
  var yaw;try{yaw=viewer.getYaw();}catch(e){yaw=0;}
  var targets=navTargets();
  var best=null,bestAbs=999,leftT=null,rightT=null,leftAbs=999,rightAbs=999;
  targets.forEach(function(t){
    var d=angDiff(t.yaw,yaw);var ad=Math.abs(d);
    if(ad<bestAbs){bestAbs=ad;best={t:t,d:d};}
    if(d<0&&ad<leftAbs&&ad<=110){leftAbs=ad;leftT=t;}
    if(d>=0&&ad<rightAbs&&ad<=110){rightAbs=ad;rightT=t;}
  });
  if(best&&bestAbs<26){
    hintEl.style.display='flex';
    hintEl.querySelector('.hint-label').textContent='Enter '+best.t.label;
    hintTargetId=best.t.id;
  }else{hintEl.style.display='none';hintTargetId='';}
  // Edge arrows only when the target is off to the side (not already centred)
  if(leftT&&leftAbs>=24){edgeL.style.display='flex';edgeL.onclick=function(){gotoScene(leftT.id,leftT.targetYaw);};}else{edgeL.style.display='none';}
  if(rightT&&rightAbs>=24){edgeR.style.display='flex';edgeR.onclick=function(){gotoScene(rightT.id,rightT.targetYaw);};}else{edgeR.style.display='none';}
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// Click-on-pano (not drag) walks through the opening you're facing.
(function(){
  var pano=document.getElementById('pano');if(!pano)return;
  var dx=0,dy=0,dt=0,moved=false;
  function down(x,y){dx=x;dy=y;dt=Date.now();moved=false;}
  function move(x,y){if(dt&&(Math.abs(x-dx)>7||Math.abs(y-dy)>7))moved=true;}
  function up(){if(dt&&!moved&&(Date.now()-dt)<450&&hintTargetId){gotoScene(hintTargetId);}dt=0;}
  pano.addEventListener('mousedown',function(e){down(e.clientX,e.clientY);});
  pano.addEventListener('mousemove',function(e){move(e.clientX,e.clientY);});
  pano.addEventListener('mouseup',up);
  pano.addEventListener('touchstart',function(e){if(e.touches[0])down(e.touches[0].clientX,e.touches[0].clientY);},{passive:true});
  pano.addEventListener('touchmove',function(e){if(e.touches[0])move(e.touches[0].clientX,e.touches[0].clientY);},{passive:true});
  pano.addEventListener('touchend',up);
})();
<\/script>
</body>
</html>`;
}

/**
 * Self-contained interactive 360° tour: Pannellum panorama with clickable
 * nav-pin + audio hotspots, plus a thumbnail strip to jump between spaces.
 */
export function InteractiveTour({ spaces, autoPanAll = false, height = "clamp(360px, 58vw, 580px)", plain = false }: { spaces: TourSpace[]; autoPanAll?: boolean; height?: string; /** no legend, for the public page */ plain?: boolean }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showPresets, setShowPresets] = useState(true);
  const { isFs, toggle: toggleFullscreen } = useImmersive();
  const valid = spaces.filter((s) => s.panoramaUrl && !s.panoramaUrl.startsWith("file://") && s.enabled !== false);

  useEffect(() => {
    const start = valid.find((s) => s.isStartScene) ?? valid[0];
    if (start) setActiveId(start.id);
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === "pano_sceneChange" && e.data.sceneId) setActiveId(e.data.sceneId);
    };
    window.addEventListener("message", onMsg);
    return () => { window.removeEventListener("message", onMsg); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaces]);

  // Keep the in-pano scene chips in sync with fullscreen + presets visibility.
  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage({ type: "pano_fullscreen", on: isFs, presets: showPresets }, "*");
  }, [isFs, showPresets]);

  if (!valid.length) return null;
  const srcdoc = buildMultiSceneSrcdoc(spaces, autoPanAll);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative rounded-2xl overflow-hidden bg-black ring-1 ring-line" style={immersiveWrapStyle(isFs, height)}>
        <iframe
          ref={iframeRef}
          srcDoc={srcdoc}
          className="w-full h-full border-0"
          title="360° Business Walkthrough"
          allow="fullscreen"
        />
        <div className="absolute top-4 left-4 bg-black/60 backdrop-blur text-white text-xs px-2.5 py-1.5 rounded-full flex items-center gap-1.5 z-10 pointer-events-none">
          <Camera size={11} className="text-blue-400" />
          {valid.length} spaces
        </div>
        {/* Immersive controls */}
        <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
          <button onClick={() => setShowPresets((s) => !s)} title={showPresets ? "Hide scene presets" : "Show scene presets"}
            className="bg-black/60 hover:bg-black/80 backdrop-blur text-white w-9 h-9 rounded-full grid place-items-center transition-colors">
            {showPresets ? <EyeOff size={16} /> : <LayoutGrid size={16} />}
          </button>
          <button onClick={toggleFullscreen} title={isFs ? "Exit fullscreen" : "Fullscreen immersive"}
            className="bg-black/60 hover:bg-black/80 backdrop-blur text-white w-9 h-9 rounded-full grid place-items-center transition-colors">
            {isFs ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
        {/* In fullscreen, the thumbnail presets float over the bottom of the immersive view */}
        {isFs && showPresets && (
          <div className="absolute bottom-5 left-0 right-0 px-4 z-10">
            <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1 max-w-5xl mx-auto justify-center">
              {valid.map((s) => (
                <button key={s.id} onClick={() => { setActiveId(s.id); iframeRef.current?.contentWindow?.postMessage({ type: "pano_goto", sceneId: s.id }, "*"); }}
                  className={`group relative flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all ${s.id === activeId ? "border-blue-500 shadow-[0_0_14px_rgba(59,130,246,0.5)]" : "border-white/25 opacity-75 hover:opacity-100"}`}
                  style={{ width: 128, height: 78 }} title={s.name}>
                  <img src={thumb(s.panoramaUrl)} loading="lazy" alt={s.name} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 to-transparent flex items-end p-1.5">
                    <span className="text-white text-[10px] font-medium leading-tight line-clamp-2">{s.name}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Thumbnail strip — click to jump to a space (hidden in fullscreen; toggled by the presets button) */}
      {showPresets && !isFs && (
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {valid.map((s) => (
          <button
            key={s.id}
            onClick={() => {
              setActiveId(s.id);
              iframeRef.current?.contentWindow?.postMessage({ type: "pano_goto", sceneId: s.id }, "*");
            }}
            className={`relative flex-shrink-0 rounded-xl overflow-hidden border-2 transition-all ${
              s.id === activeId
                ? "border-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.45)] scale-[1.03]"
                : "border-transparent opacity-55 hover:opacity-85"
            }`}
            style={{ width: 96, height: 60 }}
            title={s.name}
          >
            <img src={thumb(s.panoramaUrl)} loading="lazy" alt={s.name} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent flex items-end p-1">
              <span className="text-white text-[9px] font-medium leading-tight line-clamp-2">{s.name}</span>
            </div>
            {s.audioUrl && (
              <div className="absolute top-1 right-1 bg-green-500/80 rounded-full w-3.5 h-3.5 flex items-center justify-center text-[8px]">🔊</div>
            )}
          </button>
        ))}
      </div>
      )}

      {!plain && <div className="flex items-center gap-4 text-xs text-ink-muted px-1 flex-wrap">
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-full bg-blue-500/80" />Navigate to space</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-full bg-green-500/80" />Audio narration</span>
      </div>}
    </div>
  );
}
