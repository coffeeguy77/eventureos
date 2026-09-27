"use client";

import { useEffect, useState } from "react";

export const LOOKS = [
  { id: "midnight", name: "Midnight", hint: "Dark, cinematic" },
  { id: "studio", name: "Studio", hint: "Warm off-white" },
  { id: "editorial", name: "Editorial", hint: "Dark + light, bold type" },
] as const;
export type Look = (typeof LOOKS)[number]["id"];

/**
 * Review-only appearance switch. Visible with ?review=1 (or ?look=…); visitors never see it.
 * Applies the look to the page wrapper without a reload and keeps it in the URL so a link reproduces it.
 */
export function LookSwitcher({ defaultLook }: { defaultLook: Look }) {
  const [look, setLook] = useState<Look>(defaultLook);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const fromUrl = sp.get("look") as Look | null;
    if (sp.get("review") === "1" || fromUrl) setVisible(true);
    if (fromUrl && LOOKS.some((l) => l.id === fromUrl)) apply(fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function apply(id: Look) {
    setLook(id);
    document.querySelector(".mk")?.setAttribute("data-look", id);
    const u = new URL(window.location.href);
    u.searchParams.set("look", id);
    u.searchParams.set("review", "1");
    window.history.replaceState(null, "", u.toString());
  }

  if (!visible) return null;
  return (
    <div role="group" aria-label="Review appearance" className="fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/15 bg-black/80 p-1 text-[0.75rem] text-white shadow-2xl backdrop-blur">
      <span className="px-2.5 text-white/60">Appearance</span>
      {LOOKS.map((l) => (
        <button key={l.id} type="button" onClick={() => apply(l.id)} aria-pressed={look === l.id} title={l.hint}
          className={`rounded-full px-3 py-1.5 font-medium transition-colors ${look === l.id ? "bg-[#FF3D8B] text-white" : "text-white/80 hover:bg-white/10"}`}>
          {l.name}
        </button>
      ))}
    </div>
  );
}
