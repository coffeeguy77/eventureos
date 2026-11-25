import "server-only";
import { stripQuoted, localDate } from "@/lib/ai/classify";
import { parseJSONObject } from "@/lib/ai/claude";
import { callClaudeRaw } from "@/lib/ai/reply";
import { resolveDate } from "@/lib/dates/smart";

/** The number of serves quoted when the customer doesn't say (they can change it on their quote). */
export const DEFAULT_SERVES = 100;

export interface AutoJob {
  packageName: string | null;
  date: string | null;       // YYYY-MM-DD
  start: string | null;      // HH:MM
  end: string | null;
  serves: number | null;     // null = they didn't say
  staff: number | null;
  /** Every day they want service, in date order (two or more for a multi-day job; one otherwise) */
  days: { date: string; start: string | null; end: string | null }[];
  /** Exact price-list names of add-ons they asked for (e.g. branding) — only what they asked for */
  extras: string[];
  notes: string[];
}

const clip = (s: string | null | undefined, n: number) => { const t = stripQuoted(s ?? "").replace(/\n{3,}/g, "\n\n").trim(); return t.length > n ? t.slice(0, n) + "…" : t; };
const hhmm = (v: unknown) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(v ?? "").trim()); return m && +m[1] < 24 && +m[2] < 60 ? `${m[1].padStart(2, "0")}:${m[2]}` : null; };

/**
 * Read the job from the customer's emails: which package, the day, service times, how many serves.
 * The model only reads; prices always come from the price list. Anything not stated comes back null.
 */
export async function readJobFromEmails(key: string | null, org: { name: string; timezone: string }, today: string,
  messages: { direction: string; from: string; at: string; body: string | null }[], packages: { name: string; summary: string | null }[],
  addons: { name: string; category: string | null; description: string | null }[] = []): Promise<AutoJob> {
  const convo = messages.slice(-10).map((m) => `--- ${m.direction === "inbound" ? `FROM ${m.from}` : `FROM US (${org.name})`} · ${localDate(m.at, org.timezone)}\n${clip(m.body, 3000)}`).join("\n\n");
  const system = `You read customer emails for ${org.name}, an Australian event-services business, and pull out the job details for a quote.
Only use what the customer actually said. Never invent numbers. If something isn't stated, use null.
- package: the ONE best-fitting package from this list (exact name), or null: ${packages.map((p) => `"${p.name}"${p.summary ? ` (${p.summary})` : ""}`).join(", ") || "none"}
- days: EVERY day they want service, one entry per day, in date order. "Wed 2 - Thu 3 December" or "2-3 Dec" or "a 2 day conference on the 2nd and 3rd" is TWO entries; "Mon 7 to Fri 11" is five. Each: {"date":"DD/MM" (or "DD/MM/YYYY" only if they wrote the year),"start":"HH:MM"|null,"end":"HH:MM"|null}. Times are 24-hour ("9am - noon" → "09:00" / "12:00"; "about 9am" → "09:00"); "8am-4pm x 2 days" means those times on each day. [] if no day is given.
- serves: how many coffees/drinks they want in total, or the number of people (one drink each) if that's all they gave; null if neither
- extras: add-ons they asked for or asked about (even "if possible" or "potentially"), using the exact name from this list only, else []: ${addons.map((a) => `"${a.name}"${a.description ? ` (${a.description.slice(0, 90)})` : ""}`).join(", ") || "none"}
  Don't add something they said they'll supply themselves (e.g. they bring their own cups).
- staff: number of baristas/staff only if they asked for a number
- notes: short notes for the person quoting (assumptions, anything unclear, extra requests such as branding, things they'll supply themselves, questions they asked) — at most 5
Reply with ONLY JSON: {"package":string|null,"days":[{"date":string,"start":string|null,"end":string|null}],"serves":number|null,"staff":number|null,"extras":[string],"notes":[string]}`;
  const user = `TODAY: ${localDate(new Date().toISOString(), org.timezone)}\n\nEMAILS (oldest first):\n${convo}`;
  const raw = await callClaudeRaw(key, system, user, 900, 40000);
  const o = parseJSONObject(raw);
  const n = (v: unknown, max: number) => { const x = Number(v); return v != null && Number.isFinite(x) && x > 0 ? Math.min(max, Math.round(x)) : null; };
  // Days: resolved, one per date, in order (older single-date answers still read)
  const rawDays: unknown[] = Array.isArray(o.days) ? o.days : o.date ? [{ date: o.date, start: o.start, end: o.end }] : [];
  const seen = new Set<string>();
  const days = rawDays.map((x) => (x ?? {}) as Record<string, unknown>)
    .map((x) => ({ date: typeof x.date === "string" ? resolveDate(x.date, today) : null, start: hhmm(x.start), end: hhmm(x.end) }))
    .filter((d): d is { date: string; start: string | null; end: string | null } => !!d.date && !seen.has(d.date) && !!seen.add(d.date))
    .sort((a, b) => a.date.localeCompare(b.date)).slice(0, 31);
  const names = new Map(addons.map((a) => [a.name.toLowerCase(), a.name]));
  const extras = Array.isArray(o.extras) ? [...new Set(o.extras.filter((x): x is string => typeof x === "string").map((x) => names.get(x.trim().toLowerCase())).filter((x): x is string => !!x))].slice(0, 6) : [];
  return {
    packageName: typeof o.package === "string" && o.package.trim() ? o.package.trim() : null,
    date: days[0]?.date ?? null, start: days[0]?.start ?? null, end: days[0]?.end ?? null,
    serves: n(o.serves, 100_000), staff: n(o.staff, 20), days, extras,
    notes: Array.isArray(o.notes) ? o.notes.filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 300)).slice(0, 5) : [],
  };
}
