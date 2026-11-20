/**
 * Every row of a query. Supabase returns at most 1,000 rows per request whatever .limit() asks for, so lists
 * that can be longer (e.g. 1,600 clients) are read 1,000 at a time. Order the query by something unique last
 * (e.g. .order("name").order("id")) so pages don't overlap.
 */
export async function allPages<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, max = 50_000): Promise<{ data: T[]; error: { message: string } | null }> {
  const out: T[] = [];
  for (let from = 0; from < max; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) return { data: out, error };
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return { data: out, error: null };
}
