import { todayISO } from "@/lib/format";
import { serveLibraryDoc } from "@/lib/documents/serve";
import { requirePortal } from "../../portal-data";

/** A signed-in customer downloads one of the business's documents (insurance, licence, artwork template…). */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const { org } = await requirePortal(slug);
  return serveLibraryDoc(org.id, id, todayISO(org.timezone));
}
