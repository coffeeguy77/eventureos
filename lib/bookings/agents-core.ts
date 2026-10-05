/** Employment agency case managers — pure helpers (no server imports), shared and unit-tested. */

export interface CaseManagerInput { name: string; email: string; phone?: string | null; site?: string | null }

/** "Jason B." — enough for someone to recognise their own name, without listing full names to anyone with the code. */
export function listName(full: string) {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] ?? "—";
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

/** j•••@sureway.com.au — confirms which inbox without showing the address to whoever typed the code. */
export function maskEmail(e: string) {
  const [u, d] = e.split("@");
  return `${u.slice(0, 1)}${"•".repeat(Math.max(2, Math.min(5, u.length - 1)))}@${d}`;
}

/** Paste from a spreadsheet: one per line — name, email, phone, office (comma or tab separated; header row skipped). */
export function parseCaseManagerList(text: string): { rows: CaseManagerInput[]; skipped: string[] } {
  const rows: CaseManagerInput[] = [], skipped: string[] = [];
  let first = true;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const isFirst = first; first = false;
    const cells = (line.includes("\t") ? line.split("\t") : line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)).map((c) => c.trim().replace(/^"|"$/g, "").trim());
    const emailIdx = cells.findIndex((c) => /^[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}$/i.test(c));
    if (emailIdx < 0) { if (!(isFirst && /e-?mail/i.test(line))) skipped.push(line.slice(0, 80)); continue; } // a header row is skipped quietly
    const rest = cells.filter((_, i) => i !== emailIdx);
    const name = rest.find((c) => /[a-z]/i.test(c) && !/^\+?[\d\s()-]{6,}$/.test(c)) ?? "";
    const phone = rest.find((c) => /^\+?[\d\s()-]{8,}$/.test(c)) ?? null;
    const site = rest.filter((c) => c !== name && c !== phone && c).join(" ").slice(0, 160) || null;
    if (name.length < 2) { skipped.push(line.slice(0, 80)); continue; }
    rows.push({ name, email: cells[emailIdx], phone, site });
  }
  return { rows, skipped };
}
