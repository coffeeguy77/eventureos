/**
 * Mailbox rules (pure): for the second Gmail account, only emails matching a rule come in — each becomes an enquiry
 * with the rule's tag. A rule is a Gmail search, written like a Gmail filter: words, "exact phrases", from:, subject:, OR, -word.
 */
export interface MailRule { id: string; name: string; query: string; tag: string | null; on: boolean; since: string }

export const cleanTag = (v: unknown) => (typeof v === "string" ? v.replace(/[^\p{L}\p{N} &'/+-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 40) : "");

export function cleanTags(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : [];
  const out: string[] = [];
  for (const t of list.map(cleanTag)) if (t && !out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
  return out.slice(0, 12);
}

/** A Gmail search a person typed: one line, no characters that would break out of the query. */
export function cleanQuery(v: unknown): string {
  return typeof v === "string" ? v.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 300) : "";
}

export function cleanRules(raw: unknown, today: string): MailRule[] {
  if (!Array.isArray(raw)) return [];
  const out: MailRule[] = [];
  for (const r of raw.slice(0, 20)) {
    const o = (r ?? {}) as Record<string, unknown>;
    const query = cleanQuery(o.query);
    if (!query) continue;
    const id = typeof o.id === "string" && /^[a-z0-9]{4,20}$/.test(o.id) ? o.id : Math.random().toString(36).slice(2, 10);
    const since = typeof o.since === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.since) && o.since <= today ? o.since : today;
    out.push({ id, name: (typeof o.name === "string" ? o.name.trim().slice(0, 60) : "") || query.slice(0, 40), query, tag: cleanTag(o.tag) || null, on: o.on !== false, since });
  }
  return out;
}

/** The search Gmail runs for a rule: the person's words, received mail only, from a date. */
export function ruleSearch(query: string, after: string) {
  return `(${query}) after:${after.replace(/-/g, "/")} -in:sent -in:drafts -in:chats -in:spam -in:trash`;
}
