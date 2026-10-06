/** Simple line illustrations for the hire options (used when the business hasn't uploaded its own photos). */
type P = { className?: string };
const S = { fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export function CartArt({ className }: P) {
  return (
    <svg viewBox="0 0 160 120" className={className} aria-hidden>
      <g {...S}>
        <path d="M22 44h116v44H22z" />
        <path d="M18 44h124" />
        <path d="M30 44V30a6 6 0 0 1 6-6h88a6 6 0 0 1 6 6v14" />
        <path d="M40 24l6-12h68l6 12" />
        <rect x="58" y="54" width="44" height="26" rx="4" />
        <path d="M70 54v-8h20v8" />
        <path d="M74 80v-6M86 80v-6" />
        <circle cx="42" cy="98" r="9" /><circle cx="118" cy="98" r="9" />
        <path d="M22 88h116" />
        <path d="M30 62h16M30 70h12M114 62h16M118 70h12" opacity=".55" />
      </g>
    </svg>
  );
}

export function VanArt({ className }: P) {
  return (
    <svg viewBox="0 0 160 120" className={className} aria-hidden>
      <g {...S}>
        <path d="M14 88V42a12 12 0 0 1 12-12h76l26 22h10a8 8 0 0 1 8 8v28" />
        <path d="M14 88h132" />
        <path d="M102 30v22h26" />
        <rect x="28" y="42" width="58" height="26" rx="3" />
        <path d="M28 52h58" />
        <path d="M24 42l-6-8M90 42l6-8" opacity=".55" />
        <path d="M40 62h12M60 62h14" opacity=".55" />
        <circle cx="42" cy="92" r="10" /><circle cx="120" cy="92" r="10" />
        <path d="M108 62h12" />
      </g>
    </svg>
  );
}

export function KitArt({ className }: P) {
  return (
    <svg viewBox="0 0 160 120" className={className} aria-hidden>
      <g {...S}>
        <rect x="26" y="34" width="72" height="56" rx="6" />
        <path d="M26 46h72" />
        <circle cx="46" cy="40" r="2" /><circle cx="56" cy="40" r="2" />
        <path d="M40 58h18v8a9 9 0 0 1-18 0z" /><path d="M66 58h18v8a9 9 0 0 1-18 0z" />
        <path d="M49 74v8M75 74v8" opacity=".55" />
        <path d="M20 90h84" />
        <path d="M118 90V62h22v28" />
        <path d="M114 62h30l-6-22h-18z" />
        <path d="M122 40l2-10h10l2 10" />
        <path d="M112 90h36" />
      </g>
    </svg>
  );
}

export function CateringArt({ className }: P) {
  return (
    <svg viewBox="0 0 160 120" className={className} aria-hidden>
      <g {...S}>
        <path d="M18 82h124" />
        <path d="M28 82a52 40 0 0 1 104 0" />
        <path d="M80 42v-8M74 34h12" />
        <path d="M44 92h72" opacity=".55" />
        <path d="M50 66c6-6 14-8 20-6M92 58c8 0 14 4 18 10" opacity=".55" />
      </g>
    </svg>
  );
}

export function CupArt({ className }: P) {
  return (
    <svg viewBox="0 0 160 120" className={className} aria-hidden>
      <g {...S}>
        <path d="M50 30h60l-8 72H58z" />
        <path d="M46 30h68v-8H46z" />
        <circle cx="80" cy="64" r="16" />
        <path d="M72 64c4-6 12-6 16 0" opacity=".55" />
      </g>
    </svg>
  );
}

export const KIND_ART = { cart: CartArt, van: VanArt, diy: KitArt };
