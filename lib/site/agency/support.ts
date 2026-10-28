/**
 * Agency website (pure): is a business an IT/web agency (has Nerd Herd), checking a public support request, the text
 * a new ticket is filed with, matching a typed web address to a site we look after, and the message a quote request
 * lands in the office with. No database access here, so it can be tested and used on server and client.
 */

/** "Agency mode": the business has the Nerd Herd app (tickets, websites, maintenance plans). */
export function isAgencyAccess(appAccess: unknown): boolean {
  return Array.isArray(appAccess) && appAccess.includes("nerdherd");
}

const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export interface SupportInput { name: string; email: string; phone: string; website: string; subject: string; details: string }

/** Plain-English check of the "Lodge a support request" form. */
export function checkSupport(f: Record<string, unknown>): { ok: true; value: SupportInput } | { ok: false; error: string } {
  const v: SupportInput = {
    name: str(f.name, 160), email: str(f.email, 254).toLowerCase(), phone: str(f.phone, 40),
    website: str(f.site, 200), subject: str(f.subject, 200).replace(/\s+/g, " "), details: str(f.details, 8000),
  };
  if (v.name.length < 2) return { ok: false, error: "Add your name so we know who we're helping." };
  if (!EMAIL_RE.test(v.email)) return { ok: false, error: "Add a valid email address — that's where we'll send updates." };
  if (v.subject.length < 3) return { ok: false, error: "Add a short subject, e.g. \"Contact form not sending\"." };
  if (v.details.length < 10) return { ok: false, error: "Tell us a bit more about the problem — what's happening, and where." };
  if (v.phone && !/^[\d\s()+-]{6,40}$/.test(v.phone)) return { ok: false, error: "That phone number doesn't look right — use digits only, or leave it blank." };
  if (v.website && !domainOf(v.website)) return { ok: false, error: "That website address doesn't look right — e.g. example.com.au, or leave it blank." };
  return { ok: true, value: v };
}

/** "https://www.Example.com.au/contact" → "example.com.au"; null when it isn't a web address. */
export function domainOf(raw: string | null | undefined): string | null {
  let s = (raw ?? "").trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^[a-z]+:\/\//, "").split(/[/?#]/)[0].replace(/:\d+$/, "").replace(/\.$/, "").replace(/^www\./, "");
  return /^([a-z0-9-]+\.)+[a-z]{2,}$/.test(s) ? s : null;
}

/** The ticket's description: what they wrote, then who they are. */
export function ticketDescription(v: SupportInput): string {
  return [
    v.details, "",
    `Name: ${v.name}`,
    `Email: ${v.email}`,
    v.phone ? `Phone: ${v.phone}` : null,
    v.website ? `Website: ${v.website}` : null,
    "Lodged from the website support form.",
  ].filter((x) => x !== null).join("\n");
}

/** Escape a value for a Postgres LIKE / ILIKE pattern (so "a_b%" matches only itself). */
export const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Quote request → the message the enquiry is filed with (every answer, so nothing is lost). */
export function quoteMessage(f: { services?: string[]; budget?: string; timeframe?: string; currentSite?: string; message?: string; heardFrom?: string }): string {
  const lines = [
    f.services?.length ? `Interested in: ${f.services.join(", ")}` : null,
    f.budget ? `Budget: ${f.budget}` : null,
    f.timeframe ? `Timeframe: ${f.timeframe}` : null,
    f.currentSite ? `Current website: ${f.currentSite}` : null,
    f.heardFrom ? `Heard about us: ${f.heardFrom}` : null,
  ].filter(Boolean) as string[];
  const msg = (f.message ?? "").trim();
  return [msg, lines.length ? (msg ? "\n" : "") + lines.join("\n") : ""].filter(Boolean).join("\n").slice(0, 4000);
}
