/** Shared (client + server) bits of the documents library. */
export const LIBRARY_CATEGORIES = ["Insurance certificate", "Food licence", "Artwork template", "Menu / price list", "Terms & conditions", "Other"] as const;

export interface LibraryDoc {
  id: string; name: string; category: string | null; description: string | null; expires_on: string | null; public_share: boolean;
  mime_type: string | null; size_bytes: number | null; storage_path: string | null; created_at: string;
}

export function groupByCategory(docs: LibraryDoc[]) {
  const out = new Map<string, LibraryDoc[]>();
  for (const d of docs) { const k = d.category || "Other"; out.set(k, [...(out.get(k) ?? []), d]); }
  return [...out.entries()].sort((a, b) => {
    const ia = LIBRARY_CATEGORIES.indexOf(a[0] as (typeof LIBRARY_CATEGORIES)[number]), ib = LIBRARY_CATEGORIES.indexOf(b[0] as (typeof LIBRARY_CATEGORIES)[number]);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
}

export const fileSize = (n: number | null) => !n ? "" : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
