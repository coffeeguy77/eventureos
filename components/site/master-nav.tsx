import Link from "next/link";
import type { PublicOrg } from "@/lib/bookings/server";
import { readSiteNav, type SiteSection } from "@/lib/site-nav";
import { readJobSettings } from "@/lib/jobs/core";
import { readShop } from "@/lib/shop/core";
import { PAGE } from "@/components/book/shell";

/** One menu bar above every public section of the business's site: logo · classes · job board · shop · gift certificates. */
export function MasterNav({ org, active }: { org: PublicOrg; active?: SiteSection }) {
  const labels = readSiteNav(org.rawSettings);
  const base = org.slug;
  const items: { key: SiteSection; href: string; on: boolean }[] = [
    { key: "lessons", href: `/${base}`, on: org.settings.enabled },
    { key: "jobs", href: `/jobs/${base}`, on: readJobSettings(org.rawSettings, org.name).enabled },
    { key: "shop", href: `/shop/${base}`, on: readShop(org.rawSettings).enabled },
    { key: "gifts", href: `/book/${base}/gift`, on: org.settings.enabled && org.stripeReady },
  ];
  const shown = items.filter((i) => i.on);
  const logo = org.logo_url && /^https:\/\//.test(org.logo_url) ? org.logo_url : null;
  return (
    <div className="relative z-50 border-b border-white/10 bg-[#141011] text-white" data-master-nav>
      <div className={`${PAGE} flex min-h-[60px] flex-wrap items-center gap-x-8 gap-y-0`}>
        <Link href={`/${base}`} className="flex h-[60px] shrink-0 items-center" aria-label={`${org.name} home`}>
          {logo ? <img src={logo} alt={org.name} className="h-9 max-w-[180px] object-contain" /> : <span className="text-[1.0625rem] font-semibold">{org.name}</span>}
        </Link>
        <nav aria-label={org.name} className="no-scrollbar -mx-4 flex w-[calc(100%+2rem)] items-center gap-1 overflow-x-auto px-3 pb-2 sm:mx-0 sm:w-auto sm:flex-1 sm:justify-end sm:px-0 sm:pb-0">
          {shown.map((i, n) => (
            <span key={i.key} className="flex shrink-0 items-center">
              {n > 0 && <span aria-hidden className="mx-1 hidden h-4 w-px bg-white/20 sm:block" />}
              <Link href={i.href} aria-current={active === i.key ? "page" : undefined}
                className={`relative inline-flex h-10 items-center whitespace-nowrap rounded-lg px-2 text-[0.8438rem] font-medium transition sm:h-[60px] sm:rounded-none sm:px-3 sm:text-[0.9375rem] ${active === i.key ? "text-[var(--b)]" : "text-white/85 hover:text-white"}`}>
                {labels[i.key]}
                {active === i.key && <span className="absolute inset-x-3 bottom-0 h-[3px] rounded-t-full bg-[var(--b)] max-sm:inset-x-2 max-sm:bottom-1 max-sm:h-[2px]" />}
              </Link>
            </span>
          ))}
        </nav>
      </div>
    </div>
  );
}
