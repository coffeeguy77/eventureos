"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button, buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/form";
import { AppPicker } from "./app-picker";
import { createClientAccount } from "@/app/admin/client-actions";
import { PLAN_KEYS, PLAN_NAMES, type AppKey, type PlanKey } from "@/lib/apps";

const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

export function NewClientForm({ plans, businessTypes, timezones }: { plans: Record<PlanKey, AppKey[]>; businessTypes: string[]; timezones: string[] }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [type, setType] = useState("");
  const [plan, setPlan] = useState<PlanKey>("trial");
  const [tz, setTz] = useState("Australia/Sydney");
  const [owner, setOwner] = useState({ name: "", email: "" });
  const [apps, setApps] = useState<AppKey[]>(plans.trial);
  const [invite, setInvite] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; emailed: boolean; emailError: string | null } | null>(null);
  const [pending, start] = useTransition();

  if (done) {
    return (
      <Card className="p-6">
        <p className="flex items-center gap-2 text-[1rem] font-semibold text-ink"><CheckCircle2 className="h-5 w-5 text-emerald-600" />{name} is set up</p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-[0.8438rem] text-ink-muted">
          <li>{owner.email} becomes the owner as soon as they sign up or sign in with that email.</li>
          <li>{done.emailed ? "The welcome email has been sent." : done.emailError ? `The welcome email didn't go: ${done.emailError}. You can send it from the client's page.` : "No email was sent. Send the welcome email from the client's page when you're ready."}</li>
          <li>To set things up or import their data first, start a support session from Organisations.</li>
        </ul>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href={`/admin/clients/${done.id}`} className={buttonClass("primary", "md")}>Open client</Link>
          <Link href="/admin/organisations" className={buttonClass("secondary", "md")}>All organisations</Link>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><Label htmlFor="nc-name">Business name</Label><Input id="nc-name" value={name} maxLength={120} onChange={(e) => { setName(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)); }} placeholder="e.g. Hire & Events Management Canberra" /></div>
          <div><Label htmlFor="nc-slug" hint="their web address">Workspace ID</Label><Input id="nc-slug" value={slug} maxLength={60} onChange={(e) => { setSlugTouched(true); setSlug(slugify(e.target.value)); }} /><p className="mt-1 text-[0.75rem] text-ink-faint">Portal: /p/{slug || "…"}</p></div>
          <div><Label htmlFor="nc-type">Business type</Label><Select id="nc-type" value={type} onChange={(e) => setType(e.target.value)}><option value="">Choose…</option>{businessTypes.map((t) => <option key={t}>{t}</option>)}</Select></div>
          <div><Label htmlFor="nc-plan">Plan</Label><Select id="nc-plan" value={plan} onChange={(e) => { const p = e.target.value as PlanKey; setPlan(p); setApps(plans[p]); }}>{PLAN_KEYS.map((p) => <option key={p} value={p}>{PLAN_NAMES[p]}</option>)}</Select></div>
          <div><Label htmlFor="nc-tz">Timezone</Label><Select id="nc-tz" value={tz} onChange={(e) => setTz(e.target.value)}>{timezones.map((t) => <option key={t}>{t}</option>)}</Select></div>
        </div>
      </Card>
      <Card className="p-5">
        <p className="text-[0.8438rem] font-semibold text-ink">Owner</p>
        <p className="mt-0.5 text-[0.75rem] text-ink-muted">They get full control of the business. They can invite their own team.</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div><Label htmlFor="nc-oname" hint="optional">Name</Label><Input id="nc-oname" value={owner.name} maxLength={120} onChange={(e) => setOwner({ ...owner, name: e.target.value })} /></div>
          <div><Label htmlFor="nc-oemail">Email</Label><Input id="nc-oemail" type="email" value={owner.email} maxLength={200} onChange={(e) => setOwner({ ...owner, email: e.target.value })} /></div>
          <label className="flex items-center gap-2 text-[0.8125rem] text-ink sm:col-span-2"><input type="checkbox" checked={invite} onChange={(e) => setInvite(e.target.checked)} />Email them the welcome now (leave off to set things up first)</label>
        </div>
      </Card>
      <Card className="p-5">
        <p className="text-[0.8438rem] font-semibold text-ink">Apps</p>
        <p className="mb-3 mt-0.5 text-[0.75rem] text-ink-muted">On top of the core: enquiries, clients, quotes, events, calendar, invoices, payments, portal and reports. Apps outside their plan are marked as add-ons.</p>
        <AppPicker value={apps} onChange={setApps} planApps={plans[plan]} />
      </Card>
      <div className="flex flex-wrap items-center justify-end gap-3">
        {err && <p className="text-[0.8125rem] text-rose-600" role="alert">{err}</p>}
        <Button variant="primary" disabled={pending || name.trim().length < 2 || slug.length < 2 || !owner.email.includes("@")} onClick={() => start(async () => {
          setErr(null);
          const r = await createClientAccount({ name, slug, business_type: type || null, plan, timezone: tz, owner_email: owner.email, owner_name: owner.name || null, apps, send_invite: invite });
          if (r.ok) setDone(r.data); else setErr(r.error);
        })}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Create client</Button>
      </div>
    </div>
  );
}
