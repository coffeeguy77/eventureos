import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CafeClosed, CafeFrame, WRAP, btn, serif } from "@/components/cafe/frame";
import { OpenBadge } from "@/components/cafe/bits";
import { OrderApp } from "@/components/cafe/order-app";
import { cafePages, nowIn } from "@/lib/cafe/core";
import { appSnapshot, cafeOrg } from "@/lib/cafe/server";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ org: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const org = await cafeOrg((await params).org);
  return org ? { title: { absolute: `Order online — ${org.name}` }, description: `Order ahead from ${org.name} and pick up from the café. Pay securely online.` } : {};
}

export default async function OrderPage({ params }: P) {
  const org = await cafeOrg((await params).org);
  if (!org) notFound();
  const pages = cafePages(org.cafe);
  if (!pages.order) {
    return (
      <CafeFrame org={org} active="order">
        {pages.appOrder
          ? <div className={`${WRAP} py-24 text-center`}><p className={`${serif} text-[2.25rem] font-semibold`}>Order in our app</p><p className="mt-3 text-[#5E5853]">Our menu and online ordering live in the {org.name} app.</p><Link href={org.cafe.appUrl} className={`${btn} mt-8`}>Open the app</Link></div>
          : <CafeClosed name={org.name} what="Online ordering" />}
      </CafeFrame>
    );
  }
  const { cfg, loc, menu } = await appSnapshot(org.cafe.appUrl, true);
  if (!cfg || !menu || !cfg.applicationId) {
    return (
      <CafeFrame org={org} active="order">
        <div className={`${WRAP} py-24 text-center`}>
          <p className={`${serif} text-[2.25rem] font-semibold`}>The menu didn&apos;t load</p>
          <p className="mt-3 text-[#5E5853]">Our ordering system didn&apos;t answer just now. Try again in a moment, or order in our app.</p>
          <div className="mt-8 flex justify-center gap-3"><Link href={`/cafe/${org.slug}/order`} className={btn}>Try again</Link><Link href={org.cafe.appUrl} className="shop-btn inline-flex h-[60px] items-center rounded-full px-8 font-semibold ring-1 ring-[#1F1B19]">Open the app</Link></div>
        </div>
      </CafeFrame>
    );
  }
  const h = cfg.hours ?? {};
  const tz = h.timezone || cfg.scheduling?.timezone || org.timezone || "Australia/Sydney";
  return (
    <CafeFrame org={org} active="order" weekly={h.weekly}>
      <div className={`${WRAP} flex flex-wrap items-end justify-between gap-4 pb-2 pt-8 sm:pt-10`}>
        <div>
          <h1 className={`${serif} text-[clamp(2.25rem,4.4vw,3.25rem)] font-semibold leading-tight`}>Order online</h1>
          <p className="mt-1 text-[1.0625rem] text-[#5E5853]">Pick up from {org.name}{loc?.name && loc.name !== org.name ? ` · ${loc.name}` : ""}. Pay securely now and skip the queue.</p>
        </div>
        <OpenBadge hours={h} />
      </div>
      <OrderApp
        slug={org.slug}
        menu={menu}
        square={{ applicationId: cfg.applicationId, locationId: loc?.squareLocationId || cfg.locationId, environment: cfg.environment, currency: cfg.currency }}
        locationId={loc?.id ?? null}
        hours={{ open: h.open !== false && h.canOrderNow !== false && !h.orderingDisabled, nextOpen: h.nextOpen?.label ?? null, weekly: h.weekly ?? null, closures: h.closures ?? [], kitchen: h.kitchen ?? null, paused: !!h.orderingDisabled }}
        surcharges={cfg.surcharges}
        tz={tz}
        now={nowIn(tz)}
        maxDays={Math.max(1, Math.min(14, cfg.scheduling?.maxDaysAhead ?? 7))}
        business={org.name}
        phone={org.contact_phone}
      />
    </CafeFrame>
  );
}
