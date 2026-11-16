/**
 * Dates typed the quick way: "30/11", "30/1", "30-11", "30 Nov", "Mon 30th November", "30/11/26", "30/11/2026", "2026-11-30".
 * With no year, it's this year — unless the month is earlier than this month, which means next year
 * (in November, "30/1" is 30 January next year). A year typed in always wins.
 */
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const pad = (n: number) => String(n).padStart(2, "0");

/** The year for a day and month with no year given, from today (YYYY-MM-DD). */
export function smartYear(month: number, today: string): number {
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
  return month < m ? y + 1 : y;
}

/** Parse what was typed into YYYY-MM-DD, or null if it isn't a real date. */
export function resolveDate(text: string, today: string): string | null {
  const s = String(text ?? "").trim().toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, "$1").replace(/^(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*,?\s+/, "");
  if (!s) return null;
  let d: number, m: number, y: number | null = null;
  let r: RegExpExecArray | null;
  if ((r = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s))) { y = +r[1]; m = +r[2]; d = +r[3]; }
  else if ((r = /^(\d{1,2})\s*[/.\-\s]\s*(\d{1,2})(?:\s*[/.\-\s]\s*(\d{2}|\d{4}))?$/.exec(s))) { d = +r[1]; m = +r[2]; if (r[3]) y = r[3].length === 2 ? 2000 + +r[3] : +r[3]; }
  else if ((r = /^(\d{1,2})\s*[\-\s]?\s*([a-z]{3,9})\.?,?(?:\s*[\-\s]?\s*(\d{2}|\d{4}))?$/.exec(s))) {
    const mi = MONTHS.indexOf(r[2].slice(0, 3)); if (mi < 0) return null;
    d = +r[1]; m = mi + 1; if (r[3]) y = r[3].length === 2 ? 2000 + +r[3] : +r[3];
  } else return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const year = y ?? smartYear(m, today);
  const dt = new Date(Date.UTC(year, m - 1, d));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null; // 31/2 etc.
  return `${year}-${pad(m)}-${pad(d)}`;
}

/** YYYY-MM-DD → "30/11/2026" for the box. */
export const showDMY = (iso: string | null | undefined) => {
  const r = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  return r ? `${Number(r[3])}/${Number(r[2])}/${r[1]}` : "";
};
