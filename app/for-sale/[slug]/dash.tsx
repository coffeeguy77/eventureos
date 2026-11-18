"use client";

import { useState } from "react";
import type { PublicDash } from "@/lib/sales/public";
import s from "./sale.module.css";

const money = (n: number) => `$${Math.round(n).toLocaleString("en-AU")}`;
const num = (n: number) => Math.round(n).toLocaleString("en-AU");
const monthShort = (m: string) => new Date(`${m}T12:00:00Z`).toLocaleDateString("en-AU", { month: "short", timeZone: "UTC" });
const span = (from: string, to: string) => `${new Date(`${from}T12:00:00Z`).toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "UTC" })} to ${new Date(`${to}T12:00:00Z`).toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "UTC" })}`;

/** How each figure reads in the band: the number, then what it is. */
function show(k: string, v: number | string): [string, string] {
  switch (k) {
    case "coffees": return [num(Number(v)), "coffees poured"];
    case "coffee_sales": return [money(Number(v)), "in coffee sales"];
    case "sales": return [money(Number(v)), "total sales, ex GST"];
    case "orders": return [num(Number(v)), "customers served"];
    case "avg_sale": return [`$${Number(v).toFixed(2)}`, "average sale"];
    case "per_day": return [money(Number(v)), "on an average trading day"];
    case "best_day": return [String(v), "is the busiest day"];
    case "coffees_per_day": return [num(Number(v)), "coffees a trading day"];
    default: return [String(v), k];
  }
}
const ORDER = ["coffees", "coffee_sales", "sales", "orders", "coffees_per_day", "per_day", "avg_sale", "best_day"];

export function SaleDashboard({ dash, unlocked }: { dash: PublicDash; unlocked: boolean }) {
  const [i, setI] = useState(0);
  const y = dash.years[i];
  if (!y) return null;
  const figs = ORDER.filter((k) => y.figures[k as keyof typeof y.figures] !== undefined).map((k) => [k, ...show(k, y.figures[k as keyof typeof y.figures]!)] as [string, string, string]);
  const [lead, ...rest] = figs;
  return (
    <>
      {figs.length > 0 && (
        <section className={s.band} aria-label="The numbers">
          <div className={s.wrap}>
            {dash.headline && <p className={s.bandHead}>{dash.headline}</p>}
            {dash.years.length > 1 && (
              <div className={s.years} role="tablist" aria-label="Choose a year">
                {dash.years.map((yy, j) => <button key={yy.from} type="button" role="tab" aria-selected={j === i} className={j === i ? s.yearOn : s.year} onClick={() => setI(j)}>{yy.label}{yy.complete ? "" : " (part year)"}</button>)}
              </div>
            )}
            <p className={s.bandSpan}>{span(y.from, y.to)}, from the point-of-sale system</p>
            {lead && <div className={s.lead}><span className={s.leadNum}>{lead[1]}</span><span className={s.leadLab}>{lead[2]}</span></div>}
            {rest.length > 0 && <dl className={s.bandFigs}>{rest.map(([k, v, l]) => <div key={k}><dd className={s.bandNum}>{v}</dd><dt className={s.bandLab}>{l}</dt></div>)}</dl>}
          </div>
        </section>
      )}

      {unlocked && (y.charts || y.pnl) && (
        <div className={s.wrap}>
          {y.charts && y.charts.months.length > 0 && (
            <section className={s.sec}>
              <div><h2 className={s.secTitle}>Month by month</h2><p className={s.secSub}>Sales ex GST; the line is coffees poured.</p></div>
              <MonthChart months={y.charts.months} />
            </section>
          )}
          {y.pnl && (
            <section className={s.sec}>
              <div><h2 className={s.secTitle}>Profit and loss</h2><p className={s.secSub}>{span(y.from, y.to)}. Sales from Square; costs from the suppliers in Xero and the standard crew.</p></div>
              <div className={s.tableWrap}><table className={s.table}><tbody>
                {([["Sales", y.pnl.sales], ["Cost of goods", -y.pnl.cogs], ["Gross profit", y.pnl.sales - y.pnl.cogs], ["Wages and super", -y.pnl.wages], ["Overheads", -y.pnl.overheads], ["Profit", y.pnl.profit]] as [string, number][]).map(([l, v]) => (
                  <tr key={l}><td>{l === "Profit" || l === "Gross profit" ? <b>{l}</b> : l}</td><td className={s.num}>{l === "Profit" || l === "Gross profit" ? <b>{v < 0 ? `−${money(-v)}` : money(v)}</b> : v < 0 ? `−${money(-v)}` : money(v)}</td></tr>
                ))}
                {y.pnl.margin != null && <tr><td>Profit margin</td><td className={s.num}>{y.pnl.margin}%</td></tr>}
              </tbody></table></div>
            </section>
          )}
          {dash.crew && dash.crew.length > 0 && (
            <section className={s.sec}>
              <div><h2 className={s.secTitle}>The team it takes</h2><p className={s.secSub}>The standard crew, with super. Names are kept private.</p></div>
              <div className={s.tableWrap}><table className={s.table}>
                <thead><tr><th>Role</th><th className={s.num}>People</th><th className={s.num}>A year</th></tr></thead>
                <tbody>{dash.crew.map((c, j) => <tr key={j}><td>{c.role}</td><td className={s.num}>{c.headcount}</td><td className={s.num}>{money(c.yearly)}</td></tr>)}</tbody>
              </table></div>
            </section>
          )}
          {y.charts && (
            <section className={s.sec}>
              <div><h2 className={s.secTitle}>What sells</h2><p className={s.secSub}>By Square category, and the ten best sellers by number sold.</p></div>
              <div className={s.twoCol}>
                <Bars rows={y.charts.categories.map((c) => ({ label: c.category, value: c.sales }))} fmt={money} />
                <ol className={s.top}>{y.charts.bestSellers.map((b) => <li key={b.item}><span>{b.item}</span><span className={s.topNum}>{num(b.qty)}</span></li>)}</ol>
              </div>
            </section>
          )}
          {y.charts && (
            <section className={s.sec}>
              <div><h2 className={s.secTitle}>The week</h2><p className={s.secSub}>Average sales on each day of the week.</p></div>
              <Bars rows={y.charts.weekdays.map((w) => ({ label: w.label, value: w.avg }))} fmt={money} />
            </section>
          )}
          {dash.valuation && (
            <section className={s.sec}>
              <div><h2 className={s.secTitle}>Valuation</h2><p className={s.secSub}>Adjusted profit for the last 12 months, times the multiple, plus the plant and equipment included.</p></div>
              <div>
                <div className={s.valFig}>{money(dash.valuation.value)}</div>
                <div className={s.tableWrap}><table className={s.table}><tbody>
                  <tr><td>Profit, last 12 months</td><td className={s.num}>{money(dash.valuation.profit)}</td></tr>
                  {dash.valuation.addbacks.map((a) => <tr key={a.label}><td>Add back: {a.label}</td><td className={s.num}>{money(a.amount)}</td></tr>)}
                  <tr><td><b>Adjusted profit</b></td><td className={s.num}><b>{money(dash.valuation.adjusted)}</b></td></tr>
                  <tr><td>× {dash.valuation.multiple}</td><td className={s.num}>{money(Math.max(0, dash.valuation.adjusted) * dash.valuation.multiple)}</td></tr>
                  <tr><td>Plant and equipment (second-hand value)</td><td className={s.num}>{money(dash.valuation.equipment)}</td></tr>
                </tbody></table></div>
              </div>
            </section>
          )}
        </div>
      )}
    </>
  );
}

function MonthChart({ months }: { months: { month: string; sales: number; coffees: number }[] }) {
  const W = 760, H = 260, L = 56, R = 48, B = 26, T = 12;
  const maxS = Math.max(1, ...months.map((m) => m.sales)), maxC = Math.max(1, ...months.map((m) => m.coffees));
  const step = (W - L - R) / months.length, bw = step * 0.6;
  const yS = (v: number) => T + (1 - v / maxS) * (H - T - B), yC = (v: number) => T + (1 - v / maxC) * (H - T - B);
  const line = months.map((m, j) => `${L + j * step + step / 2},${yC(m.coffees)}`).join(" ");
  const short = (v: number) => (v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${Math.round(v)}`);
  return (
    <div className={s.chart}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Monthly sales and coffees">
        {[0, 0.5, 1].map((t) => <g key={t}><line className={s.grid} x1={L} x2={W - R} y1={yS(maxS * t)} y2={yS(maxS * t)} /><text className={s.axis} x={L - 8} y={yS(maxS * t) + 4} textAnchor="end">{short(maxS * t)}</text><text className={s.axis} x={W - R + 8} y={yC(maxC * t) + 4}>{num(maxC * t)}</text></g>)}
        {months.map((m, j) => (
          <g key={m.month}>
            <rect className={s.bar} x={L + j * step + (step - bw) / 2} y={yS(m.sales)} width={bw} height={Math.max(0, yS(0) - yS(m.sales))} rx={3}><title>{`${monthShort(m.month)}: ${money(m.sales)}, ${num(m.coffees)} coffees`}</title></rect>
            {(months.length <= 12 || j % 2 === 0) && <text className={s.axis} x={L + j * step + step / 2} y={H - 8} textAnchor="middle">{monthShort(m.month)}</text>}
          </g>
        ))}
        {months.some((m) => m.coffees > 0) && <polyline points={line} fill="none" className={s.line} />}
      </svg>
      <p className={s.legend}><span className={s.keyBar} />Sales <span className={s.keyLine} />Coffees poured</p>
    </div>
  );
}

function Bars({ rows, fmt }: { rows: { label: string; value: number }[]; fmt: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className={s.hbars}>
      {rows.map((r) => (
        <li key={r.label}>
          <div className={s.hbarRow}><span>{r.label}</span><span className={s.topNum}>{fmt(r.value)}</span></div>
          <div className={s.hbarTrack}><div className={s.hbarFill} style={{ width: `${Math.max(1.5, (r.value / max) * 100)}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}
