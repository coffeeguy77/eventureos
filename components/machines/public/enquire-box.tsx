import { ArrowRight, MessageSquareText, Sparkles } from "lucide-react";

/** On a machine's shop page: the price and "Enquire" instead of add-to-cart (machines are sold by enquiry). */
export function MachineEnquireBox({ price, currency, href, chooser }: { price: number | null; currency: string; href: string; chooser: string | null }) {
  const money = (n: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  return (
    <div className="rounded-[24px] bg-white p-6 shadow-[0_18px_40px_-28px_rgba(80,45,40,.35)]">
      {price !== null && <p className="text-[2.25rem] font-semibold leading-none">{money(price)}<span className="ml-2 text-[0.9375rem] font-normal text-[#6B645F]">inc GST</span></p>}
      <p className="mt-3 text-[1rem] text-[#4a4743]">Send us an enquiry and we&apos;ll come back to you with availability and delivery.</p>
      <a href={href} className="shop-btn mt-5 inline-flex h-[56px] w-full items-center justify-center gap-2 rounded-full bg-[var(--pk)] px-8 text-[1.0625rem] font-semibold text-white"><MessageSquareText className="h-5 w-5" />Enquire about this machine</a>
      {chooser && <a href={chooser} className="mt-3 inline-flex w-full items-center justify-center gap-1.5 text-[0.9375rem] font-semibold text-[#2A2522] hover:underline"><Sparkles className="h-4 w-4" />Not sure? Use the machine chooser<ArrowRight className="h-4 w-4" /></a>}
    </div>
  );
}
