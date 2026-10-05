"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2, Upload, UserPlus, Users } from "lucide-react";
import { addCaseManagerOffice, importCaseManagersFromCrm, importCaseManagersText, updateCaseManager } from "@/app/(app)/bookings/agency-actions";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/form";

export interface CM { id: string; name: string; email: string; phone: string | null; site: string | null; active: boolean; source: string; last_used_at: string | null; seekers: number }
type Msg = { ok: boolean; text: string } | null;
const Note = ({ m }: { m: Msg }) => (m ? <p role="status" className={`text-[0.78rem] font-medium ${m.ok ? "text-emerald-700" : "text-rose-700"}`}>{m.text}</p> : null);
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "Australia/Sydney" }) : "never");
const SRC: Record<string, string> = { office: "added by you", import: "imported", booking: "added at booking", self: "added themselves" };

/** Case managers for one agency: list, edit, add, paste a list, or bring in the CRM contacts. */
export function CaseManagers({ agencyId, agencyName, list, crmContacts, portalUrl, canManage }: { agencyId: string; agencyName: string; list: CM[]; crmContacts: number; portalUrl: string; canManage: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"none" | "add" | "paste">("none");
  const [f, setF] = useState({ name: "", email: "", phone: "", site: "" });
  const [text, setText] = useState("");
  const [m, setM] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const active = list.filter((c) => c.active);
  const done = (r: { ok: true; data: { added: number; skipped: string[] } } | { ok: false; error: string }) => {
    if (!r.ok) { setM({ ok: false, text: r.error }); return; }
    setM({ ok: true, text: `${r.data.added} added or updated.${r.data.skipped.length ? ` Skipped: ${r.data.skipped.slice(0, 5).join("; ")}${r.data.skipped.length > 5 ? "…" : ""}` : ""}` });
    setText(""); setMode("none"); router.refresh();
  };

  return (
    <div className="rounded-xl border border-line bg-surface">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-2 px-4 py-3 text-left">
        <Users className="h-4 w-4 text-ink-muted" />
        <span className="flex-1 text-[0.875rem] font-semibold text-ink">Case managers — {agencyName} <span className="font-normal text-ink-muted">({active.length})</span></span>
        <ChevronDown className={`h-4 w-4 text-ink-muted transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="space-y-3 border-t border-line px-4 py-3">
          <p className="text-[0.78rem] text-ink-muted">Case managers sign in at <a href={portalUrl} target="_blank" rel="noreferrer" className="font-semibold text-brand-700 hover:underline">{portalUrl.replace(/^https?:\/\//, "")}</a> with the agency code, then pick their name. They get the course details for every job seeker they book, and the certificate afterwards.</p>
          {list.length === 0 ? <p className="text-[0.8125rem] text-ink-muted">No case managers yet. Add them below, or they&apos;ll be added the first time they book.</p> : (
            <div className="divide-y divide-line rounded-lg border border-line">
              {list.map((c) => <Row key={c.id} c={c} canManage={canManage} />)}
            </div>
          )}
          {canManage && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setMode(mode === "add" ? "none" : "add")}><UserPlus className="h-3.5 w-3.5" />Add one</Button>
              <Button size="sm" onClick={() => setMode(mode === "paste" ? "none" : "paste")}><Upload className="h-3.5 w-3.5" />Paste a list</Button>
              {crmContacts > 0 && <Button size="sm" disabled={pending} onClick={() => start(async () => done(await importCaseManagersFromCrm(agencyId)))}>{pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Import {crmContacts} from the CRM client</Button>}
            </div>
          )}
          {mode === "add" && (
            <form className="grid gap-2 sm:grid-cols-4" onSubmit={(e) => { e.preventDefault(); start(async () => {
              const r = await addCaseManagerOffice(agencyId, f);
              setM(r.ok ? { ok: true, text: r.data } : { ok: false, text: r.error });
              if (r.ok) { setF({ name: "", email: "", phone: "", site: "" }); setMode("none"); router.refresh(); }
            }); }}>
              <div><Label htmlFor={`cm-n-${agencyId}`}>Name</Label><Input id={`cm-n-${agencyId}`} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></div>
              <div><Label htmlFor={`cm-e-${agencyId}`}>Email</Label><Input id={`cm-e-${agencyId}`} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></div>
              <div><Label htmlFor={`cm-p-${agencyId}`}>Phone</Label><Input id={`cm-p-${agencyId}`} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
              <div><Label htmlFor={`cm-s-${agencyId}`}>Office / site</Label><Input id={`cm-s-${agencyId}`} value={f.site} onChange={(e) => setF({ ...f, site: e.target.value })} /></div>
              <div className="sm:col-span-4"><Button variant="primary" size="sm" disabled={pending}>{pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Add</Button></div>
            </form>
          )}
          {mode === "paste" && (
            <div className="space-y-2">
              <Label htmlFor={`cm-t-${agencyId}`} hint="one person per line — name, email, phone, office (copy straight from a spreadsheet)">Paste case managers</Label>
              <Textarea id={`cm-t-${agencyId}`} rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Jason Bell, jason.bell@sureway.com.au, 0412 345 678, Belconnen\nPriya Shah\tpriya.shah@sureway.com.au\t\tWoden"} />
              <Button variant="primary" size="sm" disabled={pending || !text.trim()} onClick={() => start(async () => done(await importCaseManagersText(agencyId, text)))}>{pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Import</Button>
            </div>
          )}
          <Note m={m} />
        </div>
      )}
    </div>
  );
}

function Row({ c, canManage }: { c: CM; canManage: boolean }) {
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ name: c.name, email: c.email, phone: c.phone ?? "", site: c.site ?? "", active: c.active });
  const [m, setM] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const save = (next = f) => start(async () => { const r = await updateCaseManager(c.id, next); setM(r.ok ? { ok: true, text: r.data } : { ok: false, text: r.error }); if (r.ok) { setEdit(false); router.refresh(); } });
  return (
    <div className={`px-3 py-2.5 text-[0.8125rem] ${c.active ? "" : "opacity-60"}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="min-w-0 flex-1"><span className="font-semibold text-ink">{c.name}</span> <span className="text-ink-muted">· {c.email}{c.phone ? ` · ${c.phone}` : ""}{c.site ? ` · ${c.site}` : ""}</span>
          <span className="block text-[0.72rem] text-ink-faint">{c.seekers} job seeker{c.seekers === 1 ? "" : "s"} · last used {day(c.last_used_at)} · {SRC[c.source] ?? c.source}{c.active ? "" : " · removed"}</span></span>
        {canManage && <Button size="sm" variant="ghost" onClick={() => setEdit(!edit)}>Edit</Button>}
        {canManage && <Button size="sm" variant={c.active ? "danger" : "secondary"} disabled={pending} onClick={() => save({ ...f, active: !c.active })}>{c.active ? "Remove" : "Restore"}</Button>}
      </div>
      {edit && (
        <div className="mt-2 grid gap-2 sm:grid-cols-4">
          <Input aria-label="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <Input aria-label="Email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          <Input aria-label="Phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          <Input aria-label="Office / site" value={f.site} onChange={(e) => setF({ ...f, site: e.target.value })} />
          <div className="sm:col-span-4"><Button variant="primary" size="sm" disabled={pending} onClick={() => save()}>{pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Save</Button></div>
        </div>
      )}
      <Note m={m} />
    </div>
  );
}
