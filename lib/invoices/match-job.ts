/**
 * Which job an invoice raised in Xero is for. Old invoices name the event date in their lines
 * ("Stromlo Forest Anglican College on Saturday 7 November 10am-1pm"), so that's the strongest clue.
 * Pure — used by the Xero sync (auto-link) and the job's Invoices tab (suggestions).
 */
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** Does this text name the given date (YYYY-MM-DD)? "7 November", "Nov 7th", "7/11", "07/11/2026", "2026-11-07". */
export function mentionsDate(text: string | null | undefined, iso: string): boolean {
  if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const t = text.toLowerCase().replace(/\s+/g, " ");
  const [y, m, d] = iso.split("-").map(Number);
  const month = MONTHS[m - 1], mon = month.slice(0, 3);
  const day = `0?${d}(?:st|nd|rd|th)?`;
  const yr = `(?:,? ?(?:${y}|'?${String(y).slice(2)}))?`;
  const monthRe = `(?:${month}|${mon}\\.?)`;
  const patterns = [
    `(?<![\\d/])${day} (?:of )?${monthRe}(?![a-z])${yr}`,          // 7 November / 7th of Nov 2026
    `(?<![a-z])${monthRe} ${day}(?![\\d/])${yr}`,                   // November 7 / Nov 7th
    `(?<![\\d/.])0?${d}[/.-]0?${m}(?:[/.-](?:${y}|${String(y).slice(2)}))?(?![\\d/.])`, // 7/11, 07/11/2026, 7.11.26
    `${y}-0?${m}-0?${d}(?!\\d)`,                                     // 2026-11-07
  ];
  return patterns.some((p) => new RegExp(p).test(t));
}

export interface InvoiceForMatch { id: string; customer_id: string; issue_date: string | null; line_items: { description?: string | null }[] | null; reference: string | null }
export interface JobForMatch { id: string; customer_id: string; event_date: string | null }

const invoiceText = (i: InvoiceForMatch) => [i.reference, ...(i.line_items ?? []).map((l) => l.description)].filter(Boolean).join("\n");

/** The one job (same client) whose date the invoice names — or null if none or more than one. */
export function matchInvoiceToJob(inv: InvoiceForMatch, jobs: JobForMatch[]): string | null {
  const text = invoiceText(inv);
  const hits = jobs.filter((j) => j.customer_id === inv.customer_id && j.event_date && mentionsDate(text, j.event_date));
  return hits.length === 1 ? hits[0].id : null;
}

/** For a job's Invoices tab: the client's unlinked invoices, those naming the job's date first. */
export function rankForJob(job: JobForMatch, invoices: InvoiceForMatch[]): { id: string; namesDate: boolean }[] {
  return invoices
    .filter((i) => i.customer_id === job.customer_id)
    .map((i) => ({ id: i.id, namesDate: !!job.event_date && mentionsDate(invoiceText(i), job.event_date), issued: i.issue_date ?? "" }))
    .sort((a, b) => Number(b.namesDate) - Number(a.namesDate) || b.issued.localeCompare(a.issued))
    .map(({ id, namesDate }) => ({ id, namesDate }));
}
