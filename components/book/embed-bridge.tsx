"use client";

import { useEffect } from "react";

/**
 * Inside the website widget (an iframe from /embed.js): tells the host page how tall to make the frame,
 * and lets the host page take the visitor to Stripe (payment pages can't open inside a frame).
 */
export function EmbedBridge() {
  useEffect(() => {
    if (window.parent === window) return;
    const post = () => window.parent.postMessage({ type: "eventureos:height", height: Math.ceil(document.documentElement.scrollHeight) }, "*");
    post();
    const ro = new ResizeObserver(post);
    ro.observe(document.body);
    window.addEventListener("load", post);
    return () => { ro.disconnect(); window.removeEventListener("load", post); };
  }, []);
  return null;
}

/** Go to a page at the top level (out of the widget frame if we're in one). Returns false if the browser blocked it. */
export function goTop(url: string): boolean {
  if (window.parent === window) { window.location.href = url; return true; }
  window.parent.postMessage({ type: "eventureos:navigate", url }, "*");
  try { window.top!.location.href = url; return true; } catch { return false; }
}

/** Ask the host page to scroll the widget into view (after changing step). */
export function scrollWidgetTop() {
  if (window.parent === window) { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
  window.parent.postMessage({ type: "eventureos:scrollTop" }, "*");
}
