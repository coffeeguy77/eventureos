import Image from "next/image";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import "@fontsource-variable/newsreader/opsz.css";
import "./portal.css";
import { Globe, LogOut, Mail, MapPin, Phone, UserRound } from "lucide-react";
import { publicOrg } from "@/lib/bookings/server";
import { brandStyle } from "@/components/book/shell";
import { MasterNav } from "@/components/site/master-nav";
import { PageBg } from "@/components/site/page-bg";
import { createClient } from "@/lib/supabase/server";
import { brandVars, getBranding } from "./portal-data";
import { portalSignOut } from "./actions";
import { BrandMark } from "./ui";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const b = await getBranding(slug);
  return {
    title: { absolute: b ? `${b.name} · Customer portal` : "Customer portal" },
    robots: { index: false, follow: false },
  };
}

function websiteHref(w: string) {
  return /^https?:\/\//i.test(w) ? w : `https://${w}`;
}

export default async function PortalLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const b = await getBranding(slug);
  if (!b) notFound();
  const [supabase, site] = await Promise.all([createClient(), publicOrg(slug).catch(() => null)]);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const brand = site ? brandStyle(site) : {};

  return (
    <div style={{ ...brandVars(b.brand_colour), ...brand }} className="portal-light flex min-h-screen flex-col overflow-x-clip bg-[#FBF8F5]">
      <PageBg color="#FFFDFB" />
      {/* The business's website menu, so customers can get straight back to browsing */}
      {site && <MasterNav org={site} tone="light" />}
      <header className="sticky top-0 z-30 border-b border-[#EEE6DF] bg-[#FBF8F5]/92 backdrop-blur-md">
        <div className="mx-auto flex h-[62px] max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href={`/p/${slug}`} className="flex min-w-0 items-center gap-3">
            {!site && <BrandMark name={b.name} logoUrl={b.logo_url} size={32} />}
            <span className="flex items-center gap-2 font-semibold text-[#151312]"><UserRound className="h-[18px] w-[18px] text-[var(--portal-brand)]" /><span className="portal-serif text-[1.1875rem]">My account</span></span>
          </Link>
          {user && (
            <div className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-3">
              <span className="hidden max-w-[220px] truncate text-[0.8125rem] text-[#5E5853] md:inline">{user.email}</span>
              <form action={portalSignOut}>
                <input type="hidden" name="slug" value={slug} />
                <button className="inline-flex h-10 items-center gap-2 rounded-full px-4 text-[0.8438rem] font-semibold text-[#3A3431] ring-1 ring-inset ring-[#E3D7CE] transition hover:bg-white hover:text-[#151312]">
                  <LogOut className="h-4 w-4" />Sign out
                </button>
              </form>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-10">{children}</main>

      <footer className="border-t border-[#EDE3DB] bg-[#FFFDFB]">
        <div className="pb-safe mx-auto grid max-w-6xl gap-6 px-4 py-10 text-[0.875rem] text-[#5E5853] sm:grid-cols-[1.2fr_1fr] sm:px-6">
          <div>
            <p className="portal-serif text-[1.5rem] font-semibold text-[#151312]">{b.name}</p>
            <p className="mt-1">Questions about a booking? We&apos;re happy to help.</p>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            {b.contact_email && <a href={`mailto:${b.contact_email}`} className="inline-flex min-w-0 items-center gap-2 hover:text-[#151312]"><Mail className="h-4 w-4 shrink-0 text-[var(--portal-brand)]" /><span className="min-w-0 break-all">{b.contact_email}</span></a>}
            {b.contact_phone && <a href={`tel:${b.contact_phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-2 hover:text-[#151312]"><Phone className="h-4 w-4 shrink-0 text-[var(--portal-brand)]" />{b.contact_phone}</a>}
            {b.website && <a href={websiteHref(b.website)} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 items-center gap-2 hover:text-[#151312]"><Globe className="h-4 w-4 shrink-0 text-[var(--portal-brand)]" /><span className="min-w-0 break-all">{b.website.replace(/^https?:\/\//i, "")}</span></a>}
            {site?.address && <span className="inline-flex items-center gap-2"><MapPin className="h-4 w-4 shrink-0 text-[var(--portal-brand)]" />{site.address}</span>}
          </div>
        </div>
        <div className="border-t border-[#EDE3DB]">
          <div className="mx-auto flex max-w-6xl items-center justify-end px-4 py-4 sm:px-6">
            <a href="https://www.eventureos.com.au" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-[0.75rem] text-[#8C847D] hover:text-[#151312]">
              Powered by <Image src="/brand/eventureos-wordmark.png" width={86} height={13} alt="EventureOS" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
