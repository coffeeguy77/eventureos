"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormError, Input, Label, Select } from "@/components/ui/form";
import { addDnsRecord, connectAndCopy, saveDomain, setLive } from "./actions";

export function DomainForm({ initial, disabled }: { initial: string; disabled: boolean }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); start(async () => { setErr(null); const r = await saveDomain(v); if (!r.ok) setErr(r.error); else router.refresh(); }); }}>
      <div className="min-w-0 flex-1 basis-64"><Label htmlFor="dom">Domain</Label><Input id="dom" value={v} onChange={(e) => setV(e.target.value)} placeholder="yourbusiness.com.au" disabled={disabled} autoComplete="off" spellCheck={false} /></div>
      <Button type="submit" variant="primary" disabled={disabled || pending || v.trim() === initial}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Save</Button>
      <div className="w-full"><FormError message={err} /></div>
      {disabled && <p className="w-full text-[0.75rem] text-ink-muted">Only owners and admins can change the domain.</p>}
    </form>
  );
}

export function ConnectButton({ domain, count, connected }: { domain: string; count: number; connected: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <Button variant="primary" disabled={pending} onClick={() => start(async () => {
        setMsg(null);
        const r = await connectAndCopy();
        if (!r.ok) setMsg({ ok: false, t: r.error });
        else { setMsg({ ok: true, t: [...r.data.notes, r.data.added.length ? `Copied ${r.data.added.join(", ")}` : "Nothing more to copy"].join(" · ") }); router.refresh(); }
      })}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{connected ? `Copy ${count} record${count === 1 ? "" : "s"}` : `Connect ${domain} and copy email records`}</Button>
      {msg && <p role="status" className={`text-[0.7812rem] font-medium ${msg.ok ? "text-emerald-700 dark:text-emerald-400" : "text-rose-600"}`}>{msg.t}</p>}
    </div>
  );
}

export function LiveSwitch({ on, disabled }: { on: boolean; disabled: boolean }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2.5 text-[0.8438rem] text-ink">
        <input type="checkbox" checked={on} disabled={disabled || pending} onChange={(e) => start(async () => { setErr(null); const r = await setLive(e.target.checked); if (!r.ok) setErr(r.error); else router.refresh(); })} className="h-4 w-4 accent-brand-500" />
        Use this domain as my website&apos;s main address
        {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-faint" />}
      </label>
      {disabled && !on && <p className="text-[0.75rem] text-ink-muted">Available once the nameservers have changed.</p>}
      <FormError message={err} />
    </div>
  );
}

export function AddRecordForm({ domain }: { domain: string }) {
  const router = useRouter();
  const [type, setType] = useState("TXT");
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [priority, setPriority] = useState("10");
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <form className="space-y-3 rounded-lg bg-canvas p-3 ring-1 ring-line" onSubmit={(e) => { e.preventDefault(); start(async () => {
      setMsg(null);
      const r = await addDnsRecord({ type, name, value, priority: type === "MX" ? Number(priority) : null });
      if (!r.ok) setMsg({ ok: false, t: r.error }); else { setMsg({ ok: true, t: "Added." }); setName(""); setValue(""); router.refresh(); }
    }); }}>
      <p className="text-[0.8125rem] font-medium text-ink">Add a record</p>
      <div className="grid gap-3 sm:grid-cols-[110px_minmax(0,1fr)_minmax(0,2fr)]">
        <div><Label htmlFor="rt">Type</Label><Select id="rt" value={type} onChange={(e) => setType(e.target.value)}>{["TXT", "CNAME", "A", "AAAA", "MX"].map((t) => <option key={t}>{t}</option>)}</Select></div>
        <div><Label htmlFor="rn" hint={`.${domain}`}>Name</Label><Input id="rn" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. google._domainkey (blank = main)" spellCheck={false} /></div>
        <div><Label htmlFor="rv">Value</Label><Input id="rv" value={value} onChange={(e) => setValue(e.target.value)} placeholder={type === "A" ? "35.213.165.118" : type === "CNAME" || type === "MX" ? "host.example.com" : "v=DKIM1; k=rsa; p=…"} spellCheck={false} /></div>
      </div>
      {type === "MX" && <div className="w-28"><Label htmlFor="rp">Priority</Label><Input id="rp" inputMode="numeric" value={priority} onChange={(e) => setPriority(e.target.value)} /></div>}
      {msg && <p role="status" className={`text-[0.7812rem] font-medium ${msg.ok ? "text-emerald-700 dark:text-emerald-400" : "text-rose-600"}`}>{msg.t}</p>}
      <Button type="submit" size="sm" disabled={pending || !value.trim()}>{pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}Add record</Button>
    </form>
  );
}
