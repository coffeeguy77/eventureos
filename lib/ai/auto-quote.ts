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
  notes: string[];
}

const clip = (s: string | null | undefined, n: number) => { const t = stripQuoted(s ?? "").replace(/\n{3,}/g, "\n\n").trim(); return t.length > n ? t.slice(0, n) + "…" : t; };
const hhmm = (v: unknown) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(v ?? "").trim()); return m && +m[1] < 24 && +m[2] < 60 ? `${m[1].padStart(2, "0")}:${m[2]}` : null; };

/**
 * Read the job from the customer's emails: which package, the day, service times, how many serves.
 * The model only reads; prices always come from the price list. Anything not stated comes back null.
 */
export async function readJobFromEmails(key: string | null, org: { name: string; timezone: string }, today: string,
  messages: { direction: string; from: string; at: string; body: string | null }[], packages: { name: string; summary: string | null }[]): Promise<AutoJob> {
  const convo = messages.slice(-10).map((m) => `--- ${m.direction === "inbound" ? `FROM ${m.from}` : `FROM US (${org.name})`} · ${localDate(m.at, org.timezone)}\n${clip(m.body, 3000)}`).join("\n\n");
  const system = `You read customer emails for ${org.name}, an Australian event-services business, and pull out the job details for a quote.
Only use what the customer actually said. Never invent numbers. If something isn't stated, use null.
- package: the ONE best-fitting package from this list (exact name), or null: ${packages.map((p) => `"${p.name}"${p.summary ? ` (${p.summary})` : ""}`).join(", ") || "none"}
- date: the day of the event exactly as written, as "DD/MM" (or "DD/MM/YYYY" only if they wrote the year)
- start / end: the service times in 24-hour "HH:MM" ("9am - noon" → "09:00" / "12:00"; "about 9am" → "09:00")
- serves: how many coffees/drinks they want, or the number of people (one drink each) if that's all they gave; null if neither
- staff: number of baristas/staff only if they asked for a number
- notes: short notes for the person quoting (assumptions, anything unclear, extra requests) — at most 4
Reply with ONLY JSON: {"package":string|null,"date":string|null,"start":string|null,"end":string|null,"serves":number|null,"staff":number|null,"notes":[string]}`;
  const user = `TODAY: ${localDate(new Date().toISOString(), org.timezone)}\n\nEMAILS (oldest first):\n${convo}`;
  const raw = await callClaudeRaw(key, system, user, 600, 40000);
  const o = parseJSONObject(raw);
  const n = (v: unknown, max: number) => { const x = Number(v); return v != null && Number.isFinite(x) && x > 0 ? Math.min(max, Math.round(x)) : null; };
  return {
    packageName: typeof o.package === "string" && o.package.trim() ? o.package.trim() : null,
    date: typeof o.date === "string" ? resolveDate(o.date, today) : null,
    start: hhmm(o.start), end: hhmm(o.end),
    serves: n(o.serves, 100_000), staff: n(o.staff, 20),
    notes: Array.isArray(o.notes) ? o.notes.filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 300)).slice(0, 4) : [],
  };
}
