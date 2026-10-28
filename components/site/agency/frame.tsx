import "@fontsource-variable/fraunces";
import type { PublicOrg } from "@/lib/bookings/server";
import { onColour } from "@/components/book/shell";
import { SiteTracker } from "@/components/site/tracker";
import { AgencyHeader } from "./header";
import { AgencyFooter } from "./footer";

const FALLBACK = "#6D28D9";
export const accentOf = (c: string | null | undefined) => (c && /^#[0-9a-f]{6}$/i.test(c.trim()) ? c.trim() : FALLBACK);

/** Page-level styles: focus rings, the one orchestrated hero entrance, grid backdrop, reduced motion. */
const CSS = `
.agency{--ink:#0F0B1E;--ink2:#1A1530;--paper:#F5F4FA;--line:#E2DFEC;--muted:#575270;--lime:#C8F560;--ac-hi:color-mix(in srgb,var(--ac) 55%,#fff);--ac-ink:color-mix(in srgb,var(--ac) 82%,#000);-webkit-font-smoothing:antialiased}
.agency ::selection{background:var(--lime);color:var(--ink)}
.agency a:focus-visible,.agency button:focus-visible,.agency summary:focus-visible,.agency input:focus-visible,.agency select:focus-visible,.agency textarea:focus-visible{outline:2px solid var(--lime);outline-offset:3px;box-shadow:0 0 0 5px var(--ink)}
.agency .ag-light a:focus-visible,.agency .ag-light button:focus-visible,.agency .ag-light summary:focus-visible,.agency .ag-light input:focus-visible,.agency .ag-light select:focus-visible,.agency .ag-light textarea:focus-visible{outline-color:var(--ac);box-shadow:none}
.agency .ag-serif{font-family:'Fraunces Variable',Georgia,serif;font-optical-sizing:auto}
.agency .ag-grid{background-image:linear-gradient(rgba(255,255,255,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.045) 1px,transparent 1px);background-size:56px 56px;mask-image:radial-gradient(ellipse 80% 70% at 70% 30%,#000 30%,transparent 75%)}
.agency .ag-glow{background:radial-gradient(60% 60% at 75% 20%,color-mix(in srgb,var(--ac) 45%,transparent),transparent 70%),radial-gradient(30% 40% at 95% 85%,color-mix(in srgb,var(--lime) 14%,transparent),transparent 70%)}
.agency .ag-faq summary::-webkit-details-marker{display:none}
.agency .ag-in{opacity:0;animation:agIn .7s cubic-bezier(.2,.7,.2,1) forwards}
.agency .ag-d1{animation-delay:.08s}.agency .ag-d2{animation-delay:.28s}.agency .ag-d3{animation-delay:.48s}
.agency .ag-draw{animation:agDraw 1.4s .4s cubic-bezier(.3,.7,.2,1) both}
.agency .ag-blink{animation:agBlink 1.1s steps(1) infinite}
@keyframes agIn{from{opacity:0;translate:0 12px}to{opacity:1;translate:none}}
@keyframes agDraw{from{stroke-dashoffset:420}}
@keyframes agBlink{50%{opacity:0}}
@media (prefers-reduced-motion:reduce){.agency .ag-in,.agency .ag-draw,.agency .ag-blink{animation:none;opacity:1}.agency *{scroll-behavior:auto!important;transition:none!important}}
`;

/** The frame for an agency's (Nerd Herd business's) public site: its own header, menu and footer. */
export function AgencyFrame({ org, children }: { org: PublicOrg; children: React.ReactNode }) {
  const ac = accentOf(org.brand_colour);
  return (
    <div style={{ ["--ac" as string]: ac, ["--on-ac" as string]: onColour(ac) }} className="agency min-h-screen bg-[var(--paper)] font-sans text-[var(--ink)]">
      <style>{CSS}</style>
      <a href="#main" className="sr-only z-[100] rounded-full bg-[var(--lime)] px-5 py-3 font-semibold text-[var(--ink)] focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to content</a>
      <SiteTracker slug={org.slug} section="other" />
      <AgencyHeader org={org} />
      <main id="main">{children}</main>
      <AgencyFooter org={org} />
    </div>
  );
}
