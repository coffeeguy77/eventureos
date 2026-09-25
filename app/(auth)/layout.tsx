import { Logo } from "@/components/shell/sidebar";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.05fr]">
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12 lg:px-20">
        <div className="mx-auto w-full max-w-[380px]">
          <div className="mb-10 flex items-center gap-2.5">
            <Logo size={30} />
            <span className="text-[16px] font-semibold tracking-tight">EventureOS</span>
          </div>
          {children}
        </div>
      </div>
      <div className="relative hidden overflow-hidden bg-[#15122B] lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(109,74,255,0.55),transparent_60%)]" />
        <div className="relative flex h-full flex-col justify-end p-14 text-white">
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
  );
}
