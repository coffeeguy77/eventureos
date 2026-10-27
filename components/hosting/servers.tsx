"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Plug, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/form";
import { addSite, saveServer, syncServerNow, testServerConnection, type ServerInput } from "@/app/(app)/hosting/actions";

type Msg = { ok: boolean; text: string } | null;
export type ServerRow = { id: string; name: string; kind: "whm" | "siteground"; host: string | null; port: number; username: string | null; verify_tls: boolean; active: boolean; hasToken: boolean; last_sync_at: string | null; last_sync_status: string | null; last_error: string | null; account_count: number | null; accounts: number; lastSync: string | null };

/** Add or edit a server. The token box is always empty: a saved token is never shown again, only replaced. */
export function ServerForm({ row }: { row?: ServerRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<ServerInput>({ name: row?.name ?? "", kind: row?.kind ?? "whm", host: row?.host ?? "", port: row?.port ?? 2087, username: row?.username ?? "root", token: "", verify_tls: row?.verify_tls ?? true, active: row?.active ?? true });
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const set = (p: Partial<ServerInput>) => setF((o) => ({ ...o, ...p }));
  const save = () => start(async () => { setMsg(null); const r = await saveServer(row?.id ?? null, f); setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error }); if (r.ok) { set({ token: "" }); if (!row) setOpen(false); router.refresh(); } });
  if (!open) return <Button size="sm" variant={row ? "ghost" : "primary"} onClick={() => setOpen(true)}>{row ? "Edit" : <><Plus className="h-4 w-4" />Add a server</>}</Button>;
  return (
    <div className="mt-3 space-y-3 rounded-lg bg-canvas p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label htmlFor={`sv-n-${row?.id}`}>Name</Label><Input id={`sv-n-${row?.id}`} value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. WHM 1" /></div>
        <div><Label htmlFor={`sv-k-${row?.id}`}>Type</Label><Select id={`sv-k-${row?.id}`} value={f.kind} disabled={!!row} onChange={(e) => set({ kind: e.target.value as "whm" | "siteground" })}><option value="whm">WHM / cPanel</option><option value="siteground">SiteGround (WordPress plugin)</option></Select></div>
      </div>
      {f.kind === "whm" && <>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_100px_140px]">
          <div><Label htmlFor={`sv-h-${row?.id}`}>Server address</Label><Input id={`sv-h-${row?.id}`} value={f.host ?? ""} onChange={(e) => set({ host: e.target.value })} placeholder="server1.example.com.au" /></div>
          <div><Label htmlFor={`sv-p-${row?.id}`}>Port</Label><Input id={`sv-p-${row?.id}`} type="number" value={f.port ?? 2087} onChange={(e) => set({ port: Number(e.target.value) })} /></div>
          <div><Label htmlFor={`sv-u-${row?.id}`}>WHM user</Label><Input id={`sv-u-${row?.id}`} value={f.username ?? ""} onChange={(e) => set({ username: e.target.value })} /></div>
        </div>
        <div>
          <Label htmlFor={`sv-t-${row?.id}`} hint={row?.hasToken ? "saved — type a new one only to replace it" : "WHM → Development → Manage API Tokens"}>API token</Label>
          <Input id={`sv-t-${row?.id}`} type="password" autoComplete="off" value={f.token ?? ""} onChange={(e) => set({ token: e.target.value })} placeholder={row?.hasToken ? "••••••••••••" : ""} />
          <p className="mt-1 text-[0.7188rem] text-ink-muted">Stored where only the EventureOS server can read it — it's never shown again. Give the token only the account list, suspend and unsuspend permissions if you can.</p>
        </div>
        <label className="flex items-center gap-2 text-[0.8125rem]"><input type="checkbox" className="h-4 w-4" checked={f.verify_tls !== false} onChange={(e) => set({ verify_tls: e.target.checked })} />Check the server's SSL certificate (untick only if WHM uses its own self-signed certificate)</label>
      </>}
      {row && <label className="flex items-center gap-2 text-[0.8125rem]"><input type="checkbox" className="h-4 w-4" checked={f.active !== false} onChange={(e) => set({ active: e.target.checked })} />Active (synced in the morning check)</label>}
      <div className="flex items-center gap-2"><Button variant="primary" disabled={pending} onClick={save}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Save</Button><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>{msg && <span className={`text-[0.8125rem] ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}</span>}</div>
    </div>
  );
}

export function ServerActions({ row }: { row: ServerRow }) {
  const router = useRouter();
  const [domain, setDomain] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: true; data: string } | { ok: false; error: string }>) => start(async () => { setMsg(null); const r = await fn(); setMsg(r.ok ? { ok: true, text: r.data } : { ok: false, text: r.error }); router.refresh(); });
  return (
    <div className="space-y-2">
      {row.kind === "whm" ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={pending || !row.hasToken} onClick={() => run(() => testServerConnection(row.id))}><Plug className="h-4 w-4" />Test connection</Button>
          <Button size="sm" disabled={pending || !row.hasToken} onClick={() => run(() => syncServerNow(row.id))}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Sync accounts</Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Input aria-label="Domain" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com.au" className="max-w-xs" />
          <Button size="sm" disabled={pending || !domain.trim()} onClick={() => run(async () => { const r = await addSite(row.id, domain); if (r.ok) setDomain(""); return r.ok ? { ok: true as const, data: "Added — open it to copy its plugin key." } : r; })}><Plus className="h-4 w-4" />Add site</Button>
        </div>
      )}
      {msg && <p role="status" className={`text-[0.75rem] ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}</p>}
    </div>
  );
}
