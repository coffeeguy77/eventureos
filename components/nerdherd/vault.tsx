"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink, Eye, EyeOff, KeyRound, Loader2, Lock, LogIn, Pencil, Plus, Search, ShieldCheck, Trash2, Wand2, X } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormError, Input, Label, Select, Textarea } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { deleteVaultItem, lockVault, revealVaultSecret, saveVaultItem, setVaultMember, setVaultPin, supportSignIn, unlockVault } from "@/app/(app)/nerd-herd/vault/actions";

export interface VaultItemRow {
  id: string; label: string; kind: string; url: string | null; username: string | null; has_password: boolean; has_notes: boolean; customer_id: string | null; website_id: string | null;
  updated_at: string; password_changed_at: string | null; last_revealed_at: string | null; client: string | null; domain: string | null; connected: boolean;
}
export interface VaultLogRow { id: string; actor: string | null; action: string; detail: string | null; at: string }

const KIND_LABEL: Record<string, string> = { wordpress: "WordPress", hosting: "Hosting / cPanel", domain: "Domain registrar", email: "Email", ftp: "FTP / SFTP", database: "Database", dns: "DNS", social: "Social media", other: "Other" };
const ACTION: Record<string, string> = { reveal: "viewed", copy: "copied", create: "added", update: "changed", delete: "deleted", login: "signed in to", unlock: "unlocked the vault", pin_failed: "wrong PIN", access: "access" };

function genPassword(n = 20) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*-_=+";
  const a = new Uint32Array(n); crypto.getRandomValues(a);
  return Array.from(a, (x) => chars[x % chars.length]).join("");
}

/** Nerd Herd password vault: set a PIN → unlock → find, add, reveal / copy (logged) and one-click WordPress sign-in. */
export function VaultScreen(p: {
  needsMigration: boolean; member: boolean; hasPin: boolean; unlockedMinutes: number; lockedUntil: string | null; canManage: boolean;
  team: { id: string; name: string; role: string; member: boolean; hasPin: boolean }[];
  items: VaultItemRow[]; log: VaultLogRow[]; clients: { id: string; name: string }[]; sites: { id: string; domain: string; customer_id: string | null; connected: boolean }[];
  tz: string; focusSite: string | null; focusClient: string | null;
}) {
  if (p.needsMigration) return <Card className="p-6 text-[0.875rem] text-ink-muted">The password vault needs database update <span className="font-mono">0095_password_vault.sql</span> first.</Card>;
  return (
    <div className="space-y-5">
      {!p.member ? (
        <Card className="p-6 text-center"><Lock className="mx-auto h-9 w-9 text-ink-faint" /><p className="mt-3 font-semibold text-ink">You don&apos;t have access to the vault</p><p className="mt-1 text-[0.875rem] text-ink-muted">{p.canManage ? "Give yourself access below." : "Ask an owner or admin to give you access."}</p></Card>
      ) : !p.hasPin || p.unlockedMinutes === 0 ? (
        <PinGate hasPin={p.hasPin} lockedUntil={p.lockedUntil} tz={p.tz} />
      ) : (
        <Unlocked {...p} />
      )}
      {p.canManage && <Access team={p.team} />}
    </div>
  );
}

function PinGate({ hasPin, lockedUntil, tz }: { hasPin: boolean; lockedUntil: string | null; tz: string }) {
  const router = useRouter();
  const [pin, setPin] = useState(""); const [pin2, setPin2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const go = () => start(async () => {
    setError(null);
    if (!hasPin) {
      if (pin !== pin2) { setError("The two PINs don't match."); return; }
      const r = await setVaultPin(pin); if (!r.ok) { setError(r.error); return; }
    } else { const r = await unlockVault(pin); if (!r.ok) { setError(r.error); setPin(""); return; } }
    router.refresh();
  });
  return (
    <Card className="mx-auto max-w-md p-6 sm:p-8">
      <div className="text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/15 text-brand-600"><KeyRound className="h-7 w-7" /></span>
        <h2 className="mt-4 text-[1.25rem] font-semibold text-ink">{hasPin ? "Unlock the vault" : "Set your vault PIN"}</h2>
        <p className="mt-1 text-[0.875rem] text-ink-muted">{hasPin ? "Enter your PIN. The vault — and one-click WordPress sign-in — stays open for 15 minutes on this device." : "4 to 8 digits, just for you. You'll enter it to see passwords and to sign in to client sites."}</p>
        {lockedUntil && <p className="mt-3 rounded-lg bg-rose-500/10 px-3 py-2 text-[0.8125rem] font-medium text-rose-600">Too many wrong PINs — locked until {new Date(lockedUntil).toLocaleTimeString("en-AU", { timeZone: tz, hour: "numeric", minute: "2-digit" })}.</p>}
      </div>
      <form className="mt-5 space-y-3" onSubmit={(e) => { e.preventDefault(); go(); }}>
        <Input autoFocus type="password" inputMode="numeric" autoComplete={hasPin ? "current-password" : "new-password"} maxLength={8} placeholder={hasPin ? "PIN" : "New PIN"} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} className="h-14 text-center text-[1.5rem] tracking-[0.5em]" />
        {!hasPin && <Input type="password" inputMode="numeric" autoComplete="new-password" maxLength={8} placeholder="PIN again" value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))} className="h-14 text-center text-[1.5rem] tracking-[0.5em]" />}
        <FormError message={error} />
        <Button variant="primary" className="h-12 w-full" disabled={pending || pin.length < 4 || (!hasPin && pin2.length < 4)}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}{hasPin ? "Unlock" : "Save PIN and open"}</Button>
      </form>
    </Card>
  );
}

function Unlocked(p: Parameters<typeof VaultScreen>[0]) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [client, setClient] = useState(p.focusClient ?? "");
  const [editing, setEditing] = useState<VaultItemRow | "new" | null>(null);
  const [tab, setTab] = useState<"logins" | "log">("logins");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return p.items.filter((i) => (!client || i.customer_id === client) && (!p.focusSite || i.website_id === p.focusSite || !!q || !!client) && (!t || [i.label, i.url, i.username, i.client, i.domain].some((x) => x?.toLowerCase().includes(t))));
  }, [p.items, q, client, p.focusSite]);
  const groups = useMemo(() => {
    const m = new Map<string, VaultItemRow[]>();
    for (const i of list) { const k = i.client ?? "No client"; m.set(k, [...(m.get(k) ?? []), i]); }
    return [...m.entries()].sort((a, b) => (a[0] === "No client" ? 1 : b[0] === "No client" ? -1 : a[0].localeCompare(b[0])));
  }, [list]);
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" /><Input className="pl-9" placeholder="Search client, site, username…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Select className="w-full sm:w-56" value={client} onChange={(e) => setClient(e.target.value)}><option value="">All clients</option>{p.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <Button variant="primary" onClick={() => setEditing("new")}><Plus className="h-4 w-4" />Add login</Button>
        <Button onClick={() => start(async () => { await lockVault(); router.refresh(); })} disabled={pending}><Lock className="h-4 w-4" />Lock</Button>
      </div>
      <p className="flex items-center gap-1.5 text-[0.75rem] text-emerald-600"><ShieldCheck className="h-3.5 w-3.5" />Unlocked on this device — locks after 15 minutes without use. Passwords are encrypted; every view and copy is logged.</p>
      {msg && <p className={cn("text-[0.8125rem] font-medium", msg.ok ? "text-emerald-600" : "text-rose-600")}>{msg.text}</p>}
      <div className="flex gap-1 rounded-xl bg-canvas p-1 ring-1 ring-line sm:inline-flex">
        {([["logins", `Logins (${p.items.length})`], ["log", "Activity"]] as const).map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={cn("flex-1 rounded-lg px-3 py-2 text-[0.8125rem] font-medium sm:flex-none", tab === k ? "bg-surface text-ink shadow-sm" : "text-ink-muted")}>{l}</button>)}
      </div>
      {tab === "log" ? (
        <Card><ul className="divide-y divide-line">{p.log.length === 0 ? <li className="px-5 py-5 text-[0.875rem] text-ink-muted">Nothing yet.</li> : p.log.map((l) => (
          <li key={l.id} className="flex flex-wrap items-baseline gap-x-2 px-4 py-2.5 text-[0.8125rem]"><span className="font-medium text-ink">{l.actor ?? "Someone"}</span><span className={cn(l.action === "pin_failed" ? "text-rose-600" : "text-ink-muted")}>{ACTION[l.action] ?? l.action}</span><span className="min-w-0 flex-1 break-words text-ink">{l.detail}</span><span className="text-[0.75rem] text-ink-faint">{new Date(l.at).toLocaleString("en-AU", { timeZone: p.tz, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span></li>
        ))}</ul></Card>
      ) : list.length === 0 ? (
        <Card className="p-8 text-center"><KeyRound className="mx-auto h-9 w-9 text-ink-faint" /><p className="mt-3 font-medium text-ink">{p.items.length ? "No logins match." : "No logins saved yet."}</p><Button variant="primary" className="mt-4" onClick={() => setEditing("new")}><Plus className="h-4 w-4" />Add login</Button></Card>
      ) : groups.map(([name, rows]) => (
        <Card key={name} className="overflow-hidden">
          <CardHeader title={name} subtitle={`${rows.length} login${rows.length === 1 ? "" : "s"}`} />
          <ul className="divide-y divide-line border-t border-line">{rows.map((i) => <ItemRow key={i.id} i={i} onEdit={() => setEditing(i)} onMsg={setMsg} />)}</ul>
        </Card>
      ))}
      {editing && <ItemEditor item={editing === "new" ? null : editing} clients={p.clients} sites={p.sites} defaults={{ site: p.focusSite, client: client || p.focusClient }} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); router.refresh(); }} />}
    </>
  );
}

export function ItemRow({ i, onEdit, onMsg, compact }: { i: VaultItemRow; onEdit?: () => void; onMsg: (m: { ok: boolean; text: string } | null) => void; compact?: boolean }) {
  const router = useRouter();
  const [shown, setShown] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flash = (k: string) => { setCopied(k); setTimeout(() => setCopied(null), 1500); };
  const get = (what: "password" | "notes", action: "reveal" | "copy") => start(async () => {
    const r = await revealVaultSecret(i.id, what, action);
    if (!r.ok) { onMsg({ ok: false, text: r.error }); if (/locked/i.test(r.error)) router.refresh(); return; }
    if (action === "copy") { await navigator.clipboard?.writeText(r.data); flash(what); return; }
    if (what === "notes") { setNotes(r.data); return; }
    setShown(r.data); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => setShown(null), 30_000);
  });
  const signIn = () => start(async () => {
    const w = window.open("about:blank", "_blank");
    const r = await supportSignIn(i.website_id!);
    if (!r.ok) { w?.close(); onMsg({ ok: false, text: r.error }); return; }
    if (w) w.location.href = r.data.url; else window.location.href = r.data.url;
    onMsg({ ok: true, text: `Signing you in to ${i.domain} as ${r.data.as}…` });
  });
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2"><span className="font-semibold text-ink">{i.label}</span><span className="rounded-full bg-ink/10 px-2 py-0.5 text-[0.6875rem] font-medium text-ink-muted">{KIND_LABEL[i.kind] ?? i.kind}</span>{!compact && i.domain && <span className="text-[0.75rem] text-ink-muted">{i.domain}</span>}</p>
          {i.url && <a href={i.url} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex max-w-full items-center gap-1 truncate text-[0.8125rem] text-brand-600 hover:underline">{i.url.replace(/^https?:\/\//, "")}<ExternalLink className="h-3 w-3 shrink-0" /></a>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {i.kind === "wordpress" && i.website_id && i.connected && <Button size="sm" variant="primary" disabled={pending} onClick={signIn}><LogIn className="h-3.5 w-3.5" />Sign in</Button>}
          {onEdit && <Button size="sm" variant="ghost" onClick={onEdit} aria-label="Edit"><Pencil className="h-3.5 w-3.5" /></Button>}
        </div>
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {i.username && <div className="flex items-center gap-2 rounded-lg bg-canvas px-3 py-2 ring-1 ring-line"><span className="w-16 shrink-0 text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">User</span><span className="min-w-0 flex-1 truncate font-mono text-[0.8125rem] text-ink">{i.username}</span><button aria-label="Copy username" onClick={() => { void navigator.clipboard?.writeText(i.username!); flash("user"); }} className="rounded p-1 text-ink-faint hover:text-ink">{copied === "user" ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}</button></div>}
        {i.has_password && <div className="flex items-center gap-2 rounded-lg bg-canvas px-3 py-2 ring-1 ring-line"><span className="w-16 shrink-0 text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">Password</span><span className="min-w-0 flex-1 truncate font-mono text-[0.8125rem] text-ink">{shown ?? "••••••••••••"}</span>
          <button aria-label={shown ? "Hide" : "Show"} disabled={pending} onClick={() => (shown ? setShown(null) : get("password", "reveal"))} className="rounded p-1 text-ink-faint hover:text-ink">{shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
          <button aria-label="Copy password" disabled={pending} onClick={() => get("password", "copy")} className="rounded p-1 text-ink-faint hover:text-ink">{copied === "password" ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}</button></div>}
      </div>
      {i.has_notes && (notes === null ? <button onClick={() => get("notes", "reveal")} className="mt-2 text-[0.75rem] font-medium text-brand-600">Show private notes</button> : <p className="mt-2 whitespace-pre-wrap rounded-lg bg-canvas px-3 py-2 text-[0.8125rem] text-ink ring-1 ring-line">{notes}</p>)}
    </li>
  );
}

function ItemEditor({ item, clients, sites, defaults, onClose, onSaved }: { item: VaultItemRow | null; clients: { id: string; name: string }[]; sites: { id: string; domain: string; customer_id: string | null }[]; defaults: { site: string | null; client: string | null }; onClose: () => void; onSaved: () => void }) {
  const site0 = sites.find((s) => s.id === (item?.website_id ?? defaults.site));
  const [f, setF] = useState({ label: item?.label ?? "WordPress admin", kind: item?.kind ?? "wordpress", url: item?.url ?? (site0 ? `https://${site0.domain}/wp-admin` : ""), username: item?.username ?? "", customerId: item?.customer_id ?? site0?.customer_id ?? defaults.client ?? "", websiteId: item?.website_id ?? site0?.id ?? "" });
  const [password, setPassword] = useState(""); const [show, setShow] = useState(false);
  const [notes, setNotes] = useState(""); const [clearNotes, setClearNotes] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const siteList = f.customerId ? sites.filter((s) => s.customer_id === f.customerId || s.id === f.websiteId) : sites;
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const save = () => start(async () => {
    setError(null);
    const r = await saveVaultItem(item?.id ?? null, { customerId: f.customerId || null, websiteId: f.websiteId || null, label: f.label, kind: f.kind as never, url: f.url, username: f.username, password, notes, clearNotes });
    if (r.ok) onSaved(); else setError(r.error);
  });
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div role="dialog" aria-modal="true" className="pt-safe relative flex max-h-[100dvh] w-full max-w-xl flex-col overflow-hidden bg-surface shadow-pop sm:max-h-[92dvh] sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-line px-4 py-3 sm:px-5"><h2 className="text-[1rem] font-semibold text-ink">{item ? "Edit login" : "Add a login"}</h2><button onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-ink-faint hover:bg-canvas"><X className="h-5 w-5" /></button></div>
        <form className="flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-5" autoComplete="off" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Client</Label><Select value={f.customerId} onChange={(e) => setF({ ...f, customerId: e.target.value, websiteId: "" })}><option value="">No client</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>
            <div><Label>Website</Label><Select value={f.websiteId} onChange={(e) => { const s = sites.find((x) => x.id === e.target.value); setF({ ...f, websiteId: e.target.value, customerId: f.customerId || s?.customer_id || "", url: f.url || (s && f.kind === "wordpress" ? `https://${s.domain}/wp-admin` : f.url) }); }}><option value="">None</option>{siteList.map((s) => <option key={s.id} value={s.id}>{s.domain}</option>)}</Select></div>
            <div><Label>Name</Label><Input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="e.g. WordPress admin" /></div>
            <div><Label>Type</Label><Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></div>
            <div className="sm:col-span-2"><Label>Sign-in address</Label><Input value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://example.com.au/wp-admin" /></div>
            <div className="sm:col-span-2"><Label>Username / email</Label><Input value={f.username} autoComplete="off" onChange={(e) => setF({ ...f, username: e.target.value })} /></div>
            <div className="sm:col-span-2">
              <Label hint={item?.has_password ? "leave blank to keep the saved one" : ""}>Password</Label>
              <div className="flex gap-2">
                <div className="relative flex-1"><Input type={show ? "text" : "password"} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={item?.has_password ? "•••••••• (saved)" : ""} className="pr-10 font-mono" /><button type="button" aria-label="Show" onClick={() => setShow(!show)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-faint">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div>
                <Button type="button" onClick={() => { setPassword(genPassword()); setShow(true); }}><Wand2 className="h-4 w-4" />Generate</Button>
              </div>
            </div>
            <div className="sm:col-span-2"><Label hint={item?.has_notes ? "leave blank to keep the saved notes" : "encrypted too — e.g. 2FA backup codes, security questions"}>Private notes</Label><Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />{item?.has_notes && <label className="mt-1 flex items-center gap-2 text-[0.75rem] text-ink-muted"><input type="checkbox" checked={clearNotes} onChange={(e) => setClearNotes(e.target.checked)} />Remove the saved notes</label>}</div>
          </div>
          <FormError message={error} />
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {item && (confirmDel
              ? <span className="mr-auto flex items-center gap-2 text-[0.8125rem]">Delete for good?<Button type="button" size="sm" variant="danger" disabled={pending} onClick={() => start(async () => { const r = await deleteVaultItem(item.id); if (r.ok) onSaved(); else setError(r.error); })}>Delete</Button><Button type="button" size="sm" variant="ghost" onClick={() => setConfirmDel(false)}>Keep</Button></span>
              : <Button type="button" variant="ghost" className="mr-auto text-rose-600" onClick={() => setConfirmDel(true)}><Trash2 className="h-4 w-4" />Delete</Button>)}
            <Button type="button" onClick={onClose}>Cancel</Button>
            <Button variant="primary" disabled={pending}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Save</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Access({ team }: { team: { id: string; name: string; role: string; member: boolean; hasPin: boolean }[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Card>
      <CardHeader title="Who can use the vault" subtitle="Only the people ticked can see passwords or use one-click sign-in. Each sets their own PIN." />
      <ul className="divide-y divide-line border-t border-line">
        {team.map((t) => (
          <li key={t.id} className="flex items-center gap-3 px-4 py-2.5">
            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
              <input type="checkbox" className="h-5 w-5" checked={t.member} disabled={pending} onChange={(e) => start(async () => { setError(null); const r = await setVaultMember(t.id, e.target.checked); if (!r.ok) setError(r.error); router.refresh(); })} />
              <span className="min-w-0"><span className="block truncate text-[0.875rem] font-medium text-ink">{t.name}</span><span className="block text-[0.75rem] capitalize text-ink-muted">{t.role}{t.member ? (t.hasPin ? " · PIN set" : " · no PIN yet") : ""}</span></span>
            </label>
          </li>
        ))}
      </ul>
      {error && <p className="px-4 pb-3 text-[0.8125rem] text-rose-600">{error}</p>}
    </Card>
  );
}
