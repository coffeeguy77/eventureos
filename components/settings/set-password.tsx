"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff, KeyRound, Loader2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { setMemberPassword } from "@/app/(app)/settings/actions";

/** Easy to read out over the phone: three words and a number, e.g. "Maple-River-Cloud-48". */
const WORDS = ["Maple", "River", "Cloud", "Stone", "Ocean", "Tiger", "Amber", "Cedar", "Comet", "Delta", "Ember", "Falcon", "Harbor", "Island", "Jasper", "Lemon", "Meadow", "Nova", "Orbit", "Pepper", "Quartz", "Raven", "Sierra", "Timber", "Velvet", "Willow"];
function suggest() {
  const a = new Uint32Array(4);
  crypto.getRandomValues(a);
  return `${WORDS[a[0] % WORDS.length]}-${WORDS[a[1] % WORDS.length]}-${WORDS[a[2] % WORDS.length]}-${10 + (a[3] % 90)}`;
}

/** Owners and admins: give a team member a new password (shown once, to pass on to them). */
export function SetPassword({ memberId, name }: { memberId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const save = () => start(async () => {
    setMsg(null);
    const r = await setMemberPassword(memberId, pw);
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
    setMsg({ ok: true, text: `Done — ${name} can sign in now with this password. Pass it on to them; it won't be shown again.` });
    setOpen(false);
  });
  return (
    <div className="min-w-0">
      {!open ? (
        <Button type="button" variant="ghost" size="sm" className="h-10 sm:h-8" onClick={() => { setOpen(true); setMsg(null); setPw(suggest()); }}><KeyRound className="h-3.5 w-3.5" />Set password</Button>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="relative">
            <Input aria-label={`New password for ${name}`} type={show ? "text" : "password"} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" className="h-10 w-56 pr-9 font-mono text-[0.8125rem] sm:h-8" />
            <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"} className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
          </div>
          <Button type="button" variant="ghost" size="sm" className="h-10 sm:h-8" onClick={() => setPw(suggest())} title="Suggest an easy-to-read password"><Wand2 className="h-3.5 w-3.5" /></Button>
          <Button type="button" variant="primary" size="sm" className="h-10 sm:h-8" disabled={pending || pw.length < 8} onClick={save}>{pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}Save</Button>
          <Button type="button" variant="ghost" size="sm" className="h-10 sm:h-8" onClick={() => setOpen(false)}>Cancel</Button>
        </div>
      )}
      {msg && <p role="status" className={`mt-1 max-w-sm text-[0.75rem] ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}</p>}
    </div>
  );
}
