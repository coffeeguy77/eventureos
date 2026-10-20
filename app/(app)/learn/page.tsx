import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, CheckCircle2, ExternalLink } from "lucide-react";
import { canManage, requireOrg } from "@/lib/context";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";
import { Kpi } from "@/components/records/kpi";
import { money } from "@/lib/format";
import { aiConfigured } from "@/lib/ai/claude";
import { appBaseUrl } from "@/lib/integrations/registry";
import { courseOrder, hireSplit, liveAccess, PLAN_LABEL, priceStory, readLearnSettings, readQuiz, readRule, ruleText, type AccessRow } from "@/lib/learn/core";
import pack from "@/lib/learn/packs/bean-culture.json";
import {
  ActiveToggle, AddLesson, ChallengeEditor, EndAccess, GiveAccess, HireActions, ImportPack, LearnSettingsForm, LessonEditor, LevelEditor, MarketplaceSettings, ModuleEditor, VenueRow,
} from "@/components/learn/admin";
import { LessonBody } from "@/components/academy/lesson-body";

export const dynamic = "force-dynamic";
export const metadata = { title: "Learn" };

const TABS = [
  { key: "overview", label: "Overview" }, { key: "lessons", label: "Lessons" }, { key: "learners", label: "Learners" }, { key: "sales", label: "Plans & pricing" },
  { key: "rooms", label: "Training rooms" }, { key: "trainer", label: "Trainer manual" }, { key: "extras", label: "Badges & challenges" },
];
const missing = (e: { message?: string; code?: string } | null) => !!e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|Could not find the table/i.test(e.message ?? ""));
const dt = (iso: string | null, tz: string) => (iso ? new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: tz }) : "—");

export default async function LearnPage({ searchParams }: { searchParams: Promise<{ tab?: string; level?: string; module?: string; lesson?: string; t?: string }> }) {
  const { supabase, org, role } = await requireOrg();
  if (!canManage(role)) redirect("/dashboard");
  const sp = await searchParams;
  const tab = TABS.some((t) => t.key === sp.tab) ? sp.tab! : "overview";
  const o = org as { id: string; slug: string; name: string; timezone?: string; currency?: string; settings?: unknown };
  const tz = o.timezone ?? "Australia/Sydney", cur = o.currency ?? "AUD";
  const $ = (n: number) => money(n, cur);
  const s = readLearnSettings(o.settings);
  const publicUrl = `${appBaseUrl()}/academy/${o.slug}`;

  const probe = await supabase.from("learn_levels").select("id", { count: "exact", head: true }).eq("organisation_id", o.id);
  const header = (
    <PageHeader eyebrow="Online barista course" title="Learn" subtitle="The online course moved over from the Replit app: lessons and quizzes, XP, badges, leaderboard, roast simulator, AI coach, paid access and the training-room marketplace."
      actions={<a href={publicUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-[0.8125rem] font-medium ring-1 ring-inset ring-line-strong hover:bg-zinc-50">Open the learner site<ExternalLink className="h-3.5 w-3.5" /></a>} />
  );
  if (missing(probe.error)) {
    return <>{header}<Card className="p-5"><p className="flex items-center gap-2 text-[0.875rem] font-semibold text-ink"><AlertTriangle className="h-4 w-4 text-amber-600" />One database update to run first</p><p className="mt-1 text-[0.8125rem] text-ink-muted">Run <span className="font-mono">0063_learn.sql</span> in Supabase → SQL editor, then come back here and import the course.</p></Card></>;
  }
  const imported = (probe.count ?? 0) > 0;
  const tabs = <div className="mb-5"><Tabs baseHref="/learn" active={tab} tabs={TABS} /></div>;
  const [{ data: stripe }, { data: courses }] = await Promise.all([
    supabase.from("integrations").select("status").eq("organisation_id", o.id).eq("provider", "stripe").maybeSingle(),
    supabase.from("booking_courses").select("id, name").eq("organisation_id", o.id).eq("active", true).order("position"),
  ]);
  const stripeReady = stripe?.status === "connected";

  /* ---------------------------------------------------------------- overview */
  if (tab === "overview") {
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const [acc, pays, prog, learners] = await Promise.all([
      supabase.from("learn_access").select("id, plan, status, starts_at, ends_at, renews, price, created_at, student:booking_students(name, email)").eq("organisation_id", o.id).neq("status", "pending").order("created_at", { ascending: false }).limit(500),
      supabase.from("learn_payments").select("amount, paid_at").eq("organisation_id", o.id).gte("paid_at", monthStart.toISOString()),
      supabase.from("learn_progress").select("id", { count: "exact", head: true }).eq("organisation_id", o.id).gte("completed_at", new Date(Date.now() - 7 * 86400e3).toISOString()),
      supabase.from("learn_learners").select("id", { count: "exact", head: true }).eq("organisation_id", o.id),
    ]);
    const rows = (acc.data ?? []) as unknown as (AccessRow & { price: number; created_at: string; student: { name: string; email: string | null } | null })[];
    const active = rows.filter((r) => liveAccess([r]));
    const byPlan = (p: string) => active.filter((r) => r.plan === p).length;
    const revenue = ((pays.data ?? []) as { amount: number }[]).reduce((t, p) => t + Number(p.amount), 0);
    const checks = [
      { ok: true, text: "Database update run" },
      { ok: imported, text: imported ? "Course imported" : "Import the course (Lessons tab)" },
      { ok: stripeReady, text: stripeReady ? "Stripe connected" : "Connect Stripe (Settings → Integrations) to take payments" },
      { ok: aiConfigured(), text: aiConfigured() ? "AI coach key set" : "AI coach needs ANTHROPIC_API_KEY in Vercel" },
      { ok: s.enabled, text: s.enabled ? "Selling is ON" : "Selling is OFF — switch on in Plans & pricing when ready" },
    ];
    return (
      <>{header}{tabs}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="Learners with access" value={active.length} sub={`${byPlan("with_course")} with course · ${byPlan("monthly")} monthly · ${byPlan("yearly")} yearly · ${byPlan("comp")} free`} />
          <Kpi label="Course sales this month" value={$(revenue)} />
          <Kpi label="Lessons finished (7 days)" value={prog.count ?? 0} />
          <Kpi label="People who've opened it" value={learners.count ?? 0} />
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Card>
            <CardHeader title="Recent passes" />
            {rows.length === 0 ? <EmptyState title="No one has access yet">Passes bought online, added at barista course checkout or given by you show here.</EmptyState> : (
              <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-[0.8125rem]"><tbody className="divide-y divide-line">
                {rows.slice(0, 15).map((r) => (
                  <tr key={r.id}><td className="px-5 py-2 text-ink">{r.student?.name ?? "—"}<span className="block text-[0.75rem] text-ink-faint">{r.student?.email}</span></td><td className="px-2 py-2 text-ink-muted">{PLAN_LABEL[r.plan]}</td><td className="px-2 py-2 text-ink-muted">{r.status.replace("_", " ")}</td><td className="px-2 py-2 text-ink-muted">to {dt(r.ends_at, tz)}</td><td className="px-5 py-2 text-right tabular">{Number(r.price) > 0 ? $(r.price) : "Free"}</td></tr>
                ))}
              </tbody></table></div>
            )}
          </Card>
          <Card className="p-5">
            <p className="text-[0.8438rem] font-semibold text-ink">Set-up</p>
            <ul className="mt-2 space-y-1.5 text-[0.8125rem]">{checks.map((c) => <li key={c.text} className="flex items-start gap-2">{c.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />}<span className={c.ok ? "text-ink-muted" : "text-ink"}>{c.text}</span></li>)}</ul>
            <p className="mt-4 text-[0.75rem] text-ink-muted">Learner site: <a className="font-medium text-brand-700 hover:underline" href={publicUrl} target="_blank" rel="noreferrer">{publicUrl.replace(/^https?:\/\//, "")}</a></p>
          </Card>
        </div>
      </>
    );
  }

  /* ---------------------------------------------------------------- lessons */
  if (tab === "lessons") {
    if (!imported) return <>{header}{tabs}<Card className="p-5"><ImportPack counts={{ levels: pack.levels.length, modules: pack.modules.length, lessons: pack.lessons.length, trainer: pack.trainer.length }} /></Card></>;
    const [lv, md, ls] = await Promise.all([
      supabase.from("learn_levels").select("id, key, number, title, description, min_xp, xp_reward, position, published, certificate_title").eq("organisation_id", o.id).order("number"),
      supabase.from("learn_modules").select("id, key, level_id, title, description, xp_reward, position, published").eq("organisation_id", o.id).order("position"),
      supabase.from("learn_lessons").select("id, key, module_id, title, duration_minutes, xp_reward, position, published, quiz").eq("organisation_id", o.id).order("position").limit(5000),
    ]);
    const c = { levels: (lv.data ?? []) as { id: string; key: string; number: number; title: string; description: string | null; min_xp: number; xp_reward: number; position: number; published: boolean; certificate_title: string | null }[],
      modules: (md.data ?? []) as { id: string; key: string; level_id: string; title: string; description: string | null; xp_reward: number; position: number; published: boolean }[],
      lessons: (ls.data ?? []) as { id: string; key: string; module_id: string; title: string; duration_minutes: number; xp_reward: number; position: number; published: boolean; quiz: unknown }[] };
    const ord = courseOrder(c);
    // One lesson open for editing
    if (sp.lesson && /^[0-9a-f-]{36}$/i.test(sp.lesson)) {
      const { data: l } = await supabase.from("learn_lessons").select("id, module_id, title, duration_minutes, xp_reward, content, key_points, quiz, published").eq("organisation_id", o.id).eq("id", sp.lesson).maybeSingle();
      if (l) {
        const q = readQuiz(l.quiz);
        const mod = c.modules.find((m) => m.id === l.module_id);
        return (
          <>{header}{tabs}
            <Link href={`/learn?tab=lessons&module=${l.module_id}`} className="mb-3 inline-flex text-[0.8125rem] text-ink-muted hover:text-ink">← {mod?.title ?? "Back"}</Link>
            <div className="grid gap-5 xl:grid-cols-2">
              <Card className="p-5"><LessonEditor id={l.id as string} initial={{ title: l.title as string, duration_minutes: l.duration_minutes as number, xp_reward: l.xp_reward as number, content: l.content as string, key_points: (l.key_points as string[]) ?? [], published: l.published as boolean,
                quiz: q ? { question: q.question, options: q.options, correct_index: q.correct_index, explanation: q.explanation ?? "" } : null }} /></Card>
              <Card className="p-5"><p className="mb-3 text-[0.75rem] font-semibold uppercase tracking-wider text-ink-faint">How learners see it (after you save)</p><h2 className="mb-2 text-[1.25rem] font-bold text-ink">{l.title as string}</h2><LessonBody content={l.content as string} title={l.title as string} /></Card>
            </div>
          </>
        );
      }
    }
    // One module open
    if (sp.module && /^[0-9a-f-]{36}$/i.test(sp.module)) {
      const m = c.modules.find((x) => x.id === sp.module);
      if (m) {
        const lessons = ord.lessonsOf(m.id);
        return (
          <>{header}{tabs}
            <Link href="/learn?tab=lessons" className="mb-3 inline-flex text-[0.8125rem] text-ink-muted hover:text-ink">← All levels</Link>
            <Card className="mb-4 p-5"><p className="mb-2 text-[0.75rem] font-semibold uppercase tracking-wider text-ink-faint">Module · XP is for passing its mastery quiz</p><ModuleEditor id={m.id} initial={{ title: m.title, description: m.description ?? "", xp_reward: m.xp_reward, published: m.published }} /></Card>
            <Card>
              <CardHeader title={`${lessons.length} lessons`} action={<AddLesson moduleId={m.id} />} />
              <ul className="divide-y divide-line">{lessons.map((x, i) => (
                <li key={x.id}><Link href={`/learn?tab=lessons&lesson=${x.id}`} className="flex items-center gap-3 px-5 py-2.5 text-[0.8125rem] hover:bg-zinc-50">
                  <span className="w-6 text-ink-faint tabular">{i + 1}</span><span className="min-w-0 flex-1 truncate font-medium text-ink">{x.title}</span>
                  <span className="text-ink-muted">{x.duration_minutes} min · {x.xp_reward} XP{readQuiz(x.quiz) ? " · quiz" : ""}</span>{!x.published && <span className="rounded bg-zinc-100 px-1.5 text-[0.6875rem] text-ink-muted">Hidden</span>}
                </Link></li>
              ))}</ul>
            </Card>
          </>
        );
      }
    }
    return (
      <>{header}{tabs}
        <p className="mb-4 text-[0.8125rem] text-ink-muted">{c.lessons.length} lessons in {c.modules.length} modules. Learners get the first module of the first level free to try. Levels open as they earn XP.</p>
        <div className="space-y-4">
          {ord.levels.map((l) => (
            <Card key={l.id} className="p-5">
              <details>
                <summary className="cursor-pointer select-none text-[0.9375rem] font-semibold text-ink">Level {l.number}: {l.title} <span className="ml-2 text-[0.75rem] font-normal text-ink-muted">opens at {l.min_xp} XP · +{l.xp_reward} XP when done{l.published ? "" : " · hidden"}</span></summary>
                <div className="mt-3"><LevelEditor id={l.id} initial={{ title: l.title, description: l.description ?? "", min_xp: l.min_xp, xp_reward: l.xp_reward, certificate_title: l.certificate_title ?? "", published: l.published }} /></div>
              </details>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {ord.modulesOf(l.id).map((m) => (
                  <li key={m.id}><Link href={`/learn?tab=lessons&module=${m.id}`} className="block rounded-lg border border-line px-3 py-2 hover:border-brand-200 hover:bg-zinc-50">
                    <span className="block text-[0.8125rem] font-medium text-ink">{m.title}{!m.published && <span className="ml-1.5 text-[0.6875rem] text-ink-faint">(hidden)</span>}</span>
                    <span className="block text-[0.75rem] text-ink-muted">{ord.lessonsOf(m.id).length} lessons</span>
                  </Link></li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </>
    );
  }

  /* ---------------------------------------------------------------- learners */
  if (tab === "learners") {
    const q = (sp.t ?? "").trim().toLowerCase();
    const [acc, ln, done] = await Promise.all([
      supabase.from("learn_access").select("id, student_id, plan, status, starts_at, ends_at, renews, price, card_label, last_error, created_at").eq("organisation_id", o.id).neq("status", "pending").order("created_at", { ascending: false }).limit(2000),
      supabase.from("learn_learners").select("student_id, xp, streak_days, last_active_on, student:booking_students(name, email)").eq("organisation_id", o.id).order("xp", { ascending: false }).limit(2000),
      supabase.from("learn_progress").select("student_id").eq("organisation_id", o.id).limit(50000),
    ]);
    const count = new Map<string, number>();
    for (const r of (done.data ?? []) as { student_id: string }[]) count.set(r.student_id, (count.get(r.student_id) ?? 0) + 1);
    const access = (acc.data ?? []) as unknown as (AccessRow & { student_id: string; price: number; card_label: string | null; last_error: string | null })[];
    const people = new Map<string, { name: string; email: string | null; xp: number; streak: number; last: string | null }>();
    for (const r of (ln.data ?? []) as unknown as { student_id: string; xp: number; streak_days: number; last_active_on: string | null; student: { name: string; email: string | null } | null }[]) people.set(r.student_id, { name: r.student?.name ?? "—", email: r.student?.email ?? null, xp: r.xp, streak: r.streak_days, last: r.last_active_on });
    const missingIds = [...new Set(access.map((a) => a.student_id))].filter((id) => !people.has(id));
    if (missingIds.length) {
      const { data: st } = await supabase.from("booking_students").select("id, name, email").in("id", missingIds.slice(0, 500));
      for (const x of (st ?? []) as { id: string; name: string; email: string | null }[]) people.set(x.id, { name: x.name, email: x.email, xp: 0, streak: 0, last: null });
    }
    const list = [...people.entries()].map(([id, p]) => ({ id, ...p, pass: liveAccess(access.filter((a) => a.student_id === id)), lessons: count.get(id) ?? 0 }))
      .filter((p) => !q || p.name.toLowerCase().includes(q) || (p.email ?? "").toLowerCase().includes(q));
    return (
      <>{header}{tabs}
        <Card className="mb-4 p-5"><p className="mb-2 text-[0.8438rem] font-semibold text-ink">Give someone free access</p><GiveAccess /></Card>
        <Card>
          <CardHeader title={`${list.length} learner${list.length === 1 ? "" : "s"}`} action={<form action="/learn"><input type="hidden" name="tab" value="learners" /><input name="t" defaultValue={sp.t ?? ""} placeholder="Search name or email" className="h-8 rounded-lg border border-line-strong px-2.5 text-[0.8125rem]" /></form>} />
          {list.length === 0 ? <EmptyState title="No learners yet" /> : (
            <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-[0.8125rem]">
              <thead><tr className="border-b border-line text-left text-[0.75rem] text-ink-faint"><th className="px-5 py-2 font-medium">Learner</th><th className="px-2 py-2 font-medium">Access</th><th className="px-2 py-2 text-right font-medium">XP</th><th className="px-2 py-2 text-right font-medium">Lessons</th><th className="px-2 py-2 font-medium">Last active</th><th className="px-5 py-2" /></tr></thead>
              <tbody className="divide-y divide-line">{list.slice(0, 300).map((p) => (
                <tr key={p.id}>
                  <td className="px-5 py-2"><span className="font-medium text-ink">{p.name}</span><span className="block text-[0.75rem] text-ink-faint">{p.email}</span></td>
                  <td className="px-2 py-2 text-ink-muted">{p.pass ? <>{PLAN_LABEL[p.pass.plan]}<span className="block text-[0.75rem]">{p.pass.plan === "monthly" && p.pass.renews ? "renews" : "to"} {dt(p.pass.ends_at, tz)}{p.pass.status === "payment_failed" ? " · payment failed" : ""}</span></> : <span className="text-ink-faint">None</span>}</td>
                  <td className="px-2 py-2 text-right tabular">{p.xp}</td><td className="px-2 py-2 text-right tabular">{p.lessons}</td><td className="px-2 py-2 text-ink-muted">{p.last ?? "—"}</td>
                  <td className="px-5 py-2 text-right">{p.pass && <EndAccess id={p.pass.id} />}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </Card>
      </>
    );
  }

  /* ---------------------------------------------------------------- plans & pricing */
  if (tab === "sales") {
    const st = priceStory(s);
    return (
      <>{header}{tabs}
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Card className="p-5"><LearnSettingsForm initial={s} courses={((courses ?? []) as { id: string; name: string }[])} currency={cur} /></Card>
          <div className="space-y-4">
            <Card className="p-5 text-[0.8125rem] text-ink-muted">
              <p className="text-[0.8438rem] font-semibold text-ink">How it&apos;s sold</p>
              <ul className="mt-2 list-disc space-y-1.5 pl-5">
                <li><span className="font-medium text-ink">At barista course checkout</span> — a tick-box to add {s.accessMonths} months for {$(s.prices.with_course)} ({st.courseSavePct}% off yearly), paid in the same card payment.</li>
                <li><span className="font-medium text-ink">Past students</span> — sign in on the learner site; they get the course price for {s.pastStudentDays} days after their class{s.pastStudentDays ? "" : " (set above — 0 means only at booking)"}, otherwise monthly or yearly.</li>
                <li><span className="font-medium text-ink">Anyone</span> — monthly ({$(s.prices.monthly)}, cancel any time; the card is charged each month) or yearly ({$(s.prices.yearly)}, {st.monthsFree} months free).</li>
              </ul>
              <p className="mt-3">Payments go to your Stripe account{stripeReady ? "" : " — not connected yet"}. Refunds are done in Stripe.</p>
            </Card>
            <Card className="p-5 text-[0.8125rem] text-ink-muted">
              <p className="text-[0.8438rem] font-semibold text-ink">The Replit app&apos;s plans (for reference)</p>
              <p className="mt-1">Solo Barista $14.99/mo or $143.99/yr · Café Team (10 staff) $49.99/mo or $479.99/yr · Enterprise (100) $149.99/mo or $1,439.99/yr. Team plans aren&apos;t set up here yet.</p>
            </Card>
          </div>
        </div>
      </>
    );
  }

  /* ---------------------------------------------------------------- training rooms */
  if (tab === "rooms") {
    const [ven, hires] = await Promise.all([
      supabase.from("learn_venues").select("id, name, business_name, contact_name, email, phone, suburb, state, capacity, description, equipment, image_url, hourly_rate, day_rate, commission_pct, status, office_note, created_at").eq("organisation_id", o.id).order("created_at", { ascending: false }),
      supabase.from("learn_venue_bookings").select("id, venue_id, name, email, phone, wanted_on, hours, people, message, amount, commission, status, pay_token, paid_at, venue_paid_at, created_at, venue:learn_venues(name)").eq("organisation_id", o.id).order("created_at", { ascending: false }).limit(300),
    ]);
    type V = { id: string; name: string; business_name: string | null; contact_name: string | null; email: string | null; phone: string | null; suburb: string | null; state: string | null; capacity: number | null; description: string | null; equipment: string | null; image_url: string | null; hourly_rate: number | null; day_rate: number | null; commission_pct: number; status: "pending" | "approved" | "hidden"; office_note: string | null };
    type H = { id: string; name: string; email: string; phone: string | null; wanted_on: string | null; hours: number | null; people: number | null; message: string | null; amount: number | null; commission: number | null; status: string; pay_token: string; venue_paid_at: string | null; venue: { name: string } | null };
    const venues = (ven.data ?? []) as V[];
    const hs = (hires.data ?? []) as unknown as H[];
    const paid = hs.filter((h) => h.status === "paid");
    const totals = paid.reduce((t, h) => { const sp2 = hireSplit(Number(h.amount ?? 0), 0); const c = Number(h.commission ?? 0); return { amount: t.amount + sp2.amount, commission: t.commission + c, owed: t.owed + (h.venue_paid_at ? 0 : sp2.amount - c) }; }, { amount: 0, commission: 0, owed: 0 });
    return (
      <>{header}{tabs}
        <div className="grid gap-3 sm:grid-cols-3">
          <Kpi label="Hires paid" value={$(totals.amount)} sub={`${paid.length} hire${paid.length === 1 ? "" : "s"}`} />
          <Kpi label="Your commission" value={$(totals.commission)} />
          <Kpi label="Owed to venues" value={$(totals.owed)} alert={totals.owed > 0} />
        </div>
        <Card className="mt-5 p-5"><MarketplaceSettings initial={s} /></Card>
        <Card className="mt-5">
          <CardHeader title="Hire requests" subtitle="Confirm the price (your commission is worked out from the venue's %), copy the pay link and send it to the hirer. Pay the venue their share, then mark it paid." />
          {hs.length === 0 ? <EmptyState title="No hire requests yet" /> : (
            <ul className="divide-y divide-line">{hs.map((h) => (
              <li key={h.id} className="space-y-2 px-5 py-3 text-[0.8125rem]">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span><span className="font-medium text-ink">{h.name}</span> <span className="text-ink-muted">· {h.email}{h.phone ? ` · ${h.phone}` : ""}</span></span>
                  <span className="text-ink-muted">{h.venue?.name} · {h.wanted_on ?? "date?"}{h.hours ? ` · ${h.hours}h` : ""}{h.people ? ` · ${h.people} people` : ""} · <span className="font-medium text-ink">{h.status}{h.status === "paid" && h.venue_paid_at ? ", venue paid" : ""}</span>{h.amount ? ` · ${$(h.amount)} (you ${$(h.commission ?? 0)})` : ""}</span>
                </div>
                {h.message && <p className="text-ink-muted">“{h.message}”</p>}
                <HireActions id={h.id} status={h.status} amount={h.amount} venuePaid={!!h.venue_paid_at} payPath={h.status === "confirmed" ? `/academy/${o.slug}/rooms/pay/${h.pay_token}` : null} base={appBaseUrl()} />
              </li>
            ))}</ul>
          )}
        </Card>
        <Card className="mt-5">
          <CardHeader title={`Listed rooms (${venues.length})`} subtitle="Venues send listings from the learner site. Approve to list them." />
          {venues.length === 0 ? <EmptyState title="No listings yet" /> : (
            <ul className="divide-y divide-line">{venues.map((v) => (
              <li key={v.id} className="space-y-2 px-5 py-3 text-[0.8125rem]">
                <p><span className="font-medium text-ink">{v.name}</span> <span className="text-ink-muted">· {[v.suburb, v.state].filter(Boolean).join(", ")}{v.capacity ? ` · up to ${v.capacity}` : ""} · {v.contact_name ?? ""} {v.email} {v.phone ?? ""}</span></p>
                {v.description && <p className="line-clamp-2 text-ink-muted">{v.description}</p>}
                <VenueRow id={v.id} initial={{ status: v.status, commission_pct: Number(v.commission_pct), image_url: v.image_url ?? "", office_note: v.office_note ?? "", hourly_rate: v.hourly_rate === null ? null : Number(v.hourly_rate), day_rate: v.day_rate === null ? null : Number(v.day_rate) }} />
              </li>
            ))}</ul>
          )}
        </Card>
      </>
    );
  }

  /* ---------------------------------------------------------------- trainer manual */
  if (tab === "trainer") {
    const { data, error } = await supabase.from("learn_trainer_items").select("kind, key, parent_key, position, data").eq("organisation_id", o.id).order("position");
    const items = (data ?? []) as { kind: string; key: string; parent_key: string | null; position: number; data: Record<string, unknown> }[];
    if (error || !items.length) return <>{header}{tabs}<Card className="p-5 text-[0.8125rem] text-ink-muted">The trainer manual comes in with the course import (Lessons tab).</Card></>;
    const mods = items.filter((i) => i.kind === "module");
    const by = (k: string) => items.filter((i) => i.kind === k);
    const arr = (v: unknown) => (Array.isArray(v) ? (v as unknown[]) : []);
    const str = (v: unknown) => (typeof v === "string" ? v : "");
    return (
      <>{header}{tabs}
        <p className="mb-4 text-[0.8125rem] text-ink-muted">The Replit app&apos;s trainer section: what every trainer needs to know, the class timelines and scripts, the theory test and the assessment rubrics.</p>
        <div className="space-y-4">
          {mods.map((m) => {
            const lessons = items.filter((i) => i.kind === "lesson" && i.parent_key === m.key);
            const timeline = m.key === "tm2" ? by("timeline_4hr") : m.key === "tm3" ? by("timeline_2hr") : [];
            return (
              <Card key={m.key} className="p-5">
                <details>
                  <summary className="cursor-pointer select-none"><span className="text-[0.9375rem] font-semibold text-ink">{str(m.data.title)}</span><span className="ml-2 text-[0.75rem] text-ink-muted">{str(m.data.description)}</span></summary>
                  <div className="mt-4 space-y-4">
                    {lessons.map((l) => (
                      <details key={l.key} className="rounded-lg border border-line p-4">
                        <summary className="cursor-pointer select-none text-[0.875rem] font-medium text-ink">{str(l.data.title)} <span className="text-[0.75rem] font-normal text-ink-muted">· {String(l.data.estimated_minutes ?? "")} min</span></summary>
                        <div className="mt-3 space-y-3 text-[0.8125rem]">
                          {str(l.data.objective) && <p className="text-ink-muted"><span className="font-medium text-ink">Objective:</span> {str(l.data.objective)}</p>}
                          <LessonBody content={str(l.data.content)} title={str(l.data.title)} />
                          {str(l.data.trainer_script) && <blockquote className="rounded-r-lg border-l-4 border-brand-400 bg-brand-50 px-3 py-2 text-ink">{str(l.data.trainer_script)}</blockquote>}
                          {arr(l.data.checklist).length > 0 && <div><p className="font-medium text-ink">Checklist</p><ul className="list-disc pl-5 text-ink-muted">{arr(l.data.checklist).map((x) => <li key={String(x)}>{String(x)}</li>)}</ul></div>}
                          {arr(l.data.student_questions).length > 0 && <div><p className="font-medium text-ink">Student questions</p><ul className="space-y-1 text-ink-muted">{arr(l.data.student_questions).map((x, i) => { const q = x as { q: string; a: string }; return <li key={i}><span className="text-ink">“{q.q}”</span> — {q.a}</li>; })}</ul></div>}
                        </div>
                      </details>
                    ))}
                    {timeline.length > 0 && (
                      <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-[0.8125rem]"><tbody className="divide-y divide-line">
                        {timeline.map((t) => (
                          <tr key={t.key} className="align-top"><td className="w-24 py-2 pr-3 font-mono text-ink-muted">{str(t.data.time_start)}–{str(t.data.time_end)}</td>
                            <td className="py-2"><p className="font-medium text-ink">{str(t.data.section)}</p><ul className="mt-1 list-disc pl-5 text-ink-muted">{arr(t.data.trainer_actions).map((x) => <li key={String(x)}>{String(x)}</li>)}</ul>{str(t.data.trainer_script) && <p className="mt-1 italic text-ink">{str(t.data.trainer_script)}</p>}</td></tr>
                        ))}
                      </tbody></table></div>
                    )}
                  </div>
                </details>
              </Card>
            );
          })}
          <Card className="p-5">
            <details><summary className="cursor-pointer select-none text-[0.9375rem] font-semibold text-ink">Trainer theory test ({by("theory").length} questions)</summary>
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-[0.8125rem]">{by("theory").map((t) => { const opts = arr(t.data.options).map(String); const ci = Number(t.data.correct_index); return <li key={t.key}><p className="text-ink">{str(t.data.question)}</p><p className="text-ink-muted">Answer: <span className="font-medium text-emerald-700">{opts[ci]}</span> — {str(t.data.explanation)}</p></li>; })}</ol>
            </details>
          </Card>
          <Card className="p-5">
            <p className="text-[0.9375rem] font-semibold text-ink">Assessment rubrics</p>
            {[["Practical (students)", "rubric_practical"], ["Teaching (trainers)", "rubric_teaching"]].map(([title, k]) => (
              <div key={k} className="mt-3"><p className="text-[0.8125rem] font-medium text-ink">{title}</p>
                <ul className="mt-1 space-y-1 text-[0.8125rem] text-ink-muted">{by(k).map((r) => <li key={r.key}><span className="text-ink">{str(r.data.title)}</span> — {str(r.data.description)} (pass {String(r.data.pass_score)}/{String(r.data.max_score)}{r.data.auto_fail_flag ? ", must pass" : ""})</li>)}</ul></div>
            ))}
          </Card>
        </div>
      </>
    );
  }

  /* ---------------------------------------------------------------- badges & challenges */
  const [bd, ch] = await Promise.all([
    supabase.from("learn_badges").select("id, key, name, description, rule, active").eq("organisation_id", o.id).order("position"),
    supabase.from("learn_challenges").select("id, title, description, xp_reward, active").eq("organisation_id", o.id).order("position"),
  ]);
  return (
    <>{header}{tabs}
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Badges" subtitle="Earned automatically. Plus a certificate for each finished level." />
          <ul className="divide-y divide-line">{((bd.data ?? []) as { id: string; name: string; description: string | null; rule: unknown; active: boolean }[]).map((b) => (
            <li key={b.id} className="flex items-center gap-3 px-5 py-2.5 text-[0.8125rem]"><span className="min-w-0 flex-1"><span className="font-medium text-ink">{b.name}</span><span className="block text-[0.75rem] text-ink-muted">{b.description} · rule: {ruleText(readRule(b.rule))}</span></span><ActiveToggle table="learn_badges" id={b.id} active={b.active} /></li>
          ))}</ul>
        </Card>
        <Card>
          <CardHeader title="Daily challenges" subtitle="One a day for everyone, in turn. Learners tick it off for the XP." />
          <ul className="divide-y divide-line">{((ch.data ?? []) as { id: string; title: string; description: string | null; xp_reward: number; active: boolean }[]).map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-5 py-2.5"><div className="min-w-0 flex-1"><ChallengeEditor id={c.id} initial={{ title: c.title, description: c.description ?? "", xp_reward: c.xp_reward }} /></div><ActiveToggle table="learn_challenges" id={c.id} active={c.active} /></li>
          ))}</ul>
          <div className="border-t border-line px-5 py-3"><ChallengeEditor id={null} initial={{ title: "", description: "", xp_reward: 25 }} /></div>
        </Card>
      </div>
    </>
  );
}
