import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { CONSENTS, fieldShown, ownerLabel, steps as allSteps, type Field } from "./form";

export interface SignedPdfInput {
  org: string;
  title: string;
  applicants: number;
  names: string[];
  answers: Record<string, unknown>;
  signatures: { applicant: number; signed_name: string; image: string; signed_at: string; ip: string | null; user_agent: string | null }[];
  documents: { label: string; status: string; files: string[] }[];
  sentAt: string;
  timezone: string;
}

const INK = rgb(0.12, 0.14, 0.19), MUTED = rgb(0.4, 0.43, 0.49), LINE = rgb(0.86, 0.87, 0.9), ACCENT = rgb(0.12, 0.16, 0.27);
const W = 595.28, H = 841.89, M = 48;

/** Characters the standard PDF fonts can't draw are swapped for close ones (or dropped). */
const safe = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...").replace(/[^\x20-\x7E\xA0-\xFF\n]/g, "");

function show(f: Field, v: unknown): string {
  if (v == null || v === "") return "";
  const s = String(v);
  if (f.type === "money") { const n = Number(s.replace(/[^\d.]/g, "")); return Number.isFinite(n) ? `$${n.toLocaleString("en-AU")}` : s; }
  if (f.type === "multi") return s.split("|").join(", ");
  if (f.type === "check") return s === "yes" ? "Yes" : "No";
  if (f.type === "date" && /^\d{4}-\d{2}-\d{2}$/.test(s)) return `${+s.slice(8)}/${+s.slice(5, 7)}/${s.slice(0, 4)}`;
  return s;
}

const when = (iso: string, tz: string) => new Date(iso).toLocaleString("en-AU", { timeZone: tz, day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" });

/** The application as sent, with each applicant's consents and signature and an audit trail — a PDF. */
export async function buildSignedApplication(i: SignedPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${i.title} — signed application`); pdf.setAuthor(i.org); pdf.setCreator("EventureOS");
  const font = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page: PDFPage = pdf.addPage([W, H]); let y = H - M;
  const newPage = () => { page = pdf.addPage([W, H]); y = H - M; };
  const need = (h: number) => { if (y - h < M + 20) newPage(); };
  const wrap = (text: string, f: PDFFont, size: number, width: number) => {
    const out: string[] = [];
    for (const para of safe(text).split("\n")) {
      let line = "";
      for (const w of para.split(/\s+/)) {
        const t = line ? `${line} ${w}` : w;
        if (f.widthOfTextAtSize(t, size) > width && line) { out.push(line); line = w; } else line = t;
      }
      out.push(line);
    }
    return out;
  };
  const text = (s: string, o: { size?: number; f?: PDFFont; color?: ReturnType<typeof rgb>; x?: number; width?: number; gap?: number } = {}) => {
    const size = o.size ?? 10, f = o.f ?? font, x = o.x ?? M, width = o.width ?? W - M - x;
    for (const line of wrap(s, f, size, width)) { need(size + 4); page.drawText(line, { x, y: y - size, size, font: f, color: o.color ?? INK }); y -= size + (o.gap ?? 4); }
  };
  const heading = (s: string) => { need(34); y -= 10; page.drawText(safe(s), { x: M, y: y - 13, size: 13, font: bold, color: ACCENT }); y -= 19; page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.8, color: LINE }); y -= 8; };
  const row = (label: string, value: string) => {
    const lw = 190;
    const lines = wrap(value || "-", font, 10, W - M * 2 - lw - 10);
    need(lines.length * 14 + 2);
    page.drawText(safe(label).slice(0, 60), { x: M, y: y - 10, size: 9, font, color: MUTED });
    lines.forEach((l, n) => page.drawText(l, { x: M + lw + 10, y: y - 10 - n * 14, size: 10, font, color: value ? INK : MUTED }));
    y -= lines.length * 14 + 3;
  };

  // cover
  page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: ACCENT });
  text(i.org, { size: 11, f: bold, color: MUTED });
  y -= 4; text(i.title, { size: 20, f: bold, gap: 6 });
  text(`Loan application — signed ${when(i.sentAt, i.timezone)}`, { size: 10, color: MUTED });
  text(`Applicants: ${i.names.join(", ")}`, { size: 10, color: MUTED });

  for (const s of allSteps(i.applicants)) {
    if (s.special) continue;
    heading(s.title);
    for (let a = 1; a <= i.applicants; a++) {
      if (!s.perApplicant) break;
      if (i.applicants > 1) text(i.names[a - 1], { f: bold, size: 10.5, gap: 6 });
      for (const f of s.perApplicant) if (fieldShown(f, i.answers, `a${a}.`)) row(f.label, show(f, i.answers[`a${a}.${f.key}`]));
      y -= 4;
    }
    for (const f of s.fields ?? []) if (fieldShown(f, i.answers)) row(f.label, show(f, i.answers[f.key]));
    for (const l of s.lists ?? []) {
      const rows = (Array.isArray(i.answers[l.key]) ? i.answers[l.key] : []) as Record<string, string>[];
      text(l.label, { f: bold, size: 10, gap: 5 });
      if (!rows.length) { text(i.answers[`${l.key}__none`] === true ? "None" : "-", { size: 10, color: MUTED, x: M + 10 }); continue; }
      rows.forEach((r, n) => text(`${n + 1}. ${l.fields.map((f) => `${f.label}: ${(f.owner && r[f.key] ? ownerLabel(r[f.key], i.names) : show(f, r[f.key])) || "-"}`).join("  ·  ").replace(/·/g, "-")}`, { size: 9.5, x: M + 10 }));
      y -= 3;
    }
  }

  heading("Documents");
  for (const d of i.documents) text(`${d.status === "not_applicable" ? "[n/a]" : d.files.length ? "[received]" : "[to come]"}  ${d.label}${d.files.length ? ` — ${d.files.join(", ")}` : ""}`, { size: 9.5 });

  heading("Consent and declaration");
  for (let a = 1; a <= i.applicants; a++) {
    if (i.applicants > 1) text(i.names[a - 1], { f: bold, size: 10.5, gap: 6 });
    for (const c of CONSENTS) { const v = i.answers[`a${a}.${c.key}`]; if (v === undefined && c.key === "c_credit_guide") continue; text(`${v === "yes" ? "[x]" : "[ ]"}  ${c.label}`, { size: 10 }); }
    y -= 4;
  }

  heading("Signatures");
  for (const s of [...i.signatures].sort((a, b) => a.applicant - b.applicant)) {
    need(120);
    try {
      const png = await pdf.embedPng(Buffer.from(s.image.split(",")[1] ?? "", "base64"));
      const scale = Math.min(220 / png.width, 70 / png.height, 1);
      page.drawImage(png, { x: M, y: y - png.height * scale, width: png.width * scale, height: png.height * scale });
      y -= png.height * scale + 4;
    } catch { text("(signature image could not be shown)", { size: 9, color: MUTED }); }
    page.drawLine({ start: { x: M, y }, end: { x: M + 240, y }, thickness: 0.6, color: MUTED }); y -= 4;
    text(`${s.signed_name}${i.applicants > 1 ? ` (${i.names[s.applicant - 1]})` : ""}`, { f: bold, size: 10 });
    text(`Signed ${when(s.signed_at, i.timezone)}${s.ip ? ` · IP ${s.ip}` : ""}`, { size: 8.5, color: MUTED, gap: 2 });
    if (s.user_agent) text(`Browser: ${s.user_agent}`, { size: 7.5, color: MUTED, gap: 8 });
  }

  // page numbers
  const pages = pdf.getPages();
  pages.forEach((p, n) => p.drawText(safe(`${i.org} · ${i.title} · page ${n + 1} of ${pages.length}`), { x: M, y: 24, size: 7.5, font, color: MUTED }));
  return pdf.save();
}
