import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { crewOrg, crewSession } from "@/lib/crew/server";
import { BottomNav, InstallPrompt, RegisterSW } from "./ui";
import { crewSignOut } from "./actions";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const org = await crewOrg(slug);
  const name = org ? `${org.name} Staff` : "Staff";
  return {
    title: { default: name, template: `%s · ${name}` },
    applicationName: name,
    manifest: `/crew/${slug}/manifest.webmanifest`,
    appleWebApp: { capable: true, title: name, statusBarStyle: "default" },
    icons: { apple: `/crew/${slug}/app-icon/180`, icon: `/crew/${slug}/app-icon/192` },
    robots: { index: false, follow: false },
  };
}

export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1, viewportFit: "cover", themeColor: "#ffffff" };

/** The staff app: phone-first, with a bottom tab bar like a native app. */
export default async function CrewLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const org = await crewOrg(slug);
  if (!org) notFound();
  const s = await crewSession(slug);
  const brand = /^#[0-9a-f]{6}$/i.test(org.brand_colour ?? "") ? org.brand_colour! : "#6028EC";
  return (
    <div className="min-h-[100dvh] bg-canvas" style={{ ["--crew-brand" as string]: brand }}>
      <RegisterSW slug={slug} />
      {s && (
        <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur" style={{ paddingTop: "env(safe-area-inset-top)" }}>
          <div className="mx-auto flex h-14 max-w-xl items-center gap-3 px-4">
            {org.logo_url && /^https:\/\//.test(org.logo_url)
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={org.logo_url} alt={org.name} className="h-8 max-w-[120px] object-contain" />
              : <span className="text-[0.9375rem] font-semibold text-ink">{org.name}</span>}
            <span className="ml-auto truncate text-[0.8125rem] text-ink-muted">Hi {s.member.name.split(" ")[0]}</span>
            <form action={crewSignOut}>
              <input type="hidden" name="slug" value={slug} />
              <button className="rounded-md px-2 py-1 text-[0.75rem] text-ink-faint hover:bg-zinc-100 hover:text-ink">Sign out</button>
            </form>
          </div>
        </header>
      )}
      <main className="mx-auto max-w-xl px-4 pb-28 pt-4">
        {s && <InstallPrompt appName={`${org.name} Staff`} />}
        {children}
      </main>
      {s && <BottomNav slug={slug} />}
    </div>
  );
}
