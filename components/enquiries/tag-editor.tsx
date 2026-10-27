"use client";

import { useState } from "react";
import { Plus, Tag, X } from "lucide-react";
import { setEnquiryTags } from "@/app/(app)/enquiries/tag-actions";

/** Tags on one enquiry: click × to remove, type to add (existing tags are suggested). */
export function TagEditor({ id, initial, suggestions }: { id: string; initial: string[]; suggestions: string[] }) {
  const [tags, setTags] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const save = async (next: string[]) => {
    setErr(null);
    const before = tags;
    setTags(next);
    const r = await setEnquiryTags(id, next);
    if (!r.ok) { setTags(before); setErr(r.error); } else setTags(r.tags);
  };
  const add = () => { const t = text.trim(); setText(""); setAdding(false); if (t && !tags.some((x) => x.toLowerCase() === t.toLowerCase())) void save([...tags, t]); };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Tag className="h-3.5 w-3.5 text-ink-faint" aria-hidden />
      {tags.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 rounded-full bg-brand-50 py-0.5 pl-2.5 pr-1 text-[0.75rem] font-medium text-brand-800 ring-1 ring-brand-200">
          {t}<button type="button" aria-label={`Remove tag ${t}`} onClick={() => save(tags.filter((x) => x !== t))} className="grid h-4 w-4 place-items-center rounded-full hover:bg-brand-100"><X className="h-3 w-3" /></button>
        </span>
      ))}
      {adding ? (
        <span className="flex items-center gap-1">
          <input autoFocus list={`tags-${id}`} value={text} maxLength={40} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } if (e.key === "Escape") setAdding(false); }} onBlur={add}
            placeholder="e.g. Coffee Van" aria-label="New tag" className="h-7 w-36 rounded-md border border-line-strong bg-surface px-2 text-[0.75rem] outline-none focus:border-brand-500" />
          <datalist id={`tags-${id}`}>{suggestions.filter((s) => !tags.includes(s)).map((s) => <option key={s} value={s} />)}</datalist>
        </span>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.75rem] font-medium text-ink-muted ring-1 ring-dashed ring-line hover:text-ink"><Plus className="h-3 w-3" />{tags.length ? "Tag" : "Add a tag"}</button>
      )}
      {err && <span className="text-[0.75rem] text-rose-600">{err}</span>}
    </div>
  );
}
