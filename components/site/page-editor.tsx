"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ImageUp, Link2, Loader2, Pencil, RotateCcw, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { pageEditAccess, savePageEdits } from "@/app/site-edit-actions";

type Target = { kind: "text" | "image"; path: string; value: string; label: string; multiline: boolean; stars: boolean };

const EDIT_CSS = `
html.eos-editing [data-edit]{outline:2px dashed #ff3d8a;outline-offset:3px;border-radius:4px;cursor:text;transition:background-color .15s}
html.eos-editing [data-edit]:hover{background-color:rgba(255,61,138,.08)}
html.eos-editing [data-edit-img]{outline:3px dashed #ff3d8a;outline-offset:-3px;cursor:pointer}
html.eos-editing [data-edit-changed]{outline-style:solid!important}
html.eos-editing body{padding-top:var(--eos-bar,56px)}
html.eos-editing a,html.eos-editing button:not([data-eos-ui] *):not([data-eos-ui]){cursor:inherit}
`;

const friendly = (path: string) => path.replace(/^copy:/, "").split(/[.:]/).slice(1).join(" · ").replace(/[_-]/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase() || path;
const strip = (s: string) => s.replace(/\*([^*]+)\*/g, "$1");

async function shrink(f: File, max = 2400): Promise<Blob> {
  const src = URL.createObjectURL(f);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("Couldn't read that image.")); i.src = src; });
    const k = Math.min(1, max / img.width);
    const cv = document.createElement("canvas"); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
    cv.getContext("2d")!.drawImage(img, 0, 0, cv.width, cv.height);
    return await new Promise<Blob>((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error("Couldn't prepare the image."))), "image/jpeg", 0.86));
  } finally { URL.revokeObjectURL(src); }
}

/**
 * "Edit this page" for owners, admins and managers, on every public page. Outlines every editable piece of text and photo;
 * click one to change it, then Save. Visitors never see any of this (it checks the signed-in account first).
 */
export function PageEditor({ slug }: { slug: string }) {
  const router = useRouter();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [target, setTarget] = useState<Target | null>(null);
  const [draft, setDraft] = useState("");
  const [changes, setChanges] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  // Push the page down under the editing bar so the menus stay visible while you change them
  useEffect(() => {
    const el = barRef.current;
    if (!editing || !el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty("--eos-bar", `${el.offsetHeight}px`));
    ro.observe(el);
    return () => { ro.disconnect(); document.documentElement.style.removeProperty("--eos-bar"); };
  }, [editing]);
  const [foot, setFoot] = useState<{ key: string; tone: "dark" | "light" } | null>(null);
  const [menu, setMenu] = useState<{ key: string; tone: "dark" | "light"; section: "bar" | "float" | "hidden" | null; floatable: boolean } | null>(null);

  // The page's footer (dark or light, saved for this page only)
  useEffect(() => {
    if (!editing) return;
    const el = document.querySelector<HTMLElement>("[data-footer-key]");
    setFoot(el?.dataset.footerKey ? { key: el.dataset.footerKey, tone: el.dataset.footerTone === "light" ? "light" : "dark" } : null);
    const mn = document.querySelector<HTMLElement>("[data-master-nav]");
    const sn = document.querySelector<HTMLElement>("[data-section-nav]");
    const st = sn?.dataset.sectionStyle;
    setMenu(mn?.dataset.menuKey ? { key: mn.dataset.menuKey, tone: mn.dataset.menuTone === "dark" ? "dark" : "light",
      section: st === "bar" || st === "float" || st === "hidden" ? st : null, floatable: sn?.dataset.floatable === "1" } : null);
  }, [editing]);

  useEffect(() => {
    if (typeof document === "undefined" || !/auth-token/.test(document.cookie)) return;
    pageEditAccess(slug).then((r) => setOrgId(r?.orgId ?? null)).catch(() => undefined);
  }, [slug]);

  useEffect(() => {
    document.documentElement.classList.toggle("eos-editing", editing);
    return () => document.documentElement.classList.remove("eos-editing");
  }, [editing]);

  const open = useCallback((x: number, y: number, start: Element) => {
    const stack = [start, ...document.elementsFromPoint(x, y)];
    let el: HTMLElement | null = null;
    for (const s of stack) { const t = (s as Element).closest?.("[data-edit]") as HTMLElement | null; if (t) { el = t; break; } }
    if (el) {
      const path = el.dataset.edit!;
      const value = changes[path] ?? el.dataset.editRaw ?? el.innerText.trim();
      setTarget({ kind: "text", path, value, label: friendly(path), multiline: value.length > 60 || /\n/.test(value) || /^P$|^LI$|^DIV$/.test(el.tagName), stars: /\*/.test(value) || /^H[1-3]$/.test(el.tagName) });
      setDraft(value); setMsg(null);
      return true;
    }
    let img: HTMLElement | null = null;
    for (const s of stack) { const t = (s as Element).closest?.("[data-edit-img]") as HTMLElement | null; if (t) { img = t; break; } }
    if (img) {
      const path = img.dataset.editImg!;
      const value = changes[path] ?? (img instanceof HTMLImageElement ? img.getAttribute("src") ?? "" : "");
      setTarget({ kind: "image", path, value, label: friendly(path), multiline: false, stars: false });
      setDraft(value); setMsg(null);
      return true;
    }
    return false;
  }, [changes]);

  useEffect(() => {
    if (!editing) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Element;
      if (t.closest("[data-eos-ui]")) return;
      if (open(e.clientX, e.clientY, t) || t.closest("a,button,[role=button],summary,label")) { e.preventDefault(); e.stopPropagation(); }
    };
    const onSubmit = (e: Event) => { if (!(e.target as Element).closest("[data-eos-ui]")) e.preventDefault(); };
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    return () => { document.removeEventListener("click", onClick, true); document.removeEventListener("submit", onSubmit, true); };
  }, [editing, open]);

  const preview = (path: string, value: string) => {
    document.querySelectorAll<HTMLElement>(`[data-edit="${CSS.escape(path)}"]`).forEach((el) => {
      el.dataset.editRaw = value; el.innerText = strip(value).replace(/\s*\|\s*/g, " ") || "…"; el.dataset.editChanged = "1";
    });
    document.querySelectorAll<HTMLElement>(`[data-edit-img="${CSS.escape(path)}"]`).forEach((el) => {
      if (el instanceof HTMLImageElement) { if (value) { el.src = value; el.removeAttribute("srcset"); } } else if (value) el.style.backgroundImage = `url("${value}")`;
      el.dataset.editChanged = "1";
    });
  };

  const apply = (value: string, reset = false) => {
    if (!target) return;
    setChanges((c) => ({ ...c, [target.path]: value }));
    if (!reset || target.kind === "image") preview(target.path, value);
    else document.querySelectorAll<HTMLElement>(`[data-edit="${CSS.escape(target.path)}"]`).forEach((el) => { el.innerText = "(original wording — shows after saving)"; el.dataset.editChanged = "1"; });
    setTarget(null);
  };

  const upload = async (f: File) => {
    if (!orgId || !target) return;
    setBusy("Uploading photo…"); setMsg(null);
    try {
      const blob = await shrink(f);
      const supabase = createClient();
      const path = `${orgId}/site/${Date.now()}.jpg`;
      const { error } = await supabase.storage.from("branding").upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false });
      if (error) throw new Error(/row-level|policy/i.test(error.message) ? "Only owners and admins can upload photos." : error.message);
      setDraft(supabase.storage.from("branding").getPublicUrl(path).data.publicUrl);
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Upload failed" }); } finally { setBusy(null); }
  };

  const save = async () => {
    const edits = Object.entries(changes).map(([path, value]) => ({ path, value }));
    if (!edits.length) { setEditing(false); return; }
    setBusy("Saving…"); setMsg(null);
    const r = await savePageEdits(slug, edits).catch(() => ({ ok: false as const, error: "Couldn't reach the server — try again." }));
    setBusy(null);
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
    setChanges({}); setEditing(false); setMsg({ ok: true, text: `Saved ${r.saved} change${r.saved === 1 ? "" : "s"} — the page is updated.` });
    router.refresh();
    setTimeout(() => setMsg(null), 5000);
  };

  const setFooterTone = async (tone: "dark" | "light") => {
    if (!foot || foot.tone === tone || busy) return;
    const path = `site.footerTone.${foot.key}`;
    setFoot({ ...foot, tone });
    // Other changes waiting? Save it with them. Otherwise save now so the footer changes straight away.
    if (Object.keys(changes).length) { setChanges((c) => ({ ...c, [path]: tone })); return; }
    setBusy("Saving…"); setMsg(null);
    const r = await savePageEdits(slug, [{ path, value: tone }]).catch(() => ({ ok: false as const, error: "Couldn't reach the server — try again." }));
    setBusy(null);
    if (!r.ok) { setFoot({ ...foot }); setMsg({ ok: false, text: r.error }); return; }
    setMsg({ ok: true, text: `Footer on this page is now ${tone}.` });
    router.refresh();
    setTimeout(() => setMsg(null), 4000);
  };

  /** Save one page-layout choice now (or with the other changes if some are waiting), then refresh the page. */
  const saveLayout = async (path: string, value: string, done: string) => {
    if (busy) return;
    if (Object.keys(changes).length) { setChanges((c) => ({ ...c, [path]: value })); return; }
    setBusy("Saving…"); setMsg(null);
    const r = await savePageEdits(slug, [{ path, value }]).catch(() => ({ ok: false as const, error: "Couldn't reach the server — try again." }));
    setBusy(null);
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
    setMsg({ ok: true, text: done });
    router.refresh();
    setTimeout(() => setMsg(null), 4000);
  };
  const setMenuTone = (tone: "dark" | "light") => { if (!menu || menu.tone === tone) return; setMenu({ ...menu, tone }); void saveLayout(`site.pageMenu.${menu.key}.tone`, tone, `Menus on this page are now ${tone}.`); };
  const setSection = (section: "bar" | "float" | "hidden") => { if (!menu || menu.section === section) return; setMenu({ ...menu, section }); void saveLayout(`site.pageMenu.${menu.key}.section`, section, section === "hidden" ? "Section menu hidden on this page." : `Section menu is now ${section === "float" ? "floating" : "a bar"} on this page.`); };

  if (!orgId) return null;
  const n = Object.keys(changes).length;
  const isCopy = target?.path.startsWith("copy:");
  return (
    <div data-eos-ui className="font-sans">
      <style>{EDIT_CSS}</style>
      {!editing ? (
        <button type="button" onClick={() => { setEditing(true); setMsg(null); }}
          className="fixed bottom-5 left-5 z-[90] inline-flex h-12 items-center gap-2 rounded-full bg-[#151312] px-5 text-[0.9375rem] font-semibold text-white shadow-[0_14px_30px_-12px_rgba(0,0,0,.55)] ring-1 ring-white/10 transition hover:-translate-y-0.5">
          <Pencil className="h-4 w-4" />Edit this page
        </button>
      ) : (
        <div ref={barRef} className="fixed inset-x-0 top-0 z-[95] border-b border-white/10 bg-[#151312] text-white shadow-lg">
          <div className="mx-auto flex max-w-[1360px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
            <span className="inline-flex items-center gap-2 text-[0.9375rem] font-semibold"><Pencil className="h-4 w-4 text-[#ff6aa6]" />Editing this page</span>
            <span className="text-[0.8438rem] text-white/65">Click any outlined words or photo to change it.</span>
            <span className="flex-1" />
            {menu && (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/10 p-1 text-[0.8125rem]" role="group" aria-label="Menus on this page">
                <span className="px-2 text-white/65">Menu</span>
                {(["light", "dark"] as const).map((t) => (
                  <button key={t} type="button" onClick={() => setMenuTone(t)} aria-pressed={menu.tone === t} disabled={!!busy}
                    className={`h-7 rounded-full px-3 font-semibold capitalize transition disabled:opacity-60 ${menu.tone === t ? "bg-white text-[#151312]" : "text-white/80 hover:bg-white/10"}`}>{t}</button>
                ))}
              </span>
            )}
            {menu?.section && (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/10 p-1 text-[0.8125rem]" role="group" aria-label="Section menu on this page">
                <span className="px-2 text-white/65">Section menu</span>
                {([["bar", "Bar"], ...(menu.floatable ? [["float", "Floating"]] : []), ["hidden", "Hidden"]] as ["bar" | "float" | "hidden", string][]).map(([v, l]) => (
                  <button key={v} type="button" onClick={() => setSection(v)} aria-pressed={menu.section === v} disabled={!!busy}
                    className={`h-7 rounded-full px-3 font-semibold transition disabled:opacity-60 ${menu.section === v ? "bg-white text-[#151312]" : "text-white/80 hover:bg-white/10"}`}>{l}</button>
                ))}
              </span>
            )}
            {foot && (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/10 p-1 text-[0.8125rem]" role="group" aria-label="Footer on this page">
                <span className="px-2 text-white/65">Footer</span>
                {(["dark", "light"] as const).map((t) => (
                  <button key={t} type="button" onClick={() => void setFooterTone(t)} aria-pressed={foot.tone === t} disabled={!!busy}
                    className={`h-7 rounded-full px-3 font-semibold capitalize transition disabled:opacity-60 ${foot.tone === t ? "bg-white text-[#151312]" : "text-white/80 hover:bg-white/10"}`}>{t}</button>
                ))}
              </span>
            )}
            {n > 0 && <span className="rounded-full bg-white/10 px-3 py-1 text-[0.8125rem]">{n} unsaved change{n === 1 ? "" : "s"}</span>}
            <button type="button" onClick={() => { if (n) window.location.reload(); else setEditing(false); }}
              className="h-9 rounded-full px-4 text-[0.875rem] font-semibold text-white/80 ring-1 ring-white/20 hover:bg-white/10">{n ? "Discard" : "Done"}</button>
            {n > 0 && <button type="button" onClick={save} disabled={!!busy} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#ff3d8a] px-5 text-[0.875rem] font-semibold text-white disabled:opacity-60">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Save changes</button>}
          </div>
        </div>
      )}

      {msg && !target && (
        <div className={`fixed bottom-20 left-5 z-[96] max-w-sm rounded-xl px-4 py-3 text-[0.875rem] font-medium shadow-lg ${msg.ok ? "bg-emerald-600 text-surface" : "bg-rose-600 text-surface"}`} role="status">{msg.text}</div>
      )}

      {target && (
        <div className="fixed inset-0 z-[97] flex items-end justify-center bg-black/30 sm:items-center sm:p-6" onClick={() => setTarget(null)}>
          <div role="dialog" aria-label={`Edit ${target.label}`} onClick={(e) => e.stopPropagation()} className="w-full max-w-[560px] rounded-t-[22px] bg-white p-5 text-[#151312] shadow-2xl sm:rounded-[22px] sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[0.75rem] font-semibold uppercase tracking-[0.12em] text-[#ff3d8a]">{target.kind === "image" ? "Change photo" : "Change words"}</p>
                <p className="mt-0.5 text-[1.0625rem] font-semibold capitalize">{target.label}</p>
              </div>
              <button type="button" onClick={() => setTarget(null)} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full hover:bg-zinc-100"><X className="h-5 w-5" /></button>
            </div>

            {target.kind === "text" ? (
              <>
                {target.multiline
                  ? <textarea autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} rows={Math.min(10, Math.max(3, Math.ceil(draft.length / 60)))} className="mt-4 w-full rounded-xl border border-zinc-300 px-3.5 py-3 text-[1rem] leading-relaxed outline-none focus:border-[#ff3d8a] focus:ring-4 focus:ring-[#ff3d8a]/15" />
                  : <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") apply(draft); }} className="mt-4 h-12 w-full rounded-xl border border-zinc-300 px-3.5 text-[1rem] outline-none focus:border-[#ff3d8a] focus:ring-4 focus:ring-[#ff3d8a]/15" />}
                {target.stars && <p className="mt-2 text-[0.8125rem] text-zinc-500">Tip: put *stars* around words to make them pink. A <b>|</b> starts a new line in a heading.</p>}
              </>
            ) : (
              <div className="mt-4 space-y-3">
                {draft && <img src={draft} alt="" className="max-h-56 w-full rounded-xl bg-zinc-100 object-contain" />}
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
                <button type="button" onClick={() => fileRef.current?.click()} disabled={!!busy}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#151312] text-[0.9688rem] font-semibold text-white disabled:opacity-60">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageUp className="h-4 w-4" />}{busy ?? "Upload a photo"}
                </button>
                <label className="flex items-center gap-2 rounded-xl border border-zinc-300 px-3"><Link2 className="h-4 w-4 shrink-0 text-zinc-400" />
                  <input value={draft} onChange={(e) => setDraft(e.target.value.trim())} placeholder="…or paste a photo link (https://)" className="h-11 w-full text-[0.9375rem] outline-none" /></label>
                <p className="text-[0.8125rem] text-zinc-500">Landscape photos work best. Big photos are shrunk automatically.</p>
              </div>
            )}

            {msg && !msg.ok && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-[0.875rem] text-rose-700">{msg.text}</p>}
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => apply(draft)} disabled={!!busy || (target.kind === "text" && !draft.trim() && !isCopy)}
                className="inline-flex h-11 items-center gap-1.5 rounded-full bg-[#ff3d8a] px-6 text-[0.9375rem] font-semibold text-white disabled:opacity-50"><Check className="h-4 w-4" />Use this</button>
              {isCopy && <button type="button" onClick={() => apply("", true)} className="inline-flex h-11 items-center gap-1.5 rounded-full px-4 text-[0.875rem] font-semibold text-zinc-600 ring-1 ring-zinc-300 hover:bg-zinc-50"><RotateCcw className="h-4 w-4" />Back to original</button>}
              <span className="flex-1" />
              <span className="text-[0.75rem] text-zinc-400">Changes go live when you press Save.</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
