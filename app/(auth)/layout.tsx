import { Wordmark } from "@/components/shell/sidebar";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.05fr]">
      <div className="pt-safe pb-safe flex flex-col justify-center px-5 py-10 sm:px-12 sm:py-12 lg:px-20">
        <div className="mx-auto w-full max-w-[380px]">
          <div className="mb-8 sm:mb-10">
            <Wordmark height={30} />
          </div>
          {children}
        </div>
      </div>
      <div className="relative hidden overflow-hidden bg-[#070B1F] lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(96,40,236,0.55),transparent_60%)]" />
        <div className="relative flex h-full flex-col justify-between p-14 text-white">
          <div>
            <Wordmark height={34} tone="light" />
            <p className="mt-3 text-[13px] tracking-[0.18em] text-white/60">The operating system for event businesses.</p>
          </div>
          <div>
          <p className="max-w-md text-[28px] font-semibold leading-tight tracking-tight">
            Every enquiry, event, quote and invoice — finally in one place.
          </p>
          <p className="mt-4 max-w-md text-[14px] text-white/70">
            Enquiry → customer → event → quote → acceptance → calendar → delivery → invoice → payment.
          </p>
          <div className="mt-10 grid max-w-md grid-cols-3 gap-3 text-[12px] text-white/70">
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
