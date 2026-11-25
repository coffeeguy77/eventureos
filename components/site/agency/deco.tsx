/**
 * The agency's small set of hand-drawn marks and illustrations: lime underline strokes, a hand-drawn arrow, code
 * brackets, a cursor, a coffee cup, the code-bracket wordmark, and two illustrated scenes (the hero workspace and a
 * laptop showing a website editor). Illustrations are drawings, never presented as screenshots of real software.
 * All decorative SVG is aria-hidden.
 */

/** Hand-drawn lime underline. `draw` animates it in once. */
export function Underline({ className = "", draw = false, color = "var(--lime)" }: { className?: string; draw?: boolean; color?: string }) {
  return (
    <svg viewBox="0 0 300 18" preserveAspectRatio="none" aria-hidden className={className} fill="none">
      <path className={draw ? "ag-draw" : undefined} d="M3 12.5C52 6.5 118 4 178 5.5c40 1 82 3.6 118 7" stroke={color} strokeWidth="5" strokeLinecap="round" />
      <path d="M40 15c38-3.4 92-4.6 150-3.4" stroke={color} strokeWidth="2.6" strokeLinecap="round" opacity=".7" />
    </svg>
  );
}

/** A loose hand-drawn arrow, curving down-right. */
export function HandArrow({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 90 60" aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8c18-4 42 0 56 14 8 8 12 18 13 28" />
      <path d="M62 42l11 10 8-14" />
    </svg>
  );
}

/** Straight hand-drawn connector arrow (process steps). */
export function StepArrow({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 20" aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11c16-2.4 34-2.6 54-1" /><path d="M48 3.5l9 6.5-9 6.5" />
    </svg>
  );
}

/** Small coffee cup with steam — the one coffee illustration. */
export function Cup({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 17h20v7c0 5.5-4.5 10-10 10s-10-4.5-10-10v-7z" />
      <path d="M28 19.5h2.6a3.6 3.6 0 010 7.2H27" />
      <path d="M6 37.5h24" />
      <path d="M14 12c-1.6-2 1.6-3.6 0-5.8M19.5 12c-1.6-2 1.6-3.6 0-5.8" />
    </svg>
  );
}

/** Code brackets doodle. */
export function Brackets({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 32" aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 5L3.5 16 13 27M35 5l9.5 11L35 27M28 3l-8 26" />
    </svg>
  );
}

/** Cursor pointer doodle. */
export function Cursor({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 32" aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round">
      <path d="M4 3l19 12.5-8.2 1.6 4.8 9.4-4 2-4.8-9.6L4.6 24.6z" fill="var(--card)" />
    </svg>
  );
}

/** Three little "spark" strokes, as in a hand-drawn annotation. */
export function Sparks({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 30 30" aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
      <path d="M6 13L3 4M14 10l2-8M20 17l8-4" />
    </svg>
  );
}

/** The code-bracket symbol of the wordmark: lime brackets, a slash in the wordmark's ink. */
export function BracketMark({ className = "", slash = "currentColor" }: { className?: string; slash?: string }) {
  return (
    <svg viewBox="0 0 44 32" aria-hidden className={className} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 6L3.5 16 12 26M32 6l8.5 10L32 26" stroke="var(--lime)" strokeWidth="4.2" />
      <path d="M26 3.5l-8 25" stroke={slash} strokeWidth="4.2" />
    </svg>
  );
}

/** Wordmark: </> + the business name in bold, clean type. `tone` picks the variant for light or dark backgrounds. */
export function AgencyWordmark({ name, tone = "light", size = "md" }: { name: string; tone?: "light" | "dark"; size?: "md" | "lg" }) {
  const ink = tone === "light" ? "var(--ink)" : "var(--card)";
  return (
    <span className="inline-flex items-center gap-2.5" style={{ color: ink }}>
      <BracketMark className={`wm-mark ${size === "lg" ? "h-9 w-12" : "h-7 w-10"}`} slash="var(--lime)" />
      <span className={`wm font-bold tracking-[-0.03em] ${size === "lg" ? "text-[2rem]" : "text-[1.5rem] sm:text-[1.625rem]"}`}>{name}</span>
    </span>
  );
}

/** The organic image shape (left edge flows in like the reference), as a clip path in the element's own units. */
export function OrganicClip({ id }: { id: string }) {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden focusable="false">
      <clipPath id={id} clipPathUnits="objectBoundingBox">
        <path d="M0.2,0 H1 V1 H0.16 C0.08,1 0.035,0.955 0.05,0.88 C0.07,0.79 0.13,0.74 0.115,0.64 C0.1,0.54 0.02,0.49 0.025,0.38 C0.03,0.27 0.1,0.22 0.11,0.13 C0.12,0.05 0.15,0 0.2,0 Z" />
      </clipPath>
    </svg>
  );
}

/* ------------------------------------------------------------------ illustrated scenes */

function Leaf({ x, y, r, s = 1, c }: { x: number; y: number; r: number; s?: number; c: string }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}>
      <path d="M0 0C14-16 40-18 52-4 40 12 14 14 0 0z" fill={c} />
      <path d="M2 0c16-3 32-4 46-4" stroke="rgba(255,255,255,.28)" strokeWidth="1.4" fill="none" />
    </g>
  );
}

/** A generic website on a screen (no real product): nav, hero with mountains, a few content blocks. */
function SiteOnScreen({ w, h }: { w: number; h: number }) {
  return (
    <g>
      <rect width={w} height={h} fill="#FCFAF5" />
      <rect width={w} height={h * 0.075} fill="#F1EDE2" />
      <circle cx={w * 0.03} cy={h * 0.037} r={h * 0.012} fill="#D9D3C4" /><circle cx={w * 0.055} cy={h * 0.037} r={h * 0.012} fill="#D9D3C4" /><circle cx={w * 0.08} cy={h * 0.037} r={h * 0.012} fill="#D9D3C4" />
      <rect x={w * 0.36} y={h * 0.022} width={w * 0.28} height={h * 0.032} rx={h * 0.016} fill="#E3DDCF" />
      <rect x={w * 0.05} y={h * 0.11} width={w * 0.12} height={h * 0.03} rx="3" fill="#20392C" />
      {[0.55, 0.64, 0.73].map((x) => <rect key={x} x={w * x} y={h * 0.118} width={w * 0.06} height={h * 0.014} rx="2" fill="#B9BFAE" />)}
      <rect x={w * 0.84} y={h * 0.106} width={w * 0.11} height={h * 0.04} rx={h * 0.02} fill="#C4DC38" />
      <g transform={`translate(${w * 0.05} ${h * 0.19})`}>
        <rect width={w * 0.9} height={h * 0.47} rx="6" fill="#D9E0C7" />
        <path d={`M0 ${h * 0.47}L${w * 0.2} ${h * 0.2} ${w * 0.33} ${h * 0.31} ${w * 0.52} ${h * 0.08} ${w * 0.74} ${h * 0.3} ${w * 0.9} ${h * 0.18}V${h * 0.47}z`} fill="#7E9370" />
        <path d={`M0 ${h * 0.47}L${w * 0.27} ${h * 0.3} ${w * 0.45} ${h * 0.4} ${w * 0.66} ${h * 0.26} ${w * 0.9} ${h * 0.38}V${h * 0.47}z`} fill="#3E5A45" />
        <circle cx={w * 0.7} cy={h * 0.1} r={h * 0.04} fill="#F4EBC9" />
        <rect x={w * 0.05} y={h * 0.08} width={w * 0.3} height={h * 0.05} rx="3" fill="#FCFAF5" />
        <rect x={w * 0.05} y={h * 0.15} width={w * 0.22} height={h * 0.025} rx="2" fill="rgba(252,250,245,.75)" />
        <rect x={w * 0.05} y={h * 0.2} width={w * 0.1} height={h * 0.04} rx={h * 0.02} fill="#20392C" />
      </g>
      {[0.05, 0.36, 0.67].map((x) => (
        <g key={x} transform={`translate(${w * x} ${h * 0.71})`}>
          <rect width={w * 0.28} height={h * 0.23} rx="5" fill="#F1EDE2" />
          <rect x={w * 0.02} y={h * 0.03} width={w * 0.05} height={h * 0.05} rx="3" fill="#C4DC38" />
          <rect x={w * 0.02} y={h * 0.11} width={w * 0.2} height={h * 0.02} rx="2" fill="#20392C" opacity=".8" />
          <rect x={w * 0.02} y={h * 0.155} width={w * 0.23} height={h * 0.014} rx="2" fill="#B9BFAE" />
        </g>
      ))}
    </g>
  );
}

/** The hero workspace: timber desk, laptop with a website on screen, a trailing plant, daylight, a discreet coffee. */
export function WorkspaceScene({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 900 780" preserveAspectRatio="xMidYMid slice" aria-hidden className={className}>
      <defs>
        <linearGradient id="ws-wall" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#EDE6D4" /><stop offset="1" stopColor="#DCD3BD" /></linearGradient>
        <linearGradient id="ws-light" x1="1" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#FFF8E4" stopOpacity=".95" /><stop offset=".7" stopColor="#FFF8E4" stopOpacity="0" /></linearGradient>
        <linearGradient id="ws-desk" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#C49567" /><stop offset="1" stopColor="#9C6F45" /></linearGradient>
        <linearGradient id="ws-base" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#E4E5E1" /><stop offset="1" stopColor="#B7B9B3" /></linearGradient>
      </defs>
      <rect width="900" height="780" fill="url(#ws-wall)" />
      {/* window */}
      <g transform="translate(470 40)">
        <rect width="400" height="420" rx="6" fill="#F7F1E0" />
        <rect x="16" y="16" width="176" height="186" fill="#DCE6D4" /><rect x="208" y="16" width="176" height="186" fill="#E4EBD9" />
        <rect x="16" y="218" width="176" height="186" fill="#E8EEDD" /><rect x="208" y="218" width="176" height="186" fill="#EEF1E3" />
        <path d="M16 150c40-30 80-24 120-46 30-16 46-6 56-10V202H16z" fill="#B9C8A6" opacity=".7" />
        <path d="M208 120c40-10 70 10 110-12 30-16 50-8 66-14v108H208z" fill="#A9BC95" opacity=".6" />
      </g>
      <rect width="900" height="780" fill="url(#ws-light)" />
      {/* shelf with books */}
      <g transform="translate(60 250)" opacity=".9">
        <rect width="260" height="10" rx="3" fill="#A8794D" />
        {[0, 22, 40, 66, 84].map((x, i) => <rect key={x} x={x + 12} y={-[70, 58, 76, 62, 50][i]} width={[18, 15, 22, 15, 26][i]} height={[70, 58, 76, 62, 50][i]} rx="2" fill={["#20392C", "#A7AF98", "#E5E7D9", "#5E6F55", "#C4DC38"][i]} />)}
        <circle cx="210" cy="-26" r="24" fill="#CFC8B8" />
        <path d="M196 -40c6-18 22-24 30-14" stroke="#3E5A45" strokeWidth="3" fill="none" />
      </g>
      {/* desk */}
      <path d="M0 585h900v195H0z" fill="url(#ws-desk)" />
      <path d="M0 585h900v10H0z" fill="#D7A979" />
      {[620, 660, 705, 750].map((y, i) => <path key={y} d={`M0 ${y}c160 ${i % 2 ? 6 : -4} 340 ${i % 2 ? -8 : 6} 520 0s280 ${i % 2 ? 5 : -6} 380 0`} stroke="#8E623B" strokeOpacity=".25" strokeWidth="2" fill="none" />)}
      {/* laptop */}
      <g transform="translate(250 210)">
        <path d="M18 0h470a14 14 0 0114 14v316H4V14A14 14 0 0118 0z" fill="#2B2E2C" />
        <g transform="translate(20 18)"><SiteOnScreen w={462} h={300} /></g>
        <path d="M-40 330h586l-26 44H-14z" fill="url(#ws-base)" />
        <path d="M200 330h106l-8 10h-90z" fill="#A4A6A0" />
        <ellipse cx="253" cy="382" rx="300" ry="10" fill="#6E4C2C" opacity=".35" />
      </g>
      {/* coffee */}
      <g transform="translate(790 560)">
        <ellipse cx="22" cy="44" rx="34" ry="7" fill="#6E4C2C" opacity=".35" />
        <path d="M0 4h44v22c0 12-10 20-22 20S0 38 0 26z" fill="#F4F0E6" />
        <path d="M44 10h6a8 8 0 010 16h-6" stroke="#F4F0E6" strokeWidth="5" fill="none" />
        <ellipse cx="22" cy="4" rx="22" ry="5" fill="#6B4A31" />
      </g>
      {/* plant pot */}
      <g transform="translate(70 470)">
        <path d="M0 0h120l-12 118H12z" fill="#D8D1C0" /><path d="M0 0h120v14H0z" fill="#E6DFCF" />
        <ellipse cx="60" cy="122" rx="70" ry="8" fill="#6E4C2C" opacity=".3" />
      </g>
      {/* potted plant: stems from the pot to every leaf */}
      <g>
        {[[60, 360, -150, 1.1, "#3E6B3A"], [86, 318, -118, 1.15, "#5E8C4A"], [118, 300, -96, 1.2, "#2F5232"], [152, 316, -64, 1.15, "#3E6B3A"], [180, 352, -36, 1.1, "#5E8C4A"], [96, 392, -134, 1, "#2F5232"], [150, 384, -50, 1, "#2F5232"], [124, 350, -90, 1, "#5E8C4A"]]
          .map(([x, y, r, s2, c], i) => (
            <g key={i}>
              <path d={`M130 472Q${(130 + (x as number)) / 2} ${((472 + (y as number)) / 2) + 20} ${x} ${y}`} stroke="#3E5A3A" strokeWidth="2.4" fill="none" />
              <Leaf x={x as number} y={y as number} r={r as number} s={s2 as number} c={c as string} />
            </g>
          ))}
      </g>
      {/* trailing vine from the top left */}
      <g>
        <path d="M0 40c60 10 110 40 150 90s60 120 70 170" stroke="#3E5A3A" strokeWidth="3" fill="none" />
        {[[30, 46, 70, 1.1, "#3E6B3A"], [65, 58, -40, 1.15, "#5E8C4A"], [100, 78, 80, 1.1, "#2F5232"], [130, 104, -10, 1.2, "#3E6B3A"], [150, 130, 100, 1.1, "#5E8C4A"], [168, 165, 10, 1.1, "#2F5232"], [183, 205, 110, 1.05, "#3E6B3A"], [195, 250, 30, 1, "#5E8C4A"], [210, 300, 100, 0.95, "#2F5232"]]
          .map(([x, y, r, s2, c], i) => <Leaf key={`t${i}`} x={x as number} y={y as number} r={r as number} s={s2 as number} c={c as string} />)}
      </g>
    </svg>
  );
}

/** A laptop showing a website editor (an illustration of the idea, not a screenshot): a page with a side panel of sections. */
export function EditorLaptop({ className = "" }: { className?: string }) {
  const W = 620, H = 380;
  return (
    <svg viewBox="0 0 760 520" aria-hidden className={className}>
      <ellipse cx="380" cy="488" rx="360" ry="16" fill="#142D23" opacity=".16" />
      <path d="M86 20h588a18 18 0 0118 18v402H68V38a18 18 0 0118-18z" fill="#1E211F" />
      <g transform="translate(70 40)">
        <rect width={W} height={H} fill="#FCFAF5" />
        <rect width="132" height={H} fill="#142D23" />
        <g transform="translate(16 18)">
          <rect x="0" y="0" width="16" height="12" rx="3" fill="#C4DC38" />
          <rect x="22" y="2" width="70" height="8" rx="3" fill="rgba(252,250,245,.85)" />
          {["Header", "Hero", "Services", "Reviews", "Quote form", "Footer"].map((t, i) => (
            <g key={t} transform={`translate(0 ${34 + i * 34})`}>
              <rect width="100" height="26" rx="6" fill={i === 1 ? "rgba(196,220,56,.22)" : "rgba(252,250,245,.06)"} stroke={i === 1 ? "#C4DC38" : "none"} />
              <rect x="10" y="9" width="8" height="8" rx="2" fill={i === 1 ? "#C4DC38" : "rgba(252,250,245,.4)"} />
              <rect x="26" y="10" width={[42, 30, 50, 44, 58, 40][i]} height="6" rx="3" fill="rgba(252,250,245,.6)" />
            </g>
          ))}
        </g>
        <g transform="translate(148 14)">
          <rect width="456" height="22" rx="6" fill="#F1EDE2" />
          <rect x="10" y="8" width="60" height="6" rx="3" fill="#B9BFAE" />
          <rect x="376" y="4" width="70" height="14" rx="7" fill="#20392C" />
        </g>
        <g transform="translate(148 48)">
          <g>
            <SiteOnScreen w={456} h={318} />
          </g>
          <rect x="18" y="56" width="420" height="156" rx="8" fill="none" stroke="#C4DC38" strokeWidth="2.5" strokeDasharray="7 5" />
          <g transform="translate(330 44)"><rect width="104" height="24" rx="6" fill="#142D23" /><rect x="10" y="9" width="58" height="6" rx="3" fill="#C4DC38" /><rect x="74" y="9" width="20" height="6" rx="3" fill="rgba(252,250,245,.6)" /></g>
        </g>
      </g>
      <path d="M20 440h720l-36 40H56z" fill="#D9DAD6" />
      <path d="M318 440h124l-10 12H328z" fill="#A9ABA6" />
    </svg>
  );
}

/** Product marks for the software strip (simple, crisp redraws of each product's icon). */
export function ProductMark({ mark, className = "" }: { mark: string; className?: string }) {
  if (mark === "tradeup") return (
    <svg viewBox="0 0 40 40" aria-hidden className={className}><rect width="40" height="40" rx="7" fill="#0B0D0C" /><path d="M13 27L26.5 13.5M16.5 13h10.5v10.5" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg>
  );
  if (mark === "grasshopper") return (
    <svg viewBox="0 0 40 40" aria-hidden className={className}><defs><linearGradient id="gh-g" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#A9C61C" /><stop offset="1" stopColor="#7FA40E" /></linearGradient></defs><rect width="40" height="40" rx="7" fill="url(#gh-g)" /><text x="20" y="28" textAnchor="middle" fontSize="25" fontWeight="800" fill="#fff" fontFamily="'Manrope Variable',system-ui,sans-serif">g</text></svg>
  );
  if (mark === "tagflow") {
    const cells = ["1110111", "1010101", "1110111", "0001000", "1101011", "1010110", "1110101"];
    return (
      <svg viewBox="0 0 40 40" aria-hidden className={className}>
        <rect width="40" height="40" rx="7" fill="#6E3A1C" />
        {cells.flatMap((row, y) => [...row].map((c, x) => (c === "1" ? <rect key={`${x}-${y}`} x={8.5 + x * 3.3} y={8.5 + y * 3.3} width="3" height="3" rx=".4" fill="#F6EFE4" /> : null)))}
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 40 40" aria-hidden className={className}>
      <rect width="40" height="40" rx="7" fill="#F5EEE0" />
      <path d="M8 15h20v8.5c0 5.2-4.4 9.5-10 9.5S8 28.7 8 23.5z" fill="#fff" stroke="#151914" strokeWidth="1.8" />
      <ellipse cx="18" cy="15.5" rx="9.2" ry="2.2" fill="#C8833F" />
      <path d="M28 17.5h2.4a3.6 3.6 0 010 7.2H27.4" fill="none" stroke="#151914" strokeWidth="1.8" />
      <path d="M15 11c-1-1.3 1-2.3 0-3.7M20 11c-1-1.3 1-2.3 0-3.7" stroke="#C9B48E" strokeWidth="1.2" fill="none" strokeLinecap="round" />
    </svg>
  );
}
