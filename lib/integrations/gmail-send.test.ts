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
if (fail) process.exit(1);
