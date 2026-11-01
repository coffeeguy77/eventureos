import { todayISO } from "@/lib/format";
import { kioskOrg } from "@/lib/roster/kiosk";
import { Kiosk } from "./ui";

export async function generateMetadata({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ k?: string }> }) {
  const { slug } = await params;
  const k = ((await searchParams).k ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
  return { title: "Clock on", manifest: `/crew/${slug}/kiosk/manifest.webmanifest?k=${k}`, appleWebApp: { capable: true, title: "Clock on" } };
}
export const dynamic = "force-dynamic";

/** The café iPad: everyone on the roster, who's on now, and a PIN pad to clock on, take a break or clock off. */
export default async function KioskPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ k?: string }> }) {
  const { slug } = await params;
  const token = (await searchParams).k ?? "";
  const k = await kioskOrg(slug, token);
  if (!k) return <div className="py-20 text-center"><p className="text-[1.125rem] font-semibold text-ink">This link isn&apos;t set up</p><p className="mt-1 text-[0.875rem] text-ink-muted">Ask the office for the café iPad link (Roster → Setup).</p></div>;
  const today = todayISO(k.org.timezone);
  const [{ data: people }, { data: open }, { data: shifts }] = await Promise.all([
    k.db.from("crew_members").select("id, name").eq("organisation_id", k.org.id).eq("active", true).eq("on_roster", true).order("name"),
    k.db.from("staff_time_entries").select("crew_member_id, break_started_at").eq("organisation_id", k.org.id).is("clock_out", null),
    k.db.from("staff_shifts").select("crew_member_id, start_time, finish_time").eq("organisation_id", k.org.id).eq("roster", true).eq("shift_date", today).not("published_at", "is", null),
  ]);
  const state = new Map(((open ?? []) as { crew_member_id: string; break_started_at: string | null }[]).map((o) => [o.crew_member_id, o.break_started_at ? "break" : "on"]));
  const when = new Map<string, string>();
  for (const s of (shifts ?? []) as { crew_member_id: string | null; start_time: string; finish_time: string }[]) if (s.crew_member_id) when.set(s.crew_member_id, `${s.start_time.slice(0, 5)}–${s.finish_time.slice(0, 5)}`);
  const list = ((people ?? []) as { id: string; name: string }[]).map((p) => ({ id: p.id, name: p.name, state: (state.get(p.id) ?? "off") as "off" | "on" | "break", shift: when.get(p.id) ?? null }))
    .sort((a, b) => Number(!!b.shift) - Number(!!a.shift) || a.name.localeCompare(b.name));
  const { readRosterSettings } = await import("@/lib/roster/settings");
  return <Kiosk slug={slug} token={token} business={k.name} people={list} photo={readRosterSettings(k.org.settings).clock.photo} />;
}
