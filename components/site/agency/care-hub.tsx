import Link from "next/link";
import type { PublicOrg } from "@/lib/bookings/server";
import { packPrice, readCare } from "@/lib/nerdherd/care";
import { readNerd } from "@/lib/nerdherd/core";
import { money } from "@/lib/format";
import { serviceBySlug } from "@/lib/site/agency/content";
import { FaqList } from "./ui";

/**
 * The Care Hub page on an agency's site (Nerd Herd businesses): the approved design — dark hero with a live-looking
 * portal card (prepaid hours, a task list, updates waiting), a real update list, block pricing from the business's own
 * Care Hub settings, the four steps, and a closing panel. Sits inside the agency frame (header, menu, footer).
 */
const CSS = `
.ch{--ch-ink:#0F0B1E;--ch-ink2:#1A1530;--ch-paper:#F5F4FA;--ch-surface:#FFFFFF;--ch-line:#E2DFEC;--ch-muted:#575270;--ch-faint:#8A86A0;--ch-lime:#C8F560;--ch-amber-bg:#FFF6E0;--ch-amber-line:#F2D58A;--ch-amber-ink:#7A4B00;--ch-ok:#1F7A4D;font-size:16px;line-height:1.55;color:var(--ch-ink)}
.ch *{box-sizing:border-box}
.ch .wrap{max-width:1120px;margin:0 auto;padding-left:max(20px,env(safe-area-inset-left,0px));padding-right:max(20px,env(safe-area-inset-right,0px))}
.ch h1,.ch h2,.ch h3{font-family:'Fraunces Variable','Fraunces',Georgia,'Times New Roman',serif;font-weight:650;letter-spacing:-0.02em;text-wrap:balance;margin:0}
.ch p{margin:0}
.ch .hero{background:var(--ch-ink);color:#fff;padding-block:56px 72px;position:relative;overflow:hidden}
.ch .hero::before{content:"";position:absolute;inset:0;opacity:.06;background-image:linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px);background-size:32px 32px;pointer-events:none}
.ch .hero .wrap{position:relative;display:grid;gap:48px;grid-template-columns:1.1fr 1fr;align-items:center}
.ch .brand{display:flex;align-items:center;gap:10px;font-weight:600;font-size:15px;color:#fff;opacity:.9}
.ch .brand i{width:10px;height:10px;border-radius:3px;background:var(--ch-lime);display:inline-block}
.ch .hero h1{font-size:clamp(2.5rem,5.4vw,4.25rem);line-height:1.02;margin-top:22px}
.ch .hero h1 em{font-style:normal;color:var(--ch-lime)}
.ch .lede{margin-top:20px;font-size:1.125rem;color:rgba(255,255,255,.75);max-width:52ch}
.ch .ctas{display:flex;flex-wrap:wrap;gap:12px;margin-top:30px}
.ch .btn{display:inline-flex;align-items:center;gap:8px;height:48px;padding:0 22px;border-radius:999px;font-weight:600;text-decoration:none;font-size:15px}
.ch .btn.lime{background:var(--ch-lime);color:var(--ch-ink)}
.ch .btn.lime:hover{background:#fff}
.ch .btn.ghost{color:#fff;box-shadow:inset 0 0 0 1px rgba(255,255,255,.3)}
.ch .btn.ghost:hover{background:rgba(255,255,255,.08)}
.ch .card{background:var(--ch-ink2);border-radius:26px;padding:22px;box-shadow:0 40px 80px -40px rgba(0,0,0,.7),inset 0 0 0 1px rgba(255,255,255,.1)}
.ch .card .top{display:flex;justify-content:space-between;align-items:flex-end;gap:12px}
.ch .card .big{font-family:'Fraunces Variable','Fraunces',Georgia,serif;font-size:2.6rem;line-height:1;font-weight:650}
.ch .small{font-size:13px;color:rgba(255,255,255,.6)}
.ch .meter{height:10px;border-radius:99px;background:rgba(255,255,255,.1);margin-top:14px;overflow:hidden}
.ch .meter span{display:block;height:100%;width:55%;background:var(--ch-lime);border-radius:99px}
.ch .task{margin-top:18px;background:rgba(255,255,255,.05);border-radius:18px;padding:16px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}
.ch .task h4{margin:0;font-size:15px;font-weight:600}
.ch .task ul{list-style:none;margin:10px 0 0;padding:0;display:grid;gap:7px;font-size:14px}
.ch .task li{display:flex;gap:9px;align-items:flex-start}
.ch .tick{flex:none;width:18px;height:18px;border-radius:50%;margin-top:2px;display:grid;place-items:center;font-size:11px;font-weight:700}
.ch .tick.on{background:var(--ch-lime);color:var(--ch-ink)}
.ch .tick.off{box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.35)}
.ch .task li.done span:last-child{color:rgba(255,255,255,.6)}
.ch .chip{display:inline-flex;align-items:center;gap:6px;margin-top:14px;padding:6px 12px;border-radius:99px;background:rgba(200,245,96,.14);color:var(--ch-lime);font-size:13px;font-weight:600}
.ch .example{margin-top:10px;font-size:12px;color:rgba(255,255,255,.45)}
.ch section{padding-block:72px}
.ch .flush{padding-top:0}
.ch .eyebrow{font-size:13px;font-weight:600;color:var(--ch-muted);letter-spacing:.02em}
.ch h2{font-size:clamp(1.9rem,3.6vw,2.75rem);line-height:1.08;margin-top:8px}
.ch .sub{margin-top:12px;color:var(--ch-muted);max-width:62ch;font-size:1.0625rem}
.ch .grid4{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;margin-top:36px}
.ch .feat{background:var(--ch-surface);border-radius:22px;padding:24px;box-shadow:inset 0 0 0 1px var(--ch-line)}
.ch .feat .k{font-family:'Fraunces Variable','Fraunces',Georgia,serif;font-size:1.35rem;font-weight:650}
.ch .feat p{margin-top:8px;color:var(--ch-muted)}
.ch .updates{display:grid;grid-template-columns:1fr 1.1fr;gap:36px;align-items:start}
.ch .site{background:var(--ch-surface);border-radius:22px;padding:22px;box-shadow:inset 0 0 0 1px var(--ch-line);min-width:0}
.ch .site .row{display:flex;justify-content:space-between;gap:12px;align-items:center}
.ch .site .dom{font-weight:600}
.ch .badge{font-size:12px;font-weight:600;padding:4px 10px;border-radius:99px;background:rgba(31,122,77,.12);color:var(--ch-ok)}
.ch .vers{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:16px 0 0;font-size:13px}
.ch .vers dt{color:var(--ch-faint)}
.ch .vers dd{margin:0;font-weight:650;font-variant-numeric:tabular-nums}
.ch .vers dd.behind{color:var(--ch-amber-ink)}
.ch .waiting{margin-top:16px;background:var(--ch-amber-bg);box-shadow:inset 0 0 0 1px var(--ch-amber-line);border-radius:14px;padding:12px 14px}
.ch .waiting b{color:var(--ch-amber-ink);font-size:14px}
.ch .waiting ul{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:5px;font-size:13.5px}
.ch .waiting li{display:flex;justify-content:space-between;gap:10px}
.ch .waiting li span:last-child{color:var(--ch-muted);font-variant-numeric:tabular-nums;white-space:nowrap}
.ch .latest{margin-top:12px;font-size:12.5px;color:var(--ch-faint)}
.ch .prices{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin-top:36px}
.ch .price{background:var(--ch-surface);border-radius:22px;padding:26px;box-shadow:inset 0 0 0 1px var(--ch-line);position:relative}
.ch .price.pick{box-shadow:inset 0 0 0 2px var(--ch-ink2)}
.ch .price .h{font-family:'Fraunces Variable','Fraunces',Georgia,serif;font-size:2rem;font-weight:650;line-height:1}
.ch .price .amt{margin-top:14px;font-size:1.6rem;font-weight:700;font-variant-numeric:tabular-nums}
.ch .gst{font-size:14px;color:var(--ch-muted);font-weight:500}
.ch .price .per{margin-top:6px;font-size:14px;color:var(--ch-muted)}
.ch .save{position:absolute;top:22px;right:22px;font-size:12px;font-weight:700;padding:4px 10px;border-radius:99px;background:var(--ch-lime);color:var(--ch-ink)}
.ch .ads{margin-top:16px;background:var(--ch-surface);border-radius:22px;padding:24px 26px;box-shadow:inset 0 0 0 1px var(--ch-line);display:flex;flex-wrap:wrap;gap:16px 32px;align-items:center;justify-content:space-between}
.ch .ads .k{font-family:'Fraunces Variable','Fraunces',Georgia,serif;font-size:1.35rem;font-weight:650}
.ch .ads p{color:var(--ch-muted);margin-top:4px;max-width:58ch}
.ch .ads .amt{font-size:1.4rem;font-weight:700;white-space:nowrap}
.ch .rule{margin-top:18px;font-size:14.5px;color:var(--ch-muted);max-width:70ch}
.ch .steps{list-style:none;padding:0;margin:36px 0 0;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px;counter-reset:s}
.ch .steps li{counter-increment:s;border-top:2px solid var(--ch-ink);padding-top:16px}
.ch .steps li::before{content:counter(s);font-family:'Fraunces Variable','Fraunces',Georgia,serif;font-size:1.6rem;font-weight:650;display:block}
.ch .steps b{display:block;margin-top:6px}
.ch .steps p{margin-top:6px;color:var(--ch-muted);font-size:15px}
.ch .close{background:var(--ch-ink);color:#fff;border-radius:30px;padding:44px;display:grid;grid-template-columns:1.3fr 1fr;gap:28px;align-items:center}
.ch .close h2{color:#fff}
.ch .close p{color:rgba(255,255,255,.72);margin-top:10px}
.ch .contact{display:grid;gap:10px;font-size:15px}
.ch .contact div{display:flex;justify-content:space-between;gap:10px;padding:12px 16px;border-radius:14px;background:rgba(255,255,255,.06);box-shadow:inset 0 0 0 1px rgba(255,255,255,.1)}
.ch .contact span:first-child{color:rgba(255,255,255,.55)}
.ch .contact span:last-child{font-weight:600;user-select:all;text-align:right}
.ch .faqs{max-width:820px}
@media (max-width:900px){.ch .hero .wrap,.ch .updates,.ch .close{grid-template-columns:1fr}.ch .prices{grid-template-columns:1fr}.ch .steps{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:560px){.ch .grid4,.ch .steps{grid-template-columns:1fr}.ch section{padding-block:52px}.ch .close{padding:28px 20px}.ch .hero{padding-bottom:52px}}
@media (prefers-reduced-motion:no-preference){.ch .meter span{animation:chfill 1.4s cubic-bezier(.2,.7,.2,1) both .3s}@keyframes chfill{from{width:0}}}
`;

export function CareHubLanding({ org }: { org: PublicOrg }) {
  const base = `/site/${org.slug}`;
  const portal = `/p/${org.slug}`;
  const care = readCare(org.rawSettings);
  const nerd = readNerd(org.rawSettings);
  const rate = nerd.hourlyRate;
  const packs = care.packs.map((p) => ({ ...p, ...packPrice(p, rate) }));
  const pick = packs.length >= 3 ? packs[1].hours : null;
  const fee = care.adsFeeExGst;
  const adsWorth = Math.round(rate * 2 * 52 / 12);
  const m = (n: number) => money(n, org.currency, { cents: false });
  const svc = serviceBySlug("website-maintenance");
  const faqs = svc?.faqs ?? [];
  const check = svc?.pricing?.items[0] ?? null;
  const minH = nerd.minHours === 1 ? "1 hour" : `${nerd.minHours} hours`;

  return (
    <div className="ch">
      <style>{CSS}</style>
      <section className="hero">
        <div className="wrap">
          <div>
            <div className="brand"><i />{org.name} · Care Hub</div>
            <h1>Your website, looked after in <em>one place</em>.</h1>
            <p className="lede">Buy a block of hours, list the changes you want, attach your files — and we get on with them. No quote to wait for each time, no email chains, and you can see exactly what your site needs.</p>
            <div className="ctas">
              <Link className="btn lime" href={portal}>Open your client portal</Link>
              <a className="btn ghost" href="#how">How it works</a>
            </div>
          </div>
          <div className="card" aria-label="Example of the client portal">
            <div className="top">
              <div><div className="big">2 h 45 m</div><div className="small">prepaid hours left</div></div>
              <div className="small" style={{ textAlign: "right" }}>2 h 15 m used<br />of a 5-hour block</div>
            </div>
            <div className="meter"><span /></div>
            <div className="task">
              <h4>Menu and price updates</h4>
              <ul>
                {["Change Saturday hours to 8–2", "New prices on the catering page", "Swap in the new team photo (attached)"].map((t) => <li key={t} className="done"><span className="tick on">✓</span><span>{t}</span></li>)}
                <li><span className="tick off" /><span>Add the Christmas closure banner</span></li>
              </ul>
            </div>
            <span className="chip">6 plugin updates waiting · tap to ask us</span>
            <p className="example">Example — your portal shows your own sites and requests.</p>
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <p className="eyebrow">What you get</p>
          <h2>Small changes, done without the back-and-forth.</h2>
          <p className="sub">Everything lives in your {org.name} client portal. Sign in with your email, get a one-time code, no password to remember.</p>
          <div className="grid4">
            <div className="feat"><div className="k">Prepaid hours</div><p>Buy {packs.map((p) => p.hours).join(", ").replace(/, (?=[^,]*$)/, " or ")} hours. Bigger blocks cost less an hour, and your balance is on every page.</p></div>
            <div className="feat"><div className="k">Task lists with files</div><p>One change per line, logos and photos attached. We tick them off as we go, and you watch it happen.</p></div>
            <div className="feat"><div className="k">Jobs and problems too</div><p>Lodge a bigger job and we quote it first. Report a problem and tell us how urgent it is. Every reply stays with the request.</p></div>
            <div className="feat"><div className="k">Make it yours</div><p>Put what matters to you first — your hours, your sites, your requests or your Ads results — and hide the rest.</p></div>
          </div>
        </div>
      </section>

      <section className="flush">
        <div className="wrap updates">
          <div>
            <p className="eyebrow">Know what your site needs</p>
            <h2>See every update waiting, before it becomes a problem.</h2>
            <p className="sub">Our connector plugin on your WordPress site reports what it&apos;s running. Your portal shows it beside the latest WordPress, WooCommerce, Elementor, Yoast and PHP releases, and lists every plugin and theme with an update waiting. One tap turns that list into a request.</p>
            <p className="sub">We take a backup before making changes, and every change is recorded in your portal with the time it took.</p>
          </div>
          <div className="site" aria-label="Example website card">
            <div className="row"><span className="dom">yourbusiness.com.au</span><span className="badge">Live</span></div>
            <dl className="vers">
              <div><dt>WordPress</dt><dd className="behind">7.1.4</dd></div>
              <div><dt>WooCommerce</dt><dd className="behind">11.1.0</dd></div>
              <div><dt>PHP</dt><dd>8.3</dd></div>
            </dl>
            <div className="waiting">
              <b>6 updates waiting</b>
              <ul>
                {[["WordPress", "7.1.4 → 7.1.5"], ["WooCommerce", "11.1.0 → 11.2.1"], ["Contact form plugin", "update ready"], ["SEO plugin", "update ready"], ["Page builder", "update ready"], ["Your theme", "update ready"]].map(([a, b]) => <li key={a}><span>{a}</span><span>{b}</span></li>)}
              </ul>
            </div>
            <p className="latest">Example figures. Your portal shows your own sites and today&apos;s latest versions.</p>
          </div>
        </div>
      </section>

      <section className="flush">
        <div className="wrap">
          <p className="eyebrow">Pricing</p>
          <h2>Pay for hours once. Use them when you need them.</h2>
          <div className="prices">
            {packs.map((p) => (
              <div key={p.hours} className={`price${p.hours === pick ? " pick" : ""}`}>
                {p.discountPct > 0 && <span className="save">Save {p.discountPct}%</span>}
                <div className="h">{p.hours} hours</div>
                <div className="amt">{m(p.exGst)} <span className="gst">+ GST</span></div>
                <div className="per">{money(Math.round((p.exGst / p.hours) * 100) / 100, org.currency, { cents: false })} an hour · {m(p.incGst)} inc GST</div>
              </div>
            ))}
          </div>
          <div className="ads">
            <div><div className="k">Add Google Ads to your package</div><p>We set up and run your campaigns with 2 hours of hands-on campaign work every week, block searches that waste money, and send you a detailed report each month. That&apos;s about 8.7 hours of work a month — {m(adsWorth)} + GST at our normal {m(rate)} rate.</p></div>
            <div className="amt">{fee !== null ? <>{m(fee)} <span className="gst">+ GST / month</span></> : <span className="gst">Ask us</span>}</div>
          </div>
          {check && (
            <div className="ads">
              <div><div className="k">Prefer it scheduled? {check.name}</div><p>A regular visit on a cycle that suits your site ({check.note?.toLowerCase() ?? "monthly, quarterly or six-monthly"}): a backup first, WordPress, plugin and theme updates, a malware scan, then pages and forms tested on desktop and mobile. Each check is recorded in your portal.</p></div>
              <div className="amt">{check.price} <span className="gst">{check.unit}</span></div>
            </div>
          )}
          <p className="rule">Each request uses at least {minH}, then our time to the next 15 minutes — so group small changes into one list and they share that first hour.{fee !== null && adsWorth > fee ? ` The Google Ads add-on saves about ${m(adsWorth - fee)} a month on our hourly rate;` : ""} Your ad budget is paid to Google.</p>
        </div>
      </section>

      <section className="flush" id="how">
        <div className="wrap">
          <p className="eyebrow">How it works</p>
          <h2>Four steps, all in your portal.</h2>
          <ol className="steps">
            <li><b>Buy a block</b><p>Choose your hours and pay by card. They&apos;re ready as soon as it&apos;s paid.</p></li>
            <li><b>List what you need</b><p>Pick the website, add your changes and attach the files.</p></li>
            <li><b>We do the work</b><p>We back up, make the changes and reply in your portal.</p></li>
            <li><b>See what was done</b><p>Tasks ticked off, time used, and what&apos;s left on your block.</p></li>
          </ol>
        </div>
      </section>

      {faqs.length > 0 && (
        <section className="flush">
          <div className="wrap faqs">
            <p className="eyebrow">Questions</p>
            <h2 style={{ marginBottom: 24 }}>Good to know.</h2>
            <FaqList faqs={faqs} />
          </div>
        </section>
      )}

      <section className="flush">
        <div className="wrap">
          <div className="close">
            <div>
              <h2>Ready when you are.</h2>
              <p>Already a {org.name} client? Sign in to your portal with the email we have on file and choose a block. New to us? Call or email and we&apos;ll set you up.</p>
              <div className="ctas"><Link className="btn lime" href={portal}>Open your client portal</Link><Link className="btn ghost" href={`${base}/quote?service=website-maintenance`}>Get in touch</Link></div>
            </div>
            <div className="contact">
              {org.contact_phone && <div><span>Phone</span><span>{org.contact_phone}</span></div>}
              {org.contact_email && <div><span>Email</span><span>{org.contact_email}</span></div>}
              {org.address && <div><span>Visit</span><span>{org.address}</span></div>}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
