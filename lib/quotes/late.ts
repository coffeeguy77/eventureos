/**
 * Quote timing around the event: a quote expires at least 3 days before its event (so there's time to confirm staff
 * and equipment), and an acceptance after the expiry — or inside those 3 days — is "late": availability then has to be
 * confirmed by the business. Pure.
 */
export const LEAD_DAYS = 3;

const add = (iso: string, days: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const diff = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);

/** The default expiry for a new quote: the usual validity, but never later than 3 days before the event (and not before today). */
export function quoteExpiryFor(today: string, eventDate: string | null, validDays = 14): string {
  const usual = add(today, validDays);
  if (!eventDate || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return usual;
  const cutoff = add(eventDate, -LEAD_DAYS);
  const e = usual < cutoff ? usual : cutoff;
  return e < today ? today : e;
}

/** Accepted after the expiry date, or less than 3 days before the event. */
export function isLateAcceptance(today: string, expiry: string | null, eventDate: string | null): boolean {
  return (!!expiry && today > expiry) || (!!eventDate && diff(today, eventDate) < LEAD_DAYS);
}

/** Can the customer still accept? Before expiry — or after it, while the event is still to come (then it's late). */
export function canStillAccept(today: string, expiry: string | null, eventDate: string | null): boolean {
  if (!expiry || expiry >= today) return true;
  return !!eventDate && eventDate >= today;
}
