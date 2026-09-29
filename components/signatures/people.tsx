"use client";

import { useCallback, useMemo, useState } from "react";
import { ChevronDown, CircleAlert, CircleCheck, ClipboardCopy, Pencil, Search } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { missingFields, type SignatureDesign, type SignaturePerson } from "@/lib/signatures/render";
import { PersonForm } from "./person-form";
import { GmailExport } from "./gmail-export";
import { SignatureThumb } from "./preview";
import { cn } from "@/lib/cn";

export interface PeopleRow {
  userId: string; role: string; accountName: string | null; accountEmail: string;
  stored: SignaturePerson | null; person: SignaturePerson; updatedAt: string | null;
}

const ROLE: Record<string, string> = { owner: "Owner", admin: "Admin", manager: "Manager", sales: "Sales", staff: "Field staff" };
const FIELD_NAME: Record<string, string> = { display_name: "name", title: "job title", email: "email", photo_url: "photo" };

function Row({ row, design, orgId, version, open, onToggle }: {
  row: PeopleRow; design: SignatureDesign; orgId: string; version: number | null;
  open: "edit" | "gmail" | null; onToggle: (m: "edit" | "gmail") => void;
}) {
  const [live, setLive] = useState<SignaturePerson>(row.person);
  const onPreview = useCallback((p: SignaturePerson) => setLive(p), []);
  const fallback = useMemo(() => ({ display_name: row.accountName, title: row.person.title && !row.stored?.title ? row.person.title : null, email: row.accountEmail }), [row]);
  const missing = missingFields(design, row.person);
  return (
    <li className="border-b border-line last:border-0">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {row.person.photo_url
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={row.person.photo_url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-line" />
            : <Avatar name={row.person.display_name ?? row.accountEmail} size={36} />}
          <div className="min-w-0">
            <p className="truncate text-[0.8438rem] font-medium text-ink">{row.person.display_name ?? row.accountEmail}</p>
            <p className="truncate text-[0.75rem] text-ink-muted">{[row.person.title, ROLE[row.role] ?? row.role].filter(Boolean).join(" · ")}</p>
          </div>
        </div>
        <div className="w-full text-[0.75rem] sm:w-56">
          {missing.length
            ? <span className="inline-flex items-center gap-1.5 text-amber-800"><CircleAlert className="h-3.5 w-3.5" />Missing {missing.map((f) => FIELD_NAME[f] ?? f).join(", ")}</span>
            : <span className="inline-flex items-center gap-1.5 text-emerald-700"><CircleCheck className="h-3.5 w-3.5" />Complete</span>}
        </div>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant={open === "edit" ? "primary" : "secondary"} onClick={() => onToggle("edit")} aria-expanded={open === "edit"}><Pencil className="h-3.5 w-3.5" />Details</Button>
          <Button type="button" size="sm" variant={open === "gmail" ? "primary" : "ghost"} onClick={() => onToggle("gmail")} aria-expanded={open === "gmail"}><ClipboardCopy className="h-3.5 w-3.5" />Gmail<ChevronDown className={cn("h-3 w-3 transition-transform", open === "gmail" && "rotate-180")} /></Button>
        </div>
      </div>
      {open === "edit" && (
        <div className="grid gap-5 border-t border-line bg-canvas/60 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
          <PersonForm orgId={orgId} userId={row.userId} stored={row.stored} fallback={fallback} locked={design.locked} canEditLocked
            onPreview={onPreview} showPhoto={design.layout === "photo" || design.show.photo} />
          <div className="min-w-0">
            <p className="mb-2 text-[0.75rem] font-medium text-ink-muted">Their signature</p>
            <div className="overflow-hidden rounded-xl border border-line bg-white p-4"><SignatureThumb design={design} person={live} scale={0.8} /></div>
          </div>
        </div>
      )}
      {open === "gmail" && <div className="border-t border-line bg-canvas/60 px-4 py-4"><GmailExport design={design} person={row.person} version={version} /></div>}
    </li>
  );
}

/** Everyone on the team: who's complete, edit anyone's details (including locked ones), copy anyone's signature for Gmail. */
export function SignaturePeople({ rows, design, orgId, version }: { rows: PeopleRow[]; design: SignatureDesign; orgId: string; version: number | null }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<{ id: string; mode: "edit" | "gmail" } | null>(null);
  const [filter, setFilter] = useState<"all" | "missing">("all");
  const missingCount = rows.filter((r) => missingFields(design, r.person).length).length;
  const shown = rows.filter((r) => {
    if (filter === "missing" && !missingFields(design, r.person).length) return false;
    const s = q.trim().toLowerCase();
    return !s || [r.person.display_name, r.person.title, r.accountEmail].some((x) => x?.toLowerCase().includes(s));
  });
  return (
    <div className="rounded-xl border border-line bg-surface shadow-card">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people" aria-label="Search people" className="pl-9 text-base sm:text-[0.8438rem]" />
        </div>
        <div role="radiogroup" aria-label="Show" className="inline-flex rounded-lg bg-zinc-100 p-0.5 text-[0.75rem] font-medium">
          {([["all", `Everyone (${rows.length})`], ["missing", `Missing details (${missingCount})`]] as const).map(([v, l]) => (
            <button key={v} type="button" role="radio" aria-checked={filter === v} onClick={() => setFilter(v)} className={cn("h-7 rounded-md px-2.5", filter === v ? "bg-surface text-ink shadow-sm" : "text-ink-muted")}>{l}</button>
          ))}
        </div>
      </div>
      {shown.length === 0 ? <p className="px-4 py-8 text-center text-[0.8125rem] text-ink-muted">No one matches.</p> : (
        <ul>
          {shown.map((r) => (
            <Row key={r.userId} row={r} design={design} orgId={orgId} version={version}
              open={open?.id === r.userId ? open.mode : null}
              onToggle={(m) => setOpen((o) => (o?.id === r.userId && o.mode === m ? null : { id: r.userId, mode: m }))} />
          ))}
        </ul>
      )}
      <p className="border-t border-line px-4 py-2.5 text-[0.75rem] text-ink-muted">Everyone can also update their own details from <b>My signature</b> in their account menu. New team members appear here automatically.</p>
    </div>
  );
}
