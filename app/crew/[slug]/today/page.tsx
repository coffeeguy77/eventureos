import { notFound, redirect } from "next/navigation";
import { crewSession } from "@/lib/crew/server";
import { readRosterSettings } from "@/lib/roster/settings";
import { todayBoard } from "@/lib/roster/today";
import { TodayBoard } from "@/components/roster/today-board";
import { textLateFromApp } from "../roster-actions";

export const metadata = { title: "Today" };
export const dynamic = "force-dynamic";

/** For managers: today at the café at a glance — who's on, breaks, who's late (call / text), wages vs sales, checklists. */
export default async function TodayPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = await crewSession(slug);
  if (!s) redirect(`/crew/${slug}/login`);
  const { data: o } = await s.db.from("organisations").select("settings").eq("id", s.org.id).single();
  if (!readRosterSettings(o?.settings).app_managers.includes(s.member.id)) notFound();
  const board = await todayBoard(s.db, { id: s.org.id, timezone: s.org.timezone, settings: o?.settings });
  return (
    <div>
      <h1 className="mb-1 text-[1.5rem] font-bold tracking-tight text-ink">Today</h1>
      <p className="mb-4 text-[0.875rem] text-ink-muted">{new Date().toLocaleDateString("en-AU", { timeZone: s.org.timezone, weekday: "long", day: "numeric", month: "long" })}</p>
      <TodayBoard board={board} tz={s.org.timezone} onText={textLateFromApp.bind(null, slug)} />
    </div>
  );
}
