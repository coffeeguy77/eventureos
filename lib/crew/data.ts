import "server-only";
import type { CrewSession } from "./server";
import { clashes, plannedShift, shiftPay, type ShiftEvent } from "./shifts";

/** What the staff app shows. No prices, budgets or client billing details — only what the person needs to do the job. */
export interface JobInfo extends ShiftEvent {
  id: string; name: string; venue: string | null; address: string | null; status: string; crew_needed: number | null; client: string | null;
}
export interface Shift {
  id: string; status: "interested" | "offered" | "confirmed"; role: string | null; boardPostedAt: string | null; boardNote: string | null;
  calendarResponse: string | null; paymentId: string | null; job: JobInfo;
  start: string | null; finish: string | null; hours: number | null; amount: number | null; rate: number; extraApproved: number; extraPending: number;
}

const JOB_COLS = "id, name, event_date, setup_time, start_time, finish_time, venue, address, status, crew_needed, customer:customers(name)";
type RawJob = Omit<JobInfo, "client"> & { customer: { name: string } | null };
const toJob = (e: RawJob): JobInfo => ({ ...e, client: e.customer?.name ?? null });
const TBC_STATUSES = ["enquiry", "planning", "quoted", "awaiting_approval"];

export async function myShifts(s: CrewSession, opts: { from?: string; to?: string } = {}): Promise<Shift[]> {
  const { data, error } = await s.db.from("event_crew")
    .select(`id, status, role, board_posted_at, board_note, calendar_response, hours_override, rate_override, payment_id, event:events(${JOB_COLS})`)
    .eq("organisation_id", s.org.id).eq("crew_member_id", s.member.id);
  if (error) throw new Error(`Couldn't load your shifts: ${error.message}`);
  type Row = { id: string; status: Shift["status"]; role: string | null; board_posted_at: string | null; board_note: string | null; calendar_response: string | null;
    hours_override: number | null; rate_override: number | null; payment_id: string | null; event: RawJob | null };
  const rows = ((data ?? []) as unknown as Row[]).filter((r) => r.event && r.event.status !== "cancelled")
    .filter((r) => (!opts.from || (r.event!.event_date ?? "9999") >= opts.from) && (!opts.to || (r.event!.event_date ?? "0000") <= opts.to));
  const claims = await claimsFor(s, rows.map((r) => r.id));
  return rows.map((r) => {
    const job = toJob(r.event!);
    const c = claims.get(r.id) ?? { approved: 0, pending: 0 };
    const p = plannedShift(job);
    const pay = shiftPay({ event: job, hoursOverride: r.hours_override == null ? null : Number(r.hours_override), approvedExtra: c.approved,
      rateOverride: r.rate_override == null ? null : Number(r.rate_override), memberRate: s.member.hourly_rate, orgRate: s.org.staff_hourly_rate });
    return {
      id: r.id, status: r.status, role: r.role, boardPostedAt: r.board_posted_at, boardNote: r.board_note, calendarResponse: r.calendar_response, paymentId: r.payment_id,
      job, start: p.start, finish: p.finish, hours: pay.hours, amount: pay.amount, rate: pay.rate, extraApproved: c.approved, extraPending: c.pending,
    };
  }).sort((a, b) => (a.job.event_date ?? "9999").localeCompare(b.job.event_date ?? "9999") || (a.start ?? "").localeCompare(b.start ?? ""));
}

async function claimsFor(s: CrewSession, shiftIds: string[]) {
  const out = new Map<string, { approved: number; pending: number }>();
  if (!shiftIds.length) return out;
  const { data } = await s.db.from("staff_hour_claims").select("event_crew_id, hours, status").in("event_crew_id", shiftIds);
  for (const c of (data ?? []) as { event_crew_id: string; hours: number; status: string }[]) {
    const v = out.get(c.event_crew_id) ?? { approved: 0, pending: 0 };
    if (c.status === "approved") v.approved += Number(c.hours); else if (c.status === "pending") v.pending += Number(c.hours);
    out.set(c.event_crew_id, v);
  }
  return out;
}

export interface ShiftDetail extends Shift {
  guests: number | null; serves: number | null; notes: string | null; requirements: string | null; type: string | null;
  onsite: { name: string; phone: string | null } | null;
  team: { name: string; phone: string | null; role: string | null; status: string }[];
  inclusions: { name: string; description: string | null; quantity: number; unit: string | null; section: string | null }[];
  claims: { id: string; hours: number; reason: string; status: string; created_at: string }[];
}

export async function shiftDetail(s: CrewSession, shiftId: string): Promise<ShiftDetail | null> {
  const list = await myShifts(s);
  const sh = list.find((x) => x.id === shiftId);
  if (!sh) return null;
  const eventId = sh.job.id;
  const [{ data: ev }, { data: team }, { data: q }, { data: claims }] = await Promise.all([
    s.db.from("events").select("guest_count, serves, crew_notes, requirements, event_type, contact:contacts!events_primary_contact_id_organisation_id_fkey(first_name, last_name, phone)").eq("id", eventId).maybeSingle(),
    s.db.from("event_crew").select("status, role, member:crew_members(name, phone)").eq("event_id", eventId).in("status", ["offered", "confirmed"]).neq("crew_member_id", s.member.id),
    s.db.from("quotes").select("id").eq("event_id", eventId).neq("status", "declined").order("status", { ascending: true }).order("created_at", { ascending: false }).limit(5),
    s.db.from("staff_hour_claims").select("id, hours, reason, status, created_at").eq("event_crew_id", shiftId).order("created_at"),
  ]);
  // The accepted quote if there is one, else the newest — names and quantities only (never prices)
  const quotes = (q ?? []) as { id: string }[];
  let inclusions: ShiftDetail["inclusions"] = [];
  if (quotes.length) {
    const { data: acc } = await s.db.from("quotes").select("id").eq("event_id", eventId).eq("status", "accepted").limit(1);
    const qid = (acc?.[0]?.id as string | undefined) ?? quotes[0].id;
    const { data: items } = await s.db.from("quote_items").select("name, description, quantity, unit, is_optional, position, section:quote_sections(title, position, is_optional)").eq("quote_id", qid);
    type It = { name: string; description: string | null; quantity: number; unit: string | null; is_optional: boolean; position: number; section: { title: string; position: number; is_optional: boolean } | null };
    inclusions = ((items ?? []) as unknown as It[]).filter((i) => i.name.trim() && !i.is_optional && !i.section?.is_optional)
      .sort((a, b) => (a.section?.position ?? 0) - (b.section?.position ?? 0) || a.position - b.position)
      .map((i) => ({ name: i.name, description: i.description, quantity: Number(i.quantity), unit: i.unit, section: i.section?.title ?? null }));
  }
  const e = ev as unknown as { guest_count: number | null; serves: number | null; crew_notes: string | null; requirements: string | null; event_type: string | null; contact: { first_name: string; last_name: string | null; phone: string | null } | null } | null;
  return {
    ...sh, guests: e?.guest_count ?? null, serves: e?.serves ?? null, notes: e?.crew_notes ?? null, requirements: e?.requirements ?? null, type: e?.event_type ?? null,
    onsite: e?.contact ? { name: `${e.contact.first_name} ${e.contact.last_name ?? ""}`.trim(), phone: e.contact.phone } : null,
    team: ((team ?? []) as unknown as { status: string; role: string | null; member: { name: string; phone: string | null } | null }[]).filter((t) => t.member)
      .map((t) => ({ name: t.member!.name, phone: t.member!.phone, role: t.role, status: t.status })),
    inclusions, claims: ((claims ?? []) as ShiftDetail["claims"]).map((c) => ({ ...c, hours: Number(c.hours) })),
  };
}

export interface BoardItem {
  kind: "swap" | "open" | "tbc";
  /** event_crew id for swaps; event id otherwise */
  id: string; job: JobInfo; start: string | null; finish: string | null; hours: number | null;
  from?: string; note?: string | null; interested?: boolean; clash?: string | null; away?: boolean; spots?: number;
}

/** The job board: shifts others are giving away, confirmed jobs still short of staff, and TBC jobs to put your hand up for. */
export async function board(s: CrewSession, today: string): Promise<BoardItem[]> {
  const [mine, posted, upcoming, away] = await Promise.all([
    myShifts(s, { from: today }),
    s.db.from("event_crew").select(`id, board_note, crew_member_id, member:crew_members(name), event:events(${JOB_COLS})`).eq("organisation_id", s.org.id)
      .not("board_posted_at", "is", null).eq("status", "confirmed").neq("crew_member_id", s.member.id),
    s.db.from("events").select(`${JOB_COLS}, crew:event_crew(crew_member_id, status)`).eq("organisation_id", s.org.id).gte("event_date", today).neq("status", "cancelled").neq("status", "completed").order("event_date").limit(200),
    s.db.from("staff_unavailability").select("starts_on, ends_on").eq("crew_member_id", s.member.id).gte("ends_on", today),
  ]);
  const working = mine.filter((m) => m.status !== "interested");
  const isAway = (d: string | null) => !!d && ((away.data ?? []) as { starts_on: string; ends_on: string }[]).some((a) => d >= a.starts_on && d <= a.ends_on);
  const clashWith = (j: JobInfo) => working.find((w) => w.job.id !== j.id && clashes(w.job, j))?.job.name ?? null;
  const items: BoardItem[] = [];
  for (const r of (posted.data ?? []) as unknown as { id: string; board_note: string | null; member: { name: string } | null; event: RawJob | null }[]) {
    if (!r.event || r.event.status === "cancelled" || (r.event.event_date ?? "") < today) continue;
    if (working.some((w) => w.job.id === r.event!.id)) continue;
    const job = toJob(r.event); const p = plannedShift(job);
    items.push({ kind: "swap", id: r.id, job, start: p.start, finish: p.finish, hours: p.hours, from: r.member?.name ?? "A team member", note: r.board_note, clash: clashWith(job), away: isAway(job.event_date) });
  }
  for (const e of (upcoming.data ?? []) as unknown as (RawJob & { crew: { crew_member_id: string; status: string }[] })[]) {
    const job = toJob(e); const p = plannedShift(job);
    const rostered = e.crew.filter((c) => c.status !== "interested").length;
    const meOn = e.crew.find((c) => c.crew_member_id === s.member.id);
    if (e.status === "confirmed") {
      const spots = (e.crew_needed ?? 1) - rostered;
      if (spots > 0 && (!meOn || meOn.status === "interested")) items.push({ kind: "open", id: e.id, job, start: p.start, finish: p.finish, hours: p.hours, spots, clash: clashWith(job), away: isAway(job.event_date) });
    } else if (TBC_STATUSES.includes(e.status) && e.event_date && (!meOn || meOn.status === "interested")) {
      items.push({ kind: "tbc", id: e.id, job, start: p.start, finish: p.finish, hours: p.hours, interested: meOn?.status === "interested", clash: clashWith(job), away: isAway(job.event_date) });
    }
  }
  const order = { swap: 0, open: 1, tbc: 2 };
  return items.sort((a, b) => order[a.kind] - order[b.kind] || (a.job.event_date ?? "").localeCompare(b.job.event_date ?? ""));
}

export async function myAway(s: CrewSession, today: string) {
  const { data } = await s.db.from("staff_unavailability").select("id, starts_on, ends_on, note").eq("crew_member_id", s.member.id).gte("ends_on", today).order("starts_on");
  return (data ?? []) as { id: string; starts_on: string; ends_on: string; note: string | null }[];
}

export async function myPayments(s: CrewSession) {
  const { data } = await s.db.from("staff_payments").select("id, paid_on, hours, amount, reference").eq("crew_member_id", s.member.id).order("paid_on", { ascending: false }).limit(50);
  return ((data ?? []) as { id: string; paid_on: string; hours: number; amount: number; reference: string | null }[]).map((p) => ({ ...p, hours: Number(p.hours), amount: Number(p.amount) }));
}
