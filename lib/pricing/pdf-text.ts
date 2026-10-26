import { getDocumentProxy } from "unpdf";

/**
 * Pull the text out of a PDF invoice and rebuild it as lines that keep their column layout
 * (like `pdftotext -layout`): text on the same row becomes one line, and the horizontal gap
 * between pieces becomes spaces, so a column gap is always two or more spaces.
 */
export interface PdfLine { page: number; y: number; text: string; cells: { x: number; text: string }[] }

interface Piece { x: number; y: number; w: number; text: string; h: number }

export async function pdfToLines(data: Uint8Array): Promise<PdfLine[]> {
  const pdf = await getDocumentProxy(new Uint8Array(data));
  const out: PdfLine[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const pieces: Piece[] = [];
    for (const it of content.items as { str?: string; transform?: number[]; width?: number; height?: number }[]) {
      if (!it.str || !it.transform || !it.str.trim()) continue;
      pieces.push({ x: it.transform[4], y: it.transform[5], w: it.width ?? 0, h: it.height || Math.abs(it.transform[3]) || 8, text: it.str });
    }
    // group into rows (PDF y grows upwards)
    pieces.sort((a, b) => b.y - a.y || a.x - b.x);
    const rows: Piece[][] = [];
    for (const pc of pieces) {
      const row = rows.find((r) => Math.abs(r[0].y - pc.y) <= Math.max(2, Math.min(r[0].h, pc.h) * 0.4));
      if (row) row.push(pc); else rows.push([pc]);
    }
    rows.sort((a, b) => b[0].y - a[0].y);
    for (const row of rows) {
      row.sort((a, b) => a.x - b.x);
      // merge pieces that touch into cells
      const cells: { x: number; end: number; text: string; h: number }[] = [];
      for (const pc of row) {
        const last = cells[cells.length - 1];
        const charW = Math.max(2, pc.h * 0.5);
        if (last && pc.x - last.end < charW * 1.2) {
          const gap = pc.x - last.end;
          last.text += (gap > charW * 0.25 && !last.text.endsWith(" ") && !pc.text.startsWith(" ") ? " " : "") + pc.text;
          last.end = Math.max(last.end, pc.x + pc.w);
        } else {
          cells.push({ x: pc.x, end: pc.x + pc.w, text: pc.text, h: pc.h });
        }
      }
      const text = cells.map((c) => c.text.replace(/\s+/g, " ").trim()).filter(Boolean).join("   ");
      if (text.trim()) out.push({ page: p, y: row[0].y, text, cells: cells.map((c) => ({ x: c.x, text: c.text.trim() })) });
    }
  }
  return out;
}
