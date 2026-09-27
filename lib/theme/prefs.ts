import ACCENTS from "./accents.json";

/**
 * Display preferences (from ClaimSight's Personalise system, adapted for an app).
 * Only ids are stored — colours come from app/theme.css — in a cookie (so the server renders the right
 * theme with no flash) and on the user's account (so it follows them to other devices).
 */
export type Scheme = "light" | "dim" | "dark" | "midnight" | "system";
export interface UiPrefs { scheme: Scheme; accent: string; text: number; contrast: "normal" | "more"; motion: "full" | "reduce"; width: "standard" | "full" }

export const SCHEMES: { id: Scheme; name: string; hint: string; swatch: [string, string] }[] = [
  { id: "light", name: "Light", hint: "Bright and clean", swatch: ["#F6F6F8", "#FFFFFF"] },
  { id: "dim", name: "Dim", hint: "Soft grey night mode", swatch: ["#1F2027", "#282A33"] },
  { id: "dark", name: "Dark", hint: "Deep charcoal", swatch: ["#0E0E12", "#17171D"] },
  { id: "midnight", name: "Midnight", hint: "Navy night mode", swatch: ["#0A1020", "#111A2E"] },
  { id: "system", name: "System", hint: "Follows your device", swatch: ["#F6F6F8", "#17171D"] },
];
export { ACCENTS };
export const TEXT_STEPS = [90, 100, 106, 112, 118, 125, 131, 137];
export const DEFAULT_PREFS: UiPrefs = { scheme: "light", accent: "violet", text: 106, contrast: "normal", motion: "full", width: "standard" };
export const PREFS_COOKIE = "eos-ui";

export function parsePrefs(raw: unknown): UiPrefs {
  let o: Record<string, unknown> = {};
  if (typeof raw === "string") { try { o = JSON.parse(decodeURIComponent(raw)); } catch { o = {}; } }
  else if (raw && typeof raw === "object") o = raw as Record<string, unknown>;
  const scheme = SCHEMES.some((s) => s.id === o.scheme) ? (o.scheme as Scheme) : DEFAULT_PREFS.scheme;
  const accent = ACCENTS.some((a) => a.id === o.accent) ? (o.accent as string) : DEFAULT_PREFS.accent;
  const t = Number(o.text);
  const text = TEXT_STEPS.includes(t) ? t : DEFAULT_PREFS.text;
  return { scheme, accent, text, contrast: o.contrast === "more" ? "more" : "normal", motion: o.motion === "reduce" ? "reduce" : "full", width: o.width === "full" ? "full" : "standard" };
}

/** Attributes for <html>. */
export function htmlAttrs(p: UiPrefs) {
  return {
    "data-scheme": p.scheme, "data-accent": p.accent, "data-contrast": p.contrast, "data-motion": p.motion, "data-width": p.width,
    style: { ["--fs" as string]: String(p.text / 100) } as React.CSSProperties,
  };
}

export const serializePrefs = (p: UiPrefs) => encodeURIComponent(JSON.stringify(p));
