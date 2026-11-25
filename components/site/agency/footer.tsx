import Link from "next/link";
import { Mail, MapPin, Phone } from "lucide-react";
import type { PublicOrg } from "@/lib/bookings/server";
import { AGENCY, CATEGORIES, PRODUCTS } from "@/lib/site/agency/content";
import { AgencyWordmark, Underline } from "./deco";

const FOOT_CSS = `
.wcf{background:#10251B;color:#fff}
.wcf-in{max-width:1920px;margin:0 auto;display:grid;gap:28px;padding:36px 22px 28px}
.wcf .sub{margin-top:8px;font-size:14px;color:rgba(255,255,255,.85)}
.wcf h2{font-size:13px;font-weight:700;color:#fff}
.wcf ul{margin-top:8px}
.wcf li{font-size:13px;line-height:1.75;color:rgba(255,255,255,.82)}
.wcf li a:hover{color:#fff;text-decoration:underline}
.wcf .contact li{display:flex;align-items:center;gap:12px;font-size:15px;line-height:2.1;color:#fff}
.wcf .contact svg{width:18px;height:18px;color:#C5DE1E;flex:none}
.wcf .em{position:relative;display:inline-block}
.wcf .em .ul{position:absolute;left:0;right:-10px;bottom:-12px;height:10px;width:115%}
.wcf .base{max-width:1920px;margin:0 auto;padding:14px 22px 22px;font-size:12px;color:rgba(255,255,255,.5);display:flex;flex-wrap:wrap;gap:6px 18px;justify-content:space-between}
.wcf .base a:hover{color:#fff}
@media (min-width:640px){.wcf-in{grid-template-columns:1fr 1fr}}
@media (min-width:1024px){
  .wcf-in{--u:calc(min(100vw,1920px) / 1024);grid-template-columns:239fr 233fr 156fr 115fr 243fr;gap:0;padding:calc(23*var(--u)) 0 calc(40*var(--u)) calc(38*var(--u));min-height:calc(174*var(--u))}
  .wcf .brand{border-right:1px solid rgba(255,255,255,.3);height:calc(86*var(--u));margin-top:calc(2*var(--u))}
  .wcf .brand .wm{font-size:calc(26.5*var(--u))}
  .wcf .brand .wm-mark{width:calc(34*var(--u));height:calc(22*var(--u))}
  .wcf .sub{margin:calc(4*var(--u)) 0 0 calc(42*var(--u));font-size:calc(12.6*var(--u))}
  .wcf nav{padding-top:calc(5*var(--u))}
  .wcf nav:first-of-type{padding-left:calc(49*var(--u))}
  .wcf h2{font-size:calc(11.6*var(--u))}
  .wcf ul{margin-top:calc(5*var(--u))}
  .wcf li{font-size:calc(11.2*var(--u));line-height:calc(17.8*var(--u))}
  .wcf .contact{border-left:1px solid rgba(255,255,255,.3);height:calc(86*var(--u));margin-top:calc(2*var(--u));padding-left:calc(44*var(--u))}
  .wcf .contact ul{margin-top:0}
  .wcf .contact li{font-size:calc(12.8*var(--u));line-height:calc(27*var(--u));gap:calc(11*var(--u))}
  .wcf .contact svg{width:calc(16*var(--u));height:calc(16*var(--u))}
  .wcf .em .ul{bottom:calc(-14*var(--u));height:calc(9*var(--u))}
  .wcf .base{padding:0 calc(40*var(--u)) calc(16*var(--u));font-size:calc(10.5*var(--u))}
}`;

/** Deep-forest footer, as on the design board: brand, What We Do, Products, Company, and how to reach us. */
export function AgencyFooter({ org }: { org: PublicOrg }) {
  const base = `/site/${org.slug}`;
  const phone = org.contact_phone || AGENCY.phone, email = org.contact_email || AGENCY.email;
  const place = `${AGENCY.locality === "Mitchell" ? "Canberra" : AGENCY.locality}, ${AGENCY.region}`;
  return (
    <footer className="wcf ag-dark">
      <style>{FOOT_CSS}</style>
      <div className="wcf-in">
        <div className="brand">
          <Link href={base} aria-label={`${org.name} home`} className="inline-block"><AgencyWordmark name={org.name} tone="dark" /></Link>
          <p className="sub">Digital Studio · Canberra</p>
        </div>
        <nav aria-labelledby="f-what">
          <h2 id="f-what">What We Do</h2>
          <ul>{CATEGORIES.filter((c) => c.key !== "support").map((c) => <li key={c.key}><Link href={`${base}/${c.href}`}>{c.name}</Link></li>)}</ul>
        </nav>
        <nav aria-labelledby="f-prod">
          <h2 id="f-prod">Products</h2>
          <ul>
            <li><Link href={`${base}/leadpages`}>LeadPages</Link></li>
            {PRODUCTS.map((p) => <li key={p.name}><Link href={`${base}#work`}>{p.name}</Link></li>)}
          </ul>
        </nav>
        <nav aria-labelledby="f-co">
          <h2 id="f-co">Company</h2>
          <ul>
            <li><Link href={`${base}#work`}>Our Work</Link></li>
            <li><Link href={`${base}#about`}>About Us</Link></li>
            <li><Link href={`${base}/support`}>Support</Link></li>
            <li><Link href={`${base}/quote`}>Contact</Link></li>
          </ul>
        </nav>
        <div className="contact">
          <ul>
            <li><MapPin aria-hidden strokeWidth={1.8} />{place}</li>
            <li><Phone aria-hidden strokeWidth={1.8} /><a href={`tel:${phone.replace(/[^\d+]/g, "")}`}>{phone.replace(/^0(\d) /, "(0$1) ")}</a></li>
            <li><Mail aria-hidden strokeWidth={1.8} /><a href={`mailto:${email}`} className="em">{email}<Underline className="ul" color="#C5DE1E" /></a></li>
          </ul>
        </div>
      </div>
      <div className="base">
        <p>© {new Date().getFullYear()} {org.name}. Prices shown exclude GST.</p>
        <p><Link href={`/p/${org.slug}`}>Client login</Link> · <Link href={`/p/${org.slug}/support`}>Track a ticket</Link></p>
      </div>
    </footer>
  );
}
