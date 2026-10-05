"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ExternalLink, Loader2, Plus, Trash2 } from "lucide-react";
import { saveBookingSettings } from "@/app/(app)/bookings/actions";
import { LANDING_COPY, type Landing, type LandingCourse, type LandingReview } from "@/lib/bookings/core";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { PhotoUpload } from "./course-tools";

const lines = (t: string) => t.split(/\n/).map((x) => x.trim()).filter(Boolean);
const blankCourse: LandingCourse = { badge: null, points: [], bestFor: null, level: null, focus: null };

function Group({ title, hint, children, open }: { title: string; hint?: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group rounded-lg border border-line [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <span><span className="block text-[0.875rem] font-semibold text-ink">{title}</span>{hint && <span className="block text-[0.75rem] text-ink-muted">{hint}</span>}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-ink-faint transition group-open:rotate-180" />
      </summary>
      <div className="border-t border-line p-4">{children}</div>
    </details>
  );
}
const RemoveBtn = ({ onClick, label = "Remove" }: { onClick: () => void; label?: string }) => (
  <button type="button" onClick={onClick} aria-label={label} className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-lg text-ink-faint hover:bg-rose-50 hover:text-rose-700"><Trash2 className="h-4 w-4" /></button>
);

/** Everything on the public booking page: search wording, the top of the page, course selling points, reviews, photos and headings. */
export function LandingForm({ initial, pageUrl, courses, orgId }: { initial: Landing; pageUrl: string; courses: { id: string; name: string }[]; orgId: string }) {
  const router = useRouter();
  const [l, setL] = useState<Landing>(initial);
  const [hl, setHl] = useState(initial.highlights.join("\n"));
  const [notes, setNotes] = useState(initial.notes.join("\n"));
  const [locPts, setLocPts] = useState(initial.locationPoints.join("\n"));
  const [pts, setPts] = useState<Record<string, string>>(Object.fromEntries(courses.map((c) => [c.id, (initial.courses[c.id]?.points ?? []).join("\n")])));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof Landing>(k: K, v: Landing[K]) => setL((x) => ({ ...x, [k]: v }));
  const txt = (k: "title" | "description" | "headline" | "heroImage" | "eyebrow" | "phone" | "locationImage" | "giftImage") => ({ value: l[k] ?? "", onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(k, e.target.value || null) });
  const course = (id: string) => l.courses[id] ?? blankCourse;
  const setCourse = (id: string, p: Partial<LandingCourse>) => set("courses", { ...l.courses, [id]: { ...course(id), ...p } });
  const setReview = (i: number, p: Partial<LandingReview>) => set("reviews", l.reviews.map((r, j) => (j === i ? { ...r, ...p } : r)));

  const save = () => start(async () => {
    setMsg(null);
    const landing: Landing = {
      ...l,
      highlights: lines(hl), notes: lines(notes), locationPoints: lines(locPts),
      courses: Object.fromEntries(courses.map((c) => [c.id, { ...course(c.id), points: lines(pts[c.id] ?? "") }])),
      sections: l.sections.filter((x) => x.heading.trim() && x.body.trim()),
      stats: l.stats.filter((x) => x.value.trim() && x.label.trim()),
      benefits: l.benefits.filter((x) => x.title.trim() && x.body.trim()),
      reviews: l.reviews.filter((x) => x.name.trim() && x.text.trim()),
      gallery: l.gallery.filter((x) => x.image.trim()),
      copy: Object.fromEntries(Object.entries(l.copy).filter(([, v]) => v && v.trim())),
    };
    const r = await saveBookingSettings({ landing }).catch(() => ({ ok: false as const, error: "Couldn't reach the server." }));
    setMsg(r.ok ? { ok: true, text: "Saved — the page is updated." } : { ok: false, text: r.error });
    if (r.ok) router.refresh();
  });

  return (
    <div className="rounded-xl border border-line bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[0.9375rem] font-semibold text-ink">Booking page &amp; search (SEO)</h2>
        <a href={pageUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[0.8125rem] font-semibold text-brand-700 hover:underline">Open the page <ExternalLink className="h-3.5 w-3.5" /></a>
      </div>
      <p className="mt-1 text-[0.8125rem] text-ink-muted">Your booking page is a full landing page. Every section below only shows on the page when it has something in it.</p>

      <div className="mt-4 space-y-3">
        <Group title="Search and the top of the page" open>
          <div className="grid gap-4 lg:grid-cols-2">
            <div><Label hint={`${(l.title ?? "").length}/70`}>Search title</Label><Input {...txt("title")} maxLength={70} placeholder="Barista Courses Canberra | Your Business" /></div>
            <div><Label hint="put *stars* around words to colour them">Headline on the page</Label><Input {...txt("headline")} maxLength={120} placeholder="Barista courses *in Canberra*" /></div>
            <div className="lg:col-span-2"><Label hint={`${(l.description ?? "").length}/160 suggested`}>Search description</Label><Textarea {...txt("description")} maxLength={300} className="min-h-[60px]" /></div>
            <div><Label>Small line above the headline</Label><Input {...txt("eyebrow")} maxLength={60} placeholder="Hands-on, real-world training" /></div>
            <div><Label hint="leave blank to use your business phone">Phone on this page</Label><Input {...txt("phone")} maxLength={30} /></div>
            <div><Label hint="leave blank to use the first course photo">Top photo</Label><div className="flex gap-2"><Input {...txt("heroImage")} placeholder="https://…" /><PhotoUpload orgId={orgId} folder="page" onUploaded={(u) => set("heroImage", u)} /></div></div>
            <div><Label hint="one per line, up to 6">Ticks under the headline</Label><Textarea value={hl} onChange={(e) => setHl(e.target.value)} className="min-h-[96px]" placeholder={"Small class sizes\nDigital certificate"} /></div>
            <div><Label hint="one per line, up to 2 — shown on big screens">Handwritten notes on the photo</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[60px]" placeholder={"Learn. Create. Belong."} /></div>
          </div>
        </Group>

        {courses.length > 0 && (
          <Group title="Course cards" hint="Badge, what's covered, and the comparison table">
            <div className="space-y-4">
              {courses.map((c) => (
                <div key={c.id} className="rounded-lg bg-zinc-50 p-3">
                  <p className="mb-2 text-[0.8125rem] font-semibold text-ink">{c.name}</p>
                  <div className="grid gap-3 lg:grid-cols-2">
                    <div><Label>Badge</Label><Input value={course(c.id).badge ?? ""} maxLength={40} onChange={(e) => setCourse(c.id, { badge: e.target.value || null })} placeholder="Get job ready" /></div>
                    <div><Label>Best for</Label><Input value={course(c.id).bestFor ?? ""} maxLength={80} onChange={(e) => setCourse(c.id, { bestFor: e.target.value || null })} /></div>
                    <div><Label>Experience</Label><Input value={course(c.id).level ?? ""} maxLength={60} onChange={(e) => setCourse(c.id, { level: e.target.value || null })} placeholder="Beginner friendly" /></div>
                    <div><Label>Focus</Label><Input value={course(c.id).focus ?? ""} maxLength={80} onChange={(e) => setCourse(c.id, { focus: e.target.value || null })} /></div>
                    <div className="lg:col-span-2"><Label hint="one per line, up to 12 — replaces the description on the card">What&apos;s covered</Label><Textarea value={pts[c.id] ?? ""} onChange={(e) => setPts({ ...pts, [c.id]: e.target.value })} className="min-h-[110px]" /></div>
                  </div>
                </div>
              ))}
            </div>
          </Group>
        )}

        <Group title={`Trust strip (${l.stats.length})`} hint="Big numbers under the booking form — only real ones">
          <div className="space-y-2">
            {l.stats.map((s, i) => (
              <div key={i} className="flex gap-2">
                <Input className="w-32" value={s.value} maxLength={16} placeholder="280+" onChange={(e) => set("stats", l.stats.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
                <Input value={s.label} maxLength={50} placeholder="students certified" onChange={(e) => set("stats", l.stats.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                <RemoveBtn onClick={() => set("stats", l.stats.filter((_, j) => j !== i))} />
              </div>
            ))}
            {l.stats.length < 6 && <Button size="sm" onClick={() => set("stats", [...l.stats, { value: "", label: "" }])}><Plus className="h-3.5 w-3.5" />Add a number</Button>}
          </div>
        </Group>

        <Group title={`Reviews (${l.reviews.length})`} hint="Real reviews only — copied from where people left them">
          <div className="mb-3 grid gap-2 sm:grid-cols-2">
            <div><Label>Where they're from</Label><Input value={l.reviewsSource?.label ?? ""} maxLength={40} placeholder="ClassBento" onChange={(e) => set("reviewsSource", e.target.value ? { label: e.target.value, url: l.reviewsSource?.url ?? null } : null)} /></div>
            <div><Label>Link to them</Label><Input value={l.reviewsSource?.url ?? ""} placeholder="https://…" disabled={!l.reviewsSource} onChange={(e) => l.reviewsSource && set("reviewsSource", { ...l.reviewsSource, url: e.target.value || null })} /></div>
          </div>
          <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
            {l.reviews.map((r, i) => (
              <div key={i} className="rounded-lg bg-zinc-50 p-3">
                <div className="flex flex-wrap gap-2">
                  <Input className="min-w-[140px] flex-1" value={r.name} maxLength={60} placeholder="Name (e.g. Sam T.)" onChange={(e) => setReview(i, { name: e.target.value })} />
                  <Input className="w-28" value={r.date ?? ""} maxLength={20} placeholder="Aug 2026" onChange={(e) => setReview(i, { date: e.target.value || null })} />
                  <Select className="w-24" value={String(r.rating)} onChange={(e) => setReview(i, { rating: Number(e.target.value) })}>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} ★</option>)}</Select>
                  <RemoveBtn onClick={() => set("reviews", l.reviews.filter((_, j) => j !== i))} />
                </div>
                <Textarea className="mt-2 min-h-[64px]" value={r.text} maxLength={1500} onChange={(e) => setReview(i, { text: e.target.value })} />
              </div>
            ))}
          </div>
          {l.reviews.length < 120 && <Button size="sm" className="mt-2" onClick={() => set("reviews", [{ name: "", date: null, rating: 5, text: "", course: null }, ...l.reviews])}><Plus className="h-3.5 w-3.5" />Add a review</Button>}
        </Group>

        <Group title={`Why train with us (${l.benefits.length})`}>
          <div className="space-y-2">
            {l.benefits.map((b, i) => (
              <div key={i} className="rounded-lg bg-zinc-50 p-3">
                <div className="flex gap-2"><Input value={b.title} maxLength={40} placeholder="Small groups" onChange={(e) => set("benefits", l.benefits.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} /><RemoveBtn onClick={() => set("benefits", l.benefits.filter((_, j) => j !== i))} /></div>
                <Textarea className="mt-2 min-h-[56px]" value={b.body} maxLength={240} onChange={(e) => set("benefits", l.benefits.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)))} />
              </div>
            ))}
            {l.benefits.length < 8 && <Button size="sm" onClick={() => set("benefits", [...l.benefits, { title: "", body: "" }])}><Plus className="h-3.5 w-3.5" />Add a reason</Button>}
          </div>
        </Group>

        <Group title={`Photos — the experience (${l.gallery.length})`} hint="Shown once there are at least 3">
          <div className="space-y-2">
            {l.gallery.map((g, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                {g.image && <img src={g.image} alt="" className="h-[38px] w-[54px] rounded object-cover" />}
                <Input className="min-w-[160px] flex-1" value={g.image} placeholder="https://…" onChange={(e) => set("gallery", l.gallery.map((x, j) => (j === i ? { ...x, image: e.target.value } : x)))} />
                <Input className="w-44" value={g.caption ?? ""} maxLength={40} placeholder="Caption" onChange={(e) => set("gallery", l.gallery.map((x, j) => (j === i ? { ...x, caption: e.target.value || null } : x)))} />
                <RemoveBtn onClick={() => set("gallery", l.gallery.filter((_, j) => j !== i))} />
              </div>
            ))}
            {l.gallery.length < 12 && <PhotoUpload orgId={orgId} folder="page" onUploaded={(u) => set("gallery", [...l.gallery, { image: u, caption: null }])} />}
          </div>
        </Group>

        <Group title="Location and gift photos">
          <div className="grid gap-4 lg:grid-cols-2">
            <div><Label hint="one per line — only things that are true">Location points</Label><Textarea value={locPts} onChange={(e) => setLocPts(e.target.value)} className="min-h-[80px]" placeholder={"Free parking"} /></div>
            <div className="space-y-3">
              <div><Label>Photo beside the map</Label><div className="flex gap-2"><Input {...txt("locationImage")} placeholder="https://…" /><PhotoUpload orgId={orgId} folder="page" onUploaded={(u) => set("locationImage", u)} /></div></div>
              <div><Label hint="blank = a course photo">Gift voucher photo</Label><div className="flex gap-2"><Input {...txt("giftImage")} placeholder="https://…" /><PhotoUpload orgId={orgId} folder="page" onUploaded={(u) => set("giftImage", u)} /></div></div>
            </div>
          </div>
        </Group>

        <Group title="Longer text sections" hint="Good for search — shown under 'why train with us'">
          <div className="space-y-3">
            {l.sections.map((x, i) => (
              <div key={i} className="grid gap-2 rounded-lg bg-zinc-50 p-3">
                <div className="flex gap-2"><Input value={x.heading} placeholder="Heading" onChange={(e) => set("sections", l.sections.map((y, j) => (j === i ? { ...y, heading: e.target.value } : y)))} /><RemoveBtn onClick={() => set("sections", l.sections.filter((_, j) => j !== i))} /></div>
                <Textarea value={x.body} placeholder="Text (blank line = new paragraph)" className="min-h-[110px]" onChange={(e) => set("sections", l.sections.map((y, j) => (j === i ? { ...y, body: e.target.value } : y)))} />
              </div>
            ))}
            {l.sections.length < 8 && <Button size="sm" onClick={() => set("sections", [...l.sections, { heading: "", body: "" }])}><Plus className="h-3.5 w-3.5" />Add a section</Button>}
          </div>
        </Group>

        <Group title="Headings and wording" hint="Leave blank to use the wording shown in grey">
          <div className="grid gap-3 lg:grid-cols-2">
            {Object.entries(LANDING_COPY).map(([k, d]) => (
              <div key={k} className={d.long ? "lg:col-span-2" : ""}>
                <Label>{d.label}</Label>
                {d.long
                  ? <Textarea value={l.copy[k] ?? ""} placeholder={d.def} maxLength={600} className="min-h-[60px]" onChange={(e) => set("copy", { ...l.copy, [k]: e.target.value })} />
                  : <Input value={l.copy[k] ?? ""} placeholder={d.def} maxLength={120} onChange={(e) => set("copy", { ...l.copy, [k]: e.target.value })} />}
              </div>
            ))}
          </div>
        </Group>
      </div>

      {msg && <p className={cn("mt-3 text-[0.8125rem] font-medium", msg.ok ? "text-emerald-700" : "text-rose-700")}>{msg.text}</p>}
      <Button variant="primary" className="mt-4" disabled={pending} onClick={save}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Save page</Button>
    </div>
  );
}
