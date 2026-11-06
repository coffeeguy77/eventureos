/**
 * Reading a calendar entry to invoice what was done: the notes as plain text, the details people usually type in
 * (phone, coffees, setup and service times), and a best name for each invited email. Pure; nothing is guessed beyond
 * what's written — anything not found comes back null.
 */

export function plainText(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|h\d)>/gi, "\n").replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
    .slice(0, 6000);
}

/** "7:00am", "7.00am", "7am", "14:30" → "07:00" / "14:30" */
export function toTime(s: string): string | null {
  const m = s.trim().toLowerCase().match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (m[3] === "pm" && h < 12) h += 12;
  if (m[3] === "am" && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

const T = String.raw`(\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)?)`;

export interface NoteDetails { phones: string[]; coffees: number | null; setup: string | null; serviceStart: string | null; serviceFinish: string | null }

export function readNotes(text: string): NoteDetails {
  const phones = [...new Set((text.match(/(?:\+?61\s?|0)[2-478](?:[\s-]?\d){8}/g) ?? []).map((p) => p.replace(/[\s-]/g, "")))].slice(0, 5);
  const cm = text.match(/(\d{2,5})\s*(?:x\s*)?(?:coffees?|hot drinks?|cups?)\b/i);
  const sm = text.match(new RegExp(String.raw`set\s*-?\s*up[:\s]*(?:from\s*|at\s*)?${T}`, "i"));
  const vm = text.match(new RegExp(String.raw`service[:\s]*(?:from\s*)?${T}\s*(?:-|–|to|until|till)\s*${T}`, "i"));
  const start = vm ? toTime(vm[1]) : null;
  let finish = vm ? toTime(vm[2]) : null;
  // "Service 8 - 3" → the finish is in the afternoon
  if (start && finish && finish <= start && Number(finish.slice(0, 2)) < 12) finish = `${String(Number(finish.slice(0, 2)) + 12).padStart(2, "0")}${finish.slice(2)}`;
  if (start && finish && finish <= start) finish = null;
  return { phones, coffees: cm ? Number(cm[1]) : null, setup: sm ? toTime(sm[1]) : null, serviceStart: start, serviceFinish: finish };
}

/** "debbie.kaczor@act.gov.au" → "Debbie Kaczor"; role inboxes ("accounts@…") give null. */
export function nameFromEmail(email: string): string | null {
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  if (!local || /^(info|admin|accounts?|bookings?|events?|functions?|sales|hello|contact|reception|office|enquiries|noreply|no-reply|team|support)\d*$/.test(local)) return null;
  const parts = local.replace(/\d+/g, "").split(/[._-]+/).filter((p) => p.length > 1);
  if (!parts.length || parts.length > 3) return null;
  return parts.map((p) => p[0].toUpperCase() + p.slice(1)).join(" ");
}

const FREE = /^(gmail|googlemail|hotmail|outlook|live|yahoo|icloud|me|bigpond|optusnet|internode|iinet|tpg)\./i;
/** A company name from an email domain, when it's a company's own domain: "kellie.keys@afp.gov.au" → null (government), "x@npc.org.au" → null — only clear cases. */
export const isPersonalDomain = (email: string) => FREE.test(email.split("@")[1] ?? "");
