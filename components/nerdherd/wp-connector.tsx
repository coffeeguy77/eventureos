"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2, Lock, Plug, RefreshCw, Trash2, Unlock, Wrench, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { checkSite, connectSite, disconnectSite, purgeSite, setSiteLock, updateSite } from "@/app/(app)/nerd-herd/websites/[id]/connector-actions";

export type ConnectorRow = {
  site_url: string; connector_version: string | null; wp_version: string | null; wp_update: string | null; php_version: string | null;
  wc_version: string | null; currency: string | null; updates_core: number; updates_plugins: number; updates_themes: number;
  plugins: { file: string; name: string; version: string; active: boolean; update: string | null; update_ok: boolean | null }[];
  themes: { slug: string; name: string; version: string; active: boolean; update: string | null }[];
  environment: { https?: boolean; debug?: boolean; fs_method?: string; cron_late?: number } | null;
  last_checked_at: string | null; last_error: string | null; last_run_at: string | null; last_run_summary: string | null; last_run_ok: boolean | null;
  locked?: boolean | null; locked_since?: string | null;
};
export type RunRow = { id: string; action: string; scope: string | null; ok: boolean; summary: string | null; created_at: string; when: string };

type Msg = { ok: boolean; text: string } | null;

/** WordPress command ops for one website: connect the Web Culture Connector, check and run updates, purge caches. */
export function WpConnector({ websiteId, domain, connector, runs, canRun, checkedLabel }: {
  websiteId: string; domain: string; connector: ConnectorRow | null; runs: RunRow[]; canRun: boolean; checkedLabel: string | null;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [url, setUrl] = useState(connector?.site_url ?? `https://${domain}`);
  const [key, setKey] = useState("");
  const [rekey, setRekey] = useState(false);

  const run = (label: string, fn: () => Promise<{ ok: true; data: string } | { ok: false; error: string }>, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(label); setMsg(null);
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { ok: true, text: r.data } : { ok: false, text: r.error });
      setBusy(null);
      if (r.ok) { setKey(""); setRekey(false); }
      router.refresh();
    });
  };
  const spin = (label: string) => (pending && busy === label ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null);
  const status = msg && (
    <p role="status" className={`rounded-lg px-3 py-2 text-[0.7812rem] ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>{msg.text}</p>
  );

  // ---- Not connected ----------------------------------------------------------------------------------------
  if (!connector || rekey) {
    return (
      <div className="space-y-3">
        {!connector && (
          <ol className="list-decimal space-y-1 pl-5 text-[0.8125rem] text-ink-muted">
            <li>Install and activate the <a href="/downloads/webculture-connector.zip" className="font-medium text-brand-600 underline">Web Culture Connector</a> plugin on the site (WordPress → Plugins → Add New → Upload).</li>
            <li>On the site, open <span className="font-medium text-ink">Tools → Web Culture</span> and copy the connection key.</li>
            <li>Paste it below. EventureOS checks it works before saving it.</li>
          </ol>
        )}
        {canRun ? (
          <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); run("connect", () => connectSite(websiteId, url, key)); }}>
            <label className="block min-w-0">
              <span className="mb-1 block text-[0.75rem] font-medium text-ink-muted">Site address</span>
              <input value={url} onChange={(e) => setUrl(e.target.value)} className="h-9 w-full rounded-lg bg-surface px-3 text-[0.8125rem] text-ink ring-1 ring-inset ring-line-strong focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </label>
            <label className="block min-w-0">
              <span className="mb-1 block text-[0.75rem] font-medium text-ink-muted">Connection key</span>
              <input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="wcc_…" className="h-9 w-full rounded-lg bg-surface px-3 font-mono text-[0.75rem] text-ink ring-1 ring-inset ring-line-strong focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="primary" disabled={pending || !key.trim()}>{spin("connect") ?? <Plug className="h-3.5 w-3.5" />}{pending && busy === "connect" ? "Connecting…" : "Connect"}</Button>
              {rekey && <Button type="button" variant="ghost" onClick={() => setRekey(false)}>Cancel</Button>}
            </div>
          </form>
        ) : <p className="text-[0.8125rem] text-ink-muted">Ask an owner, admin or manager to connect this site.</p>}
        {status}
      </div>
    );
  }

  // ---- Connected ----------------------------------------------------------------------------------------------
  const c = connector;
  const pluginUpdates = (c.plugins ?? []).filter((p) => p.update);
  const themeUpdates = (c.themes ?? []).filter((t) => t.update);
  const total = c.updates_core + c.updates_plugins + c.updates_themes;
  const env = c.environment ?? {};

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Updates waiting" value={String(total)} tone={total ? "amber" : "green"} sub={`${c.updates_plugins} plugins · ${c.updates_themes} themes${c.updates_core ? " · WordPress" : ""}`} />
        <Tile label="WordPress" value={c.wp_version ?? "—"} sub={c.wp_update ? `${c.wp_update} available` : `PHP ${c.php_version ?? "—"}`} tone={c.wp_update ? "amber" : undefined} />
        <Tile label="WooCommerce" value={c.wc_version ?? "—"} sub={c.currency ? `Currency ${c.currency}` : "Not installed"} />
        <Tile label="Checks" value={env.https === false ? "No HTTPS" : env.debug ? "Debug on" : "OK"} tone={env.https === false || env.debug ? "red" : "green"} sub={`Files: ${env.fs_method ?? "—"}${env.cron_late ? ` · ${env.cron_late} late cron` : ""}`} />
      </div>

      {c.locked && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-rose-50 px-3 py-2 text-[0.7812rem] text-rose-800">
          <span className="flex items-center gap-2"><Lock className="h-3.5 w-3.5 shrink-0" />Locked for visitors — they see the "temporarily unavailable" page with the pay link. It unlocks automatically when the hosting invoice is paid.</span>
          {canRun && <Button size="sm" variant="secondary" disabled={pending} onClick={() => run("unlock", () => setSiteLock(websiteId, false), `Unlock ${domain} now?`)}>{spin("unlock") ?? <Unlock className="h-3.5 w-3.5" />}Unlock now</Button>}
        </div>
      )}
      {c.last_error && <p className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-[0.7812rem] text-rose-800"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />Last check failed: {c.last_error}</p>}
      {c.last_run_summary && (
        <p className={`flex items-start gap-2 rounded-lg px-3 py-2 text-[0.7812rem] ${c.last_run_ok ? "bg-canvas text-ink-muted" : "bg-rose-50 text-rose-800"}`}>
          {c.last_run_ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}Last run: {c.last_run_summary}
        </p>
      )}

      {canRun && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" disabled={pending} onClick={() => run("check", () => checkSite(websiteId))}>{spin("check") ?? <RefreshCw className="h-3.5 w-3.5" />}Check for updates</Button>
          <Button variant="primary" size="sm" disabled={pending || !total} onClick={() => run("all", () => updateSite(websiteId, "all"), `Update everything on ${domain}? Make sure a backup exists. The site is checked before and after.`)}>{spin("all") ?? <Zap className="h-3.5 w-3.5" />}{pending && busy === "all" ? "Updating — this can take a few minutes…" : "Update everything"}</Button>
          <Button variant="secondary" size="sm" disabled={pending} onClick={() => run("purge", () => purgeSite(websiteId))}>{spin("purge") ?? <Wrench className="h-3.5 w-3.5" />}Purge caches</Button>
        </div>
      )}
      {status}

      {(pluginUpdates.length > 0 || themeUpdates.length > 0 || c.wp_update) && (
        <div className="overflow-x-auto rounded-lg ring-1 ring-line">
          <table className="w-full min-w-[520px] text-left text-[0.7812rem]">
            <thead className="bg-canvas text-ink-muted"><tr><th className="px-3 py-2 font-medium">Waiting</th><th className="px-3 py-2 font-medium">Installed</th><th className="px-3 py-2 font-medium">New</th><th className="px-3 py-2" /></tr></thead>
            <tbody className="divide-y divide-line">
              {c.wp_update && (
                <tr className="bg-surface"><td className="px-3 py-2 font-medium text-ink">WordPress</td><td className="tabular px-3 py-2 text-ink-muted">{c.wp_version}</td><td className="tabular px-3 py-2 text-ink">{c.wp_update}</td>
                  <td className="px-3 py-2 text-right">{canRun && <Button size="sm" variant="secondary" disabled={pending} onClick={() => run("core", () => updateSite(websiteId, "core"), `Update WordPress on ${domain} to ${c.wp_update}?`)}>{spin("core")}Update</Button>}</td></tr>
              )}
              {pluginUpdates.map((p) => (
                <tr key={p.file} className="bg-surface">
                  <td className="px-3 py-2 text-ink"><span className="font-medium">{p.name}</span>{!p.active && <span className="ml-1.5 text-ink-faint">(inactive)</span>}{p.update_ok === false && <Badge tone="amber" className="ml-1.5">Licence needed</Badge>}</td>
                  <td className="tabular px-3 py-2 text-ink-muted">{p.version}</td><td className="tabular px-3 py-2 text-ink">{p.update}</td>
                  <td className="px-3 py-2 text-right">{canRun && <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(p.file, () => updateSite(websiteId, "plugins", [p.file]))}>{spin(p.file)}Update</Button>}</td>
                </tr>
              ))}
              {themeUpdates.map((t) => (
                <tr key={t.slug} className="bg-surface">
                  <td className="px-3 py-2 text-ink"><span className="font-medium">{t.name}</span> <span className="text-ink-faint">theme{t.active ? " · active" : ""}</span></td>
                  <td className="tabular px-3 py-2 text-ink-muted">{t.version}</td><td className="tabular px-3 py-2 text-ink">{t.update}</td>
                  <td className="px-3 py-2 text-right">{canRun && <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(t.slug, () => updateSite(websiteId, "themes", [t.slug]))}>{spin(t.slug)}Update</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {runs.length > 0 && (
        <div>
          <p className="mb-1.5 text-[0.75rem] font-medium text-ink-muted">History</p>
          <ul className="divide-y divide-line rounded-lg ring-1 ring-line">
            {runs.map((r) => (
              <li key={r.id} className="flex flex-col gap-0.5 bg-surface px-3 py-2 sm:flex-row sm:items-start sm:gap-3">
                <span className="tabular shrink-0 text-[0.7188rem] text-ink-faint sm:w-32">{r.when}</span>
                <span className={`min-w-0 text-[0.7812rem] ${r.ok ? "text-ink" : "text-rose-700"}`}>{r.summary}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-[0.7188rem] text-ink-faint">
        <span className="min-w-0 break-all">{c.site_url} · connector {c.connector_version ?? "—"}{checkedLabel ? ` · checked ${checkedLabel}` : ""}</span>
        {canRun && (
          <span className="flex flex-wrap gap-1">
            {!c.locked && <Button size="sm" variant="ghost" disabled={pending} onClick={() => run("lock", () => setSiteLock(websiteId, true), `Lock ${domain}? Visitors will see a "temporarily unavailable" page until it's unlocked (logged-in admins still see the site).`)}>{spin("lock") ?? <Lock className="h-3.5 w-3.5" />}Lock site</Button>}
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => setRekey(true)}><Plug className="h-3.5 w-3.5" />Change key</Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => run("disconnect", () => disconnectSite(websiteId), `Disconnect ${domain} from command ops? The plugin stays on the site.`)}><Trash2 className="h-3.5 w-3.5" />Disconnect</Button>
          </span>
        )}
      </div>
    </div>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "green" | "amber" | "red" }) {
  const colour = tone === "green" ? "text-emerald-700" : tone === "amber" ? "text-amber-700" : tone === "red" ? "text-rose-700" : "text-ink";
  return (
    <div className="rounded-lg bg-canvas px-3 py-2.5 ring-1 ring-line">
      <p className="text-[0.7188rem] text-ink-muted">{label}</p>
      <p className={`tabular text-[1.0625rem] font-semibold ${colour}`}>{value}</p>
      {sub && <p className="text-[0.7188rem] text-ink-faint">{sub}</p>}
    </div>
  );
}
