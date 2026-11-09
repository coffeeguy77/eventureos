import Link from "next/link";
import { CheckCircle2, Download, KeyRound, Plug, ShieldCheck } from "lucide-react";
import { requireOrg } from "@/lib/context";
import { Card, CardHeader } from "@/components/ui/card";
import manifest from "@/public/downloads/webculture-connector.json";

export const metadata = { title: "Web Culture Connector" };
export const dynamic = "force-dynamic";

/** Nerd Herd → Connector: download the WordPress plugin, how to install it, and which sites are on which version. */
export default async function ConnectorPage() {
  const { supabase, org } = await requireOrg();
  const first = await supabase.from("website_connectors").select("website_id, connector_version, auto_update_at, auto_update_error, websites(domain)").eq("organisation_id", org.id).limit(2000);
  // before the 0105 database update the auto-update columns aren't there yet
  const data: unknown[] | null = first.error
    ? (await supabase.from("website_connectors").select("website_id, connector_version, websites(domain)").eq("organisation_id", org.id).limit(2000).then((r) => r.data, () => [])) as unknown[] | null
    : first.data;
  const rows = (data ?? []) as unknown as { website_id: string; connector_version: string | null; auto_update_at?: string | null; auto_update_error?: string | null; websites: { domain: string } | null }[];
  const latest = manifest.version;
  const { versionBehind } = await import("@/lib/nerdherd/autoupdate");
  const behind = rows.filter((r) => versionBehind(r.connector_version, latest)).sort((a, b) => (a.websites?.domain ?? "").localeCompare(b.websites?.domain ?? ""));
  const changes = manifest.changelog.split(/\s(?=\d+\.\d+\.\d+ –)/).map((s) => s.trim()).filter(Boolean);
  return (
    <div className="grid max-w-6xl gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-5">
        <Card className="overflow-hidden">
          <div className="flex flex-col gap-4 bg-gradient-to-br from-brand-600 to-brand-500 p-5 text-white sm:flex-row sm:items-center sm:p-6">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15"><Plug className="h-7 w-7" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[0.75rem] font-semibold uppercase tracking-wide text-white/75">WordPress plugin</p>
              <h2 className="text-[1.375rem] font-bold leading-tight">Web Culture Connector {latest}</h2>
              <p className="mt-0.5 text-[0.8125rem] text-white/85">Updates, caches, hosting lock and one-click support sign-in — from EventureOS. Needs WordPress {manifest.requires}+.</p>
            </div>
            <a href="/downloads/webculture-connector.zip" download className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-5 text-[0.9375rem] font-semibold text-brand-700 shadow-lg hover:bg-white/90"><Download className="h-5 w-5" />Download .zip</a>
          </div>
        </Card>
        <Card>
          <CardHeader title="Install on a client's site" subtitle="About two minutes" />
          <ol className="space-y-3 border-t border-line px-5 py-4 text-[0.875rem] text-ink">
            {[
              <>Download the zip above.</>,
              <>In the site&apos;s WordPress: <strong>Plugins → Add New → Upload Plugin</strong>, choose the zip, then <strong>Install</strong> and <strong>Activate</strong>.</>,
              <>Go to <strong>Tools → Web Culture</strong> and copy the <strong>connection key</strong>.</>,
              <>In EventureOS open the site in <Link href="/nerd-herd/websites" className="font-medium text-brand-600 underline">Websites</Link> → <strong>WordPress command ops</strong>, paste the key and press Connect.</>,
              <>Done — check for updates, run them, purge caches, and use <strong>Sign in to wp-admin</strong> (with your vault PIN).</>,
            ].map((s, i) => <li key={i} className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-[0.75rem] font-bold text-brand-700">{i + 1}</span><span>{s}</span></li>)}
          </ol>
        </Card>
        <Card>
          <CardHeader title="What's new" />
          <ul className="space-y-2 border-t border-line px-5 py-4 text-[0.8125rem] text-ink-muted">{changes.map((c) => <li key={c} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /><span>{c}</span></li>)}</ul>
        </Card>
      </div>
      <div className="space-y-5">
        <Card className="overflow-hidden">
          <CardHeader title="Your sites" subtitle={rows.length ? `${rows.length} connected · ${rows.length - behind.length} on ${latest}` : "No sites connected yet"} action={<Link href="/nerd-herd/websites?v=ops" className="text-[0.75rem] font-medium text-brand-600">Command ops</Link>} />
          {behind.length > 0 && (
            <ul className="divide-y divide-line border-t border-line">
              {behind.map((r) => (
                <li key={r.website_id}><Link href={`/nerd-herd/websites/${r.website_id}`} className="flex items-center justify-between gap-3 px-5 py-2.5 hover:bg-canvas"><span className="min-w-0"><span className="block truncate text-[0.8125rem] text-ink">{r.websites?.domain ?? "—"}</span>{r.auto_update_error ? <span className="block truncate text-[0.6875rem] text-rose-600 dark:text-rose-300" title={r.auto_update_error}>Last try: {r.auto_update_error}</span> : r.auto_update_at ? <span className="block text-[0.6875rem] text-ink-faint">Updating automatically</span> : <span className="block text-[0.6875rem] text-ink-faint">Queued to update</span>}</span><span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-[0.6875rem] font-medium text-amber-700 ring-1 ring-inset ring-amber-500/30 dark:text-amber-300">{r.connector_version ?? "?"} → {latest}</span></Link></li>
              ))}
            </ul>
          )}
          {rows.length > 0 && behind.length === 0 && <p className="border-t border-line px-5 py-4 text-[0.8125rem] text-emerald-600">Every connected site is up to date.</p>}
          {behind.length > 0 && <p className="border-t border-line px-5 py-3 text-[0.75rem] text-ink-muted">These update by themselves: every 15 minutes EventureOS pushes {latest} to sites that are behind (a site that fails is retried after 12 hours), and from 1.4.1 WordPress also installs new versions on its own. To do one straight away, open it and press <strong>Update Connector now</strong>.</p>}
        </Card>
        <Card>
          <CardHeader title="Safe by design" />
          <ul className="space-y-2.5 border-t border-line px-5 py-4 text-[0.8125rem] text-ink-muted">
            <li className="flex gap-2"><KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />Every request is signed with the site&apos;s own key — the key never leaves the server.</li>
            <li className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />Sign-in links work once, for 60 seconds, and are logged on the site with your name. The client can switch them off.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
