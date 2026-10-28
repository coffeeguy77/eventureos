import type { Graphic } from "@/lib/site/agency/content";

/**
 * Simple line-drawn illustrations for dark hero panels (no photos): browser windows, a speed gauge, servers, tickets.
 * Colours come from the page: --ac (the business's accent), --lime (highlight), white at low opacity for structure.
 * Purely decorative — hidden from screen readers.
 */
const S = { stroke: "rgba(255,255,255,.22)", faint: "rgba(255,255,255,.08)", text: "rgba(255,255,255,.55)" };
const font = { fontFamily: "var(--font-geist-sans), system-ui, sans-serif" } as const;

function Window({ x, y, w, h, url, children }: { x: number; y: number; w: number; h: number; url?: string; children?: React.ReactNode }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width={w} height={h} rx="14" fill="#16122A" stroke={S.stroke} />
      <path d={`M0 36h${w}`} stroke={S.stroke} />
      <circle cx="18" cy="18" r="4" fill="rgba(255,255,255,.18)" /><circle cx="32" cy="18" r="4" fill="rgba(255,255,255,.18)" /><circle cx="46" cy="18" r="4" fill="rgba(255,255,255,.18)" />
      {url && <><rect x="66" y="9" width={Math.min(w - 90, 220)} height="18" rx="9" fill={S.faint} /><text x="78" y="22" fontSize="10" fill={S.text} style={font}>{url}</text></>}
      {children}
    </g>
  );
}

export function Gauge({ x = 0, y = 0, label = "Core Web Vitals", value = "Good" }: { x?: number; y?: number; label?: string; value?: string }) {
  // a 180° arc, mostly filled
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width="168" height="120" rx="14" fill="#0F0B1E" stroke={S.stroke} />
      <path d="M30 92a54 54 0 0 1 108 0" fill="none" stroke={S.faint} strokeWidth="10" strokeLinecap="round" />
      <path className="ag-draw" d="M30 92a54 54 0 0 1 108 0" fill="none" stroke="var(--lime)" strokeWidth="10" strokeLinecap="round" strokeDasharray="170" strokeDashoffset="14" />
      <text x="84" y="86" textAnchor="middle" fontSize="17" fontWeight="600" fill="#fff" style={font}>{value}</text>
      <text x="84" y="110" textAnchor="middle" fontSize="10" fill={S.text} style={font}>{label}</text>
    </g>
  );
}

function TicketCard({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width="230" height="132" rx="14" fill="#fff" />
      <text x="18" y="30" fontSize="11" fill="#5A5670" style={font}>Support ticket</text>
      <text x="18" y="52" fontSize="14" fontWeight="600" fill="#0F0B1E" style={font}>Contact form not sending</text>
      <g transform="translate(18 72)">
        {[["Lodged", true], ["In progress", true], ["Done", true]].map(([l], i) => (
          <g key={String(l)} transform={`translate(${i * 66} 0)`}>
            <circle cx="7" cy="7" r="7" fill={i === 2 ? "var(--lime)" : "var(--ac)"} />
            <path d="M3.8 7.2l2.1 2.1 4-4.3" fill="none" stroke={i === 2 ? "#0F0B1E" : "#fff"} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            {i < 2 && <path d="M18 7h40" stroke="#D9D5E6" strokeWidth="2" />}
            <text x="0" y="32" fontSize="10" fill="#5A5670" style={font}>{String(l)}</text>
          </g>
        ))}
      </g>
    </g>
  );
}

function Site({ w }: { w: number }) {
  return (
    <g>
      <rect x="22" y="56" width="70" height="8" rx="4" fill="rgba(255,255,255,.35)" />
      <rect x={w - 150} y="56" width="34" height="8" rx="4" fill={S.faint} /><rect x={w - 108} y="56" width="34" height="8" rx="4" fill={S.faint} />
      <rect x={w - 66} y="50" width="46" height="20" rx="10" fill="var(--ac)" />
      <rect x="22" y="100" width={w * 0.55} height="18" rx="5" fill="#fff" />
      <rect x="22" y="126" width={w * 0.42} height="18" rx="5" fill="#fff" />
      <rect x="22" y="160" width={w * 0.5} height="7" rx="3.5" fill={S.stroke} />
      <rect x="22" y="174" width={w * 0.38} height="7" rx="3.5" fill={S.stroke} />
      <rect x="22" y="198" width="104" height="30" rx="15" fill="var(--lime)" />
      <rect x="134" y="198" width="92" height="30" rx="15" fill="none" stroke={S.stroke} />
      {[0, 1, 2].map((i) => <rect key={i} x={22 + i * ((w - 44) / 3)} y="252" width={(w - 44) / 3 - 12} height="70" rx="10" fill={S.faint} stroke={S.faint} />)}
    </g>
  );
}

/** The home page hero: a website we built, its speed, and a support ticket being looked after. */
export function HeroComposite() {
  return (
    <svg viewBox="0 0 620 500" className="h-auto w-full" aria-hidden role="presentation">
      <g className="ag-in ag-d1"><Window x={10} y={20} w={520} h={350} url="yourbusiness.com.au"><Site w={520} /></Window></g>
      <g className="ag-in ag-d2"><Gauge x={440} y={250} /></g>
      <g className="ag-in ag-d3"><TicketCard x={60} y={340} /></g>
      <g className="ag-in ag-d3" transform="translate(316 404)">
        <rect width="196" height="58" rx="14" fill="#16122A" stroke={S.stroke} />
        <circle cx="28" cy="29" r="12" fill="none" stroke="var(--lime)" strokeWidth="1.6" />
        <path d="M23 29.5l3.4 3.4 6.2-6.6" fill="none" stroke="var(--lime)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <text x="50" y="26" fontSize="12" fontWeight="600" fill="#fff" style={font}>Updates done</text>
        <text x="50" y="42" fontSize="10" fill={S.text} style={font}>Plugins, core and malware scan</text>
      </g>
    </svg>
  );
}

function Server() {
  return (
    <svg viewBox="0 0 480 380" className="h-auto w-full" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <g key={i} transform={`translate(60 ${40 + i * 74})`} className={`ag-in ag-d${(i % 3) + 1}`}>
          <rect width="360" height="58" rx="12" fill="#16122A" stroke={S.stroke} />
          {[0, 1, 2, 3, 4, 5].map((j) => <rect key={j} x={24 + j * 22} y="20" width="12" height="18" rx="3" fill={S.faint} stroke={S.stroke} />)}
          <rect x="190" y="25" width="90" height="8" rx="4" fill={S.faint} />
          <circle cx="310" cy="29" r="5" fill="var(--lime)" /><circle cx="330" cy="29" r="5" fill={i === 2 ? "var(--ac)" : "rgba(255,255,255,.2)"} />
        </g>
      ))}
      <text x="60" y="350" fontSize="12" fill={S.text} style={font}>SSD storage, CloudLinux and cPanel</text>
    </svg>
  );
}

function Checklist() {
  const rows = ["Backup taken", "CMS core updated", "Plugins and theme updated", "Malware scan clean", "Checked on desktop and mobile", "Forms tested"];
  return (
    <svg viewBox="0 0 480 400" className="h-auto w-full" aria-hidden>
      <Window x={30} y={20} w={420} h={360} url="Maintenance check">
        {rows.map((r, i) => (
          <g key={r} transform={`translate(24 ${62 + i * 48})`} className={`ag-in ag-d${(i % 3) + 1}`}>
            <rect width="372" height="38" rx="10" fill={S.faint} />
            <rect x="12" y="10" width="18" height="18" rx="5" fill={i < 5 ? "var(--lime)" : "none"} stroke={i < 5 ? "none" : S.stroke} />
            {i < 5 && <path d="M16 19.5l3 3 6-6.5" fill="none" stroke="#0F0B1E" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />}
            <text x="44" y="24" fontSize="13" fill={i < 5 ? "#fff" : S.text} style={font}>{r}</text>
          </g>
        ))}
      </Window>
    </svg>
  );
}

function Tickets() {
  const rows = [["New", "Email bouncing on the shop mailbox"], ["In progress", "Add a new team member page"], ["Done", "SSL certificate renewed"]];
  return (
    <svg viewBox="0 0 480 400" className="h-auto w-full" aria-hidden>
      <Window x={20} y={20} w={440} h={250} url="Client portal: Support">
        {rows.map(([s, t], i) => (
          <g key={t} transform={`translate(22 ${56 + i * 62})`}>
            <rect width="396" height="50" rx="10" fill={S.faint} />
            <text x="16" y="30" fontSize="13" fill="#fff" style={font}>{t}</text>
            <rect x="300" y="14" width="82" height="22" rx="11" fill={s === "Done" ? "var(--lime)" : s === "New" ? "var(--ac)" : "rgba(255,255,255,.14)"} />
            <text x="341" y="29" textAnchor="middle" fontSize="10.5" fontWeight="600" fill={s === "Done" ? "#0F0B1E" : "#fff"} style={font}>{s}</text>
          </g>
        ))}
      </Window>
      <g className="ag-in ag-d2"><TicketCard x={150} y={250} /></g>
    </svg>
  );
}

function Ads() {
  const bars = [38, 52, 46, 70, 64, 88, 96];
  return (
    <svg viewBox="0 0 480 400" className="h-auto w-full" aria-hidden>
      <Window x={20} y={20} w={440} h={190} url="google.com/search?q=plumber+canberra">
        <g transform="translate(24 58)">
          <rect width="26" height="16" rx="4" fill="none" stroke="var(--lime)" /><text x="13" y="12" textAnchor="middle" fontSize="9.5" fontWeight="700" fill="var(--lime)" style={font}>Ad</text>
          <text x="36" y="12" fontSize="11" fill={S.text} style={font}>yourbusiness.com.au</text>
          <rect y="28" width="300" height="14" rx="4" fill="#fff" />
          <rect y="52" width="360" height="7" rx="3.5" fill={S.stroke} /><rect y="66" width="260" height="7" rx="3.5" fill={S.stroke} />
          <rect y="92" width="220" height="10" rx="5" fill={S.faint} /><rect y="110" width="300" height="7" rx="3.5" fill={S.faint} />
        </g>
      </Window>
      <g transform="translate(20 236)" className="ag-in ag-d2">
        <rect width="440" height="140" rx="14" fill="#16122A" stroke={S.stroke} />
        <text x="22" y="30" fontSize="11" fill={S.text} style={font}>Enquiries from ads</text>
        {bars.map((h, i) => <rect key={i} x={24 + i * 58} y={124 - h} width="34" height={h} rx="6" fill={i === bars.length - 1 ? "var(--lime)" : "var(--ac)"} opacity={i === bars.length - 1 ? 1 : 0.55 + i * 0.06} />)}
      </g>
    </svg>
  );
}

function SearchG() {
  return (
    <svg viewBox="0 0 480 400" className="h-auto w-full" aria-hidden>
      <g transform="translate(30 30)">
        <rect width="420" height="52" rx="26" fill="#fff" />
        <circle cx="30" cy="26" r="8" fill="none" stroke="#0F0B1E" strokeWidth="1.8" /><path d="M36 32l6 6" stroke="#0F0B1E" strokeWidth="1.8" strokeLinecap="round" />
        <text x="54" y="31" fontSize="14" fill="#0F0B1E" style={font}>web design near me</text>
      </g>
      <g transform="translate(30 104)" className="ag-in ag-d1">
        <rect width="420" height="150" rx="14" fill="#16122A" stroke={S.stroke} />
        <path d="M0 50h420M0 100h420" stroke={S.faint} />
        {[0, 1, 2].map((i) => (
          <g key={i} transform={`translate(18 ${14 + i * 50})`}>
            <path d="M10 0c-5.5 0-10 4.3-10 9.6C0 17 10 24 10 24s10-7 10-14.4C20 4.3 15.5 0 10 0z" transform="scale(.9)" fill={i === 0 ? "var(--lime)" : "none"} stroke={i === 0 ? "none" : S.stroke} />
            <rect x="34" y="4" width={i === 0 ? 170 : 140 - i * 20} height="9" rx="4.5" fill={i === 0 ? "#fff" : S.stroke} />
            <rect x="34" y="18" width="110" height="6" rx="3" fill={S.faint} />
            {i === 0 && <text x="380" y="16" textAnchor="end" fontSize="11" fill="var(--lime)" style={font}>★★★★★</text>}
          </g>
        ))}
      </g>
      <g transform="translate(30 276)" className="ag-in ag-d2">
        <rect width="420" height="96" rx="14" fill="#16122A" stroke={S.stroke} />
        <path d="M20 76 C 90 70, 120 52, 170 50 S 260 30, 300 26 S 380 16, 400 14" fill="none" stroke="var(--lime)" strokeWidth="2.5" className="ag-draw" strokeDasharray="420" />
        <text x="20" y="26" fontSize="11" fill={S.text} style={font}>Visitors from Google</text>
      </g>
    </svg>
  );
}

function MailG() {
  const recs = [["MX", "Mail server"], ["SPF", "Who may send"], ["DKIM", "Signed mail"], ["DMARC", "Policy"]];
  return (
    <svg viewBox="0 0 480 400" className="h-auto w-full" aria-hidden>
      <g transform="translate(40 30)" className="ag-in ag-d1">
        <rect width="400" height="150" rx="16" fill="#16122A" stroke={S.stroke} />
        <path d="M24 30l176 92 176-92" fill="none" stroke="var(--ac)" strokeWidth="2" strokeLinejoin="round" />
        <rect x="24" y="24" width="352" height="104" rx="10" fill="none" stroke={S.stroke} />
        <rect x="292" y="-12" width="96" height="30" rx="15" fill="var(--lime)" />
        <text x="340" y="7" textAnchor="middle" fontSize="11" fontWeight="600" fill="#0F0B1E" style={font}>Delivered</text>
      </g>
      <g transform="translate(40 206)" className="ag-in ag-d2">
        {recs.map(([k, v], i) => (
          <g key={k} transform={`translate(${(i % 2) * 206} ${Math.floor(i / 2) * 80})`}>
            <rect width="194" height="66" rx="12" fill="#16122A" stroke={S.stroke} />
            <text x="18" y="30" fontSize="15" fontWeight="600" fill="#fff" style={font}>{k}</text>
            <text x="18" y="50" fontSize="11" fill={S.text} style={font}>{v}</text>
            <circle cx="166" cy="33" r="11" fill="none" stroke="var(--lime)" strokeWidth="1.6" />
            <path d="M161 33.5l3.4 3.4 6-6.4" fill="none" stroke="var(--lime)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        ))}
      </g>
    </svg>
  );
}

function Flow() {
  const nodes: [string, number, number][] = [["Gmail", 70, 70], ["Xero", 70, 200], ["Stripe", 70, 330], ["Claude", 410, 70], ["OpenAI", 410, 200], ["Your team", 410, 330]];
  return (
    <svg viewBox="0 0 480 400" className="h-auto w-full" aria-hidden>
      {nodes.map(([n, x, y]) => <path key={n} d={`M${x < 240 ? x + 46 : x - 46} ${y} C 240 ${y}, 240 200, ${x < 240 ? 186 : 294} 200`} fill="none" stroke={S.stroke} strokeWidth="1.5" strokeDasharray="4 5" />)}
      <g className="ag-in ag-d1">
        <rect x="186" y="150" width="108" height="100" rx="20" fill="var(--ac)" />
        <rect x="204" y="172" width="72" height="8" rx="4" fill="rgba(255,255,255,.7)" /><rect x="204" y="188" width="52" height="8" rx="4" fill="rgba(255,255,255,.4)" />
        <rect x="204" y="210" width="72" height="22" rx="11" fill="var(--lime)" />
        <text x="240" y="225" textAnchor="middle" fontSize="10" fontWeight="700" fill="#0F0B1E" style={font}>Your app</text>
      </g>
      {nodes.map(([n, x, y], i) => (
        <g key={n} className={`ag-in ag-d${(i % 3) + 1}`}>
          <rect x={x - 46} y={y - 20} width="92" height="40" rx="20" fill="#16122A" stroke={S.stroke} />
          <text x={x} y={y + 4.5} textAnchor="middle" fontSize="12" fill="#fff" style={font}>{n}</text>
        </g>
      ))}
    </svg>
  );
}

function Editor() {
  return (
    <svg viewBox="0 0 480 400" className="h-auto w-full" aria-hidden>
      <Window x={20} y={20} w={440} h={270} url="Editing: Home">
        <rect x="22" y="58" width="396" height="112" rx="10" fill="none" stroke="var(--lime)" strokeWidth="1.5" strokeDasharray="5 4" />
        <rect x="320" y="46" width="98" height="22" rx="11" fill="var(--lime)" />
        <text x="369" y="61" textAnchor="middle" fontSize="10" fontWeight="700" fill="#0F0B1E" style={font}>Layout 2 of 4</text>
        <rect x="40" y="84" width="230" height="16" rx="5" fill="#fff" />
        <rect x="40" y="108" width="176" height="16" rx="5" fill="#fff" />
        <path d="M222 106v20" stroke="var(--lime)" strokeWidth="2" className="ag-blink" />
        <rect x="40" y="138" width="90" height="20" rx="10" fill="var(--ac)" />
        {[0, 1, 2].map((i) => <rect key={i} x={22 + i * 136} y="190" width="124" height="80" rx="10" fill={S.faint} />)}
      </Window>
      <g transform="translate(20 306)" className="ag-in ag-d2">
        {["Bookings", "Quotes", "Area map", "Reviews"].map((a, i) => (
          <g key={a} transform={`translate(${i * 112} 0)`}>
            <rect width="100" height="70" rx="12" fill="#16122A" stroke={i === 0 ? "var(--lime)" : S.stroke} />
            <rect x="14" y="14" width="18" height="18" rx="5" fill="none" stroke={i === 0 ? "var(--lime)" : "rgba(255,255,255,.4)"} />
            <text x="14" y="54" fontSize="11.5" fill="#fff" style={font}>{a}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}

function WordPress() {
  const rows: [string, string][] = [["WordPress core", "Updated"], ["Contact form plugin", "Updated"], ["SEO plugin", "Updated"], ["Theme", "Updated"], ["Old slider plugin", "Removed"]];
  return (
    <svg viewBox="0 0 480 400" className="h-auto w-full" aria-hidden>
      <Window x={20} y={30} w={440} h={330} url="wp-admin / Updates">
        {rows.map(([n, s], i) => (
          <g key={n} transform={`translate(22 ${58 + i * 56})`} className={`ag-in ag-d${(i % 3) + 1}`}>
            <rect width="396" height="44" rx="10" fill={S.faint} />
            <rect x="14" y="12" width="20" height="20" rx="5" fill="none" stroke="rgba(255,255,255,.4)" />
            <text x="48" y="27" fontSize="13" fill="#fff" style={font}>{n}</text>
            <rect x="296" y="11" width="86" height="22" rx="11" fill={s === "Removed" ? "rgba(255,255,255,.14)" : "var(--lime)"} />
            <text x="339" y="26" textAnchor="middle" fontSize="10.5" fontWeight="600" fill={s === "Removed" ? "#fff" : "#0F0B1E"} style={font}>{s}</text>
          </g>
        ))}
      </Window>
    </svg>
  );
}

function Browser() {
  return (
    <svg viewBox="0 0 480 400" className="h-auto w-full" aria-hidden>
      <g className="ag-in ag-d1"><Window x={10} y={20} w={400} h={300} url="yourbusiness.com.au"><Site w={400} /></Window></g>
      <g className="ag-in ag-d2" transform="translate(330 170)">
        <rect width="130" height="220" rx="22" fill="#16122A" stroke={S.stroke} />
        <rect x="45" y="10" width="40" height="6" rx="3" fill={S.faint} />
        <rect x="14" y="36" width="90" height="12" rx="4" fill="#fff" /><rect x="14" y="54" width="70" height="12" rx="4" fill="#fff" />
        <rect x="14" y="78" width="96" height="6" rx="3" fill={S.stroke} /><rect x="14" y="90" width="80" height="6" rx="3" fill={S.stroke} />
        <rect x="14" y="110" width="102" height="28" rx="14" fill="var(--lime)" />
        <rect x="14" y="150" width="102" height="54" rx="10" fill={S.faint} />
      </g>
    </svg>
  );
}

export function ServiceGraphic({ kind }: { kind: Graphic }) {
  switch (kind) {
    case "gauge": return <svg viewBox="0 0 168 120" className="h-auto w-full" aria-hidden><Gauge /></svg>;
    case "server": return <Server />;
    case "checklist": return <Checklist />;
    case "ticket": return <Tickets />;
    case "ads": return <Ads />;
    case "search": return <SearchG />;
    case "mail": return <MailG />;
    case "flow": return <Flow />;
    case "editor": return <Editor />;
    case "wordpress": return <WordPress />;
    default: return <Browser />;
  }
}
