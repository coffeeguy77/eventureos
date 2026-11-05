/**
 * Jobs the accounts team can hand to Nerd Herd from a customer in Accounts (they don't need Nerd Herd access).
 * Each becomes a Nerd Herd ticket on that customer. Pure — used by the form, the server and tests.
 */
export const NERD_JOBS = [
  { key: "delete_site", label: "Delete website", kind: "hosting", site: true, reasons: ["Client has gone / business closed", "Moved to another provider", "Not paying — final", "Client asked us to", "Other"] },
  { key: "suspend_site", label: "Suspend website (not paying)", kind: "hosting", site: true, reasons: ["Overdue — not paying", "No response to chasing", "Client asked us to", "Other"] },
  { key: "other", label: "Something else", kind: "support", site: false, reasons: [] },
] as const;
export type NerdJobKey = (typeof NERD_JOBS)[number]["key"];
export const nerdJob = (k: unknown) => NERD_JOBS.find((j) => j.key === k) ?? null;

/** "https://www.Example.com.au/path" → "example.com.au"; leaves free text (no domain in it) as typed. */
export function cleanSite(v: string): string {
  const s = v.trim().slice(0, 200);
  const m = s.match(/^(?:https?:\/\/)?(?:www\.)?([a-z0-9.-]+\.[a-z]{2,})(?:[/:?#].*)?$/i);
  return m ? m[1].toLowerCase() : s;
}

/** The ticket's subject and internal note. */
export function nerdJobTicket(i: { job: NerdJobKey; site: string; reason: string; note: string; title: string; by: string; customer: string }) {
  const j = nerdJob(i.job)!;
  const site = j.site ? cleanSite(i.site) : "";
  const subject = (j.key === "other" ? i.title.trim() : `${j.label}: ${site || i.customer}`).slice(0, 300);
  const lines = [
    `${j.key === "other" ? "Job" : j.label} — raised by ${i.by} from Accounts for ${i.customer}.`,
    site ? `Website: ${site}` : "",
    i.reason ? `Reason: ${i.reason}` : "",
    i.note.trim() ? `Notes: ${i.note.trim()}` : "",
  ].filter(Boolean);
  return { subject, note: lines.join("\n"), site };
}
