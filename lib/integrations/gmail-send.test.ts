// Run: npx tsx --conditions=react-server lib/integrations/gmail-send.test.ts
import { buildRawMessage } from "./gmail-send";
let fail = 0;
const check = (n: string, ok: boolean, info?: unknown) => { if (!ok) { fail++; console.log("FAIL", n, info ?? ""); } else console.log("ok  ", n); };
const dec = (raw: string) => Buffer.from(raw, "base64url").toString("utf8");
const part = (msg: string, type: string) => {
  const m = msg.split(/\r\n--[^\r\n]+/).find((p) => p.includes(`Content-Type: ${type}`));
  return m ? Buffer.from(m.split("\r\n\r\n")[1].replace(/\r\n/g, ""), "base64").toString("utf8") : null;
};
const base = { from: "info@beanculture.com.au", fromName: "Shaun · Bean Culture", to: ["emma@example.com"], subject: "Re: Quote", text: "Hi Emma\n\n-- \nShaun" };

const plain = dec(buildRawMessage(base));
check("plain stays single part", plain.includes('Content-Type: text/plain; charset="UTF-8"') && !plain.includes("multipart"));

const multi = dec(buildRawMessage({ ...base, html: "<p>Hi Emma</p><table><tr><td>Shaun — Bean Culture</td></tr></table>" }, "B1"));
check("multipart header", multi.includes('Content-Type: multipart/alternative; boundary="B1"'));
check("text part", part(multi, "text/plain")?.replace(/\r\n/g, "\n") === "Hi Emma\n\n-- \nShaun", part(multi, "text/plain"));
check("html part (utf-8)", part(multi, "text/html") === "<p>Hi Emma</p><table><tr><td>Shaun — Bean Culture</td></tr></table>", part(multi, "text/html"));
check("closing boundary", multi.includes("--B1--"));
check("CRLF only", !/[^\r]\n/.test(multi));
check("header injection stripped", !dec(buildRawMessage({ ...base, subject: "Hi\r\nBcc: x@y.com" })).includes("\r\nBcc:"));

const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0, 255]);
const att = dec(buildRawMessage({ ...base, html: "<p>Hi</p>", attachments: [{ filename: 'Quote "Q-1005".pdf', contentType: "application/pdf", data: pdf }] }, "B2"));
check("mixed wraps alternative", att.includes('Content-Type: multipart/mixed; boundary="B2-mix"') && att.includes('Content-Type: multipart/alternative; boundary="B2"'));
const attPart = att.split("\r\n--B2-mix").find((p) => p.includes("application/pdf"));
check("attachment headers", !!attPart && attPart.includes('Content-Disposition: attachment; filename="Quote -Q-1005-.pdf"'), attPart?.slice(0, 200));
check("attachment bytes intact", !!attPart && Buffer.from(attPart.split("\r\n\r\n")[1].replace(/\r\n|--B2-mix--/g, ""), "base64").equals(Buffer.from(pdf)));
check("html still readable", att.includes("--B2--") && att.includes("text/html"));
check("mixed CRLF only", !/[^\r]\n/.test(att));
const attPlain = dec(buildRawMessage({ ...base, attachments: [{ filename: "a.pdf", contentType: "application/pdf", data: pdf }] }, "B3"));
check("plain + attachment", attPlain.includes("multipart/mixed") && !attPlain.includes("multipart/alternative") && attPlain.includes('filename="a.pdf"'));
if (fail) process.exit(1);
