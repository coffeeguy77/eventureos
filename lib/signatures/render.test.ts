import { defaultDesign, normaliseDesign, renderSignature, webUrl, imageUrl, telUrl, mailUrl, readableOn, variantFor, textToHtml, GMAIL_SIGNATURE_LIMIT } from "./render";

let fail = 0;
const check = (name: string, ok: boolean, info?: unknown) => { if (!ok) { fail++; console.log("FAIL", name, info ?? ""); } else console.log("ok  ", name); };

const org = { name: "Bean Culture", brand_colour: "#FB6F92", logo_url: "https://x.supabase.co/storage/v1/object/public/branding/o/logo.png", website: "https://beanculture.com.au", address: "U5, 47-49 Vicars St, Mitchell ACT 2911", contact_phone: "04 1463 1463" };
const person = { display_name: "Shaun Matthews", title: "Director", email: "info@beanculture.com.au", mobile: "0414 631 463", pronouns: "he/him" };

// URL rules
check("web: bare domain", webUrl("beanculture.com.au") === "https://beanculture.com.au/");
check("web: http upgraded", webUrl("http://a.com/x") === "https://a.com/x");
check("web: javascript blocked", webUrl("javascript:alert(1)") === null);
check("web: data blocked", webUrl("data:text/html,hi") === null);
check("web: no dot", webUrl("localhost") === null);
check("web: credentials blocked", webUrl("https://user:pw@a.com") === null);
check("img: http refused", imageUrl("http://a.com/x.png") === null);
check("img: https ok", imageUrl("https://a.com/x.png") === "https://a.com/x.png");
check("tel: spaces", telUrl("04 1463 1463") === "tel:0414631463");
check("tel: intl", telUrl("+61 414 631 463") === "tel:+61414631463");
check("tel: junk", telUrl("call me") === null);
check("mail ok", mailUrl("a@b.com") === "mailto:a@b.com");
check("mail header injection", mailUrl("a@b.com?bcc=x@y.com") === null || !mailUrl("a@b.com?bcc=x@y.com")!.includes("\n"));

// Defaults
const d = defaultDesign(org);
check("default primary from brand", d.tokens.primary === "#fb6f92");
check("default shows logo when org has one", d.show.logo === true);

// Normalise rejects bad values
const n = normaliseDesign({ layout: "evil", tokens: { primary: "red;background:url(x)", logoWidth: 9999, font: "comic" }, social: [{ network: "instagram", url: "instagram.com/beanculture" }] }, org);
check("normalise layout", n.layout === "classic");
check("normalise colour", n.tokens.primary === "#fb6f92");
check("normalise width clamp", n.tokens.logoWidth === 200);
check("normalise font", n.tokens.font === "arial");
check("normalise social kept", n.social.length === 1);

// Full render
const full = renderSignature({ ...d, social: [{ network: "instagram", url: "instagram.com/beanculture" }] }, person);
check("full has name", full.html.includes("Shaun Matthews"));
check("full has tel link", full.html.includes('href="tel:0414631463"'));
check("full has logo with alt", full.html.includes('alt="Bean Culture"') && full.html.includes('width="96"'));
check("full has instagram", full.html.includes("https://instagram.com/beanculture"));
check("full text", full.text.startsWith("Shaun Matthews (he/him)\nDirector, Bean Culture"), full.text);
check("full text has no html", !/[<>]/.test(full.text));
check("no script", !/<script|onerror|onload|javascript:/i.test(full.html));
check("under Gmail limit", full.html.length < GMAIL_SIGNATURE_LIMIT, full.html.length);
check("width sane", full.width >= 320 && full.width <= 560, full.width);

// Escaping
const evil = renderSignature(d, { display_name: `<img src=x onerror=alert(1)>"`, title: "A & B", email: "x@y.com" });
check("name escaped", !evil.html.includes("<img src=x") && evil.html.includes("&lt;img"));
check("ampersand escaped", evil.html.includes("A &amp; B"));

// Compact
const compact = renderSignature(d, person, "compact");
check("compact shorter", compact.html.length < full.html.length);
check("compact has no logo by default", !compact.html.includes("<img"));
check("compact text", compact.text.split("\n").length <= 3, compact.text);

// Missing fields leave no gaps
const bare = renderSignature(d, { display_name: "Jess" });
check("no empty rows", !bare.html.includes("<div></div>") && !bare.html.includes("&nbsp;&middot;&nbsp;</span></div>"));
check("missing reported", bare.missing.includes("title") && bare.missing.includes("email"), bare.missing);

// Layouts all render
for (const layout of ["classic", "stacked", "photo", "minimal"] as const) {
  const r = renderSignature({ ...d, layout, show: { ...d.show, photo: true, cta: true, disclaimer: true }, disclaimer: "Line 1\nLine 2" }, { ...person, photo_url: "https://a.com/p.jpg", booking_url: "calendly.com/shaun" });
  check(`layout ${layout} renders`, r.html.startsWith("<table") && r.html.endsWith("</table>"));
  check(`layout ${layout} cta uses personal booking link`, r.html.includes("https://calendly.com/shaun"));
  check(`layout ${layout} disclaimer`, r.html.includes("Line 1<br>Line 2") && r.text.endsWith("Line 1\nLine 2"));
  if (layout === "minimal") check("minimal has no images", !r.html.includes("<img"));
  if (layout === "photo") check("photo layout shows photo", r.html.includes("https://a.com/p.jpg"));
}

check("readable on pink", readableOn("#fb6f92") === "#111111" || readableOn("#fb6f92") === "#ffffff");
check("readable on navy", readableOn("#1f2937") === "#ffffff");
check("readable on yellow", readableOn("#ffe066") === "#111111");
check("smart first", variantFor("smart", false) === "full");
check("smart later", variantFor("smart", true) === "compact");
check("always full", variantFor("full", true) === "full");
check("textToHtml", textToHtml("Hi <b>\n\nThanks\nS") === '<p style="margin:0 0 1em 0;">Hi &lt;b&gt;</p><p style="margin:0 0 1em 0;">Thanks<br>S</p>');

if (fail) { console.log(`${fail} failed`); process.exit(1); }
import { contrastRatio, darkenFor } from "./render";
{
  let f = 0;
  const c = (n: string, ok: boolean, i?: unknown) => { if (!ok) { f++; console.log("FAIL", n, i ?? ""); } else console.log("ok  ", n); };
  c("contrast black/white", Math.round(contrastRatio("#000000")) === 21);
  c("pink is low contrast", contrastRatio("#fb6f92") < 3, contrastRatio("#fb6f92"));
  const d = darkenFor("#fb6f92");
  c("darkened reaches 4.5", contrastRatio(d) >= 4.5, d);
  c("darkened keeps it reddish", parseInt(d.slice(1, 3), 16) > parseInt(d.slice(3, 5), 16), d);
  if (f) process.exit(1);
}
{
  const dd = defaultDesign, rs = renderSignature;
  const d = dd({ name: "Bean Culture", logo_url: "https://a.com/b.png" });
  const tall = { ...d, tokens: { ...d.tokens, logoWidth: 108 }, company: { ...d.company, logoSource: "custom" as const, logoW: 426, logoH: 557 } };
  const html = rs(tall, { display_name: "Shaun" }).html;
  const ok1 = html.includes('width="108" height="141"');
  const ok2 = rs({ ...tall, reply: { ...tall.reply, compactLogo: true } }, { display_name: "Shaun" }, "compact").html.includes('width="37" height="48"');
  console.log(ok1 ? "ok   tall logo gets fixed height" : "FAIL tall logo height");
  console.log(ok2 ? "ok   compact logo capped at 48px tall" : "FAIL compact logo");
  if (!ok1 || !ok2) process.exit(1);
}
