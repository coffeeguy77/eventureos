export const STATUS_LABEL: Record<string, string> = {
  invited: "Link sent", in_progress: "Filling in", submitted: "Sent to you", reviewing: "Reviewing", lodged: "Lodged with lender",
  approved: "Approved", settled: "Settled", closed: "Closed",
};
export const STATUS_ORDER = ["invited", "in_progress", "submitted", "reviewing", "lodged", "approved", "settled", "closed"];
export function statusTone(s: string) {
  if (s === "submitted") return "bg-brand-50 text-brand-800 ring-brand-200";
  if (s === "approved" || s === "settled") return "bg-emerald-50 text-emerald-800 ring-emerald-200";
  if (s === "closed") return "bg-canvas text-ink-faint ring-line";
  if (s === "in_progress") return "bg-amber-50 text-amber-900 ring-amber-200";
  return "bg-canvas text-ink-muted ring-line";
}
