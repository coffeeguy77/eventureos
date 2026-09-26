import Image from "next/image";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Globe, Mail, Phone } from "lucide-react";
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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div style={brandVars(b.brand_colour)} className="flex min-h-screen flex-col overflow-x-clip bg-[#FAFAFB]">
      <header className="pt-safe sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur sm:static sm:bg-white sm:backdrop-blur-none">
        <div className="h-1 bg-[var(--portal-brand)]" />
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3 sm:gap-4 sm:px-6 sm:py-4">
          <Link href={`/p/${slug}`} className="flex min-w-0 items-center gap-3">
            <BrandMark name={b.name} logoUrl={b.logo_url} />
            {!b.logo_url && <span className="truncate text-[15px] font-semibold tracking-tight text-ink">{b.name}</span>}
          </Link>
          {user && (
            <div className="flex min-w-0 shrink-0 items-center gap-3">
              <span className="hidden truncate text-[12.5px] text-ink-muted sm:inline">{user.email}</span>
              <form action={portalSignOut}>
                <input type="hidden" name="slug" value={slug} />
                <button className="h-10 rounded-lg px-3 text-[13px] font-medium text-ink-muted ring-1 ring-inset ring-line hover:bg-zinc-50 hover:text-ink sm:h-auto sm:px-2.5 sm:py-1.5 sm:text-[12.5px]">
                  Sign out
                </button>
              </form>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto w-full min-w-0 max-w-4xl flex-1 px-4 py-6 sm:px-6 sm:py-10">{children}</main>

      <footer className="border-t border-line bg-white">
        <div className="pb-safe mx-auto flex max-w-4xl flex-col gap-3 px-4 py-6 text-[12.5px] text-ink-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex min-w-0 flex-col gap-y-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-1.5">
            <span className="font-medium text-ink">{b.name}</span>
            {b.contact_email && (
              <a href={`mailto:${b.contact_email}`} className="inline-flex min-w-0 items-center gap-1.5 hover:text-ink">
                <Mail className="h-3.5 w-3.5 shrink-0" /><span className="min-w-0 break-all">{b.contact_email}</span>
              </a>
            )}
            {b.contact_phone && (
              <a href={`tel:${b.contact_phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1.5 hover:text-ink">
                <Phone className="h-3.5 w-3.5 shrink-0" />{b.contact_phone}
              </a>
            )}
            {b.website && (
              <a href={websiteHref(b.website)} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 items-center gap-1.5 hover:text-ink">
                <Globe className="h-3.5 w-3.5 shrink-0" /><span className="min-w-0 break-all">{b.website.replace(/^https?:\/\//i, "")}</span>
              </a>
            )}
          </div>
          <a href="https://www.eventureos.com.au" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-faint hover:text-ink">
            Powered by <Image src="/brand/eventureos-wordmark.png" width={73} height={11} alt="EventureOS" className="opacity-80" />
          </a>
        </div>
      </footer>
    </div>
  );
}
