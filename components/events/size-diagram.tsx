/**
 * "How big is it?" — a to-scale drawing of the cart (a box with the coffee machine and grinder on top) or the van
 * (side view), with the measurements. Drawn from the sizes in Website → Events pages, so it's never baked in.
 */
type Specs = { length: number | null; width: number | null; height: number | null; vehicle: string; equipment: string[] };

const mm = (n: number) => `${n.toLocaleString("en-AU")} mm`;

function Dim({ x1, y1, x2, y2, label, side = "out", rot = 0 }: { x1: number; y1: number; x2: number; y2: number; label: string; side?: "out" | "in"; rot?: number }) {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  return (
    <g className="text-[#151312]">
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth="1.2" markerStart="url(#dimA)" markerEnd="url(#dimA)" />
      <g transform={`translate(${mx} ${my}) rotate(${rot})`}>
        <rect x={-48} y={side === "out" ? -21 : 5} width="96" height="18" rx="9" fill="white" />
        <text x="0" y={side === "out" ? -8 : 18} textAnchor="middle" fontSize="12.5" fontWeight="700" fill="currentColor">{label}</text>
      </g>
    </g>
  );
}

export function CartDiagram({ s, title }: { s: Specs; title: string }) {
  const L = s.length ?? 0, D = s.width ?? 0, H = s.height ?? 0;
  const k = 300 / Math.max(L, 1); // px per mm (front face 300px wide)
  const w = L * k, h = H * k, dx = D * k * 0.55, dy = D * k * 0.32;
  const x0 = 70, base = 300; // front-bottom-left corner
  const top = base - h;
  const short = (e?: string) => (e ?? "").split(/[(,—–-]\s/)[0].replace(/\s*\(.*$/, "").trim();
  const machine = short(s.equipment[0]), grinder = short(s.equipment[1]);
  return (
    <svg viewBox="0 0 520 360" role="img" aria-label={`${title}: ${mm(L)} wide, ${mm(D)} deep, ${mm(H)} high`} className="h-auto w-full">
      <defs>
        <marker id="dimA" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 2 L10 5 L0 8 z" fill="currentColor" /></marker>
        <linearGradient id="steel" x1="0" x2="1"><stop offset="0" stopColor="#E9ECEF" /><stop offset="0.5" stopColor="#F8F9FA" /><stop offset="1" stopColor="#D9DEE3" /></linearGradient>
      </defs>
      {/* cart: top, side, front */}
      <polygon points={`${x0},${top} ${x0 + dx},${top - dy} ${x0 + w + dx},${top - dy} ${x0 + w},${top}`} fill="#DDE2E7" stroke="#8A939C" strokeWidth="1.2" />
      <polygon points={`${x0 + w},${top} ${x0 + w + dx},${top - dy} ${x0 + w + dx},${base - dy} ${x0 + w},${base}`} fill="#C9D0D7" stroke="#8A939C" strokeWidth="1.2" />
      <rect x={x0} y={top} width={w} height={h} fill="url(#steel)" stroke="#8A939C" strokeWidth="1.2" />
      <rect x={x0 + 14} y={top + 14} width={w - 28} height={h - 28} fill="none" stroke="#B5BDC5" strokeDasharray="4 4" />
      <text x={x0 + w / 2} y={top + h / 2 + 4} textAnchor="middle" fontSize="11" fill="#8A939C">front (wrap area)</text>
      {/* machine (2 group) and grinder on top */}
      <g transform={`translate(${x0 + w * 0.22 + dx * 0.5} ${top - dy * 0.5})`}>
        <rect x="0" y="-62" width="118" height="62" rx="6" fill="#2B2522" />
        <rect x="8" y="-56" width="102" height="14" rx="3" fill="#4A403B" />
        <rect x="22" y="-26" width="16" height="12" rx="2" fill="#9AA3AB" /><rect x="80" y="-26" width="16" height="12" rx="2" fill="#9AA3AB" />
        <rect x="-4" y="-4" width="126" height="6" rx="2" fill="#151312" />
      </g>
      <g transform={`translate(${x0 + w * 0.72 + dx * 0.5} ${top - dy * 0.5})`}>
        <path d="M6 -84 L34 -84 L28 -56 L12 -56 Z" fill="#6B5E57" opacity="0.85" />
        <rect x="8" y="-56" width="24" height="44" rx="4" fill="#2B2522" />
        <rect x="4" y="-12" width="32" height="12" rx="3" fill="#151312" />
      </g>
      {machine && <g><line x1={x0 + w * 0.22 + dx * 0.5 + 59} y1={top - dy * 0.5 - 64} x2={x0 + 60} y2={34} stroke="#E0457B" strokeWidth="1" /><text x={8} y={26} fontSize="11.5" fontWeight="600" fill="#151312">{machine}</text></g>}
      {grinder && <g><line x1={x0 + w * 0.72 + dx * 0.5 + 20} y1={top - dy * 0.5 - 86} x2={x0 + w + 20} y2={48} stroke="#E0457B" strokeWidth="1" /><text x={512} y={42} fontSize="11.5" fontWeight="600" fill="#151312" textAnchor="end">{grinder}</text></g>}
      {/* measurements */}
      <Dim x1={x0} y1={base + 24} x2={x0 + w} y2={base + 24} label={`${mm(L)} wide`} side="in" />
      <Dim x1={x0 - 26} y1={base} x2={x0 - 26} y2={top} label={`${mm(H)} high`} rot={-90} />
      <Dim x1={x0 + w + 16} y1={base + 4} x2={x0 + w + dx + 16} y2={base - dy + 4} label={`${mm(D)} deep`} side="in" rot={-30} />
    </svg>
  );
}

export function VanDiagram({ s, title }: { s: Specs; title: string }) {
  const L = s.length ?? 0, W = s.width ?? 0, H = s.height ?? 0;
  const k = 380 / Math.max(L, 1);
  const len = L * k, hgt = H * k, x0 = 60, base = 250, top = base - hgt;
  const nose = len * 0.16, wheel = Math.min(28, hgt * 0.22);
  return (
    <svg viewBox="0 0 520 330" role="img" aria-label={`${title}: ${mm(L)} long, ${mm(W)} wide, ${mm(H)} high`} className="h-auto w-full">
      <defs><marker id="dimA" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 2 L10 5 L0 8 z" fill="currentColor" /></marker></defs>
      <path d={`M${x0} ${base - wheel * 0.6} L${x0} ${top + 8} Q${x0} ${top} ${x0 + 8} ${top} L${x0 + len - nose} ${top} Q${x0 + len - nose * 0.55} ${top + 2} ${x0 + len - 6} ${top + hgt * 0.42} L${x0 + len} ${base - wheel * 0.9} L${x0 + len} ${base - wheel * 0.6} Z`} fill="#F4F5F7" stroke="#8A939C" strokeWidth="1.4" />
      <path d={`M${x0 + len - nose * 0.95} ${top + 8} L${x0 + len - nose * 0.42} ${top + 8} Q${x0 + len - 12} ${top + hgt * 0.25} ${x0 + len - 10} ${top + hgt * 0.4} L${x0 + len - nose * 0.95} ${top + hgt * 0.4} Z`} fill="#CBD5DE" />
      <rect x={x0 + 16} y={top + 14} width={len * 0.5} height={hgt * 0.38} rx="4" fill="#CBD5DE" opacity="0.7" />
      <text x={x0 + 16 + len * 0.25} y={top + 14 + hgt * 0.2 + 4} textAnchor="middle" fontSize="11" fill="#5E6A75">serving hatch</text>
      <line x1={x0 + len * 0.62} y1={top + 10} x2={x0 + len * 0.62} y2={base - wheel * 0.6} stroke="#B5BDC5" />
      {[x0 + len * 0.17, x0 + len * 0.8].map((cx) => <g key={cx}><circle cx={cx} cy={base - wheel * 0.55} r={wheel} fill="#2B2522" /><circle cx={cx} cy={base - wheel * 0.55} r={wheel * 0.45} fill="#9AA3AB" /></g>)}
      <line x1={x0 - 10} y1={base + wheel * 0.45} x2={x0 + len + 10} y2={base + wheel * 0.45} stroke="#D7DCE1" />
      <Dim x1={x0} y1={base + wheel * 0.45 + 26} x2={x0 + len} y2={base + wheel * 0.45 + 26} label={`${mm(L)} long`} side="in" />
      <Dim x1={x0 + len + 26} y1={base + wheel * 0.45} x2={x0 + len + 26} y2={top} label={`${mm(H)} high`} rot={-90} />
      <text x={x0} y={top - 14} fontSize="12.5" fontWeight="700" fill="#151312">{s.vehicle || title}</text>
      <text x={x0 + len} y={top - 14} fontSize="12.5" fontWeight="700" fill="#151312" textAnchor="end">{mm(W)} wide</text>
    </svg>
  );
}
