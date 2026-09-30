/**
 * Bounce notices ("Delivery Status Notification", "Undeliverable", "Address not found") for emails sent from
 * the connected Gmail. Gmail files the notice in the same conversation as the message that bounced, so the
 * sync can match it back to the quote email and show "Bounced" in Sent emails.
 */

export interface Bounce { kind: "bounced" | "delayed"; reason: string; addresses: string[] }

const SENDER = /^(mailer-daemon|postmaster)@/i;
const FAIL_SUBJECT = /delivery status notification \(failure\)|undeliverable|undelivered mail|returned mail|mail delivery (failed|failure)|delivery has failed|address not found|failure notice/i;
const DELAY_SUBJECT = /delivery status notification \(delay\)|delivery delayed|delayed mail|warning: message .* delayed/i;

export function parseBounce(fromEmail: string, subject: string | null, text: string): Bounce | null {
  if (!SENDER.test(fromEmail.trim())) return null;
  const subj = subject ?? "";
  const kind = DELAY_SUBJECT.test(subj) ? "delayed" : FAIL_SUBJECT.test(subj) ? "bounced" : null;
  if (!kind) return null;
  const lines = text.replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean);
  const reasonLine =
    lines.find((l) => /wasn't delivered|was not delivered|couldn't be (found|delivered)|could not be delivered|does not exist|doesn't exist|user unknown|mailbox (is )?(full|unavailable)|rejected|temporarily|will retry|delayed/i.test(l))
    ?? lines.find((l) => !/^(\*|-|_|=)/.test(l)) ?? "";
  const addresses = [...new Set((text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? [])
    .map((a) => a.toLowerCase()).filter((a) => !SENDER.test(a) && !/@(google|googlemail)\.com$/.test(a)))];
  return { kind, reason: reasonLine.slice(0, 300), addresses };
}
