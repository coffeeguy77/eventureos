import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/context";
import { appBaseUrl } from "@/lib/integrations/registry";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";
import { buildReport, type SiteEvent } from "@/lib/analytics/core";
import { cateringGroup, isCatering, readEvents } from "@/lib/events/core";
import { readReminders } from "@/lib/reminders/core";
import { SITE_LABELS } from "@/lib/site-nav";
import { EventsForm } from "@/components/website/events-form";
import { RemindersForm } from "@/components/website/reminders-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Website" };

const SECTION: Record<string, string> = { ...SITE_LABELS, other: "Other pages" };
const pct = (n: number) => `${Math.round(n * 100)}%`;
const PART: Record<string, string> = { hero: "Top of page", choose: "Choose cart / van / kit", how: "How it works", more: "Drinks · branding · catering", "quote-band": "Lock in your date", contact: "Contact form", included: "What's included", faq: "Questions", feature: "Featured drink", menu: "Drinks menu", options: "Branding options", why: "Why sponsor", builder: "Quote builder", "builder-kind": "Builder: what", "builder-days": "Builder: days & baristas", "builder-event": "Builder: event", "builder-extras": "Builder: extras", "builder-contact": "Builder: contact details", catering: "Catering menu" };

export default async function WebsitePage({ searchParams }: { searchParams: Promise<{ tab?: string; days?: string }> }) {
  const { supabase, org, role } = await requireOrg();
  if (!["owner", "admin", "manager"].includes(role)) redirect("/dashboard");
  const sp = await searchParams;
  const tab = sp.tab === "events" || sp.tab === "reminders" ? sp.tab : "analytics";
  const { data: o } = await supabase.from("organisations").select("settings, slug, name, timezone").eq("id", org.id).single();
  const settings = (o?.settings ?? {}) as Record<string, unknown>;

  let body: React.ReactNode;
  if (tab === "events") {
    const [{ data: pk }, { data: sv }] = await Promise.all([
      supabase.from("service_packages").select("id, name").eq("organisation_id", org.id).eq("active", true).order("position"),
      supabase.from("services").select("category").eq("organisation_id", org.id).eq("active", true).order("position"),
    ]);
    const menus = [...new Set(((sv ?? []) as { category: string | null }[]).filter((x) => isCatering(x.category)).map((x) => cateringGroup(x.category)))];
    body = <EventsForm initial={readEvents(settings)} packages={(pk ?? []) as { id: string; name: string }[]} slug={o?.slug as string} base={appBaseUrl()} menus={menus} />;
  } else if (tab === "reminders") {
    const { data: carts, error } = await supabase.from("site_carts").select("section, status, reminders_sent").eq("organisation_id", org.id).limit(5000);
    const counts: Record<string, { open: number; sent: number }> = {};
    for (const c of (carts ?? []) as { section: string; status: string; reminders_sent: number }[]) {
      const x = counts[c.section] ?? (counts[c.section] = { open: 0, sent: 0 });
      if (c.status === "open") x.open++;
      x.sent += c.reminders_sent;
    }
    body = error && /site_carts|does not exist/i.test(error.message)
      ? <p className="text-[0.875rem] text-ink-muted">Reminders need the website database update (0057_events_site.sql).</p>
      : <RemindersForm initial={readReminders(settings)} business={o?.name as string} counts={counts} />;
  } else {
    const days = [7, 30, 90].includes(Number(sp.days)) ? Number(sp.days) : 30;
    const since = new Date(Date.now() - days * 864e5);
    const { data: rows, error } = await supabase.from("site_events").select("visitor, session, kind, section, path, label, device, created_at")
      .eq("organisation_id", org.id).gte("created_at", since.toISOString()).order("created_at", { ascending: false }).limit(50000);
    const tz = (o?.timezone as string) || "Australia/Sydney";
    const dayList = Array.from({ length: Math.min(days, 30) }, (_, i) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(Date.now() - (Math.min(days, 30) - 1 - i) * 864e5)));
    const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    const r = buildReport(((rows ?? []) as SiteEvent[]).slice().reverse().map((x) => ({ ...x, day: fmt.format(new Date(x.created_at)) })), dayList);
    const maxDay = Math.max(1, ...r.daily.map((d) => d.views));
    body = error ? <p className="text-[0.875rem] text-ink-muted">Website analytics need the website database update (0057_events_site.sql).</p> : r.sessions === 0 ? (
      <Card><EmptyState title="No visits recorded yet">Visits, clicks and form use on your events, classes, shop, gift and job pages show here as they happen. Nothing personal is recorded.</EmptyState></Card>
    ) : (
      <div className="space-y-5">
        <div className="flex gap-1.5">{[7, 30, 90].map((d) => <Link key={d} href={`/website?days=${d}`} className={`rounded-full px-3 py-1 text-[0.7812rem] font-medium ${d === days ? "bg-ink text-white" : "bg-zinc-100 text-ink-muted hover:text-ink"}`}>Last {d} days</Link>)}</div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          {[["Visitors", r.visitors], ["Visits", r.sessions], ["Pages viewed", r.views], ["Contact forms sent", r.formsSent], ["Quotes & orders sent", r.quotes], ["Added to cart", r.cartAdds], ["Checkouts started", r.checkouts]].map(([l, n]) => (
            <Card key={l as string} className="p-4"><p className="text-[0.7188rem] font-medium uppercase tracking-wide text-ink-faint">{l}</p><p className="mt-1 text-[1.5rem] font-semibold tabular-nums text-ink">{n}</p></Card>
          ))}
        </div>

        <Card>
          <CardHeader title="Visits per day" subtitle="Pages viewed" />
          <div className="flex h-36 items-end gap-1 px-5 pb-5">{r.daily.map((d) => <div key={d.day} title={`${d.day}: ${d.views} pages, ${d.sessions} visits`} className="flex-1 rounded-t bg-brand-400/80" style={{ height: `${Math.max(2, (d.views / maxDay) * 100)}%` }} />)}</div>
        </Card>

        <Card>
          <CardHeader title="Where people drop off" subtitle="Of the visits to each section: how many clicked something, started a form or cart, and sent it." />
          <div className="overflow-x-auto px-5 pb-5">
            <table className="w-full min-w-[560px] text-[0.8125rem]">
              <thead><tr className="text-left text-ink-faint"><th className="py-2 font-medium">Section</th><th className="font-medium">Visits</th><th className="font-medium">Clicked</th><th className="font-medium">Started</th><th className="font-medium">Sent / checkout</th></tr></thead>
              <tbody className="divide-y divide-line">
                {r.funnels.map((f) => (
                  <tr key={f.section}>
                    <td className="py-2.5 font-medium text-ink">{SECTION[f.section] ?? f.section}</td>
                    <td className="tabular-nums">{f.sessions}</td>
                    {[f.clicked, f.started, f.submitted].map((n, i) => (
                      <td key={i}><span className="tabular-nums">{n}</span> <span className={`text-[0.75rem] ${n / Math.max(1, f.sessions) < 0.15 ? "font-semibold text-rose-600" : "text-ink-faint"}`}>{pct(n / Math.max(1, f.sessions))}</span></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader title="How far down the page people get" subtitle="Parts reached by fewer than 35% of visits are flat spots (shown once a page has 10+ visits)." />
            <div className="space-y-5 px-5 pb-5">
              {r.pages.filter((p) => p.parts.length).slice(0, 6).map((p) => (
                <div key={p.path}>
                  <p className="truncate text-[0.8125rem] font-medium text-ink">{p.path} <span className="font-normal text-ink-faint">· {p.views} views</span></p>
                  <div className="mt-2 space-y-1.5">
                    {p.parts.map((x) => (
                      <div key={x.name} className="flex items-center gap-3 text-[0.75rem]">
                        <span className="w-40 shrink-0 truncate text-ink-muted">{PART[x.name] ?? x.name}</span>
                        <span className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100"><span className={`block h-full rounded-full ${x.flat ? "bg-rose-400" : "bg-brand-400"}`} style={{ width: `${Math.round(x.share * 100)}%` }} /></span>
                        <span className={`w-10 text-right tabular-nums ${x.flat ? "font-semibold text-rose-600" : "text-ink-muted"}`}>{pct(x.share)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {!r.pages.some((p) => p.parts.length) && <p className="text-[0.8125rem] text-ink-muted">Page parts are tracked on the events pages; numbers appear as people visit.</p>}
            </div>
          </Card>
          <div className="space-y-5">
            <Card>
              <CardHeader title="What people click" />
              <ul className="divide-y divide-line px-5 pb-3 text-[0.8125rem]">
                {r.clicks.map((c) => <li key={c.section + c.label} className="flex justify-between gap-3 py-2"><span className="truncate text-ink">{c.label} <span className="text-ink-faint">· {SECTION[c.section] ?? c.section}</span></span><span className="tabular-nums text-ink-muted">{c.n}</span></li>)}
                {!r.clicks.length && <li className="py-2 text-ink-muted">No clicks yet.</li>}
              </ul>
            </Card>
            <Card>
              <CardHeader title="Where people move next" subtitle="Section to section within a visit" />
              <ul className="divide-y divide-line px-5 pb-3 text-[0.8125rem]">
                {r.flows.map((f) => <li key={f.from + f.to} className="flex justify-between py-2"><span className="text-ink">{SECTION[f.from] ?? f.from} → {SECTION[f.to] ?? f.to}</span><span className="tabular-nums text-ink-muted">{f.n}</span></li>)}
                {!r.flows.length && <li className="py-2 text-ink-muted">Most visits stay in one section so far.</li>}
              </ul>
            </Card>
            <Card>
              <CardHeader title="Last page before leaving" />
              <ul className="divide-y divide-line px-5 pb-3 text-[0.8125rem]">
                {r.exits.map((x) => <li key={x.path} className="flex justify-between gap-3 py-2"><span className="truncate text-ink">{x.path}</span><span className="tabular-nums text-ink-muted">{x.n} · {pct(x.share)}</span></li>)}
              </ul>
            </Card>
            <Card className="p-4 text-[0.8125rem] text-ink-muted">Devices: {r.devices.map((d) => `${d.name} ${pct(d.n / Math.max(1, r.sessions))}`).join(" · ")}</Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <PageHeader eyebrow="Marketing" title="Website" subtitle="How people use your public pages, your events pages, and the come-back-and-finish reminders." />
      <div className="mb-5"><Tabs baseHref="/website" active={tab} tabs={[{ key: "analytics", label: "Analytics" }, { key: "events", label: "Events pages" }, { key: "reminders", label: "Reminders" }]} /></div>
      {body}
    </>
  );
}
