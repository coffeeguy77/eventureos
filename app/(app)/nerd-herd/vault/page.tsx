import { getMembers, requireOrg } from "@/lib/context";
import { createServiceClient } from "@/lib/integrations/runtime";
import { unlockedFor } from "@/lib/nerdherd/vault";
import { VaultScreen, type VaultItemRow, type VaultLogRow } from "@/components/nerdherd/vault";

export const metadata = { title: "Password vault" };
export const dynamic = "force-dynamic";

/** Nerd Herd → Vault: client passwords, encrypted; unlocked with your PIN; every reveal logged. */
export default async function VaultPage({ searchParams }: { searchParams: Promise<{ site?: string; client?: string }> }) {
  const sp = await searchParams;
  const { org, user, role } = await requireOrg();
  const db = createServiceClient();
  const { data: me, error } = await db.from("nerd_vault_members").select("pin_hash, locked_until").eq("organisation_id", org.id).eq("user_id", user.id).maybeSingle();
  const needsMigration = !!error && /nerd_vault/.test(error.message);
  const canManage = ["owner", "admin"].includes(role);
  const minutes = me ? await unlockedFor(user.id, org.id) : 0;
  let items: VaultItemRow[] = [], log: VaultLogRow[] = [], clients: { id: string; name: string }[] = [], sites: { id: string; domain: string; customer_id: string | null; connected: boolean }[] = [];
  if (me && minutes > 0) {
    const [it, lg, cl, st, cn] = await Promise.all([
      db.from("nerd_vault_items").select("id, label, kind, url, username, has_password, has_notes, customer_id, website_id, updated_at, password_changed_at, last_revealed_at, customers(name), websites(domain)").eq("organisation_id", org.id).order("label").limit(3000),
      db.from("nerd_vault_log").select("id, actor, action, detail, at").eq("organisation_id", org.id).order("at", { ascending: false }).limit(60),
      db.from("customers").select("id, name").eq("organisation_id", org.id).order("name").limit(5000),
      db.from("websites").select("id, domain, customer_id").eq("organisation_id", org.id).neq("status", "archived").order("domain").limit(5000),
      db.from("website_connectors").select("website_id").eq("organisation_id", org.id),
    ]);
    const conn = new Set(((cn.data ?? []) as { website_id: string }[]).map((x) => x.website_id));
    items = ((it.data ?? []) as unknown as (Omit<VaultItemRow, "client" | "domain" | "connected"> & { customers: { name: string } | null; websites: { domain: string } | null })[]).map((x) => ({ ...x, client: x.customers?.name ?? null, domain: x.websites?.domain ?? null, connected: !!x.website_id && conn.has(x.website_id) }));
    log = (lg.data ?? []) as VaultLogRow[];
    clients = (cl.data ?? []) as { id: string; name: string }[];
    sites = ((st.data ?? []) as { id: string; domain: string; customer_id: string | null }[]).map((s) => ({ ...s, connected: conn.has(s.id) }));
  }
  let team: { id: string; name: string; role: string; member: boolean; hasPin: boolean }[] = [];
  if (canManage && !needsMigration) {
    const [members, { data: m }] = await Promise.all([getMembers(org.id), db.from("nerd_vault_members").select("user_id, pin_hash").eq("organisation_id", org.id)]);
    const on = new Map(((m ?? []) as { user_id: string; pin_hash: string | null }[]).map((x) => [x.user_id, !!x.pin_hash]));
    team = members.filter((x) => x.role !== "staff").map((x) => ({ id: x.id, name: x.full_name ?? x.email, role: x.role, member: on.has(x.id), hasPin: on.get(x.id) ?? false }));
  }
  return (
    <VaultScreen needsMigration={needsMigration} member={!!me} hasPin={!!me?.pin_hash} unlockedMinutes={minutes} lockedUntil={me?.locked_until && Date.parse(me.locked_until) > Date.now() ? me.locked_until : null}
      canManage={canManage} team={team} items={items} log={log} clients={clients} sites={sites} tz={org.timezone} focusSite={sp.site ?? null} focusClient={sp.client ?? null} />
  );
}
