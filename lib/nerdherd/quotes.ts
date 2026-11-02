/**
 * Ticket quotes (pure): price from hours, the traffic light, and what the client is allowed to see.
 * Hours, rate and Claude's suggestion are internal — the client sees the description, task names and the price only.
 */
export type QuoteStatus = "draft" | "sent" | "accepted" | "paid" | "completed" | "declined" | "cancelled";
export const QUOTE_STATUSES: QuoteStatus[] = ["draft", "sent", "accepted", "paid", "completed", "declined", "cancelled"];

/** Price inc GST for hours × hourly rate (ex GST), rounded to the cent. Hours round up to the quarter hour. */
export function priceFor(hours: number, rateExGst: number): { hours: number; exGst: number; gst: number; incGst: number } {
  const h = Math.max(0, Math.ceil((Number(hours) || 0) * 4 - 1e-9) / 4);
  const ex = Math.round(h * Math.max(0, Number(rateExGst) || 0) * 100) / 100;
  const inc = Math.round(ex * 1.1 * 100) / 100;
  return { hours: h, exGst: ex, gst: Math.round((inc - ex) * 100) / 100, incGst: inc };
}

/** GST split of an inc-GST amount (for the invoice). */
export function splitInc(inc: number) {
  const total = Math.round((Number(inc) || 0) * 100) / 100;
  const sub = Math.round((total / 1.1) * 100) / 100;
  return { subtotal: sub, tax: Math.round((total - sub) * 100) / 100, total };
}

export type Light = "grey" | "amber" | "red" | "green" | "done" | "off";
/** The light for a quote: red = not paid yet (we don't start), green = paid, ready to do. */
export function quoteLight(status: QuoteStatus): { light: Light; label: string; client: string } {
  switch (status) {
    case "draft": return { light: "grey", label: "Draft — not sent", client: "" };
    case "sent": return { light: "red", label: "Sent — waiting for the client to accept and pay", client: "Waiting for your approval" };
    case "accepted": return { light: "red", label: "Accepted — not paid yet (don't start)", client: "Accepted — payment needed before we start" };
    case "paid": return { light: "green", label: "Paid — ready to do", client: "Paid — we're on it" };
    case "completed": return { light: "done", label: "Completed", client: "Completed" };
    case "declined": return { light: "off", label: "Declined", client: "Declined" };
    case "cancelled": return { light: "off", label: "Cancelled", client: "Cancelled" };
  }
}

export interface TaskLike { label: string; hours: number; done_at: string | null }
export function progress(tasks: TaskLike[]) {
  const done = tasks.filter((t) => t.done_at).length;
  return { done, total: tasks.length, all: tasks.length > 0 && done === tasks.length };
}

/** Clean the tasks typed in the editor (or suggested by Claude). */
export function cleanTasks(list: unknown): { label: string; hours: number }[] {
  if (!Array.isArray(list)) return [];
  return list.flatMap((x) => {
    const r = (x ?? {}) as { label?: unknown; hours?: unknown };
    const label = typeof r.label === "string" ? r.label.trim().slice(0, 300) : "";
    const hours = Math.max(0, Math.min(500, Math.round((Number(r.hours) || 0) * 100) / 100));
    return label ? [{ label, hours }] : [];
  }).slice(0, 40);
}

export const sumHours = (tasks: { hours: number }[]) => Math.round(tasks.reduce((a, t) => a + (Number(t.hours) || 0), 0) * 100) / 100;

/** The message that goes with a quote (the staff can change it before it's sent). */
export function quoteMessage(o: { first: string | null; kind: "quote" | "variation"; seq: number; title: string; number: number; nudge: boolean; sender: string }) {
  const hi = `Hi ${o.first || "there"},`;
  const what = o.kind === "variation" ? `a variation for the extra work on ticket #${o.number}` : `a quote for ticket #${o.number}`;
  return o.nudge
    ? `${hi}\n\nJust a friendly reminder about ${what} — “${o.title}”. Once it's accepted and paid we'll get started straight away.\n\nYou can view it, accept and pay here:`
    : `${hi}\n\nHere's ${what} — “${o.title}”.\n\nWe start as soon as it's accepted and paid, and you can follow the progress on the same page:`;
}
