import { NextResponse } from "next/server";
import { todayISO } from "@/lib/format";
import { serveLibraryDoc } from "@/lib/documents/serve";
import { publicLibraryOrg } from "@/components/portal/doc-list";

/** Download from the no-login share page (documents marked "public" only). */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; token: string; id: string }> }) {
  const { slug, token, id } = await params;
  const org = await publicLibraryOrg(slug, token);
  if (!org) return new NextResponse("This link has expired — ask for a new one.", { status: 404 });
  return serveLibraryDoc(org.id, id, todayISO(org.timezone), { publicOnly: true });
}
