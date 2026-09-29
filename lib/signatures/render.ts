/**
 * Email signatures — the design schema and a pure, deterministic renderer.
 *
 * A signature is never stored as free-form HTML. The organisation's master design (layout, visible blocks,
 * brand tokens, company details, links, disclaimer) is structured JSON; each team member's personal details
 * are plain fields. `renderSignature` compiles the two into email-safe HTML (tables + inline CSS, fixed image
 * widths, no external CSS, no scripts) and a matching plain-text version.
 *
 * Every dynamic value is HTML-escaped and every link is restricted to https:, mailto: or tel:.
 */

export type Layout = "classic" | "stacked" | "photo" | "minimal";
export type FontId = "arial" | "helvetica" | "georgia" | "verdana" | "trebuchet" | "tahoma";
export type ReplyMode = "smart" | "full" | "compact";
export type Variant = "full" | "compact";
export type PersonField = "display_name" | "pronouns" | "title" | "phone" | "mobile" | "email" | "photo_url" | "extra_line" | "booking_url";
export type SocialNetwork = "instagram" | "facebook" | "linkedin" | "tiktok" | "youtube" | "x" | "pinterest" | "google";

export const LAYOUTS: { id: Layout; name: string; hint: string }[] = [
  { id: "classic", name: "Classic", hint: "Logo on the left, details on the right" },
  { id: "stacked", name: "Stacked", hint: "Details first, logo underneath" },
  { id: "photo", name: "Photo-led", hint: "Your portrait leads, logo beneath the details" },
  { id: "minimal", name: "Minimal", hint: "Text only — the lightest option" },
];

export const FONTS: { id: FontId; name: string; stack: string }[] = [
  { id: "arial", name: "Arial", stack: "Arial, Helvetica, sans-serif" },
  { id: "helvetica", name: "Helvetica", stack: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
  { id: "verdana", name: "Verdana", stack: "Verdana, Geneva, sans-serif" },
  { id: "trebuchet", name: "Trebuchet", stack: "'Trebuchet MS', Tahoma, sans-serif" },
  { id: "tahoma", name: "Tahoma", stack: "Tahoma, Verdana, sans-serif" },
  { id: "georgia", name: "Georgia", stack: "Georgia, 'Times New Roman', serif" },
];

export const SOCIAL_NETWORKS: { id: SocialNetwork; name: string; host: RegExp }[] = [
  { id: "instagram", name: "Instagram", host: /(^|\.)instagram\.com$/ },
  { id: "facebook", name: "Facebook", host: /(^|\.)(facebook\.com|fb\.com)$/ },
  { id: "linkedin", name: "LinkedIn", host: /(^|\.)linkedin\.com$/ },
  { id: "tiktok", name: "TikTok", host: /(^|\.)tiktok\.com$/ },
  { id: "youtube", name: "YouTube", host: /(^|\.)(youtube\.com|youtu\.be)$/ },
  { id: "x", name: "X", host: /(^|\.)(x\.com|twitter\.com)$/ },
  { id: "pinterest", name: "Pinterest", host: /(^|\.)pinterest\.(com|com\.au)$/ },
  { id: "google", name: "Google reviews", host: /(^|\.)(google\.com|g\.page|goo\.gl)$/ },
];

export const CTA_PRESETS = ["Request a quote", "Book a call", "View packages", "See recent events", "Download our brochure"] as const;

/** Which personal fields staff can edit is controlled by `locked`; these are the ones an admin may lock. */
export const LOCKABLE: { id: PersonField; name: string }[] = [
  { id: "display_name", name: "Name" },
  { id: "title", name: "Job title" },
  { id: "phone", name: "Direct phone" },
  { id: "email", name: "Email" },
  { id: "booking_url", name: "Booking link" },
];

export interface SignatureDesign {
  v: 1;
  layout: Layout;
  tokens: {
    primary: string;   // name, divider, CTA
    text: string;      // body text
    muted: string;     // secondary lines, disclaimer
    link: string;      // link colour
    font: FontId;
    size: 13 | 14 | 15;
    logoWidth: number; // px, 60–200
    photoSize: number; // px, 48–96
    photoShape: "circle" | "rounded" | "square";
    divider: boolean;  // accent rule between logo/photo and details
  };
  show: {
    pronouns: boolean; title: boolean; company: boolean; phone: boolean; mobile: boolean; email: boolean;
    website: boolean; address: boolean; logo: boolean; photo: boolean; social: boolean; cta: boolean;
    tagline: boolean; extra: boolean; disclaimer: boolean;
  };
  company: { name: string; website: string; address: string; phone: string; logoUrl: string; logoAlt: string; tagline: string };
  social: { network: SocialNetwork; url: string }[];
  cta: { label: string; url: string; personal: boolean };
  disclaimer: string;
  locked: Partial<Record<PersonField, boolean>>;
  reply: { mode: ReplyMode; compactLogo: boolean };
}

export interface SignaturePerson {
  display_name?: string | null; pronouns?: string | null; title?: string | null;
  phone?: string | null; mobile?: string | null; email?: string | null;
  photo_url?: string | null; extra_line?: string | null; booking_url?: string | null;
}

export interface OrgBranding {
  name: string; brand_colour?: string | null; logo_url?: string | null; website?: string | null;
  address?: string | null; contact_phone?: string | null;
}

/* ------------------------------------------------------------------ sanitising */

export const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const trim = (s: string | null | undefined, max = 300) => (s ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

export const HEX = /^#[0-9a-f]{6}$/i;
const colour = (c: string | undefined | null, fallback: string) => (c && HEX.test(c) ? c.toLowerCase() : fallback);

/** A web link: https only (bare domains get https:// added; http:// is upgraded). Returns null if it isn't a usable link. */
export function webUrl(raw: string | null | undefined): string | null {
  let s = trim(raw, 500);
  if (!s) return null;
  if (/^http:\/\//i.test(s)) s = "https://" + s.slice(7);
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = "https://" + s.replace(/^\/+/, "");
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" || !u.hostname.includes(".") || u.username || u.password) return null;
    return u.toString();
  } catch { return null; }
}

/** Image source: must already be an https URL (no upgrading — a broken image is worse than none). */
export function imageUrl(raw: string | null | undefined): string | null {
  const s = trim(raw, 500);
  if (!/^https:\/\//i.test(s)) return null;
  try { const u = new URL(s); return u.protocol === "https:" && !u.username ? u.toString() : null; } catch { return null; }
}

export function mailUrl(raw: string | null | undefined): string | null {
  const s = trim(raw, 200);
  return /^[^\s@<>"',;:()]+@[^\s@<>"',;:()]+\.[^\s@<>"',;:()]+$/.test(s) ? `mailto:${s}` : null;
}

/** tel: link — keeps a leading + and digits only. Needs at least 6 digits. */
export function telUrl(raw: string | null | undefined): string | null {
  const s = trim(raw, 40);
  const digits = s.replace(/[^\d]/g, "");
  if (digits.length < 6) return null;
  return `tel:${s.trim().startsWith("+") ? "+" : ""}${digits}`;
}

/** "https://www.beanculture.com.au/" → "beanculture.com.au" */
export function displayHost(url: string) {
  try { const u = new URL(url); return (u.hostname.replace(/^www\./, "") + (u.pathname !== "/" ? u.pathname.replace(/\/$/, "") : "")); } catch { return url; }
}

/* ------------------------------------------------------------------ defaults */

export function defaultDesign(org: OrgBranding): SignatureDesign {
  const primary = colour(org.brand_colour, "#1f2937");
  return {
    v: 1,
    layout: "classic",
    tokens: { primary, text: "#1f2937", muted: "#6b7280", link: primary, font: "arial", size: 14, logoWidth: 96, photoSize: 64, photoShape: "circle", divider: true },
    show: {
      pronouns: true, title: true, company: true, phone: true, mobile: true, email: true, website: true, address: false,
      logo: Boolean(org.logo_url), photo: false, social: true, cta: false, tagline: false, extra: true, disclaimer: false,
    },
    company: {
      name: trim(org.name, 80), website: trim(org.website, 300), address: trim(org.address, 200), phone: trim(org.contact_phone, 40),
      logoUrl: trim(org.logo_url, 500), logoAlt: trim(org.name, 80), tagline: "",
    },
    social: [],
    cta: { label: "Request a quote", url: trim(org.website, 300), personal: true },
    disclaimer: "",
    locked: { display_name: false, title: false, email: false },
    reply: { mode: "smart", compactLogo: false },
  };
}

const num = (v: unknown, min: number, max: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.round(Math.min(max, Math.max(min, v))) : d);
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
const str = (v: unknown, max: number, d = "") => (typeof v === "string" ? trim(v, max) : d);
const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);

/** Coerce anything (stored JSON, a form post) into a valid design, filling gaps from the organisation's branding. */
export function normaliseDesign(raw: unknown, org: OrgBranding): SignatureDesign {
  const d = defaultDesign(org);
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Record<string, any>;
  const t = (r.tokens ?? {}) as Record<string, unknown>;
  const s = (r.show ?? {}) as Record<string, unknown>;
  const c = (r.company ?? {}) as Record<string, unknown>;
  const cta = (r.cta ?? {}) as Record<string, unknown>;
  const rep = (r.reply ?? {}) as Record<string, unknown>;
  const lk = (r.locked ?? {}) as Record<string, unknown>;
  const show = Object.fromEntries(Object.entries(d.show).map(([k, v]) => [k, bool(s[k], v)])) as SignatureDesign["show"];
  return {
    v: 1,
    layout: oneOf(r.layout, ["classic", "stacked", "photo", "minimal"] as const, d.layout),
    tokens: {
      primary: colour(t.primary as string, d.tokens.primary),
      text: colour(t.text as string, d.tokens.text),
      muted: colour(t.muted as string, d.tokens.muted),
      link: colour(t.link as string, d.tokens.link),
      font: oneOf(t.font, FONTS.map((f) => f.id), d.tokens.font),
      size: oneOf(t.size as never, [13, 14, 15] as never[], d.tokens.size as never),
      logoWidth: num(t.logoWidth, 60, 200, d.tokens.logoWidth),
      photoSize: num(t.photoSize, 48, 96, d.tokens.photoSize),
      photoShape: oneOf(t.photoShape, ["circle", "rounded", "square"] as const, d.tokens.photoShape),
      divider: bool(t.divider, d.tokens.divider),
    },
    show,
    company: {
      name: str(c.name, 80, d.company.name), website: str(c.website, 300, d.company.website), address: str(c.address, 200, d.company.address),
      phone: str(c.phone, 40, d.company.phone), logoUrl: str(c.logoUrl, 500, d.company.logoUrl), logoAlt: str(c.logoAlt, 80, d.company.logoAlt),
      tagline: str(c.tagline, 120),
    },
    social: Array.isArray(r.social)
      ? r.social.slice(0, 8).map((x: any) => ({ network: oneOf(x?.network, SOCIAL_NETWORKS.map((n) => n.id), "instagram"), url: str(x?.url, 300) })).filter((x: { url: string }) => x.url)
      : [],
    cta: { label: str(cta.label, 40, d.cta.label), url: str(cta.url, 300), personal: bool(cta.personal, true) },
    disclaimer: str(r.disclaimer, 600),
    locked: Object.fromEntries(LOCKABLE.map((f) => [f.id, bool(lk[f.id], false)])) as SignatureDesign["locked"],
    reply: { mode: oneOf(rep.mode, ["smart", "full", "compact"] as const, "smart"), compactLogo: bool(rep.compactLogo, false) },
  };
}

/* ------------------------------------------------------------------ rendering */

interface Resolved {
  name: string; pronouns: string; title: string; company: string; tagline: string; extra: string;
  phone: { label: string; href: string } | null; mobile: { label: string; href: string } | null;
  email: { label: string; href: string } | null; website: { label: string; href: string } | null;
  address: string; logo: string | null; logoAlt: string; photo: string | null;
  social: { label: string; href: string }[]; cta: { label: string; href: string } | null; disclaimer: string;
}

function resolve(d: SignatureDesign, p: SignaturePerson): Resolved {
  const s = d.show;
  const phoneRaw = trim(p.phone, 40) || trim(d.company.phone, 40);
  const phoneHref = s.phone ? telUrl(phoneRaw) : null;
  const mobileRaw = trim(p.mobile, 40);
  const mobileHref = s.mobile ? telUrl(mobileRaw) : null;
  const emailRaw = trim(p.email, 200);
  const emailHref = s.email ? mailUrl(emailRaw) : null;
  const site = s.website ? webUrl(d.company.website) : null;
  const ctaHref = s.cta ? webUrl((d.cta.personal && trim(p.booking_url, 300)) || d.cta.url) : null;
  return {
    name: trim(p.display_name, 80),
    pronouns: s.pronouns ? trim(p.pronouns, 30) : "",
    title: s.title ? trim(p.title, 80) : "",
    company: s.company ? d.company.name : "",
    tagline: s.tagline ? d.company.tagline : "",
    extra: s.extra ? trim(p.extra_line, 120) : "",
    phone: phoneHref ? { label: phoneRaw, href: phoneHref } : null,
    mobile: mobileHref ? { label: mobileRaw, href: mobileHref } : null,
    email: emailHref ? { label: emailRaw, href: emailHref } : null,
    website: site ? { label: displayHost(site), href: site } : null,
    address: s.address ? d.company.address : "",
    logo: s.logo && d.layout !== "minimal" ? imageUrl(d.company.logoUrl) : null,
    logoAlt: d.company.logoAlt || d.company.name,
    photo: s.photo && d.layout === "photo" ? imageUrl(p.photo_url) : null,
    social: s.social
      ? d.social.flatMap((x) => { const href = webUrl(x.url); return href ? [{ label: SOCIAL_NETWORKS.find((n) => n.id === x.network)?.name ?? x.network, href }] : []; })
      : [],
    cta: ctaHref && trim(d.cta.label, 40) ? { label: trim(d.cta.label, 40), href: ctaHref } : null,
    disclaimer: s.disclaimer ? d.disclaimer : "",
  };
}

export interface RenderedSignature {
  html: string;
  text: string;
  /** Approximate rendered width in CSS px (the widest fixed element). */
  width: number;
  /** Missing fields worth nudging someone about. */
  missing: PersonField[];
}

const isFilled = (v: string | null | undefined) => Boolean(v && v.trim());

export function missingFields(d: SignatureDesign, p: SignaturePerson): PersonField[] {
  const m: PersonField[] = [];
  if (!isFilled(p.display_name)) m.push("display_name");
  if (d.show.title && !isFilled(p.title)) m.push("title");
  if (d.show.email && !isFilled(p.email)) m.push("email");
  if (d.layout === "photo" && d.show.photo && !imageUrl(p.photo_url)) m.push("photo_url");
  return m;
}

/**
 * Compile a design + person into email HTML and plain text.
 * `variant: "compact"` is the short reply version: name, title · company, one phone, website.
 */
export function renderSignature(design: SignatureDesign, person: SignaturePerson, variant: Variant = "full"): RenderedSignature {
  const d = design;
  const r = resolve(d, person);
  const T = d.tokens;
  const font = FONTS.find((f) => f.id === T.font)?.stack ?? FONTS[0].stack;
  const fs = T.size;
  const small = fs - 2;
  const base = `font-family:${font};font-size:${fs}px;line-height:1.45;color:${T.text};`;
  const a = (href: string, label: string, style = "") =>
    `<a href="${esc(href)}" style="color:${T.link};text-decoration:none;${style}">${esc(label)}</a>`;
  const dot = `<span style="color:${T.muted};">&nbsp;&middot;&nbsp;</span>`;

  const nameLine = r.name
    ? `<div style="font-size:${fs + 2}px;font-weight:bold;color:${T.primary};line-height:1.3;">${esc(r.name)}${r.pronouns ? ` <span style="font-size:${small}px;font-weight:normal;color:${T.muted};">(${esc(r.pronouns)})</span>` : ""}</div>`
    : "";
  const roleParts = [r.title, r.company].filter(Boolean).map(esc);
  const roleLine = roleParts.length ? `<div style="color:${T.muted};">${roleParts.join(", ")}</div>` : "";

  const text: string[] = [];
  const textRole = [r.title, r.company].filter(Boolean).join(", ");

  if (variant === "compact") {
    const bits = [r.phone ?? r.mobile, r.website].filter(Boolean) as { label: string; href: string }[];
    const logo = d.reply.compactLogo && r.logo ? `<div style="padding-top:6px;"><img src="${esc(r.logo)}" alt="${esc(r.logoAlt)}" width="64" style="display:block;width:64px;height:auto;border:0;" /></div>` : "";
    const html = `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;${base}"><tr><td style="${base}">`
      + (r.name ? `<div style="font-weight:bold;color:${T.primary};">${esc(r.name)}</div>` : "")
      + roleLine
      + (bits.length ? `<div>${bits.map((b) => a(b.href, b.label)).join(dot)}</div>` : "")
      + logo
      + `</td></tr></table>`;
    text.push(r.name, textRole, bits.map((b) => b.label).join(" · "));
    return { html, text: text.filter(Boolean).join("\n"), width: 320, missing: missingFields(d, person) };
  }

  // Contact rows (text, never images, so they survive blocked images)
  const rows: string[] = [];
  const label = (l: string) => `<span style="color:${T.muted};">${l}&nbsp;</span>`;
  const nw = "white-space:nowrap;";
  const phones = [r.phone && `${label("P")}${a(r.phone.href, r.phone.label, nw)}`, r.mobile && `${label("M")}${a(r.mobile.href, r.mobile.label, nw)}`].filter(Boolean);
  if (phones.length) rows.push(phones.join(dot));
  const web = [r.email && a(r.email.href, r.email.label), r.website && a(r.website.href, r.website.label)].filter(Boolean);
  if (web.length) rows.push(web.join(dot));
  if (r.address) rows.push(`<span style="color:${T.muted};">${esc(r.address)}</span>`);
  const contact = rows.map((x) => `<div>${x}</div>`).join("");

  const extra = r.extra ? `<div style="padding-top:4px;font-style:italic;color:${T.muted};">${esc(r.extra)}</div>` : "";
  const tagline = r.tagline ? `<div style="padding-top:4px;color:${T.muted};">${esc(r.tagline)}</div>` : "";
  const social = r.social.length ? `<div style="padding-top:6px;font-size:${small}px;">${r.social.map((x) => a(x.href, x.label, "font-weight:bold;")).join(dot)}</div>` : "";
  const cta = r.cta
    ? `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;margin-top:10px;"><tr><td style="background:${T.primary};border-radius:6px;mso-padding-alt:8px 16px;">`
      + `<a href="${esc(r.cta.href)}" style="display:inline-block;padding:8px 16px;font-family:${font};font-size:${small}px;font-weight:bold;color:${readableOn(T.primary)};text-decoration:none;border-radius:6px;">${esc(r.cta.label)}</a></td></tr></table>`
    : "";
  const details = nameLine + roleLine + (contact ? `<div style="padding-top:6px;">${contact}</div>` : "") + extra + tagline + social + cta;

  const logoImg = (w: number) => r.logo ? `<img src="${esc(r.logo)}" alt="${esc(r.logoAlt)}" width="${w}" style="display:block;width:${w}px;max-width:${w}px;height:auto;border:0;" />` : "";
  const radius = T.photoShape === "circle" ? "50%" : T.photoShape === "rounded" ? "12px" : "0";
  const photoImg = r.photo ? `<img src="${esc(r.photo)}" alt="${esc(r.name || "Photo")}" width="${T.photoSize}" height="${T.photoSize}" style="display:block;width:${T.photoSize}px;height:${T.photoSize}px;border:0;border-radius:${radius};" />` : "";
  const rule = T.divider ? `border-left:2px solid ${T.primary};padding-left:14px;` : "padding-left:4px;";

  let body: string;
  let width: number;
  if (d.layout === "classic" && r.logo) {
    body = `<tr><td valign="top" style="padding:2px 14px 0 0;width:${T.logoWidth}px;">${logoImg(T.logoWidth)}</td><td valign="top" style="${base}${rule}">${details}</td></tr>`;
    width = T.logoWidth + 14 + 360;
  } else if (d.layout === "photo" && (r.photo || r.logo)) {
    const side = r.photo ? photoImg : logoImg(Math.min(T.logoWidth, 96));
    const under = r.photo && r.logo ? `<div style="padding-top:10px;">${logoImg(Math.min(T.logoWidth, 110))}</div>` : "";
    body = `<tr><td valign="top" style="padding:2px 14px 0 0;width:${r.photo ? T.photoSize : Math.min(T.logoWidth, 96)}px;">${side}</td><td valign="top" style="${base}${rule}">${details}${under}</td></tr>`;
    width = (r.photo ? T.photoSize : Math.min(T.logoWidth, 96)) + 14 + 360;
  } else if (d.layout === "stacked") {
    const logo = r.logo ? `<tr><td style="padding-top:12px;${T.divider ? `border-top:2px solid ${T.primary};` : ""}">${logoImg(T.logoWidth)}</td></tr>` : "";
    body = `<tr><td style="${base}padding-bottom:${r.logo ? 10 : 0}px;">${details}</td></tr>${logo}`;
    width = Math.max(360, T.logoWidth);
  } else {
    // minimal (or a logo/photo layout with nothing to show beside the text)
    body = `<tr><td style="${base}${d.layout === "minimal" && T.divider ? rule : ""}">${details}</td></tr>`;
    width = 360;
  }
  const disclaimer = r.disclaimer
    ? `<tr><td colspan="2" style="padding-top:12px;font-family:${font};font-size:11px;line-height:1.4;color:${T.muted};max-width:520px;">${esc(r.disclaimer).replace(/\n/g, "<br>")}</td></tr>`
    : "";
  const html = `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;max-width:560px;${base}">${body}${disclaimer}</table>`;

  // Plain text — the same information in the same order
  text.push(r.name + (r.pronouns ? ` (${r.pronouns})` : ""), textRole);
  if (r.phone) text.push(`P ${r.phone.label}`);
  if (r.mobile) text.push(`M ${r.mobile.label}`);
  if (r.email) text.push(r.email.label);
  if (r.website) text.push(r.website.href);
  if (r.address) text.push(r.address);
  if (r.extra) text.push(r.extra);
  if (r.tagline) text.push(r.tagline);
  for (const x of r.social) text.push(`${x.label}: ${x.href}`);
  if (r.cta) text.push(`${r.cta.label}: ${r.cta.href}`);
  const lines = text.filter(Boolean);
  if (r.disclaimer) lines.push("", r.disclaimer);

  return { html, text: lines.join("\n"), width: Math.min(560, width), missing: missingFields(d, person) };
}

/** White or near-black text, whichever reads better on the given background (WCAG relative luminance). */
export function readableOn(hex: string) {
  if (!HEX.test(hex)) return "#ffffff";
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const L = 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  // contrast with white = 1.05/(L+.05); with #111 ≈ (L+.05)/0.0556
  return 1.05 / (L + 0.05) >= (L + 0.05) / 0.0556 ? "#ffffff" : "#111111";
}

/** Which variant a message gets. Smart: the full signature on EventureOS's first message in a thread, compact after. */
export function variantFor(mode: ReplyMode, alreadySignedInThread: boolean): Variant {
  if (mode === "full") return "full";
  if (mode === "compact") return "compact";
  return alreadySignedInThread ? "compact" : "full";
}

/** Gmail's documented signature limit is 10,000 characters, including markup. */
export const GMAIL_SIGNATURE_LIMIT = 10_000;

/** Turn a typed reply into HTML paragraphs (escaped), for the HTML part of an outgoing message. */
export function textToHtml(s: string) {
  return esc(s.replace(/\r\n/g, "\n")).split(/\n{2,}/).map((p) => `<p style="margin:0 0 1em 0;">${p.replace(/\n/g, "<br>")}</p>`).join("");
}

const lum = (hex: string) => {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
};
/** WCAG contrast ratio between two #rrggbb colours (1–21). */
export function contrastRatio(a: string, b = "#ffffff") {
  if (!HEX.test(a) || !HEX.test(b)) return 21;
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
/** The same hue, darkened just enough to reach `target` contrast on white. */
export function darkenFor(hex: string, target = 4.5) {
  if (!HEX.test(hex)) return hex;
  let [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  for (let i = 0; i < 100 && contrastRatio(hex) < target; i++) {
    [r, g, b] = [r, g, b].map((c) => Math.max(0, Math.round(c * 0.96)));
    hex = "#" + [r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("");
  }
  return hex;
}
