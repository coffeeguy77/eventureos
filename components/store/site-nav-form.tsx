"use client";

import { useState, useTransition } from "react";
import { saveSiteNav } from "@/app/(app)/store/actions";
import { SITE_LABELS, type SiteSection } from "@/lib/site-nav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/form";

const WHAT: Record<SiteSection, string> = { lessons: "Classes page", jobs: "Job board", shop: "Coffee shop", gifts: "Gift certificates" };

export function SiteNavForm({ initial }: { initial: Record<SiteSection, string> }) {
  const [v, setV] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Card className="mt-5 space-y-3 p-5">
      <div><h2 className="font-semibold text-ink">Website menu</h2><p className="text-[0.8125rem] text-ink-muted">The bar across the top of your classes, job board, shop and gift pages. Sections that are switched off don&apos;t show.</p></div>
      <div className="grid gap-3 sm:grid-cols-4">
        {(Object.keys(SITE_LABELS) as SiteSection[]).map((k) => (
          <div key={k}><Label htmlFor={`sn-${k}`} hint={WHAT[k]}>Label</Label><Input id={`sn-${k}`} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} placeholder={SITE_LABELS[k]} /></div>
        ))}
      </div>
      <div className="flex items-center gap-3"><Button type="button" variant="primary" disabled={pending} onClick={() => start(async () => { const r = await saveSiteNav(v); setMsg(r.ok ? r.data : r.error); })}>Save menu</Button>{msg && <span className="text-[0.8125rem] text-ink-muted">{msg}</span>}</div>
    </Card>
  );
}
