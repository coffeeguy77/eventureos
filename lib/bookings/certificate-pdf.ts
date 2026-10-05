import "server-only";
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import QRCode from "qrcode";
import { appBaseUrl } from "@/lib/integrations/registry";
import { H, W, layout, type CertData, type CertDesign, type Font } from "./certificate";

const FILES: Record<Font, string> = {
  script: "GreatVibes.ttf", serif: "PlayfairDisplay-Bold.ttf", serifItalic: "PlayfairDisplay-Italic.ttf", sans: "Lato-Regular.ttf", sansBold: "Lato-Bold.ttf",
  light: "Barlow-Light.ttf", body: "Barlow-Regular.ttf", display: "Barlow-SemiBold.ttf",
};
const cache = new Map<string, Uint8Array>();
async function fontBytes(name: string) {
  if (cache.has(name)) return cache.get(name)!;
  const res = await fetch(`${appBaseUrl()}/fonts/cert/${name}`, { cache: "force-cache" });
  if (!res.ok) throw new Error(`Certificate font ${name} not found (${res.status})`);
  const b = new Uint8Array(await res.arrayBuffer());
  cache.set(name, b);
  return b;
}

const color = (hex: string) => { const n = parseInt(hex.slice(1), 16); return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };

async function image(doc: PDFDocument, bytes: Uint8Array | null): Promise<PDFImage | null> {
  if (!bytes || bytes.length < 8) return null;
  try {
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return await doc.embedPng(bytes);
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return await doc.embedJpg(bytes);
  } catch { /* unsupported image — skip it */ }
  return null;
}

export async function fetchImage(url: string | null): Promise<Uint8Array | null> {
  if (!url || !/^https:\/\//.test(url)) return null;
  try { const r = await fetch(url, { cache: "force-cache" }); return r.ok ? new Uint8Array(await r.arrayBuffer()) : null; } catch { return null; }
}

function drawText(page: PDFPage, font: PDFFont, text: string, x: number, y: number, size: number, c: ReturnType<typeof rgb>, align: "left" | "center" | "right", spacing = 0) {
  const width = font.widthOfTextAtSize(text, size) + spacing * Math.max(0, text.length - 1);
  let at = align === "center" ? x - width / 2 : align === "right" ? x - width : x;
  if (!spacing) { page.drawText(text, { x: at, y: H - y, size, font, color: c }); return; }
  for (const ch of text) { page.drawText(ch, { x: at, y: H - y, size, font, color: c }); at += font.widthOfTextAtSize(ch, size) + spacing; }
}

/** One certificate as a PDF (A4 landscape). */
export async function certificatePdf(design: CertDesign, data: CertData, logo: Uint8Array | null, background: Uint8Array | null = null) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`${data.course} — ${data.name}`);
  doc.setAuthor(data.business);
  doc.setSubject(`Certificate ${data.number}`);
  const page = doc.addPage([W, H]);
  const fonts = {} as Record<Font, PDFFont>;
  const items = layout(design, data, { logo: !!logo });
  const used = new Set(items.flatMap((i) => (i.t === "text" ? [i.font] : [])));
  for (const k of [...used] as Font[]) fonts[k] = await doc.embedFont(await fontBytes(FILES[k]), { subset: k !== "script" }); // subsetting breaks the script font's joined letters
  const logoImg = await image(doc, logo);
  const sigImg = design.signature ? await image(doc, Uint8Array.from(Buffer.from(design.signature.split(",")[1], "base64"))) : null;
  const bgImg = design.background ? await image(doc, background) : null;
  const qrImg = design.showQr ? await doc.embedPng(await QRCode.toBuffer(data.verifyUrl, { margin: 0, width: 300, errorCorrectionLevel: "M" })) : null;

  for (const it of items) {
    if (it.t === "rect") {
      page.drawRectangle({ x: it.x, y: H - it.y - it.h, width: it.w, height: it.h, ...(it.fill ? { color: color(it.fill) } : {}), ...(it.stroke ? { borderColor: color(it.stroke), borderWidth: it.sw ?? 1 } : {}) });
    } else if (it.t === "line") {
      page.drawLine({ start: { x: it.x1, y: H - it.y1 }, end: { x: it.x2, y: H - it.y2 }, thickness: it.sw, color: color(it.stroke) });
    } else if (it.t === "circle") {
      page.drawCircle({ x: it.cx, y: H - it.cy, size: it.r, ...(it.fill ? { color: color(it.fill) } : {}), ...(it.stroke ? { borderColor: color(it.stroke), borderWidth: it.sw ?? 1 } : {}) });
    } else if (it.t === "text") {
      drawText(page, fonts[it.font], it.text, it.x, it.y, it.size, color(it.color), it.align, it.spacing);
    } else if (it.t === "path") {
      page.drawSvgPath(it.d, { x: 0, y: H, color: color(it.fill), opacity: it.opacity ?? 1, borderWidth: 0 });
    } else if (it.t === "image") {
      const img = it.src === "logo" ? logoImg : it.src === "signature" ? sigImg : it.src === "background" ? bgImg : qrImg;
      if (!img) continue;
      const scale = it.fit === "cover" ? Math.max(it.w / img.width, it.h / img.height) : Math.min(it.w / img.width, it.h / img.height);
      const w = img.width * scale, h = img.height * scale;
      const x = it.fit === "cover" ? it.x + (it.w - w) / 2 : it.align === "right" ? it.x + it.w - w : it.x + (it.w - w) / 2;
      page.drawImage(img, { x, y: H - it.y - it.h + (it.h - h) / 2, width: w, height: h });
    }
  }
  return doc.save();
}
