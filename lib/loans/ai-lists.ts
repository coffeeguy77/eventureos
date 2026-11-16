/** A list from the model. It sometimes sends the array as a JSON string, a bulleted string, or objects — accept all of them. */
export function strs(v: unknown, n: number): string[] {
  let list: unknown = v;
  if (typeof list === "string") {
    const t = list.trim();
    try { list = JSON.parse(t); } catch { list = t.split(/\n+/).map((x) => x.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")); }
    if (typeof list === "string") list = [list];
  }
  if (!Array.isArray(list)) return [];
  return list
    .map((x) => (typeof x === "string" ? x : x && typeof x === "object" ? String(Object.values(x as Record<string, unknown>).find((y) => typeof y === "string") ?? "") : ""))
    .map((x) => x.trim()).filter(Boolean).map((x) => x.slice(0, 400)).slice(0, n);
}
