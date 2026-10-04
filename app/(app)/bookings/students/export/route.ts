import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/context";

export const dynamic = "force-dynamic";

const cell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  // Quote everything; stop spreadsheet formulas sneaking in from names typed on the website
  return `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
};

/** Students as a spreadsheet (e.g. for a newsletter — the "Emails OK" column says who agreed). */
export async function GET(req: Request) {
  const { supabase, org, role } = await requireOrg();
  if (role === "staff" || role === "customer") return new NextResponse("Not allowed", { status: 403 });
  const q = new URL(req.url).searchParams.get("q")?.trim().slice(0, 80);
  let query = supabase.from("booking_students").select("id, name, email, phone, marketing_ok, source, created_at").eq("organisation_id", org.id).order("name").limit(20000);
  if (q) { const like = `%${q.replace(/[%_,()]/g, " ")}%`; query = query.or(`name.ilike.${like},email.ilike.${like},phone.ilike.${like}`); }
  const { data, error } = await query;
  if (error) return new NextResponse(error.message, { status: 500 });
  const lines = [["Name", "Email", "Phone", "Emails OK", "First came from", "Added"].map(cell).join(",")];
  for (const s of data ?? []) lines.push([s.name, s.email, s.phone, s.marketing_ok ? "Yes" : "No", s.source, String(s.created_at).slice(0, 10)].map(cell).join(","));
  return new NextResponse("﻿" + lines.join("\r\n"), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="students-${new Date().toISOString().slice(0, 10)}.csv"`, "cache-control": "no-store" } });
}
