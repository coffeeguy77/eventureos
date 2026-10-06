"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Anonymous website analytics for the business's own reports (Reports → Website).
 * Sends: page views, page sections scrolled into view ([data-section]), clicks on links/buttons ([data-track] to name them),
 * form starts and submits, and [data-track-kind] events such as cart_add. Random ids only; no personal details, no query strings.
 */
type Ev = { k: string; sec?: string; p?: string; l?: string; r?: string; d?: string };

const rid = () => (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/[^A-Za-z0-9]/g, "").slice(0, 24);
function stored(store: () => Storage, key: string) {
  try { const s = store(); let v = s.getItem(key); if (!v) { v = rid(); s.setItem(key, v); } return v; } catch { return null; }
}
const device = () => (window.innerWidth < 640 ? "mobile" : window.innerWidth < 1024 ? "tablet" : "desktop");
const text = (el: Element) => (el.getAttribute("data-track") || el.getAttribute("aria-label") || (el as HTMLElement).innerText || "").replace(/\s+/g, " ").trim().slice(0, 80);

let ids: { v: string; s: string } | null = null;
let queue: Ev[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let slugRef = "";

function flush() {
  timer = null;
  if (!queue.length || !ids || !slugRef) return;
  const body = JSON.stringify({ v: ids.v, s: ids.s, e: queue.splice(0, 25) });
  const url = `/api/public/track/${slugRef}`;
  try {
    if (!navigator.sendBeacon?.(url, new Blob([body], { type: "text/plain" }))) fetch(url, { method: "POST", body, keepalive: true }).catch(() => {});
  } catch { /* analytics must never break the page */ }
}
export function track(e: Ev) {
  if (typeof window === "undefined") return;
  queue.push({ p: location.pathname, d: device(), ...e });
  if (!timer) timer = setTimeout(flush, 1200);
}

export function SiteTracker({ slug, section }: { slug: string; section: string }) {
  const path = usePathname();
  useEffect(() => {
    slugRef = slug;
    if (!ids) {
      const v = stored(() => localStorage, "eos_v") ?? rid();
      const s = stored(() => sessionStorage, "eos_s") ?? rid();
      ids = { v, s };
    }
    const ref = document.referrer && !document.referrer.startsWith(location.origin) ? document.referrer.replace(/[?#].*$/, "") : undefined;
    track({ k: "view", sec: section, r: ref });

    // Page sections: which parts of the page people actually reach (finds the flat spots)
    const seen = new Set<string>();
    const io = "IntersectionObserver" in window ? new IntersectionObserver((entries) => {
      for (const en of entries) {
        const name = (en.target as HTMLElement).dataset.section;
        if (en.isIntersecting && name && !seen.has(name)) { seen.add(name); track({ k: "view", sec: section, l: `#${name}` }); }
      }
    }, { threshold: 0.35 }) : null;
    document.querySelectorAll("[data-section]").forEach((el) => io?.observe(el));

    const started = new WeakSet<Element>();
    const onClick = (ev: MouseEvent) => {
      const el = (ev.target as Element | null)?.closest("[data-track],[data-track-kind],a,button");
      if (!el || el.closest("form") && el.getAttribute("type") === "submit") return;
      const kind = el.getAttribute("data-track-kind") || "click";
      track({ k: kind, sec: section, l: text(el) });
    };
    const onFocus = (ev: FocusEvent) => {
      const f = (ev.target as Element | null)?.closest("form");
      if (!f || started.has(f)) return;
      started.add(f);
      track({ k: f.getAttribute("data-track-start") || "form_start", sec: section, l: f.getAttribute("data-track") || f.getAttribute("aria-label") || "form" });
    };
    const onSubmit = (ev: SubmitEvent) => {
      const f = ev.target as HTMLFormElement;
      track({ k: f.getAttribute("data-track-submit") || "form_submit", sec: section, l: f.getAttribute("data-track") || f.getAttribute("aria-label") || "form" });
    };
    const onHide = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("click", onClick, true);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("submit", onSubmit, true);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      io?.disconnect();
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("submit", onSubmit, true);
      document.removeEventListener("visibilitychange", onHide);
      flush();
    };
  }, [slug, section, path]);
  return null;
}
