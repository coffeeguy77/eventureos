import Image from "next/image";
import { MessageSquare, Sparkles, Store } from "lucide-react";

/**
 * "Works with" logos — the sign-in page and the homepage use the same list.
 * Brand files live in /public/brand/integrations (from each company's own brand / press kit). Until a file is added
 * (file: null), the name is shown with a plain icon instead — never a home-made copy of someone's logo.
 */
export const INTEGRATIONS = [
  { key: "gmail", name: "Gmail", file: "gmail.svg", h: "h-7", invert: false, icon: null },
  { key: "google-calendar", name: "Google Calendar", file: "google-calendar.svg", h: "h-8", invert: false, icon: null },
  { key: "xero", name: "Xero", file: "xero.svg", h: "h-9", invert: false, icon: null },
  { key: "stripe", name: "Stripe", file: "stripe.svg", h: "h-8", invert: true, icon: null },
  { key: "square", name: "Square", file: null, h: "h-7", invert: false, icon: Store },
  { key: "twilio", name: "Twilio", file: null, h: "h-7", invert: false, icon: MessageSquare },
  { key: "anthropic", name: "Anthropic", file: null, h: "h-7", invert: false, icon: Sparkles },
] as const;

export const INTEGRATION_NAMES = INTEGRATIONS.map((i) => i.name);

/** A row of logos. dark = on a dark background (Stripe's purple wordmark is shown in white there). */
export function IntegrationLogos({ dark = false, className = "" }: { dark?: boolean; className?: string }) {
  return (
    <ul className={`flex flex-wrap items-center gap-x-8 gap-y-4 ${className}`} aria-label={`Works with ${INTEGRATION_NAMES.join(", ")}`}>
      {INTEGRATIONS.map((i) => (
        <li key={i.key} title={i.name} className="flex items-center">
          {i.file
            ? <Image src={`/brand/integrations/${i.file}`} alt={i.name} width={96} height={40} unoptimized className={`${i.h} w-auto ${i.invert && dark ? "brightness-0 invert" : ""}`} />
            : <span className={`inline-flex items-center gap-1.5 text-[1rem] font-semibold tracking-tight ${dark ? "text-white/85" : "text-[rgb(var(--ink,24_24_27))]"}`}>{i.icon && <i.icon className="h-5 w-5" aria-hidden />}{i.name}</span>}
        </li>
      ))}
    </ul>
  );
}
