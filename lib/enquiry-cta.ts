/**
 * What an enquiry's main button does: turn it into an event (job), or into a support ticket (Nerd Herd).
 * organisations.settings.enquiry_cta = "event" | "ticket"; settings.uses_events = false for businesses that don't run events.
 * "Event" can't be chosen when the business doesn't use events; "Ticket" can't be chosen without Nerd Herd.
 */
export type EnquiryCta = "event" | "ticket" | null;

export function readEnquiryCta(settings: unknown, nerdOn: boolean): { cta: EnquiryCta; usesEvents: boolean; canEvent: boolean; canTicket: boolean } {
  const s = (settings ?? {}) as { enquiry_cta?: unknown; uses_events?: unknown };
  const usesEvents = s.uses_events !== false;
  const canEvent = usesEvents, canTicket = nerdOn;
  const want = s.enquiry_cta === "ticket" ? "ticket" : s.enquiry_cta === "event" ? "event" : null;
  const cta: EnquiryCta = want === "ticket" && canTicket ? "ticket" : want === "event" && canEvent ? "event" : canEvent ? "event" : canTicket ? "ticket" : null;
  return { cta, usesEvents, canEvent, canTicket };
}
