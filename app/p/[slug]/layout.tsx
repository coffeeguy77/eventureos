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
    <div style={brandVars(b.brand_colour)} className="flex min-h-screen flex-col bg-[#FAFAFB]">
      <div className="h-1 bg-[var(--portal-brand)]" />
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href={`/p/${slug}`} className="flex min-w-0 items-center gap-3">
            <BrandMark name={b.name} logoUrl={b.logo_url} />
            {!b.logo_url && <span className="truncate text-[15px] font-semibold tracking-tight text-ink">{b.name}</span>}
          </Link>
          {user && (
            <div className="flex min-w-0 items-center gap-3">
              <span className="hidden truncate text-[12.5px] text-ink-muted sm:inline">{user.email}</span>
              <form action={portalSignOut}>
                <input type="hidden" name="slug" value={slug} />
                <button className="rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium text-ink-muted ring-1 ring-inset ring-line hover:bg-zinc-50 hover:text-ink">
                  Sign out
                </button>
              </form>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 sm:py-10">{children}</main>

      <footer className="border-t border-line bg-white">
        <div className="mx-auto flex max-w-4xl flex-col gap-3 px-4 py-6 text-[12.5px] text-ink-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <span className="font-medium text-ink">{b.name}</span>
            {b.contact_email && (
              <a href={`mailto:${b.contact_email}`} className="inline-flex items-center gap-1.5 hover:text-ink">
                <Mail className="h-3.5 w-3.5" />{b.contact_email}
              </a>
            )}
            {b.contact_phone && (
              <a href={`tel:${b.contact_phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1.5 hover:text-ink">
                <Phone className="h-3.5 w-3.5" />{b.contact_phone}
              </a>
            )}
            {b.website && (
              <a href={websiteHref(b.website)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 hover:text-ink">
                <Globe className="h-3.5 w-3.5" />{b.website.replace(/^https?:\/\//i, "")}
              </a>
            )}
          </div>
          <span className="text-[11.5px] text-ink-faint">Powered by EventureOS</span>
        </div>
      </footer>
    </div>
  );
}
