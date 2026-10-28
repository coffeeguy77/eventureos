"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormError, Input, Label, Select, Textarea } from "@/components/ui/form";
import { PLATFORMS, PLATFORM_LABEL, SITE_STATUS } from "@/lib/nerdherd/core";
import { saveWebsite, type WebsiteInput } from "@/app/(app)/nerd-herd/actions";

export function WebsiteForm({ id, initial, clients, hosting }: {
  id: string | null; initial: WebsiteInput; clients: { id: string; name: string }[]; hosting: { id: string; domain: string }[];
}) {
  const router = useRouter();
  const [f, setF] = useState<WebsiteInput>(initial);
  const [client, setClient] = useState(clients.find((c) => c.id === initial.customer_id)?.name ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const set = (p: Partial<WebsiteInput>) => { setF((o) => ({ ...o, ...p })); setSaved(false); };
  const save = () => start(async () => {
    setError(null);
    const name = client.trim();
    const c = name ? clients.find((x) => x.name.toLowerCase() === name.toLowerCase()) : null;
    if (name && !c) { setError("Choose the client from the list, or leave it blank."); return; }
    const r = await saveWebsite(id, { ...f, customer_id: c?.id ?? null });
    if (!r.ok) { setError(r.error); return; }
    if (!id) router.push(`/nerd-herd/websites/${r.data}`); else { setSaved(true); router.refresh(); }
  });
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label htmlFor="w-domain">Domain</Label><Input id="w-domain" value={f.domain} onChange={(e) => set({ domain: e.target.value })} placeholder="example.com.au" /></div>
        <div><Label htmlFor="w-name" hint="optional">Name</Label><Input id="w-name" value={f.name ?? ""} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Online shop" /></div>
      </div>
      <div>
        <Label htmlFor="w-client" hint="optional">Client</Label>
        <Input id="w-client" list="w-clients" value={client} onChange={(e) => { setClient(e.target.value); setSaved(false); }} placeholder="Start typing a client's name" />
        <datalist id="w-clients">{clients.map((c) => <option key={c.id} value={c.name} />)}</datalist>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div><Label htmlFor="w-platform">Platform</Label><Select id="w-platform" value={f.platform ?? "wordpress"} onChange={(e) => set({ platform: e.target.value })}>{PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_LABEL[p]}</option>)}</Select></div>
        <div><Label htmlFor="w-status">Status</Label><Select id="w-status" value={f.status ?? "live"} onChange={(e) => set({ status: e.target.value })}>{Object.entries(SITE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></div>
        <div><Label htmlFor="w-launch" hint="optional">Launched</Label><Input id="w-launch" type="date" value={f.launched_on ?? ""} onChange={(e) => set({ launched_on: e.target.value })} /></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label htmlFor="w-admin" hint="optional">Admin login page</Label><Input id="w-admin" value={f.admin_url ?? ""} onChange={(e) => set({ admin_url: e.target.value })} placeholder="https://example.com.au/wp-admin" /></div>
        <div><Label htmlFor="w-host">Hosting account</Label><Select id="w-host" value={f.hosting_account_id ?? ""} onChange={(e) => set({ hosting_account_id: e.target.value || null })}><option value="">Not hosted with us</option>{hosting.map((h) => <option key={h.id} value={h.id}>{h.domain}</option>)}</Select></div>
      </div>
      <div><Label htmlFor="w-notes" hint="no passwords here">Notes</Label><Textarea id="w-notes" rows={3} value={f.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} placeholder="Theme, page builder, special plugins, who to contact…" /></div>
      <FormError message={error} />
      <div className="flex items-center gap-3">
        <Button variant="primary" disabled={pending} onClick={save}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{id ? "Save" : "Add website"}</Button>
        {saved && <span className="text-[0.8125rem] font-medium text-emerald-700">Saved.</span>}
      </div>
    </div>
  );
}
