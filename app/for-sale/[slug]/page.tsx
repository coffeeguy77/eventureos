import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Instrument_Sans, Newsreader } from "next/font/google";
import { loadSale, noteBuyerView, DEFAULT_NDA, type PublicSection } from "@/lib/sales/public";
import { createClient } from "@/lib/supabase/server";
import { thumb } from "@/lib/sales/format";
import { SaleTour, NdaForm, PrintButton, RequestForm } from "./client";
import { SaleDashboard } from "./dash";
import s from "./sale.module.css";

const serif = Newsreader({ subsets: ["latin"], variable: "--fs-serif", display: "swap", style: ["normal", "italic"] });
const sans = Instrument_Sans({ subsets: ["latin"], variable: "--fs-sans", display: "swap" });

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ slug: string }>; searchParams: Promise<{ k?: string }> };

export async function generateMetadata({ params, searchParams }: Params): Promise<Metadata> {
  const { slug } = await params; const { k } = await searchParams;
  const sale = await loadSale(slug, k ?? null).catch(() => null);
  if (!sale) return { title: "Business for sale", robots: { index: false } };
  const d = sale.listing.details;
  return {
    title: `${sale.listing.title} — for sale`,
    description: typeof d.description === "string" ? d.description : undefined,
    // buyer links are private; the page is only indexed when it's public and opened without a buyer link
    robots: { index: sale.listing.is_public && !k, follow: false },
  };
}

const money = (n: unknown) => {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return null;
  return v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 2).replace(/\.?0+$/, "")}m` : `$${Math.round(v).toLocaleString("en-AU")}`;
};
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

export default async function ForSalePage({ params, searchParams }: Params) {
  const { slug } = await params; const { k } = await searchParams;
  // the seller (signed in, a manager of the business) previews the whole page
  let preview = false;
  try {
    const supabase = await createClient();
    const { data: own } = await supabase.from("sale_listings").select("id").ilike("slug", slug).maybeSingle();
    preview = !!own && !k;
  } catch { /* not signed in */ }
  const sale = await loadSale(slug, k ?? null, preview);
  if (!sale) notFound();
  if (sale.buyer) await noteBuyerView(sale.buyer.id).catch(() => undefined);
  const { listing, org, tour, sections, locked, equipment, buyer, unlocked, history, dash } = sale;
  const d = listing.details;
  const lo = money(d.askingPriceMin), hi = money(d.askingPriceMax), one = money(d.askingPrice);
  const price = lo && hi ? `${lo} – ${hi}` : one ?? lo ?? hi;
  const place = [str(d.suburb), str(d.state)].filter(Boolean).join(", ");
  const kind = str(d.subcategory) ?? str(d.category);
  const figs = ([
    ["Weekly revenue", money(d.weeklyRevenue)],
    ["Adjusted profit a year", money(d.adjustedProfit)],
    ["Rent", money(d.rent)],
    ["Lease options", str(d.leaseOptions)],
    ["Staff", Number(d.staffCount) > 0 ? String(d.staffCount) : null],
    ["Owner's hours a week", Number(d.ownerHours) > 0 ? String(d.ownerHours) : null],
  ] as [string, string | null][]).filter(([, v]) => v);
  const photos = (listing.report_images.length ? listing.report_images.map((p) => p.url) : listing.photos).filter((u) => /^https:/.test(u));
  const disclaimer = sections.find((x) => x.key === "disclaimer");
  const body = sections.filter((x) => x.key !== "disclaimer");
  const pub = body.filter((x) => x.visibility === "public");
  const priv = body.filter((x) => x.visibility === "buyers");
  const eqTotal = equipment.reduce((t, e) => t + e.secondhand, 0), eqNew = equipment.reduce((t, e) => t + e.replacement, 0);
  const contact = org.contact_email;

  return (
    <div className={`${s.page} ${serif.variable} ${sans.variable}`}>
      <div className={s.wrap}>
        <div className={s.top}>
          <span>{preview ? `Preview: you're seeing everything a signed buyer sees${sale.listing.is_public ? "" : ". This page is private — only buyers you add can open it"}.` : buyer ? `Private link for ${buyer.name}` : "Business for sale"}</span>
          <span style={{ display: "flex", gap: "1rem", alignItems: "center" }}>{unlocked && <PrintButton />}{contact && <a href={`mailto:${contact}?subject=${encodeURIComponent(listing.title)}`}>Contact the seller</a>}</span>
        </div>

        <header className={s.head}>
          <div>
            <h1 className={s.title}>{listing.title}</h1>
            <p className={s.where}>{[kind, place].filter(Boolean).join(" in ")}{str(d.description) ? `. ${str(d.description)}` : ""}</p>
          </div>
          {price && <div className={s.price}><div className={s.priceFig}>{price}</div><div className={s.priceNote}>Asking price{equipment.length ? ", plant and equipment included" : ""}</div></div>}
        </header>

        {tour.length > 0 && (
          <section className={s.tour} aria-label="360° walkthrough">
            <SaleTour spaces={tour} />
            <p className={s.tourHint}>Drag to look around. Tap the arrows to walk through {tour.length} rooms; the green markers play the owner&apos;s commentary.</p>
          </section>
        )}
      </div>
      {dash && <SaleDashboard dash={dash} unlocked={unlocked} />}
      <div className={s.wrap}>

        {figs.length > 0 && (
          <dl className={s.figs}>
            {figs.map(([l, v]) => <div key={l} className={s.fig}><dd className={s.figVal} style={{ margin: 0 }}>{v}</dd><dt className={s.figLab}>{l}</dt></div>)}
          </dl>
        )}

        {photos.length > 0 && (
          <div className={s.photos}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {photos.slice(0, 8).map((u) => <img key={u} src={thumb(u, 800, 600)} alt="" loading="lazy" />)}
          </div>
        )}

        <div className={s.secs}>
          {pub.map((x) => <Section key={x.key} x={x} />)}
          {dash && dash.terms.length > 0 && (
            <section className={s.sec}>
              <div><h2 className={s.secTitle}>Terms of sale</h2><p className={s.secSub}>Conditions that come with this sale.</p></div>
              <div className={s.terms}>{dash.terms.map((t, i) => <div key={i} className={s.term}>{t.title && <p className={s.termTitle}>{t.title}</p>}{t.text && <p className={s.termText}>{t.text}</p>}{t.figure && <p className={s.termFig}>{t.figure}</p>}</div>)}</div>
            </section>
          )}
          {equipment.length > 0 && (
            <section className={s.sec}>
              <div><h2 className={s.secTitle}>Plant and equipment</h2><p className={s.secSub}>Everything listed here is included in the sale.</p></div>
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead><tr><th>Division</th><th className={s.num}>Items</th><th className={s.num}>Second-hand value</th><th className={s.num}>To buy new</th></tr></thead>
                  <tbody>
                    {equipment.map((e) => <tr key={e.division}><td>{e.division}</td><td className={s.num}>{e.items}</td><td className={s.num}>{money(e.secondhand) ?? "$0"}</td><td className={s.num}>{money(e.replacement) ?? "$0"}</td></tr>)}
                    <tr><td><b>Total</b></td><td className={s.num}><b>{equipment.reduce((t, e) => t + e.items, 0)}</b></td><td className={s.num}><b>{money(eqTotal)}</b></td><td className={s.num}><b>{money(eqNew)}</b></td></tr>
                  </tbody>
                </table>
                {dash && dash.excludedEquipment.length > 0 && <><p className={s.secSub} style={{ marginTop: "1.5rem" }}>Not included — kept by the seller:</p><ul className={s.excluded}>{dash.excludedEquipment.map((e, i) => <li key={i}>{e.name}{e.division ? ` (${e.division})` : ""}</li>)}</ul></>}
              </div>
            </section>
          )}
        </div>

        {!unlocked && (
          <section className={s.gate} aria-label="Buyer information">
            <div>
              <h2 className={s.gateTitle}>{buyer ? "Sign to see the full information" : "The full information is for buyers"}</h2>
              <p className={s.gateText}>{buyer
                ? "Once you agree to keep it confidential, this page opens the month-by-month sales, profit and loss, wages, valuation and everything listed here."
                : "The month-by-month sales, profit and loss, wages, best sellers and valuation are shared with serious buyers who sign a confidentiality agreement. Ask for access and the seller will send you a private link."}</p>
              {locked.length > 0 && <ul className={s.lockedList}>{locked.map((x) => <li key={x.key}>{x.title}</li>)}</ul>}
            </div>
            {buyer ? <NdaForm slug={listing.slug} token={k ?? ""} text={listing.nda_text?.trim() || DEFAULT_NDA} /> : <RequestForm slug={listing.slug} contact={contact} />}
          </section>
        )}

        {unlocked && (
          <div className={s.secs} style={{ marginTop: 0 }}>
            {buyer?.nda_signed_at && <p className={s.signed}>You signed the confidentiality agreement on {new Date(buyer.nda_signed_at).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}. Please keep what follows to yourself and your advisers.</p>}
            {!dash && history && <section className={s.sec}><div><h2 className={s.secTitle}>Sales, month by month</h2><p className={s.secSub}>From the point-of-sale system, ex GST, for the last 12 full months.</p></div><SalesChart rows={history} /></section>}
            {priv.map((x) => <Section key={x.key} x={x} />)}
          </div>
        )}

        {disclaimer && <div className={s.secs} style={{ marginTop: 0 }}><Section x={disclaimer} /></div>}
        <footer className={s.foot}>{org.name ? `Offered by ${org.name}.` : ""} The information on this page was supplied by the seller and hasn&apos;t been independently checked; buyers should make their own enquiries.</footer>
      </div>
    </div>
  );
}

function Section({ x }: { x: PublicSection }) {
  const paras = (x.body ?? "").split(/\n{2,}|\r\n\r\n/).map((p) => p.trim()).filter(Boolean);
  const cols = x.table_data?.length ? Object.keys(x.table_data[0]) : [];
  const isNum = (v: unknown) => /^[-$\d.,%\s]+$/.test(String(v ?? "")) && /\d/.test(String(v ?? ""));
  return (
    <section className={s.sec}>
      <div><h2 className={s.secTitle}>{x.title}</h2>{x.subtitle && <p className={s.secSub}>{x.subtitle}</p>}</div>
      <div>
        {paras.length > 0 && <div className={s.prose}>{paras.map((p, i) => <p key={i}>{p}</p>)}</div>}
        {x.bullets.length > 0 && <ul className={s.list}>{x.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>}
        {cols.length > 0 && (
          <div className={s.tableWrap}><table className={s.table}>
            <thead><tr>{cols.map((c) => <th key={c} className={isNum(x.table_data![0][c]) ? s.num : undefined}>{c}</th>)}</tr></thead>
            <tbody>{x.table_data!.map((r, i) => <tr key={i}>{cols.map((c) => <td key={c} className={isNum(r[c]) ? s.num : undefined}>{String(r[c] ?? "")}</td>)}</tr>)}</tbody>
          </table></div>
        )}
      </div>
    </section>
  );
}

function SalesChart({ rows }: { rows: { month: string; sales: number; orders: number }[] }) {
  const W = 720, H = 240, L = 52, B = 26, T = 10;
  const max = Math.max(1, ...rows.map((r) => r.sales));
  const nice = Math.pow(10, Math.floor(Math.log10(max))) * (max / Math.pow(10, Math.floor(Math.log10(max))) > 5 ? 10 : max / Math.pow(10, Math.floor(Math.log10(max))) > 2 ? 5 : 2);
  const top = Math.ceil(max / (nice / 2)) * (nice / 2);
  const step = (W - L) / rows.length, bw = step * 0.62;
  const y = (v: number) => T + (1 - v / top) * (H - T - B);
  const ticks = [0, 0.5, 1].map((t) => t * top);
  const total = rows.reduce((t, r) => t + r.sales, 0);
  const short = (v: number) => (v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`);
  return (
    <div className={s.chart}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Monthly sales, ${short(total)} over 12 months`}>
        {ticks.map((t) => <g key={t}><line className={s.grid} x1={L} x2={W} y1={y(t)} y2={y(t)} /><text className={s.axis} x={L - 8} y={y(t) + 4} textAnchor="end">{short(t)}</text></g>)}
        {rows.map((r, i) => (
          <g key={r.month}>
            <rect className={i === rows.length - 1 ? s.barNow : s.bar} x={L + i * step + (step - bw) / 2} y={y(r.sales)} width={bw} height={Math.max(0, y(0) - y(r.sales))} rx={3}><title>{`${new Date(`${r.month}T12:00:00Z`).toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "UTC" })}: $${r.sales.toLocaleString("en-AU")}`}</title></rect>
            <text className={s.axis} x={L + i * step + step / 2} y={H - 8} textAnchor="middle">{new Date(`${r.month}T12:00:00Z`).toLocaleDateString("en-AU", { month: "short", timeZone: "UTC" })}</text>
          </g>
        ))}
      </svg>
      <p className={s.secSub}>{`$${Math.round(total).toLocaleString("en-AU")} over the 12 months, from ${rows.reduce((t, r) => t + r.orders, 0).toLocaleString("en-AU")} sales.`}</p>
    </div>
  );
}
