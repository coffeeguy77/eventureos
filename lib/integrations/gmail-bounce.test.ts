import { parseBounce } from "./gmail-bounce";
let fail = 0;
const c = (n: string, ok: boolean, i?: unknown) => { if (!ok) { fail++; console.log("FAIL", n, i ?? ""); } else console.log("ok  ", n); };
const gmailFail = parseBounce("mailer-daemon@googlemail.com", "Delivery Status Notification (Failure)",
  "** Address not found **\n\nYour message wasn't delivered to kieran.pender@gmial.com because the address couldn't be found, or is unable to receive mail.\n\nLearn more here: https://support.google.com/mail/?p=NoSuchUser");
c("gmail failure", gmailFail?.kind === "bounced", gmailFail);
c("gmail reason", Boolean(gmailFail?.reason.includes("wasn't delivered")), gmailFail?.reason);
c("gmail address", Boolean(gmailFail?.addresses.includes("kieran.pender@gmial.com")), gmailFail?.addresses);
const delay = parseBounce("mailer-daemon@googlemail.com", "Delivery Status Notification (Delay)", "Message not delivered yet\nThere was a temporary problem delivering your message to a@b.com. Gmail will retry for 46 more hours.");
c("delay", delay?.kind === "delayed", delay);
c("outlook undeliverable", parseBounce("postmaster@outlook.com", "Undeliverable: Quote Q-1002 from Bean Culture", "Your message to x@corp.com couldn't be delivered.")?.kind === "bounced");
c("normal mail ignored", parseBounce("kieran@gmail.com", "Delivery Status Notification (Failure)", "hi") === null);
c("daemon other subject ignored", parseBounce("mailer-daemon@googlemail.com", "Hello", "hi") === null);
if (fail) process.exit(1);
