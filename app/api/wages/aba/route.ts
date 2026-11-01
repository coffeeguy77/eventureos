import { NextResponse, type NextRequest } from "next/server";
import { requireOrg } from "@/lib/context";
import { readRosterSettings } from "@/lib/roster/settings";
import { abaFile } from "@/lib/wages/aba";

export const dynamic = "force-dynamic";

/** The ABA bank file for the Wages bank transfers recorded on a date (owners, admins and managers). */
export async function GET(req: NextRequest) {
  try {
    const { supabase, org, role } = await requireOrg();
    if (!["owner", "admin", "manager"].includes(role)) return new NextResponse("Only owners, admins and managers can download the bank file.", { status: 403 });
    const date = req.nextUrl.searchParams.get("date") ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return new NextResponse("Choose the payment date.", { status: 400 });
    const a = readRosterSettings(org.settings).aba;
    if (!a.bank || !a.bsb || !a.account || !a.user_id) return new NextResponse("Add your business bank details first (Roster → Setup → Bank file).", { status: 400 });
    const { data: pays } = await supabase.from("staff_payments").select("id, crew_member_id, amount, reference, note, member:crew_members(name)").eq("organisation_id", org.id).eq("paid_on", date).eq("note", "Bank transfer");
    const list = (pays ?? []) as unknown as { id: string; crew_member_id: string; amount: number; reference: string | null; member: { name: string } | null }[];
    if (!list.length) return new NextResponse("No bank transfers recorded in Wages for that date.", { status: 404 });
    const { data: banks, error } = await supabase.from("staff_bank_accounts").select("crew_member_id, account_name, bsb, account_number").in("crew_member_id", [...new Set(list.map((p) => p.crew_member_id))]);
    if (error) return new NextResponse("Run the latest database update (0087_roster_extras.sql) first.", { status: 400 });
    const bank = new Map(((banks ?? []) as { crew_member_id: string; account_name: string; bsb: string; account_number: string }[]).map((b) => [b.crew_member_id, b]));
    const missing = [...new Set(list.filter((p) => !bank.has(p.crew_member_id)).map((p) => p.member?.name ?? "Someone"))];
    if (missing.length) return new NextResponse(`No bank details for ${missing.join(", ")} — add them in Roster → Setup → Staff details.`, { status: 400 });
    const [y, m, d] = date.split("-");
    const file = abaFile(
      { bank: a.bank, userName: a.user_name || org.name, userId: a.user_id, description: "WAGES", date, bsb: a.bsb, account: a.account, remitter: a.remitter || org.name },
      list.map((p) => { const b = bank.get(p.crew_member_id)!; return { bsb: b.bsb, account: b.account_number, name: b.account_name, cents: Math.round(Number(p.amount) * 100), reference: (p.reference || `Wages ${d}/${m}`).slice(0, 18) }; }),
    );
    return new NextResponse(file, { headers: { "content-type": "text/plain; charset=us-ascii", "content-disposition": `attachment; filename="wages-${y}${m}${d}.aba"`, "cache-control": "no-store" } });
  } catch (e) {
    return new NextResponse(e instanceof Error ? e.message : String(e), { status: 400 });
  }
}
