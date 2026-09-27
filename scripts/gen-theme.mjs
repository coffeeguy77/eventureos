/**
 * Generates app/theme.css — every colour the app uses as a CSS variable ("R G B"), for each appearance
 * (light, dim, dark, midnight, and "system" = light/dark by the OS), each accent colour, and increased contrast.
 *
 *   node scripts/gen-theme.mjs
 *
 * Adapted from ClaimSight's Personalise system: only ids are stored (data-* attributes on <html>), every
 * colour is derived and contrast-checked here at build time, so nothing is computed in the browser and
 * nothing flashes on load.
 */
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const tw = require("tailwindcss/colors");

// ------------------------------------------------------------------ colour maths
const hex = (c) => { c = c.replace("#", ""); if (c.length === 3) c = [...c].map((x) => x + x).join(""); return [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16)); };
const toHex = (v) => "#" + v.map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("");
const mix = (a, b, t) => { const x = hex(a), y = hex(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); };
const lum = (c) => { const v = hex(c).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
const contrast = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
/** Step a colour toward `toward` until it reads at `target` on `on`. */
const until = (colour, on, target, toward) => { let out = colour, g = 0; while (contrast(out, on) < target && g++ < 60) out = mix(out, toward, 0.06); return out; };
const rgb = (c) => hex(c).join(" ");

// ------------------------------------------------------------------ appearances
const SCHEMES = {
  light:    { dark: false, canvas: "#F6F6F8", surface: "#FFFFFF", ink: "#16151D", muted: "#5D5B6B", faint: "#86849A", line: "#E7E6EE", strong: "#D6D4E0", tint: "#71717A" },
  dim:      { dark: true,  canvas: "#1F2027", surface: "#282A33", ink: "#ECECF1", muted: "#B4B4C2", faint: "#8E8FA0", line: "#393B47", strong: "#4A4D5B", tint: "#71717A" },
  dark:     { dark: true,  canvas: "#0E0E12", surface: "#17171D", ink: "#EDEDF2", muted: "#A9A9B8", faint: "#80808F", line: "#26262F", strong: "#34343F", tint: "#71717A" },
  midnight: { dark: true,  canvas: "#0A1020", surface: "#111A2E", ink: "#E8EEF8", muted: "#A6B4CC", faint: "#7D8BA6", line: "#1F2B45", strong: "#2C3A58", tint: "#64748B" },
};

// ------------------------------------------------------------------ accents (ClaimSight's set, EventureOS violet first)
const ACCENTS = [
  ["violet", "EventureOS", "#6028EC"],
  ["blue", "Blue", "#2563EB"],
  ["azure", "Azure", "#3B9EFF"],
  ["teal", "Teal", "#14B8A6"],
  ["sage", "Sage", "#8FAE6B"],
  ["lime", "Lime", "#C5E13F"],
  ["amber", "Amber", "#D97706"],
  ["signal", "Signal", "#F97316"],
  ["terracotta", "Terracotta", "#C47A4A"],
  ["rust", "Rust", "#C85A2C"],
  ["rose", "Rose", "#E8A0A8"],
  ["mauve", "Mauve", "#B28BB8"],
  ["magenta", "Magenta", "#FF4DA6"],
];

const SHADES = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"];
const FAMILIES = ["zinc", "slate", "gray", "emerald", "green", "rose", "red", "amber", "yellow", "orange", "sky", "blue", "teal", "cyan", "indigo", "purple", "violet", "fuchsia", "pink", "lime"];

/** A Tailwind colour family for a scheme. Dark schemes mirror the scale around the surface so
 *  "text-rose-700 on bg-rose-50" stays readable: pale tints become deep tints and deep text becomes light text. */
function family(name, s) {
  const f = tw[name];
  if (!s.dark) return Object.fromEntries(SHADES.map((k) => [k, f[k]]));
  const neutral = ["zinc", "slate", "gray"].includes(name);
  const S = s.surface;
  const out = neutral ? {
    50: mix(S, "#ffffff", 0.045), 100: mix(S, "#ffffff", 0.08), 200: mix(S, "#ffffff", 0.14), 300: mix(S, "#ffffff", 0.24),
    400: f["500"], 500: f["400"], 600: f["300"], 700: f["200"], 800: f["100"], 900: f["50"], 950: "#ffffff",
  } : {
    50: mix(f["900"], S, 0.62), 100: mix(f["800"], S, 0.55), 200: mix(f["700"], S, 0.45), 300: mix(f["600"], S, 0.3),
    400: f["500"], 500: f["500"], 600: f["400"], 700: f["300"], 800: f["200"], 900: f["100"], 950: f["50"],
  };
  // Text shades must read on their own tint and on the surface
  if (!neutral) for (const k of ["600", "700", "800", "900"]) out[k] = until(out[k], out["50"], 4.6, "#ffffff");
  return out;
}

/** The brand scale from one accent colour. Light: tints above, shades below. Dark: mirrored like the families. */
function brand(primary, s) {
  // A filled accent must carry a readable foreground (white or ink)
  let p = primary, g = 0;
  while (Math.max(contrast(p, "#ffffff"), contrast(p, "#16151D")) < 4.6 && g++ < 30) p = mix(p, "#16151D", 0.05);
  const on = contrast(p, "#ffffff") >= contrast(p, "#16151D") ? "#FFFFFF" : "#16151D";
  if (!s.dark) {
    const sc = {
      50: mix(p, "#ffffff", 0.93), 100: mix(p, "#ffffff", 0.86), 200: mix(p, "#ffffff", 0.72), 300: mix(p, "#ffffff", 0.52),
      400: mix(p, "#ffffff", 0.22), 500: p, 600: mix(p, "#000000", 0.14), 700: mix(p, "#000000", 0.27), 800: mix(p, "#000000", 0.4), 900: mix(p, "#000000", 0.55),
    };
    for (const k of ["600", "700", "800", "900"]) sc[k] = until(sc[k], sc["50"], 4.6, "#16151D");
    return { sc, on };
  }
  const S = s.surface;
  const sc = {
    50: mix(p, S, 0.84), 100: mix(p, S, 0.74), 200: mix(p, S, 0.6), 300: mix(p, S, 0.4), 400: mix(p, "#ffffff", 0.12),
    500: p, 600: mix(p, "#ffffff", 0.18), 700: mix(p, "#ffffff", 0.42), 800: mix(p, "#ffffff", 0.6), 900: mix(p, "#ffffff", 0.75),
  };
  for (const k of ["600", "700", "800", "900"]) sc[k] = until(sc[k], sc["50"], 4.6, "#ffffff");
  return { sc, on };
}

function schemeVars(s, strong = false) {
  const v = {
    canvas: s.canvas, surface: s.surface, ink: s.ink,
    "ink-muted": strong ? mix(s.muted, s.ink, 0.55) : until(s.muted, s.canvas, 4.6, s.ink),
    "ink-faint": strong ? mix(s.faint, s.ink, 0.5) : until(s.faint, s.surface, 3.2, s.ink),
    line: strong ? mix(s.line, s.ink, 0.28) : s.line, "line-strong": strong ? mix(s.strong, s.ink, 0.3) : s.strong,
    danger: s.dark ? "#E5484D" : "#D92D3A", "danger-strong": s.dark ? "#F2555A" : "#B81E2B",
  };
  for (const f of FAMILIES) { const sc = family(f, s); for (const k of SHADES) v[`${f}-${k}`] = sc[k]; }
  return v;
}
const block = (sel, vars) => `${sel}{${Object.entries(vars).map(([k, c]) => `--${k}:${rgb(c)}`).join(";")}}`;
function brandVars(primary, s) { const { sc, on } = brand(primary, s); const v = { "on-brand": on }; for (const [k, c] of Object.entries(sc)) v[`brand-${k}`] = c; return v; }

let css = `/* Generated by scripts/gen-theme.mjs — do not edit by hand. */\n`;
const dm = (sel) => `@media (prefers-color-scheme: dark){${sel}}`;
// Appearances
css += block(":root", { ...schemeVars(SCHEMES.light), ...brandVars(ACCENTS[0][2], SCHEMES.light) }) + "\n";
for (const [id, s] of Object.entries(SCHEMES)) {
  if (id !== "light") css += block(`html[data-scheme="${id}"]`, schemeVars(s)) + "\n";
  css += block(`html[data-scheme="${id}"][data-contrast="more"]`, { ...schemeVars(s, true) }) + "\n";
}
css += dm(block(`html[data-scheme="system"]`, schemeVars(SCHEMES.dark))) + "\n";
css += dm(block(`html[data-scheme="system"][data-contrast="more"]`, schemeVars(SCHEMES.dark, true))) + "\n";
css += block(`html[data-scheme="system"][data-contrast="more"]`, schemeVars(SCHEMES.light, true)) + "\n";
// Accents × appearances
for (const [id, , p] of ACCENTS) {
  css += block(`html[data-accent="${id}"]`, brandVars(p, SCHEMES.light)) + "\n";
  for (const [sid, s] of Object.entries(SCHEMES)) if (s.dark) css += block(`html[data-accent="${id}"][data-scheme="${sid}"]`, brandVars(p, s)) + "\n";
  css += dm(block(`html[data-accent="${id}"][data-scheme="system"]`, brandVars(p, SCHEMES.dark))) + "\n";
}
// Dark schemes: tell the browser (scrollbars, form controls)
css += `html[data-scheme="dim"],html[data-scheme="dark"],html[data-scheme="midnight"]{color-scheme:dark}\n`;
css += dm(`html[data-scheme="system"]{color-scheme:dark}`) + "\n";
// Reduced motion
css += `html[data-motion="reduce"] *,html[data-motion="reduce"] *::before,html[data-motion="reduce"] *::after{animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important;scroll-behavior:auto!important}\n`;

writeFileSync(new URL("../app/theme.css", import.meta.url), css);
writeFileSync(new URL("../lib/theme/accents.json", import.meta.url), JSON.stringify(ACCENTS.map(([id, name, hex]) => ({ id, name, hex })), null, 2));
console.log(`app/theme.css: ${(css.length / 1024).toFixed(1)} KB`);

// Report: key text/background pairs per appearance
for (const [id, s] of Object.entries(SCHEMES)) {
  const v = schemeVars(s);
  const pairs = [["ink-muted", "canvas"], ["ink-faint", "surface"], ["rose-700", "rose-50"], ["emerald-700", "emerald-50"], ["amber-800", "amber-50"], ["sky-700", "sky-50"]];
  console.log(id.padEnd(9), pairs.map(([a, b]) => `${a}/${b} ${contrast(v[a], v[b]).toFixed(1)}`).join("  "));
  for (const [aid, , p] of ACCENTS) {
    const b = brandVars(p, s);
    const r = [contrast(b["brand-700"], b["brand-50"]), contrast(b["brand-600"], s.surface), contrast(b["brand-500"], b["on-brand"])];
    if (r.some((x) => x < 4.5)) console.log("   low", aid, r.map((x) => x.toFixed(1)).join(" "));
  }
}
