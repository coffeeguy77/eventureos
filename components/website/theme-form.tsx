"use client";
import "@fontsource-variable/newsreader/opsz.css";
import "@fontsource-variable/fraunces";
import "@fontsource/playfair-display/700.css";
import { useState, useTransition } from "react";
import { ArrowRight, Check, ExternalLink, MapPin, RotateCcw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/form";
import { CORNERS, CORNER_NAMES, HEADINGS, HEADING_NAMES, NAVS, NAV_NAMES, PRESETS, THEME_KEYS, type SiteTheme, type ThemeKey } from "@/lib/site/theme";
import { saveSiteTheme } from "@/app/(app)/website/actions";

/* What each choice looks like in the little previews (the real pages use the theme stylesheet) */
const LOOK: Record<ThemeKey, { bg: string; ink: string; muted: string; panel: string; line: string; dark: string }> = {
  modern: { bg: "#FFFFFF", ink: "#0F172A", muted: "#64748B", panel: "#F5F7FA", line: "#E2E8F0", dark: "#0F172A" },
  bold: { bg: "#FAFAFA", ink: "#09090B", muted: "#52525B", panel: "#F1F1F3", line: "#E4E4E7", dark: "#09090B" },
  soft: { bg: "tint", ink: "#1C1917", muted: "#6B6560", panel: "tint2", line: "tint3", dark: "#1C1917" },
  elegant: { bg: "#FBFAF7", ink: "#1C1A17", muted: "#6E675E", panel: "#F3F0EA", line: "#E6E0D6", dark: "#1C1A17" },
  classic: { bg: "#FCFAF7", ink: "#151312", muted: "#5E5853", panel: "#FFF6F1", line: "#EDE3DB", dark: "#141011" },
};
const FONT: Record<string, string> = {
  sans: "var(--font-geist-sans),ui-sans-serif,system-ui,sans-serif",
  serif: "'Newsreader Variable',Georgia,serif",
  display: "'Fraunces Variable',Georgia,serif",
  elegant: "'Playfair Display',Georgia,serif",
};
const RAD = { sharp: ["6px", "6px"], soft: ["12px", "16px"], round: ["9999px", "22px"] } as const;
const mix = (c: string, n: number) => `color-mix(in srgb, ${c} ${n}%, #FFFFFF)`;
function look(k: ThemeKey, colour: string) {
  const l = LOOK[k];
  const v = (x: string) => (x === "tint" ? mix(colour, 4) : x === "tint2" ? mix(colour, 8) : x === "tint3" ? mix(colour, 16) : x);
  return { ...l, bg: v(l.bg), panel: v(l.panel), line: v(l.line) };
}
const readable = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#111111" : "#FFFFFF";
};

/** A small picture of a website page in a theme. */
function Preview({ t, colour, name, big }: { t: SiteTheme; colour: string; name: string; big?: boolean }) {
  const l = look(t.preset, colour);
  const [btnR, cardR] = RAD[t.corners];
  const nav = t.preset === "classic" ? "light" : t.nav;
  const navBg = nav === "brand" ? colour : nav === "dark" ? l.dark : l.bg;
  const navInk = nav === "brand" ? readable(colour) : nav === "dark" ? "#FFFFFF" : l.ink;
  const s = big ? 1 : 0.55;
  const px = (n: number) => `${n * s}px`;
  return (
    <div className="overflow-hidden" style={{ background: l.bg, color: l.ink, borderRadius: big ? 14 : 10 }} aria-hidden>
      <div className="flex items-center justify-between" style={{ background: navBg, color: navInk, padding: `${px(12)} ${px(18)}`, borderBottom: `1px solid ${nav === "light" ? l.line : "transparent"}` }}>
        <span style={{ fontWeight: 700, fontSize: px(14) }}>{name}</span>
        <span className="flex" style={{ gap: px(14), fontSize: px(11), opacity: 0.85 }}><span>Home</span><span>Book</span><span>Contact</span></span>
      </div>
      <div className="grid grid-cols-[1.1fr_0.9fr] items-center" style={{ gap: px(18), padding: `${px(26)} ${px(18)}` }}>
        <div>
          <p style={{ fontSize: px(9), letterSpacing: ".16em", textTransform: "uppercase", fontWeight: 600, color: colour }}>Welcome</p>
          <p style={{ fontFamily: FONT[t.heading], fontWeight: t.heading === "sans" ? 650 : 600, fontSize: px(26), lineHeight: 1.05, letterSpacing: t.heading === "sans" ? "-0.035em" : "-0.015em", marginTop: px(6) }}>Book your next experience</p>
          <p style={{ fontSize: px(11), color: l.muted, marginTop: px(8), lineHeight: 1.5 }}>Choose a date, pay securely, done in a minute.</p>
          <div className="flex" style={{ gap: px(8), marginTop: px(14) }}>
            <span className="inline-flex items-center" style={{ background: colour, color: readable(colour), borderRadius: btnR, padding: `${px(8)} ${px(14)}`, fontSize: px(11), fontWeight: 600, gap: px(5) }}>Book now<ArrowRight style={{ width: px(11), height: px(11) }} /></span>
            <span className="inline-flex items-center" style={{ border: `1px solid ${l.ink}`, borderRadius: btnR, padding: `${px(8)} ${px(14)}`, fontSize: px(11), fontWeight: 600 }}>Contact</span>
          </div>
          {big && <p className="flex items-center" style={{ gap: 6, marginTop: 14, fontSize: 11, color: l.muted }}><MapPin style={{ width: 13, height: 13, color: colour }} />Your address</p>}
        </div>
        <div style={{ background: "#FFFFFF", borderRadius: cardR, boxShadow: "0 18px 40px -26px rgba(15,23,42,.45)", border: `1px solid ${l.line}`, overflow: "hidden" }}>
          <div style={{ background: `linear-gradient(135deg, ${colour}, color-mix(in srgb, ${colour} 62%, #000))`, height: px(46) }} />
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center" style={{ gap: px(8), padding: `${px(8)} ${px(10)}`, borderTop: i ? `1px solid ${l.line}` : undefined }}>
              <span style={{ width: px(16), height: px(16), borderRadius: px(5), background: mix(colour, 14) }} />
              <span style={{ height: px(6), borderRadius: 4, background: l.panel, flex: 1 }} />
            </div>
          ))}
        </div>
      </div>
      <div style={{ background: l.panel, padding: `${px(14)} ${px(18)}` }} className="grid grid-cols-3" >
        {[0, 1, 2].map((i) => <span key={i} style={{ height: px(34), margin: `0 ${px(4)}`, borderRadius: cardR, background: "#FFFFFF", border: `1px solid ${l.line}` }} />)}
      </div>
    </div>
  );
}

const Chip = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button type="button" onClick={onClick} aria-pressed={on}
    className={`rounded-lg px-3 py-1.5 text-[0.8125rem] font-medium ring-1 ring-inset transition ${on ? "bg-brand-50 text-brand-700 ring-brand-300" : "bg-surface text-ink-muted ring-line hover:text-ink"}`}>{children}</button>
);

export function ThemeForm({ initial, brand, name, siteUrl }: { initial: SiteTheme; brand: string; name: string; siteUrl: string }) {
  const [t, setT] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const colour = t.accent ?? brand;
  const choose = (preset: ThemeKey) => setT({ preset, accent: t.accent, ...PRESETS[preset].defaults });
  const save = () => start(async () => { const r = await saveSiteTheme(t); setMsg(r.ok ? { ok: true, text: r.data } : { ok: false, text: r.error }); });
  const classic = t.preset === "classic";

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="space-y-5">
        <Card className="p-5">
          <h2 className="font-semibold text-ink">Website look</h2>
          <p className="mt-0.5 text-[0.8125rem] text-ink-muted">Pick a starting look for your home page, pages, booking pages and footer. You can fine-tune the colour, headings, corners and menu below.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {THEME_KEYS.map((k) => (
              <button key={k} type="button" onClick={() => choose(k)} aria-pressed={t.preset === k}
                className={`group rounded-xl p-2 text-left ring-1 ring-inset transition ${t.preset === k ? "bg-brand-50/60 ring-2 ring-brand-400" : "ring-line hover:ring-line-strong"}`}>
                <Preview t={{ preset: k, accent: t.accent, ...PRESETS[k].defaults }} colour={colour} name={name} />
                <span className="mt-2 flex items-center justify-between px-1">
                  <span className="text-[0.875rem] font-semibold text-ink">{PRESETS[k].name}</span>
                  {t.preset === k && <span className="grid h-5 w-5 place-items-center rounded-full bg-brand-500 text-on-brand"><Check className="h-3.5 w-3.5" /></span>}
                </span>
                <span className="block px-1 pb-1 text-[0.75rem] leading-snug text-ink-muted">{PRESETS[k].blurb}</span>
              </button>
            ))}
          </div>
        </Card>

        <Card className="space-y-5 p-5">
          <div>
            <Label htmlFor="theme-colour" hint="Buttons, links and highlights. Leave it on your brand colour or pick one just for the website.">Main colour</Label>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <input id="theme-colour" type="color" value={colour} onChange={(e) => setT({ ...t, accent: e.target.value.toUpperCase() })} className="h-10 w-14 cursor-pointer rounded-md ring-1 ring-line" />
              <span className="font-mono text-[0.8125rem] text-ink-muted">{colour}</span>
              {t.accent && <button type="button" onClick={() => setT({ ...t, accent: null })} className="inline-flex items-center gap-1 text-[0.8125rem] font-medium text-ink-muted hover:text-ink"><RotateCcw className="h-3.5 w-3.5" />Use my brand colour ({brand})</button>}
            </div>
          </div>
          <div>
            <Label>Headings</Label>
            <div className="mt-1 flex flex-wrap gap-2">{HEADINGS.map((h) => <Chip key={h} on={t.heading === h} onClick={() => setT({ ...t, heading: h })}><span style={{ fontFamily: FONT[h] }}>{HEADING_NAMES[h]}</span></Chip>)}</div>
          </div>
          <div>
            <Label>Corners</Label>
            <div className="mt-1 flex flex-wrap gap-2">{CORNERS.map((c) => <Chip key={c} on={t.corners === c} onClick={() => setT({ ...t, corners: c })}>{CORNER_NAMES[c]}</Chip>)}</div>
          </div>
          <div>
            <Label hint={classic ? "The classic look keeps the light/dark menu you set in Menus." : undefined}>Top menu</Label>
            <div className="mt-1 flex flex-wrap gap-2">{NAVS.map((n) => <Chip key={n} on={t.nav === n} onClick={() => setT({ ...t, nav: n })}>{NAV_NAMES[n]}</Chip>)}</div>
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <Button variant="primary" onClick={save} disabled={pending}>{pending ? "Saving…" : "Save look"}</Button>
            <a href={siteUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[0.8125rem] font-medium text-ink-muted hover:text-ink">View my website<ExternalLink className="h-3.5 w-3.5" /></a>
            {msg && <p role="status" className={`text-[0.8125rem] ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}</p>}
          </div>
        </Card>
      </div>

      <div className="xl:sticky xl:top-4 xl:self-start">
        <Card className="p-4">
          <p className="mb-3 text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">Preview</p>
          <div className="ring-1 ring-line" style={{ borderRadius: 14 }}><Preview t={t} colour={colour} name={name} big /></div>
          <p className="mt-3 text-[0.75rem] text-ink-muted">Your words, photos and menus stay as they are — the look changes colours, fonts, corners and the menu bar on every public page. Edit words and photos right on the page when you&apos;re signed in.</p>
        </Card>
      </div>
    </div>
  );
}
