"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, Copy, ExternalLink, Info, Loader2, Stethoscope, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { checkSite, type CheckResult } from "@/app/(app)/hosting/doctor-actions";
import type { Finding } from "@/lib/diagnostics/core";

const ICON = { ok: CheckCircle2, warn: AlertTriangle, bad: XCircle, info: Info } as const;
const TONE = { ok: "text-emerald-600", warn: "text-amber-600", bad: "text-rose-600", info: "text-ink-faint" } as const;
const AREA: Record<Finding["area"], string> = { web: "Website", email: "Email", ssl: "Security (SSL)", domain: "Domain" };

/** Open the site, and check where it points, whether email works, and when the domain and SSL run out. */
export function SiteDoctor({ domain, compact = false }: { domain: string; compact?: boolean }) {
  const d = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
  const [res, setRes] = useState<CheckResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const run = () => start(async () => { setErr(null); const r = await checkSite(d); if (r.ok) setRes(r.data); else setErr(r.error); });
  const bad = res?.findings.filter((f) => f.level === "bad").length ?? 0;
  const warn = res?.findings.filter((f) => f.level === "warn").length ?? 0;
  const copy = () => {
    if (!res) return;
    const text = [`Checks for ${res.domain} (${new Date(res.checkedAt).toLocaleString("en-AU")})`, ...res.findings.map((f) => `${f.level === "ok" ? "✓" : f.level === "bad" ? "✗" : f.level === "warn" ? "!" : "·"} ${AREA[f.area]}: ${f.title}${f.detail ? ` — ${f.detail}` : ""}`)].join("\n");
    void navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };
  const tools = [
    { href: `https://www.whatsmydns.net/#A/${d}`, label: "DNS around the world" },
    { href: `https://mxtoolbox.com/SuperTool.aspx?action=mx%3a${d}&run=toolpage`, label: "MXToolbox (email)" },
    { href: `https://intodns.com/${d}`, label: "intoDNS" },
    { href: `https://www.ssllabs.com/ssltest/analyze.html?d=${d}`, label: "SSL test" },
  ];
  return (
    <div className="text-[0.8125rem]">
      <div className="flex flex-wrap items-center gap-2">
        <a href={`https://${d}`} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-ink ring-1 ring-inset ring-line-strong hover:bg-zinc-50"><ExternalLink className="h-3.5 w-3.5" />Open {compact ? "" : d}</a>
        <Button size="sm" variant={res ? "secondary" : "primary"} disabled={pending} onClick={run}>{pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Stethoscope className="h-3.5 w-3.5" />}{pending ? "Checking…" : res ? "Check again" : "Check website & email"}</Button>
        {res && <span className={`text-[0.75rem] font-semibold ${bad ? "text-rose-700" : warn ? "text-amber-700" : "text-emerald-700"}`}>{bad ? `${bad} problem${bad === 1 ? "" : "s"}` : warn ? `${warn} to look at` : "All good"}</span>}
      </div>
      {err && <p role="alert" className="mt-2 text-rose-700">{err}</p>}
      {res && (
        <div className="mt-3">
          <ul className="space-y-1.5">
            {res.findings.map((f, i) => {
              const I = ICON[f.level];
              return (
                <li key={i} className="flex gap-2">
                  <I className={`mt-0.5 h-4 w-4 shrink-0 ${TONE[f.level]}`} />
                  <span className="min-w-0"><span className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">{AREA[f.area]}</span> <span className={f.level === "bad" ? "font-semibold text-ink" : "text-ink"}>{f.title}</span>
                    {f.detail && <span className="block break-words text-[0.75rem] text-ink-muted">{f.detail}</span>}</span>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-2 text-[0.75rem]">
            <button type="button" onClick={copy} className="inline-flex items-center gap-1 font-medium text-ink-muted hover:text-ink"><Copy className="h-3.5 w-3.5" />{copied ? "Copied" : "Copy results"}</button>
            {tools.map((t) => <a key={t.href} href={t.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-ink-muted hover:text-ink">{t.label}<ExternalLink className="h-3 w-3" /></a>)}
          </div>
        </div>
      )}
    </div>
  );
}
