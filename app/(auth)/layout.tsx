import type { Viewport } from "next";
import Image from "next/image";
import { Logo, SLOGAN, Wordmark } from "@/components/shell/sidebar";

/** Dark status bar on phones, to run into the dark hero */
export const viewport: Viewport = { themeColor: "#070B1F" };

/*
 * Phones and tablets: the page is dark all the way to the edges (Safari tints its top and bottom bars from the
 * page background), and the form sits on purple glass with hot-pink outlines and pink text. Desktop is untouched.
 */
const MOBILE_CSS = `
@media (max-width: 1023.98px) {
  html, body { background: #070B1F; }
  .auth-card {
    background: linear-gradient(160deg, rgba(139, 92, 246, 0.26), rgba(76, 29, 149, 0.20) 60%, rgba(236, 72, 153, 0.10));
    -webkit-backdrop-filter: blur(20px) saturate(150%); backdrop-filter: blur(20px) saturate(150%);
    border: 1px solid rgba(255, 122, 184, 0.28);
    box-shadow: 0 24px 60px -24px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.10);
  }
  .auth-card h1, .auth-card label, .auth-card p:not([role=alert]) { color: #FF9ECF; }
  .auth-card a { color: #FF5FA8; font-weight: 600; }
  .auth-card input:not([type=hidden]):not([type=checkbox]), .auth-card select, .auth-card textarea {
    background: rgba(255, 255, 255, 0.06); color: #FF9ECF; caret-color: #FF5FA8; border: 1px solid #FF3D8B; box-shadow: none;
    font-size: 16px; /* no zoom-in on iPhone */
  }
  /* Field names sit inside the fields (as placeholders); the labels stay for screen readers */
  .auth-card label { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
  .auth-card input:not([type=hidden]):not([type=checkbox]) { height: 46px; padding-left: 14px; padding-right: 14px; }
  .auth-card form.space-y-4 > :not([hidden]) ~ :not([hidden]) { margin-top: 14px; }
  .auth-card input::placeholder, .auth-card textarea::placeholder { color: rgba(255, 158, 207, 0.6); opacity: 1; }
  .auth-card input:focus, .auth-card select:focus, .auth-card textarea:focus { border-color: #FF5FA8; box-shadow: 0 0 0 3px rgba(255, 61, 139, 0.28); outline: none; }
  /* Browser autofill (Safari/Chrome paint filled fields yellow or white): cover it with the glass colour.
     These must outrank the input rule above, which sets box-shadow: none. */
  .auth-card input:not([type=hidden]):-webkit-autofill,
  .auth-card input:not([type=hidden]):-webkit-autofill:hover,
  .auth-card input:not([type=hidden]):-webkit-autofill:focus {
    -webkit-box-shadow: 0 0 0 1000px #2A1260 inset !important; box-shadow: 0 0 0 1000px #2A1260 inset !important;
    -webkit-text-fill-color: #FF9ECF !important; caret-color: #FF5FA8; background-color: #2A1260 !important;
    border: 1px solid #FF3D8B; transition: background-color 99999s ease-out 0s;
  }
  .auth-card input:not([type=hidden]):autofill {
    box-shadow: 0 0 0 1000px #2A1260 inset !important; -webkit-text-fill-color: #FF9ECF !important; background-color: #2A1260 !important;
  }
  .auth-card button[class*="bg-brand-500"] { background: #FF3D8B; color: #ffffff; box-shadow: 0 10px 24px -10px rgba(255, 61, 139, 0.8); }
  .auth-card button[class*="bg-brand-500"]:disabled { opacity: 0.7; }
}
/* Desktop keeps its labels above the fields, so no placeholders there */
@media (min-width: 1024px) {
  .auth-card input::placeholder { color: transparent; }
}`;

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
    <style>{MOBILE_CSS}</style>
    <div className="grid min-h-screen bg-[#070B1F] lg:grid-cols-[1fr_1.05fr] lg:bg-transparent">
      <div className="pt-safe pb-safe relative flex flex-col justify-start overflow-hidden px-4 py-5 sm:justify-center sm:px-12 sm:py-12 lg:overflow-visible lg:px-20">
        {/* Phones and tablets: the dark hero with the bird, then the form on a card */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(96,40,236,0.6),transparent_62%)] lg:hidden" />
        <div className="relative mx-auto w-full max-w-[420px] lg:max-w-[380px]">
          <div className="mb-4 mt-3 px-1 text-white lg:hidden">
            <a href="/" aria-label="EventureOS home"><Wordmark height={28} tone="light" /></a>
            <p className="mt-1.5 text-[0.6875rem] tracking-[0.14em] text-white/60">The operating system for event businesses.</p>
            <Image src="/brand/mascot.png" alt="The EventureOS early bird" width={900} height={759} priority
              className="mx-auto mt-2 h-auto w-[170px] drop-shadow-[0_20px_36px_rgba(96,40,236,0.5)] sm:w-[250px]" />
            <p className="mt-2 text-[1.5rem] font-semibold leading-tight tracking-tight">{SLOGAN}</p>
          </div>
          <div className="auth-card rounded-2xl p-6 sm:p-7 lg:rounded-none lg:p-0">
            <div className="mb-8 hidden sm:mb-10 lg:block">
              <a href="/" aria-label="EventureOS home" className="inline-flex items-center gap-2.5"><Logo size={40} /><Wordmark height={26} /></a>
            </div>
            {children}
          </div>
        </div>
      </div>
      <div className="relative hidden overflow-hidden bg-[#070B1F] lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(96,40,236,0.55),transparent_60%)]" />
        <div className="relative flex h-full flex-col justify-between p-14 text-white">
          <div>
            <a href="/" aria-label="EventureOS home"><Wordmark height={34} tone="light" /></a>
            <p className="mt-3 text-[0.8125rem] tracking-[0.18em] text-white/60">The operating system for event businesses.</p>
          </div>
          <div>
          <Image src="/brand/mascot.png" alt="The EventureOS early bird" width={900} height={759} priority
            className="-ml-4 mb-6 h-auto w-[300px] drop-shadow-[0_24px_40px_rgba(96,40,236,0.45)] xl:w-[360px]" />
          <p className="max-w-md text-[2rem] font-semibold leading-tight tracking-tight">{SLOGAN}</p>
          <p className="mt-3 max-w-md text-[1.0625rem] leading-snug text-white/80">
            Every enquiry, event, quote and invoice — finally in one place.
          </p>
          <p className="mt-4 max-w-md text-[0.875rem] text-white/70">
            Enquiry → customer → event → quote → acceptance → calendar → delivery → invoice → payment.
          </p>
          <div className="mt-10 grid max-w-md grid-cols-3 gap-3 text-[0.75rem] text-white/70">
            {["Gmail", "Google Calendar", "Xero"].map((i) => (
              <div key={i} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">{i}</div>
            ))}
          </div>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
