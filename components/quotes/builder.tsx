"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AlertCircle, Calculator, Check, CheckCircle2, Copy, Eye, Loader2, Plus, Send, X } from "lucide-react";
import {
  addItem, addSection, deleteItem, deleteSection, duplicateQuote, moveItem, moveSection, previewQuote,
  publishQuote, recordQuoteResponse, updateItem, updateQuoteHeader, updateSection,
} from "@/app/(app)/quotes/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { FormError, Label, inputClass } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { fmtDate, money } from "@/lib/format";
import { QUOTE_STATUS } from "@/lib/status";
import type { QuoteStatus } from "@/lib/types";
import { parseNum, priceStr, numStr, quoteTotals } from "./calc";
import { draftNums, fieldPatch, NUM_FIELDS, toDraft, type BoolField, type ItemDraft, type NumField } from "./draft";
import { QuoteAttachments } from "./attachments";
import { PriceJobPanel, type PricingPackage } from "./price-job";
import type { PricedService } from "@/lib/pricing/engine";
import { QuoteDocument } from "./quote-document";
import { SectionEditor, type Col, type SectionHandlers } from "./section-editor";
import type {
  ActionResult, CatalogueItem, HeaderPatch, ItemPatch, QItem, QSection, QuoteDoc, QuoteSnapshotData, VersionInfo,
} from "./types";

export interface BuilderProps {
  quote: {
    id: string; number: number; title: string; status: QuoteStatus; issue_date: string; expiry_date: string | null;
    notes: string | null; terms: string | null; has_unpublished_changes: boolean; current_version_id: string | null;
  };
  currentVersion: VersionInfo | null;
  sections: QSection[];
  items: QItem[];
  catalogue: CatalogueItem[];
  docs: QuoteDoc[];
  orgId: string;
  orgName: string;
  currency: string;
  tz: string;
  today: string;
  customer: { id: string; name: string };
  event: { id: string; number: number; name: string; event_date: string | null };
  signerName: string;
  acceptanceNote: string;
  gmailConnected: boolean;
  nextAction: React.ReactNode;
  history: React.ReactNode;
  pricing: { packages: PricingPackage[]; services: PricedService[]; defaults: { start: string | null; end: string | null; guests: number | null } };
}

type Panel = null | "publish" | "respond";
type Toast = { message: string; tone: "ok" | "error"; undo?: () => void };

const SAVE_DELAY = 700;

export function QuoteBuilder(p: BuilderProps) {
  const { quote, currency } = p;

  // ---------------------------------------------------------------- local state
  const [sections, setSections] = useState<QSection[]>(p.sections);
  const [items, setItems] = useState<ItemDraft[]>(() => p.items.map(toDraft));
  const [title, setTitle] = useState(quote.title);
  const [expiry, setExpiry] = useState(quote.expiry_date ?? "");
  const [notes, setNotes] = useState(quote.notes ?? "");
  const [terms, setTerms] = useState(quote.terms ?? "");
  const [localDirty, setLocalDirty] = useState(false);

  const [busy, setBusy] = useState(0);
  const [saveState, setSaveState] = useState<"idle" | "saved" | "error">("idle");
  const [toast, setToast] = useState<Toast | null>(null);
  const [addingIn, setAddingIn] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [preview, setPreview] = useState<QuoteSnapshotData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // pending debounced saves, keyed ("i:<id>", "s:<id>", "h")
  const patches = useRef(new Map<string, Record<string, unknown>>());
  const senders = useRef(new Map<string, (patch: Record<string, unknown>) => Promise<ActionResult<unknown>>>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const chains = useRef(new Map<string, Promise<unknown>>());
  const structural = useRef<Promise<unknown>>(Promise.resolve());
  const inflightOps = useRef(new Set<Promise<unknown>>());
  const focusNext = useRef<{ id: string; col: Col } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const applied = useRef<{ items: QItem[]; sections: QSection[] } | null>({ items: p.items, sections: p.sections });

  const showToast = useCallback((t: Toast, ms = 5000) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(t);
    toastTimer.current = setTimeout(() => setToast(null), t.tone === "error" ? 9000 : ms);
  }, []);

  /** Count in-flight requests and surface failures in plain English. */
  const track = useCallback(async <T,>(pr: Promise<ActionResult<T>>): Promise<ActionResult<T>> => {
    setBusy((b) => b + 1);
    let res: ActionResult<T>;
    try {
      res = await pr;
    } catch {
      res = { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
    }
    setBusy((b) => b - 1);
    if (res.ok) setSaveState("saved");
    else {
      setSaveState("error");
      applied.current = null; // roll the draft back to the server's copy once idle
      showToast({ message: res.error, tone: "error" });
    }
    return res;
  }, [showToast]);

  const flush = useCallback((key: string): Promise<unknown> => {
    const t = timers.current.get(key);
    if (t) { clearTimeout(t); timers.current.delete(key); }
    const patch = patches.current.get(key);
    const send = senders.current.get(key);
    if (!patch || !send) return chains.current.get(key) ?? Promise.resolve();
    patches.current.delete(key);
    const prev = chains.current.get(key) ?? Promise.resolve();
    const next = prev.then(() => track(send(patch)));
    chains.current.set(key, next);
    void next.finally(() => { if (chains.current.get(key) === next) chains.current.delete(key); });
    return next;
  }, [track]);

  const queue = useCallback((key: string, patch: Record<string, unknown>, send: (patch: Record<string, unknown>) => Promise<ActionResult<unknown>>, delay = SAVE_DELAY) => {
    patches.current.set(key, { ...(patches.current.get(key) ?? {}), ...patch });
    senders.current.set(key, send);
    setLocalDirty(true);
    const t = timers.current.get(key);
    if (t) clearTimeout(t);
    if (delay <= 0) { void flush(key); return; }
    timers.current.set(key, setTimeout(() => void flush(key), delay));
  }, [flush]);

  /** Save everything now. Resolves true when nothing failed. */
  const flushAll = useCallback(async () => {
    const keys = [...patches.current.keys()];
    const results = await Promise.all([...keys.map(flush), ...chains.current.values(), ...inflightOps.current]);
    return results.every((r) => !(r && typeof r === "object" && "ok" in r && (r as ActionResult<unknown>).ok === false));
  }, [flush]);

  /** Serialise structural changes (add / move / delete) so positions never race. */
  const structuralOp = useCallback(<T,>(fn: () => Promise<ActionResult<T>>) => {
    const next = structural.current.then(() => track(fn()));
    structural.current = next.catch(() => undefined);
    inflightOps.current.add(next);
    void next.finally(() => inflightOps.current.delete(next));
    setLocalDirty(true);
    return next;
  }, [track]);

  // Adopt the server's copy when it changes (or after a failed save) and nothing local is pending.
  useEffect(() => {
    if (busy > 0 || patches.current.size > 0) return;
    const a = applied.current;
    if (a && a.items === p.items && a.sections === p.sections) return;
    applied.current = { items: p.items, sections: p.sections };
    setItems(p.items.map(toDraft));
    setSections(p.sections);
  }, [p.items, p.sections, busy]);

  useEffect(() => {
    if (busy === 0 && saveState === "saved") {
      const t = setTimeout(() => setSaveState("idle"), 2500);
      return () => clearTimeout(t);
    }
  }, [busy, saveState]);

  // Warn before leaving with unsaved edits
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (patches.current.size > 0 || busy > 0) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [busy]);

  // Focus requests (after adding a row / moving with Enter)
  useEffect(() => {
    const f = focusNext.current;
    if (!f) return;
    const el = document.querySelector<HTMLInputElement>(`[data-item="${f.id}"][data-col="${f.col}"]`);
    if (el) { el.focus(); focusNext.current = null; }
  }, [items]);

  // ---------------------------------------------------------------- derived
  const optionalSections = useMemo(() => new Set(sections.filter((s) => s.is_optional).map((s) => s.id)), [sections]);
  const totals = useMemo(() => quoteTotals(items.map(draftNums), optionalSections), [items, optionalSections]);
  const bySection = useMemo(() => {
    const m = new Map<string, ItemDraft[]>();
    for (const s of sections) m.set(s.id, []);
    for (const i of [...items].sort((a, b) => a.position - b.position)) m.get(i.section_id)?.push(i);
    return m;
  }, [items, sections]);
  const serverItems = useMemo(() => new Map(p.items.map((i) => [i.id, i])), [p.items]);

  const dirty = quote.has_unpublished_changes || localDirty;
  const cv = p.currentVersion;
  const canRespond = !!cv && (cv.status === "sent" || cv.status === "viewed");
  const nextVersion = (cv?.version_number ?? 0) + 1;
  const status = QUOTE_STATUS[quote.status];

  // ---------------------------------------------------------------- header edits
  const sendHeader = (patch: Record<string, unknown>) => updateQuoteHeader(quote.id, patch as HeaderPatch);

  // ---------------------------------------------------------------- item edits
  const sendItem = (id: string) => (patch: Record<string, unknown>) => updateItem(id, patch as ItemPatch);

  const h: SectionHandlers = {
    onSectionTitle(id, value) {
      setSections((all) => all.map((s) => (s.id === id ? { ...s, title: value } : s)));
      if (value.trim()) queue(`s:${id}`, { title: value }, (patch) => updateSection(id, patch));
    },
    onSectionBlur(id) {
      const s = sections.find((x) => x.id === id);
      if (s && !s.title.trim()) {
        const server = p.sections.find((x) => x.id === id);
        setSections((all) => all.map((x) => (x.id === id ? { ...x, title: server?.title ?? "Section" } : x)));
        patches.current.delete(`s:${id}`);
        return;
      }
      void flush(`s:${id}`);
    },
    onSectionOptional(id, value) {
      setSections((all) => all.map((s) => (s.id === id ? { ...s, is_optional: value } : s)));
      queue(`s:${id}`, { is_optional: value }, (patch) => updateSection(id, patch), 0);
    },
    onMoveSection(id, dir) {
      setSections((all) => {
        const list = [...all].sort((a, b) => a.position - b.position);
        const i = list.findIndex((s) => s.id === id);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= list.length) return all;
        [list[i], list[j]] = [list[j], list[i]];
        return list.map((s, pos) => ({ ...s, position: pos }));
      });
      void structuralOp(() => moveSection(id, dir));
    },
    onDeleteSection(id) {
      const s = sections.find((x) => x.id === id);
      setSections((all) => all.filter((x) => x.id !== id));
      setItems((all) => all.filter((i) => i.section_id !== id));
      void structuralOp(() => deleteSection(id)).then((r) => { if (r.ok && s) showToast({ message: `Removed section ‘${s.title}’`, tone: "ok" }); });
    },
    onField(id, field, value) {
      setItems((all) => all.map((i) => (i.id === id ? { ...i, [field]: value } : i)));
      const patch = fieldPatch(field, value);
      if (!patch) { setLocalDirty(true); return; } // not a valid number yet — wait for the user
      queue(`i:${id}`, patch as Record<string, unknown>, sendItem(id), typeof value === "boolean" ? 0 : SAVE_DELAY);
    },
    onBlurField(id, field) {
      const d = items.find((i) => i.id === id);
      if (d && (NUM_FIELDS as string[]).includes(field)) {
        const f = field as NumField;
        const n = parseNum(d[f]);
        if (n == null) {
          // Restore the last saved value rather than leave an invalid number behind
          const s = serverItems.get(id);
          const restored = s ? (f === "unit_price" ? priceStr(s[f]) : numStr(s[f])) : "0";
          setItems((all) => all.map((i) => (i.id === id ? { ...i, [f]: restored } : i)));
        } else if (f === "unit_price") {
          setItems((all) => all.map((i) => (i.id === id ? { ...i, unit_price: priceStr(n) } : i)));
        }
      }
      void flush(`i:${id}`);
    },
    onItemKey(e, id, col) {
      if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
      e.preventDefault();
      void flush(`i:${id}`);
      const it = items.find((i) => i.id === id);
      if (!it) return;
      const siblings = bySection.get(it.section_id) ?? [];
      const idx = siblings.findIndex((i) => i.id === id);
      const next = siblings[idx + 1];
      if (next) {
        document.querySelector<HTMLInputElement>(`[data-item="${next.id}"][data-col="${col}"]`)?.focus();
      } else if (it.name.trim()) {
        h.onAddItem(it.section_id);
      }
    },
    onAddItem(sectionId) {
      setAddingIn(sectionId);
      void structuralOp(() => addItem(quote.id, sectionId)).then((r) => {
        setAddingIn(null);
        if (r.ok) { focusNext.current = { id: r.data.id, col: "name" }; setItems((all) => all.some((i) => i.id === r.data.id) ? all : [...all, toDraft(r.data)]); }
      });
    },
    onQuickAdd(sectionId, c) {
      setAddingIn(sectionId);
      void structuralOp(() => addItem(quote.id, sectionId, {
        name: c.name, description: c.description, unit: c.unit, unit_price: c.unit_price, tax_rate: c.tax_rate,
        is_package: c.is_package, image_url: c.image_url, quantity: 1,
      })).then((r) => {
        setAddingIn(null);
        if (r.ok) { focusNext.current = { id: r.data.id, col: "quantity" }; setItems((all) => all.some((i) => i.id === r.data.id) ? all : [...all, toDraft(r.data)]); }
      });
    },
    onMoveItem(id, dir) {
      void flush(`i:${id}`);
      setItems((all) => {
        const it = all.find((i) => i.id === id);
        if (!it) return all;
        const sib = all.filter((i) => i.section_id === it.section_id).sort((a, b) => a.position - b.position);
        const i = sib.findIndex((x) => x.id === id);
        const j = i + dir;
        if (j < 0 || j >= sib.length) return all;
        [sib[i], sib[j]] = [sib[j], sib[i]];
        const pos = new Map(sib.map((x, k) => [x.id, k]));
        return all.map((x) => (pos.has(x.id) ? { ...x, position: pos.get(x.id)! } : x));
      });
      void structuralOp(() => moveItem(id, dir));
    },
    onDeleteItem(id) {
      const key = `i:${id}`;
      const t = timers.current.get(key);
      if (t) clearTimeout(t);
      timers.current.delete(key);
      patches.current.delete(key);
      const it = items.find((i) => i.id === id);
      if (!it) return;
      setItems((all) => all.filter((i) => i.id !== id));
      void structuralOp(() => deleteItem(id)).then((r) => {
        if (!r.ok) return;
        const nums = draftNums(it);
        showToast({
          message: `Removed ${it.name ? `‘${it.name}’` : "blank item"}`, tone: "ok",
          undo: () => {
            setToast(null);
            void structuralOp(() => addItem(quote.id, it.section_id, {
              name: it.name, description: it.description, unit: it.unit, quantity: nums.quantity, unit_price: nums.unit_price,
              tax_rate: nums.tax_rate, discount_percent: nums.discount_percent, is_optional: it.is_optional,
              is_package: it.is_package, image_url: it.image_url,
            }, it.position)).then((r2) => { if (r2.ok) setItems((all) => all.some((i) => i.id === r2.data.id) ? all : [...all, toDraft(r2.data)]); });
          },
        }, 7000);
      });
    },
  };

  const [pricing, setPricing] = useState(false);
  function onPriced(section: QSection, added: QItem[]) {
    setPricing(false);
    setSections((all) => all.some((x) => x.id === section.id) ? all : [...all, section]);
    setItems((all) => [...all, ...added.filter((a) => !all.some((i) => i.id === a.id)).map(toDraft)]);
    showToast({ message: `Added ‘${section.title}’`, tone: "ok" });
  }

  function onAddSection() {
    void structuralOp(() => addSection(quote.id)).then((r) => {
      if (r.ok) setSections((all) => all.some((s) => s.id === r.data.id) ? all : [...all, r.data]);
    });
  }

  // ---------------------------------------------------------------- preview / publish / respond / duplicate
  async function openPreview() {
    setPreviewLoading(true);
    const saved = await flushAll();
    if (!saved) { setPreviewLoading(false); return; }
    const res = await previewQuote(quote.id).catch(() => ({ ok: false as const, error: "Couldn't reach the server. Check your connection and try again." }));
    setPreviewLoading(false);
    if (!res.ok) { showToast({ message: res.error, tone: "error" }); return; }
    setPreview(res.data);
  }

  const sortedSections = [...sections].sort((a, b) => a.position - b.position);
  const itemCount = items.length;

  return (
    <div>
      {/* ------------------------------------------------------------ header */}
      <div className="mb-5">
        <div className="mb-1 flex flex-wrap items-center gap-2 text-[12px] text-ink-faint">
          <Link href="/quotes" className="hover:text-ink">Quotes</Link><span>/</span><span className="tabular">Q-{quote.number}</span>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-3 sm:gap-4">
          <div className="min-w-0 flex-1 basis-72">
            <input
              value={title}
              onChange={(e) => { setTitle(e.target.value); if (e.target.value.trim()) queue("h", { title: e.target.value }, sendHeader, 900); }}
              onBlur={() => { if (!title.trim()) { setTitle(quote.title); patches.current.delete("h"); } else void flush("h"); }}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              aria-label="Quote title"
              maxLength={200}
              className="-ml-2 w-full max-w-3xl rounded-lg border border-transparent bg-transparent px-2 py-0.5 text-[22px] font-semibold tracking-tight text-ink hover:border-line focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100 max-md:[&:not(#x)]:!text-[20px]"
            />
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-ink-muted">
              <Badge tone={status.tone} dot>{status.label}</Badge>
              <Link href={`/clients/${p.customer.id}`} className="font-medium text-ink hover:text-brand-700">{p.customer.name}</Link>
              <Link href={`/events/${p.event.id}?tab=quote`} className="min-w-0 break-words hover:text-brand-700">EV-{p.event.number} · {p.event.name}{p.event.event_date ? ` · ${fmtDate(p.event.event_date)}` : ""}</Link>
              <span title="Set to the publish date each time you send">Issued {fmtDate(quote.issue_date)}</span>
              <label className="flex items-center gap-1.5">
                <span>Expires</span>
                <input
                  type="date"
                  value={expiry}
                  min={p.today}
                  onChange={(e) => { setExpiry(e.target.value); queue("h", { expiry_date: e.target.value || null }, sendHeader, 0); }}
                  aria-label="Expiry date"
                  className={cn("h-9 rounded-md border border-line bg-white px-1.5 text-[12.5px] text-ink sm:h-7 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100",
                    expiry && expiry < p.today && "border-rose-300 text-rose-700")}
                />
              </label>
            </div>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <SaveIndicator busy={busy > 0} state={saveState} />
            <Button onClick={openPreview} disabled={previewLoading} className="h-10 flex-1 basis-40 sm:h-9 sm:flex-none sm:basis-auto">
              {previewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}Preview as customer
            </Button>
            <Button variant="primary" onClick={() => setPanel(panel === "publish" ? null : "publish")} aria-expanded={panel === "publish"} className="h-10 flex-1 basis-40 sm:h-9 sm:flex-none sm:basis-auto">
              <Send className="h-4 w-4" />{cv ? "Publish & send update" : "Publish & send"}
            </Button>
          </div>
        </div>

        {/* version indicator */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {cv ? (
            dirty ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[12px] font-medium text-amber-900 ring-1 ring-inset ring-amber-100">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />Draft has unpublished changes · customer sees version {cv.version_number}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[12px] font-medium text-emerald-800 ring-1 ring-inset ring-emerald-100">
                <CheckCircle2 className="h-3.5 w-3.5" />Customer sees version {cv.version_number} — up to date
              </span>
            )
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 text-[12px] font-medium text-ink-muted ring-1 ring-inset ring-zinc-200">
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />Not sent yet — the customer can’t see this draft
            </span>
          )}
          {canRespond && (
            <button type="button" onClick={() => setPanel(panel === "respond" ? null : "respond")} className="rounded-full px-2.5 py-2 text-[12px] font-medium text-brand-700 hover:bg-brand-50 sm:py-1" aria-expanded={panel === "respond"}>
              Record acceptance / decline
            </button>
          )}
          <DuplicateButton quoteId={quote.id} onError={(m) => showToast({ message: m, tone: "error" })} />
        </div>

        {panel === "publish" && (
          <PublishPanel
            quoteId={quote.id} customerName={p.customer.name} nextVersion={nextVersion} currentVersion={cv}
            total={totals.total} currency={currency} dirty={dirty} status={quote.status}
            problems={[
              itemCount === 0 ? "Add at least one line item." : null,
              items.some((i) => !i.name.trim()) ? "Some line items have no name — name or remove them." : null,
              !expiry ? "Set an expiry date." : expiry < p.today ? "The expiry date has passed — choose a new one." : null,
            ].filter((x): x is string => !!x)}
            gmailConnected={p.gmailConnected}
            flushAll={flushAll}
            onClose={() => setPanel(null)}
            onDone={(n) => { setPanel(null); setLocalDirty(false); showToast({ message: `Version ${n} published — it’s now in ${p.customer.name}’s customer portal.`, tone: "ok" }, 7000); }}
          />
        )}
        {panel === "respond" && cv && (
          <RespondPanel quoteId={quote.id} version={cv} signerName={p.signerName} acceptanceNote={p.acceptanceNote}
            onClose={() => setPanel(null)} onDone={(d) => { setPanel(null); showToast({ message: d === "accepted" ? "Acceptance recorded." : "Decline recorded.", tone: "ok" }); }} />
        )}
      </div>

      {p.nextAction}

      {/* ------------------------------------------------------------ body */}
      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          {sortedSections.map((s, i) => (
            <SectionEditor
              key={s.id} section={s} items={bySection.get(s.id) ?? []} index={i} count={sortedSections.length}
              currency={currency} catalogue={p.catalogue} adding={addingIn === s.id} h={h}
            />
          ))}
          {pricing && (
            <PriceJobPanel quoteId={quote.id} packages={p.pricing.packages} services={p.pricing.services} defaults={p.pricing.defaults}
              currency={currency} onClose={() => setPricing(false)} onAdded={onPriced} />
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => setPricing(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-brand-300 bg-brand-50/40 py-3 text-[13px] font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50">
              <Calculator className="h-4 w-4" />Price a job
            </button>
            <button type="button" onClick={onAddSection}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-strong py-3 text-[13px] font-medium text-ink-muted hover:border-brand-300 hover:bg-white hover:text-brand-700">
              <Plus className="h-4 w-4" />Add section
            </button>
          </div>

          <Card>
            <CardHeader title="Notes & terms" subtitle="Shown to the customer at the end of the quote" />
            <div className="grid gap-4 px-5 pb-5 lg:grid-cols-2">
              <div>
                <Label htmlFor="q-notes">Notes</Label>
                <textarea id="q-notes" value={notes} rows={6} maxLength={20000}
                  onChange={(e) => { setNotes(e.target.value); queue("h", { notes: e.target.value }, sendHeader, 1200); }}
                  onBlur={() => void flush("h")}
                  placeholder="Anything the customer should know — inclusions, timings, set-up requirements…"
                  className={cn(inputClass, "min-h-[140px] text-[13px]")} />
              </div>
              <div>
                <Label htmlFor="q-terms">Terms &amp; conditions</Label>
                <textarea id="q-terms" value={terms} rows={6} maxLength={20000}
                  onChange={(e) => { setTerms(e.target.value); queue("h", { terms: e.target.value }, sendHeader, 1200); }}
                  onBlur={() => void flush("h")}
                  placeholder="Deposit, cancellation and payment terms…"
                  className={cn(inputClass, "min-h-[140px] text-[13px]")} />
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Attachments" subtitle="Menus, floor plans or photos the customer can download from their portal" />
            <QuoteAttachments quoteId={quote.id} orgId={p.orgId} initial={p.docs} />
          </Card>
        </div>

        {/* ------------------------------------------------------------ sidebar */}
        <div className="space-y-6 xl:sticky xl:top-4 xl:self-start">
          <Card>
            <CardHeader title="Draft total" subtitle={`${itemCount} line item${itemCount === 1 ? "" : "s"}`} />
            <dl className="space-y-1.5 px-5 pb-4 text-[13px]">
              <div className="flex justify-between"><dt className="text-ink-muted">Subtotal (ex GST)</dt><dd className="tabular text-ink">{money(totals.subtotal, currency)}</dd></div>
              {totals.discount > 0 && <div className="flex justify-between"><dt className="text-ink-muted">Includes discounts</dt><dd className="tabular text-emerald-700">−{money(totals.discount, currency)}</dd></div>}
              <div className="flex justify-between"><dt className="text-ink-muted">GST</dt><dd className="tabular text-ink">{money(totals.tax, currency)}</dd></div>
              <div className="flex items-baseline justify-between border-t border-line pt-2"><dt className="font-semibold text-ink">Total</dt><dd className="tabular text-[18px] font-semibold text-ink">{money(totals.total, currency)}</dd></div>
              <div className="flex justify-between pt-1 text-[12.5px]">
                <dt className="text-ink-muted">Optional extras{totals.optionalCount ? ` (${totals.optionalCount})` : ""}</dt>
                <dd className="tabular text-ink-muted">{money(totals.optional, currency)}</dd>
              </div>
              <p className="text-[11.5px] text-ink-faint">Optional extras (inc GST) are offered to the customer but not included in the total.</p>
            </dl>
            {cv && (
              <div className="border-t border-line px-5 py-3 text-[12.5px]">
                <div className="flex justify-between text-ink-muted">
                  <span>Customer’s version {cv.version_number}</span>
                  <span className="tabular">{money(cv.total, currency)}</span>
                </div>
                {dirty && Math.abs(cv.total - totals.total) >= 0.005 && (
                  <p className={cn("tabular mt-0.5 text-right font-medium", totals.total > cv.total ? "text-amber-800" : "text-emerald-700")}>
                    {totals.total > cv.total ? "+" : "−"}{money(Math.abs(totals.total - cv.total), currency)} in this draft
                  </p>
                )}
              </div>
            )}
          </Card>
          {p.history}
        </div>
      </div>

      {/* ------------------------------------------------------------ overlays */}
      {preview && (
        <PreviewModal onClose={() => setPreview(null)}>
          <QuoteDocument snap={preview} currency={currency} orgName={p.orgName} quoteNumber={quote.number} customerName={p.customer.name}
            eventLabel={`${p.event.name}${p.event.event_date ? ` · ${fmtDate(p.event.event_date, "long")}` : ""}`}
            versionLabel={`${nextVersion} (preview)`} />
        </PreviewModal>
      )}
      {toast && (
        <div role="status" className={cn("fixed bottom-[calc(env(safe-area-inset-bottom)+5rem)] left-1/2 z-50 flex lg:bottom-4 w-[calc(100%-32px)] max-w-md -translate-x-1/2 items-start gap-3 rounded-xl px-4 py-3 text-[13px] shadow-pop",
          toast.tone === "error" ? "bg-rose-700 text-white" : "bg-ink text-white")}>
          {toast.tone === "error" ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <Check className="mt-0.5 h-4 w-4 shrink-0" />}
          <span className="min-w-0 flex-1">{toast.message}</span>
          {toast.undo && <button type="button" onClick={toast.undo} className="-my-2 shrink-0 px-1 py-2 font-semibold text-brand-200 hover:text-white">Undo</button>}
          <button type="button" onClick={() => setToast(null)} className="shrink-0 opacity-70 hover:opacity-100" aria-label="Dismiss"><X className="h-4 w-4" /></button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function SaveIndicator({ busy, state }: { busy: boolean; state: "idle" | "saved" | "error" }) {
  return (
    <span className="order-last inline-flex w-full items-center justify-start gap-1.5 text-[12px] text-ink-faint empty:hidden sm:order-none sm:w-[118px] sm:justify-end sm:empty:inline-flex" aria-live="polite">
      {busy ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Saving…</>
        : state === "error" ? <span className="flex items-center gap-1.5 text-rose-700"><AlertCircle className="h-3.5 w-3.5" />Not saved</span>
          : state === "saved" ? <><Check className="h-3.5 w-3.5 text-emerald-600" />All changes saved</>
            : null}
    </span>
  );
}

export function DuplicateButton({ quoteId, onError, variant = "chip" }: { quoteId: string; onError?: (m: string) => void; variant?: "chip" | "button" }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const click = () => start(async () => {
    setErr(null);
    const r = await duplicateQuote(quoteId).catch(() => ({ ok: false as const, error: "Couldn't reach the server. Check your connection and try again." }));
    if (r && !r.ok) { if (onError) onError(r.error); else setErr(r.error); }
  });
  const icon = pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />;
  return (
    <>
      {variant === "button" ? (
        <Button onClick={click} disabled={pending} className="h-10 sm:h-9">{icon}Duplicate as new quote</Button>
      ) : (
        <button type="button" disabled={pending} onClick={click}
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-2 text-[12px] font-medium text-ink-muted hover:bg-zinc-100 sm:py-1 hover:text-ink disabled:opacity-60">
          {icon}Duplicate as new quote
        </button>
      )}
      {err && <span role="alert" className="text-[12px] text-rose-700">{err}</span>}
    </>
  );
}

function PublishPanel({ quoteId, customerName, nextVersion, currentVersion, total, currency, dirty, status, problems, gmailConnected, flushAll, onClose, onDone }: {
  quoteId: string; customerName: string; nextVersion: number; currentVersion: VersionInfo | null; total: number; currency: string;
  dirty: boolean; status: QuoteStatus; problems: string[]; gmailConnected: boolean;
  flushAll: () => Promise<boolean>; onClose: () => void; onDone: (n: number) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nothingNew = !!currentVersion && !dirty && (status === "sent" || status === "viewed");

  async function publish() {
    setError(null);
    setPending(true);
    const saved = await flushAll();
    if (!saved) { setPending(false); setError("Some changes couldn’t be saved. Fix them before publishing."); return; }
    const res = await publishQuote(quoteId).catch(() => ({ ok: false as const, error: "Couldn't reach the server. Check your connection and try again." }));
    setPending(false);
    if (!res.ok) { setError(res.error); return; }
    onDone(res.data.versionNumber);
  }

  return (
    <div className="mt-4 rounded-xl border border-brand-200 bg-brand-50/50 p-4 sm:p-5" role="region" aria-label="Publish quote">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-ink">Publish version {nextVersion} to {customerName}?</p>
          <p className="tabular mt-0.5 text-[13px] text-ink-muted">Total {money(total, currency)} inc GST</p>
        </div>
        <button type="button" onClick={onClose} className="-m-1.5 rounded-md p-2.5 text-ink-faint hover:bg-white hover:text-ink sm:m-0 sm:p-1" aria-label="Close"><X className="h-4 w-4" /></button>
      </div>
      <ul className="mt-3 space-y-1.5 text-[12.5px] text-ink-muted">
        <li>• Creates a locked, customer-facing copy of this draft. You can keep editing the draft afterwards without the customer seeing it.</li>
        {currentVersion && <li>• Version {currentVersion.version_number} will be marked <span className="font-medium text-ink">superseded</span>.</li>}
        <li>• The quote appears in {customerName}’s customer portal, where they can view, accept or decline it. The issue date becomes today.</li>
        <li>• {gmailConnected
          ? "Emailing the quote from your Gmail account is coming soon — for now, let the customer know it’s ready in their portal."
          : "Emailing the quote arrives once Gmail is connected (Settings → Integrations). For now, let the customer know it’s ready in their portal."}</li>
      </ul>
      {problems.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900 ring-1 ring-inset ring-amber-100">
          {problems.map((pr) => <li key={pr}>{pr}</li>)}
        </ul>
      )}
      {nothingNew && <p className="mt-3 text-[12.5px] text-ink-muted">Nothing has changed since version {currentVersion!.version_number}, so there’s nothing new to send.</p>}
      {error && <div className="mt-3"><FormError message={error} /></div>}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="primary" onClick={publish} disabled={pending || problems.length > 0 || nothingNew} autoFocus className="h-10 w-full sm:h-9 sm:w-auto">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{pending ? "Publishing…" : `Publish version ${nextVersion}`}
        </Button>
        <Button variant="ghost" onClick={onClose} disabled={pending} className="h-10 w-full sm:h-9 sm:w-auto">Cancel</Button>
      </div>
    </div>
  );
}

function RespondPanel({ quoteId, version, signerName, acceptanceNote, onClose, onDone }: {
  quoteId: string; version: VersionInfo; signerName: string; acceptanceNote: string;
  onClose: () => void; onDone: (d: "accepted" | "declined") => void;
}) {
  const [decision, setDecision] = useState<"accepted" | "declined">("accepted");
  const [name, setName] = useState(signerName);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (decision === "accepted" && !name.trim()) { setError("Enter the name of the person who accepted the quote."); return; }
    setPending(true);
    const res = await recordQuoteResponse(quoteId, version.id, decision, name, reason)
      .catch(() => ({ ok: false as const, error: "Couldn't reach the server. Check your connection and try again." }));
    setPending(false);
    if (!res.ok) { setError(res.error); return; }
    onDone(decision);
  }

  return (
    <form onSubmit={submit} className="mt-4 rounded-xl border border-line bg-white p-4 shadow-card sm:p-5" aria-label="Record customer response">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-ink">Record the customer’s response to version {version.version_number}</p>
          <p className="mt-0.5 text-[12.5px] text-ink-muted">Use this when the customer replied by email, phone or in person.</p>
        </div>
        <button type="button" onClick={onClose} className="-m-1.5 rounded-md p-2.5 text-ink-faint hover:bg-zinc-100 hover:text-ink sm:m-0 sm:p-1" aria-label="Close"><X className="h-4 w-4" /></button>
      </div>
      <div className="mt-3 flex rounded-lg bg-zinc-100 p-0.5 sm:inline-flex" role="radiogroup" aria-label="Decision">
        {(["accepted", "declined"] as const).map((d) => (
          <button key={d} type="button" role="radio" aria-checked={decision === d} onClick={() => setDecision(d)}
            className={cn("flex-1 rounded-md px-3 py-2 text-[13px] font-medium sm:flex-none sm:py-1.5 sm:text-[12.5px]", decision === d ? "bg-white text-ink shadow-sm" : "text-ink-muted hover:text-ink")}>
            {d === "accepted" ? "Accepted" : "Declined"}
          </button>
        ))}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="resp-name" hint={decision === "declined" ? "Optional" : undefined}>{decision === "accepted" ? "Accepted by" : "Customer name"}</Label>
          <input id="resp-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className={inputClass} placeholder="Full name" />
        </div>
        {decision === "declined" && (
          <div>
            <Label htmlFor="resp-reason" hint="Optional">Reason</Label>
            <input id="resp-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className={inputClass} placeholder="e.g. Went with another supplier" />
          </div>
        )}
      </div>
      {decision === "accepted" && <p className="mt-3 text-[12.5px] text-ink-muted">{acceptanceNote} The quote will be locked.</p>}
      {error && <div className="mt-3"><FormError message={error} /></div>}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="submit" variant={decision === "accepted" ? "primary" : "danger"} disabled={pending} className="h-10 w-full sm:h-9 sm:w-auto">
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}{decision === "accepted" ? "Record acceptance" : "Record decline"}
        </Button>
        <Button type="button" variant="ghost" onClick={onClose} disabled={pending} className="h-10 w-full sm:h-9 sm:w-auto">Cancel</Button>
      </div>
    </form>
  );
}

function PreviewModal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex justify-center overflow-y-auto bg-ink/40 px-3 py-6 backdrop-blur-[1px] sm:px-6" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} role="dialog" aria-modal="true" aria-label="Customer preview">
      <div className="w-full max-w-3xl">
        <div className="sticky top-0 z-10 mb-3 flex items-center justify-between gap-3 rounded-xl bg-white/95 px-4 py-2.5 text-[12.5px] shadow-card sm:static">
          <span className="min-w-0 text-ink-muted"><span className="font-semibold text-ink">Customer preview.</span> Exactly what the customer will see once you publish. Nothing has been sent.</span>
          <button type="button" onClick={onClose} autoFocus className="inline-flex h-10 shrink-0 items-center gap-1 rounded-md px-2 font-medium text-ink hover:bg-zinc-100 sm:h-auto sm:py-1"><X className="h-4 w-4" />Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}
