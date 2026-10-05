import Link from "next/link";
import type { PublicOrg } from "@/lib/bookings/server";
import { EmbedBridge } from "./embed-bridge";

export const safeColour = (c?: string | null) => (c && /^#[0-9a-f]{6}$/i.test(c) ? c : "#6028EC");
/** Readable text on the brand colour */
export function onColour(hex: string) {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const L = 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  return 1.05 / (L + 0.05) >= (L + 0.05) / 0.0556 ? "#ffffff" : "#111111";
}
export function brandStyle(org: Pick<PublicOrg, "brand_colour">): React.CSSProperties {
  const b = safeColour(org.brand_colour);
  return { ["--b" as string]: b, ["--on-b" as string]: onColour(b) };
}

/** Desktop page width for public pages (phones and tablets get the full width with side padding). */
export const PAGE = "mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-10";

/** The frame around every public booking page. In the website widget (embed) there's no header, and the frame resizes itself. */
export function BookShell({ org, embed, children, back, wide }: { org: PublicOrg; embed: boolean; children: React.ReactNode; back?: { href: string; label: string }; wide?: boolean }) {
  const q = embed ? "?embed=1" : "";
  return (
    <div data-book-root style={brandStyle(org)} className={embed ? "bg-transparent px-1 py-2" : "min-h-screen bg-canvas"}>
      {embed && <><EmbedBridge /><style>{"html,body{background:transparent!important;min-height:0!important;height:auto!important}"}</style></>}
      {!embed && (
        <header className="border-b border-line bg-surface">
          <div className={`${PAGE} flex h-16 items-center gap-3`}>
            <Link href={`/book/${org.slug}`} className="flex min-w-0 items-center gap-3">
              {org.logo_url && /^https:\/\//.test(org.logo_url)
                ? <img src={org.logo_url} alt={org.name} className="h-9 max-w-[160px] object-contain" />
                : <span className="truncate text-[1.0625rem] font-semibold text-ink">{org.name}</span>}
            </Link>
            <span className="flex-1" />
            {org.website && /^https?:\/\//.test(org.website) && <a href={org.website} className="text-[0.8125rem] font-medium text-ink-muted hover:text-ink">Back to website</a>}
          </div>
        </header>
      )}
      <main className={embed ? (wide ? "" : "mx-auto max-w-3xl") : `${PAGE} py-6 sm:py-10`}>
        {back && <Link href={back.href + q} className="mb-4 inline-flex items-center gap-1 text-[0.8125rem] font-medium text-ink-muted hover:text-ink">← {back.label}</Link>}
        {children}
      </main>
      {!embed && (
        <footer className="pb-10 pt-4 text-center text-[0.75rem] text-ink-faint">
          {[org.contact_phone, org.contact_email].filter(Boolean).join(" · ")}
          <p className="mt-1">Secure booking by EventureOS</p>
        </footer>
      )}
    </div>
  );
}
