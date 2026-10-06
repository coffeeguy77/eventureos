import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/context";
import { appBaseUrl } from "@/lib/integrations/registry";
import { fontBytes } from "@/lib/bookings/certificate-pdf";
import { offerBig, offerPath, offerTerms, offerWhere, toOffer } from "@/lib/offers/core";
import { offerPoster } from "@/lib/offers/poster";

export const dynamic = "force-dynamic";

/** A printable A4 poster for an offer (office only): big discount, code and a QR code to claim it. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, org } = await requireOrg();
  const [{ data }, { data: o }, { data: courses }] = await Promise.all([
    supabase.from("shop_coupons").select("*").eq("organisation_id", org.id).eq("id", id).maybeSingle(),
    supabase.from("organisations").select("name, slug, brand_colour, contact_phone, contact_email").eq("id", org.id).single(),
    supabase.from("booking_courses").select("id, name").eq("organisation_id", org.id),
  ]);
  if (!data || !o) return new NextResponse("Offer not found", { status: 404 });
  const offer = toOffer(data);
  const names = (courses ?? []).filter((c) => offer.course_ids.includes(c.id as string)).map((c) => c.name as string);
  const path = offerPath(offer, o.slug as string);
  const url = `${appBaseUrl()}${path}`;
  const ends = offer.ends_on ? new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(offer.ends_on + "T00:00:00Z")) : null;
  try {
    const [display, sans, sansSemi, script] = await Promise.all([fontBytes("PlayfairDisplay-Bold.ttf"), fontBytes("Barlow-Regular.ttf"), fontBytes("Barlow-SemiBold.ttf"), fontBytes("PinyonScript-Regular.ttf")]);
    const bytes = await offerPoster({
      business: o.name as string, brand: /^#[0-9a-f]{6}$/i.test((o.brand_colour as string) ?? "") ? (o.brand_colour as string) : "#1A1614",
      big: offerBig(offer), where: offerWhere(offer, names), headline: offer.headline, description: offer.description,
      code: offer.code, url, shortUrl: url.replace(/^https?:\/\/(www\.)?/, ""), ends, terms: offerTerms(offer, names),
      contact: [o.contact_phone, o.contact_email].filter(Boolean).join(" · ") || null,
    }, { display, sans, sansSemi, script });
    return new NextResponse(Buffer.from(bytes), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${offer.code} poster.pdf"`, "cache-control": "private, no-store" } });
  } catch (e) {
    console.error("offer poster", e);
    return new NextResponse("Couldn't make the poster just now — please try again.", { status: 500 });
  }
}
