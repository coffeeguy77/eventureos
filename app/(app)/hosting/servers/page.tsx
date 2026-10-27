import { requireOrg } from "@/lib/context";
import { createServiceClient } from "@/lib/integrations/runtime";
import { fmtDateTime } from "@/lib/format";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ServerActions, ServerForm, type ServerRow } from "@/components/hosting/servers";

export const dynamic = "force-dynamic";

export default async function HostingServersPage() {
  const { supabase, org } = await requireOrg();
  const { data } = await supabase.from("hosting_servers").select("id, name, kind, host, port, username, verify_tls, active, last_sync_at, last_sync_status, last_error, account_count").eq("organisation_id", org.id).order("created_at");
  const servers = (data ?? []) as Omit<ServerRow, "hasToken" | "accounts" | "lastSync">[];
  const ids = servers.map((s) => s.id);
  // whether a token is saved (never the token itself) — the credentials table is only readable with the service key
  const { data: creds } = ids.length ? await createServiceClient().from("hosting_server_credentials").select("server_id").in("server_id", ids) : { data: [] };
  const have = new Set((creds ?? []).map((c) => c.server_id as string));
  const { data: counts } = await supabase.from("hosting_accounts").select("server_id").eq("organisation_id", org.id).limit(10000);
  const n = new Map<string, number>(); for (const c of counts ?? []) n.set(c.server_id as string, (n.get(c.server_id as string) ?? 0) + 1);
  const rows: ServerRow[] = servers.map((s) => ({ ...s, hasToken: have.has(s.id), accounts: n.get(s.id) ?? 0, lastSync: s.last_sync_at ? fmtDateTime(s.last_sync_at, org.timezone) : null }));
  const hasSg = rows.some((r) => r.kind === "siteground");
  return (
    <div className="max-w-3xl space-y-5">
      {rows.map((r) => (
        <Card key={r.id}>
          <CardHeader title={<span className="flex items-center gap-2">{r.name}<Badge tone={r.kind === "whm" ? "blue" : "brand"}>{r.kind === "whm" ? "WHM" : "SiteGround"}</Badge>{!r.active && <Badge tone="slate">Paused</Badge>}</span>}
            subtitle={r.kind === "whm" ? `${r.host}:${r.port} · ${r.username} · ${r.hasToken ? "token saved" : "no token yet"} · ${r.accounts} accounts${r.lastSync ? ` · synced ${r.lastSync}` : ""}` : `${r.accounts} sites — added by hand, switched off by the plugin`}
            action={<ServerForm row={r} />} />
          <div className="space-y-2 border-t border-line px-5 py-4">
            {r.last_sync_status === "error" && r.last_error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-[0.75rem] text-rose-800">Last sync failed: {r.last_error}</p>}
            <ServerActions row={r} />
          </div>
        </Card>
      ))}
      <Card>
        <CardHeader title="Add a server" subtitle="WHM servers sync their accounts automatically. SiteGround sites are added by hand and suspended with the WordPress plugin." />
        <div className="border-t border-line px-5 py-4"><ServerForm /></div>
      </Card>
      {(hasSg || rows.length === 0) && (
        <Card>
          <CardHeader title="SiteGround: the Web Culture status plugin" subtitle="SiteGround's Site Tools has no API for suspending, so each WordPress site checks with EventureOS instead." />
          <div className="space-y-2 border-t border-line px-5 py-4 text-[0.8125rem] text-ink-muted">
            <p>1. Download <a className="font-medium text-brand-600 underline" href="/downloads/webculture-status.zip">webculture-status.zip</a> and upload it in the site's WordPress → Plugins → Add New → Upload.</p>
            <p>2. Activate it, then in Settings → Web Culture status paste the site's key (open the site in Accounts to copy it).</p>
            <p>3. When you suspend the site here, visitors see your suspension page (with the pay link) within 10 minutes; logged-in admins still see the site and wp-admin. Switch it back on and it clears the same way.</p>
            <p className="text-[0.75rem]">If someone deactivates the plugin, the suspension stops — it's a polite switch, not a lock. For a hard lock on SiteGround you'd use Site Tools by hand.</p>
          </div>
        </Card>
      )}
    </div>
  );
}
