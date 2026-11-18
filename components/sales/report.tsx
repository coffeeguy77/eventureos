"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Check, Copy, ExternalLink, Loader2, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormError, Input, Label, Select, Textarea } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { addBuyer, deleteSection, moveSection, savePageSettings, saveSection, setBuyerStatus, type SectionInput } from "@/app/(app)/business-sale/actions";

export interface SectionRow { id: string; key: string; title: string; subtitle: string | null; body: string | null; bullets: string[]; table_data: Record<string, unknown>[] | null; visibility: "public" | "buyers" | "hidden"; source: string }
const VIS: Record<SectionRow["visibility"], { label: string; tone: "green" | "amber" | "neutral" }> = {
  public: { label: "Anyone", tone: "green" }, buyers: { label: "Buyers after NDA", tone: "amber" }, hidden: { label: "Only you", tone: "neutral" },
};

/** The information memorandum: each section, who sees it, and its words. */
export function ReportEditor({ listingId, sections }: { listingId: string; sections: SectionRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const empty = (s: SectionRow) => !s.body?.trim() && !s.bullets.length && !s.table_data?.length;
  const fromExit = sections.filter((s) => s.source === "exit360" && empty(s)).length;
  return (
    <div className="space-y-3">
      <p className="text-[0.8125rem] text-ink-muted">These are the sections of the information memorandum on the buyer page. “Anyone” shows on the page; “Buyers after NDA” opens once a buyer signs; “Only you” stays hidden.</p>
      {fromExit > 0 && <p className="rounded-xl bg-canvas p-3 text-[0.8125rem] text-ink-muted ring-1 ring-line">{fromExit} sections came over from exit360 without their words (exit360 only shares those with signed buyers). They&apos;re hidden from buyers until you write them.</p>}
      <ul className="space-y-2">
        {sections.map((s, i) => (
          <li key={s.id} className="rounded-2xl bg-surface ring-1 ring-line">
            <div className="flex items-center gap-2 p-3">
              <button type="button" onClick={() => setOpen(open === s.id ? null : s.id)} className="min-w-0 flex-1 text-left">
                <span className="flex flex-wrap items-center gap-2"><span className="text-[0.875rem] font-medium text-ink">{s.title}</span><Badge tone={VIS[s.visibility].tone}>{VIS[s.visibility].label}</Badge>{empty(s) && <span className="text-[0.75rem] text-ink-faint">empty</span>}</span>
                {s.subtitle && <span className="mt-0.5 block truncate text-[0.75rem] text-ink-muted">{s.subtitle}</span>}
              </button>
              <span className="flex shrink-0 items-center">
                <button type="button" aria-label="Move up" disabled={pending || i === 0} onClick={() => start(async () => { await moveSection(listingId, s.id, -1); router.refresh(); })} className="grid h-9 w-8 place-items-center text-ink-faint hover:text-ink disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                <button type="button" aria-label="Move down" disabled={pending || i === sections.length - 1} onClick={() => start(async () => { await moveSection(listingId, s.id, 1); router.refresh(); })} className="grid h-9 w-8 place-items-center text-ink-faint hover:text-ink disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
              </span>
            </div>
            {open === s.id && <SectionForm listingId={listingId} s={s} onDone={() => setOpen(null)} />}
          </li>
        ))}
      </ul>
      {open === "new" ? <div className="rounded-2xl bg-surface ring-1 ring-line"><SectionForm listingId={listingId} onDone={() => setOpen(null)} /></div> : <Button onClick={() => setOpen("new")}><Plus className="h-4 w-4" />Add a section</Button>}
    </div>
  );
}

function SectionForm({ listingId, s, onDone }: { listingId: string; s?: SectionRow; onDone: () => void }) {
  const router = useRouter();
  const [f, setF] = useState<SectionInput>({ id: s?.id, title: s?.title ?? "", subtitle: s?.subtitle ?? "", body: s?.body ?? "", bullets: s?.bullets ?? [], visibility: s?.visibility ?? "buyers" });
  const [bullets, setBullets] = useState((s?.bullets ?? []).join("\n"));
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3 border-t border-line p-3.5">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem]">
        <div><Label>Title</Label><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
        <div><Label>Who sees it</Label><Select value={f.visibility} onChange={(e) => setF({ ...f, visibility: e.target.value as SectionInput["visibility"] })}><option value="public">Anyone with the page</option><option value="buyers">Buyers after the NDA</option><option value="hidden">Only you</option></Select></div>
      </div>
      <div><Label>Subtitle</Label><Input value={f.subtitle ?? ""} onChange={(e) => setF({ ...f, subtitle: e.target.value })} /></div>
      <div><Label hint="a blank line starts a new paragraph">Text</Label><Textarea rows={8} value={f.body ?? ""} onChange={(e) => setF({ ...f, body: e.target.value })} /></div>
      <div><Label hint="one per line">Points</Label><Textarea rows={4} value={bullets} onChange={(e) => setBullets(e.target.value)} /></div>
      {s?.table_data?.length ? <p className="text-[0.75rem] text-ink-faint">This section also has a table of {s.table_data.length} row{s.table_data.length === 1 ? "" : "s"} from exit360, shown on the buyer page.</p> : null}
      <FormError message={err} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <Button variant="primary" disabled={pending} onClick={() => start(async () => { setErr(null); const r = await saveSection(listingId, { ...f, bullets: bullets.split("\n") }); if (!r.ok) { setErr(r.error); return; } router.refresh(); onDone(); })}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Save section</Button>
          <Button onClick={onDone}>Cancel</Button>
        </div>
        {s && (confirm
          ? <span className="flex items-center gap-2 text-[0.8125rem]"><span className="text-ink-muted">Delete this section?</span><Button variant="danger" disabled={pending} onClick={() => start(async () => { const r = await deleteSection(listingId, s.id); if (!r.ok) setErr(r.error); else { router.refresh(); onDone(); } })}>Delete</Button><Button onClick={() => setConfirm(false)}>Keep</Button></span>
          : <button type="button" onClick={() => setConfirm(true)} className="inline-flex items-center gap-1 text-[0.8125rem] text-ink-muted hover:text-rose-600"><Trash2 className="h-4 w-4" />Delete</button>)}
      </div>
    </div>
  );
}

export interface BuyerRow { id: string; name: string; email: string | null; phone: string | null; company: string | null; token: string; status: "invited" | "nda_signed" | "approved" | "revoked"; nda_signed_at: string | null; nda_signed_name: string | null; last_seen_at: string | null; views: number; created_at: string }
const STATUS: Record<BuyerRow["status"], { label: string; tone: "neutral" | "amber" | "green" | "red" }> = {
  invited: { label: "Not signed yet", tone: "neutral" }, nda_signed: { label: "NDA signed", tone: "amber" }, approved: { label: "Approved", tone: "green" }, revoked: { label: "Link turned off", tone: "red" },
};
const when = (d: string | null) => (d ? new Date(d).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : null);

/** The buyer page's settings, and the buyers who have a private link to it. */
export function BuyersPanel({ listing, buyers }: { listing: { id: string; title: string; slug: string | null; is_public: boolean; nda_required: boolean; nda_text: string | null; defaultNda: string }; buyers: BuyerRow[] }) {
  const router = useRouter();
  const [p, setP] = useState({ title: listing.title, slug: listing.slug ?? "", is_public: listing.is_public, nda_required: listing.nda_required, nda_text: listing.nda_text ?? "" });
  const [pErr, setPErr] = useState<string | null>(null);
  const [pSaved, setPSaved] = useState(false);
  const [nb, setNb] = useState({ name: "", email: "", phone: "", company: "" });
  const [bErr, setBErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const page = listing.slug ? `${origin}/for-sale/${listing.slug}` : null;
  const link = (b: BuyerRow) => (page ? `${page}?k=${b.token}` : "");
  const copy = async (text: string, id: string) => { try { await navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(null), 2000); } catch { /* clipboard blocked */ } };
  return (
    <div className="space-y-5">
      <div className="space-y-3 rounded-2xl bg-surface p-4 ring-1 ring-line">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[0.875rem] font-semibold text-ink">Buyer page</p>
          {page && <a href={`/for-sale/${listing.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[0.8125rem] font-medium text-brand-700">Open the page<ExternalLink className="h-3.5 w-3.5" /></a>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label hint="shown to buyers">Listing name</Label><Input value={p.title} onChange={(e) => { setP({ ...p, title: e.target.value }); setPSaved(false); }} /></div>
          <div><Label hint={origin ? `${origin.replace(/^https?:\/\//, "")}/for-sale/…` : undefined}>Web address</Label><Input value={p.slug} onChange={(e) => { setP({ ...p, slug: e.target.value }); setPSaved(false); }} placeholder="bean-culture-roastery" /></div>
        </div>
        <label className="flex items-start gap-2.5 text-[0.8125rem] text-ink"><input type="checkbox" className="mt-0.5 h-4 w-4" checked={p.is_public} onChange={(e) => { setP({ ...p, is_public: e.target.checked }); setPSaved(false); }} /><span><b className="font-medium">Anyone with the address can see the page</b><span className="block text-ink-muted">Off: only buyers you add (below) can open it, each with their own link.</span></span></label>
        <label className="flex items-start gap-2.5 text-[0.8125rem] text-ink"><input type="checkbox" className="mt-0.5 h-4 w-4" checked={p.nda_required} onChange={(e) => { setP({ ...p, nda_required: e.target.checked }); setPSaved(false); }} /><span><b className="font-medium">Buyers sign an NDA before the buyer-only sections open</b><span className="block text-ink-muted">They type their name and tick to agree on their link; you see when they signed.</span></span></label>
        {p.nda_required && <div><Label hint="blank = the standard wording">NDA wording</Label><Textarea rows={5} value={p.nda_text} placeholder={listing.defaultNda} onChange={(e) => { setP({ ...p, nda_text: e.target.value }); setPSaved(false); }} /></div>}
        <FormError message={pErr} />
        <div className="flex items-center gap-3">
          <Button variant="primary" disabled={pending} onClick={() => start(async () => { setPErr(null); const r = await savePageSettings(listing.id, p); if (!r.ok) { setPErr(r.error); return; } setPSaved(true); router.refresh(); })}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Save page settings</Button>
          {pSaved && <span className="text-[0.8125rem] font-medium text-emerald-700">Saved.</span>}
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-[0.875rem] font-semibold text-ink">Buyers ({buyers.length})</p>
        {!listing.slug && <p className="text-[0.8125rem] text-ink-muted">Save a web address above first — buyer links are made from it.</p>}
        {buyers.map((b) => (
          <div key={b.id} className={cn("rounded-2xl bg-surface p-3.5 ring-1 ring-line", b.status === "revoked" && "opacity-70")}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-[0.875rem] font-medium text-ink">{b.name}<Badge tone={STATUS[b.status].tone}>{STATUS[b.status].label}</Badge></p>
                <p className="mt-0.5 text-[0.75rem] text-ink-muted">{[b.company, b.email, b.phone].filter(Boolean).join(", ") || "No contact details"}</p>
                <p className="mt-0.5 text-[0.75rem] text-ink-faint">{b.views ? `Opened ${b.views} time${b.views === 1 ? "" : "s"}, last ${when(b.last_seen_at)}` : "Hasn't opened the link yet"}{b.nda_signed_at ? `. Signed as “${b.nda_signed_name}” ${when(b.nda_signed_at)}` : ""}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {page && b.status !== "revoked" && <Button size="sm" onClick={() => copy(link(b), b.id)}>{copied === b.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied === b.id ? "Copied" : "Copy link"}</Button>}
                {b.status === "nda_signed" && <Button size="sm" variant="primary" disabled={pending} onClick={() => start(async () => { await setBuyerStatus(listing.id, b.id, "approved"); router.refresh(); })}>Approve</Button>}
                {b.status !== "revoked"
                  ? <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => { await setBuyerStatus(listing.id, b.id, "revoked"); router.refresh(); })}>Turn off link</Button>
                  : <Button size="sm" disabled={pending} onClick={() => start(async () => { await setBuyerStatus(listing.id, b.id, "restore"); router.refresh(); })}>Turn link back on</Button>}
              </div>
            </div>
          </div>
        ))}
        <div className="space-y-3 rounded-2xl bg-canvas p-3.5 ring-1 ring-line">
          <p className="text-[0.8125rem] font-semibold text-ink">Give a buyer access</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Name</Label><Input value={nb.name} onChange={(e) => setNb({ ...nb, name: e.target.value })} /></div>
            <div><Label hint="optional">Company</Label><Input value={nb.company} onChange={(e) => setNb({ ...nb, company: e.target.value })} /></div>
            <div><Label hint="optional">Email</Label><Input type="email" value={nb.email} onChange={(e) => setNb({ ...nb, email: e.target.value })} /></div>
            <div><Label hint="optional">Phone</Label><Input inputMode="tel" value={nb.phone} onChange={(e) => setNb({ ...nb, phone: e.target.value })} /></div>
          </div>
          <FormError message={bErr} />
          <Button variant="primary" disabled={pending} onClick={() => start(async () => { setBErr(null); const r = await addBuyer(listing.id, nb); if (!r.ok) { setBErr(r.error); return; } setNb({ name: "", email: "", phone: "", company: "" }); router.refresh(); })}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Add buyer and make their link</Button>
          <p className="text-[0.75rem] text-ink-faint">Copy their link and send it yourself — each link is private to that buyer and can be turned off at any time.</p>
        </div>
      </div>
    </div>
  );
}
