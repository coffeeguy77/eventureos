import type { Viewport } from "next";
import Image from "next/image";
import { Logo, SLOGAN, Wordmark } from "@/components/shell/sidebar";

/** Dark status bar on phones, to run into the dark hero */
export const viewport: Viewport = { themeColor: "#070B1F" };

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen bg-[#070B1F] lg:grid-cols-[1fr_1.05fr] lg:bg-transparent">
      <div className="pt-safe pb-safe relative flex flex-col justify-center overflow-hidden px-4 py-8 sm:px-12 sm:py-12 lg:overflow-visible lg:px-20">
        {/* Phones and tablets: the dark hero with the bird, then the form on a card */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(96,40,236,0.6),transparent_62%)] lg:hidden" />
        <div className="relative mx-auto w-full max-w-[420px] lg:max-w-[380px]">
          <div className="mb-6 px-1 text-white lg:hidden">
            <a href="/" aria-label="EventureOS home"><Wordmark height={28} tone="light" /></a>
            <p className="mt-2 text-[0.6875rem] tracking-[0.16em] text-white/60">The operating system for event businesses.</p>
            <Image src="/brand/mascot.png" alt="The EventureOS early bird" width={900} height={759} priority
              className="mx-auto mt-5 h-auto w-[210px] drop-shadow-[0_20px_36px_rgba(96,40,236,0.5)] sm:w-[250px]" />
            <p className="mt-4 text-[1.625rem] font-semibold leading-tight tracking-tight">{SLOGAN}</p>
            <p className="mt-1.5 text-[0.9375rem] leading-snug text-white/75">Every enquiry, event, quote and invoice — finally in one place.</p>
          </div>
          <div className="rounded-2xl bg-surface p-5 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.6)] sm:p-7 lg:rounded-none lg:bg-transparent lg:p-0 lg:shadow-none">
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
  );
}
