import Link from "next/link";
import { ArrowUpRight, BarChart3, Cloud, Code2, Headphones, Layers, Monitor, Puzzle, Users } from "lucide-react";
import type { PublicOrg } from "@/lib/bookings/server";
import { CATEGORIES, LAUNCH, PRODUCTS, TESTIMONIALS, YEAR_STATS } from "@/lib/site/agency/content";
import { Cup, ProductMark, Sparks, StepArrow, Underline } from "./deco";
import { Testimonials } from "./testimonials";

/**
 * The agency home page, laid out to match the approved design board (1024px artboard). On screens 1024px and wider
 * every size is in artboard units (--u = one artboard pixel at the current width, up to 1920px), so the page is the
 * design at any desktop width; below that it reflows for tablets and phones. Photos come from the design board.
 */
const IMG = "/media/webculture/site";
const CAT_LINES: Record<string, [string, string?]> = { web: ["Web Design &", "Development"], software: ["Web Applications", "& Software"], hosting: ["Hosting &", "Infrastructure"], seo: ["SEO &", "Digital Growth"], support: ["Support & Care"], integrations: ["Integrations", "& More"] };
const CAT_DESC: Record<string, string> = { web: "Beautiful, fast and|built to perform.", software: "Custom solutions for|real business needs.", hosting: "Secure, fast and|always on.", seo: "Get found, get customers|and keep growing.", support: "Real people, local support|and quick resolutions.", integrations: "Connect your tools,|systems and workflows." };
const CAT_ICONS = { web: Monitor, software: Layers, hosting: Cloud, seo: BarChart3, support: Headphones, integrations: Puzzle } as const;

export const HOME_CSS = `
.wch{--hbg:#FBF5EB;--hink:#0E1410;--hbody:#1A1F1B;--forest-d:#1E3527;--foot:#10251B;--lime2:#C5DE1E;background:var(--hbg);color:var(--hbody);letter-spacing:-.012em;overflow-x:clip}
.wch .serif{font-family:'Fraunces Variable',Georgia,serif;font-variation-settings:'opsz' 72;letter-spacing:-.02em}
.wch .btn{display:inline-flex;align-items:center;justify-content:center;gap:.45em;border-radius:999px;font-weight:760;letter-spacing:-.01em;white-space:nowrap;transition:background-color .2s,color .2s}
.wch .btn-dark{background:#1C3026;color:#fff}.wch .btn-dark:hover{background:#264233}
.wch .btn-dark svg{color:var(--lime2)}
.wch .btn-line{border:1.5px solid #1A1F1B;color:#1A1F1B;background:transparent}.wch .btn-line:hover{background:#1A1F1B;color:#fff}
.wch .eyebrow{font-weight:700;text-transform:uppercase;letter-spacing:.045em;color:#1A1F1B}

/* phones and tablets */
.wch-hero{position:relative;padding:28px 20px 0}
.wch-hero .eyebrow{font-size:11.5px;line-height:1.35;display:flex;align-items:center;gap:10px}
.wch-hero .eyebrow i{display:block;width:44px;height:3px;border-radius:3px;background:var(--lime2);flex:none}
.wch-hero h1{margin-top:14px;font-size:44px;line-height:.98;font-weight:800;letter-spacing:-.025em;color:var(--hink)}
.wch-hero h1 em{display:block;font-weight:400;color:var(--forest-d);letter-spacing:-.02em}
.wch-hero .lede{margin-top:16px;font-size:17px;line-height:1.45;max-width:30em;font-weight:500;color:#111}
.wch-hero .ctas{margin-top:22px;display:flex;flex-wrap:wrap;gap:12px}
.wch-hero .ctas .btn{height:48px;padding:0 22px;font-size:15px}
.wch-hero .hand{margin-top:18px;display:flex;align-items:flex-end;gap:10px;color:#1A1F1B}
.wch-hero .hand svg.cup{width:36px;height:36px;flex:none}
.wch-hero .hand span{font-family:'Caveat',cursive;font-size:20px;line-height:1.05;position:relative;transform:rotate(-2deg);display:inline-block;padding-bottom:6px}
.wch-hero .hand .ul{position:absolute;left:52%;right:0;bottom:-2px;height:8px;width:48%}
.wch-hero .pic{margin:26px -20px 0;aspect-ratio:566/372}
.wch-hero .pic img{width:100%;height:100%;object-fit:cover;object-position:left top}

.wch-strip{margin:18px 14px 0;border-radius:14px;background:#F4EEE3;display:grid;grid-template-columns:1fr 1fr;gap:18px 12px;padding:20px}
.wch-strip .t{grid-column:1/-1;font-size:24px;line-height:1.05;font-weight:700;color:var(--hink)}
.wch-strip .s{display:flex;align-items:center;gap:10px}
.wch-strip .s svg{width:34px;height:34px;flex:none;color:#1A1F1B}
.wch-strip .n{display:block;font-size:20px;font-weight:800;line-height:1;color:#111;letter-spacing:-.01em}
.wch-strip .l{display:block;margin-top:3px;font-size:12px;line-height:1.2;color:#2A2F2B}

.wch-panel{margin:18px 12px 0;border-radius:18px;background:var(--forest-d);color:#F8F4EA;padding:30px 22px}
.wch-panel h2{font-size:34px;line-height:1.08;font-weight:700;position:relative;display:inline-block;padding-bottom:12px}
.wch-panel h2 .ul{position:absolute;left:2px;bottom:-6px;width:58%;height:12px}
.wch-panel ul{margin-top:26px;display:grid;grid-template-columns:1fr;gap:0}
.wch-panel li a{display:grid;grid-template-columns:auto 1fr;gap:4px 14px;padding:16px 0;border-top:1px solid rgba(255,255,255,.16)}
.wch-panel li svg{grid-row:span 2;width:32px;height:32px;color:var(--lime2)}
.wch-panel li b{font-size:15px;line-height:1.2;font-weight:800;color:#fff}
.wch-panel li a>span{font-size:13px;line-height:1.35;color:#D7DACB}
.wch-panel li .bl{display:inline}
.wch-panel br.dk{display:none}
@media (min-width:1024px){.wch-panel br.dk{display:inline}}

.wch-lp{display:grid;gap:22px;padding:34px 20px 0}
.wch-lp .pic img{width:100%;height:auto;display:block}
.wch-lp .eyebrow{font-size:12px;letter-spacing:.06em;color:#2E4A1F}.wch-lp .eyebrow b{color:#9DB80F}
.wch-lp h2{margin-top:6px;font-size:32px;line-height:1.05;font-weight:800;color:var(--hink);letter-spacing:-.02em}
.wch-lp h2 .sp{display:none;color:var(--lime2);vertical-align:top;margin-left:4px}
.wch-lp p{margin-top:10px;font-size:16px;line-height:1.45;font-weight:500;color:#111}
.wch-lp .ctas{margin-top:16px;display:flex;flex-wrap:wrap;gap:10px}
.wch-lp .ctas .btn{height:44px;padding:0 20px;font-size:14.5px}

.wch-sw{margin:30px 14px 0;border-radius:14px;background:#F1ECDD;padding:20px;display:grid;gap:16px}
.wch-sw h2{font-size:24px;line-height:1.08;font-weight:800;color:var(--hink);position:relative;display:inline-block}
.wch-sw h2 .ul{position:absolute;left:0;bottom:-8px;width:52%;height:9px}
.wch-sw ul{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.wch-sw li{background:#FAF5EC;border-radius:10px;padding:10px;display:flex;gap:10px;align-items:flex-start}
.wch-sw li svg{width:38px;height:38px;flex:none}
.wch-sw li b{display:block;font-size:13.5px;line-height:1.2;font-weight:800;color:#111}
.wch-sw li span{display:block;margin-top:2px;font-size:12px;line-height:1.3;color:#2A2F2B}

.wch-steps{padding:34px 20px 10px;display:grid;gap:22px}
.wch-steps h2{font-size:28px;line-height:1.05;font-weight:800;color:var(--hink);position:relative;display:inline-block}
.wch-steps h2 .ul{position:absolute;left:0;bottom:-8px;width:72%;height:9px}
.wch-steps ol{display:grid;grid-template-columns:1fr 1fr;gap:22px 14px}
.wch-steps li{text-align:center;position:relative}
.wch-steps .num{display:grid;place-items:center;margin:0 auto;width:26px;height:26px;border-radius:50%;background:var(--lime2);font-size:13px;font-weight:800;color:#1A1F1B}
.wch-steps b{display:block;margin-top:8px;font-size:15.5px;font-weight:800;color:#111}
.wch-steps span{display:block;margin-top:4px;font-size:13px;line-height:1.3;color:#2A2F2B}
.wch-steps .arr{display:none}

.wch-band{position:relative;margin-top:24px;background:url(${IMG}/band.webp) center/cover no-repeat;padding:34px 16px 26px}
.wct{position:relative;max-width:560px;margin:0 auto;text-align:center}
.wct figure{min-height:118px}
.wct blockquote{font-family:'Fraunces Variable',Georgia,serif;font-variation-settings:'opsz' 18;font-weight:420;font-style:italic;font-size:19px;line-height:1.3;color:#141A15}
.wct blockquote .q{font-style:normal;font-weight:900;color:var(--lime2);font-size:1.9em;line-height:0;vertical-align:-.32em;margin-right:.12em}
.wct figcaption{margin-top:10px;font-size:13px;font-weight:700;color:#141A15}
.wct .nav{position:absolute;top:50%;translate:0 -70%;display:grid;place-items:center;width:42px;height:42px;border-radius:50%;background:#fff;color:#141A15;box-shadow:0 4px 14px rgba(0,0,0,.12)}
.wct .prev{left:-6px}.wct .next{right:-6px}
.wct .dots{margin-top:12px;display:flex;justify-content:center;gap:4px}
.wct .dots button{display:grid;place-items:center;width:18px;height:18px}
.wct .dots i{display:block;width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.75)}
.wct .dots [aria-current] i{background:var(--lime2);box-shadow:0 0 0 1.5px #3C4A1A}
@media (max-width:1023px){.wct{padding:0 40px}.wct .nav{width:36px;height:36px}}

/* desktop: the design board, in artboard units */
@media (min-width:1024px){
  .wch{--u:calc(min(100vw,1920px) / 1024)}
  .wch-art{max-width:1920px;margin:0 auto}
  .wch-hero{height:calc(372*var(--u));padding:calc(23*var(--u)) 0 0 calc(40*var(--u))}
  .wch-hero .eyebrow{font-size:calc(11.6*var(--u));line-height:calc(14*var(--u));gap:calc(9*var(--u))}
  .wch-hero .eyebrow i{width:calc(60*var(--u));height:calc(3*var(--u))}
  .wch-hero h1{margin-top:calc(9*var(--u));font-size:calc(48*var(--u));line-height:calc(46.5*var(--u));max-width:calc(430*var(--u));position:relative;z-index:1}
  .wch-hero .lede{margin-top:calc(16*var(--u));font-size:calc(16.4*var(--u));line-height:calc(23*var(--u));max-width:calc(392*var(--u))}
  .wch-hero .ctas{margin-top:calc(19*var(--u));gap:calc(13*var(--u));margin-left:calc(-5*var(--u))}
  .wch-hero .ctas .btn{height:calc(40*var(--u));padding:0 calc(20*var(--u)) 0 calc(22*var(--u));font-size:calc(15*var(--u))}
  .wch-hero .ctas .btn-line{height:calc(37*var(--u));padding:0 calc(16*var(--u));font-size:calc(14.6*var(--u))}
  .wch-hero .ctas svg{width:calc(15*var(--u));height:calc(15*var(--u))}
  .wch-hero .hand{margin-top:calc(8*var(--u));gap:calc(8*var(--u));margin-left:calc(5*var(--u))}
  .wch-hero .hand svg.cup{width:calc(36*var(--u));height:calc(36*var(--u))}
  .wch-hero .hand span{font-size:calc(19.5*var(--u));padding-bottom:calc(6*var(--u));transform:rotate(-2.2deg)}
  .wch-hero .hand .ul{height:calc(7*var(--u))}
  .wch-hero .pic{position:absolute;margin:0;left:calc(458*var(--u));right:min(0px,calc((1920px - 100vw) / 2));top:calc(-2*var(--u));height:calc(372*var(--u));aspect-ratio:auto}

  .wch-strip{margin:calc(11*var(--u)) calc(14*var(--u)) 0;height:calc(77*var(--u));border-radius:calc(14*var(--u));padding:0;gap:0;grid-template-columns:230fr 195fr 185fr 195fr 191fr;align-items:center}
  .wch-strip .t{grid-column:auto;padding-left:calc(37*var(--u));font-size:calc(23.5*var(--u));line-height:calc(25*var(--u))}
  .wch-strip .s{height:calc(50*var(--u));border-left:1px solid #D8D0C1;padding-left:calc(24*var(--u));gap:calc(12*var(--u))}
  .wch-strip .s svg{width:calc(40*var(--u));height:calc(40*var(--u))}
  .wch-strip .n{font-size:calc(20*var(--u))}
  .wch-strip .l{margin-top:calc(2*var(--u));font-size:calc(11.4*var(--u));line-height:calc(14*var(--u))}

  .wch-panel{margin:calc(22*var(--u)) calc(11*var(--u)) 0;min-height:calc(213*var(--u));border-radius:calc(18*var(--u));padding:0;display:grid;grid-template-columns:368fr 633fr;align-items:center}
  .wch-panel h2{margin-left:calc(40*var(--u));font-size:calc(36*var(--u));line-height:calc(41*var(--u));padding-bottom:calc(10*var(--u))}
  .wch-panel h2 .ul{bottom:calc(-16*var(--u));width:calc(156*var(--u));height:calc(14*var(--u));left:calc(3*var(--u))}
  .wch-panel ul{margin:0;grid-template-columns:217fr 220fr 196fr;grid-template-rows:auto auto;padding:calc(12*var(--u)) 0 calc(18*var(--u))}
  .wch-panel li{position:relative}
  .wch-panel li:nth-child(n+4)::before{content:"";position:absolute;top:0;left:0;right:0;height:1px;background:rgba(255,255,255,.2)}
  .wch-panel li:nth-child(6)::before{right:calc(28*var(--u))}
  .wch-panel li a{border:0;padding:0 calc(10*var(--u)) 0 0;gap:calc(5*var(--u)) calc(16*var(--u));align-content:start}
  .wch-panel li:nth-child(-n+3) a{padding-bottom:calc(14*var(--u))}
  .wch-panel li:nth-child(n+4) a{padding-top:calc(16*var(--u))}
  .wch-panel ul{padding-top:calc(17*var(--u))}
  .wch-panel li svg{width:calc(36*var(--u));height:calc(36*var(--u));stroke-width:1.5}
  .wch-panel li b{font-size:calc(14.6*var(--u));line-height:calc(18*var(--u))}
  .wch-panel li a>span{font-size:calc(12.4*var(--u));line-height:calc(15.5*var(--u));white-space:nowrap}

  .wch-lp{grid-template-columns:505fr 519fr;gap:0;padding:calc(6*var(--u)) 0 0;align-items:start}
  .wch-lp .txt{padding-top:calc(22*var(--u))}
  .wch-lp .pic{height:calc(236*var(--u));border-right:1px solid rgba(26,31,27,.12)}
  .wch-lp .pic img{height:100%;width:100%;object-fit:cover;object-position:left center}
  .wch-lp .txt{padding-left:calc(37*var(--u))}
  .wch-lp .eyebrow{font-size:calc(12*var(--u))}
  .wch-lp h2{margin-top:calc(2*var(--u));font-size:calc(31.5*var(--u));line-height:calc(36*var(--u));white-space:nowrap}
  .wch-lp h2 .sp{display:inline-block;width:calc(34*var(--u));height:calc(34*var(--u));transform:translate(calc(-4*var(--u)),calc(-30*var(--u)))}
  .wch-lp p{margin-top:calc(6*var(--u));font-size:calc(15*var(--u));line-height:calc(20.5*var(--u));max-width:calc(365*var(--u))}
  .wch-lp .ctas{margin-top:calc(14*var(--u));gap:calc(16*var(--u))}
  .wch-lp .ctas .btn{height:calc(33*var(--u));padding:0 calc(17*var(--u));font-size:calc(14*var(--u))}
  .wch-lp .ctas svg{width:calc(15*var(--u));height:calc(15*var(--u))}

  .wch-sw{margin:calc(4*var(--u)) calc(14*var(--u)) 0;height:calc(96*var(--u));border-radius:calc(14*var(--u));padding:0;gap:0;grid-template-columns:320fr 676fr;align-items:center}
  .wch-sw .t{padding-left:calc(37*var(--u));height:calc(76*var(--u));display:flex;align-items:center;border-right:1px solid #D3CDBC}
  .wch-sw h2{font-size:calc(24*var(--u));line-height:calc(25*var(--u))}
  .wch-sw h2 .ul{width:calc(128*var(--u));height:calc(9*var(--u));bottom:calc(-9*var(--u))}
  .wch-sw ul{grid-template-columns:minmax(0,155fr) minmax(0,170fr) minmax(0,147fr) minmax(0,165fr);gap:calc(7*var(--u));padding:0 calc(7*var(--u)) 0 calc(10*var(--u));height:calc(76*var(--u))}
  .wch-sw li{border-radius:calc(10*var(--u));padding:calc(10*var(--u)) calc(6*var(--u)) 0 calc(8*var(--u));gap:calc(10*var(--u))}
  .wch-sw li svg{width:calc(40*var(--u));height:calc(40*var(--u))}
  .wch-sw li b{font-size:calc(13*var(--u));line-height:calc(17*var(--u));white-space:nowrap}
  .wch-sw li span{margin-top:calc(3*var(--u));font-size:calc(11.4*var(--u));line-height:calc(15.5*var(--u));letter-spacing:-.02em}

  .wch-steps{grid-template-columns:180fr 820fr 24fr;padding:calc(14*var(--u)) 0 0;gap:0;align-items:start}
  .wch-steps .t{padding:calc(16*var(--u)) 0 0 calc(48*var(--u))}
  .wch-steps h2{font-size:calc(26*var(--u));line-height:calc(29*var(--u))}
  .wch-steps h2 .ul{width:calc(110*var(--u));height:calc(9*var(--u));bottom:calc(-11*var(--u))}
  .wch-steps ol{grid-template-columns:repeat(4,1fr);gap:0}
  .wch-steps li{padding:0 calc(22*var(--u))}
  .wch-steps .num{width:calc(22*var(--u));height:calc(22*var(--u));font-size:calc(11.5*var(--u))}
  .wch-steps b{margin-top:calc(6*var(--u));font-size:calc(15*var(--u));line-height:calc(19*var(--u))}
  .wch-steps span{margin:calc(3*var(--u)) auto 0;font-size:calc(12.4*var(--u));line-height:calc(16*var(--u));max-width:calc(128*var(--u))}
  .wch-steps .arr{display:block;position:absolute;right:calc(-14*var(--u));top:calc(28*var(--u));width:calc(26*var(--u));height:calc(16*var(--u));color:#8E9089;stroke-width:2.6}

  .wch-band{margin-top:calc(4*var(--u));min-height:calc(146*var(--u));padding:calc(26*var(--u)) 0 calc(14*var(--u))}
  .wct{max-width:none;width:calc(516*var(--u))}
  .wct figure{min-height:calc(80*var(--u))}
  .wct blockquote{font-size:calc(18.2*var(--u));line-height:calc(24.5*var(--u));padding:0 calc(46*var(--u))}
  .wct figcaption{margin-top:calc(7*var(--u));font-size:calc(12.4*var(--u))}
  .wct .nav{width:calc(42*var(--u));height:calc(42*var(--u));translate:0 0;top:calc(18*var(--u))}
  .wct .nav svg{width:calc(20*var(--u));height:calc(20*var(--u))}
  .wct .prev{left:calc(-21*var(--u))}.wct .next{right:calc(-21*var(--u))}
  .wct .dots{margin-top:calc(9*var(--u));gap:calc(2*var(--u))}
  .wct .dots button{width:calc(14*var(--u));height:calc(14*var(--u))}
  .wct .dots i{width:calc(8*var(--u));height:calc(8*var(--u))}
}
`;

export function AgencyHome({ org }: { org: PublicOrg }) {
  const base = `/site/${org.slug}`;
  const statIcons = [Users, Monitor, Code2];
  const quotes = TESTIMONIALS;
  return (
    <div className="wch">
      <style>{HOME_CSS}</style>
      <div className="wch-art">
        {/* Hero */}
        <section className="wch-hero" aria-labelledby="hero-h">
          <p className="eyebrow ag-in ag-d1">Independent digital studio · Canberra, Australia<i aria-hidden /></p>
          <h1 id="hero-h" className="serif ag-in ag-d2">Good people.<br />Great websites.<em>Seriously clever tech.</em></h1>
          <p className="lede ag-in ag-d3">We design, build and support websites, web apps and custom software for businesses with big ideas.</p>
          <div className="ctas ag-in ag-d3">
            <Link href={`${base}/quote`} className="btn btn-dark">Let&apos;s build something<ArrowUpRight aria-hidden className="ag-arrow" strokeWidth={2.4} /></Link>
            <Link href={`${base}#work`} className="btn btn-line">Explore our work<ArrowUpRight aria-hidden className="ag-arrow" strokeWidth={2.4} /></Link>
          </div>
          <p className="hand ag-in ag-d4"><Cup className="cup" /><span>Powered by curiosity, code &amp; probably too much coffee.<Underline draw className="ul" /></span></p>
          <div className="pic ag-reveal">
            <img src={`${IMG}/hero.webp`} alt="A laptop on a timber desk beside a trailing plant in a sunlit studio" fetchPriority="high" />
          </div>
        </section>

        {/* Local. Reliable. Proven. */}
        <section id="about" className="wch-strip scroll-mt-24" aria-label={`Our ${YEAR_STATS.year} in numbers`}>
          <p className="t serif">Local. Reliable.<br />Proven.</p>
          {YEAR_STATS.items.map((s, i) => {
            const I = statIcons[i];
            return <div key={s.label} className="s"><I aria-hidden strokeWidth={1.4} /><span><span className="n">{s.value}+</span><span className="l">{s.label[0].toUpperCase() + s.label.slice(1)}</span></span></div>;
          })}
          <div className="s"><Cloud aria-hidden strokeWidth={1.4} /><span><span className="n">Local</span><span className="l">Canberra-based support</span></span></div>
        </section>

        {/* All things digital */}
        <section className="wch-panel ag-dark" aria-labelledby="all-h">
          <h2 id="all-h" className="serif">All things digital.<br />Under one roof.<Underline className="ul" color="var(--lime2)" /></h2>
          <ul>
            {CATEGORIES.map((c) => {
              const I = CAT_ICONS[c.key as keyof typeof CAT_ICONS] ?? Monitor;
              return (
                <li key={c.key}>
                  <Link href={`${base}/${c.href}`}><I aria-hidden strokeWidth={1.5} /><b>{(CAT_LINES[c.key] ?? [c.name]).map((l, j) => <span key={l} className="bl">{j > 0 && <br />}{l}</span>)}</b><span>{(CAT_DESC[c.key] ?? c.line).split("|").map((l, j) => <span key={l} className="bl">{j > 0 && <br className="dk" />}{j > 0 && " "}{l}</span>)}</span></Link>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Meet LeadPages */}
        <section className="wch-lp" aria-labelledby="lp-h">
          <div className="pic"><img src={`${IMG}/leadpages.webp`} alt="The LeadPages website editor open on a laptop" loading="lazy" /></div>
          <div className="txt">
            <p className="eyebrow"><b>Meet</b> LeadPages</p>
            <h2 id="lp-h" className="serif">The smarter way to website.<Sparks className="sp" /></h2>
            <p>Our Australian-built platform that makes it easy to create, manage and grow your website — without the complexity of traditional systems.</p>
            <div className="ctas">
              <Link href={`${base}/leadpages`} className="btn btn-dark">Explore LeadPages<ArrowUpRight aria-hidden className="ag-arrow" strokeWidth={2.4} /></Link>
              <Link href={`${base}/leadpages#compare`} className="btn btn-line">Compare to WordPress</Link>
            </div>
          </div>
        </section>

        {/* More than websites */}
        <section id="work" className="wch-sw scroll-mt-24" aria-labelledby="sw-h">
          <div className="t"><h2 id="sw-h" className="serif">More than websites.<br />Real business software.<Underline className="ul" color="var(--lime2)" /></h2></div>
          <ul>
            {PRODUCTS.map((p) => (
              <li key={p.name}><ProductMark mark={p.mark} /><span><b>{p.name}</b><span>{p.text}</span></span></li>
            ))}
          </ul>
        </section>

        {/* From idea to launch */}
        <section className="wch-steps" aria-labelledby="how-h">
          <div className="t"><h2 id="how-h" className="serif">From idea<br />to launch.<Underline className="ul" color="var(--lime2)" /></h2></div>
          <ol>
            {LAUNCH.map((s, i) => (
              <li key={s.title}>
                <span className="num">{i + 1}</span><b>{s.title}</b><span>{s.text}</span>
                {i < LAUNCH.length - 1 && <StepArrow className="arr" />}
              </li>
            ))}
          </ol>
        </section>


      </div>
      {/* Review */}
        <section className="wch-band" aria-label="What clients say">
          <Testimonials items={quotes} compact />
        </section>
    </div>
  );
}
