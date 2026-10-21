/**
 * ClassBento's "New booking" emails (from hi@classbento.com.au), read into bookings. Pure — no database.
 *
 * Subject: "🎉 New booking for Home Barista Class - Sat 24 Oct at 2:30pm, from Christopher P Cardona"
 * Body (text):
 *   Home Barista Class
 *   Sat 24 Oct 2026, 2:30pm - 4:30pm
 *   Bean Culture Coffee Roasters, Vicars Street, Mitchell ACT
 *   Christopher P Cardona                                   ← or "Elijah Henderson (gifted to this person, booked by Christine Henderson) (2 guests)"
 *   name@example.com • +61400000000                          ← the purchaser's email for a gift
 *   You'll be paid: $136, on 26 Oct 2026 [From ClassBento's website (marketplace)]
 *   Order (item) number: 9TDUA
 */

export interface ClassBentoBooking {
  order: string;            // ClassBento's order (item) number — the booking's id
  listing: string;          // ClassBento listing title, e.g. "Home Barista Class"
  date: string;             // YYYY-MM-DD (local)
  start: string;            // HH:MM (24h, local)
  end: string | null;       // HH:MM
  name: string;             // the person coming (the gift receiver for a gift)
  bookedBy: string | null;  // the purchaser, when it's a gift
  email: string | null;
  phone: string | null;
  guests: number;
  payout: number | null;    // what ClassBento pays the business
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const TIME = String.raw`(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?`;

/** "2:30pm" → "14:30" */
export function to24(h: string, m: string | undefined, ap: string) {
  let hh = Number(h) % 12;
  if (ap.toLowerCase() === "p") hh += 12;
  return `${String(hh).padStart(2, "0")}:${(m ?? "00").padStart(2, "0")}`;
}

const SUBJECT = new RegExp(String.raw`New booking for (.+?) - \w{3},? (\d{1,2}) (\w{3})\w* at ${TIME}, from (.+?)\s*$`, "i");

/** Is this a ClassBento "New booking" email? */
export const isClassBentoBooking = (subject: string | null | undefined) => !!subject && SUBJECT.test(subject.trim());

export function parseClassBentoEmail(subject: string, text: string, sentAt?: string): { booking: ClassBentoBooking | null; problem: string | null } {
  const s = SUBJECT.exec(subject.trim());
  if (!s) return { booking: null, problem: "not a ClassBento new-booking email" };
  const body = text.replace(/\r\n/g, "\n").replace(/[ \t ]+/g, " ");
  const listing = s[1].trim();
  const purchaser = s[7].trim();

  // Date and times: the body has the year and end time; the subject is the fallback
  const d = new RegExp(String.raw`\b\w{3},? (\d{1,2}) (\w{3})\w* (\d{4}),?\s*${TIME}\s*[-–]\s*${TIME}`, "i").exec(body);
  const mon = MONTHS.indexOf((d ? d[2] : s[3]).slice(0, 3).toLowerCase());
  if (mon < 0) return { booking: null, problem: "couldn't read the class date" };
  const day = Number(d ? d[1] : s[2]);
  let year = d ? Number(d[3]) : NaN;
  if (!Number.isFinite(year)) {
    // No year in the email: the next time that day comes round from when it was sent
    const sent = sentAt ? new Date(sentAt) : new Date();
    year = sent.getUTCFullYear();
    if (Date.UTC(year, mon, day) < Date.UTC(sent.getUTCFullYear(), sent.getUTCMonth(), sent.getUTCDate()) - 86400e3) year++;
  }
  const date = `${year}-${String(mon + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const start = d ? to24(d[4], d[5], d[6]) : to24(s[4], s[5], s[6]);
  const end = d ? to24(d[7], d[8], d[9]) : null;

  const order = /Order \(item\) number:?\s*([A-Z0-9-]{3,40})/i.exec(body)?.[1]?.toUpperCase() ?? null;
  if (!order) return { booking: null, problem: "no order number in the email" };

  // A gift: "Elijah Henderson (gifted to this person, booked by Christine Henderson)"
  let name = purchaser, bookedBy: string | null = null;
  const g = /([^\n(]+?)\s*\(gifted to this person,? booked by ([^)]+)\)/i.exec(body);
  if (g) {
    let n = g[1].trim();
    // If line breaks were lost, the venue's address runs into the name ("… Mitchell ACT Elijah Henderson")
    if (n.includes(",")) n = n.replace(/^.*\b(ACT|NSW|VIC|QLD|SA|WA|TAS|NT)\s+/, "").replace(/^.*,\s*/, "");
    if (n) { name = n; bookedBy = g[2].trim(); }
  }
  const guests = Math.max(1, Math.min(100, Number(/\((\d{1,3}) guests?\)/i.exec(body)?.[1] ?? 1)));
  const email = (body.match(/[\w.+'-]+@[\w-]+(?:\.[\w-]+)+/g) ?? []).find((e) => !/classbento|sendgrid/i.test(e))?.toLowerCase() ?? null;
  const after = email ? body.slice(body.toLowerCase().indexOf(email)) : body;
  const phone = /(\+?61|0)[\d ]{8,12}\d/.exec(after)?.[0].replace(/\s+/g, "") ?? null;
  const pay = /You(?:'|’)ll be paid:?\s*\$\s*([\d,]+(?:\.\d{1,2})?)/i.exec(body);
  return {
    booking: { order, listing, date, start, end, name: name.slice(0, 160), bookedBy, email, phone, guests, payout: pay ? Number(pay[1].replace(/,/g, "")) : null },
    problem: null,
  };
}
