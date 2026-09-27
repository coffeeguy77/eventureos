"use client";

import { useEffect } from "react";

/** Adds data-shown to [data-reveal] / .mk-tilt elements as they scroll into view (once). No-op under reduced motion (CSS shows them). */
export function Reveal() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(".mk [data-reveal], .mk .mk-tilt"));
    if (!("IntersectionObserver" in window)) { els.forEach((e) => e.setAttribute("data-shown", "")); return; }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.setAttribute("data-shown", ""); io.unobserve(e.target); }
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);
  return null;
}
