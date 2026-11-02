import Image from "next/image";

/**
 * "Works with" logos — the sign-in page and the homepage use the same list.
 * Brand files live in /public/brand/integrations — each company's own logo files (Square, Twilio and Anthropic supplied by Shaun).
 */
export const INTEGRATIONS = [
  { key: "gmail", name: "Gmail", file: "gmail.svg", h: "h-7", invert: false, mono: false },
  { key: "google-calendar", name: "Google Calendar", file: "google-calendar.svg", h: "h-8", invert: false, mono: false },
  { key: "xero", name: "Xero", file: "xero.svg", h: "h-9", invert: false, mono: false },
  { key: "stripe", name: "Stripe", file: "stripe.svg", h: "h-8", invert: true, mono: false },
  // black wordmarks: shown in white on dark backgrounds
  { key: "square", name: "Square", file: "square.png", h: "h-6", invert: true, mono: true },
  { key: "twilio", name: "Twilio", file: "twilio.png", h: "h-7", invert: false, mono: false },
  { key: "anthropic", name: "Anthropic", file: "anthropic.svg", h: "h-3.5", invert: true, mono: true },
] as const;

export const INTEGRATION_NAMES = INTEGRATIONS.map((i) => i.name);

/** A row of logos. dark = on a dark background (Stripe's purple wordmark is shown in white there). */
export function IntegrationLogos({ dark = false, className = "" }: { dark?: boolean; className?: string }) {
  return (
    <ul className={`flex flex-wrap items-center gap-x-8 gap-y-4 ${className}`} aria-label={`Works with ${INTEGRATION_NAMES.join(", ")}`}>
      {INTEGRATIONS.map((i) => (
        <li key={i.key} title={i.name} className="flex items-center">
          <Image src={`/brand/integrations/${i.file}`} alt={i.name} width={96} height={40} unoptimized className={`${i.h} w-auto ${i.invert && dark ? "brightness-0 invert" : ""} ${i.mono ? "logo-mono" : ""}`} />
        </li>
      ))}
    </ul>
  );
}
