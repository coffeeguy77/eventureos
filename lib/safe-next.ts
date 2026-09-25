/** Only same-site paths like "/events/123" — never "//evil.com", "/\evil.com" or anything with control characters. */
export function safeNext(next: unknown, fallback = "/dashboard") {
  const n = typeof next === "string" ? next.trim() : "";
  if (!n.startsWith("/") || n.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(n)) return fallback;
  try {
    const base = "https://eventureos.invalid";
    const u = new URL(n, base);
    if (u.origin !== base) return fallback;
    return u.pathname + u.search + u.hash;
  } catch {
    return fallback;
  }
}
