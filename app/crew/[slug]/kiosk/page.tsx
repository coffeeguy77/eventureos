import { after } from "next/server";
import { kioskOrg } from "@/lib/roster/kiosk";
import { kioskPeople, homePlace } from "@/lib/roster/kiosk-data";
import { readRosterSettings } from "@/lib/roster/settings";
import { Kiosk } from "./ui";

export async function generateMetadata({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ k?: string }> }) {
  const { slug } = await params;
  const k = ((await searchParams).k ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
  return { title: "Clock on", manifest: `/crew/${slug}/kiosk/manifest.webmanifest?k=${k}`, appleWebApp: { capable: true, title: "Clock on" } };
}
export const dynamic = "force-dynamic";

/** The café iPad: everyone on the roster and where they're at; tap your name, PIN, then clock on / break / clock off. */
export default async function KioskPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ k?: string }> }) {
  const { slug } = await params;
  const token = (await searchParams).k ?? "";
  const k = await kioskOrg(slug, token);
  if (!k) return <div className="py-20 text-center"><p className="text-[1.125rem] font-semibold text-ink">This link isn&apos;t set up</p><p className="mt-1 text-[0.875rem] text-ink-muted">Ask the office for the café iPad link (Roster → Setup → Clocking & breaks).</p></div>;
  after(async () => { const { runRosterJobsSoon } = await import("@/lib/roster/jobs"); await runRosterJobsSoon(k.db, k.org.id); });
  const st = readRosterSettings(k.org.settings);
  const [people, { data: areas }, checklists] = await Promise.all([
    kioskPeople(k.db, k.org),
    k.db.from("roster_areas").select("id, name").eq("organisation_id", k.org.id),
    import("@/lib/roster/checklists").then((m) => m.todaysChecklists(k.db, k.org)),
  ]);
  return (
    <Kiosk slug={slug} token={token} business={k.name} logo={k.logo && /^https:\/\//.test(k.logo) ? k.logo : null} place={homePlace(k.org.settings, (areas ?? []) as { id: string; name: string }[])}
      tz={k.org.timezone} people={people} photo={st.clock.photo} breakMin={st.meal.minutes} breakMax={Math.max(st.breaks.max, st.meal.minutes)} checklists={checklists} />
  );
}
