import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/integrations/runtime";
import { currentStudent, type Student } from "@/lib/bookings/student-auth";
import type { PublicOrg } from "@/lib/bookings/server";

/**
 * The Academy "god user": when the business owner is signed in to EventureOS, the Academy opens as their own test
 * student — everything unlocked, every level open, no daily AI limits, no payment. It's a separate test student
 * (never their real student record), hidden from the learner list and removed by Settings → Testing → Clear.
 */
export async function ownerTestStudent(org: Pick<PublicOrg, "id" | "name">): Promise<Student | null> {
  let userId: string | null = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
  } catch { return null; }
  if (!userId) return null;
  const db = createServiceClient();
  const { data: m } = await db.from("organisation_users").select("role").eq("organisation_id", org.id).eq("user_id", userId).eq("status", "active").maybeSingle();
  if (m?.role !== "owner") return null;
  const email = `academy-test-${userId.slice(0, 8)}@test.invalid`;
  const cols = "id, name, email, phone, marketing_ok, certificate_requested_at";
  let { data: st } = await db.from("booking_students").select(cols).eq("organisation_id", org.id).eq("email", email).maybeSingle();
  if (!st) {
    const { data, error } = await db.from("booking_students").insert({ organisation_id: org.id, name: "Test student (owner)", email, marketing_ok: false, source: "test", is_test: true }).select(cols).single();
    if (error) return null; // test mode's database update isn't in yet
    st = data;
    await db.from("learn_learners").upsert({ organisation_id: org.id, student_id: data.id, on_leaderboard: false, display_name: "Test student" }, { onConflict: "organisation_id,student_id" });
  }
  return { ...(st as Student), god: true };
}

/** Who's using the Academy: the owner (as their test student), else the signed-in student. */
export async function academyStudent(org: PublicOrg): Promise<Student | null> {
  return (await ownerTestStudent(org).catch(() => null)) ?? (await currentStudent(org).catch(() => null));
}
