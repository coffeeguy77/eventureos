import "server-only";
import { appBaseUrl } from "@/lib/integrations/registry";
import { money } from "@/lib/format";
import { giftCardPdf, type GiftPdfBack } from "@/lib/gifts/card-pdf";
import { fontBytes } from "./certificate-pdf";
import type { PublicOrg } from "./server";

/** What a sold gift certificate needs for its card (same data on screen and in the PDF). */
export interface GiftForCard {
  code: string; amount: number; purchaser_name: string | null; recipient_name: string | null; message: string | null; expires_on: string | null;
  course: { name: string } | null;
}

export const giftExpires = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(iso + "T00:00:00Z")) : null;

export const giftRedeemText = (org: PublicOrg) =>
  `Book at ${org.website?.replace(/^https?:\/\//, "").replace(/\/$/, "") || `eventureos.com.au/book/${org.slug}`} and enter the code at checkout.`;

export function giftBack(org: PublicOrg, g: GiftForCard): GiftPdfBack {
  return {
    to: g.recipient_name, from: g.purchaser_name, message: g.message,
    value: g.course ? g.course.name : money(g.amount, org.currency), valueNote: g.course ? `${money(g.amount, org.currency)} value` : null,
    code: g.code, expires: giftExpires(g.expires_on), business: org.name, redeem: giftRedeemText(org),
  };
}

/** Artwork from the business's settings: their own https address, or a file on this site ("/media/…"). */
async function picture(url: string | null) {
  if (!url) return null;
  const full = url.startsWith("/") ? `${appBaseUrl()}${url}` : url;
  if (!/^https:\/\//.test(full) && !full.startsWith(appBaseUrl())) return null;
  try { const r = await fetch(full, { cache: "force-cache" }); return r.ok ? new Uint8Array(await r.arrayBuffer()) : null; } catch { return null; }
}

/** The double-sided PDF (front artwork, back with their details). Null when the business has no certificate artwork. */
export async function giftPdf(org: PublicOrg, g: GiftForCard) {
  const L = org.settings.landing;
  if (!L.giftCard) return null;
  const [art, backArt, script, serifBold, serifItalic, sans, sansMedium, sansSemi] = await Promise.all([
    picture(L.giftCard), picture(L.giftCardBack),
    fontBytes("PinyonScript-Regular.ttf"), fontBytes("PlayfairDisplay-Bold.ttf"), fontBytes("PlayfairDisplay-Italic.ttf"),
    fontBytes("Barlow-Regular.ttf"), fontBytes("Barlow-Medium.ttf"), fontBytes("Barlow-SemiBold.ttf"),
  ]);
  if (!art) throw new Error("Couldn't load the certificate artwork");
  const back = giftBack(org, g);
  const bytes = await giftCardPdf({ art, backArt, back, fonts: { script, serifBold, serifItalic, sans, sansMedium, sansSemi },
    title: `${org.name} gift certificate${g.recipient_name ? ` for ${g.recipient_name}` : ""}` });
  const file = `${org.name} gift certificate${g.recipient_name ? ` - ${g.recipient_name}` : ""}`.replace(/[^\w\s.-]+/g, "").replace(/\s+/g, " ").trim().slice(0, 90) || g.code;
  return { bytes, file: `${file}.pdf` };
}
