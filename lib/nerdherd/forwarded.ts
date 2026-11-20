/**
 * Read the original email out of a forwarded one (Gmail, Outlook and Apple Mail layouts):
 *   ---------- Forwarded message ---------            Begin forwarded message:        From: Name <a@b.com>
 *   From: Name <a@b.com>                              From: Name <a@b.com>            Sent: Monday, 3 November 2026 9:14 AM
 *   Date: Mon, 3 Nov 2026 at 09:14                    Subject: …                      To: …
 *   Subject: …                                        Date: …                         Subject: …
 *   To: …
 *   <body>
 * Returns null when there's no forwarded header to read.
 */
export interface Forwarded { fromName: string | null; fromEmail: string; subject: string | null; date: string | null; body: string; note: string }

const EMAIL = /[A-Z0-9._%+'-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

export function parseForwarded(text: string, subject: string | null): Forwarded | null {
  const t = (text ?? "").replace(/\r\n/g, "\n");
  const marker = t.search(/^-{2,}\s*Forwarded message\s*-{2,}|^Begin forwarded message:|^-{2,}\s*Original Message\s*-{2,}/im);
  // Outlook often has no marker: the first "From:" line followed within a few lines by "Sent:"/"Date:" and "Subject:"
  const start = marker >= 0 ? marker : t.search(/^\s*\*?From:\*?\s.+\n(?:.*\n){0,4}?\s*\*?(?:Sent|Date):\*?\s/im);
  if (start < 0) return null;
  const note = t.slice(0, start).trim();
  const rest = t.slice(start).split("\n");
  let i = marker >= 0 ? 1 : 0;
  const head: Record<string, string> = {};
  // header block: "Key: value" lines (skipping blanks before it), ends at the first blank line after a header was read
  for (; i < rest.length && i < 40; i++) {
    const line = rest[i].replace(/^>\s?/, "").replace(/\*/g, "").trim();
    if (!line) { if (Object.keys(head).length) { i++; break; } continue; }
    const m = line.match(/^(From|Date|Sent|Subject|To|Cc|Reply-To):\s*(.*)$/i);
    if (m) head[m[1].toLowerCase()] = m[2].trim();
    else if (Object.keys(head).length) { const last = Object.keys(head).pop()!; head[last] += ` ${line}`; } // wrapped value
  }
  const from = head.from ?? "";
  const email = from.match(EMAIL)?.[0]?.toLowerCase();
  if (!email) return null;
  let name: string | null = from.replace(/<[^>]*>/, "").replace(EMAIL, "").replace(/["'[\]()]/g, "").replace(/\bmailto:\S*/i, "").trim() || null;
  if (name && name.toLowerCase() === email) name = null;
  const body = rest.slice(i).join("\n").replace(/^>\s?/gm, "").trim();
  const subj = head.subject?.trim() || (subject ?? "").replace(/^\s*((fw|fwd)\s*:\s*)+/i, "").trim() || null;
  return { fromName: name, fromEmail: email, subject: subj, date: (head.date ?? head.sent ?? "").trim() || null, body, note };
}
