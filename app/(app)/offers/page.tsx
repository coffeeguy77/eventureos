import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { requireOrg } from "@/lib/context";
import { appBaseUrl } from "@/lib/integrations/registry";
import { PageHeader } from "@/components/ui/page-header";
import { offerPath, offerShort, offerStatus, offerWhere, toOffer } from "@/lib/offers/core";
import { OfferStudio, type StudioOffer } from "@/components/offers/offer-studio";

export const dynamic = "force-dynamic";
export const metadata = { title: "Offers" };

const PAID_ORDER = ["paid", "roasting", "packed", "shipped", "completed"];
const PAID_BOOKING = ["confirmed", "attended", "no_show"];

export default async function OffersPage() {
  const { supabase, org, role } = await requireOrg();
  if (role === "staff" || role === "customer") redirect("/dashboard");
  const tz = (org as { timezone?: string }).timezone ?? "Australia/Sydney";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
  const [{ data: rows, error }, { data: courses }, { data: products }, { data: orders }, bk, gf] = await Promise.all([
    supabase.from("shop_coupons").select("*").eq("organisation_id", org.id).order("created_at", { ascending: false }),
    supabase.from("booking_courses").select("id, name, price, active").eq("organisation_id", org.id).order("name"),
    supabase.from("shop_products").select("id, name").eq("organisation_id", org.id).neq("status", "archived").order("position"),
    supabase.from("shop_orders").select("coupon_code, total, discount, status").eq("organisation_id", org.id).not("coupon_code", "is", null).limit(5000),
    supabase.from("bookings").select("coupon_id, total, discount, status").eq("organisation_id", org.id).not("coupon_id", "is", null).limit(5000),
    supabase.from("booking_gifts").select("coupon_id, amount, discount, status").eq("organisation_id", org.id).not("coupon_id", "is", null).limit(5000),
  ]);
  if (error && /shop_coupons|does not exist|Could not find/i.test(error.message)) {
    return <><PageHeader title="Offers" /><p className="text-[0.875rem] text-ink-muted">Offers need the shop database update first (supabase/migrations/0055_shop.sql).</p></>;
  }
  // The offers update adds where-it-works, ribbons and class/gift tracking; before it, codes only work in the shop
  const ready = !bk.error && !gf.error && (rows ?? []).every((r) => "works_on" in r);
  const allCourses = (courses ?? []) as { id: string; name: string; price: number; active: boolean }[];

  const offers: StudioOffer[] = await Promise.all((rows ?? []).map(async (r) => {
    const o = toOffer(r);
    const names = allCourses.filter((c) => o.course_ids.includes(c.id)).map((c) => c.name);
    const shop = (orders ?? []).filter((x) => x.coupon_code === o.code && PAID_ORDER.includes(x.status as string));
    const books = ((bk.data ?? []) as { coupon_id: string; total: number; discount: number; status: string }[]).filter((x) => x.coupon_id === o.id && PAID_BOOKING.includes(x.status));
    const gifts = ((gf.data ?? []) as { coupon_id: string; amount: number; discount: number; status: string }[]).filter((x) => x.coupon_id === o.id && ["active", "redeemed"].includes(x.status));
    const sales = shop.reduce((a, x) => a + Number(x.total), 0) + books.reduce((a, x) => a + Number(x.total), 0) + gifts.reduce((a, x) => a + Number(x.amount) - Number(x.discount), 0);
    const given = shop.reduce((a, x) => a + Number(x.discount), 0) + books.reduce((a, x) => a + Number(x.discount), 0) + gifts.reduce((a, x) => a + Number(x.discount), 0);
    const link = `${appBaseUrl()}${offerPath(o, org.slug)}`;
    return {
      offer: o, raw: r as Record<string, unknown>, link, qr: await QRCode.toDataURL(link, { margin: 1, width: 240, errorCorrectionLevel: "M" }),
      summary: [offerShort(o), offerWhere(o, names), o.ends_on ? `until ${o.ends_on.split("-").reverse().join("/")}` : null].filter(Boolean).join(" · "),
      status: offerStatus(o, today), stats: { uses: o.uses, sales: Math.round(sales * 100) / 100, given: Math.round(given * 100) / 100 },
    };
  }));

  return (
    <>
      <PageHeader eyebrow="Marketing" title="Offers"
        subtitle="Promo codes for classes, gift certificates and the coffee shop. Share the link, print a QR poster for the counter or the cart, or run it as a ribbon across your website." />
      <OfferStudio offers={offers} ready={ready} today={today} slug={org.slug}
        courses={allCourses.filter((c) => c.active).map((c) => ({ id: c.id, name: c.name, price: Number(c.price) }))}
        products={(products ?? []) as { id: string; name: string }[]} />
    </>
  );
}
