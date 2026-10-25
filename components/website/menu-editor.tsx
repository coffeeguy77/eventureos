"use client";
import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, ExternalLink, Eye, EyeOff, GripVertical, Monitor, Plus, RotateCcw, Smartphone, Trash2 } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/form";
import { MENU_ICON } from "@/components/site/menu-icons";
import { MENU_ICONS, internalHref, okHref, toSaved, type MenuIcon, type MenuItem } from "@/lib/site/menus";
import type { NewPage } from "@/lib/site/pages";
import { resetMenus, saveMenus, saveMenuTone } from "@/app/(app)/website/actions";

type Which = "top" | "footer";
const uid = () => `c-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const ICON_LABEL: Record<MenuIcon, string> = { events: "Events", lessons: "Classes", academy: "Online", jobs: "Jobs", shop: "Shop", coffee: "Coffee", cafe: "Café", order: "Order", table: "Table", club: "Roasting", roast: "Flame", wholesale: "Delivery", gifts: "Gift", franchise: "Franchise", info: "Info", link: "Link" };

function move<T>(list: T[], from: number, to: number) {
  if (to < 0 || to >= list.length || from === to) return list;
  const next = [...list];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}

/**
 * Website → Menus. The top menu (computer and phone) and the footer, both built automatically from what's switched on.
 * Drag (or use the arrows) to reorder, click a name to rename, the eye to show/hide, and add your own links or headings.
 */
export function MenuEditor({ slug, base, top: top0, footer: footer0, pages, tone: tone0, overrides }: { slug: string; base: string; top: MenuItem[]; footer: MenuItem[]; pages: NewPage[]; tone: "light" | "dark"; /** pages that chose their own menu colour/style */ overrides: number }) {
  const [top, setTop] = useState(top0);
  const [footer, setFooter] = useState(footer0);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [tone, setTone] = useState(tone0);
  const pickTone = (t: "light" | "dark", all = false) => start(async () => {
    const r = await saveMenuTone(t, all);
    if (r.ok) setTone(t);
    setMsg(r.ok ? { ok: true, text: r.data } : { ok: false, text: r.error });
  });

  const set = (w: Which, list: MenuItem[]) => { (w === "top" ? setTop : setFooter)(list); setDirty(true); setMsg(null); };
  const save = () => start(async () => {
    const r = await saveMenus({ top: toSaved(top), footer: toSaved(footer) });
    setMsg(r.ok ? { ok: true, text: r.data } : { ok: false, text: r.error });
    if (r.ok) setDirty(false);
  });
  const reset = (w: Which) => start(async () => {
    const r = await resetMenus(w);
    setMsg(r.ok ? { ok: true, text: `${r.data} Reloading…` } : { ok: false, text: r.error });
    if (r.ok) window.location.reload();
  });

  const bar = (
    <div className="sticky bottom-3 z-20 flex flex-wrap items-center gap-3 rounded-xl bg-white/95 p-3 shadow-lg ring-1 ring-line backdrop-blur">
      <Button variant="primary" disabled={pending || !dirty} onClick={save}>{pending ? "Saving…" : dirty ? "Save menus" : "Saved"}</Button>
      <a href={`${base}/site/${slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[0.8125rem] font-semibold text-brand-600">View website<ExternalLink className="h-3.5 w-3.5" /></a>
      {dirty && !msg && <span className="text-[0.8125rem] text-amber-700">Unsaved changes</span>}
      {msg && <span className={`text-[0.8125rem] ${msg.ok ? "text-emerald-700" : "text-rose-600"}`} role="status">{msg.text}</span>}
    </div>
  );

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Look" subtitle="The site menu and every section menu (Shop, Café, Events…) use the same font, size and spacing on every page. Choose their colour here; a page can pick its own in “Edit this page”." />
        <div className="flex flex-wrap items-center gap-3 px-5 pb-5">
          <span className="text-[0.875rem] font-medium text-ink">Menu colour</span>
          <span className="inline-flex overflow-hidden rounded-full ring-1 ring-line">
            {(["light", "dark"] as const).map((t) => (
              <button key={t} type="button" disabled={pending} aria-pressed={tone === t} onClick={() => pickTone(t)} className={`px-4 py-1.5 text-[0.8125rem] font-semibold capitalize ${tone === t ? "bg-ink text-white" : "text-ink-muted hover:text-ink"}`}>{t}</button>
            ))}
          </span>
          {overrides > 0 && <button type="button" disabled={pending} onClick={() => pickTone(tone, true)} className="text-[0.8125rem] font-semibold text-brand-600">Use this on all pages ({overrides} page{overrides === 1 ? " has" : "s have"} their own)</button>}
        </div>
      </Card>
      <MenuCard which="top" title="Top menu" subtitle="The menu across the top of every page, and the phone menu. Headings with two or more links open as a dropdown."
        items={top} onChange={(l) => set("top", l)} onReset={() => reset("top")} pages={pages} slug={slug} pending={pending} />
      <MenuCard which="footer" title="Footer" subtitle="The columns at the bottom of every page. Each heading is a column; its links sit underneath."
        items={footer} onChange={(l) => set("footer", l)} onReset={() => reset("footer")} pages={pages} slug={slug} pending={pending} />
      {bar}
    </div>
  );
}

function MenuCard({ which, title, subtitle, items, onChange, onReset, pages, slug, pending }: {
  which: Which; title: string; subtitle: string; items: MenuItem[]; onChange: (l: MenuItem[]) => void; onReset: () => void; pages: NewPage[]; slug: string; pending: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null); // "root" or a heading id
  const [drag, setDrag] = useState<{ parent: string | null; from: number } | null>(null);
  const top = which === "top";

  const update = (id: string, patch: Partial<MenuItem>, parent: string | null) => onChange(items.map((i) => {
    if (!parent) return i.id === id ? { ...i, ...patch } : i;
    return i.id === parent ? { ...i, children: i.children.map((c) => (c.id === id ? { ...c, ...patch } : c)) } : i;
  }));
  const remove = (id: string, parent: string | null) => onChange(parent ? items.map((i) => (i.id === parent ? { ...i, children: i.children.filter((c) => c.id !== id) } : i)) : items.filter((i) => i.id !== id));
  const reorder = (parent: string | null, from: number, to: number) => onChange(parent ? items.map((i) => (i.id === parent ? { ...i, children: move(i.children, from, to) } : i)) : move(items, from, to));
  const add = (parent: string | null, it: MenuItem) => { onChange(parent ? items.map((i) => (i.id === parent ? { ...i, children: [...i.children, it] } : i)) : [...items, it]); setAdding(null); if (!parent) setOpen(it.id); };

  const row = (it: MenuItem, idx: number, parent: string | null, list: MenuItem[]) => {
    const I = MENU_ICON[it.icon] ?? MENU_ICON.link;
    const hiddenByParent = parent ? items.find((p) => p.id === parent)?.hidden : false;
    const isOpen = !parent && open === it.id;
    return (
      <li key={it.id} draggable onDragStart={(e) => { e.stopPropagation(); setDrag({ parent, from: idx }); }} onDragEnd={() => setDrag(null)}
        onDragOver={(e) => { if (drag && drag.parent === parent) e.preventDefault(); }}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); if (drag && drag.parent === parent) reorder(parent, drag.from, idx); setDrag(null); }}
        className={`${parent ? "" : "rounded-lg ring-1 ring-line"} ${drag && drag.parent === parent && drag.from === idx ? "opacity-50" : ""}`}>
        <div className={`flex flex-wrap items-center gap-2 ${parent ? "py-1.5 pl-2 pr-1" : "p-2.5"} ${it.hidden || hiddenByParent ? "opacity-55" : ""}`}>
          <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-ink-faint" aria-hidden />
          <span className="flex flex-col">
            <button type="button" aria-label={`Move ${it.label} up`} disabled={idx === 0} onClick={() => reorder(parent, idx, idx - 1)} className="text-ink-faint hover:text-ink disabled:opacity-25"><ArrowUp className="h-3.5 w-3.5" /></button>
            <button type="button" aria-label={`Move ${it.label} down`} disabled={idx === list.length - 1} onClick={() => reorder(parent, idx, idx + 1)} className="text-ink-faint hover:text-ink disabled:opacity-25"><ArrowDown className="h-3.5 w-3.5" /></button>
          </span>
          {!parent ? (
            <button type="button" onClick={() => setOpen(isOpen ? null : it.id)} aria-expanded={isOpen} aria-label={isOpen ? "Close" : "Open"} className="text-ink-muted">
              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          ) : null}
          <I className="h-4 w-4 shrink-0 text-brand-600" />
          <input aria-label="Name" value={it.label} maxLength={40} onChange={(e) => update(it.id, { label: e.target.value }, parent)}
            className="min-w-[8rem] flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-[0.9375rem] font-semibold text-ink hover:border-line focus:border-brand-400 focus:outline-none" />
          {!parent && <span className="text-[0.75rem] text-ink-faint">{it.children.filter((c) => !c.hidden).length} link{it.children.filter((c) => !c.hidden).length === 1 ? "" : "s"}</span>}
          {it.auto && it.label !== it.auto.label && (
            <button type="button" title={`Back to “${it.auto.label}”`} onClick={() => update(it.id, { label: it.auto!.label }, parent)} className="p-1 text-ink-faint hover:text-ink"><RotateCcw className="h-3.5 w-3.5" /></button>
          )}
          {top && (
            <span className="inline-flex overflow-hidden rounded-full ring-1 ring-line" role="group" aria-label="Where it shows">
              <button type="button" aria-pressed={it.desktop} title="Show on computers" onClick={() => update(it.id, { desktop: !it.desktop }, parent)} className={`px-2 py-1 ${it.desktop ? "bg-ink text-white" : "text-ink-faint"}`}><Monitor className="h-3.5 w-3.5" /></button>
              <button type="button" aria-pressed={it.mobile} title="Show on phones" onClick={() => update(it.id, { mobile: !it.mobile }, parent)} className={`px-2 py-1 ${it.mobile ? "bg-ink text-white" : "text-ink-faint"}`}><Smartphone className="h-3.5 w-3.5" /></button>
            </span>
          )}
          <button type="button" aria-pressed={!it.hidden} title={it.hidden ? "Hidden — click to show" : "Showing — click to hide"} onClick={() => update(it.id, { hidden: !it.hidden }, parent)}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.75rem] font-semibold ring-1 ${it.hidden ? "text-ink-faint ring-line" : "bg-emerald-50 text-emerald-700 ring-emerald-200"}`}>
            {it.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}{it.hidden ? "Hidden" : "Showing"}
          </button>
          {it.custom && <button type="button" aria-label={`Remove ${it.label}`} onClick={() => remove(it.id, parent)} className="p-1 text-ink-faint hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>}
        </div>
        {/* Details: where it goes, the small line under it (top menu), its picture */}
        {(it.custom || (top && (isOpen || parent))) && (
          <div className={`flex flex-wrap items-center gap-2 pb-2 text-[0.8125rem] ${parent ? "pl-12" : "px-3"}`}>
            {it.custom ? <LinkPicker value={it.href} onChange={(href) => update(it.id, { href }, parent)} pages={pages} slug={slug} optional={!parent} /> : <span className="truncate text-ink-faint">{it.href}</span>}
            {top && <input aria-label="Small line under it" placeholder="Small line under it (phone & dropdown)" value={it.note} maxLength={60} onChange={(e) => update(it.id, { note: e.target.value }, parent)}
              className="min-w-[12rem] flex-1 rounded-md border border-line px-2 py-1 text-[0.8125rem]" />}
            {(top || !parent) && (
              <Select aria-label="Picture" value={it.icon} onChange={(e) => update(it.id, { icon: e.target.value as MenuIcon }, parent)} className="h-8 w-auto py-0 text-[0.8125rem]">
                {MENU_ICONS.map((k) => <option key={k} value={k}>{ICON_LABEL[k]}</option>)}
              </Select>
            )}
          </div>
        )}
        {isOpen && (
          <div className="border-t border-line px-3 pb-3 pt-1">
            <ul onDragOver={(e) => e.preventDefault()}>{it.children.map((c, j) => row(c, j, it.id, it.children))}</ul>
            {!it.children.length && <p className="py-2 text-[0.8125rem] text-ink-muted">No links under this heading yet.</p>}
            {adding === it.id
              ? <AddForm top={top} child pages={pages} slug={slug} onCancel={() => setAdding(null)} onAdd={(x) => add(it.id, x)} />
              : <button type="button" onClick={() => setAdding(it.id)} className="mt-1 inline-flex items-center gap-1 text-[0.8125rem] font-semibold text-brand-600"><Plus className="h-3.5 w-3.5" />Add a link here</button>}
          </div>
        )}
      </li>
    );
  };

  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} />
      <div className="space-y-3 px-5 pb-5">
        <ul className="space-y-2">{items.map((it, i) => row(it, i, null, items))}</ul>
        {adding === "root"
          ? <AddForm top={top} pages={pages} slug={slug} onCancel={() => setAdding(null)} onAdd={(x) => add(null, x)} />
          : (
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => setAdding("root")}><Plus className="h-4 w-4" />{top ? "Add a menu item" : "Add a column"}</Button>
              <button type="button" disabled={pending} onClick={onReset} className="text-[0.8125rem] font-semibold text-ink-muted hover:text-ink">Back to the automatic {top ? "menu" : "footer"}</button>
            </div>
          )}
        <p className="text-[0.75rem] text-ink-faint">Sections you switch on later appear at the end automatically. Built-in items can be hidden but not deleted, so nothing is lost.</p>
      </div>
    </Card>
  );
}

function LinkPicker({ value, onChange, pages, slug, optional }: { value: string; onChange: (v: string) => void; pages: NewPage[]; slug: string; optional?: boolean }) {
  const groups = [...new Set(pages.map((p) => p.group))];
  const known = pages.find((p) => internalHref(slug, p.path) === value);
  const [other, setOther] = useState(!known && !!value);
  return (
    <span className="flex min-w-[14rem] flex-1 flex-wrap items-center gap-2">
      <Select aria-label="Goes to" value={other ? "__other" : known ? value : ""} onChange={(e) => { if (e.target.value === "__other") { setOther(true); } else { setOther(false); onChange(e.target.value); } }} className="h-8 min-w-0 flex-1 py-0 text-[0.8125rem]">
        <option value="">{optional ? "No link (a heading)" : "Choose a page…"}</option>
        {groups.map((g) => <optgroup key={g} label={g}>{pages.filter((p) => p.group === g).map((p) => <option key={p.path} value={internalHref(slug, p.path)}>{p.title}</option>)}</optgroup>)}
        <option value="__other">Another address…</option>
      </Select>
      {other && <input aria-label="Address" placeholder="https://… or /page" value={value} onChange={(e) => onChange(e.target.value.trim())}
        className={`h-8 min-w-[12rem] flex-1 rounded-md border px-2 text-[0.8125rem] ${value && !okHref(value) ? "border-rose-400" : "border-line"}`} />}
    </span>
  );
}

function AddForm({ top, child, pages, slug, onAdd, onCancel }: { top: boolean; child?: boolean; pages: NewPage[]; slug: string; onAdd: (i: MenuItem) => void; onCancel: () => void }) {
  const [label, setLabel] = useState("");
  const [href, setHref] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const submit = () => {
    const l = label.trim();
    if (!l) return setErr("Give it a name.");
    if (child && !href) return setErr("Choose where it goes.");
    if (href && !okHref(href)) return setErr("Links start with https://, / (a page here), mailto: or tel:");
    onAdd({ id: uid(), label: l, href, note: "", icon: child ? "link" : top ? "info" : "info", external: /^https:/.test(href), hidden: false, desktop: true, mobile: true, custom: true, auto: null, children: [] });
  };
  return (
    <div className="space-y-2 rounded-lg bg-zinc-50 p-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_1.4fr]">
        <div><Label htmlFor="mi-name">{child ? "Link name" : top ? "Menu item name" : "Column heading"}</Label><Input id="mi-name" autoFocus value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} /></div>
        <div><Label htmlFor="mi-to" hint={child ? undefined : "leave blank for a heading with links under it"}>Goes to</Label><div className="flex"><LinkPicker value={href} onChange={setHref} pages={pages} slug={slug} optional={!child} /></div></div>
      </div>
      {err && <p className="text-[0.8125rem] text-rose-600">{err}</p>}
      <div className="flex gap-2"><Button variant="primary" size="sm" onClick={submit}>Add</Button><Button size="sm" onClick={onCancel}>Cancel</Button></div>
    </div>
  );
}
