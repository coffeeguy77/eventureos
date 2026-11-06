import { shell, type Brand } from "@/lib/bookings/emails";

/** Cart Club emails (the business's look). Pure. */

export function clubWelcomeEmail(b: Brand, o: { firstName: string; club: string; account: string; url: string; offers: string; billing: string }) {
  return shell(b, {
    title: `Your ${o.club} booking page — ${b.businessName}`,
    heading: `Welcome to ${o.club}, ${o.firstName}`,
    intro: [
      `We've set up a booking page just for ${o.account}. Book ${o.offers} whenever you need them, at your own rates — no back-and-forth emails.`,
      "Build a quote, change it as often as you like, and hit Book when you're ready. Everyone at your business you've asked us to add sees the same bookings, with who made each one.",
    ],
    rows: [{ label: "Your page", value: o.url.replace(/^https?:\/\//, "") }, { label: "Signing in", value: "Your email or mobile — we send a one-time code. No password." }, { label: "Billing", value: o.billing }],
    buttons: [{ label: `Open ${o.club}`, url: o.url }],
    after: ["Save the page to your phone's home screen for next time. This button signs you straight in once (it works for 14 days); after that, use your email or mobile."],
  });
}

export function clubCodeEmail(b: Brand, o: { firstName: string; club: string; code: string; minutes: number }) {
  return shell(b, {
    title: `${o.code} is your ${o.club} code`,
    heading: `Hi ${o.firstName}, here's your code`,
    intro: [`Enter this code to sign in to ${o.club} with ${b.businessName}.`],
    badge: "Your code", big: o.code, rows: [],
    after: [`It works once and expires in ${o.minutes} minutes. If you didn't ask for it, you can ignore this email.`],
  });
}

export function clubBookedEmail(b: Brand, o: { firstName: string; club: string; title: string; when: string; what: string; total: string; by: string; url: string; invoice: string }) {
  return shell(b, {
    title: `Booked: ${o.title} — ${o.when}`,
    heading: `You're booked, ${o.firstName}`,
    intro: [`Thanks — ${o.title} is locked in. ${o.invoice}`],
    rows: [{ label: "Job", value: o.title }, { label: "When", value: o.when }, { label: "What", value: o.what }, { label: "Total", value: o.total }, { label: "Booked by", value: o.by }],
    buttons: [{ label: `Open ${o.club}`, url: o.url }],
  });
}

export function clubFollowUpEmail(b: Brand, o: { firstName: string; club: string; title: string; when: string; url: string }) {
  return shell(b, {
    title: `Still need us for ${o.title}?`,
    heading: `${o.title} isn't booked yet`,
    intro: [
      `Hi ${o.firstName}, your quote for ${o.title} (${o.when}) is less than a week away and hasn't been booked.`,
      "If it's going ahead, tap below and hit Book so we can lock in your date. If plans have changed, you can remove it from the same page — or just reply to this email.",
    ],
    buttons: [{ label: "Review and book", url: o.url }],
  });
}
