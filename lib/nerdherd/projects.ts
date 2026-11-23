/**
 * Nerd Herd → Projects (pure): ongoing client work with an evolving bill. Time recorded from AI sessions can carry a
 * margin — the owner's own planning, direction and testing, which the session timestamps don't capture — shown to the
 * client as its own line, never folded into the recorded hours. Used by the office, the client portal and tests.
 */

export type ProjectStatus = "active" | "on_hold" | "complete" | "archived";
export const STATUS_LABEL: Record<ProjectStatus, string> = { active: "In progress", on_hold: "On hold", complete: "Complete", archived: "Archived" };

export interface Phase { name: string; dates: string | null; status: string | null }
export interface ProjectLink { label: string; url: string }
export interface Project {
  id: string; customer_id: string; name: string; status: ProjectStatus; status_note: string | null; summary: string | null; delivered_by: string | null;
  started: string | null; rate: number | null; margin_percent: number; margin_label: string;
  phases: Phase[]; links: ProjectLink[]; open_items: string[]; notes: string | null; staff_notes: string | null; portal: boolean;
}
export interface TimeEntry {
  id: string; work_date: string; start_time: string | null; end_time: string | null; hours: number; work: string;
  kind: "ai" | "staff"; source: string | null; by_name: string | null; billable: boolean; billed_invoice_id: string | null;
}

const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]?\d|2[0-3]):[0-5]\d$/;

export function readPhases(v: unknown): Phase[] {
  return (Array.isArray(v) ? v : []).slice(0, 40).map((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    const name = str(o.name, 200);
    return name ? { name, dates: str(o.dates, 80), status: str(o.status, 80) } : null;
  }).filter((x): x is Phase => !!x);
}
export function readLinks(v: unknown): ProjectLink[] {
  return (Array.isArray(v) ? v : []).slice(0, 30).map((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    const url = str(o.url, 500), label = str(o.label, 120);
    return url && /^https:\/\//.test(url) ? { label: label ?? url.replace(/^https:\/\//, ""), url } : null;
  }).filter((x): x is ProjectLink => !!x);
}
export const readItems = (v: unknown) => (Array.isArray(v) ? v : []).map((x) => str(x, 500)).filter((x): x is string => !!x).slice(0, 60);

export function toProject(r: Record<string, unknown>): Project {
  return {
    id: String(r.id), customer_id: String(r.customer_id), name: String(r.name ?? ""), status: (["active", "on_hold", "complete", "archived"].includes(String(r.status)) ? r.status : "active") as ProjectStatus,
    status_note: str(r.status_note, 500), summary: str(r.summary, 4000), delivered_by: str(r.delivered_by, 120), started: typeof r.started === "string" ? r.started : null,
    rate: r.rate == null ? null : Number(r.rate), margin_percent: Number(r.margin_percent ?? 0), margin_label: str(r.margin_label, 120) ?? "Planning, direction and testing",
    phases: readPhases(r.phases), links: readLinks(r.links), open_items: readItems(r.open_items), notes: str(r.notes, 20000), staff_notes: str(r.staff_notes, 20000), portal: r.portal !== false,
  };
}
export const toEntry = (r: Record<string, unknown>): TimeEntry => ({
  id: String(r.id), work_date: String(r.work_date), start_time: (r.start_time as string | null) ?? null, end_time: (r.end_time as string | null) ?? null,
  hours: Number(r.hours), work: String(r.work ?? ""), kind: r.kind === "ai" ? "ai" : "staff", source: (r.source as string | null) ?? null, by_name: (r.by_name as string | null) ?? null,
  billable: r.billable !== false, billed_invoice_id: (r.billed_invoice_id as string | null) ?? null,
});

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Hours and money for a set of entries: recorded time, the margin on AI time, and what it comes to. */
export function totals(entries: TimeEntry[], marginPercent: number, rateExGst: number) {
  const bill = entries.filter((e) => e.billable);
  const ai = r2(bill.filter((e) => e.kind === "ai").reduce((a, e) => a + e.hours, 0));
  const staff = r2(bill.filter((e) => e.kind === "staff").reduce((a, e) => a + e.hours, 0));
  const margin = r2(ai * (Math.max(0, marginPercent) / 100));
  const hours = r2(ai + staff + margin);
  const exGst = r2(hours * rateExGst);
  return { ai, staff, margin, hours, exGst, incGst: r2(exGst * 1.1), recorded: r2(entries.reduce((a, e) => a + e.hours, 0)) };
}

/** Invoice lines (prices inc GST, like the rest of Nerd Herd) for the unbilled time. */
export function billLines(entries: TimeEntry[], p: Pick<Project, "name" | "margin_percent" | "margin_label">, rateExGst: number, accountCode: string | null) {
  const t = totals(entries, p.margin_percent, rateExGst);
  const dates = entries.map((e) => e.work_date).sort();
  const span = dates.length ? (dates[0] === dates[dates.length - 1] ? fmtShort(dates[0]) : `${fmtShort(dates[0])} – ${fmtShort(dates[dates.length - 1])}`) : "";
  const inc = r2(rateExGst * 1.1);
  const line = (description: string, quantity: number) => ({ description, quantity, unit_amount: inc, tax_rate: 10 as const, item_code: null, account_code: accountCode, inc: true as const, line_amount: r2(quantity * inc) });
  const out = [];
  if (t.ai > 0) out.push(line(`${p.name} — build time (${span})`, t.ai));
  if (t.margin > 0) out.push(line(`${p.name} — ${p.margin_label.toLowerCase()}`, t.margin));
  if (t.staff > 0) out.push(line(`${p.name} — ${t.ai > 0 ? "other " : ""}time (${span})`, t.staff));
  return { lines: out, ...t };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const fmtShort = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };
export const fmtHours = (h: number) => `${Number(h.toFixed(2))} hr${h === 1 ? "" : "s"}`;

/** AI-recorded sources (the margin applies); anything else is someone's own time. */
const AI_SOURCE = /commit|activity|session|ai\b|log/i;

export interface ProjectImport {
  project: Partial<Pick<Project, "name" | "summary" | "delivered_by" | "started" | "status_note">>;
  phases: Phase[]; links: ProjectLink[]; open_items: string[]; notes: string | null;
  time: Omit<TimeEntry, "id" | "billable" | "billed_invoice_id">[];
}

/**
 * Read the structured copy at the end of a project record ({"project", "phases", "time_entries", "links",
 * "open_items", "not_measured"}). Throws a plain-English message when it can't.
 */
export function parseImport(text: string): ProjectImport {
  const m = /\{[\s\S]*\}/.exec(text.trim());
  if (!m) throw new Error("Paste the JSON block from the project record (it starts with { and ends with }).");
  let j: Record<string, unknown>;
  try { j = JSON.parse(m[0]) as Record<string, unknown>; } catch { throw new Error("That isn't valid JSON — copy the whole block, from the first { to the last }."); }
  const pr = (j.project ?? {}) as Record<string, unknown>;
  const time = (Array.isArray(j.time_entries) ? j.time_entries : []).slice(0, 500).map((x, i) => {
    const o = (x ?? {}) as Record<string, unknown>;
    const date = String(o.date ?? o.work_date ?? "");
    const hours = Number(o.hours);
    const work = str(o.work, 2000);
    if (!ISO.test(date) || !(hours > 0 && hours <= 24) || !work) throw new Error(`Time entry ${i + 1} needs a date (YYYY-MM-DD), hours (0–24) and what was done.`);
    const source = str(o.source, 60);
    const kind: "ai" | "staff" = o.kind === "staff" ? "staff" : o.kind === "ai" || (source && AI_SOURCE.test(source)) ? "ai" : "staff";
    const t = (v: unknown) => (typeof v === "string" && TIME.test(v) ? v.padStart(5, "0") : null);
    return { work_date: date, start_time: t(o.start), end_time: t(o.end), hours: r2(hours), work, kind, source, by_name: str(o.by, 80) };
  });
  const not = readItems(j.not_measured);
  const status = str(pr.status, 500);
  return {
    project: { name: str(pr.name, 200) ?? undefined, summary: str(pr.summary, 4000) ?? undefined, delivered_by: str(pr.delivered_by, 120) ?? undefined,
      started: typeof pr.started === "string" && ISO.test(pr.started) ? pr.started : undefined, status_note: status ?? undefined },
    phases: readPhases(j.phases), links: readLinks(j.links), open_items: readItems(j.open_items),
    notes: not.length ? `Not included in the recorded hours:\n${not.map((n) => `• ${n}`).join("\n")}` : null,
    time,
  };
}

/** Entries already on the project (same date, start and hours) are skipped, so a record can be pasted again after more work. */
export const entryKey = (e: { work_date: string; start_time: string | null; hours: number }) => `${e.work_date}|${e.start_time ?? ""}|${Number(e.hours).toFixed(2)}`;
