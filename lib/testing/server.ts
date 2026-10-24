import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

type TestTable = "bookings" | "booking_gifts" | "booking_students" | "shop_orders" | "shop_gift_cards" | "shop_customers";

/** Which of these rows are tests. Never throws (an empty set if the test-mode database update isn't in yet). */
export async function testIds(db: SupabaseClient, table: TestTable, ids: (string | null | undefined)[]): Promise<Set<string>> {
  const list = [...new Set(ids.filter((x): x is string => !!x))];
  if (!list.length) return new Set();
  const { data, error } = await db.from(table).select("id").in("id", list).eq("is_test", true);
  if (error || !data) return new Set();
  return new Set(data.map((r) => r.id as string));
}

export async function isTest(db: SupabaseClient, table: TestTable, id: string | null | undefined) {
  return !!id && (await testIds(db, table, [id])).has(id);
}

/** Mark a row as a test (it then never counts, and Settings → Testing clears it). */
export async function markTest(db: SupabaseClient, table: TestTable, id: string) {
  const { error } = await db.from(table).update({ is_test: true }).eq("id", id);
  if (error) throw new Error(`Test mode needs its database update first (${error.message}).`);
}
