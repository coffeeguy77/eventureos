"use client";
import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, CheckCircle2, ExternalLink, Instagram, Loader2, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/form";
import { PhotoUpload } from "@/components/bookings/course-tools";
import { TIER_UNITS, type CafeSettings, type ClubTier, type Equipment, type Faq, type InfoCard, type TierUnit } from "@/lib/cafe/core";
import { disconnectInstagram, saveCafeSettings, testCafeApp } from "@/app/(app)/website/actions";

type ImgKey = "heroImage" | "coffeeImage" | "kitchenImage" | "clubImage" | "wholesaleImage";
const move = <T,>(list: T[], i: number, d: number) => { const j = i + d; if (j < 0 || j >= list.length) return list; const n = [...list]; [n[i], n[j]] = [n[j], n[i]]; return n; };
const newId = () => Math.random().toString(36).slice(2, 10);

function Row({ children, onUp, onDown, onDel }: { children: React.ReactNode; onUp: () => void; onDown: () => void; onDel: () => void }) {
  return (
    <div className="flex gap-2 rounded-lg p-3 ring-1 ring-inset ring-line">
      <div className="min-w-0 flex-1 space-y-2">{children}</div>
      <div className="flex shrink-0 flex-col gap-1">
        <button type="button" aria-label="Move up" onClick={onUp} className="grid h-7 w-7 place-items-center rounded hover:bg-zinc-100"><ArrowUp className="h-3.5 w-3.5" /></button>
        <button type="button" aria-label="Move down" onClick={onDown} className="grid h-7 w-7 place-items-center rounded hover:bg-zinc-100"><ArrowDown className="h-3.5 w-3.5" /></button>
        <button type="button" aria-label="Remove" onClick={onDel} className="grid h-7 w-7 place-items-center rounded text-rose-600 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  );
}

function CardsEditor({ value, onChange, add, titleLabel = "Heading", textLabel = "Text" }: { value: InfoCard[]; onChange: (v: InfoCard[]) => void; add: string; titleLabel?: string; textLabel?: string }) {
  return (
    <div className="space-y-2">
      {value.map((c, i) => (
        <Row key={i} onUp={() => onChange(move(value, i, -1))} onDown={() => onChange(move(value, i, 1))} onDel={() => onChange(value.filter((_, j) => j !== i))}>
          <Input aria-label={titleLabel} placeholder={titleLabel} value={c.title} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
          <Textarea aria-label={textLabel} placeholder={textLabel} rows={2} value={c.text} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
        </Row>
      ))}
      <Button type="button" size="sm" onClick={() => onChange([...value, { title: "", text: "" }])}><Plus className="h-4 w-4" />{add}</Button>
    </div>
  );
}

function FaqEditor({ value, onChange }: { value: Faq[]; onChange: (v: Faq[]) => void }) {
  return (
    <div className="space-y-2">
      {value.map((f, i) => (
        <Row key={i} onUp={() => onChange(move(value, i, -1))} onDown={() => onChange(move(value, i, 1))} onDel={() => onChange(value.filter((_, j) => j !== i))}>
          <Input aria-label="Question" placeholder="Question" value={f.q} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)))} />
          <Textarea aria-label="Answer" placeholder="Answer" rows={2} value={f.a} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))} />
        </Row>
      ))}
      <Button type="button" size="sm" onClick={() => onChange([...value, { q: "", a: "" }])}><Plus className="h-4 w-4" />Add a question</Button>
    </div>
  );
}

export function CafeForm({ initial, slug, base, orgId, ig, menu = [] }: {
  initial: CafeSettings; slug: string; base: string; orgId: string;
  /** The live menu from the app, for choosing the café page's 8 items */
  menu?: { section: string; items: { id: string; name: string; image: string | null }[] }[];
  ig: { configured: boolean; missing: string[]; connected: boolean; account: string | null; error: string | null; flash: string | null; flashOk: boolean; posts: number };
}) {
  const [v, setV] = useState<CafeSettings>(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [testing, startTest] = useTransition();
  const set = <K extends keyof CafeSettings>(k: K, val: CafeSettings[K]) => setV((x) => ({ ...x, [k]: val }));
  const save = () => start(async () => { const r = await saveCafeSettings(v); setMsg(r.ok ? { ok: true, text: r.data } : { ok: false, text: r.error }); });
  const page = (p: string) => `${base}/cafe/${slug}${p}`;

  const img = (k: ImgKey, label: string, hint?: string) => (
    <div>
      <Label htmlFor={`cf-${k}`} hint={hint}>{label}</Label>
      <div className="flex items-center gap-2">
        {v[k] && <img src={v[k]!} alt="" className="h-[38px] w-[54px] shrink-0 rounded object-cover ring-1 ring-line" />}
        <Input id={`cf-${k}`} value={v[k] ?? ""} placeholder="https://…" onChange={(e) => set(k, e.target.value || null)} />
        <PhotoUpload orgId={orgId} folder="cafe" onUploaded={(u) => set(k, u)} />
      </div>
    </div>
  );
  const sw = (k: "enabled" | "ordering" | "reservations" | "club" | "wholesale", label: string, note: string) => (
    <label className="flex items-start gap-3 rounded-lg p-3 ring-1 ring-inset ring-line">
      <input type="checkbox" className="mt-0.5 h-4 w-4" checked={v[k]} onChange={(e) => set(k, e.target.checked)} />
      <span><span className="block text-[0.875rem] font-medium text-ink">{label}</span><span className="block text-[0.8125rem] text-ink-muted">{note}</span></span>
    </label>
  );
  const setTier = (i: number, patch: Partial<ClubTier>) => set("clubTiers", v.clubTiers.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const setEq = (i: number, patch: Partial<Equipment>) => set("equipment", v.equipment.map((t, j) => (j === i ? { ...t, ...patch } : t)));

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <h2 className="font-semibold text-ink">Café pages</h2>
        <p className="mt-0.5 max-w-2xl text-[0.8125rem] text-ink-muted">Your café, online ordering, table bookings, roasting club and wholesale — under one &ldquo;Café&rdquo; item in the website menu. The menu, opening hours, orders, card payments (Square) and bookings all come from your ordering app; nothing is copied or stored here.</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {sw("enabled", "Café pages live", "Shows “Café” in the website menu")}
          {sw("ordering", "Order on the website", "Menu, cart and card payment on your site — paid into Square through the app")}
          {sw("reservations", "Table bookings on the website", "Bookings go into the app, the same as booking there")}
          {sw("club", "Roasting Club page", "Equipment, membership and join form")}
          {sw("wholesale", "Wholesale page", "Wholesale coffee with an enquiry form")}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div><Label htmlFor="cf-app" hint="Your ordering app's address">Ordering app</Label><Input id="cf-app" value={v.appUrl} placeholder="https://app.yourcafe.com.au" onChange={(e) => set("appUrl", e.target.value)} /></div>
          <Button type="button" disabled={testing || !v.appUrl} onClick={() => startTest(async () => { const r = await testCafeApp(v.appUrl); setTest(r.ok ? { ok: true, text: `Connected to ${r.data.store}: ${r.data.items} menu items${r.data.square === "sandbox" ? " (Square TEST mode)" : ""}${r.data.reservations ? ", table bookings available" : ", table bookings unavailable (the app's database is off)"}.` } : { ok: false, text: r.error }); })}>
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Test connection
          </Button>
        </div>
        {test && <p className={`mt-2 text-[0.8125rem] font-medium ${test.ok ? "text-emerald-700" : "text-rose-700"}`}>{test.text}</p>}
        {v.enabled && (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[0.8125rem] font-medium">
            {[["", "Café page"], ["/order", "Order online"], ["/reserve", "Reserve a table"], ["/roasting-club", "Roasting Club"], ["/wholesale", "Wholesale"]].map(([p, l]) => (
              <a key={p} href={page(p)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-600 hover:underline">{l}<ExternalLink className="h-3.5 w-3.5" /></a>
            ))}
          </div>
        )}
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="font-semibold text-ink">Café page</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <div><Label htmlFor="cf-ht">Heading</Label><Input id="cf-ht" value={v.heroTitle} onChange={(e) => set("heroTitle", e.target.value)} /></div>
            <div><Label htmlFor="cf-hx">Intro</Label><Textarea id="cf-hx" rows={3} value={v.heroText} onChange={(e) => set("heroText", e.target.value)} /></div>
            {img("heroImage", "Top photo", "Leave empty to use the store photo from your app")}
          </div>
          <div className="space-y-3">
            <div><Label htmlFor="cf-ct">Coffee heading</Label><Input id="cf-ct" value={v.coffeeTitle} onChange={(e) => set("coffeeTitle", e.target.value)} /></div>
            <div><Label htmlFor="cf-cx">Coffee text</Label><Textarea id="cf-cx" rows={3} value={v.coffeeText} onChange={(e) => set("coffeeText", e.target.value)} /></div>
            {img("coffeeImage", "Coffee photo")}
          </div>
          <div className="space-y-3">
            <div><Label htmlFor="cf-kt">Kitchen heading</Label><Input id="cf-kt" value={v.kitchenTitle} onChange={(e) => set("kitchenTitle", e.target.value)} /></div>
            <div><Label htmlFor="cf-kx">Kitchen text</Label><Textarea id="cf-kx" rows={3} value={v.kitchenText} onChange={(e) => set("kitchenText", e.target.value)} /></div>
            {img("kitchenImage", "Kitchen photo", "Leave empty to use a photo from your kitchen menu")}
          </div>
          <div className="space-y-3">
            <div><Label htmlFor="cf-ig" hint="Without the @">Instagram account</Label><Input id="cf-ig" value={v.instagram} placeholder="yourcafe" onChange={(e) => set("instagram", e.target.value)} /></div>
            <div><Label htmlFor="cf-igf" hint="optional — a feed you already have, e.g. from LeadPages">Instagram feed link</Label><Input id="cf-igf" value={v.igFeedUrl} placeholder="https://leadpages.com.au/api/ig-media?slug=yourcafe" onChange={(e) => set("igFeedUrl", e.target.value)} /></div>
            <div className="rounded-lg bg-zinc-50 p-3 ring-1 ring-inset ring-line">
              <p className="flex items-center gap-2 text-[0.875rem] font-medium text-ink"><Instagram className="h-4 w-4" />Instagram feed</p>
              {ig.flash && <p className={`mt-1.5 text-[0.8125rem] font-medium ${ig.flashOk ? "text-emerald-700" : "text-rose-700"}`}>{ig.flash}</p>}
              {ig.connected ? (
                <>
                  <p className="mt-1 flex items-center gap-1.5 text-[0.8125rem] text-emerald-700"><CheckCircle2 className="h-4 w-4" />Connected{ig.account ? ` as ${ig.account}` : ""} · {ig.posts} recent posts shown on the café page</p>
                  {ig.error && <p className="mt-1 text-[0.8125rem] text-rose-700">Last refresh: {ig.error}</p>}
                  <div className="mt-2 flex gap-2"><a href="/api/instagram/connect" className="text-[0.8125rem] font-medium text-brand-600 hover:underline">Reconnect</a>
                    <button type="button" className="text-[0.8125rem] font-medium text-rose-600 hover:underline" onClick={() => start(async () => { const r = await disconnectInstagram(); setMsg(r.ok ? { ok: true, text: r.data } : { ok: false, text: r.error }); })}>Disconnect</button></div>
                </>
              ) : ig.configured ? (
                <>
                  <p className="mt-1 text-[0.8125rem] text-ink-muted">Shows your latest posts on the café page. Until then it shows a “Follow us” link. Needs an Instagram business or creator account.</p>
                  <a href="/api/instagram/connect" className="mt-2 inline-flex h-[34px] items-center rounded-md bg-ink px-3 text-[0.8125rem] font-semibold text-surface">Connect Instagram</a>
                </>
              ) : (
                <p className="mt-1 text-[0.8125rem] text-ink-muted">Until Instagram is connected the café page shows a “Follow us” link. Connecting needs a Meta app first: set {ig.missing.join(", ")} in the hosting settings.</p>
              )}
            </div>
          </div>
        </div>
      </Card>

      <Card className="space-y-3 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold text-ink">“From the menu” on the café page</h2>
          <p className="text-[0.8125rem] text-ink-muted">{v.featured.length}/8 chosen{v.featured.length ? "" : " — showing the first items with photos"}</p>
        </div>
        {v.featured.length > 0 && (
          <ol className="flex flex-wrap gap-2">
            {v.featured.map((id, i) => {
              const it = menu.flatMap((s) => s.items).find((x) => x.id === id);
              return (
                <li key={id} className="inline-flex items-center gap-1 rounded-full bg-zinc-100 py-1 pl-3 pr-1 text-[0.8125rem]">
                  {i + 1}. {it?.name ?? "Not on the menu now"}
                  <button type="button" aria-label="Earlier" onClick={() => set("featured", move(v.featured, i, -1))} className="grid h-6 w-6 place-items-center rounded-full hover:bg-white"><ArrowUp className="h-3 w-3 -rotate-90" /></button>
                  <button type="button" aria-label="Remove" onClick={() => set("featured", v.featured.filter((x) => x !== id))} className="grid h-6 w-6 place-items-center rounded-full text-rose-600 hover:bg-white"><Trash2 className="h-3 w-3" /></button>
                </li>
              );
            })}
          </ol>
        )}
        {menu.length ? (
          <details className="rounded-lg ring-1 ring-inset ring-line">
            <summary className="cursor-pointer px-3 py-2 text-[0.875rem] font-medium text-ink">Choose items from your menu</summary>
            <div className="max-h-[380px] space-y-3 overflow-y-auto px-3 pb-3">
              {menu.map((sec) => (
                <div key={sec.section}>
                  <p className="text-[0.75rem] font-semibold uppercase tracking-wide text-ink-faint">{sec.section}</p>
                  <div className="mt-1 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                    {sec.items.map((it) => {
                      const on = v.featured.includes(it.id);
                      return (
                        <label key={it.id} className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-[0.8125rem] ${on ? "bg-brand-50" : "hover:bg-zinc-50"}`}>
                          <input type="checkbox" className="h-4 w-4 accent-brand-500" checked={on} disabled={!on && v.featured.length >= 8}
                            onChange={(e) => set("featured", e.target.checked ? [...v.featured, it.id].slice(0, 8) : v.featured.filter((x) => x !== it.id))} />
                          {it.image ? <img src={it.image} alt="" className="h-7 w-7 rounded object-cover" /> : <span className="h-7 w-7 rounded bg-zinc-100" />}
                          <span className="truncate">{it.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </details>
        ) : <p className="text-[0.8125rem] text-ink-muted">Your menu didn&apos;t load from the ordering app — check the app address above, then reload.</p>}
        <p className="text-[0.75rem] text-ink-muted">Items without a photo show as a neat card with an icon. Save at the bottom of the page.</p>
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="font-semibold text-ink">Roasting Club page</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <div><Label htmlFor="cf-clt">Name</Label><Input id="cf-clt" value={v.clubTitle} onChange={(e) => set("clubTitle", e.target.value)} /></div>
            <div><Label htmlFor="cf-cli">Intro</Label><Textarea id="cf-cli" rows={3} value={v.clubIntro} onChange={(e) => set("clubIntro", e.target.value)} /></div>
          </div>
          <div>{img("clubImage", "Banner photo")}</div>
        </div>

        <div>
          <p className="text-[0.875rem] font-semibold text-ink">Memberships</p>
          <p className="text-[0.8125rem] text-ink-muted">Leave a price empty to show “Enquire for pricing”. Untick “Show” to hide a membership.</p>
          <div className="mt-2 grid gap-3 lg:grid-cols-2">
            {v.clubTiers.map((t, i) => (
              <Row key={t.id} onUp={() => set("clubTiers", move(v.clubTiers, i, -1))} onDown={() => set("clubTiers", move(v.clubTiers, i, 1))} onDel={() => set("clubTiers", v.clubTiers.filter((_, j) => j !== i))}>
                <div className="grid gap-2 sm:grid-cols-[1fr_110px_130px]">
                  <Input aria-label="Membership name" placeholder="Name" value={t.name} onChange={(e) => setTier(i, { name: e.target.value })} />
                  <Input aria-label="Price" inputMode="decimal" placeholder="$ price" value={t.price ?? ""} onChange={(e) => setTier(i, { price: e.target.value === "" ? null : (e.target.value as unknown as number) })} />
                  <Select aria-label="Per" value={t.unit} onChange={(e) => setTier(i, { unit: e.target.value as TierUnit })}>{(Object.keys(TIER_UNITS) as TierUnit[]).map((u) => <option key={u} value={u}>{TIER_UNITS[u]}</option>)}</Select>
                </div>
                <Input aria-label="Tagline" placeholder="One line about it" value={t.tagline} onChange={(e) => setTier(i, { tagline: e.target.value })} />
                <Textarea aria-label="What's included" rows={4} placeholder="What's included — one per line" value={t.features.join("\n")} onChange={(e) => setTier(i, { features: e.target.value.split("\n") })} />
                <div className="flex gap-4 text-[0.8125rem]">
                  <label className="flex items-center gap-1.5"><input type="checkbox" checked={t.show} onChange={(e) => setTier(i, { show: e.target.checked })} />Show</label>
                  <label className="flex items-center gap-1.5"><input type="checkbox" checked={t.featured} onChange={(e) => setTier(i, { featured: e.target.checked })} />Highlight</label>
                </div>
              </Row>
            ))}
          </div>
          <Button type="button" size="sm" className="mt-2" onClick={() => set("clubTiers", [...v.clubTiers, { id: newId(), name: "", tagline: "", price: null, unit: "month", features: [], featured: false, show: true }])}><Plus className="h-4 w-4" />Add a membership</Button>
        </div>

        <div>
          <p className="text-[0.875rem] font-semibold text-ink">Equipment</p>
          <p className="text-[0.8125rem] text-ink-muted">Grouped on the page by the group name (e.g. Roasters, Packing &amp; labels).</p>
          <div className="mt-2 grid gap-2 lg:grid-cols-2">
            {v.equipment.map((e, i) => (
              <Row key={e.id} onUp={() => set("equipment", move(v.equipment, i, -1))} onDown={() => set("equipment", move(v.equipment, i, 1))} onDel={() => set("equipment", v.equipment.filter((_, j) => j !== i))}>
                <div className="grid gap-2 sm:grid-cols-[140px_1fr]">
                  <Input aria-label="Group" placeholder="Group" value={e.group} onChange={(x) => setEq(i, { group: x.target.value })} />
                  <Input aria-label="Name" placeholder="Name" value={e.name} onChange={(x) => setEq(i, { name: x.target.value })} />
                </div>
                <Textarea aria-label="Detail" rows={2} placeholder="What it's for" value={e.detail} onChange={(x) => setEq(i, { detail: x.target.value })} />
              </Row>
            ))}
          </div>
          <Button type="button" size="sm" className="mt-2" onClick={() => set("equipment", [...v.equipment, { id: newId(), group: v.equipment.at(-1)?.group ?? "Roasters", name: "", detail: "" }])}><Plus className="h-4 w-4" />Add equipment</Button>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <div><p className="mb-2 text-[0.875rem] font-semibold text-ink">Roast software benefits</p><CardsEditor value={v.software} onChange={(x) => set("software", x)} add="Add a benefit" /></div>
          <div><p className="mb-2 text-[0.875rem] font-semibold text-ink">Why roast with us</p><CardsEditor value={v.clubPerks} onChange={(x) => set("clubPerks", x)} add="Add a reason" /></div>
        </div>
        <div><p className="mb-2 text-[0.875rem] font-semibold text-ink">Questions</p><FaqEditor value={v.clubFaq} onChange={(x) => set("clubFaq", x)} /></div>
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="font-semibold text-ink">Wholesale page</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <div><Label htmlFor="cf-wt">Heading</Label><Input id="cf-wt" value={v.wholesaleTitle} onChange={(e) => set("wholesaleTitle", e.target.value)} /></div>
            <div><Label htmlFor="cf-wi">Intro</Label><Textarea id="cf-wi" rows={3} value={v.wholesaleIntro} onChange={(e) => set("wholesaleIntro", e.target.value)} /></div>
            {img("wholesaleImage", "Photo")}
          </div>
          <div><p className="mb-2 text-[0.875rem] font-semibold text-ink">What you get</p><CardsEditor value={v.wholesalePoints} onChange={(x) => set("wholesalePoints", x)} add="Add a point" /></div>
        </div>
        <div><p className="mb-2 text-[0.875rem] font-semibold text-ink">Questions</p><FaqEditor value={v.wholesaleFaq} onChange={(x) => set("wholesaleFaq", x)} /></div>
      </Card>

      <div className="sticky bottom-3 z-10 flex items-center gap-3 rounded-xl bg-surface/95 p-3 shadow-lg ring-1 ring-line backdrop-blur">
        <Button type="button" variant="primary" disabled={pending} onClick={save}>{pending ? "Saving…" : "Save café pages"}</Button>
        {msg && <span className={`text-[0.8125rem] font-medium ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}
