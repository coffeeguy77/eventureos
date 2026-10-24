import "@fontsource-variable/newsreader/opsz.css";
import { headers } from "next/headers";
import { brandStyle } from "@/components/book/shell";
import { SHOP_CSS } from "@/components/shop/frame";
import { SiteFooter } from "@/components/site/site-footer";
import { footerModel } from "@/lib/site/footer";
import { footerPageKey, footerToneFor } from "@/lib/site/footer-tone";
import { cafePages, hoursRows, readCafe, type Weekly } from "@/lib/cafe/core";
import { cafeWeekly } from "@/lib/cafe/server";
import type { PublicOrg } from "@/lib/bookings/server";

/**
 * The one footer on every public page: every business the company runs, contact, café hours and social links.
 * Dark or light per page (set in the page editor). Pass `weekly` when the page already has the café hours.
 */
export async function PublicFooter({ org, weekly, note }: { org: PublicOrg; weekly?: Weekly | null; /** a small page-specific line shown just above (privacy notes, map credits…) */ note?: React.ReactNode }) {
  const path = (await headers()).get("x-pathname") ?? "";
  const key = footerPageKey(path, org.slug);
  const tone = footerToneFor(org.rawSettings, key);
  let w = weekly;
  if (w === undefined) {
    const cafe = readCafe(org.rawSettings);
    w = cafePages(cafe).home && cafe.appUrl ? await cafeWeekly(cafe.appUrl) : null;
  }
  return (
    <div data-footer-key={key} data-footer-tone={tone} style={brandStyle(org)} className="shop text-left">
      <style>{SHOP_CSS}</style>
      {note && <div className="mx-auto w-full max-w-[1360px] px-5 pb-6 pt-2 text-center text-[0.75rem] leading-relaxed text-[#8C847D] sm:px-8 lg:px-10">{note}</div>}
      <SiteFooter m={footerModel(org)} tone={tone} hours={hoursRows(w)} />
    </div>
  );
}
