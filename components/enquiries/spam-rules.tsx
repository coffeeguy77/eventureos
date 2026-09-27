"use client";

import { useState, useTransition } from "react";
import { saveSpamRules } from "@/app/(app)/enquiries/spam-actions";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/form";
import { cn } from "@/lib/cn";

/** Automatic spam rules: on/off and the business's own spam phrases (on top of the built-in list). */
export function SpamRules({ auto, phrases, builtIn, canEdit }: { auto: boolean; phrases: string[]; builtIn: string[]; canEdit: boolean }) {
  const [on, setOn] = useState(auto);
  const [text, setText] = useState(phrases.join("\n"));
  const [showBuiltIn, setShowBuiltIn] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3 px-4 py-4 sm:px-5">
      <label className="flex items-start gap-2 text-[0.8125rem] text-ink">
        <input type="checkbox" checked={on} disabled={!canEdit} onChange={(e) => setOn(e.target.checked)} className="mt-0.5 h-4 w-4 rounded" />
        <span><span className="font-medium">Send likely junk straight to Spam.</span> Each email is scored on spam words, link shorteners, bulk-mail headers, suspicious domains,
          Gmail&apos;s own spam flag and the AI check. Real enquiry signals — a date, guest numbers, asking for a quote, your services — lower the score. Existing clients are never sent to Spam unless Gmail flags them.</span>
      </label>
      <div>
        <label htmlFor="spam-phrases" className="mb-1.5 block text-[0.7812rem] font-medium text-ink">Your own spam words <span className="font-normal text-ink-faint">— one per line</span></label>
        <textarea id="spam-phrases" value={text} onChange={(e) => setText(e.target.value)} disabled={!canEdit} rows={4}
          placeholder={"e.g.\nwholesale coffee offer\nbusiness directory listing"} className={cn(inputClass, "font-mono text-[0.7812rem]")} />
        <button type="button" onClick={() => setShowBuiltIn((v) => !v)} className="mt-1 text-[0.75rem] font-medium text-brand-700 hover:underline">
          {showBuiltIn ? "Hide" : "Show"} the {builtIn.length} built-in spam words
        </button>
        {showBuiltIn && <p className="mt-1 text-[0.75rem] leading-relaxed text-ink-muted">{builtIn.join(" · ")}</p>}
      </div>
      {msg && <p className={cn("text-[0.7812rem] font-medium", msg.ok ? "text-emerald-700" : "text-rose-700")}>{msg.text}</p>}
      {canEdit && (
        <Button size="sm" variant="primary" disabled={pending} onClick={() => start(async () => {
          const r = await saveSpamRules(on, text).catch(() => ({ ok: false as const, error: "Couldn't reach the server." }));
          setMsg(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
        })}>{pending ? "Saving…" : "Save spam rules"}</Button>
      )}
    </div>
  );
}
