import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/integrations/runtime";
import { publicOrg } from "@/lib/bookings/server";
import { cleanCode, tagStatus, STATUS_LABEL } from "@/lib/testtag/core";
import { readTagSettings } from "@/lib/testtag/server";
import { fmtDate, todayISO } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Test & tag record", robots: { index: false, follow: false } };

/** What a label's QR code opens: the item's current test status (no readings or internal notes). */
export default async function TagRecord({ params }: { params: Promise<{ org: string; code: string }> }) {
  const { org: slug, code: raw } = await params;
  const db = createServiceClient();
  const org = await publicOrg(slug, db);
  if (!org) notFound();
  const code = cleanCode(decodeURIComponent(raw));
  const { data: a } = await db.from("tag_assets").select("code, name, location, status, last_tested, last_result, next_due, customer:customers(name)").eq("organisation_id", org.id).ilike("code", code).maybeSingle();
  if (!a) notFound();
  const s = readTagSettings(org.rawSettings);
  const st = tagStatus(a as { status: string; last_result: string | null; next_due: string | null }, todayISO(org.timezone), s.soonDays);
  const good = st === "ok" || st === "due_soon";
  const colour = st === "ok" ? "bg-emerald-600" : st === "due_soon" ? "bg-amber-500" : st === "retired" || st === "untested" ? "bg-zinc-500" : "bg-rose-600";
  const owner = (a.customer as unknown as { name: string } | null)?.name;
  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-10">
      <div className="mx-auto max-w-md overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200">
        <div className={`${colour} px-6 py-5 text-white`}>
          <p className="text-[0.75rem] font-semibold uppercase tracking-[0.1em] opacity-90">Electrical test &amp; tag</p>
          <p className="mt-1 text-[1.75rem] font-bold">{st === "failed" ? "FAILED — DO NOT USE" : st === "overdue" ? "RETEST OVERDUE" : STATUS_LABEL[st].toUpperCase()}</p>
        </div>
        <dl className="space-y-3 px-6 py-5 text-[0.9375rem]">
          <div><dt className="text-[0.75rem] text-zinc-500">Item</dt><dd className="font-semibold text-zinc-900">{a.name as string}</dd><dd className="font-mono text-[0.8125rem] text-zinc-500">{a.code as string}</dd></div>
          {(owner || a.location) && <div><dt className="text-[0.75rem] text-zinc-500">Belongs to</dt><dd className="text-zinc-900">{[owner ?? org.name, a.location].filter(Boolean).join(" · ")}</dd></div>}
          <div className="grid grid-cols-2 gap-3">
            <div><dt className="text-[0.75rem] text-zinc-500">Last tested</dt><dd className="text-zinc-900">{a.last_tested ? fmtDate(a.last_tested as string) : "—"}</dd></div>
            <div><dt className="text-[0.75rem] text-zinc-500">Next test due</dt><dd className={good ? "font-semibold text-zinc-900" : "font-semibold text-rose-700"}>{a.last_result === "pass" && a.next_due ? fmtDate(a.next_due as string) : "—"}</dd></div>
          </div>
          <div className="border-t border-zinc-100 pt-3 text-[0.8125rem] text-zinc-600">Tested by {org.name}{s.licence ? ` · Licence ${s.licence}` : ""}{s.phone ? ` · ${s.phone}` : org.contact_phone ? ` · ${org.contact_phone}` : ""}</div>
        </dl>
        <a href={`/test-tag/test?code=${encodeURIComponent(a.code as string)}`} className="block border-t border-zinc-100 px-6 py-3 text-center text-[0.8125rem] font-medium text-zinc-500 hover:bg-zinc-50">Staff: test this item</a>
      </div>
    </main>
  );
}
