"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AlertCircle, Calculator, Check, UtensilsCrossed, CheckCircle2, Copy, Eye, LayoutTemplate, Loader2, Mail, Plus, Reply, Send, X } from "lucide-react";
import {
  addItem, addSection, deleteItem, deleteSection, duplicateQuote, moveItem, moveSection, previewQuote,
  publishQuote, recordQuoteResponse, updateItem, updateQuoteHeader, updateSection, applyCustomerPricing, importXeroQuote,
} from "@/app/(app)/quotes/actions";
import { updateEventDetails } from "@/app/(app)/events/actions";
import { AddToCalendarButton } from "@/components/calendar/add-to-calendar";
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
import { MenuPicker } from "./menu-picker";
import type { PricedService } from "@/lib/pricing/engine";
import { QuoteDocument } from "./quote-document";
import { SendQuoteDialog } from "./send-dialog";
import { SectionEditor, type Col, type LineHelper, type SectionHandlers } from "./section-editor";
import { SaveAsTemplateButton, TemplatePicker, type TemplateChoice } from "./template-picker";
import { EmailDrawer, type DrawerThread } from "./email-drawer";
import { servesFromQuantity, servesLine } from "@/lib/quotes/line-helpers";
import type { StaffRule } from "@/lib/pricing/engine";
import type {
  ActionResult, CatalogueItem, HeaderPatch, ItemPatch, QItem, QSection, QuoteDoc, QuoteSnapshotData, VersionInfo,
} from "./types";

export interface BuilderProps {
  quote: {
    id: string; number: number; title: string; status: QuoteStatus; issue_date: string; expiry_date: string | null;
    notes: string | null; terms: string | null; has_unpublished_changes: boolean; current_version_id: string | null;
    discount_type: "percent" | "amount" | null; discount_value: number; discount_label: string | null;
  };
  currentVersion: VersionInfo | null;
  sections: QSection[];
  items: QItem[];
  catalogue: CatalogueItem[];
  docs: QuoteDoc[];
  orgId: string;
  orgName: string;
  /** Branding logo, shown on the customer preview */
  orgLogo?: string | null;
  /** The booking already has a calendar entry */
  onCalendar?: boolean;
  /** The client's quotes in Xero, newest first — can be brought into this quote */
  xeroQuotes?: XeroQuoteChoice[];
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
  pricing: { packages: PricingPackage[]; services: (PricedService & { category: string | null })[]; defaults: { start: string | null; end: string | null; guests: number | null } };
  /** The client's special pricing, e.g. ["10% off Coffee Individual"] */
  customerPricing?: string[];
  /** The job's email conversations, shown beside the quote */
  emails?: DrawerThread[];
  /** Saved templates to start from (null = templates not set up yet) */
  templates?: TemplateChoice[] | null;
  /** Opened from "Reply with quote" on an email: sending replies in that conversation. */
  replyTo?: { threadId: string; subject: string; backHref: string } | null;
}

export interface XeroQuoteChoice { id: string; number: string; reference: string | null; status: string; date: string | null; total: number; lines: number }

type Panel = null | "publish" | "respond";
type Toast = { message: string; tone: "ok" | "error"; undo?: () => void };

const SAVE_DELAY = 700;

export function QuoteBuilder(p: BuilderProps) {
  const { quote, currency } = p;
  const router = useRouter();

  // ---------------------------------------------------------------- local state
  const [sections, setSections] = useState<QSection[]>(p.sections);
  const [items, setItems] = useState<ItemDraft[]>(() => p.items.map(toDraft));
  const [title, setTitle] = useState(quote.title);
  const [expiry, setExpiry] = useState(quote.expiry_date ?? "");
  const [notes, setNotes] = useState(quote.notes ?? "");
  // Whole-quote discount
  const [discType, setDiscType] = useState<"percent" | "amount" | null>(quote.discount_type ?? null);
  const [discValue, setDiscValue] = useState(quote.discount_type ? numStr(quote.discount_value) : "");
  const [discLabel, setDiscLabel] = useState(quote.discount_label ?? "");
  const [terms, setTerms] = useState(quote.terms ?? "");
  const [localDirty, setLocalDirty] = useState(false);

  const [busy, setBusy] = useState(0);
  const [saveState, setSaveState] = useState<"idle" | "saved" | "error">("idle");
  const [toast, setToast] = useState<Toast | null>(null);
  const [addingIn, setAddingIn] = useState<string | null>(null);
  // Opened from "Reply with quote" → show their email straight away
  const [emailOpen, setEmailOpen] = useState(!!p.replyTo && !!p.emails?.length);
  const [tplOpen, setTplOpen] = useState(false);
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
    // Count the save as busy from the moment it's queued, not when it starts: otherwise, between the previous save
    // finishing and this one starting, the builder looks idle and adopts the server's (older) copy — which
    // rewrites the text being typed and throws the cursor to the end.
    setBusy((b) => b + 1);
    const next = prev.then(() => track(send(patch))).finally(() => setBusy((b) => b - 1));
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
    // Never overwrite the line or section someone is typing in right now
    const el = document.activeElement as HTMLElement | null;
    const typingItem = el?.dataset?.item ?? null;
    const typingSection = el?.dataset?.section ?? null;
    setItems((cur) => p.items.map((i) => (i.id === typingItem ? cur.find((c) => c.id === i.id) ?? toDraft(i) : toDraft(i))));
    setSections((cur) => p.sections.map((sct) => (sct.id === typingSection ? cur.find((c) => c.id === sct.id) ?? sct : sct)));
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
  const totals = useMemo(() => quoteTotals(items.map(draftNums), optionalSections, { type: discType, value: parseNum(discValue) ?? 0 }),
    [items, optionalSections, discType, discValue]);
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

  // Line helpers: hourly staff lines (barista times) and per-serve lines (hot/cold drinks)
  const helperMap = useMemo(() => {
    // Several packages can share one staff item (e.g. cart and van both use "Barista hire") with different rules
    const staff = new Map<string, { rule: StaffRule; label: string; hire: string | null }[]>();
    const serves = new Set<string>();
    for (const pk of p.pricing.packages) {
      const sid = pk.rules.staff?.service_id;
      if (sid) staff.set(sid, [...(staff.get(sid) ?? []), { rule: pk.rules.staff!, label: pk.rules.staff!.label ?? "staff", hire: pk.rules.hire?.service_id ?? null }]);
      if (pk.rules.per_serve?.service_id) serves.add(pk.rules.per_serve.service_id);
    }
    return { staff, serves, desc: new Map(p.pricing.services.map((x) => [x.id, x.description])) };
  }, [p.pricing.packages, p.pricing.services]);
  /** The staff rule for a line: the package whose hire item is in the same section (cart → cart rule), else the first package. */
  const staffRuleFor = (it: ItemDraft) => {
    const options = it.service_id ? helperMap.staff.get(it.service_id) : undefined;
    if (!options?.length) return undefined;
    const sameSection = new Set(items.filter((x) => x.section_id === it.section_id && x.service_id).map((x) => x.service_id!));
    const onQuote = new Set(items.filter((x) => x.service_id).map((x) => x.service_id!));
    return options.find((o) => o.hire && sameSection.has(o.hire)) ?? options.find((o) => o.hire && onQuote.has(o.hire)) ?? options[0];
  };
  const helperFor = (it: ItemDraft): LineHelper | null => {
    const sid = it.service_id ?? null;
    const st = staffRuleFor(it);
    const unit = (it.unit ?? "").trim().toLowerCase();
    if (st || it.details?.kind === "staff" || (!sid && /^(hour|hours|hr|hrs)$/.test(unit) && /barista|staff|hire/i.test(it.name)))
      return { kind: "staff", rule: st?.rule ?? null, label: st?.label ?? "staff", defaultStart: p.pricing.defaults.start, defaultEnd: p.pricing.defaults.end };
    if ((sid && helperMap.serves.has(sid)) || it.details?.kind === "serves")
      return { kind: "serves", base: sid ? helperMap.desc.get(sid) ?? null : null };
    return null;
  };

  const h: SectionHandlers = {
    helperFor,
    onDetails(id, details, derived) {
      const q = numStr(derived.quantity);
      setItems((all) => all.map((i) => (i.id === id ? { ...i, details, quantity: q, description: derived.description } : i)));
      queue(`i:${id}`, { details, quantity: derived.quantity, description: derived.description }, sendItem(id), SAVE_DELAY);
    },
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
      // A drinks total typed straight into Qty: it all goes on hot drinks (any cold drinks stay)
      const cur = items.find((i) => i.id === id);
      const hp = cur && field === "quantity" ? helperFor(cur) : null;
      if (cur && hp?.kind === "serves" && typeof patch.quantity === "number") {
        const prev = cur.details?.kind === "serves" ? cur.details : { kind: "serves" as const, hot: 0, cold: 0 };
        const next = servesFromQuantity(prev, patch.quantity);
        const r = servesLine(next, hp.base);
        setItems((all) => all.map((i) => (i.id === id ? { ...i, details: next, description: r.description } : i)));
        queue(`i:${id}`, { quantity: patch.quantity, details: next, description: r.description }, sendItem(id), SAVE_DELAY);
        return;
      }
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
          const restored = s ? (f === "unit_price" || f === "discount_amount" ? priceStr(s[f]) : numStr(s[f])) : "0";
          setItems((all) => all.map((i) => (i.id === id ? { ...i, [f]: restored } : i)));
        } else if (f === "unit_price" || f === "discount_amount") {
          setItems((all) => all.map((i) => (i.id === id ? { ...i, [f]: priceStr(n) } : i)));
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
        is_package: c.is_package, image_url: c.image_url, quantity: 1, service_id: c.service_id ?? null,
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
  const [menuOpen, setMenuOpen] = useState(false);
  function onTemplate(secs: QSection[], added: QItem[], name: string, missing: number) {
    setTplOpen(false);
    setSections((all) => [...all, ...secs.filter((x) => !all.some((y) => y.id === x.id))]);
    setItems((all) => [...all, ...added.filter((a) => !all.some((i) => i.id === a.id)).map(toDraft)]);
    showToast({ message: `Added the ‘${name}’ template${missing ? ` — ${missing} item${missing === 1 ? " is" : "s are"} no longer on your price list and ${missing === 1 ? "was" : "were"} left out` : ""}`, tone: missing ? "error" : "ok" }, missing ? 9000 : 5000);
  }

  function onPriced(section: QSection, added: QItem[]) {
    setPricing(false); setMenuOpen(false);
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
    <div className={cn("transition-[padding] duration-200", emailOpen && "lg:pr-[456px]")}>
      {/* ------------------------------------------------------------ header */}
      <div className="mb-5">
        <div className="mb-1 flex flex-wrap items-center gap-2 text-[0.75rem] text-ink-faint">
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
              className="-ml-2 w-full max-w-3xl rounded-lg border border-transparent bg-transparent px-2 py-0.5 text-[1.375rem] font-semibold tracking-tight text-ink hover:border-line focus:border-brand-400 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-brand-100 max-md:[&:not(#x)]:!text-[1.25rem]"
            />
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[0.8125rem] text-ink-muted">
              <Badge tone={status.tone} dot>{status.label}</Badge>
              <Link href={`/clients/${p.customer.id}`} className="font-medium text-ink hover:text-brand-700">{p.customer.name}</Link>
              <Link href={`/events/${p.event.id}?tab=quote`} className="min-w-0 break-words hover:text-brand-700">EV-{p.event.number} · {p.event.name}</Link>
              <EventDateField eventId={p.event.id} date={p.event.event_date} onError={(m) => showToast({ message: m, tone: "error" })} />
              <AddToCalendarButton eventId={p.event.id} onCalendar={!!p.onCalendar} hasDate={!!p.event.event_date} size="xs" />
              <span title="Set to the publish date each time you send">Issued {fmtDate(quote.issue_date)}</span>
              <label className="flex items-center gap-1.5">
                <span>Expires</span>
                <input
                  type="date"
                  value={expiry}
                  min={p.today}
                  onChange={(e) => { setExpiry(e.target.value); queue("h", { expiry_date: e.target.value || null }, sendHeader, 0); }}
                  aria-label="Expiry date"
                  className={cn("h-9 rounded-md border border-line bg-surface px-1.5 text-[0.7812rem] text-ink sm:h-7 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100",
                    expiry && expiry < p.today && "border-rose-300 text-rose-700")}
                />
              </label>
            </div>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <SaveIndicator busy={busy > 0} state={saveState} />
            {!!p.emails?.length && (
              <Button onClick={() => setEmailOpen((o) => !o)} aria-pressed={emailOpen} className="h-10 flex-1 basis-40 sm:h-9 sm:flex-none sm:basis-auto">
                <Mail className="h-4 w-4" />{emailOpen ? "Hide email" : "Show email"}
              </Button>
            )}
            <Button onClick={openPreview} disabled={previewLoading} className="h-10 flex-1 basis-40 sm:h-9 sm:flex-none sm:basis-auto">
              {previewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}Preview as customer
            </Button>
            <Button variant="primary" onClick={() => setPanel(panel === "publish" ? null : "publish")} aria-expanded={panel === "publish"} className="h-10 flex-1 basis-40 sm:h-9 sm:flex-none sm:basis-auto">
              {p.replyTo ? <><Reply className="h-4 w-4" />Send as reply</> : <><Send className="h-4 w-4" />{cv && !dirty ? "Email quote" : cv ? "Send update" : "Send quote"}</>}
            </Button>
          </div>
        </div>

        {/* version indicator */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {cv ? (
            dirty ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[0.75rem] font-medium text-amber-900 ring-1 ring-inset ring-amber-100">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />Draft has unpublished changes · customer sees version {cv.version_number}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[0.75rem] font-medium text-emerald-800 ring-1 ring-inset ring-emerald-100">
                <CheckCircle2 className="h-3.5 w-3.5" />Customer sees version {cv.version_number} — up to date
              </span>
            )
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 text-[0.75rem] font-medium text-ink-muted ring-1 ring-inset ring-zinc-200">
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />Not sent yet — the customer can’t see this draft
            </span>
          )}
          {canRespond && (
            <button type="button" onClick={() => setPanel(panel === "respond" ? null : "respond")} className="rounded-full px-2.5 py-2 text-[0.75rem] font-medium text-brand-700 hover:bg-brand-50 sm:py-1" aria-expanded={panel === "respond"}>
              Record acceptance / decline
            </button>
          )}
          <DuplicateButton quoteId={quote.id} onError={(m) => showToast({ message: m, tone: "error" })} />
          {p.templates && <SaveAsTemplateButton quoteId={quote.id} defaultName={quote.title} onDone={(m, ok) => showToast({ message: m, tone: ok ? "ok" : "error" }, 7000)} />}
        </div>

        {!!p.customerPricing?.length && <CustomerPricingNote quoteId={quote.id} terms={p.customerPricing} customerName={p.customer.name} editable
          onDone={(m, ok) => { showToast({ message: m, tone: ok ? "ok" : "error" }); if (ok) router.refresh(); }} />}
        {!!p.xeroQuotes?.length && <XeroQuoteImport quoteId={quote.id} quotes={p.xeroQuotes} customerName={p.customer.name} currency={currency}
          hasLines={items.some((i) => i.name.trim())} flushAll={flushAll}
          onDone={(m, ok) => { showToast({ message: m, tone: ok ? "ok" : "error" }, 7000); if (ok) router.refresh(); }} />}
        {p.replyTo && (
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-brand-50/70 px-4 py-3 text-[0.8125rem] text-brand-900 ring-1 ring-inset ring-brand-200">
            <Reply className="h-4 w-4 shrink-0 text-brand-600" />
            <span className="min-w-0 flex-1">Replying to <b className="font-semibold">“{p.replyTo.subject}”</b>. Build the quote, then press <b>Send as reply</b> — it goes into that email conversation with a PDF of the quote attached.</span>
            <Link href={p.replyTo.backHref} className="shrink-0 font-medium text-brand-700 hover:underline">Back to the email</Link>
          </div>
        )}
        {panel === "publish" && (
          <SendQuoteDialog quoteId={quote.id} flushAll={flushAll} onClose={() => setPanel(null)} replyThreadId={p.replyTo?.threadId ?? null}
            onDone={(m) => { setPanel(null); setLocalDirty(false); router.refresh(); showToast({ message: m, tone: "ok" }, 7000); }} />
        )}
        {panel === "respond" && cv && (
          <RespondPanel quoteId={quote.id} version={cv} signerName={p.signerName} acceptanceNote={p.acceptanceNote}
            onClose={() => setPanel(null)} onDone={(d) => { setPanel(null); showToast({ message: d === "accepted" ? "Acceptance recorded." : "Decline recorded.", tone: "ok" }); }} />
        )}
      </div>

      {p.nextAction}
      {!!p.emails?.length && <EmailDrawer threads={p.emails} tz={p.tz} open={emailOpen} onClose={() => setEmailOpen(false)} highlightThread={p.replyTo?.threadId ?? null} />}

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
          {tplOpen && (
            <TemplatePicker quoteId={quote.id} templates={p.templates ?? []} currency={currency} onClose={() => setTplOpen(false)} onAdded={onTemplate} />
          )}
          {menuOpen && (
            <MenuPicker quoteId={quote.id} services={p.pricing.services} guests={p.pricing.defaults.guests}
              currency={currency} onClose={() => setMenuOpen(false)} onAdded={onPriced} />
          )}
          <div className={cn("grid gap-2", p.templates ? "grid-cols-2 sm:grid-cols-4" : "sm:grid-cols-3")}>
            {p.templates && (
              <button type="button" onClick={() => { setTplOpen(true); setMenuOpen(false); setPricing(false); }}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-brand-300 bg-brand-50/40 py-3 text-[0.8125rem] font-medium text-brand-700 hover:bg-brand-50">
                <LayoutTemplate className="h-4 w-4" />Use a template
              </button>
            )}
            <button type="button" onClick={() => { setMenuOpen(true); setPricing(false); setTplOpen(false); }}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-brand-300 bg-brand-50/40 py-3 text-[0.8125rem] font-medium text-brand-700 hover:bg-brand-50">
              <UtensilsCrossed className="h-4 w-4" />Add from menu
            </button>
            <button type="button" onClick={() => { setPricing(true); setMenuOpen(false); setTplOpen(false); }}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-brand-300 bg-brand-50/40 py-3 text-[0.8125rem] font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50">
              <Calculator className="h-4 w-4" />Price a job
            </button>
            <button type="button" onClick={onAddSection}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-strong py-3 text-[0.8125rem] font-medium text-ink-muted hover:border-brand-300 hover:bg-surface hover:text-brand-700">
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
                  className={cn(inputClass, "min-h-[140px] text-[0.8125rem]")} />
              </div>
              <div>
                <Label htmlFor="q-terms">Terms &amp; conditions</Label>
                <textarea id="q-terms" value={terms} rows={6} maxLength={20000}
                  onChange={(e) => { setTerms(e.target.value); queue("h", { terms: e.target.value }, sendHeader, 1200); }}
                  onBlur={() => void flush("h")}
                  placeholder="Deposit, cancellation and payment terms…"
                  className={cn(inputClass, "min-h-[140px] text-[0.8125rem]")} />
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
            <dl className="space-y-1.5 px-5 pb-4 text-[0.8125rem]">
              {totals.quoteDiscount > 0 && <>
                <div className="flex justify-between"><dt className="text-ink-muted">Items (ex GST)</dt><dd className="tabular text-ink">{money(totals.linesSubtotal, currency)}</dd></div>
                <div className="flex justify-between"><dt className="text-emerald-800">{discLabel.trim() || "Discount"}{discType === "percent" ? ` (${parseNum(discValue) ?? 0}%)` : ""}</dt><dd className="tabular text-emerald-700">−{money(totals.quoteDiscount, currency)}</dd></div>
              </>}
              <div className="flex justify-between"><dt className="text-ink-muted">Subtotal (ex GST)</dt><dd className="tabular text-ink">{money(totals.subtotal, currency)}</dd></div>
              {totals.discount > 0 && <div className="flex justify-between"><dt className="text-ink-muted">Includes line discounts</dt><dd className="tabular text-emerald-700">−{money(totals.discount, currency)}</dd></div>}
              <div className="flex justify-between"><dt className="text-ink-muted">GST</dt><dd className="tabular text-ink">{money(totals.tax, currency)}</dd></div>
              <div className="flex items-baseline justify-between border-t border-line pt-2"><dt className="font-semibold text-ink">Total</dt><dd className="tabular text-[1.125rem] font-semibold text-ink">{money(totals.total, currency)}</dd></div>
              <div className="flex justify-between pt-1 text-[0.7812rem]">
                <dt className="text-ink-muted">Optional extras{totals.optionalCount ? ` (${totals.optionalCount})` : ""}</dt>
                <dd className="tabular text-ink-muted">{money(totals.optional, currency)}</dd>
              </div>
              <p className="text-[0.7188rem] text-ink-faint">Optional extras (inc GST) are offered to the customer but not included in the total.</p>
            </dl>
            <div className="border-t border-line px-5 py-3">
              <p className="mb-2 text-[0.7812rem] font-medium text-ink">Discount on the whole quote</p>
              <div role="radiogroup" aria-label="Whole-quote discount" className="grid grid-cols-3 gap-1 rounded-lg bg-zinc-100 p-0.5 text-[0.75rem] font-medium">
                {([[null, "None"], ["percent", "%"], ["amount", "$ amount"]] as const).map(([v, l]) => (
                  <button key={String(v)} type="button" role="radio" aria-checked={discType === v}
                    onClick={() => {
                      setDiscType(v);
                      const val = v ? parseNum(discValue) ?? 0 : 0;
                      if (!v) setDiscValue("");
                      queue("h", { discount_type: v, discount_value: val }, sendHeader, 0);
                    }}
                    className={cn("h-8 rounded-md", discType === v ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink")}>{l}</button>
                ))}
              </div>
              {discType && (
                <div className="mt-2 grid grid-cols-[1fr_1.4fr] gap-2">
                  <div className="relative">
                    <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[0.8125rem] text-ink-faint">{discType === "amount" ? "$" : "%"}</span>
                    <input value={discValue} inputMode="decimal" aria-label={discType === "amount" ? "Discount in dollars (ex GST)" : "Discount percent"}
                      onChange={(e) => {
                        setDiscValue(e.target.value);
                        const n = parseNum(e.target.value);
                        if (n != null && n >= 0 && (discType === "amount" || n <= 100)) queue("h", { discount_type: discType, discount_value: n }, sendHeader);
                      }}
                      onBlur={() => void flush("h")}
                      className={cn(inputClass, "tabular pl-6 text-right text-base sm:text-[0.8125rem]")} />
                  </div>
                  <input value={discLabel} maxLength={80} placeholder="Discount" aria-label="Discount label shown to the customer"
                    onChange={(e) => { setDiscLabel(e.target.value); queue("h", { discount_label: e.target.value }, sendHeader); }}
                    onBlur={() => void flush("h")}
                    className={cn(inputClass, "text-base sm:text-[0.8125rem]")} />
                  <p className="col-span-2 text-[0.7188rem] text-ink-faint">
                    {discType === "amount" ? "Dollars off the subtotal, before GST — GST comes down to match." : "Percentage off the subtotal, before GST."} The customer sees it as its own line.
                  </p>
                </div>
              )}
            </div>
            {cv && (
              <div className="border-t border-line px-5 py-3 text-[0.7812rem]">
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
          <QuoteDocument snap={preview} currency={currency} orgName={p.orgName} logoUrl={p.orgLogo} quoteNumber={quote.number} customerName={p.customer.name}
            eventLabel={`${p.event.name}${p.event.event_date ? ` · ${fmtDate(p.event.event_date, "long")}` : ""}`} eventDate={p.event.event_date ?? null}
            versionLabel={`${nextVersion} (preview)`} />
        </PreviewModal>
      )}
      {toast && (
        <div role="status" className={cn("fixed bottom-[calc(env(safe-area-inset-bottom)+5rem)] left-1/2 z-50 flex lg:bottom-4 w-[calc(100%-32px)] max-w-md -translate-x-1/2 items-start gap-3 rounded-xl px-4 py-3 text-[0.8125rem] shadow-pop",
          toast.tone === "error" ? "bg-danger text-white" : "bg-ink text-surface")}>
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
    <span className="order-last inline-flex w-full items-center justify-start gap-1.5 text-[0.75rem] text-ink-faint empty:hidden sm:order-none sm:w-[118px] sm:justify-end sm:empty:inline-flex" aria-live="polite">
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
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-2 text-[0.75rem] font-medium text-ink-muted hover:bg-zinc-100 sm:py-1 hover:text-ink disabled:opacity-60">
          {icon}Duplicate as new quote
        </button>
      )}
      {err && <span role="alert" className="text-[0.75rem] text-rose-700">{err}</span>}
    </>
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
    <form onSubmit={submit} className="mt-4 rounded-xl border border-line bg-surface p-4 shadow-card sm:p-5" aria-label="Record customer response">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.875rem] font-semibold text-ink">Record the customer’s response to version {version.version_number}</p>
          <p className="mt-0.5 text-[0.7812rem] text-ink-muted">Use this when the customer replied by email, phone or in person.</p>
        </div>
        <button type="button" onClick={onClose} className="-m-1.5 rounded-md p-2.5 text-ink-faint hover:bg-zinc-100 hover:text-ink sm:m-0 sm:p-1" aria-label="Close"><X className="h-4 w-4" /></button>
      </div>
      <div className="mt-3 flex rounded-lg bg-zinc-100 p-0.5 sm:inline-flex" role="radiogroup" aria-label="Decision">
        {(["accepted", "declined"] as const).map((d) => (
          <button key={d} type="button" role="radio" aria-checked={decision === d} onClick={() => setDecision(d)}
            className={cn("flex-1 rounded-md px-3 py-2 text-[0.8125rem] font-medium sm:flex-none sm:py-1.5 sm:text-[0.7812rem]", decision === d ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink")}>
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
      {decision === "accepted" && <p className="mt-3 text-[0.7812rem] text-ink-muted">{acceptanceNote} The quote will be locked.</p>}
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
    <div className="fixed inset-0 z-50 flex justify-center overflow-y-auto bg-black/40 px-3 py-6 backdrop-blur-[1px] sm:px-6" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} role="dialog" aria-modal="true" aria-label="Customer preview">
      <div className="w-full max-w-3xl">
        <div className="sticky top-0 z-10 mb-3 flex items-center justify-between gap-3 rounded-xl bg-surface/95 px-4 py-2.5 text-[0.7812rem] shadow-card sm:static">
          <span className="min-w-0 text-ink-muted"><span className="font-semibold text-ink">Customer preview.</span> Exactly what the customer will see once you publish. Nothing has been sent.</span>
          <button type="button" onClick={onClose} autoFocus className="inline-flex h-10 shrink-0 items-center gap-1 rounded-md px-2 font-medium text-ink hover:bg-zinc-100 sm:h-auto sm:py-1"><X className="h-4 w-4" />Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** "Special pricing for this client" with a button to apply it to lines added before it was set. */
function CustomerPricingNote({ quoteId, terms, customerName, editable, onDone }: { quoteId: string; terms: string[]; customerName: string; editable: boolean; onDone: (m: string, ok: boolean) => void }) {
  const [pending, start] = useTransition();
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-emerald-50/70 px-4 py-2.5 text-[0.8125rem] text-emerald-900 ring-1 ring-inset ring-emerald-200">
      <span className="min-w-0 flex-1"><b className="font-semibold">Special pricing for {customerName}:</b> {terms.join(" · ")}. New lines get it automatically.</span>
      {editable && (
        <button type="button" disabled={pending} onClick={() => start(async () => {
          const r = await applyCustomerPricing(quoteId).catch(() => ({ ok: false as const, error: "Couldn't reach the server." }));
          if (!r.ok) onDone(r.error, false);
          else onDone(r.data.updated ? `Applied to ${r.data.updated} line${r.data.updated === 1 ? "" : "s"}.` : "Every line already has it (or was priced by hand).", true);
        })} className="shrink-0 font-medium text-emerald-800 underline-offset-2 hover:underline disabled:opacity-60">
          {pending ? "Applying…" : "Apply to lines already on this quote"}
        </button>
      )}
    </div>
  );
}

/** "This client has quotes in Xero" — bring one's lines in (added, or replacing what's here) to edit and send from EventureOS. */
function XeroQuoteImport({ quoteId, quotes, customerName, currency, hasLines, flushAll, onDone }: {
  quoteId: string; quotes: XeroQuoteChoice[]; customerName: string; currency: string; hasLines: boolean;
  flushAll: () => Promise<boolean>; onDone: (m: string, ok: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState(quotes[0]?.id ?? "");
  const [pending, start] = useTransition();
  const chosen = quotes.find((x) => x.id === pick);
  const go = (replace: boolean) => start(async () => {
    if (!chosen) return;
    await flushAll();
    const r = await importXeroQuote(quoteId, chosen.id, replace).catch(() => ({ ok: false as const, error: "Couldn't reach the server." }));
    if (!r.ok) { onDone(r.error, false); return; }
    setOpen(false);
    onDone(`${replace ? "Replaced the lines with" : "Added"} ${r.data.lines} line${r.data.lines === 1 ? "" : "s"} from ${chosen.number}. Edit away — nothing was changed in Xero.`, true);
  });
  const label = (x: XeroQuoteChoice) => `${x.number}${x.reference ? ` (${x.reference})` : ""} · ${x.date ? fmtDate(x.date) : "no date"} · ${money(x.total, currency)} inc GST · ${x.status.toLowerCase()}`;
  return (
    <div className="mt-4 rounded-xl bg-sky-50/70 px-4 py-2.5 text-[0.8125rem] text-sky-900 ring-1 ring-inset ring-sky-200">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="min-w-0 flex-1"><b className="font-semibold">{customerName} has {quotes.length} quote{quotes.length === 1 ? "" : "s"} in Xero</b>{quotes[0] ? ` — latest ${quotes[0].number}, ${money(quotes[0].total, currency)}` : ""}. Bring one in to edit it here.</span>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="shrink-0 font-medium text-sky-800 underline-offset-2 hover:underline">
          {open ? "Close" : "Bring in from Xero"}
        </button>
      </div>
      {open && (
        <div className="mt-2.5 space-y-2 border-t border-sky-200 pt-2.5">
          <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Xero quote" className={cn(inputClass, "bg-surface")}>
            {quotes.map((x) => <option key={x.id} value={x.id}>{label(x)}</option>)}
          </select>
          <p className="text-[0.75rem] text-sky-800">Quantities and prices come across exactly as in Xero. Items on your price list are linked to it; anything else comes in as a one-off line.</p>
          <div className="flex flex-wrap justify-end gap-2">
            {hasLines && <Button size="sm" variant="ghost" disabled={pending || !chosen} onClick={() => go(false)}>Add below what&apos;s here</Button>}
            <Button size="sm" variant="primary" disabled={pending || !chosen} onClick={() => go(true)}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}{hasLines ? "Replace this quote's lines" : "Bring in these lines"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** The event's date, set from the quote (blank = TBC). Saved on the event, so the calendar and job stay in step. */
function EventDateField({ eventId, date, onError }: { eventId: string; date: string | null; onError: (m: string) => void }) {
  const router = useRouter();
  const [value, setValue] = useState(date ?? "");
  const [pending, start] = useTransition();
  useEffect(() => { setValue(date ?? ""); }, [date]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const save = (next: string) => {
    setValue(next);
    if (timer.current) clearTimeout(timer.current);
    if (next && !/^\d{4}-\d{2}-\d{2}$/.test(next)) return;
    if (next && next < "2000-01-01") return; // still typing the year
    timer.current = setTimeout(() => start(async () => {
      const fd = new FormData();
      fd.set("event_date", next);
      const r = await updateEventDetails(eventId, undefined, fd).catch(() => ({ error: "Couldn't reach the server." }));
      if (r?.error) { onError(r.error); setValue(date ?? ""); return; }
      router.refresh();
    }), 700);
  };
  return (
    <label className="flex items-center gap-1.5">
      <span>Event date</span>
      <input type="date" value={value} onChange={(e) => save(e.target.value)} aria-label="Event date (leave blank for TBC)"
        className="h-9 rounded-md border border-line bg-surface px-1.5 text-[0.7812rem] text-ink sm:h-7 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:opacity-60" />
      {!value && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[0.6875rem] font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">TBC</span>}
      {value && <button type="button" onClick={() => save("")} disabled={pending} className="text-[0.75rem] text-ink-faint hover:text-ink hover:underline">Set to TBC</button>}
    </label>
  );
}
