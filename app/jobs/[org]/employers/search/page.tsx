import Link from "next/link";
import { Award, MapPin, Search } from "lucide-react";
import { createServiceClient } from "@/lib/integrations/runtime";
import { DAY_LABEL, DAYS, EXPERIENCE, SKILLS, WORK_TYPES } from "@/lib/jobs/core";
import { approvedEmployer } from "@/lib/jobs/guard";
import { searchBaristas, unreadFor } from "@/lib/jobs/server";
import { card, inputCls } from "@/components/jobs/shell";
import { EmployerShell } from "@/components/jobs/employer-shell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Find baristas", robots: { index: false, follow: false } };

const arr = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);

export default async function SearchPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { org: slug } = await params;
  const { org, emp } = await approvedEmployer(slug);
  const sp = await searchParams;
  const q = {
    suburb: typeof sp.suburb === "string" ? sp.suburb.slice(0, 80) : emp.suburb ?? "",
    radius: Number(sp.radius) || 25, days: arr(sp.day), skills: arr(sp.skill), types: arr(sp.type), text: typeof sp.q === "string" ? sp.q.slice(0, 60) : "",
  };
  const db = createServiceClient();
  const [{ cards, center }, unread] = await Promise.all([searchBaristas(db, org, q), unreadFor(db, "employer", emp.id)]);
  const exp = (id: string | null) => EXPERIENCE.find((x) => x.id === id)?.label;
  const box = "inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[0.8125rem] ring-1 ring-line-strong has-[:checked]:bg-[var(--b)] has-[:checked]:text-[var(--on-b)] has-[:checked]:ring-[var(--b)]";

  return (
    <EmployerShell org={org} me={{ name: emp.contact_name }} active="search" unread={unread} legacy>
      <h1 className="mb-4 text-[1.625rem] font-bold tracking-tight text-ink sm:text-[2rem]">Find baristas</h1>
      <div className="grid items-start gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <form method="get" className={`${card} space-y-4 lg:sticky lg:top-6`}>
          <div><label htmlFor="s-sub" className="mb-1 block text-[0.8125rem] font-medium text-ink">Near suburb</label><input id="s-sub" name="suburb" className={inputCls} defaultValue={q.suburb} placeholder="e.g. Surry Hills" /></div>
          <div><label htmlFor="s-r" className="mb-1 block text-[0.8125rem] font-medium text-ink">Within</label>
            <select id="s-r" name="radius" className={inputCls} defaultValue={String(q.radius)}>{[5, 10, 25, 50, 100].map((r) => <option key={r} value={r}>{r} km</option>)}</select></div>
          <fieldset><legend className="mb-1.5 text-[0.8125rem] font-medium text-ink">Free on</legend>
            <div className="flex flex-wrap gap-1.5">{DAYS.map((d) => <label key={d} className={box}><input type="checkbox" name="day" value={d} defaultChecked={q.days.includes(d)} className="sr-only" />{DAY_LABEL[d]}</label>)}</div></fieldset>
          <fieldset><legend className="mb-1.5 text-[0.8125rem] font-medium text-ink">Work type</legend>
            <div className="flex flex-wrap gap-1.5">{WORK_TYPES.map((w) => <label key={w.id} className={box}><input type="checkbox" name="type" value={w.id} defaultChecked={q.types.includes(w.id)} className="sr-only" />{w.label}</label>)}</div></fieldset>
          <fieldset><legend className="mb-1.5 text-[0.8125rem] font-medium text-ink">Skills</legend>
            <div className="flex flex-wrap gap-1.5">{SKILLS.map((s) => <label key={s} className={box}><input type="checkbox" name="skill" value={s} defaultChecked={q.skills.includes(s)} className="sr-only" />{s}</label>)}</div></fieldset>
          <div><label htmlFor="s-q" className="mb-1 block text-[0.8125rem] font-medium text-ink">Keyword</label><input id="s-q" name="q" className={inputCls} defaultValue={q.text} /></div>
          <button className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--b)] font-semibold text-[var(--on-b)]"><Search className="h-4 w-4" />Search</button>
          <Link href={`/jobs/${slug}/employers/search?suburb=`} className="block text-center text-[0.8125rem] text-ink-muted hover:text-ink">Clear filters</Link>
        </form>
        <div className="min-w-0">
          <p className="mb-3 text-[0.9375rem] text-ink-muted">
            {cards.length} {cards.length === 1 ? "barista" : "baristas"}{center ? ` within ${q.radius} km of ${q.suburb}` : ""}.
            {q.suburb && !center && " We couldn't find that suburb — showing everyone."}
          </p>
          {cards.length === 0 ? <p className={`${card} text-[0.9375rem] text-ink-muted`}>No one matches yet — try a wider area or fewer filters. You can also post a job and baristas will come to you.</p> : (
            <div className="grid gap-3 sm:grid-cols-2">
              {cards.map((c) => (
                <Link key={c.id} href={`/jobs/${slug}/employers/barista/${c.id}`} className={`${card} flex gap-4 hover:bg-zinc-50`}>
                  <span className="h-16 w-16 shrink-0 overflow-hidden rounded-full bg-zinc-100 ring-1 ring-line">
                    {c.photo_url ? <img src={c.photo_url} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center text-[1.25rem] font-semibold text-ink-faint">{c.name.slice(0, 1)}</span>}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold text-ink">{c.name}</span>
                    {c.headline && <span className="block truncate text-[0.8438rem] text-ink">{c.headline}</span>}
                    <span className="mt-1 flex items-center gap-1 text-[0.8125rem] text-ink-muted"><MapPin className="h-3.5 w-3.5" />{c.suburb ?? "—"}{c.distance != null ? ` · ${c.distance} km` : ""}</span>
                    <span className="block text-[0.8125rem] text-ink-muted">{c.summary}{exp(c.experience) ? ` · ${exp(c.experience)}` : ""}</span>
                    {c.certified.length > 0 && <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--b)_12%,white)] px-2 py-0.5 text-[0.75rem] font-semibold text-ink"><Award className="h-3.5 w-3.5 text-[var(--b)]" />{org.name} certified</span>}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </EmployerShell>
  );
}
