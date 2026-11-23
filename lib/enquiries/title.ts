/**
 * The title an enquiry (and the job and quote made from it) gets: what they're hiring, then who the business is —
 * "Coffee Van | Canberra Girls Grammar" — not the person who emailed or the kind of event.
 * What can be hired comes from the business's own packages (their calendar labels), so nothing is hard-coded.
 * Pure — tested with `npx tsx`.
 */

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const GENERIC = /^(hire|rate|only|event|package|service|services|the|and)$/i;

/** The words that mean a label in an email: the whole label ("Coffee Van"), the label without "Hire", and its last distinctive word ("van"). */
function patterns(label: string): RegExp[] {
  const words = label.replace(/[—–-]/g, " ").split(/\s+/).filter(Boolean);
  const core = words.filter((w) => !GENERIC.test(w));
  const out = [words, core].filter((w) => w.length).map((w) => new RegExp(`\\b${w.map(esc).join("\\s*")}s?\\b`, "i"));
  const last = core[core.length - 1];
  if (last && core.length > 1 && last.length >= 3) out.push(new RegExp(`\\b${esc(last)}s?\\b`, "i"));
  return out;
}

/** Which of the business's hire labels the email asks for — the one mentioned first (subject before body). Null when none is. */
export function hiringFrom(texts: (string | null | undefined)[], labels: string[]): string | null {
  const uniq = [...new Set(labels.map((l) => l.trim()).filter(Boolean))];
  for (const text of texts) {
    if (!text) continue;
    let best: { label: string; at: number; strength: number } | null = null;
    for (const label of uniq) {
      patterns(label).forEach((re, strength) => {
        const m = re.exec(text);
        if (!m) return;
        // earliest mention wins; for the same spot, the fuller match (whole label) wins
        if (!best || m.index < best.at || (m.index === best.at && strength < best.strength)) best = { label, at: m.index, strength };
      });
    }
    if (best) return (best as { label: string }).label;
  }
  return null;
}

const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim().replace(/[.,;:]+$/, "") || null;
const tidy = (s: string) => (s === s.toLowerCase() ? s.replace(/\b\p{L}/gu, (c) => c.toUpperCase()) : s);

/**
 * "Coffee Van | Canberra Girls Grammar". Who: the business (from the email, else the client it matched), else the
 * occasion or venue for a private booking, and only then the person's name.
 */
export function enquiryTitle(i: { hiring: string | null; company?: string | null; customer?: { name: string; kind: string } | null; venue?: string | null; eventType?: string | null; person?: string | null }) {
  const business = clean(i.company) ?? (i.customer?.kind === "company" ? clean(i.customer.name) : null);
  const who = business ?? clean(i.venue) ?? clean(i.person) ?? clean(i.customer?.name);
  const what = i.hiring ? tidy(i.hiring) : clean(i.eventType) ? `${clean(i.eventType)} enquiry` : "Enquiry";
  return (who ? `${what} | ${who}` : what).slice(0, 200);
}
