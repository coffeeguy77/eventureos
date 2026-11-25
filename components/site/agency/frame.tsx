import "@fontsource-variable/fraunces/opsz.css";
import "@fontsource-variable/fraunces/opsz-italic.css";
import "@fontsource-variable/manrope";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource/caveat/500.css";
import type { PublicOrg } from "@/lib/bookings/server";
import { SiteTracker } from "@/components/site/tracker";
import { AgencyHeader } from "./header";
import { AgencyFooter } from "./footer";

const FALLBACK = "#20392C";
export const accentOf = (c: string | null | undefined) => (c && /^#[0-9a-f]{6}$/i.test(c.trim()) ? c.trim() : FALLBACK);

/**
 * The agency design system ("Warm on the outside. Seriously clever on the inside."): warm linen, deep forest, sage and a
 * digital-lime accent; Fraunces for editorial headings, Manrope for everything you read, Caveat for the odd handwritten
 * note, JetBrains Mono for small technical details. One orchestrated hero entrance; everything respects reduced motion.
 * --ink is the deep forest used for dark panels (and headings on light ones); --text is body ink.
 */
export const AGENCY_CSS = `
.agency{--ink:#142D23;--ink2:#20392C;--forest:#20392C;--paper:#F5F1E8;--card:#FCFAF5;--sage:#A7AF98;--sage-pale:#E5E7D9;--line:#DCD7C9;--line-dark:rgba(252,250,245,.14);
  --muted:#525951;--text:#151914;--lime:#C4DC38;--lime-ink:#5B6B0E;--ac:#20392C;--on-ac:#FCFAF5;--ac-hi:#C9D3B4;--ac-ink:#20392C;
  --wrap:1520px;--r-lg:32px;--r-md:20px;--ease:cubic-bezier(.2,.7,.2,1);
  font-family:'Manrope Variable',system-ui,sans-serif;color:var(--text);-webkit-font-smoothing:antialiased}
.agency ::selection{background:var(--lime);color:var(--ink)}
.agency a:focus-visible,.agency button:focus-visible,.agency summary:focus-visible,.agency input:focus-visible,.agency select:focus-visible,.agency textarea:focus-visible{outline:2px solid var(--ink);outline-offset:3px;box-shadow:0 0 0 5px var(--lime);border-radius:10px}
.agency .ag-dark a:focus-visible,.agency .ag-dark button:focus-visible,.agency .ag-dark summary:focus-visible{outline-color:var(--lime);box-shadow:none}
.agency .ag-serif{font-family:'Fraunces Variable',Georgia,serif;font-optical-sizing:auto}
.agency .ag-hand{font-family:'Caveat',cursive}
.agency .ag-mono{font-family:'JetBrains Mono Variable',ui-monospace,monospace}
.agency .ag-grid{background-image:linear-gradient(rgba(252,250,245,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(252,250,245,.05) 1px,transparent 1px);background-size:56px 56px;mask-image:radial-gradient(ellipse 80% 70% at 70% 30%,#000 30%,transparent 75%)}
.agency .ag-glow{display:none}
.agency .ag-faq summary::-webkit-details-marker{display:none}
.agency .ag-faq[open] .ag-faq-body{animation:agIn .35s var(--ease)}
.agency .ag-in{opacity:0;animation:agIn .8s var(--ease) forwards}
.agency .ag-d1{animation-delay:.06s}.agency .ag-d2{animation-delay:.2s}.agency .ag-d3{animation-delay:.34s}.agency .ag-d4{animation-delay:.5s}
.agency .ag-reveal{animation:agReveal 1.1s .15s var(--ease) both}
.agency .ag-draw{stroke-dasharray:420;animation:agDraw 1.2s .7s var(--ease) both}
.agency .ag-arrow{transition:translate .25s var(--ease)}
.agency a:hover .ag-arrow,.agency button:hover .ag-arrow{translate:2px -2px}
.agency .ag-zoom img,.agency .ag-zoom svg.ag-zoom-target{transition:scale .6s var(--ease)}
.agency .ag-zoom:hover img,.agency .ag-zoom:hover svg.ag-zoom-target{scale:1.03}
.agency .ag-blink{animation:agBlink 1.1s steps(1) infinite}
@keyframes agIn{from{opacity:0;translate:0 14px}to{opacity:1;translate:none}}
@keyframes agReveal{from{opacity:0;scale:1.04}to{opacity:1;scale:1}}
@keyframes agDraw{from{stroke-dashoffset:420}to{stroke-dashoffset:0}}
@keyframes agBlink{50%{opacity:0}}
@media (prefers-reduced-motion:reduce){.agency .ag-in,.agency .ag-draw,.agency .ag-reveal,.agency .ag-blink,.agency .ag-faq[open] .ag-faq-body{animation:none;opacity:1;scale:none}.agency *{scroll-behavior:auto!important;transition:none!important}}
`;

/** The frame for an agency's (Nerd Herd business's) public site: its own header, menu and footer. */
export function AgencyFrame({ org, children }: { org: PublicOrg; children: React.ReactNode }) {
  return (
    <div className="agency min-h-screen bg-[var(--paper)]">
      <style>{AGENCY_CSS}</style>
      <a href="#main" className="sr-only z-[100] rounded-full bg-[var(--lime)] px-5 py-3 font-semibold text-[var(--ink)] focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to content</a>
      <SiteTracker slug={org.slug} section="other" />
      <AgencyHeader org={org} />
      <main id="main">{children}</main>
      <AgencyFooter org={org} />
    </div>
  );
}
