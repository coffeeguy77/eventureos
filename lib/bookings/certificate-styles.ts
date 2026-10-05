/**
 * The newer certificate styles — "latte", "botanical", "poster" and "elegant" — built from the same drawing items as the
 * older ones, so the on-screen preview and the PDF stay identical. A4 landscape (842 × 595 points), origin top-left.
 * Every word comes from the business's design settings and the student's details; nothing is specific to one business.
 */
import { approxWidth, fill, fit, H, shade, tint, W, wrap, wrapItems, type CertData, type CertDesign, type Font, type Item } from "./certificate";

type Has = { logo: boolean };
const INK = "#1D1A18", MUTED = "#5E5853", FAINT = "#8F8983";
const n = (v: number) => v.toFixed(2);

/* ───────────────────────── shared pieces ───────────────────────── */

/** Words before "{course}" in the body (e.g. "Has successfully completed the"); the course itself gets its own line. */
function leadLine(d: CertDesign, data: CertData) {
  const i = d.body.indexOf("{course}");
  return (i >= 0 ? fill(d.body.slice(0, i), data) : fill(d.body, data)).trim().replace(/[\s,:;-]+$/, "");
}
const caps = (t: string) => t.toUpperCase();

/** Text laid around a circle: the top reads left to right over the top, the bottom left to right under the bottom. */
function arcText(items: Item[], text: string, cx: number, cy: number, r: number, where: "top" | "bottom", font: Font, size: number, color: string, spacing = 0.8) {
  const chars = [...text];
  const widths = chars.map((c) => approxWidth(c, font, size) / 1.04 + spacing);
  const total = widths.reduce((a, b) => a + b, 0) - spacing;
  const span = total / r; // radians
  let a = where === "top" ? -Math.PI / 2 - span / 2 : Math.PI / 2 + span / 2;
  for (let i = 0; i < chars.length; i++) {
    const half = widths[i] / 2 / r;
    a += where === "top" ? half : -half;
    const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
    const rot = where === "top" ? (a * 180) / Math.PI + 90 : (a * 180) / Math.PI - 90;
    if (chars[i].trim()) items.push({ t: "text", x, y, text: chars[i], font, size, color, align: "center", rotate: rot });
    a += where === "top" ? half : -half;
  }
}

function starPath(cx: number, cy: number, r: number) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.42 : r; pts.push(`${n(cx + Math.cos(a) * rr)},${n(cy + Math.sin(a) * rr)}`); }
  return `M${pts.join(" L")} Z`;
}

/** A round seal: scalloped edge, words around the ring, the main word and three stars in the middle. */
function seal(items: Item[], cx: number, cy: number, r: number, d: CertDesign, data: CertData) {
  const A = d.accent;
  const pts: string[] = [], k = 36;
  for (let i = 0; i < k * 2; i++) { const a = (Math.PI * i) / k, rr = i % 2 ? r * 0.94 : r; pts.push(`${n(cx + Math.cos(a) * rr)},${n(cy + Math.sin(a) * rr)}`); }
  items.push({ t: "path", d: `M${pts.join(" L")} Z`, fill: A });
  items.push({ t: "circle", cx, cy, r: r * 0.86, stroke: "#FFFFFF", sw: 0.9 });
  items.push({ t: "circle", cx, cy, r: r * 0.55, stroke: "#FFFFFF", sw: 0.6 });
  const top = caps(fill(d.sealTop, data)).trim(), bottom = caps(fill(d.sealBottom, data)).trim();
  const ring = r * 0.86 - r * 0.55, sz = Math.min(r * 0.155, ring * 0.62);
  if (top) {
    const z = Math.min(sz, fit(top, "display", sz, Math.PI * r * 0.66, sz * 0.6, 0.8));
    arcText(items, top, cx, cy, r * 0.62 + z * 0.08, "top", "display", z, "#FFFFFF");
  }
  if (bottom) {
    const z = Math.min(sz, fit(bottom, "display", sz, Math.PI * r * 0.6, sz * 0.6, 0.8));
    arcText(items, bottom, cx, cy, r * 0.79 - z * 0.15, "bottom", "display", z, "#FFFFFF");
  }
  const word = caps(d.sealText).trim();
  if (word) {
    const z = fit(word, "display", r * 0.2, r * 0.98, r * 0.11, 0.6);
    items.push({ t: "text", x: cx, y: cy + z * 0.3, text: word, font: "display", size: z, color: "#FFFFFF", align: "center", spacing: 0.6 });
  }
  for (const dx of [-1, 0, 1]) items.push({ t: "path", d: starPath(cx + dx * r * 0.13, cy + r * 0.3, r * 0.055), fill: "#FFFFFF" });
}

function signature(items: Item[], cx: number, by: number, w: number, d: CertDesign) {
  if (d.signature) items.push({ t: "image", x: cx - w / 2, y: by - 52, w, h: 48, src: "signature", fit: "contain" });
  items.push({ t: "line", x1: cx - w / 2, y1: by, x2: cx + w / 2, y2: by, stroke: FAINT, sw: 0.5 });
  if (d.signerName) items.push({ t: "text", x: cx, y: by + 12, text: caps(d.signerName), font: "display", size: fit(caps(d.signerName), "display", 7.5, w, 5, 1), color: INK, align: "center", spacing: 1 });
  if (d.signerTitle) items.push({ t: "text", x: cx, y: by + (d.signerName ? 23 : 12), text: d.signerTitle, font: "body", size: fit(d.signerTitle, "body", 7.5, w, 5), color: MUTED, align: "center" });
}

function dateBlock(items: Item[], cx: number, by: number, w: number, data: CertData) {
  items.push({ t: "text", x: cx, y: by - 4, text: data.date, font: "serifRegular", size: fit(data.date, "serifRegular", 12.5, w, 8), color: INK, align: "center" });
  items.push({ t: "text", x: cx, y: by + 10, text: "Date of completion", font: "body", size: 7, color: FAINT, align: "center" });
}

/** QR code with "Verify this credential" beside it. x = left edge; it is about `w` wide. */
function verify(items: Item[], x: number, by: number, w: number, d: CertDesign, data: CertData) {
  const q = 50, top = by - 30, tx = x + q + 9, tw = w - q - 9;
  if (d.showQr) {
    items.push({ t: "image", x, y: top, w: q, h: q, src: "qr" });
    items.push({ t: "text", x: tx, y: top + 9, text: "Verify this credential", font: "display", size: fit("Verify this credential", "display", 8.5, tw, 6), color: INK, align: "left" });
    for (const [i, l] of wrap("Scan to confirm authenticity, course and completion date.", "body", 6.5, tw, 3).entries()) items.push({ t: "text", x: tx, y: top + 21 + i * 8.5, text: l, font: "body", size: 6.5, color: MUTED, align: "left" });
  }
  if (d.showNumber) items.push({ t: "text", x: d.showQr ? tx : x + w, y: top + 47, text: data.number, font: "display", size: 7, color: MUTED, align: d.showQr ? "left" : "right", spacing: 0.4 });
}

/** Small, simple icons for the skills row — picked from the words of each skill. */
type IconKind = "cup" | "jug" | "grinder" | "gear" | "sparkle" | "people" | "bean";
function iconFor(skill: string): IconKind {
  const s = skill.toLowerCase();
  if (/clean|hygien|mainten|care/.test(s)) return "sparkle";
  if (/grind|calibrat|dos(e|ing)|dial/.test(s)) return "grinder";
  if (/milk|textur|latte|art|pour/.test(s)) return "jug";
  if (/customer|people|team|job|interview|resume/.test(s)) return "people";
  if (/workflow|service|open|clos|routine|speed/.test(s)) return "gear";
  if (/espresso|shot|extract|recipe|brew|coffee/.test(s)) return "cup";
  return "bean";
}
function icon(items: Item[], kind: IconKind, cx: number, cy: number, size: number, color: string, paper: string) {
  const k = size / 24, X = (v: number) => n(cx - size / 2 + v * k), Y = (v: number) => n(cy - size / 2 + v * k);
  const P = (pairs: [number, number][], close = true) => `M${pairs.map(([a, b]) => `${X(a)},${Y(b)}`).join(" L")}${close ? " Z" : ""}`;
  const C = (s: string) => s.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_, a, b) => `${X(+a)},${Y(+b)}`);
  const path = (d: string) => items.push({ t: "path", d, fill: color });
  if (kind === "cup") {
    path(C("M5,9 L17,9 L16,16 C15.6,18 14.5,19 12.5,19 L9.5,19 C7.5,19 6.4,18 6,16 Z"));
    path(C("M16.8,10.6 C21.2,10.6 21.2,15.6 16.2,15.6 L16.4,14.2 C19.4,14.2 19.4,12 16.6,12 Z"));
    path(P([[3, 20], [21, 20], [20, 21.8], [4, 21.8]]));
    path(C("M9,2.5 C8,4.5 10,5.5 9,7.5 L10,7.5 C11,5.5 9,4.5 10,2.5 Z"));
    path(C("M13,2.5 C12,4.5 14,5.5 13,7.5 L14,7.5 C15,5.5 13,4.5 14,2.5 Z"));
  } else if (kind === "jug") {
    path(C("M7,6 L15.5,6 L18.5,3.5 L19.6,4.6 L17.6,8 L18.4,19 C18.5,20.4 17.6,21.2 16.4,21.2 L8.6,21.2 C7.4,21.2 6.5,20.4 6.6,19 Z"));
    path(C("M6.8,9 C3.2,9 3.2,16 6.6,16 L6.7,14.6 C4.8,14.6 4.8,10.4 6.8,10.4 Z"));
  } else if (kind === "grinder") {
    path(P([[6.5, 2.5], [17.5, 2.5], [14.5, 8], [9.5, 8]]));
    path(P([[8, 9], [16, 9], [16, 18], [8, 18]]));
    path(P([[5.5, 19], [18.5, 19], [18.5, 21.5], [5.5, 21.5]]));
    items.push({ t: "circle", cx: +X(12), cy: +Y(13.5), r: 1.7 * k, fill: paper });
  } else if (kind === "gear") {
    const pts: [number, number][] = [];
    for (let i = 0; i < 32; i++) { const a = (i / 32) * Math.PI * 2, r = i % 4 < 2 ? 9.6 : 7.4; pts.push([12 + Math.cos(a) * r, 12 + Math.sin(a) * r]); }
    path(P(pts));
    items.push({ t: "circle", cx: +X(12), cy: +Y(12), r: 3.4 * k, fill: paper });
  } else if (kind === "sparkle") {
    path(C("M10,3 C10.8,8.6 13.4,11.2 19,12 C13.4,12.8 10.8,15.4 10,21 C9.2,15.4 6.6,12.8 1,12 C6.6,11.2 9.2,8.6 10,3 Z"));
    path(C("M19,1.5 C19.3,3.6 20.4,4.7 22.5,5 C20.4,5.3 19.3,6.4 19,8.5 C18.7,6.4 17.6,5.3 15.5,5 C17.6,4.7 18.7,3.6 19,1.5 Z"));
  } else if (kind === "people") {
    items.push({ t: "circle", cx: +X(8.5), cy: +Y(7.5), r: 3.2 * k, fill: color });
    items.push({ t: "circle", cx: +X(16), cy: +Y(8.5), r: 2.7 * k, fill: color });
    path(C("M2.5,20 C2.5,15 5.2,12.6 8.5,12.6 C11.8,12.6 14.5,15 14.5,20 Z"));
    path(C("M13.6,13.2 C14.3,12.9 15.1,12.8 16,12.8 C19,12.8 21.5,15 21.5,19.2 L15.6,19.2 C15.6,16.6 14.9,14.6 13.6,13.2 Z"));
  } else {
    path(C("M12,2.8 C16.2,2.8 18.8,7 18.8,12 C18.8,17 16.2,21.2 12,21.2 C7.8,21.2 5.2,17 5.2,12 C5.2,7 7.8,2.8 12,2.8 Z"));
    items.push({ t: "path", d: C("M12.8,4 C10,8 14.4,15.2 11.4,20 L12.4,20 C15.4,15.2 11,8 13.8,4 Z"), fill: paper });
  }
}

/** "Skills covered": icons with labels in a row (up to six); more than six falls back to a wrapped list. Returns the y after it. */
function skillsRow(items: Item[], d: CertDesign, data: CertData, x0: number, x1: number, y: number, align: "center" | "left", paper: string, k = 1) {
  const pts = d.showSkills ? data.points ?? [] : [];
  if (!pts.length) return y;
  const A = d.accent, cx = (x0 + x1) / 2;
  items.push({ t: "text", x: align === "center" ? cx : x0, y, text: "SKILLS COVERED", font: "display", size: 7.5, color: A, align, spacing: 1.8 });
  y += 10 * k;
  if (pts.length > 6) {
    for (const l of wrapItems(pts, "body", 9, x1 - x0, 3)) { y += 13; items.push({ t: "text", x: align === "center" ? cx : x0, y, text: l, font: "body", size: 9, color: MUTED, align }); }
    return y + 8;
  }
  const cell = (x1 - x0) / pts.length;
  pts.forEach((p, i) => {
    const mx = x0 + cell * i + cell / 2;
    icon(items, iconFor(p), mx, y + 14, 22, A, paper);
    const lines = wrap(p, "body", 8, cell - 8, 2);
    lines.forEach((l, j) => items.push({ t: "text", x: mx, y: y + 38 + j * 9.5, text: l, font: "body", size: fit(l, "body", 8, cell - 6, 5.5), color: INK, align: "center" }));
    if (i > 0) items.push({ t: "line", x1: x0 + cell * i, y1: y + 2, x2: x0 + cell * i, y2: y + 48, stroke: tint(A, 0.7), sw: 0.5 });
  });
  return y + 58;
}

/** The course, the tagline (e.g. "Bean Culture Coffee Roastery · Canberra") and the hours line. Returns the y after it. */
function courseBlock(items: Item[], d: CertDesign, data: CertData, x: number, y: number, w: number, align: "center" | "left", courseFont: Font, k = 1) {
  const lead = leadLine(d, data);
  if (lead) { items.push({ t: "text", x, y, text: caps(lead), font: "display", size: fit(caps(lead), "display", 7.5, w, 5.5, 1.6), color: INK, align, spacing: 1.6 }); y += 25 * Math.min(k, 1.25); }
  const cSize = fit(data.course, courseFont, 21, w, 13);
  items.push({ t: "text", x, y, text: data.course, font: courseFont, size: cSize, color: INK, align }); y += 19 * Math.min(k, 1.25);
  const tag = caps(fill(d.tagline, data)).trim();
  if (tag) { items.push({ t: "text", x, y, text: tag, font: "display", size: fit(tag, "display", 7, w, 5, 1.6), color: MUTED, align, spacing: 1.6 }); y += 12; }
  const hrs = data.hours ? caps(fill(d.hoursLine, data)).trim() : "";
  if (hrs) { items.push({ t: "text", x, y, text: hrs, font: "display", size: fit(hrs, "display", 7, w, 5, 1.6), color: MUTED, align, spacing: 1.6 }); y += 12; }
  return y;
}

/** Bottom row shared by all four: signature · seal · date · verify, each in its own space between x0 and x1. */
function bottomRow(items: Item[], d: CertDesign, data: CertData, x0: number, x1: number, by: number, sealR: number, centerX?: number) {
  const vw = 152, vx = x1 - vw;
  if (centerX != null && d.showSeal) {
    // Seal in the middle of the page; signature to its left; date and verify to its right
    seal(items, centerX, by - 8, sealR, d, data);
    const sigW = Math.min(170, centerX - sealR - 24 - x0);
    signature(items, (x0 + centerX - sealR - 16) / 2, by, sigW, d);
    const dl = centerX + sealR + 16, dr = vx - 12;
    dateBlock(items, (dl + dr) / 2, by, dr - dl, data);
    verify(items, vx, by, vw, d, data);
    return;
  }
  const rest = vx - 14 - x0;
  const sigW = Math.min(150, rest * 0.42), sealW = d.showSeal ? sealR * 2 + 16 : 0, dateW = rest - sigW - sealW;
  signature(items, x0 + sigW / 2, by, sigW - 10, d);
  if (d.showSeal) seal(items, x0 + sigW + sealW / 2, by - 8, sealR, d, data);
  dateBlock(items, x0 + sigW + sealW + dateW / 2, by, dateW - 10, data);
  verify(items, vx, by, vw, d, data);
}

function eyebrowLine(items: Item[], text: string, cx: number, y: number, w: number, color: string) {
  const t = caps(text).trim();
  if (!t) return;
  const z = fit(t, "display", 8.5, w - 60, 6, 3), tw = approxWidth(t, "display", z, 3);
  items.push({ t: "text", x: cx, y, text: t, font: "display", size: z, color, align: "center", spacing: 3 });
  items.push({ t: "line", x1: cx - tw / 2 - 26, y1: y - z * 0.33, x2: cx - tw / 2 - 10, y2: y - z * 0.33, stroke: color, sw: 0.7 });
  items.push({ t: "line", x1: cx + tw / 2 + 10, y1: y - z * 0.33, x2: cx + tw / 2 + 26, y2: y - z * 0.33, stroke: color, sw: 0.7 });
}

function diamondRule(items: Item[], cx: number, y: number, half: number, color: string) {
  items.push({ t: "line", x1: cx - half, y1: y, x2: cx - 7, y2: y, stroke: color, sw: 0.7 });
  items.push({ t: "line", x1: cx + 7, y1: y, x2: cx + half, y2: y, stroke: color, sw: 0.7 });
  items.push({ t: "path", d: `M${cx},${y - 3.6} L${cx + 3.6},${y} L${cx},${y + 3.6} L${cx - 3.6},${y} Z`, fill: color });
}

/** A thin curved stroke, drawn as a narrow filled band (so the PDF and preview match). */
function swash(items: Item[], x0: number, y0: number, c1: [number, number], c2: [number, number], x1: number, y1: number, thick: number, color: string, opacity = 1) {
  const t = thick;
  items.push({ t: "path", d: `M${n(x0)},${n(y0)} C${n(c1[0])},${n(c1[1])} ${n(c2[0])},${n(c2[1])} ${n(x1)},${n(y1)} C${n(c2[0])},${n(c2[1] + t)} ${n(c1[0])},${n(c1[1] + t)} ${n(x0)},${n(y0 + t * 0.3)} Z`, fill: color, opacity });
}

function logoOrName(items: Item[], has: Has, d: CertDesign, data: CertData, cx: number, y: number, w: number, h: number, align: "center" | "left") {
  if (d.showLogo && has.logo) { items.push({ t: "image", x: align === "center" ? cx - w / 2 : cx, y, w, h, src: "logo", fit: "contain", align: align === "center" ? "center" : undefined }); return; }
  const t = caps(data.business);
  items.push({ t: "text", x: cx, y: y + h * 0.62, text: t, font: "display", size: fit(t, "display", 15, w * 1.6, 9, 2), color: d.accent, align, spacing: 2 });
}

/** Build the middle content once to measure it, then again with the gaps stretched so it fills the space above the bottom row. */
function flow(items: Item[], build: (out: Item[], k: number) => number, top: number, target: number, maxK = 1.7) {
  const end = build([], 1);
  const k = Math.max(1, Math.min(maxK, 1 + (target - end) / Math.max(1, end - top)));
  return build(items, k);
}

/* ───────────────────────── latte ───────────────────────── */
/** Photo panel on the left with a flowing brand-coloured edge; big serif title, script name, skills icons. */
function latte(d: CertDesign, data: CertData, has: Has, items: Item[]): Item[] {
  const A = d.accent, paper = d.paper;
  // Left panel: the photo (or brand colour), washed in brand colour at the corners
  if (d.photo) items.push({ t: "image", x: 0, y: 0, w: 318, h: H, src: "photo", fit: "cover" });
  else items.push({ t: "rect", x: 0, y: 0, w: 318, h: H, fill: shade(A, 0.08) });
  items.push({ t: "path", d: `M0,0 L230,0 C150,40 70,110 0,190 Z`, fill: A, opacity: 0.62 });
  items.push({ t: "path", d: `M0,${H} L0,${H - 150} C80,${H - 110} 150,${H - 50} 190,${H} Z`, fill: A, opacity: 0.55 });
  // The flowing edge: paper over the right of the photo, with brand bands along the curve
  items.push({ t: "path", d: `M258,0 L330,0 L330,${H} L296,${H} C224,420 334,206 258,0 Z`, fill: paper });
  items.push({ t: "path", d: `M240,0 L258,0 C334,206 224,420 296,${H} L278,${H} C206,420 316,206 240,0 Z`, fill: A, opacity: 0.92 });
  items.push({ t: "path", d: `M258,0 L270,0 C346,206 236,420 308,${H} L296,${H} C224,420 334,206 258,0 Z`, fill: tint(A, 0.55), opacity: 0.9 });
  for (let i = 0; i < 5; i++) swash(items, 560 + i * 18, H, [640 + i * 14, 470 - i * 10], [790, 430 + i * 12], W, 300 + i * 26, 0.7, tint(A, 0.55), 0.55);
  if (d.showLogo && has.logo) {
    items.push({ t: "rect", x: 22, y: 22, w: 170, h: 58, fill: "#FFFFFF", opacity: 0.94 });
    items.push({ t: "image", x: 32, y: 28, w: 150, h: 46, src: "logo", fit: "contain" });
  }

  const L = 352, R = W - 34, cx = (L + R) / 2, cw = R - L, by = H - 70;
  const y = flow(items, (out, k) => {
    let y = 46;
    if (d.eyebrow) eyebrowLine(out, d.eyebrow, cx, y, cw, A);
    y += 50 * k;
    const title = d.title.trim();
    const tz = fit(title, "serif", 52, cw, 24);
    out.push({ t: "text", x: cx, y: y + tz * 0.15, text: title, font: "serif", size: tz, color: INK, align: "center" });
    y += 26 * k;
    if (d.subtitle) { const st = caps(fill(d.subtitle, data)); out.push({ t: "text", x: cx, y, text: st, font: "display", size: fit(st, "display", 7.5, cw, 5.5, 2), color: INK, align: "center", spacing: 2 }); }
    y += 50 * k;
    const nz = fit(data.name, "script", 52, cw - 20, 24);
    out.push({ t: "text", x: cx, y, text: data.name, font: "script", size: nz, color: INK, align: "center" });
    const nw = Math.min(cw - 20, approxWidth(data.name, "script", nz));
    swash(out, cx - nw / 2 - 10, y + 12, [cx - nw / 4, y + 4], [cx + nw / 4, y + 22], cx + nw / 2 + 24, y + 8, 1.6, A);
    y += 40 * k;
    y = courseBlock(out, d, data, cx, y, cw, "center", "serifRegular", k);
    return skillsRow(out, d, data, L + 8, R - 8, y + 16 * k, "center", paper, k);
  }, 46, by - 64);
  bottomRow(items, d, data, L - 4, R, Math.max(y + 40, by), 34);
  if (d.footer) items.push({ t: "text", x: cx, y: H - 14, text: fill(d.footer, data), font: "body", size: 6.5, color: FAINT, align: "center" });
  return items;
}

/* ───────────────────────── botanical ───────────────────────── */
function leaf(items: Item[], x: number, y: number, len: number, angle: number, color: string, vein: string) {
  const a = (angle * Math.PI) / 180, w = len * 0.36;
  const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
  const nx = -Math.sin(a) * w, ny = Math.cos(a) * w;
  const m1x = x + Math.cos(a) * len * 0.45, m1y = y + Math.sin(a) * len * 0.45;
  items.push({ t: "path", d: `M${n(x)},${n(y)} C${n(m1x + nx)},${n(m1y + ny)} ${n(ex + nx * 0.3)},${n(ey + ny * 0.3)} ${n(ex)},${n(ey)} C${n(ex - nx * 0.3)},${n(ey - ny * 0.3)} ${n(m1x - nx)},${n(m1y - ny)} ${n(x)},${n(y)} Z`, fill: color, opacity: 0.5 });
  const t = 0.5;
  items.push({ t: "path", d: `M${n(x)},${n(y)} L${n(ex)},${n(ey)} L${n(ex + nx * 0.02 * t)},${n(ey + ny * 0.02 * t + t)} L${n(x)},${n(y + t)} Z`, fill: vein, opacity: 0.55 });
}
function branch(items: Item[], x: number, y: number, dir: 1 | -1, A: string) {
  const edge = tint(A, 0.35), leafC = tint(A, 0.62), vein = tint(A, 0.25), berry = tint(A, 0.3);
  const len = 440;
  const sx = (t: number) => x + dir * (Math.sin(t * Math.PI * 1.5) * 26);
  // Stem: a gentle S down the side, then short twigs
  swash(items, x, y, [x + dir * 52, y + len * 0.3], [x - dir * 40, y + len * 0.66], x + dir * 20, y + len, 1.6, edge, 0.75);
  // Leaves fan upward from the stem, alternating sides
  const spots: [number, number, number][] = [0.03, 0.1, 0.18, 0.26, 0.35, 0.44, 0.53, 0.62, 0.71, 0.8, 0.88, 0.95].map((t, i) => [t, i % 2 ? -38 : -142, [40, 50, 56, 52, 58, 54, 56, 50, 52, 46, 42, 36][i]]);
  for (const [t, ang, l] of spots) {
    const py = y + t * len, px = sx(t), a = dir === 1 ? ang : 180 - ang;
    leaf(items, px, py, l + 2, a, edge, vein);
    leaf(items, px + dir * 0.6, py + 0.6, l - 3, a, leafC, vein);
  }
  const clusters: [number, number][] = [[0.13, 16], [0.31, -18], [0.49, 20], [0.67, -16], [0.84, 18]];
  for (const [t, dx] of clusters) {
    const py = y + t * len, px = sx(t) + dir * dx;
    for (const [ox, oy] of [[0, 0], [8, 3], [3, 9], [-5, 6]] as [number, number][]) {
      items.push({ t: "circle", cx: px + dir * ox, cy: py + oy, r: 4.6, fill: berry, stroke: edge, sw: 0.5 });
      items.push({ t: "circle", cx: px + dir * ox - 1.3, cy: py + oy - 1.3, r: 1.1, fill: tint(A, 0.8) });
    }
  }
}
function botanical(d: CertDesign, data: CertData, has: Has, items: Item[]): Item[] {
  const A = d.accent, paper = d.paper;
  branch(items, 66, 72, 1, A);
  branch(items, W - 66, 72, -1, A);
  items.push({ t: "rect", x: 16, y: 16, w: W - 32, h: H - 32, stroke: A, sw: 1.4 });
  items.push({ t: "rect", x: 23, y: 23, w: W - 46, h: H - 46, stroke: tint(A, 0.35), sw: 0.6 });
  for (const [x, y, sx, sy] of [[23, 23, 1, 1], [W - 23, 23, -1, 1], [23, H - 23, 1, -1], [W - 23, H - 23, -1, -1]]) {
    items.push({ t: "rect", x: Math.min(x, x + sx * 12), y: Math.min(y, y + sy * 12), w: 12, h: 12, fill: d.paper, stroke: A, sw: 0.8 });
    items.push({ t: "path", d: `M${x + sx * 6},${y + sy * 2.5} L${x + sx * 9.5},${y + sy * 6} L${x + sx * 6},${y + sy * 9.5} L${x + sx * 2.5},${y + sy * 6} Z`, fill: A });
  }
  const cx = W / 2, cw = 470, by = H - 84;
  logoOrName(items, has, d, data, cx, 40, 200, 46, "center");
  const y = flow(items, (out, k) => {
    let y = 116 + 6 * (k - 1);
    const title = caps(d.title);
    out.push({ t: "text", x: cx, y, text: title, font: "serifRegular", size: fit(title, "serifRegular", 22, cw, 14, 1.5), color: INK, align: "center", spacing: 1.5 });
    y += 18 * k; diamondRule(out, cx, y, 92, A);
    y += 28 * k;
    if (d.subtitle) { const st = caps(fill(d.subtitle, data)); out.push({ t: "text", x: cx, y, text: st, font: "display", size: fit(st, "display", 7.5, cw, 5.5, 2.2), color: INK, align: "center", spacing: 2.2 }); }
    y += 56 * k;
    const nz = fit(data.name, "script", 60, cw, 26);
    out.push({ t: "text", x: cx, y, text: data.name, font: "script", size: nz, color: INK, align: "center" });
    y += 18; out.push({ t: "line", x1: cx - 190, y1: y, x2: cx + 190, y2: y, stroke: A, sw: 0.7 });
    y += 30 * k;
    y = courseBlock(out, d, data, cx, y, cw, "center", "serif", k);
    if (d.showSkills && data.points?.length) {
      y += 4 * k;
      for (const l of wrapItems(data.points, "body", 8.5, cw, 2)) { out.push({ t: "text", x: cx, y: y + 6, text: l, font: "body", size: 8.5, color: MUTED, align: "center" }); y += 12; }
    }
    return y;
  }, 116, by - 72, 1.45);
  bottomRow(items, d, data, 120, W - 64, Math.max(y + 56, by), 42, W / 2);
  if (d.footer) items.push({ t: "text", x: cx, y: H - 32, text: fill(d.footer, data), font: "body", size: 6.5, color: FAINT, align: "center" });
  return items;
}

/* ───────────────────────── poster ───────────────────────── */
function poster(d: CertDesign, data: CertData, has: Has, items: Item[]): Item[] {
  const A = d.accent, paper = d.paper, PW = 272;
  items.push({ t: "rect", x: 0, y: 0, w: PW, h: H, fill: A });
  if (d.photo) {
    items.push({ t: "image", x: 0, y: H - 250, w: PW, h: 250, src: "photo", fit: "cover" });
    items.push({ t: "rect", x: 0, y: H - 250, w: PW, h: 250, fill: A, opacity: 0.5 });
    items.push({ t: "path", d: `M0,${H - 250} L${PW},${H - 250} L${PW},${H - 214} C180,${H - 240} 90,${H - 222} 0,${H - 196} Z`, fill: A });
  }
  // Big words on the panel
  let y = 40;
  const words = caps(data.business).split(/\s+/).filter(Boolean).slice(0, 3);
  const bz = Math.min(...words.map((w) => fit(w, "condensed", 74, PW - 56, 30, 0)));
  for (const w of words) { y += bz * 0.84; items.push({ t: "text", x: 34, y, text: w, font: "condensed", size: bz, color: tint(A, 0.8), align: "left" }); }
  y += 14;
  if (d.panelTitle) {
    for (const l of wrap(caps(d.panelTitle), "condensed", 30, PW - 60, 3)) { y += 28; items.push({ t: "text", x: 34, y, text: l, font: "condensed", size: fit(l, "condensed", 30, PW - 60, 16, 1.5), color: "#FFFFFF", align: "left", spacing: 1.5 }); }
    y += 10;
  }
  for (const w of d.panelWords.split(/\n/).map((x) => x.trim()).filter(Boolean).slice(0, 6)) { y += 13; items.push({ t: "text", x: 34, y, text: caps(w), font: "display", size: 7.5, color: "#FFFFFF", align: "left", spacing: 2 }); }
  // Faint big logo behind the text
  if (d.showLogo && has.logo) items.push({ t: "image", x: 560, y: 120, w: 270, h: 270, src: "logo", fit: "contain", align: "right", opacity: 0.05 });

  const L = PW + 40, R = W - 40, cw = R - L, by = H - 72;
  if (d.showLogo && has.logo) items.push({ t: "image", x: L, y: 34, w: 170, h: 40, src: "logo", fit: "contain" });
  else items.push({ t: "text", x: L, y: 60, text: caps(data.business), font: "display", size: fit(caps(data.business), "display", 15, cw, 9, 2), color: A, align: "left", spacing: 2 });
  y = flow(items, (out, k) => {
    let y = 108;
    const title = caps(d.title);
    out.push({ t: "text", x: L, y, text: title, font: "display", size: fit(title, "display", 17, cw, 11, 0.8), color: INK, align: "left", spacing: 0.8 });
    y += 18 * k;
    if (d.subtitle) { const st = caps(fill(d.subtitle, data)); out.push({ t: "text", x: L, y, text: st, font: "display", size: fit(st, "display", 7, cw, 5, 1.6), color: INK, align: "left", spacing: 1.6 }); }
    y += 44 * k;
    const nz = fit(data.name, "serif", 44, cw, 22);
    out.push({ t: "text", x: L, y, text: data.name, font: "serif", size: nz, color: INK, align: "left" });
    y += 13; out.push({ t: "line", x1: L, y1: y, x2: L + Math.min(cw, 400), y2: y, stroke: tint(A, 0.35), sw: 0.8 });
    y += 26 * k;
    y = courseBlock(out, d, data, L, y, cw, "left", "serifRegular", k);
    return skillsRow(out, d, data, L, R, y + 16 * k, "left", paper, k);
  }, 108, by - 64);
  bottomRow(items, d, data, L - 6, R + 10, Math.max(y + 40, by), 34);
  if (d.footer) items.push({ t: "text", x: R, y: H - 14, text: fill(d.footer, data), font: "body", size: 6.5, color: FAINT, align: "right" });
  return items;
}

/* ───────────────────────── elegant ───────────────────────── */
function elegant(d: CertDesign, data: CertData, has: Has, items: Item[]): Item[] {
  const A = d.accent;
  items.push({ t: "rect", x: 18, y: 18, w: W - 36, h: H - 36, stroke: A, sw: 1.1 });
  items.push({ t: "rect", x: 25, y: 25, w: W - 50, h: H - 50, stroke: tint(A, 0.5), sw: 0.5 });
  for (const [x, y] of [[18, 18], [W - 18, 18], [18, H - 18], [W - 18, H - 18]]) items.push({ t: "rect", x: x - 3, y: y - 3, w: 6, h: 6, fill: A });
  const cx = W / 2, cw = 520, by = H - 84;
  logoOrName(items, has, d, data, cx, 44, 200, 46, "center");
  const y = flow(items, (out, k) => {
    let y = 132 + 6 * (k - 1);
    const title = caps(d.title);
    out.push({ t: "text", x: cx, y, text: title, font: "serifRegular", size: fit(title, "serifRegular", 19, cw, 12, 3.2), color: INK, align: "center", spacing: 3.2 });
    y += 20 * k; diamondRule(out, cx, y, 70, A);
    y += 28 * k;
    if (d.subtitle) { const st = caps(fill(d.subtitle, data)); out.push({ t: "text", x: cx, y, text: st, font: "display", size: fit(st, "display", 7.5, cw, 5.5, 2.2), color: INK, align: "center", spacing: 2.2 }); }
    y += 56 * k;
    const nz = fit(data.name, "serifRegular", 52, cw, 24);
    out.push({ t: "text", x: cx, y, text: data.name, font: "serifRegular", size: nz, color: INK, align: "center" });
    y += 18; out.push({ t: "line", x1: cx - 205, y1: y, x2: cx + 205, y2: y, stroke: A, sw: 0.7 });
    y += 30 * k;
    y = courseBlock(out, d, data, cx, y, cw, "center", "serifRegular", k);
    if (d.showSkills && data.points?.length) {
      y += 4 * k;
      for (const l of wrapItems(data.points, "body", 8.5, cw, 2)) { out.push({ t: "text", x: cx, y: y + 6, text: l, font: "body", size: 8.5, color: MUTED, align: "center" }); y += 12; }
    }
    return y;
  }, 132, by - 72, 1.45);
  bottomRow(items, d, data, 70, W - 64, Math.max(y + 56, by), 40, W / 2);
  if (d.footer) items.push({ t: "text", x: cx, y: H - 34, text: fill(d.footer, data), font: "body", size: 6.5, color: FAINT, align: "center" });
  return items;
}

export const NEW_STYLES: Record<"latte" | "botanical" | "poster" | "elegant", (d: CertDesign, data: CertData, has: Has, items: Item[]) => Item[]> = { latte, botanical, poster, elegant };

/* ───────────────────────── artwork versions ─────────────────────────
 * When a business has finished artwork for one of these styles (the design with its photo, panels, seal, logo and the
 * wording that never changes), only the student's details are printed on top — at the same places as in that artwork.
 * Positions are in points on A4 landscape.
 */
interface ArtSpec {
  name: { x: number; y: number; w: number; size: number; font: Font; align: "center" | "left" };
  swash?: boolean;              // pink stroke under the name (latte)
  course: { x: number; y: number; w: number; size: number; font: Font; align: "center" | "left" };
  hours: { x: number; y: number; w: number; align: "center" | "left" };
  skills?: { x0: number; x1: number; y: number };
  sig: { x: number; y: number; w: number; h: number };
  date: { x: number; y: number; w: number };
  qr: { x: number; y: number; size: number };
  number: { x: number; y: number };
  signer: { x: number; y1: number; y2: number; line: [number, number, number] };   // name and title under the signature line (x0, x1, y)
  dateCap: { x: number; y: number };               // "Date of completion"
  verify: { x: number; y: number[] };              // "Verify this credential" and two short lines
  words: { x: number; align: "center" | "left"; sub: [number, number]; lead: [number, number]; tag: [number, number] }; // [baseline, width] of the small capitals lines
}
const ART: Record<"latte" | "botanical" | "poster" | "elegant", ArtSpec> = {
  latte: {
    name: { x: 578.6, y: 234, w: 368, size: 100, font: "scriptCasual", align: "center" }, swash: true,
    course: { x: 578.6, y: 317.5, w: 372, size: 24, font: "serif", align: "center" },
    hours: { x: 578.6, y: 359.5, w: 330, align: "center" },
    skills: { x0: 354, x1: 763, y: 397 },
    sig: { x: 304, y: 487, w: 135, h: 43 }, date: { x: 607.4, y: 526.3, w: 96 },
    qr: { x: 671.6, y: 502.6, size: 49 }, number: { x: 732.4, y: 554.4 },
    signer: { x: 370.6, y1: 551, y2: 562, line: [303, 434, 536.4] }, dateCap: { x: 606.3, y: 542 }, verify: { x: 732.4, y: [512.7, 527.4, 538.7] },
    words: { x: 578.6, align: "center", sub: [163.4, 147], lead: [289.6, 229], tag: [342.6, 315] },
  },
  botanical: {
    name: { x: 420.5, y: 279.5, w: 436, size: 86, font: "scriptFormal", align: "center" },
    course: { x: 421.6, y: 362.9, w: 420, size: 26, font: "serif", align: "center" },
    hours: { x: 421.6, y: 409, w: 360, align: "center" },
    sig: { x: 88, y: 444, w: 180, h: 56 }, date: { x: 524.8, y: 492.4, w: 104 },
    qr: { x: 603.9, y: 463.2, size: 60 }, number: { x: 677.2, y: 525 },
    signer: { x: 176, y1: 526.3, y2: 538.7, line: [76.7, 274.3, 506] }, dateCap: { x: 524.8, y: 509.4 }, verify: { x: 677.2, y: [476.7, 492.5, 504.9] },
    words: { x: 421, align: "center", sub: [192.7, 169], lead: [332.4, 262], tag: [392.2, 335] },
  },
  poster: {
    name: { x: 344.3, y: 210.3, w: 352, size: 58, font: "serif", align: "left" },
    course: { x: 344.3, y: 288.2, w: 352, size: 22, font: "serif", align: "left" },
    hours: { x: 344.3, y: 334, w: 330, align: "left" },
    skills: { x0: 342, x1: 772, y: 371 },
    sig: { x: 306.8, y: 481, w: 126, h: 48 }, date: { x: 608, y: 523.3, w: 90 },
    qr: { x: 667.6, y: 496, size: 55 }, number: { x: 731.6, y: 559 },
    signer: { x: 369.7, y1: 551.7, y2: 564, line: [309, 432.6, 534.4] }, dateCap: { x: 608, y: 540.6 }, verify: { x: 731.6, y: [509.6, 525.7, 538] },
    words: { x: 345.4, align: "left", sub: [147.2, 136], lead: [259.8, 209], tag: [315.4, 306] },
  },
  elegant: {
    name: { x: 423.3, y: 280.5, w: 368, size: 62, font: "serifRegular", align: "center" },
    course: { x: 422, y: 360.3, w: 366, size: 24, font: "serifRegular", align: "center" },
    hours: { x: 422, y: 406, w: 330, align: "center" },
    sig: { x: 76.9, y: 433, w: 181, h: 55 }, date: { x: 516.5, y: 481.3, w: 96 },
    qr: { x: 601.3, y: 454.3, size: 62 }, number: { x: 675.9, y: 518.9 },
    signer: { x: 166.1, y1: 510.7, y2: 523.6, line: [71, 260, 494.2] }, dateCap: { x: 516.5, y: 497.8 }, verify: { x: 675.9, y: [466, 482.5, 495.4] },
    words: { x: 423.3, align: "center", sub: [217, 164], lead: [331, 251], tag: [387.4, 314] },
  },
};
/** Skill labels on two short lines like "Espresso / extraction", "Cleaning / & maintenance". */
function labelLines(p: string) {
  const w = p.split(/\s+/).filter(Boolean);
  if (w.length < 2) return [p];
  let best = 1, diff = Infinity;
  for (let i = 1; i < w.length; i++) { const a = w.slice(0, i).join(" ").length, b = w.slice(i).join(" ").length; if (Math.abs(a - b) < diff) { diff = Math.abs(a - b); best = i; } }
  return [w.slice(0, best).join(" "), w.slice(best).join(" ")];
}
function artStyle(style: keyof typeof ART) {
  return (d: CertDesign, data: CertData, items: Item[]): Item[] => {
    const S = ART[style], A = d.accent, ink = "#141414", grey = "#3A3735";
    items.push({ t: "image", x: 0, y: 0, w: W, h: H, src: "art", fit: "fill" });
    const smallCaps = (t: string, [y, w]: [number, number], color: string) => {
      const u = caps(t).trim();
      if (u) items.push({ t: "text", x: S.words.x, y, text: u, font: "display", size: fit(u, "display", 12, w, 5, 2), color, align: S.words.align, spacing: 2 });
    };
    if (d.subtitle) smallCaps(fill(d.subtitle, data), S.words.sub, "#1F1C1A");
    smallCaps(leadLine(d, data), S.words.lead, "#1F1C1A");
    smallCaps(fill(d.tagline, data), S.words.tag, "#2A2725");
    const nz = fit(data.name, S.name.font, S.name.size, S.name.w, S.name.size * 0.42);
    items.push({ t: "text", x: S.name.x, y: S.name.y, text: data.name, font: S.name.font, size: nz, color: ink, align: S.name.align });
    if (S.swash) {
      const nw = Math.min(S.name.w + 40, approxWidth(data.name, S.name.font, nz) + 70), x0 = S.name.x - nw / 2 - 6, x1 = S.name.x + nw / 2 + 24, y = S.name.y + 21;
      swash(items, x0, y + 3, [x0 + nw * 0.35, y - 1], [x0 + nw * 0.7, y + 4], x1, y - 4, 2.2, shade(A, 0.08), 0.9);
    }
    const cz = fit(data.course, S.course.font, S.course.size, S.course.w, S.course.size * 0.55);
    items.push({ t: "text", x: S.course.x, y: S.course.y, text: data.course, font: S.course.font, size: cz, color: ink, align: S.course.align });
    const hrs = data.hours ? caps(fill(d.hoursLine, data)).trim() : "";
    if (hrs) items.push({ t: "text", x: S.hours.x, y: S.hours.y, text: hrs, font: "display", size: fit(hrs, "display", 10.2, S.hours.w, 5.5, 1.7), color: "#2A2725", align: S.hours.align, spacing: 1.7 });
    if (S.skills && d.showSkills && data.points?.length) {
      const pts = data.points.slice(0, 6), { x0, x1, y } = S.skills, cell = (x1 - x0) / pts.length, ic = shade(A, 0.12);
      pts.forEach((p, i) => {
        const mx = x0 + cell * i + cell / 2;
        icon(items, iconFor(p), mx, y + 14, 30, ic, "#FFFFFF");
        labelLines(p).forEach((l, j) => items.push({ t: "text", x: mx, y: y + 49 + j * 12, text: l, font: "medium", size: fit(l, "medium", 11, cell - 6, 6), color: "#1F1C1A", align: "center" }));
        if (i > 0) items.push({ t: "line", x1: x0 + cell * i, y1: y - 2, x2: x0 + cell * i, y2: y + 66, stroke: tint(A, 0.55), sw: 0.6 });
      });
    }
    if (d.signature) items.push({ t: "image", x: S.sig.x, y: S.sig.y, w: S.sig.w, h: S.sig.h, src: "signature", fit: "contain" });
    items.push({ t: "line", x1: S.signer.line[0], y1: S.signer.line[2], x2: S.signer.line[1], y2: S.signer.line[2], stroke: "#B9B1AA", sw: 0.7 });
    items.push({ t: "text", x: S.date.x, y: S.date.y, text: data.date, font: "serifRegular", size: fit(data.date, "serifRegular", 13, S.date.w, 8), color: ink, align: "center" });
    if (d.showQr) items.push({ t: "image", x: S.qr.x, y: S.qr.y, w: S.qr.size, h: S.qr.size, src: "qr" });
    if (d.showNumber) items.push({ t: "text", x: S.number.x, y: S.number.y, text: data.number, font: "display", size: 8.6, color: grey, align: "left", spacing: 0.3 });
    if (d.signerName) items.push({ t: "text", x: S.signer.x, y: S.signer.y1, text: caps(d.signerName), font: "display", size: fit(caps(d.signerName), "display", 9.2, 130, 5, 0.6), color: ink, align: "center", spacing: 0.6 });
    if (d.signerTitle) items.push({ t: "text", x: S.signer.x, y: d.signerName ? S.signer.y2 : S.signer.y1, text: d.signerTitle, font: "body", size: fit(d.signerTitle, "body", 8.8, 130, 5), color: grey, align: "center" });
    items.push({ t: "text", x: S.dateCap.x, y: S.dateCap.y, text: "Date of completion", font: "body", size: 8.4, color: "#77716C", align: "center" });
    if (d.showQr) {
      items.push({ t: "text", x: S.verify.x, y: S.verify.y[0], text: "Verify this credential", font: "display", size: 10.2, color: ink, align: "left" });
      items.push({ t: "text", x: S.verify.x, y: S.verify.y[1], text: "Scan to confirm authenticity,", font: "body", size: 8.1, color: grey, align: "left" });
      items.push({ t: "text", x: S.verify.x, y: S.verify.y[2], text: "course and completion date.", font: "body", size: 8.1, color: grey, align: "left" });
    }
    return items;
  };
}
export const ART_STYLES = { latte: artStyle("latte"), botanical: artStyle("botanical"), poster: artStyle("poster"), elegant: artStyle("elegant") };
